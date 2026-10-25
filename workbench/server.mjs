// 用途：启动内层项目独立的视频审片工作台。
// 运行：在项目根目录执行npm run workbench。
// 依赖：Node.js 22.9以上；媒体规格核对需ffprobe。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createWorkbenchStore } from './store.mjs';
import { createFeedbackStore } from './feedback-store.mjs';
import { sendFile, fingerprint, WorkbenchError } from './media.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function sendJson(res, code, value) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 100000) throw new WorkbenchError('意见内容过大', 413); }
  try { const d = JSON.parse(text); if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(); return d; }
  catch { throw new WorkbenchError('请求须为有效JSON对象'); }
}
export function createWorkbenchServer({ root = path.resolve(directory, '..'), publicDirectory = path.join(directory, 'public') } = {}) {
  const store = createWorkbenchStore(root), feedback = createFeedbackStore(root, store.mediaDetail);
  return createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'");
    try {
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
        if (new URL(req.headers.origin).host !== req.headers.host) throw new WorkbenchError('拒绝其他网站修改本地意见', 403);
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const staticName = { '/': 'index.html', '/workbench.css': 'workbench.css', '/workbench.js': 'workbench.js', '/utils.mjs': 'utils.mjs' }[url.pathname];
      if (req.method === 'GET' && staticName) {
        res.writeHead(200, { 'content-type': types[path.extname(staticName)], 'cache-control': 'no-store' });
        res.end(await readFile(path.join(publicDirectory, staticName))); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/workbench/episodes') { sendJson(res, 200, await store.list()); return; }
      const match = /^\/api\/workbench\/episodes\/(\d+)(?:\/(file|text|media|feedback)(?:\/([\w-]+))?)?$/.exec(url.pathname);
      if (match) {
        const [, ep, kind, id] = match;
        if (!kind && req.method === 'GET') { sendJson(res, 200, await store.detail(ep)); return; }
        if (!kind && req.method === 'PATCH') { sendJson(res, 200, await store.updateStatus(ep, await body(req))); return; }
        if (kind === 'media' && id && req.method === 'GET') { sendJson(res, 200, await store.mediaDetail(ep, id)); return; }
        if (['file', 'text'].includes(kind) && id && ['GET', 'HEAD'].includes(req.method)) {
          const f = await store.asset(ep, id);
          if (!f.exists) throw new WorkbenchError('材料文件不存在', 404);
          if (kind === 'text') {
            if (!['.md', '.txt', '.json'].includes(path.extname(f.path).toLowerCase()) || f.size > 2000000) throw new WorkbenchError('该材料不是可直接查看的文本');
            sendJson(res, 200, { path: f.path, text: await readFile(f.absolute, 'utf8') });
          } else {
            if (url.searchParams.has('sha256') && await fingerprint(f) !== url.searchParams.get('sha256')) throw new WorkbenchError('视频文件已变化，请重新载入后审片', 409);
            sendFile(req, res, f, types[path.extname(f.path).toLowerCase()] || 'application/octet-stream');
          }
          return;
        }
        if (kind === 'feedback') {
          if (!id && req.method === 'GET') { await store.detail(ep); sendJson(res, 200, { items: await feedback.list(ep) }); return; }
          if (!id && req.method === 'POST') { sendJson(res, 201, await feedback.create(ep, await body(req))); return; }
          if (id && req.method === 'PATCH') { sendJson(res, 200, await feedback.update(ep, id, await body(req))); return; }
          if (id && req.method === 'DELETE') { sendJson(res, 200, await feedback.remove(ep, id, (await body(req)).revision)); return; }
        }
      }
      throw new WorkbenchError('地址不存在', 404);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status || 500;
      if (status === 500) console.error('工作台请求失败：', error.message);
      sendJson(res, status, { error: status === 500 ? `读取或保存失败：${error.message}` : error.message });
    }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WORKBENCH_PORT || 3211);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WORKBENCH_PORT必须为有效端口');
  const server = createWorkbenchServer();
  server.on('error', error => { console.error(`工作台启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`视频工作台：http://127.0.0.1:${port}/`));
}
