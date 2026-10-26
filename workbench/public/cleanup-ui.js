// 用途：按视频库和期次预览历史派生文件，手动选择后执行清理。
// 使用：由workbench.js调用initCleanup并提供当前视频库与接口。
// 依赖：浏览器原生DOM、dialog与utils.mjs。
import { formatBytes } from './utils.mjs';

export function initCleanup({ api, notice, getLibrary, getLibraryName, getEpisodes, afterDelete }) {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const dialog = $('cleanup-dialog');
  let plan = null, selected = new Set(), serial = 0, busy = false, pending = false;
  function clearPlan() {
    plan = null; selected.clear(); $('cleanup-results').hidden = true; $('cleanup-message').textContent = '';
    updateSelection();
  }
  function reset() { if (busy) return; serial++; clearPlan(); dialog.close(); }
  function updateEpisodeSelection() {
    const inputs = [...dialog.querySelectorAll('[data-cleanup-episode]')];
    inputs.forEach(input => { input.disabled = busy || input.dataset.published !== 'true'; if (input.dataset.published !== 'true') input.checked = false; });
    const published = inputs.filter(input => input.dataset.published === 'true'), count = published.filter(input => input.checked).length;
    const all = $('cleanup-select-all-episodes');
    all.checked = published.length > 0 && count === published.length;
    all.indeterminate = count > 0 && count < published.length;
    all.disabled = !published.length || busy;
    $('cleanup-all-episodes').disabled = !published.length || busy;
    $('cleanup-select-all-episodes-label').textContent = `全选已发布期次（${published.length} 期）`;
  }
  function episodesChanged() { serial++; clearPlan(); updateEpisodeSelection(); }
  const inCategory = item => !$('cleanup-kind').value || $('cleanup-kind').value === 'all' || (item.kind || 'historical') === $('cleanup-kind').value;
  function updateSelection() {
    const eligible = plan?.items.filter(item => item.allowed === true && inCategory(item)) || [];
    const items = plan?.items.filter(item => item.allowed === true && selected.has(item.id)) || [];
    const bytes = items.reduce((sum, item) => sum + item.bytes, 0);
    const all = $('cleanup-select-all');
    all.checked = eligible.length > 0 && items.length === eligible.length;
    all.indeterminate = items.length > 0 && items.length < eligible.length;
    all.disabled = !eligible.length || busy || pending;
    $('cleanup-select-all-label').textContent = `全选${$('cleanup-kind').value && $('cleanup-kind').value !== 'all' ? '当前类别' : '可清理'}文件（${eligible.length} 项）`;
    $('cleanup-selected').textContent = items.length ? `已选择 ${items.length} 个文件 · 预计释放 ${formatBytes(bytes)}` : '尚未选择文件';
    $('apply-cleanup').disabled = !items.length || busy || pending;
    $('apply-cleanup').textContent = busy ? '正在清理…' : '清理选中文件';
  }
  function renderFiles() {
    const visible = plan.items.filter(item => inCategory(item) && (item.allowed === true || $('cleanup-show-protected').checked));
    $('cleanup-files').innerHTML = visible.length ? visible.map(item => `<label class="cleanup-file ${item.allowed ? '' : 'protected'}"><input type="checkbox" data-cleanup-file="${esc(item.id)}" aria-label="选择${esc(item.path)}" ${selected.has(item.id) ? 'checked' : ''} ${item.allowed ? '' : 'disabled'}><span><strong>第${String(item.ep).padStart(2, '0')}期 · ${esc(item.category)}</strong><span class="cleanup-file-path">${esc(item.path)}</span><small>${esc((item.reasons || []).join('；'))}${item.master ? '<br>保留母版：' + esc(item.master.path) : ''}</small></span><span class="cleanup-file-size">${formatBytes(item.bytes)}</span></label>`).join('') : '<p class="cleanup-empty">当前类别没有核查通过的可清理文件。可切换类别或勾选“显示受保护文件”查看保留原因。</p>';
    updateSelection();
  }
  function syncFileChecks() {
    $('cleanup-files').querySelectorAll('[data-cleanup-file]').forEach(input => input.checked = selected.has(input.dataset.cleanupFile));
    updateSelection();
  }
  function open() {
    $('cleanup-kind').value = 'all';
    clearPlan(); serial++;
    $('cleanup-library').textContent = getLibraryName(); dialog.dataset.library = getLibrary();
    $('cleanup-episodes').innerHTML = getEpisodes().map(episode => `<label><input type="checkbox" data-cleanup-episode="${episode.ep}" data-published="${episode.status === '已发布'}" ${episode.status === '已发布' ? '' : 'disabled'}><span>第${String(episode.ep).padStart(2, '0')}期 · ${esc(episode.topic)}</span><small>${esc(episode.status)}</small></label>`).join('');
    updateEpisodeSelection();
    $('cleanup-show-protected').checked = false; dialog.showModal();
  }
  $('open-cleanup').addEventListener('click', open);
  $('close-cleanup').addEventListener('click', reset);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); else { serial++; clearPlan(); } });
  $('cleanup-episodes').addEventListener('change', episodesChanged);
  $('cleanup-select-all-episodes').addEventListener('change', () => { dialog.querySelectorAll('[data-cleanup-episode]').forEach(input => input.checked = input.dataset.published === 'true' && $('cleanup-select-all-episodes').checked); episodesChanged(); });
  $('cleanup-all-episodes').addEventListener('click', () => { dialog.querySelectorAll('[data-cleanup-episode]').forEach(input => input.checked = input.dataset.published === 'true'); episodesChanged(); });
  $('cleanup-no-episodes').addEventListener('click', () => { dialog.querySelectorAll('[data-cleanup-episode]').forEach(input => input.checked = false); episodesChanged(); });
  $('preview-cleanup').addEventListener('click', async () => {
    const episodes = [...dialog.querySelectorAll('[data-cleanup-episode]:checked')].filter(input => input.dataset.published === 'true').map(input => Number(input.dataset.cleanupEpisode));
    if (!episodes.length) { $('cleanup-message').textContent = '请先选择要检查的已发布期次。'; return; }
    clearPlan(); const request = ++serial, library = getLibrary();
    pending = true; $('preview-cleanup').disabled = true; $('cleanup-message').textContent = '正在统计文件并核查两个视频库中的依赖…';
    try {
      const result = await api('cleanup/preview', { method: 'POST', body: JSON.stringify({ episodes }) }, library);
      if (request !== serial || library !== getLibrary() || !dialog.open) return;
      plan = result; selected.clear();
      const summary = plan.summary;
      $('cleanup-summary').innerHTML = `<div><span>检查范围占用</span><strong>${formatBytes(summary.totalBytes)}</strong></div><div><span>核查通过可清理</span><strong>${formatBytes(summary.eligibleBytes)}</strong></div><div><span>继续保留</span><strong>${formatBytes(summary.protectedBytes)}</strong></div>`;
      $('cleanup-masters-title').textContent = `保留发布母版（${(plan.masters || []).length} 期）`;
      $('cleanup-master-list').innerHTML = (plan.masters || []).map(item => `<p>第${String(item.ep).padStart(2, '0')}期 · ${formatBytes(item.bytes)}<span class="cleanup-file-path">${esc(item.path)}</span></p>`).join('') || '<p>所选期次没有可核对的发布母版，不能据此清理当前整片。</p>';
      $('cleanup-warning-text').textContent = (plan.warnings || []).map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
      $('cleanup-warnings').hidden = !(plan.warnings || []).length;
      $('cleanup-results').hidden = false;
      $('cleanup-message').textContent = `已核查 ${summary.fileCount} 个文件，其中 ${summary.eligibleCount} 个可选择清理。可清理旧视频、已核验旧检查图片与重复字体；发布母版、当前输入和验收记录继续保留。`;
      renderFiles();
    } catch (error) { if (request === serial) $('cleanup-message').textContent = '预览失败：' + error.message; }
    finally { pending = false; $('preview-cleanup').disabled = false; updateSelection(); }
  });
  $('cleanup-files').addEventListener('change', event => {
    const id = event.target.dataset.cleanupFile;
    if (!id || !plan?.items.some(item => item.id === id && item.allowed === true)) return;
    if (event.target.checked) selected.add(id); else selected.delete(id);
    updateSelection();
  });
  $('cleanup-show-protected').addEventListener('change', () => { if (plan) renderFiles(); });
  $('cleanup-kind').addEventListener('change', () => { selected.clear(); if (plan) renderFiles(); });
  $('cleanup-select-all').addEventListener('change', () => { if (plan && !busy && !pending) { selected = $('cleanup-select-all').checked ? new Set(plan.items.filter(item => item.allowed === true && inCategory(item)).map(item => item.id)) : new Set(); syncFileChecks(); } });
  $('cleanup-clear-files').addEventListener('click', () => { selected.clear(); if (plan) syncFileChecks(); });
  $('apply-cleanup').addEventListener('click', async () => {
    if (!plan || !selected.size || pending || busy || plan.library !== getLibrary()) return;
    const items = plan.items.filter(item => selected.has(item.id) && item.allowed === true);
    const bytes = items.reduce((sum, item) => sum + item.bytes, 0), library = plan.library;
    const duplicates = items.filter(item => item.kind === 'duplicate').length;
    const images = items.filter(item => item.kind === 'image').length, fonts = items.filter(item => item.kind === 'font').length;
    if (!items.length || !confirm(`从${getLibraryName()}删除选中的 ${items.length} 个派生产物，预计释放 ${formatBytes(bytes)}。\n包括 ${images} 张旧检查图片、${fonts} 个重复字体副本。${duplicates} 个相同整片副本可从保留母版恢复，其余废弃旧产物不再恢复。确认清理？`)) return;
    busy = true; updateSelection();
    const controls = [...dialog.querySelectorAll('button,input,select'), $('library-select')];
    controls.forEach(control => control.disabled = true);
    $('cleanup-message').textContent = '正在重新核查清单并逐文件清理，请保持页面打开…';
    try {
      const result = await api('cleanup/apply', { method: 'POST', body: JSON.stringify({ planId: plan.id, fileIds: items.map(item => item.id), confirmation: '清理历史版本' }) }, library);
      clearPlan();
      $('cleanup-message').textContent = `清理完成：实际删除 ${result.deletedCount} 个文件，释放 ${formatBytes(result.deletedBytes)}。审计记录：${result.auditPath}`;
      notice(`历史版本清理完成，释放 ${formatBytes(result.deletedBytes)}`);
      try { if (library === getLibrary()) await afterDelete(); }
      catch (error) { $('cleanup-message').textContent += '。列表刷新失败：' + error.message + '，可手动刷新。'; notice('清理已完成，列表刷新失败，请手动刷新', true); }
    } catch (error) {
      clearPlan();
      const partial = error.partial ? `已删除 ${error.partial.deletedCount} 个文件，释放 ${formatBytes(error.partial.deletedBytes)}。` : '';
      $('cleanup-message').textContent = '清理未完成：' + partial + error.message + '。请重新预览核对实际结果。';
    } finally {
      busy = false; controls.forEach(control => control.disabled = false); updateEpisodeSelection(); updateSelection();
    }
  });
  return { reset, isBusy: () => busy };
}
