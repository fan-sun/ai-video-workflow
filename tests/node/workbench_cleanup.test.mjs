// 用途：以独立临时视频库验证历史版本清理边界和依赖保护。
// 运行：node --test tests/node/workbench_cleanup.test.mjs。
// 依赖：Node.js 内置测试与文件模块，不触碰真实视频。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { createWorkbenchStore } from '../../workbench/store.mjs';
import { syncBuiltinESMExports } from 'node:module';
import { createHash } from 'node:crypto';
let api;
try { api = await import('../../workbench/cleanup-store.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

const output = (ep, slug, file) => 'pipeline/output/teaching/ep' + String(ep).padStart(2, '0') + '_' + slug + '/' + file;
async function fixture(t) {
  assert.equal(typeof api?.createCleanupStore, 'function', '尚未实现安全清理模块');
  const legacy = await mkdtemp(path.join(os.tmpdir(), 'workbench-cleanup-'));
  const current = path.join(legacy, 'inner');
  await mkdir(current);
  // 只清理由本测试创建并持有绝对路径的临时目录。
  t.after(() => rm(legacy, { recursive: true, force: true }));
  const put = async (library, name, data) => {
    const absolute = path.join(library === 'current' ? current : legacy, name);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, typeof data === 'string' ? data : JSON.stringify(data), { encoding: 'utf8' });
  };
  const index = {
    episode: 'ep01', slug: 'demo', current_version: 'v2',
    publish_output: output(1, 'demo', 'v2/publish.mp4'), review_output: output(1, 'demo', 'v2/review.mp4'),
    review_approval: { confirmed: true, file: output(1, 'demo', 'v2/review.mp4') },
    acts: [{ act: 1, visual_source: 'course/acts/ep01_demo/act1.html', review_output: output(1, 'demo', 'v2/act1.mp4') }]
  };
  const ledger = { episodes: [
    { ep: 1, slug: 'demo', publish_status: '已发布', output: index.publish_output },
    { ep: 2, slug: 'other', publish_status: '制作中' }
  ] };
  await put('current', 'course/episodes.json', ledger);
  await put('current', 'course/episodes/01-demo/制作索引.json', index);
  await put('current', 'course/episodes/02-other/制作索引.json', { acts: [] });
  await put('current', 'course/acts/ep01_demo/act1.html', '<video src="../../episodes/01-demo/source-assets/素材.mp4"></video>');
  await put('current', 'course/episodes/01-demo/source-assets/素材.mp4', '素材原件');
  await put('current', index.publish_output, '发布原片');
  await put('current', index.review_output, '当前审片');
  await put('current', index.acts[0].review_output, '当前分幕');
  await put('current', output(1, 'demo', 'v1/old.mp4'), '旧版导出');
  await put('current', 'pipeline/build/course_ep01_act1_v1_review/render.mp4', '构建视频');
  await put('current', 'pipeline/build/course_ep01_act1_v1_review/config.json', { input: '音频.wav' });
  await put('current', output(1, 'demo', 'v1/input.wav'), '音频原件');
  await put('current', 'course/episodes/01-demo/v1/制作索引.json', { review_output: output(1, 'demo', 'v1/old.mp4') });
  await put('current', output(10, 'unrelated', 'v1/decoy.mp4'), '不能串期');
  await put('current', output(1, 'wrong-slug', 'v1/decoy.mp4'), '不能串主题');
  const legacyIndex = { publish_output: output(1, 'legacy', 'v3/publish.mp4'), review_output: output(1, 'legacy', 'v3/review.mp4'), acts: [] };
  await put('legacy', 'course/episodes.json', { episodes: [{ ep: 1, slug: 'legacy', publish_status: '已发布', output: legacyIndex.publish_output }] });
  await put('legacy', 'course/episodes/01-legacy/制作索引.json', legacyIndex);
  await put('legacy', legacyIndex.publish_output, '外层发布');
  await put('legacy', legacyIndex.review_output, '外层审片');
  await put('legacy', output(1, 'legacy', 'v1/old.mp4'), '外层旧片');
  const libraries = { current, legacy }, auditRoot = path.join(current, '.local/video-workbench/cleanup');
  return { current, legacy, libraries, auditRoot, put, index, ledger, store: api.createCleanupStore(libraries, auditRoot) };
}
const oldItem = plan => plan.items.find(x => x.path === output(1, 'demo', 'v1/old.mp4'));
const apply = (f, plan, items) => f.store.apply('current', { planId: plan.id, fileIds: items.map(x => x.id), confirmation: '清理历史版本' });
const reviewedPath = '.local/video-workbench/cleanup-reviewed.json';
const digest = text => createHash('sha256').update(text).digest('hex');

async function reviewedFixture(t) {
  const f = await fixture(t);
  f.index.acts[0].visual_source = 'course/acts/ep01_demo/v2/act1.html';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', f.index.acts[0].visual_source, '<div>当前画面</div>');
  const image = 'course/episodes/01-demo/v1/act1-qc/frame.png';
  const font = 'pipeline/build/course_ep01_act1_v1_review/fonts/A.woff2';
  const source = 'templates/demo/fonts/A.woff2';
  await f.put('current', image, '旧检查图片'); await f.put('current', font, '字体原件'); await f.put('current', source, '字体原件');
  const registration = { schema: 1, historicalReferences: [], artifacts: [
    { ep: 1, act: 1, version: 1, kind: 'image', path: image, sha256: digest('旧检查图片') },
    { ep: 1, act: 1, version: 1, kind: 'font', path: font, source, sha256: digest('字体原件') }
  ] };
  await f.put('current', reviewedPath, registration);
  return { ...f, image, font, source, registration };
}

test('页面相对assets及资源JS的visual_assets映射不误报缺失，资源原件保留', async t => {
  const f = await fixture(t);
  await f.put('current', 'course/acts/ep01_demo/act1.html', '<style>@font-face{src:url("assets/A.woff2")}</style><script src="assets/scene.js"></script>');
  await f.put('current', 'course/acts/ep01_demo/assets/A.woff2', '页面字体');
  f.index.acts[0].visual_assets = ['course/episodes/01-demo/scene.js', 'course/episodes/01-demo/photo.png'];
  await f.put('current', 'course/episodes/01-demo/scene.js', "const photo=new Image();photo.src='assets/photo.png';");
  await f.put('current', 'course/episodes/01-demo/photo.png', '原图');
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true);
  assert.ok(!plan.warnings.some(message => /assets\/(?:A|photo)/.test(message)));
});

test('旧页面对应的具体构建资源可核对，不按全库同名文件猜测依赖', async t => {
  const f = await fixture(t);
  f.index.source_refs = ['course/acts/ep01_demo/act1-v1.html'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', f.index.source_refs[0], '<script src="assets/old.js"></script>');
  await f.put('current', 'pipeline/build/course_ep01_act1_v1_review/assets/old.js', 'const x=1;');
  let plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
  await rm(path.join(f.current, 'pipeline/build/course_ep01_act1_v1_review/assets/old.js'));
  await f.put('current', 'course/episodes/01-demo/unrelated/old.js', '不能拿任意同名文件补齐');
  plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});

test('source_refs中的通用工具不把默认输出名当输入，明确JSON输入仍展开', async t => {
  const f = await fixture(t);
  f.index.source_refs = ['build/generator.mjs'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'build/generator.mjs', "import fs from 'node:fs';const out='生成时间表.json';fs.writeFileSync(out,'{}');");
  let plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
  await f.put('current', 'build/input.json', { video: output(1, 'demo', 'v1/old.mp4') });
  await f.put('current', 'build/generator.mjs', "import fs from 'node:fs';const input='./input.json';fs.readFileSync(input);");
  plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});

test('登记工具中的明确输入缺失仍封闭，不因通用输出识别而降级', async t => {
  const f = await fixture(t);
  f.index.source_refs = ['build/generator.mjs'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'build/generator.mjs', "import fs from 'node:fs';const input='./missing.json';fs.readFileSync(input);");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false); assert.match(plan.warnings.join(), /missing/);
});

test('按已核实工具源码摘要识别输出常量，工具改动后例外失效', async t => {
  const f = await fixture(t), source = 'build/generator.mjs';
  const text = "import fs from 'node:fs';const out='生成时间表.json';fs.writeFileSync(out,'{}');";
  f.index.config = 'course/episodes/01-demo/config.json';
  await f.put('current', f.index.config, { source });
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', source, text);
  await f.put('current', reviewedPath, { schema: 1, artifacts: [], historicalReferences: [], outputConstants: [{ source, value: '生成时间表.json', sourceSha256: digest(text) }] });
  let plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
  await f.put('current', source, "import fs from 'node:fs';const input='生成时间表.json';fs.readFileSync(input);");
  plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});

test('重复字体的来源目录被换成库内链接也不放行', async t => {
  const f = await reviewedFixture(t), directory = path.join(f.current, 'templates/demo');
  await rename(directory, directory + '-real');
  await symlink(directory + '-real', directory, process.platform === 'win32' ? 'junction' : 'dir');
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.font)?.allowed, false);
});

test('目录和动态文件名拼接的图片输入保护整组核验图片', async t => {
  const f = await reviewedFixture(t);
  await f.put('current', 'build/read_frames.mjs', "import fs from 'node:fs';import path from 'node:path';const rootDir=process.cwd();const input=path.join(rootDir,'course/episodes/01-demo/v1/act1-qc',name+'.png');fs.readFileSync(input);");
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false);
});

test('仅登记的历史JSON位置放行旧片，其他实际位置和新引用仍保护，原记录不改', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.trial = { output: old };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', reviewedPath, { schema: 1, artifacts: [], historicalReferences: [{ index: 'course/episodes/01-demo/制作索引.json', pointer: '/trial/output', value: old }] });
  const before = await readFile(path.join(f.current, 'course/episodes/01-demo/制作索引.json'), { encoding: 'utf8' });
  let plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
  f.index.source_materials = { video: old }; await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
  await f.put('current', 'course/episodes/01-demo/制作索引.json', JSON.parse(before));
  plan = await f.store.preview('current', [1]); await apply(f, plan, [oldItem(plan)]);
  assert.equal(await readFile(path.join(f.current, 'course/episodes/01-demo/制作索引.json'), { encoding: 'utf8' }), before);
});

test('登记旧检查图片和同字节旧字体可逐文件清理，未登记文件与记录保留', async t => {
  const f = await reviewedFixture(t);
  await f.put('current', 'pipeline/build/course_ep01_act1_v1_review/snapshots/new.png', '新增图片未经核验');
  await f.put('current', 'course/episodes/01-demo/v1/act1-qc/report.json', { status: '旧记录' });
  const plan = await f.store.preview('current', [1]);
  const selected = [f.image, f.font].map(name => plan.items.find(item => item.path === name));
  assert.equal(selected[0]?.allowed, true, JSON.stringify(selected[0])); assert.equal(selected[0]?.kind, 'image');
  assert.equal(selected[1]?.allowed, true, JSON.stringify(selected[1])); assert.equal(selected[1]?.kind, 'font');
  assert.equal(plan.items.find(item => item.path.endsWith('/new.png')).allowed, false);
  const result = await apply(f, plan, selected); assert.equal(result.deletedCount, 2);
  for (const name of [f.image, f.font]) await assert.rejects(lstat(path.join(f.current, name)), { code: 'ENOENT' });
  for (const name of [f.source, f.index.publish_output, f.index.review_output, 'course/episodes/01-demo/v1/act1-qc/report.json']) assert.ok((await lstat(path.join(f.current, name))).isFile());
});

test('登记图片成为当前素材或当前验收证据后禁删，动态图片输入同样保护', async t => {
  for (const mode of ['source', 'report', 'dynamic']) {
    const f = await reviewedFixture(t);
    if (mode === 'source') await f.put('current', f.index.acts[0].visual_source, '<img src="../../../episodes/01-demo/v1/act1-qc/frame.png">');
    if (mode === 'report') {
      f.index.acts[0].review_check = { technical_report: 'course/episodes/01-demo/v1/act1-qc/report.json' };
      await f.put('current', 'course/episodes/01-demo/v1/act1-qc/report.json', { frames: [{ file: f.image }] });
      await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
    }
    if (mode === 'dynamic') await f.put('current', f.index.acts[0].visual_source, '<script>const input="course/episodes/01-demo/v1/act1-qc/${name}.png";</script>');
    const plan = await f.store.preview('current', [1]);
    assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false, mode);
  }
});

test('旧图片内容变化、源字体变化或幕版本回退后登记失效', async t => {
  for (const mode of ['image', 'font', 'version']) {
    const f = await reviewedFixture(t);
    if (mode === 'image') await f.put('current', f.image, '新内容');
    if (mode === 'font') await f.put('current', f.source, '字体改版');
    if (mode === 'version') {
      f.index.acts[0].visual_source = 'course/acts/ep01_demo/v1/act1.html';
      f.index.acts[0].review_output = output(1, 'demo', 'v1/review.mp4');
      await f.put('current', f.index.acts[0].visual_source, '<div>复用旧幕</div>');
      await f.put('current', f.index.acts[0].review_output, '旧幕当前仍使用');
      await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
    }
    const plan = await f.store.preview('current', [1]);
    assert.equal(plan.items.find(item => item.path === (mode === 'font' ? f.font : f.image))?.allowed, false, mode);
  }
});

test('预览后登记或源字体变化拒绝执行，未发布期次不放行图片字体', async t => {
  for (const mode of ['registration', 'font', 'status']) {
    const f = await reviewedFixture(t), plan = await f.store.preview('current', [1]);
    const selected = plan.items.find(item => item.path === f.font); assert.equal(selected?.allowed, true, JSON.stringify(selected));
    if (mode === 'registration') { f.registration.artifacts = []; await f.put('current', reviewedPath, f.registration); }
    if (mode === 'font') await f.put('current', f.source, '不同源字体');
    if (mode === 'status') { f.ledger.episodes[0].publish_status = '制作中'; await f.put('current', 'course/episodes.json', f.ledger); }
    await assert.rejects(apply(f, plan, [selected]), /变化|重新预览/);
    assert.ok((await lstat(path.join(f.current, f.font))).isFile());
    if (mode === 'status') { const next = await f.store.preview('current', [1]); assert.ok(next.items.every(item => !item.allowed)); }
  }
});

test('不能登记源码、声音、素材目录图片或跨期路径为旧检查产物', async t => {
  const f = await reviewedFixture(t);
  for (const name of ['course/episodes/01-demo/v1/assets/a.png', 'course/episodes/02-other/v1/act1-qc/frame.png', 'course/episodes/01-demo/v1/act1-qc/sound.wav']) {
    await f.put('current', name, '保留输入');
    f.registration.artifacts = [{ ep: 1, act: 1, version: 1, kind: 'image', path: name, sha256: digest('保留输入') }];
    await f.put('current', reviewedPath, f.registration);
    const plan = await f.store.preview('current', [1]);
    assert.ok(!plan.items.some(item => item.path === name && item.allowed), name);
    assert.ok(plan.warnings.some(message => /登记|核验/.test(message)));
  }
});

test('正式opening_strategy输入不能被历史指针登记放行', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.opening_strategy = { source: old };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', reviewedPath, { schema: 1, artifacts: [], historicalReferences: [{ index: 'course/episodes/01-demo/制作索引.json', pointer: '/opening_strategy/source', value: old }] });
  const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});

test('跨库验收JSON内的根相对图片按该记录所属库解析并保留', async t => {
  const f = await reviewedFixture(t), foreign = 'course/episodes/01-legacy/current-report.json';
  await f.put('legacy', foreign, { frames: [{ file: 'inner/' + f.image }] });
  f.index.acts[0].review_check = { technical_report: path.join(f.legacy, foreign) };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false);
});

test('另一库未登记产物，其当前验收图片仍保护本库候选', async t => {
  const f = await reviewedFixture(t), foreignIndex = 'course/episodes/01-legacy/制作索引.json';
  const index = JSON.parse(await readFile(path.join(f.legacy, foreignIndex), { encoding: 'utf8' }));
  index.review_check = { report: 'course/episodes/01-legacy/report.json' };
  await f.put('legacy', foreignIndex, index);
  await f.put('legacy', 'course/episodes/01-legacy/report.json', { frames: [{ file: 'inner/' + f.image }] });
  const plan = await f.store.preview('current', [1]); assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false);
});

test('visual_review直接指向JSON时仍保留报告图片', async t => {
  const f = await reviewedFixture(t);
  f.index.visual_review = 'course/episodes/01-demo/current-review.json';
  await f.put('current', f.index.visual_review, { frames: [{ file: f.image }] });
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  const plan = await f.store.preview('current', [1]); assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false);
});

test('辅助脚本图片列表、版本冲突及其他位置的当前报告均不放行旧图', async t => {
  for (const mode of ['array', 'version', 'report']) {
    const f = await reviewedFixture(t);
    if (mode === 'array') await f.put('current', 'build/read_frames.mjs', "import fs from 'node:fs';const frames=['" + f.image + "'];for(const frame of frames)fs.readFileSync(frame);");
    if (mode === 'version') {
      f.index.acts[0].visual_source = 'course/acts/ep01_demo/v1/act1.html';
      await f.put('current', f.index.acts[0].visual_source, '<div>当前源码仍是v1</div>');
    }
    if (mode === 'report') {
      f.index.visual_direction = { current_review_report: 'course/episodes/01-demo/current-review.json' };
      await f.put('current', 'course/episodes/01-demo/current-review.json', { frames: [{ file: f.image }] });
    }
    await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
    const plan = await f.store.preview('current', [1]); assert.equal(plan.items.find(item => item.path === f.image)?.allowed, false, mode);
  }
});

test('大批清理使用逐项落盘事件，最终审计完整，失败准确保留已删数量', async t => {
  for (const partial of [false, true]) {
    const f = await reviewedFixture(t);
    f.registration.artifacts = [];
    for (let i = 0; i < 101; i++) {
      const name = 'course/episodes/01-demo/v1/act1-qc/frame-' + String(i).padStart(3, '0') + '.png';
      await f.put('current', name, '旧检查图片');
      f.registration.artifacts.push({ ep: 1, act: 1, version: 1, kind: 'image', path: name, sha256: digest('旧检查图片') });
    }
    await f.put('current', reviewedPath, f.registration);
    const plan = await f.store.preview('current', [1]), selected = plan.items.filter(item => item.kind === 'image' && item.allowed);
    assert.equal(selected.length, 101);
    const auditPath = path.join(f.auditRoot, plan.id + '.audit.json'), original = fs.unlink;
    let attempts = 0;
    fs.unlink = async absolute => {
      const audit = JSON.parse(await readFile(auditPath, { encoding: 'utf8' }));
      assert.ok(audit.journalPath, '大批量不应逐次重写完整审计');
      const events = (await readFile(audit.journalPath, { encoding: 'utf8' })).trim().split('\n').map(line => JSON.parse(line));
      assert.equal(events.at(-1).status, 'deleting');
      assert.equal(path.resolve(f.current, events.at(-1).path), absolute);
      if (partial && attempts++ === 2) throw Object.assign(new Error('模拟批量删除失败'), { code: 'EACCES' });
      return original(absolute);
    };
    syncBuiltinESMExports();
    try {
      if (partial) await assert.rejects(apply(f, plan, selected), error => { assert.equal(error.deletedCount, 2); return true; });
      else assert.equal((await apply(f, plan, selected)).deletedCount, 101);
    } finally { fs.unlink = original; syncBuiltinESMExports(); }
    const audit = JSON.parse(await readFile(auditPath, { encoding: 'utf8' }));
    assert.equal(audit.status, partial ? 'failed' : 'completed');
    assert.equal(audit.files.filter(item => item.status === 'deleted').length, partial ? 2 : 101);
  }
});

test('保留发布文件名，将完全相同的整片副本归档，原确认不改且可恢复', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  const indexBefore = await readFile(path.join(f.current, 'course/episodes/01-demo/制作索引.json'), 'utf8');
  const plan = await f.store.preview('current', [1]);
  const duplicate = plan.items.find(x => x.path === f.index.review_output);
  assert.equal(duplicate.allowed, true);
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(duplicate.master.path, f.index.publish_output);
  assert.equal(plan.masters[0].path, f.index.publish_output);
  await apply(f, plan, [duplicate]);
  assert.equal(await readFile(path.join(f.current, f.index.publish_output), 'utf8'), '发布原片');
  await assert.rejects(lstat(path.join(f.current, f.index.review_output)), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.current, 'course/episodes/01-demo/制作索引.json'), 'utf8'), indexBefore);
  const store = createWorkbenchStore(f.current, { probeMedia: async () => ({ duration: 10, width: 1920, height: 1080 }) });
  const detail = await store.detail(1), current = detail.media.find(x => x.id === detail.currentMediaId);
  assert.equal(current.archived, true); assert.equal(current.exists, true);
  const file = await store.asset(1, current.id);
  assert.equal(file.absolute, path.join(f.current, f.index.publish_output));
  const preview = await f.store.preview('current', [1]);
  assert.equal(oldItem(preview).allowed, true);
  assert.equal((await store.restoreMedia(1, current.id)).restored, true);
  assert.equal(await readFile(path.join(f.current, f.index.review_output), 'utf8'), '发布原片');
  assert.equal((await store.restoreMedia(1, current.id)).restored, false);
});

test('与发布片相同但被其他源码实际读取的副本继续保留', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  await f.put('current', 'course/acts/ep01_demo/act1.html', '<video src="../../../' + f.index.review_output + '"></video>');
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(x => x.path === f.index.review_output).allowed, false);
});

test('辅助入口通过目录和文件名变量拼接读取审片时，不放行相同副本', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  await f.put('current', 'tools/use_review.mjs', "import fs from 'node:fs'; import path from 'node:path'; const rootDir=process.cwd(); const folder='pipeline/output/teaching/ep01_demo/v2'; const name='review.mp4'; const input=path.join(rootDir,folder,name); fs.readFileSync(input);");
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.index.review_output).allowed, false);
  await f.put('current', 'tools/use_review.mjs', "import fs from 'node:fs'; import path from 'node:path'; const rootDir=process.cwd(); const folder='pipeline/output/teaching'; const episode='ep01_demo'; const version='v2'; const name='review.mp4'; const input=path.join(rootDir,folder,episode,version,name); fs.readFileSync(input);");
  const split = await f.store.preview('current', [1]);
  assert.equal(split.items.find(item => item.path === f.index.review_output).allowed, false);
});

test('没有本期实例参数的通用CLI目录不当成实际MP4输入范围', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  await f.put('current', 'build/generic_cli.mjs', "import fs from 'node:fs'; import path from 'node:path'; const rootDir=process.cwd(); function readVideo(inputName){ const folder='pipeline/output/teaching'; const input=path.join(rootDir,folder,inputName); return fs.readFileSync(input); } const sample='example.mp4'; const inputName=process.argv[2]; if(inputName) readVideo(inputName);");
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.index.review_output).allowed, true);
});

test('发布母版在预览后变化，拒绝清理副本且不写归档', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  const plan = await f.store.preview('current', [1]), duplicate = plan.items.find(x => x.path === f.index.review_output);
  assert.equal(duplicate.allowed, true);
  await f.put('current', f.index.publish_output, '发布片已更新');
  await assert.rejects(apply(f, plan, [duplicate]), /变化|预览/);
  assert.equal(await readFile(path.join(f.current, f.index.review_output), 'utf8'), '发布原片');
});

test('两库相对路径相同各自指向本库，不误判为跨库读取另一份审片', async t => {
  const f = await fixture(t);
  f.ledger.episodes[0].active_preview = f.index.review_output;
  await f.put('current', 'course/episodes.json', f.ledger);
  await f.put('current', f.index.review_output, '发布原片');
  await f.put('legacy', 'course/episodes.json', { episodes: [{ ep: 1, slug: 'demo', publish_status: '已发布', output: f.index.publish_output }] });
  await f.put('legacy', 'course/episodes/01-demo/制作索引.json', { ...f.index, acts: [] });
  await f.put('legacy', f.index.publish_output, '另库发布原片');
  await f.put('legacy', f.index.review_output, '另库发布原片');
  for (const library of ['current', 'legacy']) {
    const plan = await f.store.preview(library, [1]);
    assert.equal(plan.items.find(item => item.path === f.index.review_output).allowed, true, library);
  }
});

test('换到新发布版本后，旧归档记录所依赖的母版仍永久保护', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  const plan = await f.store.preview('current', [1]);
  await apply(f, plan, [plan.items.find(item => item.path === f.index.review_output)]);
  const next = { ...f.index, publish_output: output(1, 'demo', 'v3/publish.mp4'), review_output: output(1, 'demo', 'v3/review.mp4') };
  await f.put('current', next.publish_output, '新发布片'); await f.put('current', next.review_output, '新审片');
  await f.put('current', 'course/episodes/01-demo/制作索引.json', { ...next, review_approval: null });
  f.ledger.episodes[0].output = next.publish_output;
  await f.put('current', 'course/episodes.json', f.ledger);
  const after = await f.store.preview('current', [1]), master = after.items.find(item => item.path === f.index.publish_output);
  assert.equal(master.allowed, false);
  assert.match(master.reasons.join(), /归档.*母版/);
  await f.put('current', next.publish_output, '发布原片');
  await f.put('current', 'course/episodes/01-demo/制作索引.json', { ...next, review_output: f.index.publish_output, review_approval: null });
  const chain = await f.store.preview('current', [1]);
  assert.equal(chain.items.find(item => item.path === f.index.publish_output).allowed, false, '旧母版不能再次作为重复副本被删');
});

test('按台账精确映射范围，保护发布、当前审片及非MP4，不把历史索引当全局根', async t => {
  const f = await fixture(t), before = await readFile(path.join(f.current, 'course/episodes.json'), { encoding: 'utf8' });
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.library, 'current'); assert.deepEqual(plan.episodes, [1]);
  assert.equal(oldItem(plan).allowed, true);
  assert.equal(plan.items.find(x => x.path.endsWith('/render.mp4')).allowed, true);
  for (const p of [f.index.publish_output, f.index.review_output, f.index.acts[0].review_output]) assert.equal(plan.items.find(x => x.path === p).allowed, false, p);
  assert.ok(plan.items.filter(x => !x.path.endsWith('.mp4')).every(x => !x.allowed));
  assert.ok(plan.items.every(x => !x.path.includes('unrelated') && !x.path.includes('wrong-slug')));
  assert.equal(plan.summary.fileCount, plan.items.length);
  assert.equal(plan.summary.totalBytes, plan.summary.eligibleBytes + plan.summary.protectedBytes);
  assert.equal(await readFile(path.join(f.current, 'course/episodes.json'), { encoding: 'utf8' }), before);
});

test('相对源码引用沿闭包保护旧导出，素材、音频及输入JSON逐字保留', async t => {
  const f = await fixture(t);
  await f.put('current', 'course/acts/ep01_demo/act1.html', '<script src="./nested.js"></script>');
  await f.put('current', 'course/acts/ep01_demo/nested.js', "const source = '../../../" + output(1, 'demo', 'v1/old.mp4') + "';");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false); assert.match(oldItem(plan).reasons.join(), /依赖|引用/);
  const build = plan.items.find(x => x.path.endsWith('/render.mp4'));
  const input = path.join(f.current, 'pipeline/build/course_ep01_act1_v1_review/config.json');
  const before = await readFile(input, { encoding: 'utf8' });
  await apply(f, plan, [build]);
  assert.equal(await readFile(input, { encoding: 'utf8' }), before);
  assert.equal(await readFile(path.join(f.current, 'course/episodes/01-demo/source-assets/素材.mp4'), { encoding: 'utf8' }), '素材原件');
});

test('其他期次、另一个库、素材索引及辅助脚本的明确输入均保护依赖', async t => {
  const f = await fixture(t), targets = ['other', 'cross', 'material', 'helper'];
  for (const n of targets) await f.put('current', output(1, 'demo', 'v1/' + n + '.mp4'), n);
  await f.put('current', 'course/episodes/02-other/制作索引.json', { source: output(1, 'demo', 'v1/other.mp4') });
  await f.put('legacy', 'build/reuse.mjs', "const source = 'inner/" + output(1, 'demo', 'v1/cross.mp4') + "';");
  await f.put('current', 'pipeline/library/素材索引.json', { input: output(1, 'demo', 'v1/material.mp4') });
  await f.put('current', 'build/helper.mjs', "const input = '" + output(1, 'demo', 'v1/helper.mp4') + "';");
  const plan = await f.store.preview('current', [1]);
  for (const n of targets) assert.equal(plan.items.find(x => x.path.endsWith('/v1/' + n + '.mp4')).allowed, false, n);
  assert.equal(oldItem(plan).allowed, true);
  const legacy = await f.store.preview('legacy', [1]);
  assert.ok(legacy.items.every(x => !x.path.startsWith('inner/')));
});

test('无法静态确定的MP4输入按相关期次封闭，损坏依赖明确警告', async t => {
  const f = await fixture(t);
  await f.put('current', 'course/acts/ep01_demo/act1.html', 'const source = `../../../pipeline/output/teaching/ep01_demo/v${version}/clip.mp4`;');
  let plan = await f.store.preview('current', [1]);
  assert.ok(plan.items.every(x => !x.allowed)); assert.match(plan.warnings.join(), /动态/);
  await f.put('current', 'course/acts/ep01_demo/act1.html', '<script src="./missing.js"></script>');
  plan = await f.store.preview('current', [1]);
  assert.ok(plan.items.every(x => !x.allowed)); assert.match(plan.warnings.join(), /缺失|无法/);
});

test('未发布、发布文件缺失、索引与台账发布路径冲突均只能预览', async t => {
  const f = await fixture(t);
  for (const status of ['待发布', '制作中', '未发布', '']) {
    f.ledger.episodes[0].publish_status = status; await f.put('current', 'course/episodes.json', f.ledger);
    const plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed));
    await assert.rejects(apply(f, plan, [oldItem(plan)]), /保护|清理/);
    assert.ok((await lstat(path.join(f.current, oldItem(plan).path))).isFile());
  }
  f.ledger.episodes[0].publish_status = '已发布'; await f.put('current', 'course/episodes.json', f.ledger);
  await rm(path.join(f.current, f.index.publish_output));
  let plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed)); assert.match(plan.warnings.join(), /发布/);
  await f.put('current', f.index.publish_output, '发布原片');
  f.ledger.episodes[0].output = f.index.review_output; await f.put('current', 'course/episodes.json', f.ledger);
  plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed)); assert.match(plan.warnings.join(), /冲突|不一致/);
});

test('两库预览后改为制作中或待发布，旧计划不能删除文件', async t => {
  for (const library of ['current', 'legacy']) for (const status of ['制作中', '待发布']) {
    const f = await fixture(t), plan = await f.store.preview(library, [1]);
    const selected = plan.items.find(item => item.path === output(1, library === 'current' ? 'demo' : 'legacy', 'v1/old.mp4'));
    assert.equal(selected.allowed, true);
    const ledger = JSON.parse(await readFile(path.join(f[library], 'course/episodes.json'), { encoding: 'utf8' }));
    ledger.episodes[0].publish_status = status;
    await f.put(library, 'course/episodes.json', ledger);
    await assert.rejects(f.store.apply(library, { planId: plan.id, fileIds: [selected.id], confirmation: '清理历史版本' }), /变化|重新预览/);
    assert.ok((await lstat(path.join(f[library], selected.path))).isFile());
  }
});

test('服务端计划拒绝未知库、串库、任意ID、客户端路径及受保护选择，验证先于删除', async t => {
  const f = await fixture(t), plan = await f.store.preview('current', [1]);
  await assert.rejects(f.store.preview('unknown', [1]), /库/);
  await assert.rejects(f.store.preview('current', [99]), /期次/);
  await assert.rejects(f.store.apply('legacy', { planId: plan.id, fileIds: [oldItem(plan).id], confirmation: '清理历史版本' }), /库/);
  await assert.rejects(apply(f, plan, [{ id: '../../elsewhere' }]), /文件|选择/);
  await assert.rejects(f.store.apply('current', { planId: plan.id, fileIds: [oldItem(plan).id], paths: ['anything'], confirmation: '清理历史版本' }), /路径|参数/);
  await assert.rejects(f.store.apply('current', { planId: '../escape', fileIds: [oldItem(plan).id], confirmation: '清理历史版本' }), /计划/);
  await assert.rejects(f.store.apply('current', { planId: plan.id, fileIds: [oldItem(plan).id], confirmation: '确认' }), /清理历史版本/);
  await assert.rejects(apply(f, plan, [oldItem(plan), plan.items.find(x => x.path === f.index.publish_output)]), /保护|清理/);
  assert.ok((await lstat(path.join(f.current, oldItem(plan).path))).isFile());
});

test('预览后视频、索引和新增辅助依赖变化均拒绝执行并要求重新预览', async t => {
  for (const change of ['video', 'index', 'helper']) {
    const f = await fixture(t), plan = await f.store.preview('current', [1]);
    if (change === 'video') await f.put('current', oldItem(plan).path, '改变后的旧视频');
    if (change === 'index') { f.index.extra = true; await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index); }
    if (change === 'helper') await f.put('legacy', 'build/new-input.mjs', "const input = 'inner/" + oldItem(plan).path + "';");
    await assert.rejects(apply(f, plan, [oldItem(plan)]), /变化|重新预览/);
    assert.ok((await lstat(path.join(f.current, oldItem(plan).path))).isFile());
  }
});

test('不进入链接或junction；预览后的目录替换为链接也拒删', async t => {
  const f = await fixture(t), outside = path.join(f.legacy, 'outside'); await mkdir(outside);
  await writeFile(path.join(outside, 'keep.mp4'), '外部原件', { encoding: 'utf8' });
  const link = path.join(f.current, output(1, 'demo', 'linked'));
  await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  let plan = await f.store.preview('current', [1]);
  assert.ok(plan.items.every(x => !x.path.includes('linked/'))); assert.match(plan.warnings.join(), /链接/);
  await rm(link);
  plan = await f.store.preview('current', [1]);
  const dir = path.dirname(path.join(f.current, oldItem(plan).path));
  await rename(dir, dir + '-saved'); await symlink(outside, dir, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(apply(f, plan, [oldItem(plan)]), /链接|变化|重新预览/);
  assert.equal(await readFile(path.join(outside, 'keep.mp4'), { encoding: 'utf8' }), '外部原件');
});

test('只unlink选中的准确文件，先落盘审计并可幂等重放，不清空版本目录', async t => {
  const f = await fixture(t), plan = await f.store.preview('current', [1]), selected = oldItem(plan);
  const result = await apply(f, plan, [selected]);
  assert.equal(result.deletedCount, 1); assert.equal(result.deletedBytes, selected.bytes);
  assert.equal(result.remainingCount, plan.items.length - 1);
  await assert.rejects(lstat(path.join(f.current, selected.path)), { code: 'ENOENT' });
  assert.ok((await lstat(path.join(f.current, output(1, 'demo', 'v1/input.wav')))).isFile());
  assert.ok((await lstat(path.join(f.current, 'pipeline/build/course_ep01_act1_v1_review/render.mp4'))).isFile());
  const audit = JSON.parse(await readFile(result.auditPath, { encoding: 'utf8' }));
  assert.equal(audit.status, 'completed'); assert.equal(audit.files[0].status, 'deleted'); assert.equal(audit.files[0].path, selected.path);
  assert.deepEqual(await apply(f, plan, [selected]), result);
  const restarted = api.createCleanupStore(f.libraries, f.auditRoot);
  assert.deepEqual(await restarted.apply('current', { planId: plan.id, fileIds: [selected.id], confirmation: '清理历史版本' }), result);
  await assert.rejects(apply(f, plan, [plan.items.find(x => x.path.endsWith('/render.mp4'))]), /已执行|重新预览/);
});

test('普通数值、CSS选择器和说明文字不是文件引用，诊断不会按文件数重复膨胀', async t => {
  const f = await fixture(t);
  await f.put('current', 'course/acts/ep01_demo/act1.html', "const opacity='0.5'; const selector='.panel'; const note='旧版本只保留历史记录 old.mp4';");
  let plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true); assert.equal(plan.warnings.length, 0);
  f.index.visual_assets = Array.from({ length: 40 }, (_, i) => 'course/missing-' + i + '.html');
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false); assert.ok(oldItem(plan).reasons.length <= 10);
  assert.ok(plan.warnings.length >= 40);
});

test('构建中复制的素材MP4受保护，仅台账命名的派生输出可清理', async t => {
  const f = await fixture(t);
  await f.put('current', 'pipeline/build/course_ep01_act1_v1_review/assets/input.mp4', '素材');
  await f.put('current', 'pipeline/build/not-course-ep01-cache/render.mp4', '不确定来源');
  await f.put('current', 'pipeline/build/ep01_wrong-slug/render.mp4', '串主题');
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(x => x.path.endsWith('/assets/input.mp4')).allowed, false);
  assert.ok(plan.items.every(x => !x.path.includes('not-course') && !x.path.includes('wrong-slug')));
});

test('意见记录保留对应旧视频，辅助脚本path.join明确输入同样保护', async t => {
  const f = await fixture(t);
  await f.put('current', '.local/video-workbench/1/feedback.json', { items: [{ path: oldItem(await f.store.preview('current', [1])).path }] });
  await f.put('current', output(1, 'demo', 'v1/joined.mp4'), '明确输入');
  await f.put('current', 'build/helper.mjs', "const input = path.join(root, 'pipeline', 'output', 'teaching', 'ep01_demo', 'v1', 'joined.mp4');");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  assert.equal(plan.items.find(x => x.path.endsWith('/joined.mp4')).allowed, false);
});

test('辅助代码的输入数组不能漏过，未知动态数组封闭而明确输出模板不作输入', async t => {
  const f = await fixture(t);
  await f.put('legacy', 'build/clips.mjs', "const clips = ['inner/" + output(1, 'demo', 'v1/old.mp4') + "'];");
  let plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
  await f.put('legacy', 'build/clips.mjs', 'const clips = [`inner/pipeline/output/teaching/ep01_demo/v${version}/old.mp4`];');
  plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed)); assert.match(plan.warnings.join(), /动态/);
  await f.put('legacy', 'build/clips.mjs', 'const output = `inner/pipeline/output/teaching/ep01_demo/v${version}/out.mp4`;');
  plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
});

test('构建顶层正式拼接派生片可选，未知MP4及素材受保护', async t => {
  const f = await fixture(t);
  await f.put('current', 'pipeline/build/course_ep01_v2_publish_silent.mp4', '静音拼接派生片');
  await f.put('current', 'pipeline/build/course_ep01_act1_v1_review/captured-input.mp4', '原始输入');
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(x => x.path.endsWith('/course_ep01_v2_publish_silent.mp4'))?.allowed, true);
  assert.equal(plan.items.find(x => x.path.endsWith('/captured-input.mp4')).allowed, false);
});

test('独立clone仅提供current视频库也能预览，拒绝未提供的legacy和额外库名', async t => {
  const f = await fixture(t);
  const store = api.createCleanupStore({ current: f.current }, f.auditRoot);
  assert.equal(oldItem(await store.preview('current', [1])).allowed, true);
  await assert.rejects(store.preview('legacy', [1]), /库/);
  assert.throws(() => api.createCleanupStore({ current: f.current, other: f.legacy }, f.auditRoot), /库/);
});

test('历史记录继续保留，但不单凭历史路径保护旧视频或展开旧依赖', async t => {
  const f = await fixture(t);
  f.index.revision_history = [{ source: 'course/old/missing.html', old_index: 'course/episodes/01-demo/v1/制作索引.json', video: output(1, 'demo', 'v1/kept.mp4') }];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', output(1, 'demo', 'v1/kept.mp4'), '明确历史引用');
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true);
  const video = plan.items.find(x => x.path.endsWith('/kept.mp4'));
  assert.equal(video.allowed, true);
  const record = path.join(f.current, 'course/episodes/01-demo/制作索引.json'), before = await readFile(record, 'utf8');
  await apply(f, plan, [video]);
  assert.equal(await readFile(record, 'utf8'), before);
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, true);
});

test('历史记录中的旧片被实际源码或其他期次读取时仍保护', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.historical_baseline = { output: old };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'course/episodes/02-other/制作索引.json', { source_materials: [{ video: old }] });
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
});

test('明确确认记录里的video和source字段不会重新变成生产输入', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.review_approval = { confirmed: true, video: old, source: old };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, true);
});

test('链接到的版本制作索引仍按制作索引解释，不把历史脚本重新作为生产根', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.version_index = 'course/episodes/01-demo/v2/制作索引.json';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', f.index.version_index, { historical_baseline: { output: old }, helper_plan: { source: 'course/old/helper.mjs' } });
  await f.put('current', 'course/old/helper.mjs', "const input='missing-archived-video.mp4';");
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, true);
});

test('开场策略保留实际视频输入，建立记录中的旧报告不封闭整期', async t => {
  const f = await fixture(t), opening = output(1, 'demo', 'v1/opening.mp4');
  await f.put('current', opening, '实际开场视频');
  f.index.opening_strategy = { video: opening, progressive_demo_record: 'course/episodes/01-demo/建立记录.json' };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'course/episodes/01-demo/建立记录.json', { first_reveal_report: 'pipeline/build/old/missing-report.json' });
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true);
  assert.equal(plan.items.find(item => item.path === opening).allowed, false);
});

test('仅元信息再次记录当前相同整片，不妨碍其按母版恢复', async t => {
  const f = await fixture(t);
  await f.put('current', f.index.review_output, '发布原片');
  f.index.audio_mix = { output: f.index.review_output };
  f.index.visual_review = { output: f.index.review_output };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  const plan = await f.store.preview('current', [1]);
  assert.equal(plan.items.find(item => item.path === f.index.review_output).allowed, true);
});

test('实际素材JSON和正式输入字段中的history不是可忽略的制作历史', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  await f.put('current', 'pipeline/library/clips.json', { history: [{ video: old }] });
  let plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  await f.put('current', 'pipeline/library/clips.json', {});
  f.index.source_materials = { history: [{ video: old }] };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
});

test('素材索引records及正式recordings集合仍按实际输入跟随', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  await f.put('current', 'pipeline/library/clips.json', { records: [{ input: old }] });
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, false);
  await f.put('current', 'pipeline/library/clips.json', { records: 'course/episodes/01-demo/data/inputs.json' });
  await f.put('current', 'course/episodes/01-demo/data/inputs.json', { input: old });
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, false);
  await f.put('current', 'pipeline/library/clips.json', {});
  f.index.source_materials = { recordings: [{ source: old }] };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  assert.equal(oldItem(await f.store.preview('current', [1])).allowed, false);
});

test('正式CSV和TXT清单中的引号视频值仍保护实际输入', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  for (const extension of ['csv', 'txt']) {
    f.index.source_materials = 'materials/clips.' + extension;
    await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
    await f.put('current', f.index.source_materials, 'video\n"' + old + '"\n');
    assert.equal(oldItem(await f.store.preview('current', [1])).allowed, false, extension);
  }
});

test('文档代码示例及缺失说明链接不封闭整期，现存素材链接仍保护', async t => {
  const f = await fixture(t), old = output(1, 'demo', 'v1/old.mp4');
  f.index.source_refs = ['course/docs/audio_mix.md'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'course/docs/audio_mix.md', '# 示例\n```bash\nffprobe "底片.mp4"\n[代码示例](' + old + ')\n```\n~~~text\nffmpeg -i "其他示例.mp4"\n~~~\n[失效文档链接](视频/after.mp4)\n');
  let plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true);
  assert.ok(!plan.warnings.some(item => item.includes('底片.mp4')));
  await f.put('current', 'course/docs/audio_mix.md', '[现存素材](' + old + ')\n');
  plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  await f.put('current', 'course/docs/audio_mix.md', '<video controls src="' + old + '"></video>\n');
  plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
});

test('通用输出构造器、新闻输出和泛化旧渲染CLI不是课程生产输入根', async t => {
  const f = await fixture(t);
  await f.put('legacy', 'build/output_paths.mjs', 'export function outputPaths(contentId){return {video:path.join(outputDir,`${contentId}.mp4`)}};');
  await f.put('current', 'build/render.mjs', 'const concatOutput=mode === "publish" ? absolute(rootDir,`pipeline/build/course_${episode}_${version}_publish_silent.mp4`) : finalOutput;');
  await f.put('legacy', 'run.sh', 'ffmpeg -i "$RENDER_DIR/out/video.mp4" "$OUT"');
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true); assert.ok(!plan.warnings.some(x => /动态/.test(x)));
});

test('缺失旧资讯登记与QC报告仅警告，当前画面源码缺失仍封闭', async t => {
  const f = await fixture(t);
  await f.put('legacy', 'pipeline/library/published.json', { output: 'pipeline/output/old-news.mp4' });
  f.index.technical_review = { report: 'course/episodes/01-demo/old-qc/report.json' };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  let plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true); assert.match(plan.warnings.join(), /缺失/);
  f.index.acts[0].visual_source = 'course/acts/ep01_demo/missing.html';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed));
});

test('迁移后的根相对路径在本库缺失时仍查另一个库并保留原片', async t => {
  const f = await fixture(t);
  f.index.opening_strategy = { source: output(1, 'legacy', 'v1/old.mp4') };
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  const plan = await f.store.preview('legacy', [1]);
  assert.equal(plan.items.find(x => x.path.endsWith('/v1/old.mp4')).allowed, false);
});

test('硬链接不计为可释放空间；跨期引用的动态源按源文件真实期次封闭', async t => {
  const f = await fixture(t);
  await fs.link(path.join(f.current, output(1, 'demo', 'v1/old.mp4')), path.join(f.current, 'course/episodes/01-demo/source-assets/linked.mp4'));
  let plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false); assert.match(oldItem(plan).reasons.join(), /硬链接/);
  await fs.unlink(path.join(f.current, 'course/episodes/01-demo/source-assets/linked.mp4'));
  f.index.acts = []; await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'course/episodes/02-other/制作索引.json', { acts: [{ visual_source: 'course/acts/ep01_demo/reused.html' }] });
  await f.put('current', 'course/acts/ep01_demo/reused.html', 'const input=`./v${version}/clip.mp4`;');
  plan = await f.store.preview('current', [1]); assert.ok(plan.items.every(x => !x.allowed));
});

test('第二个unlink失败即停止，审计在删除之前存在并准确记录已删、失败与未开始', async t => {
  const f = await fixture(t), plan = await f.store.preview('current', [1]);
  const first = oldItem(plan), second = plan.items.find(x => x.path.endsWith('/render.mp4'));
  const original = fs.unlink;
  t.after(() => { fs.unlink = original; syncBuiltinESMExports(); });
  fs.unlink = async absolute => {
    const audit = JSON.parse(await readFile(path.join(f.auditRoot, plan.id + '.audit.json'), { encoding: 'utf8' }));
    assert.equal(audit.status, 'started');
    assert.equal(audit.files.find(x => path.resolve(f.current, x.path) === absolute).status, 'deleting');
    if (absolute === path.resolve(f.current, second.path)) throw Object.assign(new Error('模拟文件被占用'), { code: 'EACCES' });
    return original(absolute);
  };
  syncBuiltinESMExports();
  await assert.rejects(apply(f, plan, [first, second]), error => {
    assert.equal(error.deletedCount, 1); assert.equal(error.deletedBytes, first.bytes); assert.match(error.message, /部分失败/); return true;
  });
  const audit = JSON.parse(await readFile(path.join(f.auditRoot, plan.id + '.audit.json'), { encoding: 'utf8' }));
  assert.equal(audit.status, 'failed'); assert.equal(audit.deletedCount, 1);
  assert.deepEqual(audit.files.map(x => x.status), ['deleted', 'failed']);
  assert.ok((await lstat(path.join(f.current, second.path))).isFile());
  await assert.rejects(apply(f, plan, [first, second]), /已执行|未完成/);
});

test('泛化辅助入口指向工具代码不把工具示例当实际输入，具体JSON输入仍跟随', async t => {
  const f = await fixture(t);
  await f.put('legacy', 'build/run-tool.mjs', "const input = 'pipeline/audio/tts.py'; const config = 'configs/reuse.json';");
  await f.put('legacy', 'pipeline/audio/tts.py', "source = 'missing-reference.wav'\n");
  await f.put('legacy', 'configs/reuse.json', { input: 'inner/' + output(1, 'demo', 'v1/old.mp4') });
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  assert.equal(plan.items.find(x => x.path.endsWith('/render.mp4')).allowed, true);
});

test('正式输入JSON里的执行记录和QC记录保留但不展开成新的生产根', async t => {
  const f = await fixture(t);
  f.index.acts[0].script = 'pipeline/01_script/01-demo/act1.json';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', f.index.acts[0].script, { text: '正文', execution_record: 'course/episodes/01-demo/配音执行记录.json' });
  await f.put('current', 'course/episodes/01-demo/配音执行记录.json', { input: 'pipeline/audio/generic.py' });
  await f.put('legacy', 'pipeline/audio/generic.py', "input = 'missing.wav'");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, true);
});

test('path.join与resolve中的动态输入参数保留静态目录范围并封闭对应期次', async t => {
  for (const method of ['join', 'resolve']) {
    const f = await fixture(t);
    await f.put('current', 'build/reuse.mjs', "const input = path." + method + "(root, 'pipeline', 'output', 'teaching', 'ep01_demo', version, 'old.mp4');");
    const plan = await f.store.preview('current', [1]);
    assert.equal(oldItem(plan).allowed, false); assert.match(plan.warnings.join(), /动态/);
  }
});

test('acts中的checks是验收记录，缺失历史截图不当作当前素材', async t => {
  const f = await fixture(t);
  f.index.acts[0].checks = 'course/episodes/01-demo/验收记录.json';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', f.index.acts[0].checks, { frames: ['missing-frame.png'] });
  const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
});

test('辅助入口实际import的外部代码继续以辅助模式检查明确MP4输入', async t => {
  const f = await fixture(t);
  await f.put('current', 'build/reuse.mjs', "import '../pipeline/helpers/reuse.mjs';");
  await f.put('current', 'pipeline/helpers/reuse.mjs', "const input = '" + output(1, 'demo', 'v1/old.mp4') + "'; const unrelated = 'missing.wav';");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  assert.equal(plan.items.find(x => x.path.endsWith('/render.mp4')).allowed, true);
});

test('全字面量path.join仅保护准确输入，不把静态路径当动态封闭整期', async t => {
  const f = await fixture(t);
  await f.put('current', 'build/reuse.mjs', "const input=path.join('pipeline','output','teaching','ep01_demo','v1','old.mp4');");
  const plan = await f.store.preview('current', [1]);
  assert.equal(oldItem(plan).allowed, false);
  assert.equal(plan.items.find(x => x.path.endsWith('/render.mp4')).allowed, true);
});

test('同一源码先被辅助扫描也不能跳过它作为当前画面输入的严格核查', async t => {
  const f = await fixture(t);
  f.index.acts[0].visual_source = 'build/current-act.mjs';
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'build/current-act.mjs', "const input = './missing-current-input.js';");
  const plan = await f.store.preview('current', [1]);
  assert.ok(plan.items.every(x => !x.allowed));
});

test('具名import和PythonPath明确输入同样不能漏过辅助依赖', async t => {
  for (const kind of ['named-import', 'python-path']) {
    const f = await fixture(t);
    if (kind === 'named-import') {
      await f.put('current', 'build/reuse.mjs', "import { clips } from '../pipeline/helpers/reuse.mjs';");
      await f.put('current', 'pipeline/helpers/reuse.mjs', "const input='" + output(1, 'demo', 'v1/old.mp4') + "';");
    } else await f.put('current', 'build/reuse.py', "input = Path(root) / 'pipeline' / 'output' / 'teaching' / 'ep01_demo' / version / 'old.mp4'");
    const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false, kind);
  }
});

test('预览后发布实际使用的二进制素材变化也拒绝执行', async t => {
  const f = await fixture(t), plan = await f.store.preview('current', [1]);
  await f.put('current', 'course/episodes/01-demo/source-assets/素材.mp4', '变化后的素材');
  await assert.rejects(apply(f, plan, [oldItem(plan)]), /变化|重新预览/);
  assert.ok((await lstat(path.join(f.current, oldItem(plan).path))).isFile());
});

test('函数参数与多行join按平衡括号解析，未知参数仍保护静态期次范围', async t => {
  for (const expression of [
    "const input=path.join(root,'pipeline','output','teaching','ep01_demo',getVersion(),'old.mp4');",
    "const input=path.join(\nroot,\n'pipeline',\n'output',\n'teaching',\n'ep01_demo',\ngetVersion(),\n'old.mp4'\n);",
    "const input=path.join(root,'pipeline','output','teaching','ep01_demo',version,'old.mp4'];"
  ]) {
    const f = await fixture(t); await f.put('current', 'build/reuse.mjs', expression);
    const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
  }
});

test('source_refs中的specs开发报告是记录叶，不展开测试和README示例', async t => {
  const f = await fixture(t);
  f.index.source_refs = ['specs/提交前检查/结果.json'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'specs/提交前检查/结果.json', { files: ['tests/fixture.test.mjs', 'README.md'] });
  await f.put('current', 'tests/fixture.test.mjs', "const input='./missing-video.mp4';");
  await f.put('current', 'README.md', '[示例](.local/example/missing.mp4)');
  const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
});

test('Windows大小写不同的引用按同一文件保护', { skip: process.platform !== 'win32' }, async t => {
  const f = await fixture(t);
  await f.put('current', 'course/acts/ep01_demo/act1.html', '<video src="../../../Pipeline/Output/Teaching/ep01_demo/v1/old.mp4"></video>');
  const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});

test('审计持续写失败仍报告已删数量和审计未完成，不能被第二个ENOSPC覆盖', async t => {
  const f = await fixture(t), plan = await f.store.preview('current', [1]);
  const originalUnlink = fs.unlink, originalOpen = fs.open; let deleted = false;
  t.after(() => { fs.unlink = originalUnlink; fs.open = originalOpen; syncBuiltinESMExports(); });
  fs.unlink = async absolute => { await originalUnlink(absolute); deleted = true; };
  fs.open = async (...args) => { if (deleted) throw Object.assign(new Error('模拟审计盘满'), { code: 'ENOSPC' }); return originalOpen(...args); };
  syncBuiltinESMExports();
  await assert.rejects(apply(f, plan, [oldItem(plan)]), error => {
    assert.equal(error.deletedCount, 1); assert.equal(error.deletedBytes, oldItem(plan).bytes);
    assert.equal(error.auditPersisted, false); assert.ok(error.auditPath); assert.match(error.message, /审计.*失败|审计.*未完成/); return true;
  });
});

test('工作台仅意见JSON作为依赖根，审计目录及预览计划不会反过来保护候选', async t => {
  const f = await fixture(t);
  await f.put('current', '.local/video-workbench/非意见缓存.json', { path: output(1, 'demo', 'v1/old.mp4') });
  const store = api.createCleanupStore(f.libraries, path.join(f.current, '.local/video-workbench/cleanup-records'));
  const plan = await store.preview('current', [1]); assert.equal(oldItem(plan).allowed, true);
  const result = await store.apply('current', { planId: plan.id, fileIds: [oldItem(plan).id], confirmation: '清理历史版本' });
  assert.equal(result.deletedCount, 1);
});

test('当前实际源码或正式JSON即使位于specs也必须展开依赖闭包', async t => {
  for (const kind of ['html', 'import', 'json']) {
    const f = await fixture(t);
    if (kind === 'html') {
      f.index.acts[0].visual_source = 'specs/demo.html';
      await f.put('current', 'specs/demo.html', '<video src="../' + output(1, 'demo', 'v1/old.mp4') + '"></video>');
    } else if (kind === 'import') {
      await f.put('current', 'course/acts/ep01_demo/act1.html', '<script src="../../../specs/helper.mjs"></script>');
      await f.put('current', 'specs/helper.mjs', "const input='../" + output(1, 'demo', 'v1/old.mp4') + "';");
    } else {
      f.index.acts[0].script = 'specs/formal.json';
      await f.put('current', 'specs/formal.json', { asset: output(1, 'demo', 'v1/old.mp4') });
    }
    await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
    const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false, kind);
  }
});

test('source_refs中的实际素材JSON不因位于specs而当成开发报告', async t => {
  const f = await fixture(t);
  f.index.source_refs = ['specs/素材输入.json'];
  await f.put('current', 'course/episodes/01-demo/制作索引.json', f.index);
  await f.put('current', 'specs/素材输入.json', { asset: output(1, 'demo', 'v1/old.mp4') });
  const plan = await f.store.preview('current', [1]); assert.equal(oldItem(plan).allowed, false);
});
