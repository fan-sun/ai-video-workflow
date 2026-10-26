// 用途：从保留的发布母版读取或恢复已明确归档的相同视频副本。
// 使用：由工作台及生产工具导入；归档只由清理执行器登记。
// 依赖：Node.js内置模块；不修改制作索引和原确认记录。
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const registry = '.local/video-workbench/retained-media.json';
const hashes = new Map();
const slash = value => value.replaceAll('\\', '/');
const error = message => Object.assign(new Error(message), { status: 409 });
function checked(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[a-z]:/i.test(relative)) throw error('归档路径无效');
  const absolute = path.resolve(root, relative), rel = path.relative(path.resolve(root), absolute);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw error('归档路径越界');
  let current = path.resolve(root), stat;
  for (const part of ['', ...rel.split(path.sep)]) {
    current = path.join(current, part);
    try { stat = fs.lstatSync(current); } catch (e) { if (e.code === 'ENOENT') return { absolute, stat: null }; throw e; }
    if (stat.isSymbolicLink()) throw error('归档路径含链接或junction');
  }
  return { absolute, stat };
}
function digest(absolute, stat = fs.statSync(absolute)) {
  const key = [absolute, stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
  if (!hashes.has(key)) {
    const hash = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024), fd = fs.openSync(absolute, 'r');
    try { let count; while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count)); }
    finally { fs.closeSync(fd); }
    hashes.set(key, hash.digest('hex'));
    if (hashes.size > 100) hashes.delete(hashes.keys().next().value);
  }
  return hashes.get(key);
}
export function readRetainedMedia(root) {
  const file = checked(root, registry);
  if (!file.stat) return { schema: 1, copies: [] };
  const data = JSON.parse(fs.readFileSync(file.absolute, { encoding: 'utf8' }));
  if (data.schema !== 1 || !Array.isArray(data.copies)) throw error('成片归档记录格式不正确');
  for (const entry of data.copies) masterFile(root, entry);
  return data;
}
function masterFile(root, entry) {
  for (const value of [entry.path, entry.master]) if (typeof value !== 'string' || slash(value) !== value || path.posix.normalize(value) !== value) throw error('成片归档路径无效');
  const prefix = /^(pipeline\/output\/(?:course|teaching|vibe)\/ep\d+_[a-z0-9-]+\/)/i.exec(entry.path || '')?.[1];
  if (!prefix || typeof entry.master !== 'string' || !entry.master.startsWith(prefix) || !/\.mp4$/i.test(entry.path) || !/\.mp4$/i.test(entry.master) || entry.path.toLowerCase() === entry.master.toLowerCase() || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1) throw error('成片归档记录的母版或摘要无效');
  checked(root, entry.path);
  const file = checked(root, entry.master);
  if (!file.stat?.isFile() || file.stat.size !== entry.bytes || digest(file.absolute, file.stat) !== entry.sha256) throw error('保留发布母版缺失或已变化，不能代替归档副本');
  return { absolute: file.absolute, path: entry.master, archived: true };
}
export function resolveRetainedMedia(root, relative) {
  const original = checked(root, relative);
  if (original.stat || !/\.mp4$/i.test(relative)) return { absolute: original.absolute, path: relative, archived: false };
  const entry = readRetainedMedia(root).copies.find(item => item.path === slash(relative));
  return entry ? masterFile(root, entry) : { absolute: original.absolute, path: relative, archived: false };
}
export function assertRetainedOutputWritable(root, absolute) {
  const key = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (readRetainedMedia(root).copies.some(entry => key(path.resolve(root, entry.master)) === key(absolute))) throw error('该发布文件是保留母版，不能覆盖；修改内容请另存新版本');
}
export function recordRetainedMedia(root, entry) {
  masterFile(root, entry);
  const original = checked(root, entry.path);
  if (!original.stat?.isFile() || original.stat.size !== entry.bytes || original.stat.nlink !== 1 || digest(original.absolute, original.stat) !== entry.sha256) throw error('待归档副本与母版不一致');
  const data = readRetainedMedia(root);
  data.copies = data.copies.filter(item => item.path !== entry.path);
  data.copies.push({ ...entry, archivedAt: new Date().toISOString() });
  const file = checked(root, registry);
  fs.mkdirSync(path.dirname(file.absolute), { recursive: true }); checked(root, registry);
  const temp = file.absolute + '.' + randomUUID() + '.tmp', fd = fs.openSync(temp, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8' }); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file.absolute); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
export function restoreRetainedMedia(root, relative) {
  const entry = readRetainedMedia(root).copies.find(item => item.path === slash(relative));
  if (!entry) throw error('该视频没有已登记的恢复记录');
  const master = masterFile(root, entry), original = checked(root, entry.path);
  if (original.stat) {
    if (!original.stat.isFile() || digest(original.absolute, original.stat) !== entry.sha256) throw error('原路径已存在其他内容，拒绝覆盖');
    return { restored: false, path: entry.path };
  }
  fs.mkdirSync(path.dirname(original.absolute), { recursive: true }); checked(root, entry.path);
  const temp = original.absolute + '.' + randomUUID() + '.restore.tmp';
  try {
    fs.copyFileSync(master.absolute, temp, fs.constants.COPYFILE_EXCL);
    if (digest(temp) !== entry.sha256) throw error('恢复副本校验失败');
    checked(root, entry.path);
    // 原子地创建新路径且不覆盖其他文件；临时副本独立于母版，不共享母版inode。
    fs.linkSync(temp, original.absolute);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  return { restored: true, path: entry.path };
}
