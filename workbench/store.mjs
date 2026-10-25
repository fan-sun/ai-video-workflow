// 用途：组织内层视频资料，并保存用户手动选择的台账状态。
// 使用：createWorkbenchStore(项目根目录)，由服务或测试调用。
// 依赖：Node.js内置模块及同目录media.mjs。
import { readFile, readdir, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { safeFile, fileId, fingerprint, probe, WorkbenchError } from './media.mjs';

const accepted = a => !!a && (a.confirmed === true || (a.confirmed === undefined && ['approved', 'confirmed', 'accepted_by_user', 'user_approved'].includes(a.status)));
const actNumber = p => Number(/(?:act[_-]?)(\d+)/i.exec(p)?.[1]) || ('一二三四五六'.indexOf(/第([一二三四五六])幕/.exec(p)?.[1]) + 1) || null;
const relative = p => p?.replaceAll('\\', '/');
const versionOf = p => typeof p === 'string' ? relative(p).split('/').at(-2) : '未记录';
const shortStatus = e => e.publish_status === '已发布' ? '已发布' : e.dashboard_status === '待发布' ? '待发布' : '制作中';

export function createWorkbenchStore(root, { probeMedia = probe } = {}) {
  let statusQueue = Promise.resolve();
  async function json(p) { const f = await safeFile(root, p); return f.exists ? JSON.parse(await readFile(f.absolute, 'utf8')) : null; }
  async function resource(p) {
    if (typeof p !== 'string') return null;
    try { const f = await safeFile(root, p); return { id: fileId(p), path: relative(p), exists: f.exists }; }
    catch (e) { return { path: p, exists: false, error: e.message }; }
  }
  async function relatedPlans(p) {
    if (!p) return [];
    const prefix = /^(course\/episodes\/[^/]+\/)/.exec(relative(p))?.[1];
    if (!prefix) return [];
    const f = await safeFile(root, p); if (!f.exists) return [];
    const text = await readFile(f.absolute, 'utf8'), docs = [];
    for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g)) {
      if (/^(?:[a-z]+:|\/)/i.test(match[2])) continue;
      const ref = path.posix.normalize(path.posix.join(path.posix.dirname(relative(p)), match[2]));
      if (!ref.startsWith(prefix) || docs.some(x => x.path === ref)) continue;
      docs.push({ ...await resource(ref), label: match[1] });
      if (docs.length >= 12) break;
    }
    return docs;
  }
  async function detail(ep) {
    const ledger = await json('course/episodes.json');
    if (!Array.isArray(ledger?.episodes)) throw new WorkbenchError('课程台账缺少episodes数组', 500);
    const e = ledger.episodes.find(x => x.ep === Number(ep));
    if (!e) throw new WorkbenchError('期次不存在', 404);
    const warnings = [], episodeDir = `course/episodes/${String(e.ep).padStart(2, '0')}-${e.slug}`;
    const indexPath = e.production_index || `${episodeDir}/制作索引.json`;
    let idx = {};
    try { idx = await json(indexPath) || {}; if (!Object.keys(idx).length) warnings.push('制作索引不存在，仅展示台账记录'); }
    catch (error) { warnings.push(`制作索引无法读取：${error.message}`); }
    const route = (idx.route || e.route) === 'vibe' ? 'vibe' : 'teaching';
    const version = idx.current_version || e.version || '未记录';
    if (e.version && idx.current_version && e.version !== idx.current_version) warnings.push('台账与制作索引版本不同，需核对');
    const media = [], contexts = new Map();
    const add = async (p, options = {}) => {
      if (typeof p !== 'string' || !/\.mp4$/i.test(p)) return;
      p = relative(p); let item = media.find(m => m.path === p);
      if (item) {
        if (options.current) item.current = true;
        const prior = contexts.get(item.id) || {};
        if (options.context && !prior.context) {
          item.candidate = false; item.act = options.act || item.act;
          item.scope = options.scope || (item.act ? 'act' : 'full');
          if (options.duration) item.duration = options.duration;
          contexts.set(item.id, { ...prior, ...options });
        }
        if (options.publish) contexts.set(item.id, { ...contexts.get(item.id), publish: true });
        return item;
      }
      const info = await resource(p);
      const act = options.act || actNumber(p);
      const scope = options.scope || (/局部|片段|交界|衔接|partial|focus|preview|预览|join|点题|前半|末尾|结尾|开场/i.test(path.basename(p)) ? 'clip' : options.context ? (act ? 'act' : 'full') : 'unknown');
      item = { ...info, version: options.version || versionOf(p), act, scope, type: options.type || '候选视频', current: !!options.current, candidate: !options.context, duration: options.duration || null };
      media.push(item); contexts.set(item.id, options);
      return item;
    };
    const currentPath = e.active_preview || idx.active_preview || idx.review_output || idx.publish_output || e.output;
    const currentContext = [idx.active_preview, idx.review_output, idx.publish_output].includes(currentPath) ? idx : null;
    await add(currentPath, { current: true, context: currentContext, version: e.active_preview === currentPath ? e.active_preview_version || versionOf(currentPath) : version, type: '当前预览', duration: e.active_preview_duration_s });
    async function fromIndex(d, snapshot = false) {
      await add(d.review_output, { context: d, version: d.current_version, type: snapshot ? '历史审片版' : '整片审片版' });
      await add(d.publish_output, { context: d, version: d.current_version, type: snapshot ? '历史发布版' : '高清发布版', publish: true });
      for (const a of d.acts || []) {
        const sample = d[`act${a.act}_sample`];
        for (const p of [a.review_output, a.preview_output, sample?.output]) await add(p, { context: d, act: a.act, scope: 'act', type: `第${a.act}幕`, duration: sample?.duration_s, approval: a.review_approval || sample?.user_review });
      }
    }
    await fromIndex(idx);
    await add(e.output, { context: e.output === idx.publish_output ? idx : null, version: e.version, type: '台账成片', publish: e.output === idx.publish_output });
    for (const p of [e.previous_output, idx.previous_review_output, idx.review_base_output, e.active_act_output]) await add(p, { type: '历史／其他预览' });
    const snapshots = new Set([idx.previous_version_index, idx.version_index].filter(Boolean));
    try {
      const dir = await safeFile(root, `${episodeDir}/制作索引.json`);
      if (dir.exists) for (const child of await readdir(path.dirname(dir.absolute), { withFileTypes: true })) if (child.isDirectory() && !/归档|archive/i.test(child.name)) snapshots.add(`${episodeDir}/${child.name}/制作索引.json`);
    } catch (error) { warnings.push(`版本索引检查失败：${error.message}`); }
    for (const p of snapshots) {
      try { const d = await json(p); if (d) await fromIndex(d, true); }
      catch (error) { warnings.push(`历史索引未读取：${p}（${error.message}）`); }
    }
    for (const lane of ['teaching', 'vibe', 'course']) {
      const base = `pipeline/output/${lane}/ep${String(e.ep).padStart(2, '0')}_${e.slug}`;
      // 只扫描本期输出目录及下一层版本目录，不扫描整盘或归档。
      try {
        const parent = path.join(root, base);
        const walk = async (dir, depth) => {
          for (const child of await readdir(path.join(root, dir), { withFileTypes: true })) {
            if (child.isFile() && /\.mp4$/i.test(child.name)) await add(`${dir}/${child.name}`);
            else if (child.isDirectory() && depth && !/归档|archive/i.test(child.name)) await walk(`${dir}/${child.name}`, 0);
          }
        };
        // 对目录本身也做真实路径边界校验，避免目录链接越界。
        const { realpath } = await import('node:fs/promises');
        const actual = await realpath(parent), rel = path.relative(await realpath(root), actual);
        if (rel.startsWith('..') || path.isAbsolute(rel)) throw new WorkbenchError('输出目录超出项目根目录', 403);
        await walk(base, 1);
      } catch (error) { if (error.code !== 'ENOENT') warnings.push(`输出目录未扫描：${error.message}`); }
    }
    let timeline = {};
    try { timeline = await json(idx.timeline_summary) || {}; } catch { warnings.push('整期时间表缺失或无法解析，章节定位暂不可用'); }
    const chapters = (timeline.acts || []).map((a, i) => ({ act: a.act, start: a.start_s, end: a.end_s, title: idx.chapter_titles?.[i] || a.title || `第${a.act}幕` }));
    const acts = await Promise.all((idx.acts || []).map(async a => {
      const sample = idx[`act${a.act}_sample`], output = media.find(m => m.act === a.act && !m.candidate && m.scope === 'act');
      const audio = route === 'vibe' ? '不适用' : (await resource(a.audio))?.exists ? '已生成' : '未生成／未记录';
      const visual = output?.exists ? '已生成' : '未登记独立成片';
      const approval = a.review_approval || sample?.user_review;
      const assistantStatus = a.assistant_visual_review?.status;
      const assistant = assistantStatus === 'pending_visual_review' ? '待连续审看' : /sampled/.test(assistantStatus || '') ? '有抽帧复核记录' : assistantStatus === 'passed' ? '有助手通过记录' : '未记录';
      return { act: a.act, title: chapters.find(c => c.act === a.act)?.title || `第${a.act}幕`, script: (await resource(a.script))?.exists ? '已生成' : '未单独登记', timing: (await resource(a.timings || a.visual_timing))?.exists ? '已生成' : '未记录', audio, visual, mediaId: output?.id || null, technical: a.motion_result?.status === 'passed' || a.first_reveal_check?.status === 'passed' ? '有技术检查记录' : '未记录', assistant, user: accepted(approval) ? '有局部确认记录' : '未单独记录' };
    }));
    const materials = {};
    for (const [key, p] of Object.entries({ script: idx.script || e.script, plan: idx.visual_plan, cover: idx.cover_output || e.cover, copy: idx.publish_copy || e.publish_copy, timeline: idx.timeline_summary })) materials[key] = await resource(p);
    const stage = idx.stage || e.status || '阶段未记录';
    const next = shortStatus(e) === '已发布' ? '本期已登记公开发布' : shortStatus(e) === '待发布' ? '发布资料就绪后，可按现有流程发布' : '按详细制作记录继续；文件生成不等于审片通过';
    const result = { ep: e.ep, slug: e.slug, topic: e.topic, route, version, status: shortStatus(e), stage, next, warnings, indexPath, currentMediaId: media.find(m => m.current)?.id || null, media, acts, chapters, materials, loadedAt: new Date().toISOString() };
    Object.defineProperty(result, '_contexts', { value: contexts });
    return result;
  }
  async function list() {
    const ledger = await json('course/episodes.json');
    if (!Array.isArray(ledger?.episodes)) throw new WorkbenchError('无法读取课程台账', 500);
    const episodes = await Promise.all(ledger.episodes.map(async e => {
      try { const d = await detail(e.ep); return { ep: d.ep, slug: d.slug, topic: d.topic, route: d.route, version: d.version, status: d.status, stage: d.stage, next: d.next, warnings: d.warnings, actCount: d.acts.length, mediaCount: d.media.length }; }
      catch (error) { return { ep: e.ep, topic: e.topic, route: e.route === 'vibe' ? 'vibe' : 'teaching', status: shortStatus(e), stage: '资料读取异常', warnings: [error.message] }; }
    }));
    return { episodes: episodes.sort((a, b) => b.ep - a.ep), loadedAt: new Date().toISOString() };
  }
  async function mediaDetail(ep, id) {
    const d = await detail(ep), m = d.media.find(x => x.id === id);
    if (!m) throw new WorkbenchError('本期没有登记该视频', 404);
    const f = await safeFile(root, m.path);
    if (!f.exists) throw new WorkbenchError('视频文件不存在，请选择其他已登记版本', 404);
    const [sha256, spec] = await Promise.all([fingerprint(f), probeMedia(f)]);
    const context = d._contexts.get(id), idx = context?.context;
    const a = context?.approval || idx?.review_approval;
    const expectedHash = a?.sha256 || a?.video_sha256 || a?.source_sha256;
    const explicitFile = a?.file || a?.output || a?.video || a?.artifact || a?.source_video;
    const evidence = accepted(a) || (!!a?.statement && !!expectedHash && !!explicitFile);
    const approval = { state: evidence && expectedHash === sha256 ? 'verified' : evidence ? 'recorded' : 'unknown', text: evidence && expectedHash === sha256 ? '已有确认 · 文件指纹一致' : evidence ? '有历史确认记录，未核实本文件' : '本文件未登记确认', scope: a?.scope || '' };
    const confirmationBelongs = explicitFile ? relative(explicitFile) === m.path : !a?.version || a.version === idx?.current_version;
    if (evidence && expectedHash && expectedHash !== sha256 && confirmationBelongs) { approval.state = 'mismatch'; approval.text = '确认对应的文件指纹已变化'; }
    const materials = idx ? {} : null;
    if (idx) for (const [key, p] of Object.entries({ script: idx.script, plan: idx.visual_plan, cover: idx.cover_output, copy: idx.publish_copy })) materials[key] = await resource(p);
    const cues = [], scenes = [];
    let timeline = {};
    if (idx?.timeline_summary) try { timeline = await json(idx.timeline_summary) || {}; } catch { /* 缺项在选中媒体的映射说明中呈现。 */ }
    let offset = 0;
    let mapping = !!idx && m.scope !== 'clip' && !m.candidate;
    let mappingProblem = '';
    const recordedHash = context?.approval?.sha256 || (m.path === idx?.review_output ? idx.review_output_sha256 || idx.review_technical_status?.sha256 : null);
    if (approval.state === 'mismatch' || (recordedHash && recordedHash !== sha256)) { mapping = false; mappingProblem = '视频指纹与已有记录不同，已关闭旧时间映射；正文仍可查看'; }
    if (!Number.isFinite(spec?.duration)) { mapping = false; mappingProblem = '实际媒体时长未核实，已关闭时间跟随；请检查视频和ffprobe'; }
    if (context?.publish) {
      // 教学发布片头只有实际时长差与封面协议吻合才平移。
      if (d.route === 'teaching' && idx.cover_embed) {
        const diff = spec?.duration - timeline.total_s;
        if (Number.isFinite(diff) && Math.abs(diff - 0.5) < 0.12) offset = 0.5;
        else if (!(Number.isFinite(diff) && Math.abs(diff) < 0.12)) mapping = false;
      }
    }
    const expectedDuration = m.scope === 'act' ? timeline.acts?.find(a => a.act === m.act)?.duration_s : timeline.total_s;
    if (Number.isFinite(spec?.duration) && Number.isFinite(expectedDuration) && Math.abs(spec.duration - expectedDuration - offset) > 0.25) {
      mapping = false; mappingProblem = '视频实际时长与该版本时间表不符，已关闭旧时间映射；正文仍可查看';
    }
    if (mapping) {
      if (Array.isArray(timeline.captions)) {
        for (const c of timeline.captions) {
          if (m.scope === 'act' && c.act !== m.act) continue;
          const shift = m.scope === 'act' ? -(timeline.acts?.find(a => a.act === m.act)?.start_s || 0) : offset;
          cues.push({ id: `${c.act}/${c.id}`, act: c.act, start: c.start + shift, end: c.end + shift, text: c.text });
        }
      } else for (const a of idx.acts || []) {
        if (m.scope === 'act' && a.act !== m.act) continue;
        let timings;
        try { timings = a.timings ? await json(a.timings) : a.visual_timing ? await json(a.visual_timing) : null; } catch { continue; }
        const base = m.scope === 'act' ? 0 : timeline.acts?.find(x => x.act === a.act)?.start_s;
        if (!Number.isFinite(base)) continue;
        for (const phrase of timings?.phrases || timings?.captions || timings?.screens || []) {
          const start = phrase.start ?? phrase.start_s, end = phrase.end ?? phrase.end_s;
          if (Number.isFinite(start) && Number.isFinite(end)) cues.push({ id: `${a.act}/${phrase.id}`, act: a.act, start: base + start + offset, end: base + end + offset, text: phrase.text, subtitle: phrase.subtitle_units?.map(u => u.text).join('\n') });
        }
      }
      if (idx.visual_plan) try {
        const f = await safeFile(root, idx.visual_plan), text = f.exists ? await readFile(f.absolute, 'utf8') : '';
        for (const line of text.split('\n')) {
          const cells = line.split('|').map(c => c.trim());
          const key = /^(\d+)\/(g\d+)$/i.exec(cells[1] || '');
          const range = /([\d.]+)\s*[–—~-]\s*([\d.]+)/.exec(cells[2] || '');
          if (key && range) {
            const act = Number(key[1]); if (m.scope === 'act' && act !== m.act) continue;
            const base = m.scope === 'act' ? 0 : timeline.acts?.find(x => x.act === act)?.start_s;
            if (!Number.isFinite(base)) continue;
            const scene = { id: `${act}/${key[2]}`, act, start: base + Number(range[1]) + offset, end: base + Number(range[2]) + offset, text: cells[3] };
            scenes.push(scene); for (const cue of cues) if (cue.id === scene.id) cue.plan = scene.text;
          }
        }
      } catch { /* 全文材料入口仍能显示缺项，不编造分镜定位。 */ }
    }
    const chapters = mapping ? (timeline.acts || []).filter(a => m.scope !== 'act' || a.act === m.act).map(a => ({ act: a.act, title: idx.chapter_titles?.[a.act - 1] || a.title || `第${a.act}幕`, start: m.scope === 'act' ? 0 : a.start_s + offset, end: m.scope === 'act' ? a.duration_s ?? a.end_s - a.start_s : a.end_s + offset })) : [];
    const duration = spec?.duration || m.duration || (m.scope === 'act' ? chapters[0]?.end : timeline.total_s) || null;
    return { ...m, sha256, duration, spec, approval, cues: cues.sort((a, b) => a.start - b.start), scenes, chapters, materials, publishMedia: idx?.publish_output ? await resource(idx.publish_output) : null, relatedPlans: await relatedPlans(idx?.visual_plan), mappingNote: mappingProblem || (cues.length ? '按本媒体已登记的正式时间表对应；自然句组边界可能为语义估时' : '未找到本版本可靠时间映射，可查看已有全文；不套用其他版本时间表'), feedbackPath: `.local/video-workbench/${ep}/feedback.json` };
  }
  async function asset(ep, id) {
    const d = await detail(ep);
    const item = d.media.find(x => x.id === id) || Object.values(d.materials).find(x => x?.id === id);
    if (!item) {
      // 历史材料只允许历史快照中明确登记的路径。
      for (const options of d._contexts.values()) for (const key of ['script', 'visual_plan', 'cover_output', 'publish_copy']) {
        const p = options.context?.[key]; if (p && fileId(p) === id) return { ...(await safeFile(root, p)), path: p };
      }
      for (const p of new Set([...d._contexts.values()].map(x => x.context?.visual_plan).filter(Boolean))) {
        const doc = (await relatedPlans(p)).find(x => x.id === id);
        if (doc) return { ...(await safeFile(root, doc.path)), path: doc.path };
      }
      throw new WorkbenchError('本期没有登记该材料', 404);
    }
    return { ...(await safeFile(root, item.path)), path: item.path };
  }
  async function updateStatus(ep, input) {
    if (!input || Object.keys(input).some(k => !['status', 'expectedStatus'].includes(k)) || !['制作中', '待发布', '已发布'].includes(input.status)) throw new WorkbenchError('只能保存制作中、待发布或已发布状态');
    const task = statusQueue.catch(() => {}).then(async () => {
      const file = await safeFile(root, 'course/episodes.json');
      const ledger = await json('course/episodes.json');
      const item = ledger?.episodes?.find(e => e.ep === Number(ep));
      if (!item) throw new WorkbenchError('期次不存在', 404);
      const current = shortStatus(item);
      if (current === input.status) return { ep: Number(ep), status: current };
      if (input.expectedStatus !== undefined && input.expectedStatus !== current) throw new WorkbenchError('该期状态已变化，请刷新后再保存', 409);
      // 只保存用户选择的状态；技术验收、审片证据和正式索引仍由制作流程维护。
      item.dashboard_status = input.status;
      item.publish_status = input.status === '已发布' ? '已发布' : '未发布';
      const temp = `${file.absolute}.${randomUUID()}.tmp`;
      try { await writeFile(temp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8'); await rename(temp, file.absolute); }
      finally { await rm(temp, { force: true }); }
      return { ep: Number(ep), status: input.status };
    });
    statusQueue = task;
    return task;
  }
  return { list, detail, mediaDetail, asset, updateStatus, root };
}
