import test from 'node:test';
import assert from 'node:assert/strict';
import { initCleanup } from '../../workbench/public/cleanup-ui.js';

function mockDocument(episodes = [{ dataset: { cleanupEpisode: '1', published: 'true' }, checked: true }]) {
  const previousDocument = globalThis.document, previousConfirm = globalThis.confirm;
  const fields = new Map();
  const element = id => {
    if (!fields.has(id)) fields.set(id, { dataset: {}, listeners: {}, textContent: '', checked: false, disabled: false, addEventListener(type, fn) { this.listeners[type] = fn; }, close() { this.open = false; }, showModal() { this.open = true; }, querySelectorAll(selector) { return selector.includes('data-cleanup-episode') ? episodes.filter(input => !selector.includes(':checked') || input.checked) : []; } });
    return fields.get(id);
  };
  globalThis.document = { getElementById: element }; globalThis.confirm = () => true;
  return { element, restore() { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; if (previousConfirm === undefined) delete globalThis.confirm; else globalThis.confirm = previousConfirm; } };
}

test('删除成功后列表刷新失败，仍保留实际删除数量与审计位置', async () => {
  const { element, restore } = mockDocument();
  const item = { id: 'old', ep: 1, path: 'old.mp4', bytes: 19, allowed: true, reasons: [] };
  const plan = { id: 'plan', library: 'current', items: [item], summary: { totalBytes: 19, eligibleBytes: 19, protectedBytes: 0, fileCount: 1, eligibleCount: 1 }, warnings: [] };
  const calls = [];
  try {
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前视频库', getEpisodes: () => [{ ep: 1, topic: '临时课程', status: '已发布' }], notice() {}, afterDelete: async () => { throw new Error('模拟刷新失败'); }, api: async url => { calls.push(url); return url.endsWith('preview') ? plan : { deletedCount: 1, deletedBytes: 19, auditPath: '/audit.json' }; } });
    element('open-cleanup').listeners.click();
    await element('preview-cleanup').listeners.click();
    element('cleanup-select-all').checked = true;
    element('cleanup-select-all').listeners.change();
    await element('apply-cleanup').listeners.click();
    const message = element('cleanup-message').textContent;
    assert.ok(message.includes('实际删除 1 个文件'));
    assert.ok(message.includes('/audit.json'));
    assert.ok(message.includes('刷新失败'));
    assert.ok(!message.includes('清理未完成'));
    assert.deepEqual(calls, ['cleanup/preview', 'cleanup/apply']);
  } finally { restore(); }
});

test('全选、半选与预览仅包含已发布期次，制作中和待发布期次禁选', async () => {
  const statuses = ['已发布', '已发布', '制作中', '待发布'];
  const episodes = statuses.map((status, i) => ({ dataset: { cleanupEpisode: String(i + 1), published: String(status === '已发布') }, checked: false }));
  const { element, restore } = mockDocument(episodes);
  let requested;
  try {
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前库', getEpisodes: () => statuses.map((status, i) => ({ ep: i + 1, status })), notice() {}, api: async (_url, options) => { requested = JSON.parse(options.body).episodes; return { items: [], summary: {}, masters: [], warnings: [] }; } });
    element('open-cleanup').listeners.click();
    const all = element('cleanup-select-all-episodes');
    assert.equal(all.checked, false); assert.equal(all.disabled, false);
    assert.equal(element('cleanup-select-all-episodes-label').textContent, '全选已发布期次（2 期）');
    assert.deepEqual(episodes.map(input => input.disabled), [false, false, true, true]);
    assert.match(element('cleanup-episodes').innerHTML, /data-cleanup-episode="3"[^>]*disabled/);
    assert.match(element('cleanup-episodes').innerHTML, /data-cleanup-episode="4"[^>]*disabled/);
    all.checked = true; all.listeners.change();
    assert.deepEqual(episodes.map(input => input.checked), [true, true, false, false]);
    assert.equal(all.checked, true);
    assert.equal(all.indeterminate, false);
    episodes[1].checked = false; element('cleanup-episodes').listeners.change();
    assert.equal(all.checked, false); assert.equal(all.indeterminate, true);
    element('cleanup-all-episodes').listeners.click();
    assert.deepEqual(episodes.map(input => input.checked), [true, true, false, false]);
    assert.equal(all.checked, true); assert.equal(all.indeterminate, false);
    episodes[2].checked = true;
    await element('preview-cleanup').listeners.click();
    assert.deepEqual(requested, [1, 2]);
    all.checked = false; all.listeners.change();
    assert.ok(episodes.every(input => !input.checked));
    assert.equal(all.indeterminate, false);
    all.checked = true; all.listeners.change();
    element('cleanup-no-episodes').listeners.click();
    assert.equal(all.checked, false); assert.equal(all.indeterminate, false);
  } finally { restore(); }
});

test('没有已发布期次时禁用全选，不能提交未发布期次预览', async () => {
  const episodes = [{ dataset: { cleanupEpisode: '1', published: 'false' }, checked: false }];
  const { element, restore } = mockDocument(episodes);
  let calls = 0;
  try {
    initCleanup({ getLibrary: () => 'legacy', getLibraryName: () => '历史库', getEpisodes: () => [{ ep: 1, status: '制作中' }], notice() {}, api: async () => { calls++; } });
    element('open-cleanup').listeners.click();
    assert.equal(element('cleanup-select-all-episodes').disabled, true);
    assert.equal(element('cleanup-all-episodes').disabled, true);
    assert.equal(episodes[0].disabled, true);
    assert.equal(element('cleanup-select-all-episodes-label').textContent, '全选已发布期次（0 期）');
    episodes[0].checked = true;
    await element('preview-cleanup').listeners.click();
    assert.equal(calls, 0);
  } finally { restore(); }
});

test('执行结束恢复控件时，未发布期次仍禁选', async () => {
  const episodes = [{ dataset: { cleanupEpisode: '1', published: 'true' }, checked: true }, { dataset: { cleanupEpisode: '2', published: 'false' }, checked: false }];
  const { element, restore } = mockDocument(episodes);
  const item = { id: 'old', ep: 1, path: 'old.mp4', bytes: 19, allowed: true, reasons: [] };
  try {
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前库', getEpisodes: () => [{ ep: 1, status: '已发布' }, { ep: 2, status: '待发布' }], notice() {}, api: async url => url.endsWith('preview') ? { id: 'plan', library: 'current', items: [item], summary: {}, warnings: [] } : { deletedCount: 1, deletedBytes: 19, auditPath: '/audit.json' } });
    element('open-cleanup').listeners.click();
    element('cleanup-dialog').querySelectorAll = selector => selector === 'button,input,select' ? episodes : episodes.filter(input => !selector.includes(':checked') || input.checked);
    await element('preview-cleanup').listeners.click();
    element('cleanup-select-all').checked = true; element('cleanup-select-all').listeners.change();
    await element('apply-cleanup').listeners.click();
    assert.deepEqual(episodes.map(input => input.disabled), [false, true]);
  } finally { restore(); }
});

test('全选仅包含可清理文件，逐项取消同步半选状态，取消全选后禁止执行', async () => {
  const { element, restore } = mockDocument();
  const items = [{ id: 'old-a', bytes: 19, allowed: true }, { id: 'old-b', bytes: 21, allowed: true }, { id: 'publish', bytes: 100, allowed: false }].map(item => ({ ep: 1, path: item.id + '.mp4', reasons: [], ...item }));
  const plan = { id: 'plan', library: 'current', items, summary: { totalBytes: 140, eligibleBytes: 40, protectedBytes: 100, fileCount: 3, eligibleCount: 2 }, warnings: [] };
  let applied;
  try {
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前视频库', getEpisodes: () => [], notice() {}, api: async (url, options) => { if (url.endsWith('preview')) return plan; applied = JSON.parse(options.body); return { deletedCount: 2, deletedBytes: 40, auditPath: '/audit.json' }; } });
    element('open-cleanup').listeners.click();
    assert.equal(element('cleanup-select-all').disabled, true);
    await element('preview-cleanup').listeners.click();
    const all = element('cleanup-select-all');
    assert.equal(all.disabled, false);
    assert.match(element('cleanup-select-all-label').textContent, /2/);
    all.checked = true; all.listeners.change();
    assert.equal(all.checked, true);
    assert.equal(all.indeterminate, false);
    assert.match(element('cleanup-selected').textContent, /已选择 2 个文件/);
    element('cleanup-files').listeners.change({ target: { dataset: { cleanupFile: 'old-a' }, checked: false } });
    assert.equal(all.checked, false);
    assert.equal(all.indeterminate, true);
    element('cleanup-files').listeners.change({ target: { dataset: { cleanupFile: 'publish' }, checked: true } });
    assert.match(element('cleanup-selected').textContent, /已选择 1 个文件/);
    all.checked = false; all.listeners.change();
    assert.equal(all.indeterminate, false);
    assert.equal(element('apply-cleanup').disabled, true);
    assert.equal(element('cleanup-selected').textContent, '尚未选择文件');
    all.checked = true; all.listeners.change();
    await element('apply-cleanup').listeners.click();
    assert.deepEqual(applied.fileIds, ['old-a', 'old-b']);
    assert.equal(all.checked, false);
    assert.equal(all.disabled, true);
  } finally { restore(); }
});

test('切换清理类别会清空旧选择，全选只选择当前类别', async () => {
  const { element, restore } = mockDocument();
  const items = [{ id: 'old', kind: 'historical' }, { id: 'copy', kind: 'duplicate' }].map(item => ({ ...item, ep: 1, path: item.id + '.mp4', bytes: 10, allowed: true, reasons: [] }));
  try {
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前库', getEpisodes: () => [], notice() {}, api: async () => ({ items, summary: {}, masters: [], warnings: [] }) });
    element('open-cleanup').listeners.click(); await element('preview-cleanup').listeners.click();
    element('cleanup-select-all').checked = true; element('cleanup-select-all').listeners.change();
    assert.match(element('cleanup-selected').textContent, /2 个文件/);
    element('cleanup-kind').value = 'duplicate'; element('cleanup-kind').listeners.change();
    assert.equal(element('apply-cleanup').disabled, true);
    element('cleanup-select-all').checked = true; element('cleanup-select-all').listeners.change();
    assert.match(element('cleanup-selected').textContent, /1 个文件/);
    assert.ok(element('cleanup-files').innerHTML.includes('copy.mp4'));
    assert.ok(!element('cleanup-files').innerHTML.includes('old.mp4'));
  } finally { restore(); }
});

test('旧检查图片和重复字体可分类全选，确认文字覆盖多种产物', async () => {
  const { element, restore } = mockDocument();
  const items = [{ id: 'old', kind: 'historical' }, { id: 'frame', kind: 'image' }, { id: 'font', kind: 'font' }].map(item => ({ ...item, ep: 1, path: item.id, bytes: 10, allowed: true, reasons: [] }));
  const confirmations = [];
  let applied;
  try {
    globalThis.confirm = message => { confirmations.push(message); return true; };
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前库', getEpisodes: () => [], notice() {}, api: async (url, options) => { if (url.endsWith('preview')) return { id: 'plan', library: 'current', items, summary: {}, warnings: [] }; applied = JSON.parse(options.body); return { deletedCount: 1, deletedBytes: 10, auditPath: '/audit.json' }; } });
    element('open-cleanup').listeners.click(); await element('preview-cleanup').listeners.click();
    for (const kind of ['image', 'font']) {
      element('cleanup-kind').value = kind; element('cleanup-kind').listeners.change();
      element('cleanup-select-all').checked = true; element('cleanup-select-all').listeners.change();
      assert.match(element('cleanup-selected').textContent, /1 个文件/);
    }
    await element('apply-cleanup').listeners.click();
    assert.deepEqual(applied.fileIds, ['font']);
    assert.ok(confirmations[0].includes('派生产物'));
    assert.ok(confirmations[0].includes('字体'));
  } finally { restore(); }
});

test('批量勾选和清空只同步复选框，不重建数千条文件DOM', async () => {
  const { element, restore } = mockDocument();
  const items = [{ id: 'a' }, { id: 'b' }].map(item => ({ ...item, kind: 'image', ep: 1, path: item.id, bytes: 1, allowed: true, reasons: [] }));
  const inputs = items.map(item => ({ dataset: { cleanupFile: item.id }, checked: false }));
  let writes = 0, html = '';
  try {
    const list = element('cleanup-files');
    Object.defineProperty(list, 'innerHTML', { get: () => html, set: value => { html = value; writes++; } });
    list.querySelectorAll = () => inputs;
    initCleanup({ getLibrary: () => 'current', getLibraryName: () => '当前库', getEpisodes: () => [], notice() {}, api: async () => ({ items, summary: {}, warnings: [] }) });
    element('open-cleanup').listeners.click(); await element('preview-cleanup').listeners.click();
    const before = writes;
    element('cleanup-select-all').checked = true; element('cleanup-select-all').listeners.change();
    assert.equal(writes, before); assert.ok(inputs.every(input => input.checked));
    element('cleanup-clear-files').listeners.click();
    assert.ok(inputs.every(input => !input.checked)); assert.equal(writes, before);
  } finally { restore(); }
});
