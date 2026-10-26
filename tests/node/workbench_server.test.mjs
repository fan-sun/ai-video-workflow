import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { lstat } from 'node:fs/promises';
let api;
try { api = await import('../../workbench/server.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
async function setup(t, options = {}) {
  assert.equal(typeof api?.createWorkbenchServer, 'function', '缺少独立本地服务');
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-http-'));
  await mkdir(path.join(root, 'course'), { recursive: true });
  await writeFile(path.join(root, 'course/episodes.json'), JSON.stringify({ episodes: [{ ep: 1, topic: '测试', slug: 'demo', version: 'v1', active_preview: 'video.mp4' }] }), 'utf8');
  await writeFile(path.join(root, 'video.mp4'), '0123456789', 'utf8');
  const server = api.createWorkbenchServer({ root, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${server.address().port}`, root };
}
test('独立根目录提供总览与详情，不需要父目录看板', async t => {
  const f = await setup(t);
  const r = await fetch(f.base + '/api/workbench/episodes'); assert.equal(r.status, 200);
  assert.equal((await r.json()).episodes[0].topic, '测试');
  assert.equal((await fetch(f.base + '/api/workbench/episodes/1')).status, 200);
  assert.equal((await fetch(f.base + '/api/workbench/episodes/999')).status, 404);
});

test('五千个清理文件ID可送达计划核验，意见接口仍限制请求大小', async t => {
  const f = await setup(t);
  const input = { planId: '00000000-0000-0000-0000-000000000000', fileIds: Array.from({ length: 5500 }, (_, i) => String(i).padStart(24, '0')), confirmation: '清理历史版本' };
  const body = JSON.stringify(input); assert.ok(Buffer.byteLength(body) > 100000);
  const result = await fetch(f.base + '/api/workbench/cleanup/apply', { method: 'POST', body });
  assert.equal(result.status, 409); assert.match((await result.json()).error, /计划不存在/);
  const note = await fetch(f.base + '/api/workbench/episodes/1/feedback', { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(150000) }) });
  assert.equal(note.status, 413);
  assert.equal(await readFile(path.join(f.root, 'video.mp4'), { encoding: 'utf8' }), '0123456789');
});

test('重复整片清理后仍可按母版播放，恢复接口只接受本期文件ID且拒绝跨来源', async t => {
  const f = await setup(t), prefix = 'pipeline/output/vibe/ep01_demo/v1/';
  const review = prefix + 'review.mp4', publish = prefix + 'publish.mp4';
  await mkdir(path.join(f.root, prefix), { recursive: true });
  await mkdir(path.join(f.root, 'course/episodes/01-demo'), { recursive: true });
  const index = { episode: 'ep01', slug: 'demo', route: 'vibe', current_version: 'v1', review_output: review, publish_output: publish, acts: [] };
  await writeFile(path.join(f.root, 'course/episodes.json'), JSON.stringify({ episodes: [{ ep: 1, slug: 'demo', publish_status: '已发布', output: publish }] }), 'utf8');
  await writeFile(path.join(f.root, 'course/episodes/01-demo/制作索引.json'), JSON.stringify(index), 'utf8');
  for (const file of [review, publish]) await writeFile(path.join(f.root, file), 'same-final-content', 'utf8');
  const base = f.base + '/api/workbench/libraries/current/';
  const post = data => ({ method: 'POST', body: JSON.stringify(data) });
  const plan = await (await fetch(base + 'cleanup/preview', post({ episodes: [1] }))).json();
  const copy = plan.items.find(item => item.path === review);
  assert.equal(copy.allowed, true);
  assert.equal((await fetch(base + 'cleanup/apply', post({ planId: plan.id, fileIds: [copy.id], confirmation: '清理历史版本' }))).status, 200);
  const detail = await (await fetch(base + 'episodes/1')).json();
  const item = detail.media.find(value => value.id === detail.currentMediaId);
  assert.equal(item.archived, true);
  assert.equal(await (await fetch(base + 'episodes/1/file/' + item.id)).text(), 'same-final-content');
  const restore = base + 'episodes/1/restore-media/' + item.id;
  assert.equal((await fetch(restore, { ...post({}), headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(restore, post({ path: review }))).status, 400);
  await assert.rejects(lstat(path.join(f.root, review)), { code: 'ENOENT' });
  assert.equal((await fetch(restore, post({}))).status, 200);
  assert.equal(await readFile(path.join(f.root, review), 'utf8'), 'same-final-content');
  assert.equal(await readFile(path.join(f.root, publish), 'utf8'), 'same-final-content');
});
test('媒体Range与HEAD支持定位，未知文件标识无法读取项目外文件', async t => {
  const f = await setup(t), d = await (await fetch(f.base + '/api/workbench/episodes/1')).json();
  const url = f.base + `/api/workbench/episodes/1/file/${d.currentMediaId}`;
  let r = await fetch(url, { headers: { Range: 'bytes=3-5' } });
  assert.equal(r.status, 206); assert.equal(await r.text(), '345');
  r = await fetch(url, { method: 'HEAD' }); assert.equal(r.headers.get('content-length'), '10');
  r = await fetch(url, { headers: { Range: 'bytes=30-' } }); assert.equal(r.status, 416);
  assert.equal((await fetch(f.base + '/api/workbench/episodes/1/file/unknown')).status, 404);
});
test('跨来源修改被拒绝，不接受任意生产字段修改', async t => {
  const f = await setup(t);
  const r = await fetch(f.base + '/api/workbench/episodes/1/feedback', { method: 'POST', headers: { origin: 'https://example.com', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
  assert.equal((await fetch(f.base + '/api/workbench/episodes/1', { method: 'PATCH', body: JSON.stringify({ review_approval: true }) })).status, 400);
});

test('本地工作台拒绝伪造外站Host，即使Origin与伪造Host相同', async t => {
  const f = await setup(t);
  const status = await new Promise((resolve, reject) => {
    const req = request(f.base + '/api/workbench/libraries/current/cleanup/preview', { method: 'POST', headers: { host: 'example.com', origin: 'http://example.com', 'content-type': 'application/json' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    req.on('error', reject); req.end(JSON.stringify({ episodes: [1] }));
  });
  assert.equal(status, 403);
});

test('主页状态可保存并在服务重建后恢复，其他制作字段不变', async t => {
  const f = await setup(t), url = f.base + '/api/workbench/episodes/1';
  let r = await fetch(url, { method: 'PATCH', body: JSON.stringify({ status: '待发布', expectedStatus: '制作中' }) });
  assert.equal(r.status, 200); assert.equal((await r.json()).status, '待发布');
  assert.equal((await (await fetch(url)).json()).status, '待发布');
  r = await fetch(url, { method: 'PATCH', body: JSON.stringify({ status: '已发布', expectedStatus: '待发布' }) });
  assert.equal(r.status, 200);
  r = await fetch(url, { method: 'PATCH', body: JSON.stringify({ status: '制作中', expectedStatus: '待发布' }) });
  assert.equal(r.status, 409);
  const { createWorkbenchStore } = await import('../../workbench/store.mjs');
  const d = await createWorkbenchStore(f.root).detail(1);
  assert.equal(d.status, '已发布'); assert.equal(d.media[0].path, 'video.mp4');
  r = await fetch(url, { method: 'PATCH', body: JSON.stringify({ status: '制作中', expectedStatus: '已发布' }) });
  assert.equal(r.status, 200); assert.equal((await (await fetch(url)).json()).status, '制作中');
});

test('播放器请求绑定实际指纹，同路径视频替换后拒绝继续读取新字节', async t => {
  const f = await setup(t), d = await (await fetch(f.base + '/api/workbench/episodes/1')).json();
  const hash = createHash('sha256').update('0123456789').digest('hex');
  const url = f.base + `/api/workbench/episodes/1/file/${d.currentMediaId}?sha256=${hash}`;
  assert.equal((await fetch(url, { headers: { Range: 'bytes=0-3' } })).status, 206);
  await writeFile(path.join(f.root, 'video.mp4'), 'replacement-video', 'utf8');
  assert.equal((await fetch(url, { headers: { Range: 'bytes=0-3' } })).status, 409);
});

test('点击发布文件夹只打开本期登记目录，拒绝跨来源、任意路径和缺失版本', async t => {
  const opened = [], f = await setup(t, { openFolder: async directory => opened.push(directory) });
  const release = 'pipeline/output/teaching/ep01_demo/v2/publish.mp4';
  await mkdir(path.join(f.root, path.dirname(release)), { recursive: true });
  await writeFile(path.join(f.root, release), 'release', 'utf8');
  await mkdir(path.join(f.root, 'course/episodes/01-demo'), { recursive: true });
  await writeFile(path.join(f.root, 'course/episodes/01-demo/制作索引.json'), JSON.stringify({ current_version: 'v2', publish_output: release }), 'utf8');
  const before = await readFile(path.join(f.root, 'course/episodes.json'), 'utf8');
  const url = f.base + '/api/workbench/episodes/1/open-release-folder';
  const post = input => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  let r = await fetch(url, post({}));
  assert.equal(r.status, 200); assert.equal((await r.json()).path, path.posix.dirname(release));
  assert.equal(opened.length, 1); assert.equal(opened[0], path.dirname(path.join(f.root, release)));
  assert.equal((await fetch(url)).status, 404);
  assert.equal((await fetch(url, post({ path: '../other' }))).status, 400);
  assert.equal((await fetch(url, { ...post({}), headers: { 'content-type': 'application/json', origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(f.base + '/api/workbench/episodes/999/open-release-folder', post({}))).status, 404);
  await rm(path.join(f.root, release));
  assert.equal((await fetch(url, post({}))).status, 404);
  assert.equal(opened.length, 1);
  assert.equal(await readFile(path.join(f.root, 'course/episodes.json'), 'utf8'), before);
});

test('相同期号与媒体ID在两个库中隔离，旧地址仍指向当前库', async t => {
  const legacyRoot = await mkdtemp(path.join(os.tmpdir(), 'workbench-legacy-'));
  t.after(() => rm(legacyRoot, { recursive: true, force: true }));
  await mkdir(path.join(legacyRoot, 'course'), { recursive: true });
  await writeFile(path.join(legacyRoot, 'course/episodes.json'), JSON.stringify({ episodes: [{ ep: 1, slug: 'demo', topic: '历史库课程', active_preview: 'video.mp4' }] }), 'utf8');
  await writeFile(path.join(legacyRoot, 'video.mp4'), 'legacy-video', 'utf8');
  const f = await setup(t, { legacyRoot });
  const libraries = await (await fetch(f.base + '/api/workbench/libraries')).json();
  assert.deepEqual(libraries.libraries.map(x => x.id), ['current', 'legacy']);
  const current = await (await fetch(f.base + '/api/workbench/libraries/current/episodes/1')).json();
  const legacy = await (await fetch(f.base + '/api/workbench/libraries/legacy/episodes/1')).json();
  assert.equal(current.topic, '测试'); assert.equal(legacy.topic, '历史库课程');
  assert.equal(current.library, 'current'); assert.equal(legacy.library, 'legacy');
  assert.equal(current.currentMediaId, legacy.currentMediaId);
  const file = '/episodes/1/file/' + current.currentMediaId;
  assert.equal(await (await fetch(f.base + '/api/workbench/libraries/current' + file)).text(), '0123456789');
  assert.equal(await (await fetch(f.base + '/api/workbench/libraries/legacy' + file)).text(), 'legacy-video');
  assert.equal((await (await fetch(f.base + '/api/workbench/episodes/1')).json()).topic, '测试');
  assert.equal((await fetch(f.base + '/api/workbench/libraries/unknown/episodes')).status, 404);
  for (const [root, text] of [[f.root, '当前意见'], [legacyRoot, '历史意见']]) {
    await mkdir(path.join(root, '.local/video-workbench/1'), { recursive: true });
    await writeFile(path.join(root, '.local/video-workbench/1/feedback.json'), JSON.stringify({ items: [{ id: 'same', text }] }), 'utf8');
  }
  const notes = library => fetch(f.base + '/api/workbench/libraries/' + library + '/episodes/1/feedback').then(r => r.json());
  assert.equal((await notes('current')).items[0].text, '当前意见');
  assert.equal((await notes('legacy')).items[0].text, '历史意见');
  const before = await readFile(path.join(f.root, 'course/episodes.json'), 'utf8');
  const changed = await fetch(f.base + '/api/workbench/libraries/legacy/episodes/1', { method: 'PATCH', body: JSON.stringify({ status: '已发布' }) });
  assert.equal(changed.status, 200);
  assert.equal(await readFile(path.join(f.root, 'course/episodes.json'), 'utf8'), before);
});

test('清理HTTP入口从服务端计划选择准确文件，确认与跨来源检查先于删除', async t => {
  const f = await setup(t, { legacyRoot: null });
  const directory = 'pipeline/output/course/ep01_demo';
  const publish = directory + '/v2/publish.mp4', review = directory + '/v2/review.mp4', old = directory + '/v1/old.mp4';
  for (const name of [publish, review, old]) { await mkdir(path.dirname(path.join(f.root, name)), { recursive: true }); await writeFile(path.join(f.root, name), name, 'utf8'); }
  await mkdir(path.join(f.root, 'course/episodes/01-demo'), { recursive: true });
  const index = JSON.stringify({ current_version: 'v2', publish_output: publish, review_output: review, acts: [] });
  await writeFile(path.join(f.root, 'course/episodes/01-demo/制作索引.json'), index, 'utf8');
  await writeFile(path.join(f.root, 'course/episodes.json'), JSON.stringify({ episodes: [{ ep: 1, slug: 'demo', topic: '测试', publish_status: '已发布', output: publish }] }), 'utf8');
  const base = f.base + '/api/workbench/libraries/current/cleanup/';
  const post = input => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  let r = await fetch(base + 'preview', post({ episodes: [1] })); assert.equal(r.status, 200);
  const plan = await r.json(), candidate = plan.items.find(item => item.path === old);
  assert.equal(candidate.allowed, true); assert.equal(plan.items.find(item => item.path === publish).allowed, false);
  const selection = { planId: plan.id, fileIds: [candidate.id], confirmation: '清理历史版本' };
  assert.equal((await fetch(base + 'apply', post({ ...selection, confirmation: '' }))).status, 400);
  assert.equal((await fetch(base + 'apply', { ...post(selection), headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal(await readFile(path.join(f.root, old), 'utf8'), old);
  r = await fetch(base + 'apply', post(selection)); assert.equal(r.status, 200);
  assert.equal((await r.json()).deletedCount, 1);
  await assert.rejects(() => readFile(path.join(f.root, old), 'utf8'), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(f.root, publish), 'utf8'), publish);
  assert.equal(await readFile(path.join(f.root, review), 'utf8'), review);
  assert.equal(await readFile(path.join(f.root, 'course/episodes/01-demo/制作索引.json'), 'utf8'), index);
});
