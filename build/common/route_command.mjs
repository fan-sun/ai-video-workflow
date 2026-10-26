// 用途：提供教学、Vibe 的独立命令，并在执行共用工具前核对路线。
// 运行：node build/common/route_command.mjs <course|vibe|auto> <init|review|publish|check-release> <参数...>；auto仅用于已有索引。
// 依赖：Node.js 内置模块及本仓库共用制作工具。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { initCourseEpisode } from "./init_course_episode.mjs";
import { assertRetainedOutputWritable, resolveRetainedMedia, readRetainedMedia } from "./retained_media.mjs";
import { episodeOutputPath } from "./output_paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function createRouteCommand(route, operation, args, { rootDir = process.cwd() } = {}) {
  if (!["course", "vibe", "auto"].includes(route)) throw new Error("路线必须为 course 或 vibe，通用入口可用 auto");
  if (!["review", "publish", "check-release"].includes(operation)) throw new Error("未知路线操作");
  if (!args[0]) throw new Error("缺少制作索引路径");
  const index = JSON.parse(fs.readFileSync(path.resolve(rootDir, args[0]), { encoding: "utf8" }));
  if (route === "auto") route = index.route ?? "course";
  if (!["course", "vibe"].includes(route)) throw new Error("索引制作路线无效");
  if ((index.route ?? "course") !== route) throw new Error(`路线不匹配：命令为 ${route}，索引为 ${index.route ?? "course"}`);
  if (operation === "check-release" && args.length !== 1) throw new Error("发布检查只接受制作索引路径");
  if (operation !== "check-release" && readRetainedMedia(rootDir).copies.length) {
    const output = route === "vibe" ? episodeOutputPath(index, operation) : index[operation + "_output"] || episodeOutputPath(index, operation);
    assertRetainedOutputWritable(rootDir, path.resolve(rootDir, output));
  }
  if (operation === "publish" && index.review_output && resolveRetainedMedia(rootDir, index.review_output).archived) throw new Error("整片副本已归档，请先在工作台恢复原路径，再制作新的发布版本");
  return {
    command: process.execPath,
    args: ["--env-file-if-exists=.env", path.join(HERE, operation === "check-release" ? "check_course_release.mjs" : "course_video.mjs"),
      ...(operation === "check-release" ? [] : [operation]), ...args],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [route, operation, ...args] = process.argv.slice(2);
    if (operation === "init") {
      if (!args[0] || (args.length !== 1 && (args.length !== 3 || args[1] !== "--topic" || !args[2].trim()))) {
        throw new Error("初始化用法：<course|vibe> init <NN-slug> [--topic 主题词]");
      }
      const result = initCourseEpisode(process.cwd(), args[0], { route, ...(args[2] ? { topic: args[2] } : {}) });
      console.log(`期次目录已就绪：${result.courseEpisodeDir}`);
    } else {
      const plan = createRouteCommand(route, operation, args);
      const result = spawnSync(plan.command, plan.args, { stdio: "inherit", windowsHide: true });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
