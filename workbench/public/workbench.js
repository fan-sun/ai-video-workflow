// 用途：提供本地视频浏览、审片与意见交接界面。
// 使用：由工作台首页以ES模块加载。
// 依赖：浏览器原生API及同目录utils.mjs。
import { formatTime, parseTime, scopeLabel, feedbackText, draftStorageKey } from './utils.mjs';
import { initCleanup } from './cleanup-ui.js';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const state = { library: 'current', libraries: [], listSerial: 0, episodes: [], route: 'all', detail: null, media: null, notes: [], selected: new Set(), tab: 'script', edit: null, target: null, requestId: null, editorSession: 0, pageSerial: 0, mediaSerial: 0, materialSerial: 0, stopAt: null, activeCue: -1 };
const film = $('film');
let noticeTimer;
function notice(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').dataset.error = error; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('notice').hidden = true, error ? 9000 : 3500); }
async function api(url, options = {}, library = state.library) {
  const r = await fetch('/api/workbench/libraries/' + library + '/' + url, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const d = await r.json(); if (!r.ok) throw Object.assign(new Error(d.error || '请求失败'), { partial: d.partial }); return d;
}
const epUrl = () => `episodes/${state.detail.ep}`;
const fileUrl = id => `/api/workbench/libraries/${state.library}/${epUrl()}/file/${id}`;
const overviewHash = () => '#library=' + state.library;
const guarded = fn => (...args) => Promise.resolve().then(() => fn(...args)).catch(e => notice(e.message, true));
const time = (v, ms = false) => formatTime(v, ms);
async function loadList() {
  const serial = ++state.listSerial, library = state.library;
  $('refresh').disabled = true; $('open-cleanup').disabled = true;
  try {
    const d = await api('episodes', {}, library);
    if (serial !== state.listSerial || library !== state.library) return;
    state.episodes = d.episodes;
    $('open-cleanup').disabled = false;
    $('nav-count').textContent = d.episodes.length;
    $('last-read').textContent = `最近读取 ${new Date(d.loadedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 本地制作记录`;
    $('stats').innerHTML = ['制作中', '待发布', '已发布'].map((status, i) => `<div class="stat"><span class="stat-symbol">${['▤', '◷', '✓'][i]}</span><div><span class="stat-label">${status}</span><span class="stat-number">${d.episodes.filter(e => e.status === status).length}<small>期视频</small></span></div></div>`).join('');
    renderList();
  } finally { if (serial === state.listSerial) $('refresh').disabled = false; }
}
function renderList() {
  const q = $('search').value.trim().toLowerCase(), status = $('status-filter').value;
  const episodes = state.episodes.filter(e => (state.route === 'all' || e.route === state.route) && (status === 'all' || e.status === status) && (!q || `${e.ep} ${e.topic}`.toLowerCase().includes(q)));
  $('filtered-count').textContent = episodes.length;
  $('episode-list').innerHTML = episodes.length ? episodes.map(e => `<tr><td><div class="episode-name"><span class="episode-icon ${e.route}">${e.route === 'vibe' ? '◈' : '▤'}</span><div><a class="episode-link" href="#library=${state.library}&episode=${e.ep}">${esc(e.topic)}</a><div class="episode-number">EPISODE ${String(e.ep).padStart(2, '0')} · ${e.actCount ?? '—'} 幕</div></div></div></td><td><span class="route-tag ${e.route}">${e.route === 'vibe' ? 'Vibe' : '教学'}</span></td><td><span class="version-text">${esc(e.version || '未记录')}</span></td><td><div class="status-editor"><select data-episode-status="${e.ep}" data-status="${esc(e.status)}" aria-label="第${e.ep}期制作状态">${['制作中', '待发布', '已发布'].map(s => `<option ${s === e.status ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="button secondary" data-save-status="${e.ep}" aria-label="保存第${e.ep}期状态" disabled>保存</button></div></td><td><div class="episode-actions"><a class="open-button" href="#library=${state.library}&episode=${e.ep}" aria-label="打开第${e.ep}期">打开 ↗</a><button type="button" class="text-button" data-open-release="${e.ep}" aria-label="打开第${e.ep}期发布文件夹" title="${esc(e.publishMedia?.exists ? e.publishMedia.path : e.publishMedia ? '发布文件不存在，请核对制作索引' : '尚未登记发布版本')}" ${e.publishMedia?.exists ? '' : 'disabled'}>发布文件夹</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="empty">没有符合筛选条件的视频。</td></tr>';
}
async function loadEpisode(ep, mediaId, pageSerial) {
  film.pause(); state.stopAt = null; state.mediaSerial++; state.materialSerial++;
  state.media = null; $('note-editor').hidden = true;
  emptyMedia('正在读取本期资料…');
  const d = await api(`episodes/${ep}`);
  if (pageSerial !== state.pageSerial) return;
  state.detail = d; state.selected.clear(); state.media = null; state.edit = null;
  $('overview').hidden = true; $('detail').hidden = false; $('note-editor').hidden = true;
  $('breadcrumb').textContent = `${d.libraryName} / 第${String(d.ep).padStart(2, '0')}期 / 审片`;
  $('episode-kicker').textContent = `EPISODE ${String(d.ep).padStart(2, '0')} / ${d.route === 'vibe' ? 'VIBE' : 'TEACHING'}`;
  $('episode-title').textContent = d.topic; $('episode-status').outerHTML = `<span id="episode-status" class="badge" data-status="${esc(d.status)}">${esc(d.status)}</span>`;
  $('stage-summary').textContent = `${d.stage} · ${d.next}`;
  $('act-count').textContent = `${d.acts.length} 幕`;
  $('acts').innerHTML = d.acts.map(a => `<div class="act-item"><strong>${esc(a.title)}</strong><p>稿件：${esc(a.script)} · 时间表：${esc(a.timing)}</p><p>声音：${esc(a.audio)}</p><p>画面：${esc(a.visual)}</p><p>技术：${esc(a.technical)}</p><p>助手：${esc(a.assistant)}</p><p>用户：${esc(a.user)}</p>${a.mediaId ? `<button data-act-media="${a.mediaId}">打开本幕 ↗</button>` : ''}</div>`).join('') || '<p class="small muted">本期尚未登记分幕信息。</p>';
  $('warnings').hidden = !d.warnings.length; $('warnings').textContent = d.warnings.join('；');
  await loadNotes();
  if (pageSerial !== state.pageSerial) return;
  const id = mediaId && d.media.some(m => m.id === mediaId) ? mediaId : d.currentMediaId;
  $('show-candidates').checked = d.media.find(m => m.id === id)?.candidate || false;
  renderMediaSelect(id);
  if (id) await loadMedia(id); else emptyMedia('本期尚未登记视频。制作完成后刷新即可查看。');
}
function renderMediaSelect(id = state.media?.id || $('media-select').value) {
  const media = state.detail.media.filter(m => !m.candidate || $('show-candidates').checked || m.id === id);
  $('media-select').innerHTML = media.map(m => `<option value="${m.id}">${m.current ? '● 当前 · ' : ''}${esc(m.version)} · ${esc(m.type === '候选视频' ? scopeLabel(m) + '候选' : m.type)}${m.archived ? '（已归档，读取母版）' : m.exists ? '' : '（文件缺失）'} · ${esc(m.path.split('/').at(-1))}</option>`).join('');
  if (id) $('media-select').value = id;
  $('media-select').disabled = !media.length;
}
function emptyMedia(message) {
  film.pause(); film.removeAttribute('src'); film.load(); film.hidden = true;
  $('video-empty').hidden = false; $('video-empty').textContent = message;
  $('record').disabled = true; $('media-label').textContent = ''; $('approval').textContent = ''; $('chapters').replaceChildren();
  $('restore-media').hidden = true;
  $('file-details').textContent = ''; $('mapping-note').textContent = ''; $('material-content').innerHTML = '<p class="empty">暂无可对应的审片材料。</p>';
  renderNotes();
}
async function restoreArchivedMedia() {
  if (!state.media?.archived || !canLeave()) return;
  const library = state.library, ep = state.detail.ep, id = state.media.id, pageSerial = state.pageSerial;
  persistDraft(); $('restore-media').disabled = true;
  try {
    await api(`episodes/${ep}/restore-media/${id}`, { method: 'POST', body: '{}' }, library);
    if (library !== state.library || pageSerial !== state.pageSerial || state.media?.id !== id) return;
    const item = state.detail.media.find(value => value.id === id);
    if (item) item.archived = false;
    renderMediaSelect(id); await loadMedia(id); notice('整片副本已恢复到原路径，保留发布母版未改变');
  } finally { $('restore-media').disabled = false; }
}
async function loadMedia(id) {
  const serial = ++state.mediaSerial, ep = state.detail.ep;
  film.pause(); state.stopAt = null; state.activeCue = -1; state.media = null;
  $('record').disabled = true; $('media-select').value = id;
  emptyMedia('正在核对文件与版本…');
  try {
    const m = await api(`episodes/${ep}/media/${id}`);
    if (serial !== state.mediaSerial) return;
    state.media = m; film.hidden = false; $('video-empty').hidden = true;
    film.src = fileUrl(m.id) + '?sha256=' + m.sha256; film.load();
    $('record').disabled = false;
    $('media-label').textContent = `${scopeLabel(m)} · ${m.version} · ${time(m.duration)}${m.current ? ' · 当前预览' : ' · 其他／历史媒体'}`;
    $('approval').textContent = m.approval.text; $('approval').dataset.state = m.approval.state; $('approval').title = m.approval.scope;
    $('chapters').innerHTML = m.chapters.map(c => `<button data-seek="${c.start}" title="${esc(c.title)}">${esc(c.title)} ${time(c.start)}</button>`).join('');
    $('file-details').textContent = `视频库：${state.detail.libraryName}\n视频：${m.path}${m.archived ? '\n相同副本已归档，实际读取保留母版：' + m.masterPath : ''}\nSHA256：${m.sha256}\n意见保存：${m.feedbackPath}${m.spec?.error ? '\n' + m.spec.error : ''}`;
    $('restore-media').hidden = !m.archived;
    $('mapping-note').textContent = m.mappingNote;
    await renderMaterial(); renderNotes(); restoreDraft();
  } catch (e) { if (serial === state.mediaSerial) emptyMedia(e.message); }
}
function hasDraft() { return !$('note-editor').hidden && !!($('note-text').value.trim() || $('note-resolution').value.trim()); }
function canLeave() { return !hasDraft() || confirm('当前意见尚未保存到意见列表。确定离开编辑吗？草稿会保留在本机。'); }
async function route() {
  const serial = ++state.pageSerial;
  const params = new URLSearchParams(location.hash.slice(1)), ep = Number(params.get('episode'));
  const library = params.get('library') || 'current';
  const configured = state.libraries.find(x => x.id === library);
  if (!configured) throw new Error('这个视频库未接入当前工作台');
  if (library !== state.library) {
    state.library = library; state.listSerial++; state.mediaSerial++; state.materialSerial++;
    state.route = 'all'; document.querySelectorAll('[data-route]').forEach(button => button.classList.toggle('active', button.dataset.route === 'all'));
    state.detail = null; state.media = null; state.notes = []; state.selected.clear(); state.edit = null; state.target = null;
    state.episodes = []; $('episode-list').innerHTML = '<tr><td colspan="5" class="empty">正在读取视频库…</td></tr>';
    $('open-cleanup').disabled = true; $('stats').replaceChildren(); $('nav-count').textContent = '—'; $('filtered-count').textContent = '—';
    $('note-editor').hidden = true; $('search').value = ''; $('status-filter').value = 'all';
  }
  $('library-select').value = library;
  document.querySelector('.brand').href = overviewHash();
  cleanup.reset();
  if (ep > 0) await loadEpisode(ep, params.get('media'), serial);
  else { state.mediaSerial++; state.detail = null; state.media = null; film.pause(); $('overview').hidden = false; $('detail').hidden = true; $('breadcrumb').textContent = configured.name + ' / 视频总览'; await loadList(); }
}
function seek(start, end = null) {
  if (!state.media || !Number.isFinite(start)) return;
  state.stopAt = end;
  const apply = () => { film.currentTime = start; film.play().catch(() => notice('请点击播放器继续播放')); };
  if (film.readyState >= 1) apply(); else film.addEventListener('loadedmetadata', apply, { once: true });
}
async function renderMaterial(fullText = false, selectedResource = null) {
  const serial = ++state.materialSerial, m = state.media, container = $('material-content');
  if (!m) return;
  const materials = m.materials || {};
  $('follow').disabled = state.tab === 'release';
  if (state.tab !== 'release' && !fullText) {
    const cues = state.tab === 'plan' ? m.scenes : m.cues;
    if (cues.length) {
      container.innerHTML = `<div class="material-links"><button class="text-button" data-full-text="true">查看${state.tab === 'plan' ? '分镜' : '讲解稿'}全文 ↗</button></div>` + cues.map((c, i) => `<button class="cue" data-cue="${i}" data-time="${c.start}" data-end="${c.end}"><time>${time(c.start)}</time><span>${esc(c.text)}${c.plan ? `<small>画面：${esc(c.plan)}</small>` : ''}</span></button>`).join('');
      updateCue(); return;
    }
  }
  container.innerHTML = '<p class="empty">正在读取材料…</p>';
  if (state.tab === 'release') {
    const release = materials;
    container.replaceChildren();
    if (!m.materials) { container.innerHTML = '<p class="empty">这个历史候选没有绑定发布材料。请选择当前审片版或有索引的历史版本。</p>'; return; }
    if (release.cover?.exists) { const image = document.createElement('img'); image.src = fileUrl(release.cover.id); image.className = 'release-cover'; image.alt = `${state.detail.topic}封面`; container.append(image); }
    const links = document.createElement('div'); links.className = 'material-links';
    if (release.cover?.exists) links.innerHTML += `<a class="button small-button secondary" target="_blank" rel="noopener" href="${fileUrl(release.cover.id)}">打开封面 ↗</a>`;
    const publish = m.publishMedia;
    if (publish?.exists) links.innerHTML += `<a class="button small-button secondary" target="_blank" rel="noopener" href="${fileUrl(publish.id)}">打开高清发布视频 ↗</a>`;
    if (release.copy?.exists) links.innerHTML += '<button class="button small-button secondary" data-copy-publish="true">复制发布文案</button>';
    container.append(links);
    const text = document.createElement('pre'); text.className = 'material-text'; container.append(text);
    if (release.copy?.exists) {
      try { const d = await api(`${epUrl()}/text/${release.copy.id}`); if (serial === state.materialSerial) { text.textContent = d.text; text.dataset.publishText = d.text; } } catch (e) { text.textContent = e.message; }
    } else text.textContent = '此版本未登记发布文案。';
    return;
  }
  const item = selectedResource || materials[state.tab];
  if (!item?.exists) { container.innerHTML = `<p class="empty">${item?.path ? '材料文件缺失：' + esc(item.path) : '该视频没有绑定此材料。'}<br>没有可靠对应时，保留缺项，不套用其他版本。</p>`; return; }
  try {
    const d = await api(`${epUrl()}/text/${item.id}`);
    if (serial !== state.materialSerial) return;
    container.innerHTML = (state.tab === 'plan' && m.relatedPlans.length ? '<div class="material-links"><button class="button small-button secondary" data-plan-document="index">总索引</button>' + m.relatedPlans.filter(p => p.exists).map((p, i) => `<button class="button small-button secondary" data-plan-document="${p.id}" title="${esc(p.path)}">${i + 1} · ${esc(p.label)}</button>`).join('') + '</div>' : '') + '<pre class="material-text"></pre>';
    container.querySelector('pre').textContent = d.text;
  } catch (e) { if (serial === state.materialSerial) container.textContent = e.message; }
}
function updateCue() {
  if (!state.media || state.tab === 'release') return;
  const cues = state.tab === 'plan' ? state.media.scenes : state.media.cues;
  const index = cues.findIndex(c => film.currentTime >= c.start && film.currentTime < c.end);
  const textActive = state.media.cues.some(c => film.currentTime >= c.start && film.currentTime < c.end);
  $('mapping-note').textContent = (!textActive && state.media.cues.length ? (state.detail.route === 'vibe' ? '此段无字幕。' : '此段没有旁白句组。') : '') + state.media.mappingNote;
  const elements = $('material-content').querySelectorAll('.cue');
  elements.forEach((el, i) => el.classList.toggle('active', i === index));
  if (index !== state.activeCue && index >= 0 && $('follow').checked && elements[index]) {
    const box = $('material-content'), el = elements[index];
    if (el.offsetTop - box.offsetTop < box.scrollTop || el.offsetTop - box.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop - box.offsetTop - 45;
  }
  state.activeCue = index;
}
async function loadNotes() { const ep = state.detail.ep, library = state.library, page = state.pageSerial, d = await api(`episodes/${ep}/feedback`, {}, library); if (state.detail?.ep === ep && state.library === library && state.pageSerial === page) { state.notes = d.items; renderNotes(); } }
function visibleNotes() {
  return state.notes.filter(x => ($('note-scope').value === 'all' || x.sha256 === state.media?.sha256) && ($('note-status').value === 'all' || ($('note-status').value === 'open' ? x.status !== '已解决' : x.status === $('note-status').value))).sort((a, b) => a.start - b.start);
}
function renderNotes() {
  const items = visibleNotes(); $('note-count').textContent = items.length;
  $('note-list').innerHTML = items.length ? items.map(n => `<article class="note-card" data-note="${n.id}"><div class="note-card-header"><button class="note-time" data-note-jump="${n.id}" title="打开原视频并定位">${time(n.start)}${n.end > n.start ? '—' + time(n.end) : ''}</button><input type="checkbox" data-select-note="${n.id}" aria-label="选择意见 ${esc(n.text.slice(0, 20))}" ${state.selected.has(n.id) ? 'checked' : ''}></div><p>${esc(n.text)}</p><div class="note-version">${esc(scopeLabel(n))} · ${esc(n.version)}${n.sha256 !== state.media?.sha256 ? ' · 其他文件' : ''}${n.resolution ? '<br>处理：' + esc(n.resolution) : ''}</div><div class="note-card-actions"><select data-note-status="${n.id}" aria-label="意见处理状态">${['待处理', '待复核', '已解决'].map(x => `<option ${x === n.status ? 'selected' : ''}>${x}</option>`).join('')}</select><button class="text-button" data-edit-note="${n.id}">编辑</button><button class="text-button danger" data-delete-note="${n.id}">删除</button></div></article>`).join('') : '<div class="empty"><span class="empty-icon">▧</span>这里还没有修改意见<br><span class="small">播放视频，点击“记录问题”。</span></div>';
}
function draftKey() { return state.target ? draftStorageKey(state.library, state.detail.ep, state.target.sha256) : ''; }
function persistDraft() {
  if (!state.target || $('note-editor').hidden) return;
  try { localStorage.setItem(draftKey(), JSON.stringify({ media: state.target, edit: state.edit, start: $('note-start').value, end: $('note-end').value, text: $('note-text').value, resolution: $('note-resolution').value, requestId: state.requestId })); }
  catch { $('save-state').textContent = '浏览器草稿未保存，请保存到意见列表'; }
}
function restoreDraft() {
  if (hasDraft() || !state.media) return;
  let d;
  try { d = JSON.parse(localStorage.getItem(draftStorageKey(state.library, state.detail.ep, state.media.sha256))); } catch { return; }
  if (!d?.text) return;
  state.target = d.media; state.edit = d.edit; state.requestId = d.requestId;
  showEditor(d.start, d.range === false ? d.start : d.end, d.text, d.resolution); $('save-state').textContent = '已恢复本机未提交草稿';
}
function showEditor(start, end, text = '', resolution = '') {
  state.editorSession++; $('save-note').disabled = false;
  $('note-editor').hidden = false; $('editor-title').textContent = state.edit ? '编辑修改意见' : '记录这个画面';
  $('note-target').textContent = `${scopeLabel(state.target)} · ${state.target.version}`;
  $('note-start').value = typeof start === 'number' ? time(start) : start;
  $('note-end').value = typeof end === 'number' ? time(end) : end || $('note-start').value;
  $('note-text').value = text;
  $('note-resolution').value = resolution; $('resolution-label').hidden = !state.edit; $('save-state').textContent = '';
}
function newNote() {
  if (!state.media || !canLeave()) return;
  film.pause(); state.stopAt = null; state.target = state.media; state.edit = null; state.requestId = crypto.randomUUID();
  showEditor(film.currentTime, null); $('note-text').focus();
}
async function saveNote(event) {
  event.preventDefault(); if ($('save-note').disabled) return;
  const ep = state.detail.ep, session = state.editorSession, page = state.pageSerial, key = draftKey();
  const target = state.target, editing = state.edit;
  const sameSession = () => state.detail?.ep === ep && state.pageSerial === page && state.editorSession === session;
  const inputSignature = () => JSON.stringify([$('note-start').value, $('note-end').value, $('note-text').value, $('note-resolution').value]);
  const signature = inputSignature();
  let originalDraft, canReadDraft = false;
  try { originalDraft = localStorage.getItem(key); canReadDraft = true; } catch { /* 无浏览器存储时仍可提交服务器。 */ }
  const patch = { start: parseTime($('note-start').value), end: parseTime($('note-end').value), text: $('note-text').value, resolution: $('note-resolution').value };
  $('save-note').disabled = true; $('save-state').textContent = '正在保存…';
  try {
    const saved = editing
      ? await api(`episodes/${ep}/feedback/${editing.id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, revision: editing.revision }) })
      : await api(`episodes/${ep}/feedback`, { method: 'POST', body: JSON.stringify({ ...patch, mediaId: target.id, sha256: target.sha256, requestId: state.requestId }) });
    try { if (canReadDraft && localStorage.getItem(key) === originalDraft) localStorage.removeItem(key); } catch { /* 服务器已保存，草稿清理失败不影响正式意见。 */ }
    if (sameSession()) {
      if (inputSignature() === signature) { $('note-editor').hidden = true; state.edit = null; }
      else { state.edit = saved; persistDraft(); $('save-state').textContent = '先前内容已保存，新修改尚未保存'; }
      await loadNotes();
    }
    notice(`第${ep}期修改意见已保存到本地`);
  } catch (e) { if (sameSession()) $('save-state').textContent = '保存失败，输入已保留'; throw e; }
  finally { if (sameSession()) $('save-note').disabled = false; }
}
async function jumpNote(id) {
  const n = state.notes.find(x => x.id === id); if (!n || !canLeave()) return;
  const ep = state.detail.ep, page = state.pageSerial, media = state.mediaSerial;
  const registered = state.detail.media.find(m => m.id === n.mediaId);
  if (!registered?.exists) throw new Error('原视频未找到，意见仍保留。请查看文件路径后选择新版手动复核。');
  const fresh = await api(`${epUrl()}/media/${n.mediaId}`);
  if (state.detail?.ep !== ep || state.pageSerial !== page || state.mediaSerial !== media) return;
  if (fresh.sha256 !== n.sha256) throw new Error('原路径的视频内容已变化，不能将旧时间点直接用于新文件。');
  if (state.media?.sha256 !== n.sha256) {
    $('show-candidates').checked = true; renderMediaSelect(n.mediaId);
    const expectedSerial = state.mediaSerial + 1;
    await loadMedia(n.mediaId);
    if (state.detail?.ep !== ep || state.pageSerial !== page || state.mediaSerial !== expectedSerial) return;
    if (state.media?.sha256 !== n.sha256) throw new Error('原路径的视频内容已变化，不能将旧时间点直接用于新文件。');
  }
  const end = n.end === null || n.end === n.start ? Math.min(n.start + 1, state.media.duration ?? Infinity) : n.end;
  seek(n.start, end); film.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); notice('已复制到剪贴板'); }
  catch { $('copy-fallback').value = text; $('copy-dialog').showModal(); $('copy-fallback').select(); }
}
$('refresh').addEventListener('click', guarded(loadList));
$('episode-list').addEventListener('change', e => {
  const select = e.target.closest('[data-episode-status]');
  if (select) {
    select.dataset.status = select.value;
    const old = state.episodes.find(x => x.ep === Number(select.dataset.episodeStatus));
    select.closest('tr').querySelector('[data-save-status]').disabled = select.value === old.status;
  }
});
$('episode-list').addEventListener('click', guarded(async e => {
  const folderButton = e.target.closest('[data-open-release]');
  if (folderButton) {
    if (folderButton.disabled) return;
    folderButton.disabled = true; folderButton.textContent = '正在打开…';
    try { await api(`episodes/${folderButton.dataset.openRelease}/open-release-folder`, { method: 'POST', body: '{}' }); notice('已请求打开发布文件夹'); }
    finally { folderButton.disabled = false; folderButton.textContent = '发布文件夹'; }
    return;
  }
  const button = e.target.closest('[data-save-status]');
  if (!button || button.disabled) return;
  const ep = Number(button.dataset.saveStatus), old = state.episodes.find(x => x.ep === ep), select = button.closest('tr').querySelector('[data-episode-status]');
  button.disabled = true; select.disabled = true; button.textContent = '保存中…';
  try { await api(`episodes/${ep}`, { method: 'PATCH', body: JSON.stringify({ status: select.value, expectedStatus: old.status }) }); await loadList(); notice(`第${ep}期状态已保存`); }
  catch (error) { button.disabled = false; select.disabled = false; button.textContent = '保存'; throw error; }
}));
$('search').addEventListener('input', renderList); $('status-filter').addEventListener('change', renderList);
document.querySelectorAll('[data-route]').forEach(b => b.addEventListener('click', () => {
  if (!canLeave()) return; persistDraft(); state.route = b.dataset.route;
  document.querySelectorAll('[data-route]').forEach(x => x.classList.toggle('active', x === b));
  if (location.hash !== overviewHash()) location.hash = overviewHash(); else renderList();
}));
$('back').addEventListener('click', () => { if (canLeave()) { persistDraft(); location.hash = overviewHash(); } });
$('library-select').addEventListener('change', () => {
  if (cleanup.isBusy() || !canLeave()) { $('library-select').value = state.library; return; }
  persistDraft(); location.hash = '#library=' + $('library-select').value;
});
document.querySelector('.brand').addEventListener('click', e => { if (!canLeave()) e.preventDefault(); else persistDraft(); });
$('media-select').addEventListener('change', guarded(async () => {
  const id = $('media-select').value;
  if (!canLeave()) { $('media-select').value = state.media?.id || ''; return; }
  persistDraft(); $('note-editor').hidden = true; await loadMedia(id);
}));
$('show-candidates').addEventListener('change', () => renderMediaSelect());
$('restore-media').addEventListener('click', guarded(restoreArchivedMedia));
$('acts').addEventListener('click', guarded(async e => { const id = e.target.closest('[data-act-media]')?.dataset.actMedia; if (id && canLeave()) { persistDraft(); $('note-editor').hidden = true; renderMediaSelect(id); await loadMedia(id); } }));
$('chapters').addEventListener('click', e => { const b = e.target.closest('[data-seek]'); if (b) seek(Number(b.dataset.seek)); });
film.addEventListener('timeupdate', () => { if (state.stopAt !== null && film.currentTime >= state.stopAt) { film.pause(); state.stopAt = null; } updateCue(); });
film.addEventListener('error', () => { if (film.getAttribute('src')) { $('record').disabled = true; notice('视频无法播放或文件已变化，请重新载入并检查文件。', true); } });
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', guarded(async () => {
  state.tab = b.dataset.tab; state.activeCue = -1;
  document.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b))); await renderMaterial();
})));
$('material-content').addEventListener('click', guarded(async e => {
  const cue = e.target.closest('[data-time]'); if (cue) seek(Number(cue.dataset.time));
  if (e.target.closest('[data-full-text]')) await renderMaterial(true);
  const plan = e.target.closest('[data-plan-document]');
  if (plan) await renderMaterial(true, state.media.relatedPlans.find(p => p.id === plan.dataset.planDocument));
  if (e.target.closest('[data-copy-publish]')) { const text = $('material-content').querySelector('[data-publish-text]')?.dataset.publishText; if (text) await copyText(text); }
}));
$('record').addEventListener('click', newNote); $('note-editor').addEventListener('submit', guarded(saveNote));
$('note-editor').addEventListener('input', persistDraft);
$('cancel-note').addEventListener('click', () => { if (!hasDraft() || confirm('放弃这条未保存的意见吗？')) { try { localStorage.removeItem(draftKey()); } catch {} $('note-editor').hidden = true; state.edit = null; } });
$('note-scope').addEventListener('change', renderNotes); $('note-status').addEventListener('change', renderNotes);
$('note-list').addEventListener('click', guarded(async e => {
  const jump = e.target.closest('[data-note-jump]'); if (jump) await jumpNote(jump.dataset.noteJump);
  const edit = e.target.closest('[data-edit-note]');
  if (edit && canLeave()) {
    const n = state.notes.find(x => x.id === edit.dataset.editNote); state.edit = n; state.target = { ...n, id: n.mediaId }; state.requestId = null;
    showEditor(n.start, n.end, n.text, n.resolution); $('note-text').focus();
  }
  const del = e.target.closest('[data-delete-note]');
  if (del && confirm('删除这条修改意见？')) { const n = state.notes.find(x => x.id === del.dataset.deleteNote); await api(`${epUrl()}/feedback/${n.id}`, { method: 'DELETE', body: JSON.stringify({ revision: n.revision }) }); state.selected.delete(n.id); await loadNotes(); notice('意见已删除'); }
}));
$('note-list').addEventListener('change', guarded(async e => {
  if (e.target.dataset.selectNote) { const id = e.target.dataset.selectNote; if (e.target.checked) state.selected.add(id); else state.selected.delete(id); }
  if (e.target.dataset.noteStatus) {
    const n = state.notes.find(x => x.id === e.target.dataset.noteStatus);
    try { await api(`${epUrl()}/feedback/${n.id}`, { method: 'PATCH', body: JSON.stringify({ revision: n.revision, status: e.target.value }) }); await loadNotes(); notice('意见状态已保存'); }
    catch (error) { e.target.value = n.status; throw error; }
  }
}));
$('copy-notes').addEventListener('click', guarded(async () => {
  const items = state.selected.size ? state.notes.filter(x => state.selected.has(x.id)) : visibleNotes();
  if (!items.length) throw new Error('当前筛选中没有可复制的意见');
  await copyText(feedbackText(state.detail, items));
}));
window.addEventListener('beforeunload', e => { if (hasDraft()) { persistDraft(); e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('hashchange', guarded(() => { persistDraft(); return route(); }));
const cleanup = initCleanup({ api, notice, getLibrary: () => state.library, getLibraryName: () => state.libraries.find(x => x.id === state.library)?.name, getEpisodes: () => state.episodes, afterDelete: loadList });
guarded(async () => {
  const response = await fetch('/api/workbench/libraries');
  const config = await response.json(); if (!response.ok) throw new Error(config.error || '视频库配置读取失败');
  state.libraries = config.libraries;
  $('library-select').innerHTML = config.libraries.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  await route();
})();
