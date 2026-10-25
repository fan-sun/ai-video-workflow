// 用途：保存与具体视频版本绑定的本地修改意见。
// 使用：createFeedbackStore(项目根目录, 媒体详情读取函数)。
// 依赖：Node.js内置模块及media.mjs，不修改制作台账。
import { mkdir, readFile, writeFile, rename, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WorkbenchError } from './media.mjs';
const statuses = ['待处理', '待复核', '已解决'];

export function createFeedbackStore(root, resolveMedia) {
  const queues = new Map();
  function file(ep) {
    if (!Number.isInteger(Number(ep)) || Number(ep) < 1) throw new WorkbenchError('期号无效');
    return path.join(root, '.local/video-workbench', String(Number(ep)), 'feedback.json');
  }
  async function checkDirectory(target, create = false) {
    const dir = path.dirname(target);
    if (create) await mkdir(dir, { recursive: true });
    try {
      const actual = await realpath(dir), base = await realpath(root), rel = path.relative(base, actual);
      if (rel.startsWith('..') || path.isAbsolute(rel)) throw new WorkbenchError('意见目录超出项目', 403);
      try {
        const actualFile = await realpath(target), relFile = path.relative(base, actualFile);
        if (relFile.startsWith('..') || path.isAbsolute(relFile)) throw new WorkbenchError('意见文件链接超出项目', 403);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    } catch (e) { if (e.code !== 'ENOENT' || create) throw e; }
  }
  async function list(ep) {
    const p = file(ep); await checkDirectory(p);
    try {
      const d = JSON.parse(await readFile(p, 'utf8'));
      if (!Array.isArray(d.items)) throw new WorkbenchError('意见文件格式错误，请保留原文件并检查', 500);
      return d.items;
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  async function change(ep, fn) {
    const p = file(ep), previous = queues.get(p) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const items = await list(ep), result = await fn(items);
      await checkDirectory(p, true);
      const temp = `${p}.${randomUUID()}.tmp`;
      try { await writeFile(temp, `${JSON.stringify({ schema_version: 1, items }, null, 2)}\n`, 'utf8'); await rename(temp, p); }
      finally { await rm(temp, { force: true }); }
      return result;
    });
    queues.set(p, task);
    try { return await task; } finally { if (queues.get(p) === task) queues.delete(p); }
  }
  function validate(item, duration) {
    if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 10000) throw new WorkbenchError('意见须为1—10000字');
    if (!Number.isFinite(item.start) || item.start < 0 || item.start > duration || (item.end !== null && (!Number.isFinite(item.end) || item.end < item.start || item.end > duration))) throw new WorkbenchError('时间范围无效或超出视频时长');
    if (!statuses.includes(item.status)) throw new WorkbenchError('意见处理状态无效');
    if (typeof item.resolution !== 'string' || item.resolution.length > 10000) throw new WorkbenchError('处理说明过长或格式无效');
  }
  async function create(ep, input) {
    if (!input || typeof input !== 'object') throw new WorkbenchError('意见内容无效');
    const m = await resolveMedia(ep, input.mediaId);
    if (m.sha256 !== input.sha256) throw new WorkbenchError('视频文件已变化，请重新载入后保存；意见正文仍可保留', 409);
    if (!Number.isFinite(m.spec?.duration)) throw new WorkbenchError('无法核对实际视频时长，请检查ffprobe和视频文件', 409);
    const now = new Date().toISOString();
    const item = { id: randomUUID(), ep: Number(ep), mediaId: m.id, path: m.path, sha256: m.sha256, version: m.version, scope: m.scope, act: m.act || null, duration: m.spec.duration, start: input.start, end: input.end ?? null, text: input.text, status: '待处理', resolution: '', createdAt: now, updatedAt: now, revision: 1, requestId: input.requestId || randomUUID() };
    validate(item, item.duration);
    return change(ep, items => {
      const existing = items.find(x => x.requestId === item.requestId);
      if (existing) {
        if (existing.sha256 !== item.sha256 || existing.text !== item.text || existing.start !== item.start || existing.end !== item.end) throw new WorkbenchError('此提交已保存且内容不同，请重新载入', 409);
        return existing;
      }
      items.push(item); return item;
    });
  }
  async function update(ep, id, input) {
    return change(ep, items => {
      const item = items.find(x => x.id === id);
      if (!item) throw new WorkbenchError('意见不存在', 404);
      if (input.revision !== item.revision) throw new WorkbenchError('意见已被修改，请重新载入；当前输入不会自动覆盖', 409);
      const allowed = ['revision', 'text', 'start', 'end', 'status', 'resolution', 'reviewMediaId'];
      if (Object.keys(input).some(k => !allowed.includes(k))) throw new WorkbenchError('不支持的意见字段');
      const next = { ...item };
      for (const k of ['text', 'start', 'end', 'status', 'resolution']) if (Object.hasOwn(input, k)) next[k] = input[k];
      validate(next, item.duration);
      items[items.indexOf(item)] = { ...next, revision: item.revision + 1, updatedAt: new Date().toISOString() };
      return items.find(x => x.id === id);
    });
  }
  async function remove(ep, id, revision) {
    return change(ep, items => {
      const i = items.findIndex(x => x.id === id);
      if (i < 0) throw new WorkbenchError('意见不存在', 404);
      if (items[i].revision !== revision) throw new WorkbenchError('意见已被修改，请重新载入', 409);
      items.splice(i, 1); return { deleted: true };
    });
  }
  return { list, create, update, remove };
}
