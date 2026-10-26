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

test('两个库的同一期同指纹草稿不会混用，当前库兼容已有草稿键', () => {
  assert.equal(api.draftStorageKey('current', 1, 'same'), 'video-workbench:draft:1:same');
  assert.notEqual(api.draftStorageKey('current', 1, 'same'), api.draftStorageKey('legacy', 1, 'same'));
  const note = { id: 'n', path: 'video.mp4', sha256: 'same', start: 1, end: 1, text: '修改', status: '待处理' };
  const text = api.feedbackText({ ep: 1, topic: '测试', libraryName: '历史视频库（外层）' }, [note]);
  assert.ok(text.includes('历史视频库（外层）'));
});

test('切换到另一视频库的相同期号后，旧意见请求不能覆盖新库', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('async function loadNotes('), code.indexOf('function visibleNotes('));
  let finish, renders = 0;
  const state = { library: 'current', detail: { ep: 1 }, pageSerial: 1, notes: ['当前库'] };
  const load = vm.runInNewContext(source + '\nloadNotes', { state, api: () => new Promise(resolve => { finish = resolve; }), renderNotes: () => renders++ });
  const pending = load();
  state.library = 'legacy'; state.detail = { ep: 1 }; state.pageSerial = 2; state.notes = ['历史库'];
  finish({ items: ['迟到的当前库意见'] }); await pending;
  assert.deepEqual(state.notes, ['历史库']); assert.equal(renders, 0);
});

test('切库等待列表期间清除旧主题和操作控件，禁止以新库执行旧库选择', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  const source = code.slice(code.indexOf('async function route('), code.indexOf('function seek('));
  const state = { library: 'current', libraries: [{ id: 'current', name: '当前库' }, { id: 'legacy', name: '历史库' }], episodes: [{ ep: 1, topic: '当前库主题' }], pageSerial: 0, mediaSerial: 0, materialSerial: 0, listSerial: 0, selected: new Set() };
  const fields = { 'episode-list': { innerHTML: '当前库主题及保存按钮' }, 'open-cleanup': { disabled: false }, stats: { replaceChildren() {} }, 'nav-count': {}, 'filtered-count': {} };
  const field = id => fields[id] ||= {};
  let finish;
  const route = vm.runInNewContext(source + '\nroute', { state, URLSearchParams, location: { hash: '#library=legacy' }, $: field, document: { querySelectorAll: () => [], querySelector: () => ({}) }, overviewHash: () => '#library=legacy', cleanup: { reset() {} }, film: { pause() {} }, loadList: () => new Promise(resolve => { finish = resolve; }) });
  const pending = route();
  try {
    assert.equal(state.library, 'legacy'); assert.equal(state.episodes.length, 0);
    assert.ok(!fields['episode-list'].innerHTML.includes('当前库主题'));
    assert.equal(fields['open-cleanup'].disabled, true);
  } finally { finish(); await pending; }
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

test('恢复旧库副本期间切库，完成结果不会重新载入新库同一期号', async () => {
  const code = await readFile(new URL('../../workbench/public/workbench.js', import.meta.url), 'utf8');
  assert.ok(code.includes('async function restoreArchivedMedia('), '尚未接入归档恢复按钮');
  const source = code.slice(code.indexOf('async function restoreArchivedMedia('), code.indexOf('async function loadMedia('));
  const state = { library: 'legacy', pageSerial: 1, detail: { ep: 1, media: [{ id: 'same', archived: true }] }, media: { id: 'same', archived: true } };
  let finish; const calls = [], loads = [], button = {};
  const restore = vm.runInNewContext(source + '\nrestoreArchivedMedia', { state, $: () => button, canLeave: () => true, persistDraft() {}, renderMediaSelect() {}, notice() {}, api: (...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); }, loadMedia: async id => loads.push(id) });
  const pending = restore();
  state.library = 'current'; state.pageSerial++; state.detail = { ep: 1 }; state.media = { id: 'same' };
  finish({ restored: true }); await pending;
  assert.equal(calls[0][2], 'legacy'); assert.deepEqual(loads, []);
});
