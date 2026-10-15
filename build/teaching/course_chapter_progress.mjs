// 用途：给新课程的临时构建 HTML 注入共用章节栏与移动红叶。
// 运行：由 build/common/course_video.mjs 的 review / publish 构建入口调用。
// 依赖：已确认的 chapter_titles、整期时间表和构建目录中的红叶素材。

const WIDTH = 1024;

function escapeHtml(value) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

export function injectCourseChapterProgressHtml(source, chapter) {
  if (typeof source !== "string" || !chapter || !Array.isArray(chapter.titles)
    || ![4, 6].includes(chapter.titles.length) || !Array.isArray(chapter.acts)
    || chapter.acts.length !== chapter.titles.length || !Number.isFinite(chapter.totalS)
    || chapter.totalS <= 0 || !Number.isFinite(chapter.startS)
    || !Number.isFinite(chapter.endS) || chapter.endS <= chapter.startS
    || !Number.isFinite(chapter.introEndS) || chapter.introEndS < 0) {
    throw new Error("章节栏缺少有效的标题和时间数据");
  }
  const scriptSpec = JSON.stringify(chapter).replaceAll("<", "\\u003c");
  if (source.includes('id="course-chapter-hud"')) {
    if (source.includes(`const chapterSpec=${scriptSpec};`)) return source;
    throw new Error("源 HTML 已有不同配置的章节栏");
  }

  const positions = [0, ...chapter.acts.map(({ endS }) =>
    Math.round(WIDTH * endS / chapter.totalS))];
  const cells = chapter.titles.map((title, index) => {
    const cellWidth = positions[index + 1] - positions[index];
    if (typeof title !== "string" || !title.trim() || cellWidth <= 20) {
      throw new Error(`第 ${index + 1} 章标题或进度宽度无效`);
    }
    return `<div class="course-chapter-cell" data-layout-allow-occlusion style="width:${cellWidth}px">` +
      `<span class="course-chapter-title" data-layout-ignore>${escapeHtml(title.trim())}</span></div>`;
  }).join("");
  const compact = chapter.titles.every((title, index) =>
    Array.from(title.trim()).reduce((width, character) =>
      width + (character.codePointAt(0) < 128 ? 20 : 28), 0)
      <= positions[index + 1] - positions[index] - 28);
  const startFraction = chapter.startS / chapter.totalS;
  const startX = WIDTH * startFraction;
  const endX = WIDTH * chapter.endS / chapter.totalS;
  const markup = `
<div id="course-chapter-hud"${compact ? ' class="course-chapter-compact"' : ''}
  style="opacity:${chapter.introEndS > 0 ? 0 : 1}">
  <div class="course-chapter-cells">${cells}</div>
  <div id="course-chapter-played" aria-hidden="true" data-layout-ignore
    style="width:${startX}px"></div>
  <div class="course-chapter-rail"><i id="course-chapter-fill"
    style="transform:scaleX(${startFraction})"></i></div>
  <img id="course-chapter-leaf" src="assets/red-maple-leaf.png" alt=""
    aria-hidden="true" data-layout-ignore
    style="transform:translateX(${startX}px)" />
</div>`;
  const style = `
<style id="course-chapter-style">
@font-face{font-family:CourseChapter;src:url("fonts/NotoSansSC-700.woff2") format("woff2");font-weight:700;font-display:block}
#course-chapter-hud{position:absolute;top:0;left:0;width:1080px;height:100px;z-index:90;
  background:#f6f1e6;background-image:linear-gradient(#ece5d8 1px,transparent 1px),
  linear-gradient(90deg,#ece5d8 1px,transparent 1px);background-size:52px 52px;
  color:#19354b;pointer-events:none}
.course-chapter-cells{position:absolute;top:0;left:28px;width:1024px;height:80px;display:flex}
#course-chapter-played{position:absolute;top:0;left:28px;height:80px;z-index:1;
  background:rgba(192,198,198,.48)}
.course-chapter-cell{position:relative;flex:none;height:80px;display:flex;align-items:center;
  justify-content:center;padding:0 10px;box-sizing:border-box}
.course-chapter-cell+.course-chapter-cell:before{content:"";position:absolute;left:0;top:13px;
  height:66px;border-left:2px solid #cfc8bc}
.course-chapter-title{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;
  overflow:hidden;overflow-wrap:anywhere;text-align:center;font:700 26px/1.4 CourseChapter,
  "Noto Sans SC",sans-serif;max-width:100%;max-height:80px;color:#19354b}
.course-chapter-rail{position:absolute;left:28px;top:86px;width:1024px;height:8px;background:#d8d3c8}
#course-chapter-fill{display:block;width:1024px;height:8px;background:#ef6b6b;
  transform-origin:left center}
#course-chapter-leaf{position:absolute;left:2px;top:64px;width:52px;height:52px;object-fit:contain;z-index:3}
.course-chapter-compact .course-chapter-cells{height:60px}
.course-chapter-compact #course-chapter-played{height:60px}
.course-chapter-compact .course-chapter-cell{height:60px}
.course-chapter-compact .course-chapter-cell+.course-chapter-cell:before{top:9px;height:49px}
.course-chapter-compact .course-chapter-title{font-size:28px;max-height:60px}
.course-chapter-compact .course-chapter-rail{top:66px}
.course-chapter-compact #course-chapter-leaf{top:44px}
#root>.course-brand-mark,#root .body-layer>.body-leaf,
#root .body-layer>.body-brand,#root .body-layer>.body-topic,
#root .body-layer>.body-rule{display:none!important}
</style>`;
  const script = `
<script id="course-chapter-script">
(function(){
  const chapterSpec=${scriptSpec};
  const timeline=window.__timelines?.main;
  if(!timeline)throw new Error("章节栏需要已注册的 main 时间轴");
  const duration=chapterSpec.endS-chapterSpec.startS;
  timeline.fromTo("#course-chapter-fill",
    {scaleX:chapterSpec.startS/chapterSpec.totalS},
    {scaleX:chapterSpec.endS/chapterSpec.totalS,duration,ease:"none",immediateRender:false},0);
  timeline.fromTo("#course-chapter-played",
    {width:${startX}},
    {width:${endX},duration,ease:"none",immediateRender:false},0);
  timeline.fromTo("#course-chapter-leaf",
    {x:${WIDTH}*chapterSpec.startS/chapterSpec.totalS},
    {x:${WIDTH}*chapterSpec.endS/chapterSpec.totalS,duration,ease:"none",immediateRender:false},0);
  if(chapterSpec.introEndS>0)
    timeline.set("#course-chapter-hud",{opacity:1},chapterSpec.introEndS);
})();
</script>`;

  const headEnd = source.indexOf("</head>");
  const root = source.match(/<(?:div|main)\b(?=[^>]*\bid\s*=\s*["']root["'])(?=[^>]*\bdata-composition-id\s*=\s*["']main["'])[^>]*>/iu);
  if (headEnd < 0 || !source.includes("</body>") || !root) {
    throw new Error("章节栏要求标准的 head、body 与 main 合成根节点");
  }
  let result = source.slice(0, headEnd) + style + source.slice(headEnd);
  const rootInResult = result.match(/<(?:div|main)\b(?=[^>]*\bid\s*=\s*["']root["'])(?=[^>]*\bdata-composition-id\s*=\s*["']main["'])[^>]*>/iu);
  result = result.slice(0, rootInResult.index + rootInResult[0].length)
    + markup + result.slice(rootInResult.index + rootInResult[0].length);
  const bodyEnd = result.lastIndexOf("</body>");
  return result.slice(0, bodyEnd) + script + result.slice(bodyEnd);
}
