// 用途：06原版12000点形状采样、curl扰动、深度光斑及两层辉光的工作副本。
// 运行：由形变接续.js调用同一时间轴，不运行原例播放器。
// 依赖：core.js；原例算法保留，本期形状和时刻单独传入。
window.createMorph06Core=function(N=12000){
const {E,clamp,inv,lerp,spring}=Reel;
/* deterministic random */
let seed = 1234567; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/* sample N points inside a shape drawn on an offscreen canvas; returns Float32Array xyz (world units) */
function samplePoints(drawFn, scale, depth) {
  const cw = 1000, ch = 520, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; drawFn(g, cw, ch);
  const d = g.getImageData(0, 0, cw, ch).data, pts = [], edge = [];
  const A = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch) ? 0 : d[(y * cw + x) * 4 + 3];
  for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) if (A(x, y) > 128) {
    pts.push([x, y]);
    if (A(x - 3, y) < 128 || A(x + 3, y) < 128 || A(x, y - 3) < 128 || A(x, y + 3) < 128) edge.push([x, y]);
  }
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const p = (rnd() < 0.38 && edge.length) ? edge[Math.floor(rnd() * edge.length)] : pts[Math.floor(rnd() * pts.length)];
    out[i * 3] = (p[0] + rnd() * 2 - cw / 2) * scale;
    out[i * 3 + 1] = -(p[1] + rnd() * 2 - ch / 2) * scale;
    out[i * 3 + 2] = (rnd() - 0.5) * depth;
  }
  return out;
}
/* noise for swirl */
const nz = (x, y, z) => Math.sin(x * 1.7 + Math.sin(y * 2.3 + z)) * Math.cos(y * 1.3 - Math.sin(z * 1.9 + x));
function curl(x, y, z) {
  const e = 0.08;
  return [nz(x, y + e, z) - nz(x, y - e, z), nz(x, y, z + e) - nz(x, y, z - e), nz(x + e, y, z) - nz(x - e, y, z)];
}

/* sprites */
function sprite(r, soft) { const c = document.createElement('canvas'); c.width = c.height = r * 2; const g = c.getContext('2d'); const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(soft, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c; }
const tint = {};
function tinted(rgb, r, soft) { const key = rgb.join(',') + r; if (tint[key]) return tint[key]; const s = sprite(r, soft); const g = s.getContext('2d'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgb(${rgb})`; g.fillRect(0, 0, r * 2, r * 2); return (tint[key] = s); }


return {samplePoints,curl,tinted,rnd};
};
