import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
let api;
try { api = await import('../../workbench/server.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
async function setup(t) {
  assert.equal(typeof api?.createWorkbenchServer, 'function', '缺少独立本地服务');
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-http-'));
  await mkdir(path.join(root, 'course'), { recursive: true });
  await writeFile(path.join(root, 'course/episodes.json'), JSON.stringify({ episodes: [{ ep: 1, topic: '测试', slug: 'demo', version: 'v1', active_preview: 'video.mp4' }] }), 'utf8');
  await writeFile(path.join(root, 'video.mp4'), '0123456789', 'utf8');
  const server = api.createWorkbenchServer({ root });
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
