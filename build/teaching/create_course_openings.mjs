#!/usr/bin/env node
// 用途：从正式 A/B/C 模板生成本期三个课程开场源目录。
// 运行：node build/teaching/create_course_openings.mjs --episode-dir <目录> --topic <主题词> --audio <开场WAV> --topic-start <秒>。
// 依赖：Node.js、ffprobe，以及 templates/course-opening-3x4 正式模板。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
const STYLES = ["a", "b", "c"];
const MIN_TOPIC_START = 1.27;
const MIN_END_HOLD = 0.9;
const MANIFEST_NAME = ".course-opening-generator.json";

function defaultProbeDuration(audioPath) {
  return Number(execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", audioPath],
    { encoding: "utf8", shell: false },
  ).trim());
}

function replaceRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`开场模板缺少 ${label}`);
  return source.replace(pattern, replacement);
}

function updateDurations(source, duration, audioDuration) {
  let result = replaceRequired(
    source,
    /(<main\b[^>]*\bdata-duration=")[^"]+("[^>]*>)/u,
    `$1${duration}$2`,
    "main data-duration",
  );
  result = replaceRequired(
    result,
    /(<audio\b[^>]*\bdata-duration=")[^"]+("[^>]*>)/u,
    `$1${audioDuration}$2`,
    "audio data-duration",
  );
  return replaceRequired(
    result,
    /(\bconst\s+DUR\s*=\s*)[0-9.]+(\s*;)/u,
    `$1${duration}$2`,
    "const DUR",
  );
}

function htmlText(value) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function jsonStringContent(value) {
  return JSON.stringify(value)
    .slice(1, -1)
    .replace(/'/gu, "\\u0027")
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026");
}

function applyOpeningVariables(source, variables) {
  const replacements = new Map([
    ["__OPENING_LEAD_HTML__", htmlText(variables.lead)],
    ["__OPENING_LEAD_JSON__", jsonStringContent(variables.lead)],
    ["__OPENING_TOPIC_HTML__", htmlText(variables.topic)],
    ["__OPENING_TOPIC_JSON__", jsonStringContent(variables.topic)],
    ["__OPENING_TOPIC_START__", String(variables.topicStart)],
  ]);
  let result = source;
  for (const [token, value] of replacements) {
    if (!result.includes(token)) throw new Error(`开场模板缺少变量占位符：${token}`);
    result = result.replaceAll(token, () => value);
  }
  return result;
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    })
    .sort();
}

function createInputFingerprint({ plans, sharedDirectories, audioPath, variables, duration, audioDuration }) {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ variables, duration, audioDuration }));
  for (const plan of plans) {
    hash.update(plan.style);
    hash.update(plan.html);
  }
  for (const directory of sharedDirectories) {
    hash.update(path.basename(directory));
    for (const filePath of listFiles(directory)) {
      hash.update(path.relative(directory, filePath));
      hash.update(fs.readFileSync(filePath));
    }
  }
  hash.update(fs.readFileSync(audioPath));
  return hash.digest("hex");
}

function filesMatch(left, right) {
  return fs.existsSync(right) && fs.readFileSync(left).equals(fs.readFileSync(right));
}

export function createCourseOpenings({
  templateRoot = path.join(PROJECT_ROOT, "templates", "course-opening-3x4"),
  episodeDir,
  topic,
  audioPath,
  topicStart,
  probeDuration = defaultProbeDuration,
}) {
  const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
  if (!normalizedTopic) throw new Error("主题词不能为空");
  if (!episodeDir) throw new Error("缺少本期目录");
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error(`开场音频不存在：${audioPath ?? ""}`);

  const audioDuration = Number(probeDuration(audioPath));
  if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
    throw new Error("开场音频时长必须是有限正数");
  }
  const duration = Math.ceil(audioDuration * 30) / 30;
  const numericTopicStart = Number(topicStart);
  const latestTopicStart = duration - MIN_END_HOLD;
  if (!Number.isFinite(numericTopicStart)
    || numericTopicStart < MIN_TOPIC_START
    || numericTopicStart > latestTopicStart) {
    throw new Error(`主题词朗读起点必须位于 ${MIN_TOPIC_START} 到 ${latestTopicStart.toFixed(3)} 秒之间`);
  }

  const absoluteTemplateRoot = path.resolve(templateRoot);
  const outputRoot = path.resolve(episodeDir, "style-options", "opening");
  const sharedDirectories = ["assets", "fonts"].map((directory) => path.join(absoluteTemplateRoot, directory));
  for (const source of sharedDirectories) {
    if (!fs.existsSync(source)) throw new Error(`开场模板缺少 ${path.basename(source)} 目录`);
  }

  const variables = {
    lead: "今天要学习的是",
    topic: normalizedTopic,
    topicStart: numericTopicStart,
  };
  const variablesText = `${JSON.stringify(variables, null, 2)}\n`;
  const plans = STYLES.map((style) => {
    const sourcePath = path.join(absoluteTemplateRoot, style, "index.html");
    if (!fs.existsSync(sourcePath)) throw new Error(`开场模板不存在：${sourcePath}`);
    const source = fs.readFileSync(sourcePath, { encoding: "utf8" });
    return {
      style,
      html: updateDurations(applyOpeningVariables(source, variables), duration, audioDuration),
    };
  });
  const fingerprint = createInputFingerprint({
    plans,
    sharedDirectories,
    audioPath,
    variables,
    duration,
    audioDuration,
  });
  const outputs = STYLES.map((style) => ({
    style,
    source: path.join(outputRoot, style, "index.html"),
  }));
  const manifestPath = path.join(outputRoot, MANIFEST_NAME);

  if (fs.existsSync(outputRoot)) {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`开场输出目录已存在且缺少生成清单，拒绝覆盖：${outputRoot}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, { encoding: "utf8" }));
    const invalidOutput = outputs.some(({ style, source }) => {
      const outputDir = path.join(outputRoot, style);
      if (!fs.existsSync(source)
        || !fs.existsSync(path.join(outputDir, "variables.json"))
        || fs.readFileSync(path.join(outputDir, "variables.json"), { encoding: "utf8" }) !== variablesText
        || !filesMatch(audioPath, path.join(outputDir, "narration.wav"))) {
        return true;
      }
      return sharedDirectories.some((directory) => listFiles(directory).some((filePath) => !filesMatch(
        filePath,
        path.join(outputDir, path.basename(directory), path.relative(directory, filePath)),
      )));
    });
    if (manifest.fingerprint !== fingerprint) {
      throw new Error(`开场输出目录已有不同输入，拒绝覆盖：${outputRoot}`);
    }
    if (invalidOutput) {
      throw new Error(`开场输出目录产物缺失或内容不一致，拒绝覆盖：${outputRoot}`);
    }
    return { outputRoot, outputs, audioDuration, duration, reused: true };
  }

  fs.mkdirSync(outputRoot, { recursive: true });
  for (const plan of plans) {
    const outputDir = path.join(outputRoot, plan.style);
    fs.mkdirSync(outputDir, { recursive: true });
    for (const sharedDirectory of sharedDirectories) {
      fs.cpSync(
        sharedDirectory,
        path.join(outputDir, path.basename(sharedDirectory)),
        { recursive: true },
      );
    }
    fs.writeFileSync(
      path.join(outputDir, "index.html"),
      plan.html,
      { encoding: "utf8" },
    );
    fs.writeFileSync(
      path.join(outputDir, "variables.json"),
      variablesText,
      { encoding: "utf8" },
    );
    fs.copyFileSync(audioPath, path.join(outputDir, "narration.wav"));
  }
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({ version: 1, fingerprint }, null, 2)}\n`,
    { encoding: "utf8" },
  );

  return { outputRoot, outputs, audioDuration, duration, reused: false };
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("参数必须按 --名称 值 成对提供");
    }
    values.set(key, value);
  }
  const allowed = new Set(["--episode-dir", "--topic", "--audio", "--topic-start", "--template-root"]);
  const unknown = [...values.keys()].filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`未知参数：${unknown.join("、")}`);
  for (const required of ["--episode-dir", "--topic", "--audio", "--topic-start"]) {
    if (!values.has(required)) throw new Error(`缺少参数：${required}`);
  }
  return {
    episodeDir: values.get("--episode-dir"),
    topic: values.get("--topic"),
    audioPath: values.get("--audio"),
    topicStart: Number(values.get("--topic-start")),
    ...(values.has("--template-root") ? { templateRoot: values.get("--template-root") } : {}),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const result = createCourseOpenings(parseArgs(process.argv.slice(2)));
    console.log(`${result.reused ? "已复用" : "已生成"} A/B/C 三个开场源目录：${result.outputRoot}`);
    console.log(`音频 ${result.audioDuration.toFixed(3)} 秒，画布 ${result.duration.toFixed(3)} 秒。`);
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
