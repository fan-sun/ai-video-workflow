// 用途：检查课程制作依赖和用户配置，不加载模型或生成课程。
// 运行：npm run doctor
// 依赖：Node.js；Python、FFmpeg、Git Bash、Chrome 和 VoxCPM 由使用者安装。
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveChromeExecutable } from "./check_course_cover.mjs";

let failures = 0;
const routeAt = process.argv.indexOf("--route");
const route = routeAt < 0 ? "course" : process.argv[routeAt + 1];
if (!["course", "vibe"].includes(route)) throw new Error("--route 必须为 course 或 vibe");
function report(label, ok, detail) {
  console.log(`${ok ? "通过" : "失败"}：${label} ${detail}`);
  if (!ok) failures += 1;
}
for (const command of ["ffmpeg", "ffprobe", "git"]) {
  const result = spawnSync(command, [command === "git" ? "--version" : "-version"], { encoding: "utf8", windowsHide: true });
  report(command, result.status === 0, result.error?.message ?? result.stdout.split(/\r?\n/u)[0]);
}
const python = process.env.COURSE_PYTHON || "python";
if (route === "vibe") {
  const result = spawnSync(python, ["--version"], { encoding: "utf8", windowsHide: true });
  report("Python", result.status === 0, result.error?.message ?? result.stdout.trim());
} else {
const probe = spawnSync(python, ["-c", "import importlib.util, json, os, sys; source=os.environ.get('VOXCPM_SRC'); sys.path.insert(0, os.path.abspath(source)) if source else None; print(json.dumps({'python':sys.version.split()[0], 'voxcpm':importlib.util.find_spec('voxcpm') is not None}))"], { encoding: "utf8", windowsHide: true });
report("Python/VoxCPM", probe.status === 0 && probe.stdout.includes('"voxcpm": true'), probe.error?.message ?? probe.stdout.trim() + probe.stderr.trim());
const model = process.env.VOXCPM_MODEL || "models/VoxCPM2";
report("模型", fs.existsSync(path.join(model, "config.json")), fs.existsSync(path.join(model, "config.json")) ? model : `目录不存在或缺少 config.json：${model}`);
for (const [label, file] of [["参考声音", process.env.VOXCPM_REF_WAV || "voices/reference.wav"], ["参考文本", process.env.VOXCPM_REF_TEXT_FILE || "voices/reference.txt"]]) {
  report(label, fs.existsSync(file) && fs.statSync(file).size > 0, fs.existsSync(file) ? file : `不存在：${file}`);
}
}
for (const [label, env] of [["Chrome/封面", process.env], ["Chrome/画面", {
  ...process.env, COURSE_COVER_CHROME: process.env.CHROME_PATH || process.env.COURSE_COVER_CHROME,
}]]) {
  try {
    report(label, true, resolveChromeExecutable({ env }));
  } catch (error) { report(label, false, error.message); }
}
if (process.platform === "win32") {
  const git = spawnSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true });
  const bash = process.env.COURSE_GIT_BASH || path.resolve(git.stdout?.trim() || ".", "../../../bin/bash.exe");
  report("Git Bash", fs.existsSync(bash), fs.existsSync(bash) ? bash : `不存在：${bash}`);
}
const encoders = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], { encoding: "utf8", windowsHide: true });
report("NVENC 编码器", encoders.status === 0 && encoders.stdout.includes("h264_nvenc"), "首版视频渲染要求 NVIDIA GPU 及可用驱动；实际编码由示例验证");
process.exitCode = failures ? 1 : 0;
