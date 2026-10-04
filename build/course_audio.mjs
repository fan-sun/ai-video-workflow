#!/usr/bin/env node
/**
 * 课程线配音后处理：气口控制
 *   读 script.json（segments: id/text/tts_text/subtitle_units/pause_after）和各 <audio_dir>/<id>.wav
 *   → 裁掉每句首尾静音 → 按 pause_after 拼接 → 整轨变速 → 出 act.wav + phrase_timings.json
 *
 * 用法：node build/course_audio.mjs <script.json> <audio_dir> [out_name] [--out-dir <dir>] [--speed 1.15] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SUBTITLE_BOUNDARY_RE = /[，；：。？！]/u;

export function splitSubtitleText(text) {
  const source = String(text ?? "").trim();
  if (!source) return [""];

  const parts = [];
  let current = "";
  for (const char of source) {
    current += char;
    if (SUBTITLE_BOUNDARY_RE.test(char)) {
      parts.push(current);
      current = "";
    }
  }
  if (current) parts.push(current);

  const merged = [];
  for (const rawPart of parts) {
    const part = rawPart.replace(/^[\s*]+/u, "").trim();
    if (!part) continue;
    const readableLength = [...part.replace(/[\p{White_Space}*]/gu, "")].length;
    if (merged.length > 0 && readableLength < 5) merged[merged.length - 1] += part;
    else merged.push(part);
  }
  return merged.length > 0 ? merged : [""];
}

function unitError(segmentId, index, message) {
  const location = index === undefined ? "" : ` unit[${index}]`;
  return new Error(`segment ${segmentId}${location}: ${message}`);
}

export function resolveSubtitleUnits(segment) {
  const segmentId = segment.id;
  if (typeof segment.text !== "string" || !segment.text.trim()) {
    throw unitError(segmentId, undefined, "text 必须是非空字符串");
  }
  if (Object.hasOwn(segment, "tts_text")
    && (typeof segment.tts_text !== "string" || !segment.tts_text.trim())) {
    throw unitError(segmentId, undefined, "tts_text 必须是非空字符串");
  }
  const parentText = segment.text;
  const parentTtsText = segment.tts_text ?? parentText;
  const parentTextsDiffer = parentTtsText.trim() !== parentText.trim();

  if (segment.subtitle_units === undefined) {
    const texts = splitSubtitleText(parentText);
    if (parentTextsDiffer && texts.length > 1) {
      throw unitError(segmentId, undefined, "父 tts_text 与 text 不同，多个自动字幕单元无法隐式映射");
    }
    return texts.map((text, index) => {
      const unit = { id: `${segmentId}.u${String(index + 1).padStart(2, "0")}`, text };
      if (parentTextsDiffer) unit.tts_text = parentTtsText;
      return unit;
    });
  }

  const units = segment.subtitle_units;
  if (!Array.isArray(units) || units.length === 0) {
    throw unitError(segmentId, undefined, "subtitle_units 必须是非空数组");
  }

  const ids = new Set();
  units.forEach((unit, index) => {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) {
      throw unitError(segmentId, index, "必须是对象");
    }
    if (typeof unit.id !== "string" || !unit.id.trim()) {
      throw unitError(segmentId, index, "id 必须非空");
    }
    if (ids.has(unit.id)) throw unitError(segmentId, index, `id ${unit.id} 重复`);
    ids.add(unit.id);
    if (typeof unit.text !== "string" || !unit.text.trim()) {
      throw unitError(segmentId, index, "text 必须非空");
    }
    if (Object.hasOwn(unit, "tts_text") && (typeof unit.tts_text !== "string" || !unit.tts_text.trim())) {
      throw unitError(segmentId, index, "tts_text 必须非空");
    }
  });

  if (units.map((unit) => unit.text).join("").trim() !== parentText.trim()) {
    throw unitError(segmentId, undefined, "显示文本拼接必须严格等于父 text");
  }
  if (units.map((unit) => unit.tts_text ?? unit.text).join("").trim() !== String(parentTtsText).trim()) {
    throw unitError(segmentId, undefined, "朗读文本拼接必须严格等于父 tts_text ?? text");
  }
  return units;
}

export function resolveAllSubtitleUnits(segments) {
  const segmentOwners = new Map();
  segments.forEach((segment, index) => {
    if (segmentOwners.has(segment.id)) {
      throw new Error(`segment ${segment.id} 重复: segment[${segmentOwners.get(segment.id)}] 与 segment[${index}]`);
    }
    segmentOwners.set(segment.id, index);
  });

  const unitOwners = new Map();
  return segments.map((segment) => {
    const units = resolveSubtitleUnits(segment);
    for (const unit of units) {
      const owner = unitOwners.get(unit.id);
      if (owner !== undefined) {
        throw new Error(`unit id ${unit.id} 重复: segment ${owner} 与 segment ${segment.id}`);
      }
      unitOwners.set(unit.id, segment.id);
    }
    return units;
  });
}

const round3 = (value) => +value.toFixed(3);
const MILLISECOND_ALIGNMENT_TOLERANCE = 1e-9;
const SAFE_IDENTIFIER_RE = /^[A-Za-z0-9_-]+$/;
const COURSE_AUDIO_SAMPLE_RATE = 48000;
const DEFAULT_COURSE_AUDIO_SPEED = 1.15;

export function roundHalfUp2(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("两位时间必须是有限非负数");
  }
  const milliseconds = value * 1000;
  const roundedMilliseconds = Math.round(milliseconds);
  if (!Number.isSafeInteger(roundedMilliseconds)
    || Math.abs(milliseconds - roundedMilliseconds) > MILLISECOND_ALIGNMENT_TOLERANCE) {
    throw new Error("两位时间必须是三位毫秒对齐值");
  }
  const hundredths = Math.floor(roundedMilliseconds / 10)
    + (roundedMilliseconds % 10 >= 5 ? 1 : 0);
  return hundredths / 100;
}

export function assertSafeIdentifier(value, field) {
  if (typeof value !== "string" || !SAFE_IDENTIFIER_RE.test(value)) {
    throw new Error(`${field} 必须匹配 [A-Za-z0-9_-]+`);
  }
  return value;
}

export function assertPathInsideDirectory(file, directory, role, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const base = pathApi.resolve(directory);
  const target = pathApi.resolve(file);
  const relative = pathApi.relative(base, target);
  if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative)) {
    throw new Error(`${role} 路径必须位于目录内: ${directory}，实际为 ${file}`);
  }
}

export function ffconcatFileLine(file) {
  if (/[\r\n]/u.test(file)) throw new Error(`ffconcat 路径不得包含回车或换行: ${file}`);
  return `file '${file.replace(/\\/gu, "\\\\").replace(/'/gu, "'\\''")}'`;
}

const subtitleUnitWeight = (unit) => [...String(unit.tts_text ?? unit.text).replace(/\p{White_Space}/gu, "")].length;

function validateSubtitleUnitWeights(segmentId, units) {
  const weights = units.map((unit) => subtitleUnitWeight(unit));
  units.forEach((unit, index) => {
    if (weights[index] <= 0) {
      throw new Error(`segment ${segmentId} unit ${unit.id}: 有效朗读权重必须大于 0`);
    }
  });
  if (weights.reduce((sum, weight) => sum + weight, 0) <= 0) {
    throw new Error(`segment ${segmentId}: 字幕总朗读权重必须大于 0`);
  }
  return weights;
}

export function allocateSubtitleUnitTimings(units, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("字幕父边界 start 和 end 必须有限且满足 end > start");
  }
  const weights = units.map((unit) => subtitleUnitWeight(unit));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cumulativeWeight = 0;
  const boundaries = [round3(start)];

  for (let index = 0; index < units.length - 1; index += 1) {
    cumulativeWeight += weights[index];
    boundaries.push(round3(start + ((end - start) * cumulativeWeight) / totalWeight));
  }
  boundaries.push(round3(end));

  const timings = units.map((unit, index) => ({
    id: unit.id,
    text: unit.text,
    start: boundaries[index],
    end: boundaries[index + 1],
    dur: round3(boundaries[index + 1] - boundaries[index]),
  }));
  if (totalWeight <= 0 || timings.some((unit) => unit.end <= unit.start || unit.dur <= 0)) {
    const parentMilliseconds = Math.round((round3(end) - round3(start)) * 1000);
    throw new Error(`父时长 ${parentMilliseconds}ms / 字幕权重无法为 ${units.length} 个 unit 在 1ms 精度下分配正时长`);
  }
  if (timings.some((unit) => roundHalfUp2(unit.end) <= roundHalfUp2(unit.start))) {
    throw new Error("字幕 unit 在两位时间精度下必须保持正时长");
  }
  return timings;
}

export function buildTimingMetadata(segs, outName, resolvedUnits = resolveAllSubtitleUnits(segs)) {
  const phrases = [];
  let current = 0;

  segs.forEach((segment, index) => {
    if (!Number.isFinite(segment.gap) || segment.gap < 0) {
      throw new Error(`segment ${segment.id}: gap 必须是有限且大于等于 0 的数`);
    }
    if (!Number.isFinite(segment.d) || segment.d <= 0) {
      throw new Error(`segment ${segment.id}: duration 必须是有限正数`);
    }
    const start = current;
    const end = start + segment.d;
    const roundedStart = round3(start);
    const roundedEnd = round3(end);
    const phrase = {
      id: segment.id,
      text: segment.text,
      start: roundedStart,
      end: roundedEnd,
      dur: round3(roundedEnd - roundedStart),
      gap: segment.gap,
    };
    if (typeof segment.tts_text === "string" && segment.tts_text.trim()) phrase.tts_text = segment.tts_text;
    phrase.subtitle_units = allocateSubtitleUnitTimings(resolvedUnits[index], start, end);
    phrases.push(phrase);

    current = end;
    if (segment.gap > 0 && index < segs.length - 1) current += segment.gap;
  });

  return {
    out: `${outName}.wav`,
    total: round3(current),
    count: segs.length,
    phrases,
    caption_timing: {
      version: 1,
      parent_boundary: "trimmed_wav_ffprobe",
      unit_boundary: "tts_character_weight_ratio",
      accuracy: "semantic_estimate",
    },
  };
}

export function scaleTimingMetadata(metadata, outputDuration, speed) {
  if (!Number.isFinite(metadata?.total) || metadata.total <= 0) {
    throw new Error("原始 timings.total 必须是有限正数");
  }
  if (!Number.isFinite(outputDuration) || outputDuration <= 0) {
    throw new Error("变速后 WAV 时长必须是有限正数");
  }
  const ratio = outputDuration / metadata.total;
  const scaleRange = (item) => {
    const start = round3(item.start * ratio);
    const end = round3(item.end * ratio);
    return { ...item, start, end, dur: round3(end - start) };
  };
  const scaled = {
    ...metadata,
    total: round3(outputDuration),
    speed,
    phrases: metadata.phrases.map((phrase) => ({
      ...scaleRange(phrase),
      gap: round3(phrase.gap * ratio),
      subtitle_units: phrase.subtitle_units.map(scaleRange),
    })),
  };
  for (const phrase of scaled.phrases) {
    const ranges = [{ item: phrase, label: `phrase ${phrase.id}` }, ...phrase.subtitle_units.map((unit) => ({
      item: unit,
      label: `phrase ${phrase.id} unit ${unit.id}`,
    }))];
    for (const { item, label } of ranges) {
      if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start || item.dur <= 0) {
        throw new Error(`变速后 ${label} 在 1ms 精度下必须保持正时长`);
      }
      if (roundHalfUp2(item.end) <= roundHalfUp2(item.start)) {
        throw new Error(`变速后 ${label} 在两位时间精度下必须保持正时长`);
      }
    }
    if (phrase.subtitle_units[0]?.start !== phrase.start
      || phrase.subtitle_units.at(-1)?.end !== phrase.end
      || phrase.subtitle_units.some((unit, index) => index > 0
        && phrase.subtitle_units[index - 1].end !== unit.start)) {
      throw new Error(`变速后 phrase ${phrase.id} 的字幕边界必须连续并贴合父级`);
    }
  }
  return scaled;
}

export function parseArgs(argv) {
  const positional = [];
  let outDir;
  let force = false;
  let speed = DEFAULT_COURSE_AUDIO_SPEED;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      force = true;
    } else if (arg === "--speed") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--speed 需要数值参数");
      speed = Number(value);
      if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
        throw new Error("--speed 必须是 0.5 到 2 之间的数值");
      }
      index += 1;
    } else if (arg === "--out-dir") {
      outDir = argv[index + 1];
      if (!outDir || outDir.startsWith("--")) throw new Error("--out-dir 需要目录参数");
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`未知参数: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2 || positional.length > 3) {
    throw new Error("用法: node build/course_audio.mjs <script.json> <audio_dir> [out_name] [--out-dir <dir>] [--speed 1.15] [--force]");
  }
  return {
    scriptPath: positional[0],
    audioDir: positional[1],
    outName: positional[2] ?? "act",
    outDir,
    force,
    speed,
  };
}

export function resolveOutputPaths(options) {
  const outputRoot = options.outDir ?? options.audioDir;
  return {
    outputRoot,
    trimDir: path.join(outputRoot, "trim"),
    outWav: path.join(outputRoot, `${options.outName}.wav`),
    timingsPath: path.join(outputRoot, `${options.outName}_timings.json`),
  };
}

export function findExistingFinalOutputs(paths, existsFn = fs.existsSync) {
  return [paths.outWav, paths.timingsPath].filter((file) => existsFn(file));
}

export function pathComparisonKey(file, platform = process.platform) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const key = pathApi.resolve(pathApi.normalize(file));
  return platform === "win32" ? key.toLowerCase() : key;
}

export function assertOutputDoesNotOverwriteSegmentAudio(options, segments, paths) {
  const seenIds = new Map();
  const rawInputs = options.scriptPath ? [{ file: options.scriptPath, role: "script 输入" }] : [];
  const writeTargets = [];
  const addWriteTarget = (file, role) => writeTargets.push({ file, role });

  segments.forEach((segment, index) => {
    if (seenIds.has(segment.id)) {
      throw new Error(`segment ${segment.id} 重复: segment[${seenIds.get(segment.id)}] 与 segment[${index}]`);
    }
    seenIds.set(segment.id, index);
    rawInputs.push({ file: path.join(options.audioDir, `${segment.id}.wav`), role: `原始音频 segment ${segment.id}` });
    addWriteTarget(path.join(paths.trimDir, `${segment.id}.wav`), `裁切目标 segment ${segment.id}`);
  });

  const silenceOwners = new Map();
  segments.forEach((segment, index) => {
    const gap = +(segment.pause_after ?? 0);
    if (gap > 0 && index < segments.length - 1 && !silenceOwners.has(gap)) silenceOwners.set(gap, segment.id);
  });
  for (const [gap, segmentId] of silenceOwners) {
    addWriteTarget(path.join(paths.trimDir, `_sil_${gap}.wav`), `静音目标 segment ${segmentId}`);
  }
  addWriteTarget(paths.outWav, "最终 WAV");
  addWriteTarget(paths.timingsPath, "timings JSON");
  addWriteTarget(path.join(paths.trimDir, "concat.txt"), "concat.txt");

  const rawByKey = new Map(rawInputs.map((entry) => [pathComparisonKey(entry.file), entry]));
  const writesByKey = new Map();
  for (const target of writeTargets) {
    const key = pathComparisonKey(target.file);
    const raw = rawByKey.get(key);
    if (raw) {
      throw new Error(`${target.role} 与 ${raw.role} 冲突: 写入路径 ${target.file}，原始路径 ${raw.file}`);
    }
    const previous = writesByKey.get(key);
    if (previous) {
      throw new Error(`${target.role} 与 ${previous.role} 冲突: 路径 ${target.file}`);
    }
    writesByKey.set(key, target);
  }
}

const commandOptions = { shell: false, stdio: ["ignore", "pipe", "pipe"] };
const run = (program, args, runCommand = execFileSync) => runCommand(program, args, commandOptions).toString().trim();
const duration = (file, runCommand = execFileSync) => parseFloat(run(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
  runCommand,
));

export function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  assertSafeIdentifier(options.outName, "outName");
  const paths = resolveOutputPaths(options);
  const readFileSync = dependencies.readFileSync ?? fs.readFileSync;
  const existsSync = dependencies.existsSync ?? fs.existsSync;
  const mkdirSync = dependencies.mkdirSync ?? fs.mkdirSync;
  const writeFileSync = dependencies.writeFileSync ?? fs.writeFileSync;
  const runCommand = dependencies.runCommand ?? dependencies.execSync ?? execFileSync;
  const existing = findExistingFinalOutputs(paths, existsSync);
  if (existing.length > 0 && !options.force) {
    throw new Error(`最终输出已存在，拒绝覆盖: ${existing.join(", ")}；如需覆盖请使用 --force`);
  }

  const script = JSON.parse(readFileSync(options.scriptPath, "utf8"));
  if (!Array.isArray(script.segments)) throw new Error("script.segments 必须是数组");
  assertOutputDoesNotOverwriteSegmentAudio(options, script.segments, paths);
  script.segments.forEach((segment) => assertSafeIdentifier(segment.id, "segment id"));
  const resolvedUnits = resolveAllSubtitleUnits(script.segments);
  script.segments.forEach((segment, index) => {
    const raw = path.join(options.audioDir, `${segment.id}.wav`);
    const trimmed = path.join(paths.trimDir, `${segment.id}.wav`);
    assertPathInsideDirectory(raw, options.audioDir, `segment ${segment.id} raw`);
    assertPathInsideDirectory(trimmed, paths.trimDir, `segment ${segment.id} trim`);
    if (!existsSync(raw)) throw new Error(`缺音频: ${raw}`);
    const gap = +(segment.pause_after ?? 0);
    if (!Number.isFinite(gap) || gap < 0) {
      throw new Error(`segment ${segment.id}: pause_after 必须是有限且大于等于 0 的数`);
    }
    validateSubtitleUnitWeights(segment.id, resolvedUnits[index]);
  });
  mkdirSync(paths.trimDir, { recursive: true });

  // 双向裁静音（reverse 技巧），阈值 -50dB：只吃静音不吃字。
  const threshold = "-50dB";
  const trimFilter = `silenceremove=start_periods=1:start_silence=0:start_threshold=${threshold}:detection=peak,areverse,silenceremove=start_periods=1:start_silence=0:start_threshold=${threshold}:detection=peak,areverse`;
  const segs = [];

  for (const segment of script.segments) {
    const raw = path.join(options.audioDir, `${segment.id}.wav`);
    const trimmed = path.join(paths.trimDir, `${segment.id}.wav`);
    const gap = +(segment.pause_after ?? 0);
    run(
      "ffmpeg",
      ["-y", "-i", raw, "-af", trimFilter, "-ar", String(COURSE_AUDIO_SAMPLE_RATE), "-ac", "1", trimmed, "-loglevel", "error"],
      runCommand,
    );
    const trimmedDuration = duration(trimmed, runCommand);
    if (!Number.isFinite(trimmedDuration) || trimmedDuration <= 0) {
      throw new Error(`segment ${segment.id}: ffprobe duration 必须是有限正数`);
    }
    segs.push({
      id: segment.id,
      text: segment.text,
      ...(Object.hasOwn(segment, "tts_text") ? { tts_text: segment.tts_text } : {}),
      ...(Object.hasOwn(segment, "subtitle_units") ? { subtitle_units: segment.subtitle_units } : {}),
      gap,
      wav: trimmed,
      d: trimmedDuration,
    });
  }

  const gaps = [...new Set(segs.slice(0, -1).map((segment) => segment.gap).filter((gap) => gap > 0))];
  const silenceFile = (gap) => path.join(paths.trimDir, `_sil_${gap}.wav`);
  for (const gap of gaps) {
    run(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", `anullsrc=r=${COURSE_AUDIO_SAMPLE_RATE}:cl=mono`, "-t", String(gap), silenceFile(gap), "-loglevel", "error"],
      runCommand,
    );
  }

  const listPath = path.join(paths.trimDir, "concat.txt");
  const lines = [];
  segs.forEach((segment, index) => {
    lines.push(ffconcatFileLine(path.resolve(segment.wav)));
    if (segment.gap > 0 && index < segs.length - 1) lines.push(ffconcatFileLine(path.resolve(silenceFile(segment.gap))));
  });
  writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

  run(
    "ffmpeg",
    [
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-af", `atempo=${options.speed}`,
      "-ar", String(COURSE_AUDIO_SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le",
      paths.outWav, "-loglevel", "error",
    ],
    runCommand,
  );
  const outputDuration = duration(paths.outWav, runCommand);
  const metadata = scaleTimingMetadata(
    buildTimingMetadata(segs, options.outName, resolvedUnits),
    outputDuration,
    options.speed,
  );
  writeFileSync(paths.timingsPath, JSON.stringify(metadata, null, 2), "utf8");

  console.log(`${segs.length} 句 → ${paths.outWav}  ${options.speed}x  总时长 ${metadata.total.toFixed(2)}s`);
  console.log(`每句: ${metadata.phrases.map((item) => `${item.id}(${item.dur}s)`).join(" ")}`);
  console.log(`时间轴 → ${paths.timingsPath}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
