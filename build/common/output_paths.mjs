// 用途：按制作路线计算新输出目录，并保留已登记的历史输出根目录。
// 运行：由审片、发布及技术示例导入，无单独 CLI。
// 依赖：Node.js 内置 path；不移动文件或修改制作索引。
import path from "node:path";

export function episodeOutputRoot(index) {
  const route = index.route ?? "course";
  if (!["course", "vibe"].includes(route)) throw new Error("未知制作路线");
  const folder = route === "vibe" ? "vibe" : "teaching";
  const recorded = [index.review_base_output, index.review_output, index.publish_output, index.publish_copy];
  for (const value of recorded) {
    const match = String(value ?? "").replaceAll("\\", "/").match(/^pipeline\/output\/(course|teaching|vibe)\//u);
    if (!match) continue;
    if (match[1] !== "course" && match[1] !== folder) throw new Error("输出目录与制作路线不匹配");
  }
  // 历史期次继续在原根目录换版；不因为重新运行命令而迁移媒体或确认记录。
  return "pipeline/output/" + (recorded.some(value =>
    String(value ?? "").replaceAll("\\", "/").startsWith("pipeline/output/course/")) ? "course" : folder);
}

export function episodeOutputPath(index, mode) {
  const name = `${index.episode}_${index.slug}`;
  return path.posix.join(episodeOutputRoot(index), name, index.current_version,
    `course_${name}_${index.current_version}${mode === "publish" ? "_publish" : ""}.mp4`);
}
