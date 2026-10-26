#!/usr/bin/env node
/**
 * 课程制作发布包验收：检查制作索引记录的同版本视频、封面、文案和章节数据。
 * 用法：node build/common/check_course_release.mjs <制作索引.json>
 * 依赖：Node.js 内置模块；默认从仓库根目录解析索引中的相对路径。
 */
import { assertCourseVisualReady } from "./check_course_visual_review.mjs";
import { resolveRetainedMedia } from "./retained_media.mjs";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readPngDimensions } from "./check_course_cover.mjs";
import { assertVibeTimeline, assertVibeContent, assertVibeTopicReveal } from "../vibe/vibe_timeline.mjs";

import {
  assertCourseOutroTailTiming,
  assertCourseSilentTail,
} from "../teaching/course_outro_tail.mjs";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, { encoding: "utf8" }));
}

function formatClock(seconds) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function resolveRequiredArtifact(rootDir, label, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} 不能为空`);
  }
  const root = path.resolve(rootDir);
  const file = label === "review_output" ? resolveRetainedMedia(root, value).absolute : path.resolve(root, value);
  const relative = path.relative(root, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} 必须位于项目目录内`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(`${label} 文件不存在或为空: ${value}`);
  }
  return file;
}

function runMediaCommand(command, args, spawnSyncImpl, label) {
  const result = spawnSyncImpl(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(`${label}：${output || `${command} 执行失败`}`);
  }
  return result;
}

function parseFrameRate(value) {
  const [numerator, denominator] = String(value).split("/").map(Number);
  return denominator ? numerator / denominator : Number(value);
}

function validatePublishMediaSpec(spec) {
  const positiveNumbers = ["width", "height", "fps", "audio_sample_rate", "audio_channels", "duration_s"];
  for (const field of positiveNumbers) {
    if (!Number.isFinite(Number(spec?.[field])) || Number(spec[field]) <= 0) {
      throw new Error(`publish_spec.${field} 必须是正数`);
    }
  }
  for (const field of ["video_codec", "pixel_format", "audio_codec"]) {
    if (typeof spec?.[field] !== "string" || !spec[field].trim()) {
      throw new Error(`publish_spec.${field} 不能为空`);
    }
  }
  if (!Array.isArray(spec?.video_profiles) || !spec.video_profiles.length
    || spec.video_profiles.some((profile) => typeof profile !== "string" || !profile.trim())) {
    throw new Error("publish_spec.video_profiles 必须是非空字符串数组");
  }
  if (!Number.isFinite(Number(spec.duration_tolerance_s ?? 0.1))
    || Number(spec.duration_tolerance_s ?? 0.1) < 0) {
    throw new Error("publish_spec.duration_tolerance_s 必须是非负数");
  }
}

function decodedAudioMd5(file, spawnSyncImpl) {
  const result = runMediaCommand("ffmpeg", [
    "-v", "error",
    "-i", file,
    "-map", "0:a:0",
    "-f", "md5", "-",
  ], spawnSyncImpl, "无法计算解码音频指纹");
  const md5 = String(result.stdout ?? "").match(/MD5=([0-9a-z]+)/i)?.[1];
  if (!md5) {
    throw new Error("无法计算解码音频指纹：ffmpeg 未返回 MD5");
  }
  return md5;
}

export function verifyPublishedMedia({
  publishFile,
  reviewFile,
  spec,
  spawnSyncImpl = spawnSync,
}) {
  validatePublishMediaSpec(spec);
  const probeResult = runMediaCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,profile,width,height,pix_fmt,r_frame_rate,sample_rate,channels:format=duration,size",
    "-of", "json",
    publishFile,
  ], spawnSyncImpl, "无法读取高清发布版媒体规格");
  let probe;
  try {
    probe = JSON.parse(probeResult.stdout);
  } catch {
    throw new Error("无法读取高清发布版媒体规格：ffprobe 未返回有效 JSON");
  }
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (!video || !audio) {
    throw new Error("高清发布版必须同时包含视频流和音频流");
  }
  if (video.width !== Number(spec.width) || video.height !== Number(spec.height)) {
    throw new Error(`视频分辨率 ${video.width}x${video.height}，要求 ${spec.width}x${spec.height}`);
  }
  const actualFps = parseFrameRate(video.r_frame_rate);
  if (!Number.isFinite(actualFps) || Math.abs(actualFps - Number(spec.fps)) > 0.001) {
    throw new Error(`视频帧率 ${actualFps}，要求 ${spec.fps}`);
  }
  if (video.codec_name !== spec.video_codec) {
    throw new Error(`视频编码 ${video.codec_name}，要求 ${spec.video_codec}`);
  }
  if (!Array.isArray(spec.video_profiles) || !spec.video_profiles.includes(video.profile)) {
    throw new Error(`视频 Profile ${video.profile}，允许 ${spec.video_profiles?.join("/") || "未配置"}`);
  }
  if (video.pix_fmt !== spec.pixel_format) {
    throw new Error(`视频像素格式 ${video.pix_fmt}，要求 ${spec.pixel_format}`);
  }
  if (audio.codec_name !== spec.audio_codec
    || Number(audio.sample_rate) !== Number(spec.audio_sample_rate)
    || Number(audio.channels) !== Number(spec.audio_channels)) {
    throw new Error(
      `音频规格 ${audio.codec_name}/${audio.sample_rate}Hz/${audio.channels}声道，`
      + `要求 ${spec.audio_codec}/${spec.audio_sample_rate}Hz/${spec.audio_channels}声道`,
    );
  }
  const actualDuration = Number(probe.format?.duration);
  const expectedDuration = Number(spec.duration_s);
  const durationTolerance = Number(spec.duration_tolerance_s ?? 0.1);
  if (!Number.isFinite(actualDuration)
    || Math.abs(actualDuration - expectedDuration) > durationTolerance) {
    throw new Error(`视频实际时长 ${actualDuration} 秒，要求 ${expectedDuration}±${durationTolerance} 秒`);
  }
  runMediaCommand("ffmpeg", [
    "-v", "error",
    "-i", publishFile,
    "-f", "null", "-",
  ], spawnSyncImpl, "高清发布版完整解码失败");
  const reviewAudioMd5 = decodedAudioMd5(reviewFile, spawnSyncImpl);
  const publishAudioMd5 = decodedAudioMd5(publishFile, spawnSyncImpl);
  if (reviewAudioMd5 !== publishAudioMd5) {
    throw new Error(`审片版与发布版解码音频不一致：${reviewAudioMd5} != ${publishAudioMd5}`);
  }
  return {
    duration_s: actualDuration,
    profile: video.profile,
    audio_md5: publishAudioMd5,
  };
}

export function verifyEncodedCourseOutroTail({
  videoFile,
  spawnSyncImpl = spawnSync,
}) {
  const probeResult = runMediaCommand("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_type,duration:format=duration",
    "-of", "json",
    videoFile,
  ], spawnSyncImpl, "无法读取最终音轨时长");
  let probe;
  try {
    probe = JSON.parse(probeResult.stdout);
  } catch {
    throw new Error("无法读取最终音轨时长：ffprobe 未返回有效 JSON");
  }
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const duration = Number(audio?.duration ?? probe.format?.duration);
  if (!Number.isFinite(duration) || duration <= 1) {
    throw new Error("无法读取最终音轨时长：音频时长必须大于 1 秒");
  }
  assertCourseSilentTail({
    audioFile: videoFile,
    start: duration - 1,
    boundaryToleranceS: 0.03,
    spawnSyncImpl,
  });
  return { start_s: duration - 1, duration_s: 1 };
}

function measureCoverSsimAt({
  videoFile,
  coverFile,
  timeS,
  spawnSyncImpl,
}) {
  const result = spawnSyncImpl("ffmpeg", [
    "-v", "info",
    "-ss", String(timeS),
    "-i", videoFile,
    "-i", coverFile,
    "-lavfi", "[0:v]settb=1/30,setpts=PTS-STARTPTS[video];[1:v]settb=1/30,setpts=PTS-STARTPTS[cover];[video][cover]ssim=shortest=1",
    "-frames:v", "1",
    "-an",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const scores = [...output.matchAll(/All:([0-9.]+)/g)];
  const score = Number(scores.at(-1)?.[1]);
  if (result.status !== 0 || !Number.isFinite(score)) {
    throw new Error(`无法核验视频封面时间窗: ${output.trim() || "ffmpeg 执行失败"}`);
  }
  return score;
}

export function verifyEmbeddedCoverWindow({
  videoFile,
  coverFile,
  durationS = 0.5,
  fps = 30,
  threshold = 0.97,
  spawnSyncImpl = spawnSync,
}) {
  const frameDuration = 1 / fps;
  const floorToMilliseconds = (value) => Math.floor(value * 1000) / 1000;
  const firstSsim = measureCoverSsimAt({
    videoFile, coverFile, timeS: 0, spawnSyncImpl,
  });
  const lastCoverSsim = measureCoverSsimAt({
    videoFile,
    coverFile,
    timeS: floorToMilliseconds(Math.max(0, durationS - frameDuration)),
    spawnSyncImpl,
  });
  const firstContentSsim = measureCoverSsimAt({
    videoFile,
    coverFile,
    timeS: floorToMilliseconds(durationS + frameDuration),
    spawnSyncImpl,
  });
  if (firstSsim < threshold || lastCoverSsim < threshold) {
    throw new Error(
      `视频 0–${durationS} 秒未稳定显示正式封面：SSIM ${firstSsim}/${lastCoverSsim}，要求至少 ${threshold}`,
    );
  }
  if (firstContentSsim >= threshold) {
    throw new Error(`视频 ${durationS} 秒后仍是正式封面：SSIM ${firstContentSsim}`);
  }
  return {
    first_ssim: firstSsim,
    last_cover_ssim: lastCoverSsim,
    first_content_ssim: firstContentSsim,
  };
}

export function verifyEmbeddedCoverFrame({
  videoFile,
  coverFile,
  threshold = 0.97,
  spawnSyncImpl = spawnSync,
}) {
  const result = spawnSyncImpl("ffmpeg", [
    "-v", "info",
    "-i", videoFile,
    "-i", coverFile,
    "-lavfi", "[0:v]settb=1/30,setpts=PTS-STARTPTS[video];[1:v]settb=1/30,setpts=PTS-STARTPTS[cover];[video][cover]ssim=shortest=1",
    "-frames:v", "1",
    "-an",
    "-f", "null", "-",
  ], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const scores = [...output.matchAll(/All:([0-9.]+)/g)];
  const score = Number(scores.at(-1)?.[1]);
  if (result.status !== 0 || !Number.isFinite(score)) {
    throw new Error(`无法核验视频首帧与正式封面: ${output.trim() || "ffmpeg 执行失败"}`);
  }
  if (score < threshold) {
    throw new Error(`视频首帧与正式封面不一致：SSIM ${score}，要求至少 ${threshold}`);
  }
  return { ssim: score };
}

export function checkCourseRelease(indexPath, {
  rootDir = process.cwd(),
  coverFrameVerifier,
  coverWindowVerifier,
  mediaVerifier,
  outroTailVerifier,
} = {}) {
  const index = readJson(indexPath);
  assertCourseVisualReady(index, { rootDir });
  const vibe = index.route === "vibe";
  if (index.route !== undefined && !["course", "vibe"].includes(index.route)) throw new Error("未知制作路线");
  if (vibe && !index.example && (!index.review_approval?.confirmed || !index.cover_selection)) throw new Error("Vibe发布需要已确认审片版及独立封面");
  if (typeof index.publish_copy !== "string" || !index.publish_copy.trim()) {
    throw new Error("publish_copy 不能为空");
  }
  const publishCopy = index.publish_copy.replaceAll("\\", "/");
  const publishOutput = String(index.publish_output ?? "").replaceAll("\\", "/");
  const version = String(index.current_version ?? "").trim();
  if (path.posix.basename(path.posix.dirname(publishOutput)) !== version
    || !path.posix.basename(publishOutput).endsWith(`_${version}_publish.mp4`)) {
    throw new Error(`publish_output 必须指向当前版本 ${version} 的高清发布版`);
  }
  if (path.posix.dirname(publishCopy) !== path.posix.dirname(publishOutput)
    || !path.posix.basename(publishCopy).endsWith(`_${version}.txt`)) {
    throw new Error(`publish_copy 必须位于当前版本 ${version} 的发布目录并使用同版本文件名`);
  }
  const publishOutputFile = resolveRequiredArtifact(rootDir, "publish_output", index.publish_output);
  const reviewOutputFile = vibe || typeof mediaVerifier === "function"
    ? resolveRequiredArtifact(rootDir, "review_output", index.review_output)
    : null;
  if (vibe) {
    const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    const reviewSha = hash(reviewOutputFile);
    if (!index.example && reviewSha !== index.review_approval.sha256) {
      throw new Error("确认后的审片版发生变化，review_approval.sha256 哈希不匹配");
    }
    if (hash(publishOutputFile) !== reviewSha) {
      throw new Error("Vibe发布版必须与已确认高清审片版完全一致");
    }
    assertVibeContent(index, { rootDir, checkPreview: true });
  }
  const coverFile = resolveRequiredArtifact(rootDir, "cover_output", index.cover_output);
  if (Number(index.cover_embed?.duration_s) !== (vibe ? 0 : 0.5)) {
    throw new Error(vibe ? "Vibe独立封面cover_embed.duration_s必须为0" : "cover_embed.duration_s 必须是 0.5 秒");
  }
  const coverFrameThreshold = Number(index.cover_embed?.ssim_threshold ?? 0.97);
  if (!Number.isFinite(coverFrameThreshold)
    || coverFrameThreshold <= 0
    || coverFrameThreshold > 1) {
    throw new Error("cover_embed.ssim_threshold 必须是 0 到 1 之间的数字");
  }
  const publishCopyFile = resolveRequiredArtifact(rootDir, "publish_copy", index.publish_copy);
  const publishCopyText = fs.readFileSync(publishCopyFile, { encoding: "utf8" });
  const episodeMatch = String(index.episode ?? "").match(/^ep(\d+)$/i);
  const currentContract = index.production_contract === "current";
  const videoSummaryRequired = currentContract || !episodeMatch || Number(episodeMatch[1]) >= 4;
  const tagsBeforeSummaryRequired = currentContract || !episodeMatch || Number(episodeMatch[1]) >= 9;
  const outroTailRequired = !vibe && (currentContract || !episodeMatch || Number(episodeMatch[1]) >= 6);
  const hasVideoSummary = publishCopyText.includes("【视频总结】");
  if (videoSummaryRequired && !hasVideoSummary) {
    throw new Error("发布文案缺少 【视频总结】");
  }
  const publishSections = hasVideoSummary
    ? (tagsBeforeSummaryRequired
      ? ["【标题】", "【发布文案】", "【标签】", "【视频总结】", "【视频章节】"]
      : ["【标题】", "【发布文案】", "【视频总结】", "【视频章节】", "【标签】"])
    : ["【标题】", "【发布文案】", "【视频章节】", "【标签】"];
  for (const section of publishSections) {
    if (!publishCopyText.includes(section)) {
      throw new Error(`发布文案缺少 ${section}`);
    }
  }
  const sectionPositions = publishSections.map((section) => publishCopyText.indexOf(section));
  if (sectionPositions.some((position, sectionIndex) => (
    sectionIndex > 0 && position <= sectionPositions[sectionIndex - 1]
  ))) {
    throw new Error(`发布文案区块顺序必须是：${publishSections.join(" → ")}`);
  }
  if (tagsBeforeSummaryRequired) {
    const tagsText = publishCopyText.slice(
      publishCopyText.indexOf("【标签】") + "【标签】".length,
      publishCopyText.indexOf("【视频总结】"),
    ).trim();
    const tags = new Set(tagsText.split(/\s+/u).filter(Boolean));
    const requiredTags = vibe ? ["#Vibe知识大赏"] : ["#AI", "#AI基础", "#深度讲解"];
    const missingTags = requiredTags.filter((tag) => !tags.has(tag));
    if (missingTags.length) {
      throw new Error(`标签必须包含独立标签 ${requiredTags.join("、")}；缺少：${missingTags.join("、")}`);
    }
  }
  if (vibe) {
    const title = publishCopyText.slice(publishCopyText.indexOf("【标题】") + 4, publishCopyText.indexOf("【发布文案】")).trim();
    const prefix = `Vibe知识大赏｜${index.topic}：`;
    if (!title.startsWith(prefix) || !title.slice(prefix.length).trim() || Array.from(title.slice(prefix.length)).length > 15)
      throw new Error("Vibe标题须为栏目｜主题词：短句，冒号后含标点最多15个字符");
  }
  if (hasVideoSummary) {
    const publishBodyEndSection = tagsBeforeSummaryRequired ? "【标签】" : "【视频总结】";
    const publishBody = publishCopyText.slice(
      publishCopyText.indexOf("【发布文案】") + "【发布文案】".length,
      publishCopyText.indexOf(publishBodyEndSection),
    ).trim();
    const videoSummary = publishCopyText.slice(
      publishCopyText.indexOf("【视频总结】") + "【视频总结】".length,
      publishCopyText.indexOf("【视频章节】"),
    ).trim();
    const summaryLength = videoSummary.replace(/\s/g, "").length;
    if (summaryLength < 50 || summaryLength > 200) {
      throw new Error(`视频总结必须是 50～200 个非空白字符，当前为 ${summaryLength}`);
    }
    if (videoSummary.replace(/\s+/g, " ") === publishBody.replace(/\s+/g, " ")) {
      throw new Error("视频总结与发布文案不能相同");
    }
  }
  const actCount = index.acts?.length ?? 4;
  if (vibe ? actCount < 1 || actCount > 6 : ![4, 6].includes(actCount)) throw new Error("制作索引的分段数量无效");
  if (!Array.isArray(index.chapter_titles) || index.chapter_titles.length !== actCount) {
    throw new Error(`chapter_titles 必须包含 ${actCount} 幕标题`);
  }
  if ((currentContract || !episodeMatch || Number(episodeMatch[1]) >= 23)
    && index.chapter_titles.some((title) => typeof title !== "string"
      || !title.trim() || title !== title.trim())) {
    throw new Error("章节标题必须非空且不能有首尾空白");
  }
  const timelinePath = path.resolve(rootDir, String(index.timeline_summary ?? ""));
  if (!fs.existsSync(timelinePath)) {
    throw new Error(`timeline_summary 文件不存在: ${index.timeline_summary}`);
  }
  const timeline = readJson(timelinePath);
  if (vibe) {
    assertVibeTimeline(timeline, actCount, index.publish_spec.duration_s);
    assertVibeTopicReveal(index, timeline);
  }
  if (!Array.isArray(timeline.acts) || timeline.acts.length !== actCount) {
    throw new Error(`整期时间表必须包含 ${actCount} 幕`);
  }
  if (outroTailRequired) {
    const lastAct = Array.isArray(index.acts)
      ? index.acts.find((act) => Number(act.act) === actCount)
      : null;
    if (!lastAct?.timings) {
      throw new Error(`制作索引必须记录第 ${actCount} 幕 timings`);
    }
    const lastTimingsFile = resolveRequiredArtifact(
      rootDir,
      `第 ${actCount} 幕 timings`,
      lastAct.timings,
    );
    const lastTimings = readJson(lastTimingsFile);
    const outro = assertCourseOutroTailTiming(lastTimings);
    if (Math.abs(Number(timeline.acts[actCount - 1].duration_s) - outro.total) > 0.001) {
      throw new Error(`整期时间表第 ${actCount} 幕时长必须等于包含片尾 1 秒的 timings.total`);
    }
  }
  const expectedDuration = Number(index.publish_spec?.duration_s);
  if (!Number.isFinite(expectedDuration)) {
    throw new Error("publish_spec.duration_s 必须是有效数字");
  }
  if (!Number.isFinite(Number(timeline.total_s))
    || Math.abs(Number(timeline.total_s) - expectedDuration) > 0.1) {
    throw new Error(`整期时间表 total_s 必须等于发布规格 ${expectedDuration}`);
  }
  const outro = outroTailRequired && typeof outroTailVerifier === "function"
    ? outroTailVerifier({
      videoFile: publishOutputFile,
    })
    : null;
  const actLabels = ["第一幕", "第二幕", "第三幕", "第四幕", "第五幕", "第六幕"];
  timeline.acts.forEach((act, indexNumber) => {
    const expected = `${formatClock(act.start_s)}–${formatClock(act.end_s)}　${actLabels[indexNumber]} · ${index.chapter_titles[indexNumber]}`;
    if (!publishCopyText.includes(expected)) {
      throw new Error(`第 ${indexNumber + 1} 幕章节与制作索引或整期时间表不一致，应为: ${expected}`);
    }
  });
  const ledgerPath = path.resolve(rootDir, "course/episodes.json");
  if (!fs.existsSync(ledgerPath)) {
    throw new Error("episodes.json 不存在");
  }
  const ledger = readJson(ledgerPath);
  const episode = Array.isArray(ledger.episodes)
    ? ledger.episodes.find((item) => item.slug === index.slug)
    : undefined;
  if (!episode) {
    throw new Error(`episodes.json 找不到 slug=${index.slug} 的记录`);
  }
  const ledgerEpisode = Number.isInteger(Number(episode.ep))
    ? `ep${String(Number(episode.ep)).padStart(2, "0")}`
    : "";
  if (ledgerEpisode !== index.episode) {
    throw new Error(`episodes.json 的 ep 必须匹配制作索引 ${index.episode}`);
  }
  if (episode.topic !== index.topic) {
    throw new Error(`episodes.json 的 topic 必须匹配制作索引 ${index.topic}`);
  }
  if (episode.version !== version) {
    throw new Error(`episodes.json 的 version 必须是当前版本 ${version}`);
  }
  if (episode.output !== index.publish_output) {
    throw new Error("episodes.json 的 output 必须等于制作索引的 publish_output");
  }
  if (!Number.isFinite(Number(episode.duration_s))
    || Math.abs(Number(episode.duration_s) - expectedDuration) > 0.001) {
    throw new Error(`episodes.json 的 duration_s 必须等于发布规格 ${expectedDuration}`);
  }
  const media = typeof mediaVerifier === "function"
    ? mediaVerifier({
      publishFile: publishOutputFile,
      reviewFile: reviewOutputFile,
      spec: index.publish_spec,
    })
    : null;
  let cover = null;
  if (vibe) {
    cover = readPngDimensions(coverFile);
    if (cover.width * 4 !== cover.height * 3) throw new Error("Vibe独立封面必须是3:4");
  } else if (typeof coverWindowVerifier === "function") {
    cover = coverWindowVerifier({
      videoFile: publishOutputFile,
      coverFile,
      durationS: Number(index.cover_embed.duration_s),
      fps: Number(index.publish_spec?.fps),
      threshold: coverFrameThreshold,
    });
  } else if (typeof coverFrameVerifier === "function") {
    cover = coverFrameVerifier({
      videoFile: publishOutputFile,
      coverFile,
      threshold: coverFrameThreshold,
    });
  }
  return { ok: true, media, cover, outro };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [indexPath, ...extraArguments] = process.argv.slice(2);
  if (!indexPath || extraArguments.length > 0) {
    console.error("用法：node build/common/check_course_release.mjs <制作索引.json>");
    process.exitCode = 2;
  } else {
    let absoluteIndexPath, index;
    try {
      absoluteIndexPath = path.resolve(indexPath);
      index = readJson(absoluteIndexPath);
      const report = checkCourseRelease(absoluteIndexPath, {
        coverWindowVerifier: verifyEmbeddedCoverWindow,
        mediaVerifier: verifyPublishedMedia,
        outroTailVerifier: verifyEncodedCourseOutroTail,
      });
      if (index.route === "vibe") {
        const file = path.resolve(index.publish_output);
        const checks = path.join(path.dirname(file), "release-check.json");
        fs.writeFileSync(checks, JSON.stringify({ ...report, route: "vibe", video: index.publish_output,
          sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
          example: Boolean(index.example), publicly_published: false }, null, 2) + "\n", { encoding: "utf8" });
        index.publish_bundle = { complete: true, checks: path.relative(process.cwd(), checks).replaceAll("\\", "/") };
        fs.writeFileSync(absoluteIndexPath, JSON.stringify(index, null, 2) + "\n", { encoding: "utf8" });
      }
      console.log(`发布包检查通过：${index.episode} ${index.current_version}`);
    } catch (error) {
      if (index?.route === "vibe") {
        index.publish_bundle = null;
        fs.writeFileSync(absoluteIndexPath, JSON.stringify(index, null, 2) + "\n", { encoding: "utf8" });
      }
      console.error(`发布包检查失败：${error.message}`);
      process.exitCode = 1;
    }
  }
}
