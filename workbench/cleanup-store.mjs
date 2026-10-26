// 用途：生成并复核历史派生 MP4 的逐文件清理计划，保留当前生产依赖。
// 运行：由工作台调用 createCleanupStore(libraries, auditRoot)，先 preview 再 apply。
// 依赖：Node.js 内置文件、路径与摘要模块；不调用旧清理器。
import { lstat, realpath, readdir, readFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { safeFile, fingerprint } from './media.mjs';
import { readRetainedMedia, resolveRetainedMedia, recordRetainedMedia } from '../build/common/retained_media.mjs';
import { reviewedCleanupPath, parseReviewedCleanup, reviewedArtifactReason, currentRecordValues, currentRecordSeeds } from './cleanup-reviewed.mjs';

const slash = value => value.replaceAll('\\', '/');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const within = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)); };
const textExtensions = new Set(['.json', '.html', '.htm', '.mjs', '.js', '.cjs', '.ts', '.css', '.py', '.sh', '.txt', '.md', '.csv', '.m3u8']);
const codeExtensions = new Set(['.mjs', '.js', '.cjs', '.ts', '.py', '.sh']);
const referenceExtension = /\.(?:mp4|mov|wav|mp3|m4a|ogg|png|jpe?g|webp|svg|gif|json|html?|mjs|cjs|js|ts|py|sh|css|md|txt|csv|m3u8|woff2?|ttf|otf)$/i;
const stateOf = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs, stat.nlink].join(':');
const fileKey = absolute => process.platform === 'win32' ? path.resolve(absolute).toLowerCase() : path.resolve(absolute);
const queues = new Map();
const bulkAuditThreshold = 100;

// 只拆路径调用的参数；括号、引号和多行均保留，函数参数交给调用方视为未知值。
function* pathCalls(text) {
  for (const match of text.matchAll(/(?<![\w.])(?:(?:os\.)?path\.)?(join|resolve)\s*\(/g)) {
    const stack = ['('], args = [];
    let quote = '', escaped = false, closed = false, start = match.index + match[0].length, end = start;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (quote) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === quote) quote = ''; continue; }
      if ('"\'`'.includes(ch)) { quote = ch; continue; }
      if ('([{'.includes(ch)) stack.push(ch);
      else if (')]}'.includes(ch)) {
        if ('([{'.indexOf(stack.pop()) !== ')]}'.indexOf(ch)) break;
        if (!stack.length) { args.push(text.slice(start, end).trim()); closed = true; break; }
      } else if (ch === ',' && stack.length === 1) { args.push(text.slice(start, end).trim()); start = end + 1; }
    }
    yield { index: match.index, args: closed ? args : null, expression: text.slice(match.index, end + 1) };
  }
}

// 每一层都核验，既拒绝越界链接，也拒绝指回库内的链接和 junction。
async function checked(root, target) {
  if (!within(root, target)) throw fail('文件路径超出所属视频库', 403);
  const rel = path.relative(root, target), parts = rel ? rel.split(path.sep) : [];
  let current = root, stat;
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) current = path.join(current, parts[i]);
    try { stat = await lstat(current); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (stat.isSymbolicLink()) throw fail('不允许进入链接或 junction：' + slash(path.relative(root, current)), 403);
    if (i < parts.length - 1 && !stat.isDirectory()) throw fail('路径的父级不是目录');
  }
  const actual = await realpath(target);
  if (!within(await realpath(root), actual)) throw fail('真实文件路径超出所属视频库', 403);
  return stat;
}

export function createCleanupStore(libraries, auditRoot) {
  if (!libraries?.current || Object.keys(libraries).some(key => !['current', 'legacy'].includes(key))) throw fail('必须提供 current 视频库，且只支持 current/legacy', 400);
  for (const key of Object.keys(libraries)) if (!path.isAbsolute(libraries[key] || '')) throw fail('视频库必须是绝对根目录', 400);
  if (!path.isAbsolute(auditRoot || '')) throw fail('审计目录必须是绝对路径', 400);
  const roots = Object.fromEntries(Object.keys(libraries).sort().map(key => [key, path.resolve(libraries[key])]));
  if (roots.current === roots.legacy) throw fail('两个视频库不能使用同一目录', 400);
  const auditBase = path.resolve(auditRoot);
  function libraryRoot(library) { if (!Object.hasOwn(roots, library)) throw fail('未知视频库', 400); return roots[library]; }
  function owner(absolute) { return Object.entries(roots).filter(([, root]) => within(root, absolute)).sort((a, b) => b[1].length - a[1].length)[0]?.[0]; }
  function relative(library, absolute) { return slash(path.relative(roots[library], absolute)); }
  async function auditDirectory() {
    if (!within(roots.current, auditBase)) throw fail('清理审计目录必须在内层库中', 403);
    await checked(roots.current, auditBase);
    await mkdir(auditBase, { recursive: true });
    await checked(roots.current, auditBase);
  }
  async function save(name, data, exclusive = false) {
    await auditDirectory();
    const target = path.join(auditBase, name);
    await checked(roots.current, target);
    const temp = exclusive ? target : target + '.' + randomUUID() + '.tmp';
    const handle = await open(temp, 'wx');
    try { await handle.writeFile(JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8' }); await handle.sync(); }
    finally { await handle.close(); }
    if (!exclusive) await rename(temp, target);
    return target;
  }
  async function load(name) {
    const target = path.join(auditBase, name);
    await checked(roots.current, target);
    try { return JSON.parse(await readFile(target, { encoding: 'utf8' })); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }

  async function scan(library, episodes) {
    libraryRoot(library);
    if (!Array.isArray(episodes) || !episodes.length || episodes.some(ep => !Number.isInteger(ep) || ep < 1)) throw fail('请选择有效期次数组', 400);
    episodes = [...new Set(episodes)].sort((a, b) => a - b);
    const warnings = [], blocks = new Map(), evidence = new Map(), protectedFiles = new Map(), essentialReferences = new Set(), archivedMasters = new Set(), queue = [], visited = new Set(), ledgers = {}, indices = new Map(), retained = new Map(), reviewed = new Map(), generatedOutputs = new Set(), registeredKeys = new Set(), assetMappings = new Map(), mappedIndices = new Set(), fingerprints = new Map();
    const note = message => { if (!warnings.includes(message)) warnings.push(message); };
    const block = (lib, ep, message) => { const key = lib + ':' + (ep || '*'); const list = blocks.get(key) || []; if (!list.includes(message)) list.push(message); blocks.set(key, list); note(message); };
    const scopedEp = (lib, value) => {
      value = slash(value).toLowerCase();
      for (const e of ledgers[lib]?.episodes || []) if (value.includes('ep' + String(e.ep).padStart(2, '0') + '_' + e.slug.toLowerCase()) || value.includes(String(e.ep).padStart(2, '0') + '-' + e.slug.toLowerCase())) return e.ep;
      const match = /(?:^|[/_])(?:course_)?ep(\d+)(?:[_/]|$)/i.exec(value);
      return match && ledgers[lib]?.episodes.some(e => e.ep === Number(match[1])) ? Number(match[1]) : null;
    };
    const dynamicInput = (value, source) => {
      if (['historical', 'record', 'metadata'].includes(source.mode)) { note('记录动态路径未展开：' + relative(source.lib, source.absolute) + ' → ' + value.slice(0, 180)); return; }
      // 泛化 CLI 没有实例参数；只对明确的课程目录或期次约束判定动态输入风险。
      if (source.mode === 'auxiliary' && (!source.ep && !scopedEp(source.lib, value) && !/pipeline\/(?:build\/|output\/(?:course|teaching|vibe)\/)/i.test(value))) return;
      const prefix = slash(value).split(/\$\{|\$[a-z_]|[*]|%[ds]|\{/i)[0];
      const rooted = /^(?:course|pipeline|assets|materials|library|\.local)\//.test(prefix);
      const candidates = !prefix ? Object.values(roots) : path.isAbsolute(prefix) ? [prefix] : rooted ? [path.resolve(roots[source.lib], prefix)] : [path.resolve(roots[source.lib], prefix), path.resolve(path.dirname(source.absolute), prefix)];
      const targets = [...new Set(candidates.map(owner).filter(Boolean))];
      for (const lib of targets.length ? targets : Object.keys(roots)) block(lib, scopedEp(lib, value) || scopedEp(lib, source.absolute) || (lib === source.lib ? source.ep : null), '存在无法确定的动态 MP4 输入：' + source.lib + '/' + relative(source.lib, source.absolute) + ' → ' + value.slice(0, 180));
    };
    const protect = (absolute, reason) => { const key = fileKey(absolute), reasons = protectedFiles.get(key) || []; if (!reasons.includes(reason)) reasons.push(reason); protectedFiles.set(key, reasons); };
    const digest = async file => {
      const key = fileKey(file.absolute);
      if (!fingerprints.has(key)) fingerprints.set(key, fingerprint(file));
      return fingerprints.get(key);
    };
    const mapAssets = (index, lib, indexFile, signature) => {
      mappedIndices.add(fileKey(indexFile));
      for (const act of index?.acts || []) {
        const assets = (act.visual_assets || []).filter(value => typeof value === 'string');
        for (const source of [act.visual_source, ...assets].filter(value => typeof value === 'string')) {
          const key = fileKey(path.resolve(roots[lib], source)), entries = assetMappings.get(key) || [];
          for (const asset of assets) entries.push({ absolute: path.resolve(roots[lib], asset), indexFile, signature });
          assetMappings.set(key, entries);
        }
      }
    };
    const enqueue = (absolute, lib, ep, mode = 'source', strictMissing = false) => queue.push({ absolute, lib, ep, mode, strictMissing });
    async function readText(absolute, lib, ep) {
      try {
        const stat = await checked(roots[lib], absolute);
        if (!stat?.isFile()) throw fail('文件缺失或不是普通文件');
        if (stat.size > 8_000_000) throw fail('文本依赖超过静态检查上限');
        const text = await readFile(absolute, { encoding: 'utf8' });
        evidence.set(fileKey(absolute), stateOf(stat) + ':' + hash(text));
        return text;
      } catch (error) { block(lib, ep, '依赖无法核查：' + lib + '/' + relative(lib, absolute) + '（' + error.message + '）'); return null; }
    }
    async function walk(lib, absolute, visit, onLink = message => note(message)) {
      let stat;
      try { stat = await checked(roots[lib], absolute); }
      catch (error) { onLink('未进入链接或异常目录：' + lib + '/' + relative(lib, absolute) + '（' + error.message + '）'); return; }
      if (!stat) return;
      if (!stat.isDirectory()) { if (stat.isFile()) await visit(absolute, stat); return; }
      const entries = await readdir(absolute, { withFileTypes: true });
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(absolute, entry.name);
        if (owner(child) !== lib || fileKey(child) === fileKey(auditBase) || ['node_modules', '.git'].includes(entry.name)) continue;
        if (entry.isSymbolicLink()) { onLink('未进入链接：' + lib + '/' + relative(lib, child)); continue; }
        if (entry.isDirectory()) await walk(lib, child, visit, onLink);
        else if (entry.isFile()) await visit(child, await lstat(child));
      }
    }
    for (const lib of Object.keys(roots)) {
      await checked(roots[lib], roots[lib]);
      const absolute = path.join(roots[lib], 'course/episodes.json');
      const text = await readText(absolute, lib, null);
      visited.add(fileKey(absolute));
      try {
        const ledger = text === null ? null : JSON.parse(text);
        if (!Array.isArray(ledger?.episodes) || ledger.episodes.some(e => !Number.isInteger(e.ep) || e.ep < 1 || typeof e.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/i.test(e.slug)) || new Set(ledger.episodes.map(e => e.ep)).size !== ledger.episodes.length) throw fail('台账缺少唯一的 ep/slug 映射');
        ledgers[lib] = ledger;
      } catch (error) { block(lib, null, '视频库台账无法解读：' + lib + '（' + error.message + '）'); ledgers[lib] = { episodes: [] }; }
    }
    if (episodes.some(ep => !ledgers[library].episodes.some(e => e.ep === ep))) throw fail('台账中没有所选期次或台账无法读取', 400);
    for (const lib of Object.keys(roots)) {
      try {
        const absolute = path.join(roots[lib], '.local/video-workbench/retained-media.json');
        const stat = await checked(roots[lib], absolute);
        if (stat) evidence.set('archive:' + lib, stateOf(stat) + ':' + hash(await readFile(absolute, { encoding: 'utf8' })));
        const archive = readRetainedMedia(roots[lib]);
        retained.set(lib, archive);
        for (const entry of archive.copies) {
          const master = path.resolve(roots[lib], entry.master), masterStat = await checked(roots[lib], master);
          protect(master, '归档副本依赖的保留发布母版');
          archivedMasters.add(fileKey(master));
          evidence.set('archive-master:' + fileKey(master), stateOf(masterStat));
        }
      } catch (error) { block(lib, null, '成片归档记录无法核查：' + error.message); }
    }
    for (const lib of Object.keys(roots)) {
      for (const e of ledgers[lib].episodes) {
        const indexPath = e.production_index || 'course/episodes/' + String(e.ep).padStart(2, '0') + '-' + e.slug + '/制作索引.json';
        const absolute = path.resolve(roots[lib], indexPath);
        let index;
        const text = await readText(absolute, lib, e.ep);
        try { index = text === null ? null : JSON.parse(text); if (!index || Array.isArray(index) || typeof index !== 'object') throw fail('制作索引不是对象'); }
        catch (error) { block(lib, e.ep, '制作索引无法解读：' + lib + '/ep' + e.ep); }
        indices.set(lib + ':' + e.ep, index);
        if (index) { enqueue(absolute, lib, e.ep, 'production-index'); mapAssets(index, lib, absolute, evidence.get(fileKey(absolute))); }
        // 台账本身的明确路径也保留，但不扫描整段制作历史文字。
        for (const [key, value] of Object.entries(e)) if (!['notes', 'note', 'selection_note'].includes(key) && typeof value === 'string' && /\.[a-z0-9]{1,8}$/i.test(value) && /[/\\]/.test(value)) await reference(value, { absolute: path.join(roots[lib], 'course/episodes.json'), lib, ep: e.ep, field: key, mode: /previous|history|old_/i.test(key) ? 'historical' : 'index' });
      }
      const aux = async absolute => { if (codeExtensions.has(path.extname(absolute).toLowerCase()) && !/\.(?:test|spec)\.[^.]+$/i.test(absolute)) enqueue(absolute, lib, scopedEp(lib, absolute), 'auxiliary'); };
      for (const dir of ['build', 'scripts', 'tools']) await walk(lib, path.join(roots[lib], dir), aux, message => block(lib, null, message));
      for (const entry of await readdir(roots[lib], { withFileTypes: true })) if (entry.isFile()) await aux(path.join(roots[lib], entry.name));
      for (const dir of ['pipeline/library', 'assets', 'materials', 'library', 'course/assets', '.local/video-workbench']) {
        await walk(lib, path.join(roots[lib], dir), async absolute => {
          if (path.extname(absolute).toLowerCase() === '.json' && (dir !== '.local/video-workbench' || path.basename(absolute) === 'feedback.json')) enqueue(absolute, lib, scopedEp(lib, absolute), /^(?:published|backlog)\.json$/i.test(path.basename(absolute)) ? 'record-index' : 'index');
        }, message => block(lib, null, message));
      }
      const registration = path.join(roots[lib], reviewedCleanupPath);
      try {
        const stat = await checked(roots[lib], registration);
        evidence.set('reviewed:' + lib, stat ? stateOf(stat) : 'absent');
        const data = stat ? parseReviewedCleanup(await readText(registration, lib, null)) : { artifacts: new Map(), historical: new Map() };
        reviewed.set(lib, data);
        for (const item of data.outputConstants || []) {
          const source = path.resolve(roots[lib], item.source);
          try {
            const stat = await checked(roots[lib], source);
            if (!stat?.isFile()) throw new Error('工具源码缺失');
            const digest = hash(await readFile(source, { encoding: 'utf8' }));
            evidence.set('output-constant:' + fileKey(source), stateOf(stat) + ':' + digest);
            if (digest === item.sourceSha256) generatedOutputs.add(fileKey(source) + '#' + item.value);
            else note('工具源码已变化，输出常量例外未采用：' + item.source);
          } catch (error) { note('输出常量例外未采用：' + item.source + '（' + error.message + '）'); }
        }
        for (const item of data.artifacts.values()) {
          registeredKeys.add(fileKey(path.resolve(roots[lib], item.path)));
          const episode = ledgers[lib].episodes.find(episode => episode.ep === item.ep);
          const reason = !episode ? '登记期次不存在' : reviewedArtifactReason(item, episode, indices.get(lib + ':' + item.ep));
          if (reason) note('核验登记不放行：' + item.path + '（' + reason + '）');
        }
      } catch (error) { block(lib, null, '已核验清理登记无法读取：' + error.message); reviewed.set(lib, { artifacts: new Map(), historical: new Map() }); }
      // 期内素材目录的索引也是素材库根，未引用的历史制作索引不是。
      const episodeRoot = path.join(roots[lib], 'course/episodes');
      await walk(lib, episodeRoot, async absolute => {
        if (/^制作索引.*\.json$/.test(path.basename(absolute)) && !mappedIndices.has(fileKey(absolute))) {
          try {
            const text = await readFile(absolute, { encoding: 'utf8' }), stat = await checked(roots[lib], absolute);
            const index = JSON.parse(text);
            if (Array.isArray(index.acts)) mapAssets(index, lib, absolute, stateOf(stat) + ':' + hash(text));
          } catch (error) { note('旧资源映射未采用：' + relative(lib, absolute) + '（' + error.message + '）'); }
        }
        if (/[/\\](?:source-assets|assets|materials|library)[/\\]/i.test(absolute) && /(?:index|manifest|素材|索引|清单).*\.json$/i.test(path.basename(absolute))) enqueue(absolute, lib, scopedEp(lib, absolute), 'index');
      });
    }

    function protectDynamicArtifacts(value, source) {
      if (['historical', 'record', 'metadata'].includes(source.mode)) return;
      if (source.mode === 'auxiliary' && !source.ep && !scopedEp(source.lib, value) && !/course\/episodes\/|pipeline\/build\//.test(value)) return;
      const prefix = value.split(/\$\{|\$[a-z_]|[*]|%[ds]|\{/i)[0];
      for (const [lib, data] of reviewed) for (const item of data.artifacts.values()) {
        const absolute = path.resolve(roots[lib], item.path);
        const prefixes = [path.resolve(roots[source.lib], prefix), path.resolve(path.dirname(source.absolute), prefix)];
        if ((!prefix && (!source.ep || source.ep === item.ep)) || prefixes.some(candidate => fileKey(absolute).startsWith(fileKey(candidate)))) protect(absolute, '动态图片或字体输入涉及已登记产物：' + relative(source.lib, source.absolute));
      }
    }
    async function reference(value, source) {
      if (typeof value !== 'string') return;
      if (generatedOutputs.has(fileKey(source.absolute) + '#' + value)) return;
      const recordPosition = ['metadata', 'historical', 'record'].includes(source.mode) || /^\/acts\/\d+\/(?:previous_|withdrawn_)[^/]*$/.test(source.pointer || '');
      if (recordPosition && source.pointer && reviewed.get(source.lib)?.historical.get(relative(source.lib, source.absolute) + '#' + source.pointer) === value) return;
      value = slash(value.trim()).replace(/[?#].*$/, '');
      const developmentRecord = source.mode === 'production-index' && source.field === 'source_refs' && /\.(?:json|md|txt)$/i.test(value) && /提交前检查|检查结果|检查报告|审查报告|开发报告|开发计划|任务追踪|(?:^|[/_-])report(?:[/_.-]|$)/i.test(value);
      if (developmentRecord && /^specs\//i.test(value)) source = { ...source, mode: 'record' };
      if (/^(?:https?:|data:|mailto:|#)/i.test(value) || !referenceExtension.test(value) || /[\r\n]/.test(value)) return;
      // 历史和验收记录本身保留，记录里的视频路径不等同于实际生产输入。
      if (/\.mp4$/i.test(value) && (source.mode === 'historical' || (source.mode === 'record' && source.recordMedia === true))) return;
      // 数值、选择器、整段说明和整条命令不是路径；只提取其中明确的库内路径。
      if (/\s/.test(value.split('/')[0]) || (!value.includes('/') && /\s/.test(value)) || /^["'`]/.test(value)) {
        for (const match of value.matchAll(/(?:^|[\s"'`(])((?:\.{1,2}\/|pipeline\/|course\/|assets\/)[^\s"'`<>;)]+)/g)) if (referenceExtension.test(match[1])) await reference(match[1], source);
        return;
      }
      if (!value.includes('/') && value.startsWith('.')) return;
      if (/(?:\$\{|\$[a-z_]|[*]|%[ds]|\{[^}]+\})/i.test(value)) {
        if (/\.mp4$/i.test(value)) dynamicInput(value, source);
        else if (/\.(?:png|jpe?g|woff2?|ttf|otf)$/i.test(value)) protectDynamicArtifacts(value, source);
        return;
      }
      const rooted = /^(?:course|pipeline|assets|materials|library|\.local)\//.test(value);
      let candidates = path.isAbsolute(value) || /^[a-z]:\//i.test(value) ? [path.resolve(value)] : rooted ? [path.resolve(roots[source.lib], value), ...Object.entries(roots).filter(([lib]) => lib !== source.lib).map(([, root]) => path.resolve(root, value))] : [path.resolve(path.dirname(source.absolute), value), path.resolve(roots[source.lib], value)];
      // 根相对路径先归本库；仅在本库缺失时查迁移前的另一库。
      if (rooted) {
        try { if (await checked(roots[source.lib], candidates[0]) || retained.get(source.lib)?.copies.some(item => item.path === relative(source.lib, candidates[0]))) candidates = [candidates[0]]; }
        catch (error) { block(source.lib, source.ep, error.message); }
      }
      if (value.startsWith('assets/')) {
        candidates.push(path.resolve(path.dirname(source.absolute), value));
        for (const asset of assetMappings.get(fileKey(source.absolute)) || []) if (path.basename(asset.absolute).toLowerCase() === path.posix.basename(value).toLowerCase()) {
          candidates.push(asset.absolute); evidence.set('asset-map:' + fileKey(asset.indexFile), asset.signature);
        }
        const html = /^course\/acts\/(ep\d+)_[^/]+\/act(\d+)-(v\d+)\.html$/.exec(relative(source.lib, source.absolute));
        if (html) candidates.push(path.resolve(roots[source.lib], 'pipeline/build/course_' + html[1] + '_act' + html[2] + '_' + html[3] + '_review', value));
        const built = /^(pipeline\/build\/[^/]+)\/assets\//.exec(relative(source.lib, source.absolute));
        if (built) candidates.push(path.resolve(roots[source.lib], built[1], value));
      }
      // course_video 会将这三份共用模板文件及 visual_assets 复制到构建目录。
      if (/^(?:fonts\/NotoSansSC-(?:400|700)\.woff2|assets\/red-maple-leaf\.png)$/.test(value)) candidates.push(path.resolve(roots[source.lib], 'templates/course-explainer-3x4', value));
      if (value.startsWith('assets/')) for (const [key, index] of indices) {
        const lib = key.split(':')[0];
        for (const act of index?.acts || []) if (act.visual_source && fileKey(path.resolve(roots[lib], act.visual_source)) === fileKey(source.absolute)) for (const asset of act.visual_assets || []) if (typeof asset === 'string' && path.posix.basename(slash(asset)).toLowerCase() === path.posix.basename(value).toLowerCase()) candidates.push(path.resolve(roots[lib], asset));
      }
      if (developmentRecord && candidates.some(absolute => { const lib = owner(absolute); return lib && /^specs\//i.test(relative(lib, absolute)); })) source = { ...source, mode: 'record' };
      let found = false;
      for (const absolute of [...new Set(candidates)]) {
        const lib = owner(absolute);
        if (!lib) continue;
        let stat;
        try { stat = await checked(roots[lib], absolute); }
        catch (error) { block(source.lib, source.ep, '依赖路径含链接或越界：' + value); continue; }
        if (!stat) {
          if (retained.get(lib)?.copies.some(item => item.path === relative(lib, absolute))) {
            try {
              const resolved = resolveRetainedMedia(roots[lib], relative(lib, absolute));
              const masterStat = await checked(roots[lib], resolved.absolute);
              if (resolved.archived && masterStat?.isFile()) { found = true; protect(resolved.absolute, '已归档副本的保留发布母版'); evidence.set('file:' + fileKey(resolved.absolute), stateOf(masterStat)); }
            } catch (error) { block(source.lib, source.ep, error.message); }
          }
          continue;
        }
        found = true;
        evidence.set('file:' + fileKey(absolute), stateOf(stat));
        protect(absolute, '当前索引、素材或源码引用：' + source.lib + '/' + relative(source.lib, source.absolute));
        const ownIndex = indices.get(lib + ':' + source.ep);
        const recordReference = ['historical', 'record', 'metadata'].includes(source.mode);
        const ownPreview = source.mode === 'index' && source.field === 'active_preview' && fileKey(source.absolute) === fileKey(path.join(roots[lib], 'course/episodes.json'));
        const ownReview = ((source.mode === 'production-index' && ['review_output', 'active_preview'].includes(source.field)) || ownPreview) && ownIndex && fileKey(absolute) === fileKey(path.resolve(roots[lib], ownIndex.review_output || '.'));
        if (source.lib !== lib || source.ep !== scopedEp(lib, absolute) || (!recordReference && !ownReview)) essentialReferences.add(fileKey(absolute));
        if (stat.isDirectory()) {
          await walk(lib, absolute, async (child, childStat) => { protect(child, '当前依赖目录：' + value); if (textExtensions.has(path.extname(child).toLowerCase())) enqueue(child, lib, source.ep); }, message => block(source.lib, source.ep, message));
        } else if (!['historical', 'record', 'metadata'].includes(source.mode) && (source.mode !== 'auxiliary' || path.extname(absolute).toLowerCase() === '.json' || codeExtensions.has(path.extname(absolute).toLowerCase())) && textExtensions.has(path.extname(absolute).toLowerCase())) {
          const tool = (source.mode === 'auxiliary' || (source.field === 'source_refs' && /^(?:build|tools)\//.test(relative(lib, absolute)))) && codeExtensions.has(path.extname(absolute).toLowerCase());
          enqueue(absolute, lib, lib === source.lib ? source.ep : scopedEp(lib, absolute), tool ? 'auxiliary' : 'source', tool && (source.strictMissing || source.field === 'source_refs'));
        }
      }
      // 辅助代码只处理明确输入，依赖闭包中的缺失文件不能忽略。
      if (!found && (source.mode !== 'auxiliary' || source.strictMissing)) {
        const message = '依赖文件缺失或超出两库：' + value + '（来源 ' + relative(source.lib, source.absolute) + '）';
        const unrelatedVideo = /\.mp4$/i.test(value) && /^(?:pipeline\/output\/)(?!(?:course|teaching|vibe)\/)/i.test(value);
        if (['historical', 'record', 'metadata', 'documentation'].includes(source.mode) || unrelatedVideo) note('记录' + message); else block(source.lib, source.ep, message);
      }
    }
    while (queue.length) {
      const source = queue.shift();
      if (source.mode === 'source' && /^course\/episodes\/\d{2}-[^/]+\/(?:.*\/)?制作索引\.json$/i.test(relative(source.lib, source.absolute))) source.mode = 'production-index';
      const visitKey = fileKey(source.absolute) + ':' + source.mode + ':' + (source.ep || '*') + ':' + Boolean(source.strictMissing);
      if (visited.has(fileKey(source.absolute)) || visited.has(visitKey)) continue;
      visited.add(visitKey);
      const text = await readText(source.absolute, source.lib, source.ep);
      if (text === null) continue;
      protect(source.absolute, '当前生产依赖或辅助脚本');
      if (path.extname(source.absolute).toLowerCase() === '.json') {
        try {
          const data = JSON.parse(text);
          const productionKeys = /^(?:acts|script|formal_script|visual_plan|visual_source|visual_assets|visual_timing|audio|timings|sfx|timeline_summary|publish_output|review_output|active_preview|current|source_refs|source_materials|opening_strategy|cover_output|cover_upload_output|voiceover_preview|version_index|source|input|config|assets|video)$/i;
          // 记录上下文保持为事实；实际素材数据中的同名集合仍按输入处理。
          const strings = function* (value, mode = source.mode === 'record-index' ? 'record' : source.mode, depth = 0, field = '', inputData = !['production-index', 'record-index'].includes(source.mode), pointer = '') {
            if (typeof value === 'string') yield { value, mode, field, recordMedia: !inputData, pointer };
            else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
              const actual = inputData || (!['record', 'historical', 'metadata'].includes(mode) && /^(?:source_materials|visual_assets|source|input|config|assets|video|audio|script|formal_script|current)$/i.test(key));
              const historical = mode === 'historical' || (!actual && source.mode === 'production-index' && depth === 0 && /history|historical|previous|old_|archive|snapshot/i.test(key));
              const record = mode === 'record' || /^(?:name|label|title|description|note|notes|text|command|usage|prompt|example)$/i.test(key) || ((!actual || /^(?:execution_record|qc_report|check_report|technical_status)$/i.test(key)) && /check|approval|report|technical|execution|record|qc|验收|记录/i.test(key));
              const metadata = mode === 'metadata' || (source.mode === 'production-index' && depth === 0 && !productionKeys.test(key));
              yield* strings(child, historical ? 'historical' : record ? 'record' : metadata ? 'metadata' : mode, depth + 1, depth === 0 ? key : field, actual, pointer + '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'));
            }
          };
          for (const { value, mode, field, recordMedia, pointer } of strings(data)) await reference(value, { ...source, mode, field, recordMedia, pointer });
        } catch (error) { block(source.lib, source.ep, 'JSON依赖无法解读：' + relative(source.lib, source.absolute) + '（' + error.message + '）'); }
      } else if (path.extname(source.absolute).toLowerCase() === '.md') {
        // 只跟随正文中的显式媒体链接；代码块、行内代码和引号示例不作生产依赖。
        let fence = null;
        for (const line of text.split('\n')) {
          const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
          if (marker) {
            if (!fence) fence = marker[1];
            else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
            continue;
          }
          if (fence) continue;
          const prose = line.replace(/`+[^`]*`+/g, '');
          for (const match of prose.matchAll(/\]\(<?([^\n()<>]+\.mp4(?:[?#][^\n()<>]*)?)>?\)/gi)) await reference(match[1], { ...source, mode: 'documentation' });
          for (const match of prose.matchAll(/<(?:video|source)\b[^>]*\bsrc\s*=\s*["']([^"']+\.mp4(?:[?#][^"']*)?)["']/gi)) await reference(match[1], { ...source, mode: 'documentation' });
        }
      } else if (['.txt', '.csv'].includes(path.extname(source.absolute).toLowerCase())) {
        // 正式清单保留原有的显式视频值识别，不能按说明文档忽略。
        for (const match of text.matchAll(/(?:\]\(|["'`])([^\n"'`()]+\.mp4)(?:\)|["'`])/gi)) await reference(match[1], source);
      } else {
        // 未知参数以通配占位，保留明确的目录约束；不执行辅助代码求值。
        for (const call of pathCalls(text)) {
          const context = text.slice(Math.max(0, call.index - 100), call.index);
          if (/\b(?:\w*(?:output|dest|target|silent|final|render)\w*|out)\s*[:=]/i.test(context.slice(context.lastIndexOf(';') + 1))) continue;
          if (!call.args) { if (/\.mp4/i.test(call.expression)) dynamicInput(call.expression, source); continue; }
          const args = call.args;
          const literal = value => /^(["'`])([\s\S]*)\1$/.exec(value)?.[2];
          const first = args.shift(), knownRoot = /^(?:root|rootDir|projectRoot|__dirname)$/.test(first);
          const pieces = args.map(value => literal(value) ?? '*');
          if (knownRoot && !pieces.includes('*')) await reference(path.resolve(first === '__dirname' ? path.dirname(source.absolute) : roots[source.lib], ...pieces), source);
          else if (literal(first) !== undefined && !pieces.includes('*')) await reference([literal(first), ...pieces].join('/'), source);
          else {
            const pattern = (knownRoot ? '' : (literal(first) ?? '*') + '/') + pieces.join('/');
            if (/\.(?:png|jpe?g|woff2?|ttf|otf)/i.test(call.expression)) protectDynamicArtifacts(pattern, source);
            if (/\.mp4$/i.test(pattern)) dynamicInput(pattern, source);
            else if (/(?:source|input|src|readFile|-i)/i.test(context) && /["'`][^"'`\r\n]*\.mp4["'`]/i.test(text)) {
              // 目录、文件名拆成变量时不猜值；只封闭文件内明确提到的期次目录。
              let scoped = false;
              for (const match of text.matchAll(/["'`]((?:pipeline\/output\/(?:course|teaching|vibe)\/ep\d+_[a-z0-9-]+)(?:\/[^"'`\r\n]*)?)["'`]/gi)) {
                const directory = /\.mp4$/i.test(match[1]) ? path.posix.dirname(match[1]) : match[1];
                dynamicInput(directory.replace(/\/$/, '') + '/*.mp4', source); scoped = true;
              }
              if (!scoped) {
                const numbers = [...text.matchAll(/["'`]ep(\d+)_[a-z0-9-]+["'`]/gi)].map(match => Number(match[1]));
                if (numbers.length) for (const ep of new Set(numbers)) block(source.lib, ledgers[source.lib].episodes.some(e => e.ep === ep) ? ep : null, '存在目录与文件名分离的未知MP4输入：' + relative(source.lib, source.absolute));
                else if (!(source.mode === 'auxiliary' && !source.ep && /\bprocess\.argv\b/.test(text))) {
                  const directories = [...text.matchAll(/["'`](pipeline\/output\/(?:course|teaching|vibe))\/?["'`]/gi)];
                  for (const match of directories) dynamicInput(match[1] + '/*.mp4', source);
                  if (!directories.length) block(source.lib, source.ep, '未知MP4输入无法确定期次范围：' + relative(source.lib, source.absolute));
                }
              }
            }
          }
        }
        for (const match of text.matchAll(/(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
          const value = match[2], context = text.slice(Math.max(0, match.index - 100), match.index);
          const explicitInput = /(?:source|input|config|asset|video|src|href|readFile|require|import|-i)[\w\s.=[(,:-]*$/i.test(context) || /\bfrom\s*$/i.test(context);
          const statement = context.slice(context.lastIndexOf(';') + 1);
          const explicitOutput = /\b(?:\w*(?:output|dest|target|silent|final|render)\w*|out)\s*[:=]/i.test(statement) || /\b(?:outputDir|outDir|destinationDir)\s*,\s*$/i.test(context);
          const registeredLiteral = /\.(?:png|jpe?g|woff2?|ttf|otf)$/i.test(value) && [path.resolve(path.dirname(source.absolute), slash(value)), ...Object.values(roots).map(root => path.resolve(root, slash(value)))].some(candidate => registeredKeys.has(fileKey(candidate)));
          if (source.mode === 'auxiliary' && !explicitInput && !registeredLiteral) {
            if (!/\.mp4$/i.test(value) || !/[/\\]/.test(value) || explicitOutput) continue;
          }
          await reference(value, source);
        }
        for (const line of text.split('\n')) {
          if (/\.mp4/i.test(line) && /(?:["'`]\s*\+|\+\s*["'`])/.test(line) && /(?:source|input|src|readFile|-i)/i.test(line)) dynamicInput(line, source);
          if (/\.mp4/i.test(line) && /\b(?:Path|PurePath)\s*\([^)]*\)\s*\//.test(line) && /(?:source|input|src|assets?|clips|files)/i.test(line)) dynamicInput(line, source);
          for (const match of line.matchAll(/(?:^|\s)((?:\.{1,2}\/|pipeline\/|course\/|assets\/)[^\s"'`<>]+\.mp4)(?=\s|$)/gi)) await reference(match[1], source);
        }
      }
    }
    // 人工登记的旧图片仍需排除当前验收记录；保留记录正文，不重新追溯其中的旧视频。
    const checkedRecords = new Set();
    async function protectRecordImages(value, lib, ep, base, depth = 0, scopeLib = lib) {
      if (depth > 12) { block(scopeLib, ep, '当前验收记录闭包过深，不能核查旧图片'); return; }
      for (const valueText of currentRecordValues(value)) {
        if (valueText.length > 500 || /[\r\n]/.test(valueText) || /^(?:https?:|data:)/.test(valueText)) continue;
        const name = slash(valueText).replace(/[?#].*$/, '');
        if (!/\.(?:json|png|jpe?g)$/i.test(name)) continue;
        for (const absolute of new Set([path.resolve(roots[lib], name), path.resolve(base, name)])) {
          const targetLib = owner(absolute);
          if (!targetLib) continue;
          try {
            const stat = await checked(roots[targetLib], absolute);
            if (!stat?.isFile()) continue;
            if (/\.(?:png|jpe?g)$/i.test(name)) { protect(absolute, '当前验收记录引用的图片'); continue; }
            if (checkedRecords.has(fileKey(absolute))) continue;
            checkedRecords.add(fileKey(absolute));
            const text = await readText(absolute, targetLib, ep);
            if (text !== null) await protectRecordImages(JSON.parse(text), targetLib, ep, path.dirname(absolute), depth + 1, scopeLib);
            else block(scopeLib, ep, '当前验收图片记录无法读取：' + absolute);
          } catch (error) { block(scopeLib, ep, '当前验收图片无法核查：' + error.message); }
        }
      }
    }
    if ([...reviewed.values()].some(data => data.artifacts.size)) for (const lib of Object.keys(roots)) {
      for (const entry of ledgers[lib].episodes) {
        const ep = entry.ep, index = indices.get(lib + ':' + ep);
        const base = path.dirname(path.resolve(roots[lib], entry.production_index || 'course/episodes/' + String(ep).padStart(2, '0') + '-' + entry.slug + '/制作索引.json'));
        for (const seed of currentRecordSeeds(index)) await protectRecordImages(seed, lib, ep, base);
      }
    }
    // 无法读取另一个视频库时，不能证明它未引用当前库。
    for (const lib of Object.keys(roots)) if (blocks.has(lib + ':*')) for (const target of Object.keys(roots)) block(target, null, '跨库依赖核查不完整：' + lib);

    const items = [], identities = {}, masters = [];
    for (const ep of episodes) {
      const e = ledgers[library].episodes.find(value => value.ep === ep), index = indices.get(library + ':' + ep);
      if (e.publish_status !== '已发布') block(library, ep, '本期未登记为已发布：ep' + ep);
      if (!index?.publish_output || !e.output || slash(index.publish_output) !== slash(e.output)) block(library, ep, '台账与制作索引发布路径缺失或冲突：ep' + ep);
      else {
        try { const stat = await checked(roots[library], path.resolve(roots[library], e.output)); if (!stat?.isFile()) throw fail('发布原片缺失'); }
        catch (error) { block(library, ep, '发布原片无法确认：ep' + ep + '（' + error.message + '）'); }
      }
      let master;
      if (index?.publish_output && e.output && slash(index.publish_output) === slash(e.output)) {
        try {
          const stat = await checked(roots[library], path.resolve(roots[library], e.output));
          if (stat?.isFile()) {
            master = { ep, path: slash(e.output), bytes: stat.size, sha256: await fingerprint(await safeFile(roots[library], e.output)) };
            masters.push(master);
          }
        } catch (error) { block(library, ep, '发布母版无法核查：' + error.message); }
      }
      const collected = new Set();
      const collect = async (absolute, stat, build = false) => {
        if (collected.has(fileKey(absolute))) return;
        collected.add(fileKey(absolute));
        const rel = relative(library, absolute), mp4 = /\.mp4$/i.test(rel), blocked = [...(blocks.get(library + ':*') || []), ...(blocks.get(library + ':' + ep) || [])];
        const artifact = reviewed.get(library)?.artifacts.get(rel);
        const reasons = [...(protectedFiles.get(fileKey(absolute)) || [])].slice(0, 3);
        if (artifact) { const reason = reviewedArtifactReason(artifact, e, index); if (reason) reasons.push(reason); }
        reasons.push(...blocked.slice(0, 5));
        if (blocked.length > 5) reasons.push('另有' + (blocked.length - 5) + '项依赖核查问题，详见预览警告');
        if (!mp4 && !artifact) reasons.push('仅统计，未登记的非MP4文件、源码、音频、素材和记录继续保留');
        if (mp4 && /\/(?:assets|source-assets|materials|inputs|素材)\//i.test(rel)) reasons.push('素材目录中的MP4不是可清理派生文件');
        if (mp4 && build && !/^(?:act\d+_(?:silent|final)_(?:standard|high)|render|raw|preview|before|after|output|course_ep\d+_[a-z0-9_-]+_publish_silent)\.mp4$/i.test(path.basename(absolute))) reasons.push('构建MP4未确认属于派生输出，保留待核查');
        if (stat.nlink > 1) reasons.push('文件存在硬链接，禁止清理');
        let artifactAllowed = false;
        if (artifact && !reasons.length) {
          try {
            if (await digest(await safeFile(roots[library], rel)) !== artifact.sha256) reasons.push('核验后文件内容已变化，保留并重新核验');
            else if (artifact.kind === 'font') {
              const sourceStat = await checked(roots[library], path.resolve(roots[library], artifact.source)), source = await safeFile(roots[library], artifact.source);
              const sourceHash = await digest(source);
              protect(source.absolute, '已核验字体副本的保留源字体');
              evidence.set('file:' + fileKey(source.absolute), stateOf(sourceStat) + ':' + sourceHash);
              if (sourceHash !== artifact.sha256) reasons.push('保留源字体与核验副本不一致，禁止清理');
              else artifactAllowed = true;
            } else artifactAllowed = true;
          } catch (error) { reasons.push('已核验产物复查失败：' + error.message); }
        }
        const id = hash(library + '\n' + rel).slice(0, 24);
        const duplicate = master && rel === slash(index.review_output || '') && rel !== master.path && stat.size === master.bytes && await fingerprint(await safeFile(roots[library], rel)) === master.sha256;
        const archiveAllowed = duplicate && !build && !blocked.length && stat.nlink === 1 && !essentialReferences.has(fileKey(absolute)) && !archivedMasters.has(fileKey(absolute)) && !/\/(?:assets|source-assets|materials|inputs|素材)\//i.test(rel);
        items.push({ id, ep, path: rel, bytes: stat.size, category: artifact ? (artifact.kind === 'image' ? '旧检查图片' : '重复字体副本') : duplicate ? '与发布母版相同的整片副本' : build ? (mp4 ? '构建视频' : '构建其他') : mp4 ? (/review|审片|preview|预览/i.test(rel) ? '旧审片' : '旧导出') : '输出其他', kind: artifact ? artifact.kind : duplicate ? 'duplicate' : 'historical', ...(duplicate ? { master } : {}), ...(artifact?.kind === 'font' ? { source: artifact.source } : {}), allowed: artifactAllowed || archiveAllowed || (mp4 && reasons.length === 0), reasons: artifactAllowed ? [artifact.kind === 'image' ? '已人工核验的旧幕检查图片；摘要一致且当前输入及验收未引用，JSON记录保留' : '已人工核验的旧构建字体；与保留源字体SHA-256相同'] : archiveAllowed ? ['与保留发布母版SHA-256相同；保留恢复记录，不改确认事实'] : reasons });
        identities[id] = stateOf(stat);
      };
      for (const lane of ['course', 'teaching', 'vibe']) await walk(library, path.join(roots[library], 'pipeline/output', lane, 'ep' + String(ep).padStart(2, '0') + '_' + e.slug), (absolute, stat) => collect(absolute, stat));
      for (const artifact of reviewed.get(library)?.artifacts.values() || []) if (artifact.ep === ep && artifact.path.startsWith('course/episodes/')) {
        try {
          const absolute = path.resolve(roots[library], artifact.path), stat = await checked(roots[library], absolute);
          if (stat?.isFile()) await collect(absolute, stat);
        } catch (error) { note('登记产物未进入：' + artifact.path + '（' + error.message + '）'); }
      }
      const buildRoot = path.join(roots[library], 'pipeline/build');
      const buildStat = await checked(roots[library], buildRoot);
      if (buildStat?.isDirectory()) {
        for (const child of await readdir(buildRoot, { withFileTypes: true })) {
          const full = /^course_ep(\d+)_[a-z0-9_-]+_publish_silent\.mp4$/i.exec(child.name);
          if (full && Number(full[1]) === ep && child.isFile()) { const absolute = path.join(buildRoot, child.name); await collect(absolute, await checked(roots[library], absolute), true); continue; }
          // 只认台账 ep 对应的既有课程构建命名，不按任意 ep 子串跨目录。
          const match = /^(?:course_|teaching_|vibe_)ep(\d+)_act\d+(?:_|$)/i.exec(child.name);
          if (!match || Number(match[1]) !== ep || !child.isDirectory()) continue;
          await walk(library, path.join(buildRoot, child.name), (absolute, stat) => collect(absolute, stat, true));
        }
      }
    }
    items.sort((a, b) => a.ep - b.ep || a.path.localeCompare(b.path));
    const summary = { totalBytes: 0, eligibleBytes: 0, protectedBytes: 0, fileCount: items.length, eligibleCount: 0 };
    for (const item of items) { summary.totalBytes += item.bytes; summary[item.allowed ? 'eligibleBytes' : 'protectedBytes'] += item.bytes; if (item.allowed) summary.eligibleCount++; }
    warnings.sort();
    const signature = hash(JSON.stringify({ roots, items, identities, masters, warnings, evidence: [...evidence].sort((a, b) => a[0].localeCompare(b[0])) }));
    return { library, episodes, items, masters, summary, warnings, signature, identities };
  }

  async function preview(library, episodes) {
    const state = await scan(library, episodes);
    const plan = { id: randomUUID(), library: state.library, episodes: state.episodes, items: state.items, masters: state.masters, summary: state.summary, warnings: state.warnings, createdAt: new Date().toISOString() };
    await save(plan.id + '.plan.json', { schema: 1, roots, plan, signature: state.signature, identities: state.identities }, true);
    return plan;
  }
  async function execute(library, input) {
    libraryRoot(library);
    if (!input || Object.keys(input).some(key => !['planId', 'fileIds', 'confirmation'].includes(key))) throw fail('清理仅接受计划ID和文件ID，不能传入路径或其他参数', 400);
    const { planId, fileIds, confirmation } = input;
    if (confirmation !== '清理历史版本') throw fail('请输入“清理历史版本”确认', 400);
    if (typeof planId !== 'string' || !/^[a-f0-9-]{36}$/.test(planId)) throw fail('清理计划ID无效', 400);
    if (!Array.isArray(fileIds) || !fileIds.length || fileIds.some(id => typeof id !== 'string') || new Set(fileIds).size !== fileIds.length) throw fail('请选择不重复的计划文件ID', 400);
    const saved = await load(planId + '.plan.json');
    if (!saved || saved.schema !== 1 || saved.plan.id !== planId || JSON.stringify(saved.roots) !== JSON.stringify(roots)) throw fail('清理计划不存在或视频库根目录已变化，请重新预览');
    const plan = saved.plan;
    if (plan.library !== library) throw fail('清理计划与视频库不匹配');
    const selected = fileIds.map(id => plan.items.find(item => item.id === id));
    if (selected.some(item => !item || !item.allowed)) throw fail('所选文件不属于计划或受到保护，禁止清理', 400);
    const selection = [...fileIds].sort(), auditName = planId + '.audit.json';
    const previous = await load(auditName);
    if (previous) {
      if (previous.status === 'completed' && JSON.stringify(previous.selection) === JSON.stringify(selection)) return previous.result;
      throw fail('该计划已执行或存在未完成审计，请检查审计并重新预览');
    }
    const current = await scan(library, plan.episodes);
    if (current.signature !== saved.signature) throw fail('文件身份、发布状态或依赖已变化，请重新预览');
    const root = libraryRoot(library);
    for (const item of selected) {
      const stat = await checked(root, path.resolve(root, item.path));
      if (!stat?.isFile() || stateOf(stat) !== saved.identities[item.id]) throw fail('文件身份已变化，请重新预览');
    }
    const audit = { schema: 1, planId, library, episodes: plan.episodes, selection, status: 'started', startedAt: new Date().toISOString(), files: selected.map(item => ({ id: item.id, path: item.path, bytes: item.bytes, ...(item.kind === 'duplicate' ? { master: item.master } : {}), status: 'pending' })) };
    if (selected.length > bulkAuditThreshold) audit.journalPath = path.join(auditBase, planId + '.events.jsonl');
    const auditPath = await save(auditName, audit, true);
    let deletedCount = 0, deletedBytes = 0, journal;
    try {
      if (audit.journalPath) { await checked(roots.current, audit.journalPath); journal = await open(audit.journalPath, 'wx'); }
      const checkpoint = async file => {
        if (!journal) { await save(auditName, audit); return; }
        await journal.writeFile(JSON.stringify({ id: file.id, path: file.path, bytes: file.bytes, status: file.status, deletedCount, deletedBytes, at: new Date().toISOString() }) + '\n', { encoding: 'utf8' });
        await journal.sync();
      };
      for (const file of audit.files) {
        // 审计先落盘；删除只调用 unlink，绝不删除目录。
        file.status = 'deleting'; await checkpoint(file);
        const stat = await checked(root, path.resolve(root, file.path));
        if (!stat?.isFile() || stateOf(stat) !== saved.identities[file.id]) throw fail('执行期间文件身份变化，已停止清理');
        if (file.master) recordRetainedMedia(root, { path: file.path, master: file.master.path, bytes: file.bytes, sha256: file.master.sha256 });
        await unlink(path.resolve(root, file.path));
        file.status = 'deleted'; deletedCount++; deletedBytes += file.bytes;
        await checkpoint(file);
      }
      audit.status = 'completed'; audit.completedAt = new Date().toISOString();
      audit.result = { deletedCount, deletedBytes, remainingCount: plan.items.length - deletedCount, auditPath };
      await save(auditName, audit);
      return audit.result;
    } catch (error) {
      const active = audit.files.find(file => file.status === 'deleting');
      if (active) { active.status = 'failed'; active.error = error.message; }
      audit.status = 'failed'; audit.error = error.message; audit.deletedCount = deletedCount; audit.deletedBytes = deletedBytes;
      let auditError;
      try { await save(auditName, audit); } catch (writeError) { auditError = writeError.message; }
      throw Object.assign(fail('清理部分失败并已停止：' + error.message + '；已删除' + deletedCount + '个文件、' + deletedBytes + '字节' + (auditError ? '；审计更新失败，持久化未完成：' + auditError : '') + '；审计：' + auditPath), { deletedCount, deletedBytes, auditPath, auditPersisted: !auditError, ...(auditError ? { auditError } : {}) });
    } finally { if (journal) await journal.close(); }
  }
  async function apply(library, input) {
    const previous = queues.get(auditBase) || Promise.resolve();
    const task = previous.catch(() => {}).then(() => execute(library, input));
    queues.set(auditBase, task);
    try { return await task; } finally { if (queues.get(auditBase) === task) queues.delete(auditBase); }
  }
  return { preview, apply };
}
