// 用途：在独立工作区重跑短教学示例，验证配音到发布包的技术链路。
// 运行：npm run example -- <prepare|audio|video|package>
// 依赖：已通过 doctor 的环境；固定示例不记录用户确认或公开发布事实。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { initCourseEpisode } from "../../build/init_course_episode.mjs";
import { extractActNarration, splitNarrationText, buildSegments } from "../../build/course_act_split_preview.mjs";
import { createCourseOpenings } from "../../build/create_course_openings.mjs";
import { resolveChromeExecutable, readPngDimensions } from "../../build/check_course_cover.mjs";
import { makeActHtml } from "./visuals.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = path.resolve(process.env.COURSE_EXAMPLE_DIR || path.join(ROOT, ".local/context-window"));
const EPISODE = "01-context-window";
const INDEX = `course/episodes/${EPISODE}/制作索引.json`;
const TITLES = ["请求范围", "输入容量", "输出空间", "使用边界"];
const HIGHLIGHTS = ["上下文窗口", "输入和输出", "工作台", "对话历史", "回答", "模型的说明", "预留空间", "清楚组织"];
const formatClock = seconds => {
  const rounded = Math.round(seconds);
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
};
const read = relative => JSON.parse(fs.readFileSync(path.join(WORK, relative), "utf8"));
const write = (relative, value) => {
  const file = path.join(WORK, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n", "utf8");
};
const hash = file => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function run(command, args, cwd = WORK) {
  const env = { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  for (const key of ["VOXCPM_MODEL", "VOXCPM_SRC", "VOXCPM_REF_WAV", "VOXCPM_REF_TEXT_FILE"]) {
    if (env[key]) env[key] = path.resolve(ROOT, env[key]);
  }
  for (const key of ["COURSE_PYTHON", "CHROME_PATH", "COURSE_COVER_CHROME", "COURSE_GIT_BASH", "PUPPETEER_ROOT"]) {
    if (env[key] && /[\\/]/u.test(env[key])) env[key] = path.resolve(ROOT, env[key]);
  }
  const executable = command === process.env.COURSE_PYTHON ? env.COURSE_PYTHON : command;
  const result = spawnSync(executable, args, { cwd, stdio: "inherit", windowsHide: true, env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 失败，退出码 ${result.status}`);
}
const node = (script, args = []) => run(process.execPath, [script, ...args]);

function prepare() {
  const source = path.join(ROOT, "examples/context-window/script.md");
  const sourceHash = hash(source);
  let saved;
  if (fs.existsSync(path.join(WORK, ".example-input.json"))) {
    saved = read(".example-input.json");
    if (saved.source_hash !== sourceHash || saved.scripts.some(item => !fs.existsSync(path.join(WORK, item.path)) || hash(path.join(WORK, item.path)) !== item.hash)) {
      throw new Error("示例输入已变更或缺失，请指定新的 COURSE_EXAMPLE_DIR；不覆盖已有素材");
    }
  }
  fs.mkdirSync(WORK, { recursive: true });
  for (const dir of ["build", "templates", "pipeline/02_audio"]) {
    fs.mkdirSync(path.join(WORK, dir), { recursive: true });
  }
  for (const file of fs.readdirSync(path.join(ROOT, "build"))) {
    if (/\.(?:mjs|py)$/u.test(file) && !file.endsWith(".test.mjs")) fs.copyFileSync(path.join(ROOT, "build", file), path.join(WORK, "build", file));
  }
  for (const template of ["course-explainer-3x4", "course-opening-3x4"]) {
    fs.cpSync(path.join(ROOT, "templates", template), path.join(WORK, "templates", template), { recursive: true });
  }
  for (const file of ["voxcpm_tts.py", "tts_mappings.json"]) fs.copyFileSync(path.join(ROOT, "pipeline/02_audio", file), path.join(WORK, "pipeline/02_audio", file));
  if (saved) {
    console.log(`复用示例工作区并同步通用工具：${WORK}`);
    return;
  }
  initCourseEpisode(WORK, EPISODE, { topic: "上下文窗口" });
  const index = read(INDEX);
  const markdown = fs.readFileSync(source, "utf8");
  index.script = `course/scripts/${EPISODE}.md`;
  write(index.script, markdown);
  const previewActs = [];
  index.acts.forEach((act, i) => {
    const paragraphs = extractActNarration(markdown, i + 1);
    const segments = buildSegments(paragraphs.flatMap(text => splitNarrationText(text).chunks));
    segments.forEach(segment => { segment.subtitle_units = [{ id: `${segment.id}.u01`, text: segment.text }]; });
    if (i === 0) segments[0].subtitle_units = [{ id: `${segments[0].id}.u01`, text: "今天要学习的是" }, { id: `${segments[0].id}.u02`, text: "上下文窗口。" }];
    act.script = `pipeline/01_script/${EPISODE}/course_ep01_act${i + 1}.json`;
    write(act.script, { segments });
    previewActs.push({ act: i + 1, segments });
    act.subtitle_highlights = segments.map((segment, j) => ({ unit_id: i === 0 && j === 0 ? `${segment.id}.u02` : `${segment.id}.u01`, text: HIGHLIGHTS[i * 2 + j], reason: "示例知识锚点" }));
    act.allowed_warnings = { gsap_studio_edit_blocked: 1 };
  });
  index.split_preview = `course/episodes/${EPISODE}/旁白切分预览.json`;
  index.chapter_titles = TITLES;
  index.example = { purpose: "技术验收", fixed_style: "A", user_confirmations: null };
  write(index.split_preview, { preview_only: true, acts: previewActs });
  write(INDEX, index);
  write(".example-input.json", { source_hash: sourceHash, scripts: index.acts.map(act => ({ path: act.script, hash: hash(path.join(WORK, act.script)) })) });
  console.log(`示例工作区：${WORK}`);
}

function audio() {
  const index = read(INDEX);
  const python = process.env.COURSE_PYTHON || "python";
  const jobs = index.acts.flatMap(act => ["--job", act.script, `pipeline/02_audio/${EPISODE}/course_ep01_act${act.act}_voxcpm_raw`]);
  if (!fs.existsSync(path.join(WORK, ".raw-complete.json"))) {
    if (index.acts.some(act => fs.existsSync(path.join(WORK, `pipeline/02_audio/${EPISODE}/course_ep01_act${act.act}_voxcpm_raw`)))) throw new Error("原始配音目录已存在但没有完成记录，请使用新示例工作区重跑");
    run(python, ["pipeline/02_audio/voxcpm_tts.py", ...jobs]);
    const files = index.acts.flatMap(act => read(act.script).segments.map(segment => `pipeline/02_audio/${EPISODE}/course_ep01_act${act.act}_voxcpm_raw/${segment.id}.wav`));
    write(".raw-complete.json", files.map(file => ({ path: file, hash: hash(path.join(WORK, file)) })));
  } else {
    for (const item of read(".raw-complete.json")) if (!fs.existsSync(path.join(WORK, item.path)) || hash(path.join(WORK, item.path)) !== item.hash) throw new Error("原始音频缺失或改变，请使用新示例工作区");
  }
  for (const act of index.acts) {
    const out = `pipeline/02_audio/${EPISODE}/course_ep01_act${act.act}_voxcpm`;
    act.audio = `${out}/act${act.act}.wav`;
    act.timings = `${out}/act${act.act}_timings.json`;
    if (!fs.existsSync(path.join(WORK, act.audio)) && !fs.existsSync(path.join(WORK, act.timings))) {
      node("build/course_audio.mjs", [act.script, `${out}_raw`, `act${act.act}`, "--out-dir", out, "--speed", "1.15"]);
    }
    run("ffmpeg", ["-v", "error", "-i", act.audio, "-f", "null", "-"]);
    if (read(act.timings).speed !== 1.15) throw new Error("示例音频必须使用 1.15 倍速");
  }
  node("build/course_outro_tail.mjs", [index.acts[3].audio, index.acts[3].timings]);
  index.timeline_summary = `course/episodes/${EPISODE}/整期时间表.json`;
  node("build/course_timeline_summary.mjs", ["--out", index.timeline_summary, ...index.acts.map(act => act.timings)]);
  index.publish_spec.duration_s = read(index.timeline_summary).total_s;
  write(INDEX, index);
  console.log("四幕技术音频完成，用户试听状态未登记。");
}

function video() {
  const index = read(INDEX);
  const first = read(index.acts[0].timings).phrases[0];
  const openingAudio = `course/episodes/${EPISODE}/opening.wav`;
  if (!fs.existsSync(path.join(WORK, openingAudio))) run("ffmpeg", ["-v", "error", "-i", index.acts[0].audio, "-t", String(first.end), "-c:a", "pcm_s16le", openingAudio]);
  const openings = createCourseOpenings({ templateRoot: path.join(WORK, "templates/course-opening-3x4"), episodeDir: path.join(WORK, `course/episodes/${EPISODE}`), topic: "上下文窗口", audioPath: path.join(WORK, openingAudio), topicStart: first.subtitle_units[1].start });
  const openingDir = path.dirname(openings.outputs[0].source);
  const openingVideo = path.join(openingDir, "opening.mp4");
  if (!fs.existsSync(openingVideo)) node("build/hyperframes_hidden.mjs", ["render", openingDir, "--output", openingVideo, "--workers", "2", "--browser-gpu", "--gpu"]);
  index.selected_style = { id: "A", template: "templates/course-opening-3x4/a/index.html", source: "技术示例固定预设" };
  index.acts.forEach(act => {
    const timings = read(act.timings);
    act.visual_source = `course/acts/ep01_context-window/act${act.act}.html`;
    const source = makeActHtml(act.act, timings);
    const file = path.join(WORK, act.visual_source);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== source) throw new Error("示例画面输入变化，请指定新工作区");
    write(act.visual_source, source);
    act.motion_check = { crop: "880:650:100:370", max_still_s: 6 };
    // 静态 lint 不能解析字幕循环里的 p.s / p.e，真实边界由 timings 和字幕回归测试核验。
    act.allowed_warnings = { gsap_studio_edit_blocked: 1, overlapping_gsap_tweens: 1 };
  });
  index.acts[0].opening_overlay = { video: path.relative(WORK, openingVideo).replaceAll("\\", "/"), duration_s: first.end, fade_s: 0 };
  const cover = `course/episodes/${EPISODE}/cover-options/a.html`;
  const coverSource = fs.readFileSync(path.join(ROOT, "examples/context-window/cover.html"), "utf8");
  write(cover, coverSource);
  node("build/check_course_cover.mjs", [cover, "--out", `course/episodes/${EPISODE}/cover-qc`]);
  const qc = read(`course/episodes/${EPISODE}/cover-qc/a.json`);
  index.cover_output = `course/episodes/${EPISODE}/cover.png`;
  fs.copyFileSync(qc.screenshot, path.join(WORK, index.cover_output));
  index.cover_upload_output = `course/episodes/${EPISODE}/cover-2x.png`;
  run(resolveChromeExecutable(), ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2", "--window-size=1080,1440", "--virtual-time-budget=3000", `--screenshot=${path.join(WORK, index.cover_upload_output)}`, new URL("file:///" + path.join(WORK, cover).replaceAll("\\", "/")).href]);
  const size = readPngDimensions(path.join(WORK, index.cover_upload_output));
  if (size.width !== 2160 || size.height !== 2880) throw new Error("平台封面像素尺寸错误");
  index.cover_selection = { id: "A", source: "技术示例固定配置，不代表用户确认" };
  write(INDEX, index);
  node("build/course_video.mjs", ["review", INDEX]);
  console.log(`审片样例：${path.join(WORK, read(INDEX).review_output)}`);
}

function packageVideo() {
  const index = read(INDEX);
  const timeline = read(index.timeline_summary);
  index.publish_copy = "pipeline/output/course/ep01_context-window/v1/course_ep01_context-window_v1.txt";
  const labels = ["第一幕", "第二幕", "第三幕", "第四幕"];
  const chapters = timeline.acts.map((act, i) => `${formatClock(act.start_s)}–${formatClock(act.end_s)}　${labels[i]} · ${TITLES[i]}`).join("\n");
  write(index.publish_copy, `【标题】\n上下文窗口是什么\n\n【发布文案】\n用一张工作台理解上下文窗口：输入占空间，输出也要留位置。\n\n【标签】\n#AI #AI基础 #深度讲解\n\n【视频总结】\n上下文窗口限定一次请求可处理的信息范围。问题、历史对话和参考资料都可能占用容量，回答也需要预留空间。具体上限以模型说明为准，窗口增大不保证理解提升，实际使用时仍需清楚组织关键信息。\n\n【视频章节】\n${chapters}\n`);
  write(INDEX, index);
  node("build/course_video.mjs", ["publish", INDEX]);
  console.log(`技术发布包：${path.join(WORK, read(INDEX).publish_output)}`);
}

try {
  const stage = process.argv[2];
  if (!new Set(["prepare", "audio", "video", "package"]).has(stage)) throw new Error("用法：npm run example -- <prepare|audio|video|package>");
  prepare();
  if (stage === "audio") audio();
  if (stage === "video") video();
  if (stage === "package") packageVideo();
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
