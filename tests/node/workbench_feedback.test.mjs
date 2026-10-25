import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let api;
try { api = await import('../../workbench/feedback-store.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
async function setup(t) {
  assert.equal(typeof api?.createFeedbackStore, 'function', '缺少本地意见持久化入口');
  const root = await mkdtemp(path.join(os.tmpdir(), 'workbench-feedback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const media = { id: 'movie', path: 'video.mp4', version: 'v2', scope: 'full', sha256: 'a'.repeat(64), duration: 10, spec: { duration: 10 } };
  const resolveMedia = async () => media;
  return { root, media, store: api.createFeedbackStore(root, resolveMedia), resolveMedia };
}
const input = { mediaId: 'movie', sha256: 'a'.repeat(64), start: 1.25, end: 3.5, text: '这段需要联动', requestId: 'request-one' };

test('时间范围意见重启后保留，重复提交不产生第二条', async t => {
  const f = await setup(t), item = await f.store.create(1, input);
  assert.equal(item.start, 1.25); assert.equal(item.status, '待处理');
  assert.equal((await f.store.create(1, input)).id, item.id);
  const restarted = api.createFeedbackStore(f.root, f.resolveMedia);
  assert.equal((await restarted.list(1)).length, 1);
  assert.equal((await restarted.list(2)).length, 0);
  const raw = await readFile(path.join(f.root, '.local/video-workbench/1/feedback.json'), 'utf8');
  assert.ok(raw.includes('这段需要联动'));
});

test('负数、倒置区间、超长时间和媒体变化拒绝保存', async t => {
  const f = await setup(t);
  for (const patch of [{ start: -1 }, { end: 0 }, { start: 11, end: null }, { text: '' }, { sha256: 'b'.repeat(64) }]) {
    await assert.rejects(f.store.create(1, { ...input, ...patch }), /时间|意见|视频|变化/);
  }
  assert.equal((await f.store.list(1)).length, 0);
});

test('两个页面同时编辑不会互相覆盖，解决状态不改媒体归属', async t => {
  const f = await setup(t), item = await f.store.create(1, input);
  const updated = await f.store.update(1, item.id, { revision: 1, status: '待复核', resolution: '已另存v3' });
  assert.equal(updated.revision, 2); assert.equal(updated.sha256, input.sha256);
  await assert.rejects(f.store.update(1, item.id, { revision: 1, text: '旧页面覆盖' }), /已被修改/);
  await assert.rejects(f.store.remove(1, item.id, 1), /已被修改/);
  await f.store.remove(1, item.id, 2); assert.equal((await f.store.list(1)).length, 0);
});

test('相同起止时间可直接保存为这一秒，仍拒绝倒置区间', async t => {
  const f = await setup(t);
  const item = await f.store.create(1, { ...input, start: 2, end: 2 });
  assert.equal(item.start, 2); assert.equal(item.end, 2);
  const updated = await f.store.update(1, item.id, { revision: 1, end: 5 });
  assert.equal(updated.end, 5);
  await assert.rejects(f.store.update(1, item.id, { revision: 2, end: 1 }), /时间/);
});
