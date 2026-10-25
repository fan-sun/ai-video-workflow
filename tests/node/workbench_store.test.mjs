import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

let api;
try { api = await import('../../workbench/store.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }

export async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'video-workbench-'));
  const put = async (name, data) => {
    const p = path.join(root, name); await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, typeof data === 'string' ? data : JSON.stringify(data), 'utf8');
  };
  const index = {
    episode: 'ep01', slug: 'demo', route: 'course', current_version: 'v2',
    script: 'course/scripts/demo.md', visual_plan: 'course/episodes/01-demo/plan.md',
    timeline_summary: 'course/episodes/01-demo/timeline.json',
    review_output: 'pipeline/output/teaching/ep01_demo/v2/review.mp4',
    review_approval: { confirmed: true, version: 'v1', sha256: 'old' },
    acts: Array.from({ length: 6 }, (_, i) => ({ act: i + 1, timings: `timings/${i + 1}.json` }))
  };
  await put('course/episodes.json', { episodes: [
    { ep: 1, slug: 'demo', topic: '测试课程', route: 'course', version: 'v2', status: '第二幕待审片', active_preview: index.review_output },
    { ep: 2, slug: 'vibe', topic: '无旁白示例', route: 'vibe', status: '制作中' },
    { ep: 3, slug: 'broken', topic: '缺资料示例', status: '制作中' }
  ] });
  await put('course/episodes/01-demo/制作索引.json', index);
  await put(index.review_output, '0123456789');
  await put('pipeline/output/teaching/ep01_demo/v1/review.mp4', 'old');
  await put(index.script, '# 测试课程\n\n正文。');
  await put(index.visual_plan, '| 幕/旁白ID | 正式语音秒数 | 预期可见变化 |\n|---|---|---|\n| 1/g01 | 0.000–2.000 | 杯子落到手中 |');
  await put(index.timeline_summary, { total_s: 12, acts: index.acts.map((a, i) => ({ act: a.act, start_s: i * 2, end_s: i * 2 + 2, duration_s: 2 })) });
  for (const a of index.acts) await put(a.timings, { phrases: [{ id: 'g01', text: `第${a.act}幕`, start: 0, end: 2 }] });
  await put('course/episodes/02-vibe/制作索引.json', { route: 'vibe', current_version: 'v1', timeline_summary: 'course/episodes/02-vibe/timeline.json', review_output: 'pipeline/output/vibe/ep02_vibe/v1/review.mp4', acts: [{ act: 1 }] });
  await put('course/episodes/02-vibe/timeline.json', { total_s: 5, acts: [{ act: 1, start_s: 0, end_s: 5 }], captions: [{ id: 'c01', act: 1, start: 1, end: 3, text: '字幕原文' }] });
  await put('pipeline/output/vibe/ep02_vibe/v1/review.mp4', 'vibe');
  await put('course/episodes/03-broken/制作索引.json', '{broken');
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, put, index };
}

test('独立内层根目录可读取两条路线和六幕，破损索引不阻断列表', async t => {
  assert.equal(typeof api?.createWorkbenchStore, 'function', '缺少独立工作台数据入口');
  const f = await fixture(t), store = api.createWorkbenchStore(f.root);
  const list = await store.list();
  assert.equal(list.episodes.length, 3);
  const d = await store.detail(1);
  assert.equal(d.route, 'teaching'); assert.equal(d.acts.length, 6);
  assert.equal(d.media.find(m => m.id === d.currentMediaId).path, f.index.review_output);
  assert.ok((await store.detail(3)).warnings.some(x => /索引/.test(x)));
  assert.equal((await store.detail(2)).acts[0].audio, '不适用');
});

test('当前文件缺失不静默换成旧版，浏览不会修改源台账', async t => {
  assert.ok(api, '数据入口尚未实现');
  const f = await fixture(t), before = await readFile(path.join(f.root, 'course/episodes.json'), 'utf8');
  await rm(path.join(f.root, f.index.review_output));
  const d = await api.createWorkbenchStore(f.root).detail(1);
  assert.equal(d.media.find(m => m.id === d.currentMediaId).exists, false);
  assert.ok(d.media.some(m => m.version === 'v1' && m.exists));
  assert.equal(await readFile(path.join(f.root, 'course/episodes.json'), 'utf8'), before);
});

test('旧确认不自动覆盖新文件，字符串true不冒充用户确认', async t => {
  assert.ok(api, '数据入口尚未实现');
  const f = await fixture(t), store = api.createWorkbenchStore(f.root);
  let d = await store.detail(1);
  let m = await store.mediaDetail(1, d.currentMediaId);
  assert.notEqual(m.approval.state, 'verified');
  f.index.review_approval = { confirmed: 'true', version: 'v2' };
  await f.put('course/episodes/01-demo/制作索引.json', f.index);
  d = await store.detail(1); m = await store.mediaDetail(1, d.currentMediaId);
  assert.notEqual(m.approval.state, 'verified');
});

test('教学时间按幕累计，Vibe保留无字幕间隔，旧候选不套当前稿', async t => {
  assert.ok(api, '数据入口尚未实现');
  const f = await fixture(t), store = api.createWorkbenchStore(f.root, { probeMedia: async file => ({ duration: file.absolute.includes('vibe') ? 5 : 12 }) });
  let d = await store.detail(1), m = await store.mediaDetail(1, d.currentMediaId);
  assert.equal(m.cues.find(x => x.act === 2).start, 2);
  assert.equal(m.cues[0].plan, '杯子落到手中');
  const old = d.media.find(x => x.version === 'v1');
  assert.equal((await store.mediaDetail(1, old.id)).cues.length, 0);
  d = await store.detail(2); m = await store.mediaDetail(2, d.currentMediaId);
  assert.equal(m.cues[0].start, 1); assert.equal(m.cues[0].text, '字幕原文');
});

test('同一已确认文件的预览标签不同仍按指纹确认，当前发布文件保留发布属性', async t => {
  const f = await fixture(t);
  f.index.review_approval = { confirmed: true, version: 'v2', file: f.index.review_output, sha256: createHash('sha256').update('0123456789').digest('hex') };
  await f.put('course/episodes/01-demo/制作索引.json', f.index);
  const ledger = JSON.parse(await readFile(path.join(f.root, 'course/episodes.json'), 'utf8'));
  ledger.episodes[0].active_preview_version = 'v2-preview';
  await f.put('course/episodes.json', ledger);
  const store = api.createWorkbenchStore(f.root), d = await store.detail(1);
  assert.equal((await store.mediaDetail(1, d.currentMediaId)).approval.state, 'verified');
  f.index.publish_output = f.index.review_output;
  f.index.cover_embed = { enabled: true };
  await f.put('course/episodes/01-demo/制作索引.json', f.index);
  // 夹具不是有效MP4，发布片头偏移无法核实，不应继续套用正文时间。
  assert.equal((await store.mediaDetail(1, d.currentMediaId)).cues.length, 0);
});

test('分镜总索引里的本期子文档可查看，不接受父项目链接', async t => {
  const f = await fixture(t);
  await f.put(f.index.visual_plan, '[第一幕](part/act1.md)\n[外部](../../../../../../private.md)');
  await f.put('course/episodes/01-demo/part/act1.md', '# 第一幕分镜');
  const store = api.createWorkbenchStore(f.root), d = await store.detail(1), m = await store.mediaDetail(1, d.currentMediaId);
  assert.equal(m.relatedPlans.length, 1);
  assert.equal(m.relatedPlans[0].path, 'course/episodes/01-demo/part/act1.md');
  assert.equal((await store.asset(1, m.relatedPlans[0].id)).exists, true);
});

test('扫描到的幕间衔接和中文局部预览不能误标成整片或整幕', async t => {
  const f = await fixture(t);
  await f.put('pipeline/output/teaching/ep01_demo/v1/course_ep01_join_1-2_v1_review.mp4', 'join');
  await f.put('pipeline/output/teaching/ep01_demo/act2-v1/指令段重做预览_18至36秒.mp4', 'clip');
  const d = await api.createWorkbenchStore(f.root).detail(1);
  assert.equal(d.media.find(m => m.path.includes('join_')).scope, 'clip');
  assert.equal(d.media.find(m => m.path.includes('18至36秒')).scope, 'clip');
  assert.equal(d.media.find(m => m.path.endsWith('v1/review.mp4')).scope, 'unknown');
});

test('已知文件指纹或实际时长不符时关闭旧时间映射，仍保留全文', async t => {
  const f = await fixture(t);
  f.index.review_approval = { confirmed: true, version: 'v2', file: f.index.review_output, sha256: 'old-hash' };
  await f.put('course/episodes/01-demo/制作索引.json', f.index);
  let store = api.createWorkbenchStore(f.root), d = await store.detail(1), m = await store.mediaDetail(1, d.currentMediaId);
  assert.equal(m.approval.state, 'mismatch');
  assert.equal(m.cues.length, 0); assert.equal(m.chapters.length, 0); assert.ok(m.materials.script.exists);
  f.index.review_approval = null; await f.put('course/episodes/01-demo/制作索引.json', f.index);
  store = api.createWorkbenchStore(f.root, { probeMedia: async () => ({ duration: 5 }) });
  d = await store.detail(1); m = await store.mediaDetail(1, d.currentMediaId);
  assert.equal(m.cues.length, 0); assert.equal(m.chapters.length, 0); assert.match(m.mappingNote, /时长/);
});

test('当前预览指向正式分幕时，从索引补入范围与独立时钟', async t => {
  const f = await fixture(t), movie = 'pipeline/output/teaching/ep01_demo/v2/act2.mp4';
  f.index.acts[1].review_output = movie;
  await f.put(movie, 'act-two'); await f.put('course/episodes/01-demo/制作索引.json', f.index);
  const ledger = JSON.parse(await readFile(path.join(f.root, 'course/episodes.json'), 'utf8'));
  ledger.episodes[0].active_preview = movie; await f.put('course/episodes.json', ledger);
  const store = api.createWorkbenchStore(f.root, { probeMedia: async () => ({ duration: 2 }) });
  const d = await store.detail(1), m = await store.mediaDetail(1, d.currentMediaId);
  assert.equal(m.scope, 'act'); assert.equal(m.cues[0].start, 0); assert.equal(m.cues[0].act, 2);
});
