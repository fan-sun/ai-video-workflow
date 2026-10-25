// 用途：限制工作台文件访问，读取媒体身份并支持拖动播放。
// 使用：由工作台数据层和本地服务导入。
// 依赖：Node.js内置模块；真实时长读取使用已安装的ffprobe。
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const hashes = new Map();
const probes = new Map();
export class WorkbenchError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const fileId = p => createHash('sha256').update(p.replaceAll('\\', '/')).digest('hex').slice(0, 20);
export async function safeFile(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || /^[a-z]:/i.test(relative)) throw new WorkbenchError('文件路径无效');
  const base = await realpath(root), target = path.resolve(base, relative);
  const within = p => { const rel = path.relative(base, p); return rel && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel); };
  if (!within(target)) throw new WorkbenchError('文件超出项目目录', 403);
  try {
    const actual = await realpath(target);
    if (!within(actual)) throw new WorkbenchError('文件链接超出项目目录', 403);
    const info = await stat(actual);
    if (!info.isFile()) throw new WorkbenchError('目标不是文件', 400);
    return { absolute: actual, size: info.size, mtime: info.mtimeMs, ctime: info.ctimeMs, exists: true };
  } catch (e) { if (e.code === 'ENOENT') return { absolute: target, exists: false }; throw e; }
}
export async function fingerprint(file) {
  if (!file.exists) throw new WorkbenchError('视频文件不存在', 404);
  const key = `${file.absolute}:${file.size}:${file.mtime}:${file.ctime}`;
  if (!hashes.has(key)) {
    hashes.set(key, (async () => { const h = createHash('sha256'); for await (const data of createReadStream(file.absolute)) h.update(data); return h.digest('hex'); })());
    if (hashes.size > 100) hashes.delete(hashes.keys().next().value);
  }
  return hashes.get(key);
}
export async function probe(file) {
  if (!file.exists) return null;
  const key = `${file.absolute}:${file.size}:${file.mtime}:${file.ctime}`;
  if (!probes.has(key)) probes.set(key, (async () => {
    try {
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file.absolute], { windowsHide: true, timeout: 20000 });
      const d = JSON.parse(stdout), v = d.streams?.find(s => s.codec_type === 'video');
      return { duration: Number(d.format?.duration) || null, width: v?.width, height: v?.height };
    } catch (e) { return { error: e.code === 'ENOENT' ? '未找到ffprobe，无法核对媒体规格' : '无法读取媒体规格，请检查文件及ffprobe' }; }
  })());
  return probes.get(key);
}
export function sendFile(req, res, file, type) {
  if (!file.exists) throw new WorkbenchError('文件不存在', 404);
  let start = 0, end = file.size - 1, status = 200;
  if (req.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'content-range': `bytes */${file.size}` }); res.end(); return; }
    start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
    end = match[1] && match[2] ? Math.min(Number(match[2]), file.size - 1) : file.size - 1;
    if (start > end || start >= file.size) { res.writeHead(416, { 'content-range': `bytes */${file.size}` }); res.end(); return; }
    status = 206;
  }
  const headers = { 'content-type': type, 'content-length': Math.max(0, end - start + 1), 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (status === 206) headers['content-range'] = `bytes ${start}-${end}/${file.size}`;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !file.size) { res.end(); return; }
  const stream = createReadStream(file.absolute, { start, end });
  stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
