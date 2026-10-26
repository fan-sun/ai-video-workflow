// 用途：启动内层项目独立的视频审片工作台。
// 运行：在项目根目录执行npm run workbench。
// 依赖：Node.js 22.9以上；媒体规格核对需ffprobe。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createWorkbenchStore } from './store.mjs';
import { createFeedbackStore } from './feedback-store.mjs';
import { createCleanupStore } from './cleanup-store.mjs';
import { sendFile, fingerprint, WorkbenchError } from './media.mjs';
const directory = path.dirname(fileURLToPath(import.meta.url));
const cleanupRequestLimit = 1_000_000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
function sendJson(res, code, value) { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); }
async function body(req, limit = 100000) {
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > limit) throw new WorkbenchError('请求内容过大', 413); }
  try { const d = JSON.parse(text); if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(); return d; }
  catch { throw new WorkbenchError('请求须为有效JSON对象'); }
}
function openDirectory(directory) {
  if (process.platform !== 'win32') throw new WorkbenchError('打开发布文件夹目前需要Windows资源管理器', 501);
  return new Promise((resolve, reject) => {
    // 资源管理器需要显示为用户可见的窗口。
    const child = spawn('explorer.exe', [directory], { windowsHide: false, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
export function createWorkbenchServer({ root = path.resolve(directory, '..'), legacyRoot = path.resolve(root, '..'), publicDirectory = path.join(directory, 'public'), openFolder = openDirectory } = {}) {
  const roots = { current: root };
  if (legacyRoot && existsSync(path.join(legacyRoot, 'course/episodes.json'))) roots.legacy = legacyRoot;
  const services = new Map(Object.entries(roots).map(([id, base]) => {
    const store = createWorkbenchStore(base);
    return [id, { store, feedback: createFeedbackStore(base, store.mediaDetail) }];
  }));
  const names = { current: '当前视频库（内层）', legacy: '历史视频库（外层）' };
  const cleanup = createCleanupStore(roots, path.join(root, '.local/video-workbench/cleanup'));
  return createServer(async (req, res) => {
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; frame-ancestors 'none'");
    try {
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL('http://' + req.headers.host).hostname)) throw new WorkbenchError('工作台只接受本机地址访问', 403);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
        if (new URL(req.headers.origin).host !== req.headers.host) throw new WorkbenchError('拒绝其他网站操作本地工作台', 403);
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const staticName = { '/': 'index.html', '/workbench.css': 'workbench.css', '/workbench.js': 'workbench.js', '/cleanup-ui.js': 'cleanup-ui.js', '/utils.mjs': 'utils.mjs' }[url.pathname];
      if (req.method === 'GET' && staticName) {
        res.writeHead(200, { 'content-type': types[path.extname(staticName)], 'cache-control': 'no-store' });
        res.end(await readFile(path.join(publicDirectory, staticName))); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/workbench/libraries') { sendJson(res, 200, { libraries: Object.keys(roots).map(id => ({ id, name: names[id] })), default: 'current' }); return; }
      const scope = /^\/api\/workbench\/libraries\/([^/]+)(\/.*)$/.exec(url.pathname);
      const library = scope?.[1] || 'current', selected = services.get(library);
      if (!selected) throw new WorkbenchError('视频库不存在', 404);
      const { store, feedback } = selected, routePath = scope ? '/api/workbench' + scope[2] : url.pathname;
      if (req.method === 'POST' && routePath === '/api/workbench/cleanup/preview') {
        const input = await body(req);
        if (Object.keys(input).some(k => k !== 'episodes')) throw new WorkbenchError('清理预览只接受期号选择');
        sendJson(res, 200, await cleanup.preview(library, input.episodes)); return;
      }
      if (req.method === 'POST' && routePath === '/api/workbench/cleanup/apply') { sendJson(res, 200, await cleanup.apply(library, await body(req, cleanupRequestLimit))); return; }
      if (req.method === 'GET' && routePath === '/api/workbench/episodes') { sendJson(res, 200, { ...await store.list(), library, libraryName: names[library] }); return; }
      const match = /^\/api\/workbench\/episodes\/(\d+)(?:\/(file|text|media|feedback|open-release-folder|restore-media)(?:\/([\w-]+))?)?$/.exec(routePath);
      if (match) {
        const [, ep, kind, id] = match;
        if (!kind && req.method === 'GET') { sendJson(res, 200, { ...await store.detail(ep), library, libraryName: names[library] }); return; }
        if (!kind && req.method === 'PATCH') { sendJson(res, 200, await store.updateStatus(ep, await body(req))); return; }
        if (kind === 'restore-media' && id && req.method === 'POST') {
          if (Object.keys(await body(req)).length) throw new WorkbenchError('只能恢复本期登记的归档视频，不能指定路径');
          sendJson(res, 200, await store.restoreMedia(ep, id)); return;
        }
        if (kind === 'open-release-folder' && !id && req.method === 'POST') {
          if (Object.keys(await body(req)).length) throw new WorkbenchError('只能打开本期登记的发布文件夹，不能指定其他路径');
          const folder = await store.releaseFolder(ep);
          await openFolder(folder.absolute);
          sendJson(res, 200, { opened: true, path: folder.path }); return;
        }
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
      sendJson(res, status, { error: status === 500 ? `读取或保存失败：${error.message}` : error.message, ...(Number.isInteger(error.deletedCount) ? { partial: { deletedCount: error.deletedCount, deletedBytes: error.deletedBytes, auditPath: error.auditPath } } : {}) });
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
