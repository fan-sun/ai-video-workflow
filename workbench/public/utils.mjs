// 用途：处理审片时间与可复制的修改清单。
// 使用：浏览器页面与Node测试共同导入。
// 依赖：无。
export function formatTime(value, milliseconds = false) {
  if (!Number.isFinite(value)) return '--:--';
  const total = Math.round(Math.max(0, value) * 1000), s = Math.floor(total / 1000);
  const prefix = s >= 3600 ? `${Math.floor(s / 3600)}:` : '';
  return `${prefix}${String(Math.floor(s / 60) % (prefix ? 60 : Infinity)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}${milliseconds ? `.${String(total % 1000).padStart(3, '0')}` : ''}`;
}
export function parseTime(text) {
  const value = String(text).trim();
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(value)) throw new Error('时间格式应为分:秒，例如01:13');
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(x => x >= 60)) throw new Error('时间中的分、秒须小于60');
  return parts.reduce((sum, x) => sum * 60 + x, 0);
}
export const scopeLabel = m => m?.scope === 'act' ? `第${m.act || '?'}幕` : m?.scope === 'clip' ? '局部预览' : m?.scope === 'full' ? '整片' : '范围未核验';
export function feedbackText(episode, items) {
  return [`AI Video Workflow / 第${String(episode.ep).padStart(2, '0')}期 / ${episode.topic}`, ...items.map(x => `\n[${x.id}] ${scopeLabel(x)} · ${x.version}\n文件：${x.path}\nSHA256：${x.sha256}\n${formatTime(x.start)}${x.end > x.start ? `—${formatTime(x.end)}` : ''}｜${x.status}\n问题：${x.text}${x.resolution ? `\n处理说明：${x.resolution}` : ''}`)].join('\n');
}
