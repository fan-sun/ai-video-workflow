// 用途：校验人工核验的旧产物登记及历史记录位置，不赋予任意路径删除权限。
// 使用：由cleanup-store读取所属视频库的本地登记后调用。
// 依赖：Node.js路径模块；实际文件、引用和摘要仍由清理引擎复核。
import path from 'node:path';

export const reviewedCleanupPath = '.local/video-workbench/cleanup-reviewed.json';
const relativeFile = value => typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.posix.isAbsolute(value) && !value.includes(':') && !value.split('/').some(part => !part || part === '.' || part === '..');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export function parseReviewedCleanup(text) {
  const value = JSON.parse(text);
  if (value.schema !== 1 || !Array.isArray(value.artifacts) || !Array.isArray(value.historicalReferences)) throw new Error('已核验清理登记格式无效');
  const artifacts = new Map(), historical = new Map();
  for (const item of value.artifacts) {
    if (!Number.isInteger(item.ep) || item.ep < 1 || !Number.isInteger(item.act) || item.act < 1 || !Number.isInteger(item.version) || item.version < 1 || !['image', 'font'].includes(item.kind) || !relativeFile(item.path) || !sha(item.sha256) || artifacts.has(item.path)) throw new Error('已核验产物登记无效或重复');
    if (item.kind === 'font' && (!relativeFile(item.source) || !/^(?:course|templates)\//.test(item.source) || path.posix.basename(item.source) !== path.posix.basename(item.path))) throw new Error('重复字体的保留来源登记无效');
    artifacts.set(item.path, item);
  }
  for (const item of value.historicalReferences) {
    if (!relativeFile(item.index) || !/^course\/episodes\//.test(item.index) || !item.index.endsWith('.json') || typeof item.pointer !== 'string' || !item.pointer.startsWith('/') || !relativeFile(item.value) || !item.value.endsWith('.mp4')) throw new Error('历史记录位置登记无效');
    // 当前输入和正式输出始终保护；仅可标记已经核对过的历史元信息位置。
    if (/^\/(?:source_materials|source|input|config|assets|video|current|script|formal_script|source_refs|opening_strategy|visual_plan|visual_source|visual_timing|audio|timings|sfx|timeline_summary|cover_output|cover_upload_output|voiceover_preview|version_index|publish_output|review_output|review_base_output|active_preview|visual_assets|combined_visual_output|combined_audio_output|merged_review|individual_act_videos|publish_bundle|release_video|bgm_preview)(?:\/|$)/.test(item.pointer) || (/^\/acts\//.test(item.pointer) && !/^\/acts\/\d+\/(?:previous_|withdrawn_)[^/]*$/.test(item.pointer))) throw new Error('不能将当前生产位置登记为历史记录');
    const key = item.index + '#' + item.pointer;
    if (historical.has(key)) throw new Error('历史记录位置重复登记');
    historical.set(key, item.value);
  }
  const outputConstants = value.outputConstants || [];
  if (!Array.isArray(outputConstants) || outputConstants.some(item => !relativeFile(item.source) || !/^(?:build|tools)\/.+\.(?:mjs|js|py)$/.test(item.source) || typeof item.value !== 'string' || !/^[^/\\:]+\.json$/.test(item.value) || !sha(item.sourceSha256))) throw new Error('已核实输出常量登记无效');
  return { artifacts, historical, outputConstants };
}

export function actVersion(index, actNumber) {
  const act = index?.acts?.find(item => item.act === actNumber);
  if (!act) return null;
  const versions = [act.visual_source, act.review_output, act.version].flatMap(value => [...String(value || '').matchAll(/(?:^|[/_-])v(\d+)(?=[/_.-]|$)/g)].map(match => Number(match[1])));
  const unique = [...new Set(versions)];
  return unique.length === 1 ? unique[0] : null;
}

export function reviewedArtifactReason(item, episode, index) {
  const build = /^pipeline\/build\/(?:course_|teaching_|vibe_)ep(\d+)_act(\d+)_(.*?)(?:_review|_publish)(?:_|\/)/.exec(item.path);
  const course = /^course\/episodes\/(\d+)-([^/]+)\/v(\d+)\/(act(\d+)[^/]*)\//.exec(item.path);
  let ep, act, version;
  if (build) {
    ep = Number(build[1]); act = Number(build[2]);
    version = Number(/(?:^|[_-])v(\d+)(?:$|[_-])/.exec(build[3])?.[1]);
  } else if (course) {
    ep = Number(course[1]); act = Number(course[5]); version = Number(course[3]);
    if (course[2] !== episode.slug) return '核验登记与本期主题目录不符';
  }
  if (ep !== episode.ep || ep !== item.ep || act !== item.act || version !== item.version) return '核验登记与实际期次、幕或版本目录不符';
  const current = actVersion(index, item.act);
  if (current === null || version >= current) return '当前实际使用的幕版本或版本无法确认，保留';
  if (item.kind === 'font') return build && /\.(?:woff2?|ttf|otf)$/i.test(item.path) ? null : '核验字体不属于旧构建副本';
  if (!/\.(?:png|jpe?g)$/i.test(item.path) || /\/(?:assets|source-assets|materials|inputs|fonts|素材)\//i.test(item.path)) return '核验图片不属于旧检查图片，素材原件保留';
  const checking = course ? /qc|browser|frames|playback|检查|抽帧|审片/i.test(course[4]) : /\/(?:[^/]*(?:snapshots|frames|实际成片帧|定位帧|接续实际帧|关键帧)[^/]*)\//i.test(item.path.slice(build[0].length - 1));
  return checking ? null : '核验图片不在检查图片目录';
}

// 当前记录闭包仅用于保留其图片证据；不会将旧记录视频重新提升为生产输入。
export function* currentRecordValues(value) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const child of value) yield* currentRecordValues(child);
  else if (value && typeof value === 'object') for (const [field, child] of Object.entries(value)) if (!/previous|prior|history|historical|baseline|before/i.test(field)) yield* currentRecordValues(child);
}

export function* currentRecordSeeds(value) {
  if (Array.isArray(value)) for (const child of value) yield* currentRecordSeeds(child);
  else if (value && typeof value === 'object') for (const [field, child] of Object.entries(value)) {
    if (/previous|prior|history|historical|baseline|before|archive|snapshot|trial|withdrawn|(?:revision|full_version)_v\d+/i.test(field)) continue;
    if (/report|check|review|approval|technical|validation|verification|acceptance|验收|核查|记录/i.test(field)) yield child;
    else yield* currentRecordSeeds(child);
  }
}
