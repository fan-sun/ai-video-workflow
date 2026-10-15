#!/usr/bin/env node
/**
 * 用途：为 第四幕 WAV 追加固定 1 秒静音，并同步更新 timings。
 * 运行：node build/teaching/course_outro_tail.mjs <act4.wav> <act4_timings.json>
 * 依赖：Node.js、FFmpeg、FFprobe；重复执行不会重复追加静音。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OUTRO_SECONDS = 1;
const DURATION_TOLERANCE_SECONDS = 0.02;

function closeTo(actual, expected) {
  return Number.isFinite(actual)
    && Math.abs(actual - expected) <= DURATION_TOLERANCE_SECONDS;
}

function readTiming(file) {
  try {
    return JSON.parse(fs.readFileSync(file, { encoding: "utf8" }));
  } catch (error) {
    throw new Error(`无法读取 timings：${file}（${error.message}）`);
  }
}

function runMedia(command, args, spawnSyncImpl, label) {
  const result = spawnSyncImpl(command, args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`${label}：${output || `${command} 执行失败`}`);
  }
  return String(result.stdout ?? "");
}

function probeAudio(file, spawnSyncImpl) {
  const output = runMedia("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,sample_rate,channels:format=duration",
    "-of", "json",
    file,
  ], spawnSyncImpl, "无法读取第四幕音频规格");
  let probe;
  try {
    probe = JSON.parse(output);
  } catch {
    throw new Error("无法读取第四幕音频规格：ffprobe 未返回有效 JSON");
  }
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration);
  if (!audio || !Number.isFinite(duration)) {
    throw new Error("第四幕音频必须包含可读取的音频流和时长");
  }
  if (Number(audio.sample_rate) !== 48000 || Number(audio.channels) !== 1) {
    throw new Error(`第四幕音频必须是 48kHz 单声道，当前为 ${audio.sample_rate}Hz/${audio.channels}声道`);
  }
  return { duration };
}

export function assertCourseSilentTail({
  audioFile,
  start,
  boundaryToleranceS = DURATION_TOLERANCE_SECONDS,
  spawnSyncImpl = spawnSync,
}) {
  if (!Number.isFinite(Number(boundaryToleranceS))
    || Number(boundaryToleranceS) < 0
    || Number(boundaryToleranceS) >= OUTRO_SECONDS) {
    throw new Error("片尾静音边界容差必须在 0 到 1 秒之间");
  }
  const result = spawnSyncImpl("ffmpeg", [
    "-v", "error",
    "-ss", String(start),
    "-i", audioFile,
    "-t", String(OUTRO_SECONDS),
    "-map", "0:a:0",
    "-ar", "48000", "-ac", "1",
    "-f", "s16le", "-",
  ], { encoding: null, windowsHide: true });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`无法读取片尾静音：${output || "ffmpeg 执行失败"}`);
  }
  const pcm = Buffer.from(result.stdout ?? []);
  const minimumBytes = Math.floor(48000 * 2 * (OUTRO_SECONDS - DURATION_TOLERANCE_SECONDS));
  if (pcm.length < minimumBytes) {
    throw new Error("片尾静音不足 1 秒");
  }
  const boundaryBytes = Math.ceil(48000 * Number(boundaryToleranceS)) * 2;
  for (let offset = boundaryBytes; offset + 1 < pcm.length; offset += 2) {
    if (Math.abs(pcm.readInt16LE(offset)) > 8) {
      throw new Error("片尾最后 1 秒必须为静音");
    }
  }
}

function lastPhraseOf(timing) {
  const lastPhrase = Array.isArray(timing?.phrases) ? timing.phrases.at(-1) : null;
  if (!lastPhrase || !Number.isFinite(Number(lastPhrase.end))) {
    throw new Error("片尾 timings 必须包含带有效 end 的最后一个 phrase");
  }
  return lastPhrase;
}

export function assertCourseOutroTailTiming(timing) {
  const lastPhrase = lastPhraseOf(timing);
  const total = Number(timing.total);
  const end = Number(lastPhrase.end);
  if (Number(lastPhrase.gap) !== OUTRO_SECONDS) {
    throw new Error("片尾最后一个 phrase 的 gap 必须是 1 秒");
  }
  if (!closeTo(total, end + OUTRO_SECONDS)) {
    throw new Error("片尾 timings.total 必须等于最后一句 end + 1 秒");
  }
  return { end, total };
}

export function assertCourseOutroTailArtifacts({
  audioFile,
  timingsFile,
  visualFile,
  spawnSyncImpl = spawnSync,
}) {
  const timing = readTiming(timingsFile);
  const { total } = assertCourseOutroTailTiming(timing);
  const audio = probeAudio(audioFile, spawnSyncImpl);
  if (!closeTo(audio.duration, total)) {
    throw new Error(`第四幕 WAV 时长 ${audio.duration} 秒与 timings.total ${total} 秒不一致`);
  }
  assertCourseSilentTail({
    audioFile,
    start: total - OUTRO_SECONDS,
    spawnSyncImpl,
  });
  const html = fs.readFileSync(visualFile, { encoding: "utf8" });
  const dataDuration = Number(html.match(/\bdata-duration\s*=\s*["']([0-9.]+)["']/u)?.[1]);
  const scriptDuration = Number(html.match(/\bconst\s+DUR\s*=\s*([0-9.]+)/u)?.[1]);
  if (!closeTo(dataDuration, total)) {
    throw new Error(`第四幕 data-duration ${dataDuration} 秒与 timings.total ${total} 秒不一致`);
  }
  if (!closeTo(scriptDuration, total)) {
    throw new Error(`第四幕 const DUR ${scriptDuration} 秒与 timings.total ${total} 秒不一致`);
  }
  return { total };
}

export function applyCourseOutroTail({
  audioFile,
  timingsFile,
  spawnSyncImpl = spawnSync,
}) {
  if (!fs.existsSync(audioFile) || !fs.statSync(audioFile).isFile()) {
    throw new Error(`第四幕音频不存在：${audioFile}`);
  }
  const timing = readTiming(timingsFile);
  const lastPhrase = lastPhraseOf(timing);
  const end = Number(lastPhrase.end);
  const expectedTotal = end + OUTRO_SECONDS;
  const audio = probeAudio(audioFile, spawnSyncImpl);

  let timingHasTail = true;
  try {
    assertCourseOutroTailTiming(timing);
  } catch {
    timingHasTail = false;
  }
  if (timingHasTail) {
    if (!closeTo(audio.duration, expectedTotal)) {
      throw new Error("timings 已记录片尾 1 秒，但第四幕 WAV 时长不一致");
    }
    assertCourseSilentTail({ audioFile, start: end, spawnSyncImpl });
    return { changed: false, total: expectedTotal };
  }

  if (Number(lastPhrase.gap) !== 0 || !closeTo(Number(timing.total), end)) {
    assertCourseOutroTailTiming(timing);
  }

  if (closeTo(audio.duration, end)) {
    const temporaryAudio = `${audioFile}.outro-tail.tmp.wav`;
    try {
      runMedia("ffmpeg", [
        "-y",
        "-i", audioFile,
        "-f", "lavfi", "-t", String(OUTRO_SECONDS),
        "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
        "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
        "-map", "[out]",
        "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
        temporaryAudio,
        "-loglevel", "error",
      ], spawnSyncImpl, "追加片尾静音失败");
      const output = probeAudio(temporaryAudio, spawnSyncImpl);
      if (!closeTo(output.duration, expectedTotal)) {
        throw new Error(`追加后的 WAV 时长 ${output.duration} 秒，要求 ${expectedTotal} 秒`);
      }
      fs.copyFileSync(temporaryAudio, audioFile);
    } finally {
      fs.rmSync(temporaryAudio, { force: true });
    }
  } else if (!closeTo(audio.duration, expectedTotal)) {
    throw new Error(`第四幕 WAV 时长 ${audio.duration} 秒，既不等于最后一句 end，也不含完整 1 秒收尾`);
  }

  assertCourseSilentTail({ audioFile, start: end, spawnSyncImpl });

  lastPhrase.gap = OUTRO_SECONDS;
  timing.total = expectedTotal;
  fs.writeFileSync(timingsFile, `${JSON.stringify(timing, null, 2)}\n`, { encoding: "utf8" });
  return { changed: true, total: expectedTotal };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [audioFile, timingsFile, ...extra] = process.argv.slice(2);
  if (!audioFile || !timingsFile || extra.length) {
    console.error("用法：node build/teaching/course_outro_tail.mjs <act4.wav> <act4_timings.json>");
    process.exitCode = 2;
  } else {
    try {
      const result = applyCourseOutroTail({
        audioFile: path.resolve(audioFile),
        timingsFile: path.resolve(timingsFile),
      });
      console.log(result.changed
        ? `已追加片尾 1 秒静音，总时长 ${result.total.toFixed(3)} 秒`
        : `片尾 1 秒静音已存在，总时长 ${result.total.toFixed(3)} 秒`);
    } catch (error) {
      console.error(`片尾处理失败：${error.message}`);
      process.exitCode = 1;
    }
  }
}
