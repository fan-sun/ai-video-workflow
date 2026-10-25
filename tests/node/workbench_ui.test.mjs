import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
let api;
try { api = await import('../../workbench/public/utils.mjs'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
test('审片默认只显示分秒，仍兼容历史毫秒数据', () => {
  assert.equal(typeof api?.parseTime, 'function', '缺少审片时间处理');
  assert.equal(api.parseTime('01:13.250'), 73.25);
  assert.equal(api.parseTime('1:02:03.125'), 3723.125);
  assert.equal(api.formatTime(73.25), '01:13');
  assert.equal(api.formatTime(73.25, true), '01:13.250');
  for (const value of ['01:99', '-1', 'NaN', 'abc', '']) assert.throws(() => api.parseTime(value), /时间/);
});
test('复制交接包含原始版本、文件、时间与意见ID', () => {
  assert.ok(api, '缺少清单处理');
  const text = api.feedbackText({ ep: 7, topic: '测试' }, [{ id: 'abc', version: 'v2', scope: 'act', act: 2, path: 'demo.mp4', sha256: 'hash', start: 73.25, end: 75, text: '保持联动', status: '待处理' }]);
  for (const value of ['第07期', 'v2', 'demo.mp4', '01:13—01:15', 'abc', '保持联动']) assert.ok(text.includes(value));
});

test('起止相同的意见清单只显示单个时间，点击回放这一秒', async () => {
  const note = { id: 'n', mediaId: 'A', sha256: 'A', start: 3, end: 3, text: '这一秒', version: 'v1', scope: 'full', status: '待处理' };
  const text = api.feedbackText({ ep: 1, topic: '测试' }, [note]);
  assert.ok(text.includes('00:03｜')); assert.ok(!text.includes('00:03—00:03'));
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('async function jumpNote('), code.indexOf('async function copyText('));
  const state = { detail: { ep: 1, media: [{ id: 'A', exists: true }] }, notes: [note], media: { id: 'A', sha256: 'A', duration: 10 }, pageSerial: 1, mediaSerial: 1 };
  const seeks = [];
  const jump = vm.runInNewContext(source + '\njumpNote', { state, canLeave: () => true, epUrl: () => 'episodes/1', api: async () => ({ sha256: 'A' }), seek: (...args) => seeks.push(args), film: { scrollIntoView() {} } });
  await jump('n'); assert.deepEqual(seeks, [[3, 4]]);
});

test('旧保存结束只能清理原编辑会话，不能删除新页面草稿或关闭新编辑器', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const saveSource = code.slice(code.indexOf('async function saveNote('), code.indexOf('async function jumpNote('));
  const fields = {
    'save-note': { disabled: false }, 'note-start': { value: '00:01' }, 'note-end': { value: '00:01' },
    'note-text': { value: 'A意见' }, 'note-resolution': { value: '' }, 'save-state': { textContent: '' }, 'note-editor': { hidden: false }
  };
  const state = { detail: { ep: 1 }, target: { id: 'A', sha256: 'A' }, edit: null, requestId: 'A', editorSession: 1, pageSerial: 1 };
  const removed = []; let finish;
  const context = { state, $: id => fields[id], parseTime: api.parseTime, epUrl: () => `episodes/${state.detail.ep}`, draftKey: () => `draft:${state.detail.ep}:${state.target.id}`, api: () => new Promise(resolve => { finish = resolve; }), localStorage: { getItem: () => 'original draft', removeItem: key => removed.push(key) }, loadNotes: async () => {}, notice: () => {} };
  const save = vm.runInNewContext(saveSource + '\nsaveNote', context);
  const pending = save({ preventDefault() {} });
  state.detail = { ep: 2 }; state.target = { id: 'B' }; state.editorSession = 2; state.pageSerial = 2;
  fields['note-text'].value = 'B未保存意见'; fields['note-editor'].hidden = false;
  finish({}); await pending;
  assert.deepEqual(removed, ['draft:1:A']);
  assert.equal(fields['note-editor'].hidden, false);
  assert.equal(fields['note-text'].value, 'B未保存意见');
});

test('同视频保存期间的新草稿和继续输入的文字均不被清除', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('async function saveNote('), code.indexOf('async function jumpNote('));
  for (const newSession of [false, true]) {
    const fields = { 'save-note': { disabled: false }, 'note-start': { value: '00:01' }, 'note-end': { value: '00:01' }, 'note-text': { value: 'A' }, 'note-resolution': { value: '' }, 'save-state': {}, 'note-editor': { hidden: false }, 'editor-title': {} };
    const state = { detail: { ep: 1 }, target: { id: 'A', sha256: 'A' }, edit: null, editorSession: 1, pageSerial: 1 };
    let draft = 'A', finish; const removed = [];
    const context = { state, $: id => fields[id], parseTime: api.parseTime, draftKey: () => 'same-media', api: () => new Promise(resolve => { finish = resolve; }), localStorage: { getItem: () => draft, removeItem: k => { removed.push(k); draft = null; } }, loadNotes: async () => {}, persistDraft: () => {}, notice: () => {} };
    const save = vm.runInNewContext(source + '\nsaveNote', context), pending = save({ preventDefault() {} });
    fields['note-text'].value = 'B'; draft = 'B'; if (newSession) state.editorSession++;
    finish({ id: 'saved-A', revision: 1 }); await pending;
    assert.equal(removed.length, 0); assert.equal(fields['note-editor'].hidden, false); assert.equal(fields['note-text'].value, 'B');
  }
});

test('意见定位核验返回后若已切期，不再清空新播放器', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('async function jumpNote('), code.indexOf('async function copyText('));
  const state = { detail: { ep: 1, media: [{ id: 'A', exists: true }] }, notes: [{ id: 'n', mediaId: 'A', sha256: 'A', start: 1 }], media: { id: 'B', sha256: 'B' }, pageSerial: 1, mediaSerial: 1 };
  let finish; const loads = [];
  const context = { state, canLeave: () => true, epUrl: () => `episodes/${state.detail.ep}`, api: () => new Promise(resolve => { finish = resolve; }), $: () => ({}), renderMediaSelect: () => {}, loadMedia: async id => loads.push(id), seek: () => {}, film: { scrollIntoView() {} } };
  const jump = vm.runInNewContext(source + '\njumpNote', context), pending = jump('n');
  state.detail = { ep: 2 }; state.pageSerial++; state.mediaSerial++;
  finish({ sha256: 'A' }); await pending.catch(() => {});
  assert.deepEqual(loads, []);
});
