#!/usr/bin/env node
/**
 * 用途：按教学WAV或Vibe视觉时间表串行生成审片版及高清发布包。
 * 运行：node build/common/course_video.mjs <review|publish> <制作索引.json> [--act N] [--check-only | --range 起秒:止秒]
 * 依赖：Node.js、Python、FFmpeg、模板内声明的 HyperFrames CLI。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { ffconcatFileLine } from "../teaching/course_audio.mjs";
import { assertCourseOutroTailArtifacts } from "../teaching/course_outro_tail.mjs";
import { generateCourseQcReport } from "./course_qc_report.mjs";
import { injectCourseChapterProgressHtml } from "../teaching/course_chapter_progress.mjs";
import { assertCourseEpisodeScriptLocation } from "./init_course_episode.mjs";
import { readVibeTiming, vibeSubtitleDeclaration, assertVibeTimeline, assertVibeContent } from "../vibe/vibe_timeline.mjs";


const BUILD_TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const COURSE_VIDEO_TOOL = fileURLToPath(import.meta.url);
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";
const GIT_BASH = process.env.COURSE_GIT_BASH || (process.platform === "win32"
  ? path.resolve(spawnSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true }).stdout.trim(), "../../../bin/bash.exe")
  : "bash");
const RENDER_WORKERS = 2;
const PYTHON_COMMAND = process.env.COURSE_PYTHON ?? "python";

function absolute(rootDir, value) {
  return path.resolve(rootDir, value);
}

/**
 * 正式封面确认后同步看板状态；公开发布过的期次不允许被发布构建回退。
 */
export function markCourseDashboardPendingPublish(index, {
  rootDir = process.cwd(),
  ledgerPath = path.join(rootDir, "course", "episodes.json"),
} = {}) {
  if (!index?.cover_selection || typeof index.cover_selection !== "object") {
    throw new Error("publish 前必须记录用户确认的 cover_selection");
  }
  if (typeof index.cover_output !== "string" || !index.cover_output.trim()) {
    throw new Error("publish 前必须记录正式 cover_output");
  }
  const coverFile = absolute(rootDir, index.cover_output);
  if (!fs.existsSync(coverFile) || !fs.statSync(coverFile).isFile() || fs.statSync(coverFile).size === 0) {
    throw new Error(`正式封面不存在或为空：${index.cover_output}`);
  }

  const episodeMatch = String(index.episode ?? "").match(/^ep(\d+)$/iu);
  if (!episodeMatch) throw new Error("制作索引 episode 必须为 epNN，无法同步看板状态");
  const episodeNumber = Number(episodeMatch[1]);
  if (!fs.existsSync(ledgerPath)) throw new Error(`课程台账不存在：${ledgerPath}`);

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  if (!Array.isArray(ledger.episodes)) throw new Error("课程台账缺少 episodes 数组");
  const episode = ledger.episodes.find((item) => Number(item.ep) === episodeNumber);
  if (!episode) throw new Error(`课程台账中不存在第 ${episodeNumber} 期`);
  if (episode.publish_status === "已发布") return false;
  if (episode.dashboard_status === "待发布" && episode.publish_status === "未发布") return false;

  episode.dashboard_status = "待发布";
  episode.publish_status = "未发布";
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: "utf8" });
  return true;
}

function requiresEpisodeContract(episode, introducedAt, current = false) {
  const match = String(episode ?? "").match(/^ep(\d+)$/iu);
  return current || !match || Number(match[1]) >= introducedAt;
}

export function assertCourseVisualLayoutPolicy(sourceText, sourceLabel = "画面源") {
  const broadExemption = sourceText.match(
    /querySelectorAll\s*\(\s*(["'])\.scene\1\s*\)[\s\S]{0,500}?setAttribute\s*\(\s*(["'])(data-layout-allow-(?:overflow|overlap))\2/iu,
  );
  if (broadExemption) {
    throw new Error(`${sourceLabel} 禁止给整幕设置 ${broadExemption[3]}，只允许对确有需要的局部元素豁免`);
  }
  for (const tagMatch of sourceText.matchAll(/<[^>]+>/gu)) {
    const tag = tagMatch[0];
    if (!/\bclass\s*=\s*(["'])[^"']*\bscene\b[^"']*\1/iu.test(tag)) continue;
    const exemption = tag.match(/\b(data-layout-allow-(?:overflow|overlap))\b/iu);
    if (exemption) {
      throw new Error(`${sourceLabel} 禁止给整幕设置 ${exemption[1]}，只允许对确有需要的局部元素豁免`);
    }
  }
}

export function extractCourseLayoutCheckTimes(sourceText) {
  const durationMatch = sourceText.match(/\bconst\s+DUR\s*=\s*([0-9]+(?:\.[0-9]+)?)/u);
  if (!durationMatch) return [];
  const duration = Number(durationMatch[1]);
  const transitionTimes = [...sourceText.matchAll(
    /\bpush\s*\(\s*["'][^"']+["']\s*,\s*["'][^"']+["']\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/gu,
  )].map((match) => Number(match[1]));
  transitionTimes.push(...[...sourceText.matchAll(/\benter\s*\(\s*["'][^"']+["']\s*,\s*([0-9]+(?:\.[0-9]+)?)/gu)]
    .map(match => Number(match[1])).filter(time => time > 1.2));
  return [...new Set([...transitionTimes, duration])].sort((a, b) => a - b).map(
    (end) => Number(Math.max(0.1, end - 1.2).toFixed(3)),
  );
}

function assertIndex(index, selectedAct) {
  const vibe = index.route === "vibe";
  if (!Array.isArray(index.acts) || (vibe ? index.acts.length < 1 || index.acts.length > 6 : ![4, 6].includes(index.acts.length))) {
    throw new Error(vibe ? "Vibe制作索引acts必须包含1～6段" : "制作索引 acts 必须包含 4 幕或 6 幕");
  }
  const highlightFormats = new Set();
  let structuredHighlightCount = 0;
  index.acts.forEach((act, indexNumber) => {
    if (Number(act.act) !== indexNumber + 1) {
      throw new Error(`第 ${indexNumber + 1} 幕 act 编号不连续`);
    }
    if (!Array.isArray(act.subtitle_highlights)) {
      throw new Error(`第 ${indexNumber + 1} 幕 subtitle_highlights 必须是数组`);
    }
    const structuredUnitIds = new Set();
    for (const highlight of act.subtitle_highlights) {
      if (typeof highlight === "string") {
        highlightFormats.add("legacy");
        continue;
      }
      if (!highlight || typeof highlight !== "object" || Array.isArray(highlight)
        || ["unit_id", "text", "reason"].some(
          (key) => typeof highlight[key] !== "string" || !highlight[key].trim(),
        )) {
        throw new Error("结构化字幕重点必须包含非空 unit_id、text 和 reason");
      }
      highlightFormats.add("targeted");
      structuredHighlightCount += 1;
      if (structuredUnitIds.has(highlight.unit_id)) {
        throw new Error(`第 ${indexNumber + 1} 幕字幕 ${highlight.unit_id} 只能设置一个重点`);
      }
      structuredUnitIds.add(highlight.unit_id);
    }
    if (!act.allowed_warnings
      || typeof act.allowed_warnings !== "object"
      || Array.isArray(act.allowed_warnings)
      || Object.values(act.allowed_warnings).some(
        (value) => !Number.isInteger(value) || value < 0,
      )) {
      throw new Error(`第 ${indexNumber + 1} 幕 allowed_warnings 必须是非负整数映射`);
    }
    for (const key of vibe ? ["visual_timing", "visual_source"] : ["audio", "timings", "visual_source"]) {
      if (selectedAct && Number(act.act) !== selectedAct) continue;
      if (typeof act[key] !== "string" || !act[key].trim()) {
        throw new Error(`第 ${indexNumber + 1} 幕 ${key} 不能为空`);
      }
    }
    if (act.motion_check && (!/^\d+:\d+:\d+:\d+$/u.test(act.motion_check.crop ?? "")
      || !Number.isFinite(act.motion_check.max_still_s ?? 6)
      || (act.motion_check.max_still_s ?? 6) <= 0)) {
      throw new Error(`第 ${indexNumber + 1} 幕 motion_check 必须指定主体裁切区域和正数秒数`);
    }
  });
  if (highlightFormats.size > 1) {
    throw new Error("subtitle_highlights 不能混用旧关键词和结构化定点格式");
  }
  if (highlightFormats.has("targeted")
    && (structuredHighlightCount < 6 || structuredHighlightCount > 10)) {
    throw new Error(`结构化字幕重点全文必须为 6 到 10 处，当前 ${structuredHighlightCount} 处`);
  }
}

function renderStep(buildDir, actNumber, quality, silentFile) {
  return {
    type: "render",
    act: actNumber,
    output: silentFile,
    command: NPM_COMMAND,
    args: [
      "--prefix", buildDir,
      "run", "render", "--",
      "--output", path.basename(silentFile),
      "--quality", quality,
      "--workers", String(RENDER_WORKERS),
      "--browser-gpu",
      "--gpu",
    ],
  };
}

export function createCourseVideoPlan(index, mode, { rootDir = process.cwd(), act: selectedAct, checkOnly = false, range } = {}) {
  if (!new Set(["review", "publish"]).has(mode)) {
    throw new Error("模式必须是 review 或 publish");
  }
  assertCourseEpisodeScriptLocation(rootDir);
  if (index.route !== undefined && !["course", "vibe"].includes(index.route)) throw new Error("未知制作路线");
  const vibe = index.route === "vibe";
  const actCount = index.acts?.length ?? 4;
  if (selectedAct !== undefined && (!Number.isInteger(selectedAct) || selectedAct < 1 || selectedAct > actCount)) {
    throw new Error(`--act 必须是 1 到 ${actCount} 的整数`);
  }
  if ((selectedAct || checkOnly || range) && mode !== "review") throw new Error("分幕、预检和片段选项仅适用于 review");
  if (range && (!selectedAct || checkOnly || !Array.isArray(range) || range.length !== 2
    || !range.every(Number.isFinite) || range[0] < 0 || range[1] <= range[0])) {
    throw new Error("--range 必须配合 --act，使用递增的非负起秒:止秒，不能与 --check-only 合用");
  }
  assertIndex(index, selectedAct);
  if (vibe && !index.example && !index.content_approval?.confirmed) throw new Error("Vibe画面制作前需要content_approval确认文稿与切分");
  const quality = vibe || mode === "publish" ? "high" : "standard";
  const version = String(index.current_version ?? "").trim();
  const episode = String(index.episode ?? "").trim();
  if (!episode || !version) {
    throw new Error("制作索引 episode 和 current_version 不能为空");
  }
  if (mode === "publish" && !index.review_output) {
    throw new Error(`${mode} 模式要求 review_output`);
  }
  if (mode === "publish" && !index.cover_output) {
    throw new Error("publish 模式要求 cover_output");
  }
  if (typeof index.timeline_summary !== "string" || !index.timeline_summary.trim()) {
    throw new Error("timeline_summary 不能为空");
  }
  if (vibe && mode === "publish") return createVibePublishPlan(index, rootDir);

  let chapterProgress = null;
  if (!vibe && requiresEpisodeContract(index.episode, 23, index.production_contract === "current")) {
    if (!Array.isArray(index.chapter_titles) || index.chapter_titles.length !== actCount
      || index.chapter_titles.some((title) => typeof title !== "string" || !title.trim())) {
      throw new Error(`新期次 chapter_titles 必须包含 ${actCount} 个非空章节标题`);
    }
    if (index.chapter_titles.some((title) => title !== title.trim())) {
      throw new Error("章节标题不能有首尾空白，画面与发布文案必须使用同一原文");
    }
    const timelineFile = absolute(rootDir, index.timeline_summary);
    const timeline = JSON.parse(fs.readFileSync(timelineFile, { encoding: "utf8" }));
    if (!Number.isFinite(timeline.total_s) || timeline.total_s <= 0
      || !Array.isArray(timeline.acts) || timeline.acts.length !== actCount) {
      throw new Error(`章节进度需要有效的 ${actCount} 幕整期时间表`);
    }
    let previousEnd = 0;
    for (const [number, act] of timeline.acts.entries()) {
      if (Number(act.act) !== number + 1
        || !Number.isFinite(act.start_s) || !Number.isFinite(act.end_s)
        || Math.abs(act.start_s - previousEnd) > 0.002 || act.end_s <= act.start_s) {
        throw new Error("章节进度的各幕时间边界必须连续");
      }
      previousEnd = act.end_s;
    }
    if (Math.abs(previousEnd - timeline.total_s) > 0.002) {
      throw new Error("章节进度末幕结束时间与整期总时长不一致");
    }

    // 第一幕开场长度由正式画面源读取；只制作后续单幕时无需提前创建第一幕源。
    let introEndS = 0;
    if (!selectedAct || selectedAct === 1) {
      const firstAct = index.acts[0];
      if (firstAct.opening_overlay) {
        introEndS = Number(firstAct.opening_overlay.duration_s)
          + Number(firstAct.opening_overlay.fade_s ?? 0);
      } else {
        const firstSource = fs.readFileSync(absolute(rootDir, firstAct.visual_source), { encoding: "utf8" });
        const openingTag = firstSource.match(/<(?:div|section)\b(?=[^>]*\bid\s*=\s*["']opening["'])[^>]*>/iu)?.[0];
        const durationText = openingTag?.match(/\bdata-duration\s*=\s*["']([0-9]+(?:\.[0-9]+)?)["']/iu)?.[1];
        introEndS = Number(durationText);
      }
      if (!Number.isFinite(introEndS) || introEndS <= 0
        || introEndS >= timeline.acts[0].end_s) {
        throw new Error("新期次第一幕必须标记有效的开场结束时间");
      }
    }
    chapterProgress = {
      titles: index.chapter_titles,
      totalS: timeline.total_s,
      acts: timeline.acts.map(({ start_s, end_s }) => ({ startS: start_s, endS: end_s })),
      introEndS,
      timelineFile,
    };
  }

  const acts = index.acts.filter((sourceAct) => !selectedAct || Number(sourceAct.act) === selectedAct).map((sourceAct) => {
    const actNumber = Number(sourceAct.act);
    const visualSource = absolute(rootDir, sourceAct.visual_source);
    const visualTiming = vibe ? readVibeTiming(absolute(rootDir, sourceAct.visual_timing)) : null;
    if (chapterProgress) {
      const timing = JSON.parse(fs.readFileSync(absolute(rootDir, sourceAct.timings), { encoding: "utf8" }));
      const chapterAct = chapterProgress.acts[actNumber - 1];
      if (!Number.isFinite(timing.total)
        || Math.abs(chapterAct.endS - chapterAct.startS - timing.total) > 0.002) {
        throw new Error(`第${["一", "二", "三", "四", "五", "六"][actNumber - 1]}幕时间表时长与 timings.total 不一致`);
      }
    }
    const buildDir = absolute(
      rootDir,
      `pipeline/build/course_${episode}_act${actNumber}_${version}_${mode}${range ? `_preview_${range.join('-')}` : checkOnly ? '_check' : ''}`,
    );
    const silentFile = path.join(buildDir, `act${actNumber}_silent_${quality}.mp4`);
    const openingOverlay = sourceAct.opening_overlay ?? null;
    const openingFadeS = Number(openingOverlay?.fade_s ?? 0);
    if (openingOverlay && (actNumber !== 1 || typeof openingOverlay.video !== "string"
      || !openingOverlay.video.trim() || !Number.isFinite(Number(openingOverlay.duration_s))
      || Number(openingOverlay.duration_s) <= 0 || !Number.isFinite(openingFadeS) || openingFadeS < 0)) {
      throw new Error("opening_overlay 只允许配置在第一幕，且必须包含 video、正数 duration_s 和非负 fade_s");
    }
    const renderedSilentFile = openingOverlay
      ? path.join(buildDir, `act${actNumber}_silent_base_${quality}.mp4`)
      : silentFile;
    const finalFile = mode === "review"
      ? path.join(buildDir, `act${actNumber}_final_${quality}.mp4`)
      : silentFile;
    const steps = [
      {
        type: "check",
        act: actNumber,
        command: NPM_COMMAND,
        args: ["--prefix", buildDir, "run", "check"],
        allowedWarnings: sourceAct.allowed_warnings,
      },
      {
        type: "first-reveal",
        act: actNumber,
        command: process.execPath,
        args: [path.join(BUILD_TOOLS_DIR, "check_course_reveal.mjs"), buildDir],
      },
      renderStep(buildDir, actNumber, quality, renderedSilentFile),
    ];
    if (openingOverlay) {
      const openingDuration = String(Number(openingOverlay.duration_s));
      const openingInputDuration = String(Number(openingOverlay.duration_s) + openingFadeS);
      const openingFilter = openingFadeS > 0
        ? `[1:v]setpts=PTS-STARTPTS,format=yuva420p,fade=t=out:st=${openingDuration}:d=${openingFadeS}:alpha=1[opening]`
        : "[1:v]setpts=PTS-STARTPTS[opening]";
      const publishEnable = mode === "publish"
        ? `:enable='gte(t,${Number(index.cover_embed?.duration_s ?? 0.5)})'`
        : "";
      steps.push({
        type: "opening-overlay",
        act: actNumber,
        command: "ffmpeg",
        args: [
          "-y", "-i", renderedSilentFile,
          "-t", openingInputDuration, "-i", absolute(rootDir, openingOverlay.video),
          "-filter_complex", `${openingFilter};[0:v][opening]overlay=0:0:eof_action=pass${publishEnable}[v]`,
          "-map", "[v]", "-an", "-c:v", "h264_nvenc",
          "-preset", mode === "publish" ? "p6" : "p5",
          "-cq", mode === "publish" ? "16" : "20",
          "-b:v", "0", "-pix_fmt", "yuv420p", "-r", "30",
          "-movflags", "+faststart", silentFile, "-loglevel", "error",
        ],
      });
    }
    if (mode === "review") {
      const soundFile = vibe ? sourceAct.sfx : sourceAct.audio;
      const duration = range ? range[1] - range[0] : visualTiming?.total_s;
      let soundFilter = null;
      if (vibe && soundFile) {
        const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=channels", "-of", "json", absolute(rootDir, soundFile)], { encoding: "utf8", windowsHide: true });
        if (probe.status !== 0) throw new Error(`动作声读取失败：${soundFile}`);
        const channels = JSON.parse(probe.stdout).streams?.[0]?.channels;
        if (![1, 2].includes(channels)) throw new Error("Vibe动作声只支持单声道或立体声");
        soundFilter = `${channels === 1 ? 'pan=stereo|c0=c0|c1=c0,' : ''}apad,atrim=duration=${duration}`;
      }
      steps.push({
        type: "mux-wav",
        act: actNumber,
        command: "ffmpeg",
        args: [
          "-y", "-i", silentFile,
          ...(range && soundFile ? ["-ss", String(range[0])] : []),
          ...(soundFile ? ["-i", absolute(rootDir, soundFile)] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
          "-map", "0:v:0", "-map", "1:a:0",
          "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
          "-ar", "48000", "-ac", vibe ? "2" : "1",
          ...(soundFilter ? ["-af", soundFilter] : []),
          ...(vibe ? ["-t", String(duration)] : [...(range ? ["-t", String(range[1] - range[0])] : []), "-shortest"]), finalFile,
          "-loglevel", "error",
        ],
      });
    }
    steps.push({
      type: "decode",
      act: actNumber,
      command: "ffmpeg",
      args: ["-v", "error", "-i", finalFile, "-f", "null", "-"],
    });
    if (sourceAct.motion_check) {
      steps.push({
        type: "motion-check",
        act: actNumber,
        command: process.execPath,
        args: [path.join(BUILD_TOOLS_DIR, "check_course_motion.mjs"), finalFile,
          sourceAct.motion_check.crop, path.join(buildDir, "motion-report.json"),
          String(sourceAct.motion_check.max_still_s ?? 6)],
      });
    }
    return {
      act: actNumber,
      source: visualSource,
      audio: vibe ? sourceAct.sfx ? absolute(rootDir, sourceAct.sfx) : null : absolute(rootDir, sourceAct.audio),
      timings: absolute(rootDir, vibe ? sourceAct.visual_timing : sourceAct.timings),
      vibe,
      subtitleHighlights: sourceAct.subtitle_highlights,
      motionCheck: sourceAct.motion_check ?? null,
      allowedWarnings: sourceAct.allowed_warnings,
      visualAssets: (sourceAct.visual_assets ?? []).map(file => absolute(rootDir, file)),
      range,
      buildDir,
      output: finalFile,
      prepare: {
        includeCover: mode === "publish" && actNumber === 1,
        coverFile: mode === "publish" && actNumber === 1
          ? absolute(rootDir, index.cover_output)
          : null,
        coverDurationS: Number(index.cover_embed?.duration_s ?? 0.5),
        chapter: chapterProgress ? {
          titles: chapterProgress.titles,
          totalS: chapterProgress.totalS,
          acts: chapterProgress.acts,
          startS: chapterProgress.acts[actNumber - 1].startS,
          endS: chapterProgress.acts[actNumber - 1].endS,
          introEndS: actNumber === 1 ? chapterProgress.introEndS : 0,
        } : null,
      },
      inputs: [
        visualSource,
        ...(sourceAct.visual_assets ?? []).map(file => absolute(rootDir, file)),
        ...(chapterProgress ? [chapterProgress.timelineFile] : []),
        ...(openingOverlay ? [absolute(rootDir, openingOverlay.video)] : []),
        ...(vibe ? sourceAct.sfx ? [absolute(rootDir, sourceAct.sfx)] : [] : [absolute(rootDir, sourceAct.audio)]),
        absolute(rootDir, vibe ? sourceAct.visual_timing : sourceAct.timings),
        ...(vibe ? [path.join(BUILD_TOOLS_DIR, "../vibe/vibe_timeline.mjs")] : []),
        ...(vibe ? [path.join(BUILD_TOOLS_DIR, "../teaching/course_act_split_preview.mjs")] : []),
        absolute(rootDir, "templates/course-explainer-3x4/package.json"),
        absolute(rootDir, "templates/course-explainer-3x4/fonts/NotoSansSC-400.woff2"),
        absolute(rootDir, "templates/course-explainer-3x4/fonts/NotoSansSC-700.woff2"),
        absolute(rootDir, "templates/course-explainer-3x4/assets/red-maple-leaf.png"),
        COURSE_VIDEO_TOOL,
        ...(chapterProgress ? [path.join(BUILD_TOOLS_DIR, "../teaching/course_chapter_progress.mjs")] : []),
        path.join(BUILD_TOOLS_DIR, "check_course_reveal.mjs"),
        ...(sourceAct.motion_check ? [path.join(BUILD_TOOLS_DIR, "check_course_motion.mjs")] : []),
        path.join(BUILD_TOOLS_DIR, "../teaching/timings_to_subs.py"),
        path.join(BUILD_TOOLS_DIR, "inject_course_subs.py"),
        ...(mode === "publish"
          ? [path.join(BUILD_TOOLS_DIR, "../teaching/inject_course_cover.py")]
          : []),
        ...(mode === "publish" && actNumber === 1
          ? [absolute(rootDir, index.cover_output)]
          : []),
      ],
      steps: checkOnly ? steps.filter(step => ["check", "first-reveal"].includes(step.type)) : steps,
    };
  });

  let outputPath = vibe ? null : index[mode + "_output"];
  if (!outputPath) {
    const slug = String(index.slug ?? "").trim();
    if (!slug) throw new Error("自动确定输出位置需要制作索引 slug");
    const name = episode + "_" + slug;
    outputPath = path.posix.join(
      "pipeline/output/course", name, version,
      "course_" + name + "_" + version + (mode === "publish" ? "_publish" : "") + ".mp4",
    );
  }
  const finalOutput = absolute(rootDir, outputPath);
  const concatOutput = mode === "publish"
    ? absolute(rootDir, `pipeline/build/course_${episode}_${version}_publish_silent.mp4`)
    : finalOutput;
  const finalSteps = [{
    type: "concat",
    inputs: acts.map((act) => act.output),
    output: concatOutput,
    audio: mode === "review",
    copyVideo: vibe,
    channels: vibe ? 2 : 1,
  }];
  if (mode === "publish") {
    finalSteps.push({
      type: "mux-review-audio",
      command: "ffmpeg",
      args: [
        "-y", "-i", concatOutput,
        "-i", absolute(rootDir, index.review_output),
        "-map", "0:v:0", "-map", "1:a:0",
        // 音频从已确认审片版原样复制，不能加 -shortest：尾部不足一帧的差会被截掉，
        // 导致审片版与发布版解码音频指纹不一致，发布包验收必然失败。
        "-c", "copy", "-movflags", "+faststart", finalOutput,
        "-loglevel", "error",
      ],
    });
  }
  finalSteps.push({
    type: "decode",
    command: "ffmpeg",
    args: ["-v", "error", "-i", finalOutput, "-f", "null", "-"],
  });
  finalSteps.push({ type: "record-output" });
  if (mode === "publish") {
    finalSteps.push({
      type: "release-check",
      command: "node",
      args: ["build/common/check_course_release.mjs", index.__indexPath ?? ""],
    });
  }
  finalSteps.push({
    type: "qc-report",
    videoFile: finalOutput,
    outputDir: path.join(path.dirname(finalOutput), "qc"),
    timelineFile: absolute(rootDir, index.timeline_summary),
    coverDurationS: Number(index.cover_embed?.duration_s ?? 0.5),
    fps: Number(index.publish_spec?.fps ?? 30),
  });
  const requiredInputs = [...new Set([
    ...acts.flatMap((act) => act.inputs),
    ...(!selectedAct && !checkOnly ? [absolute(rootDir, index.timeline_summary)] : []),
    ...(!selectedAct && !checkOnly && index.__indexPath ? [
      absolute(rootDir, index.__indexPath),
      absolute(rootDir, "course/episodes.json"),
    ] : []),
    ...(mode === "publish" ? [absolute(rootDir, index.review_output)] : []),
  ])];
  return {
    mode,
    rootDir: path.resolve(rootDir),
    index,
    acts,
    partial: Boolean(selectedAct || checkOnly),
    checkOnly,
    range,
    requiredInputs,
    finalOutput,
    finalSteps: selectedAct || checkOnly ? [] : finalSteps,
  };
}

function runCaptured(command, args, { cwd = process.cwd(), spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
    throw new Error(output || `${command} 执行失败`);
  }
  return String(result.stdout ?? "");
}

function createVibePublishPlan(index, rootDir) {
  if (!index.example && !index.review_approval?.confirmed) throw new Error("publish需要review_approval确认完整Vibe审片版");
  const review = absolute(rootDir, index.review_output);
  if (!index.example && index.review_approval.sha256 !== hashFile(review)) throw new Error("确认后的审片版发生变化，哈希不一致");
  if (!index.cover_selection || !index.publish_copy) throw new Error("publish需要已选独立封面及publish_copy");
  const version = index.current_version;
  const output = `pipeline/output/course/${index.episode}_${index.slug}/${version}/course_${index.episode}_${index.slug}_${version}_publish.mp4`;
  const finalOutput = absolute(rootDir, output);
  const coverOutput = path.join(path.dirname(finalOutput), "cover.png");
  if (finalOutput === review) throw new Error("发布输出不能覆盖审片版");
  return {
    mode: "publish", rootDir: path.resolve(rootDir), index, acts: [], partial: false,
    requiredInputs: [review, absolute(rootDir, index.cover_output), absolute(rootDir, index.publish_copy), absolute(rootDir, index.timeline_summary)],
    finalOutput, coverOutput,
    finalSteps: [
      { type: "copy-review", input: review, output: finalOutput },
      { type: "copy-cover", input: absolute(rootDir, index.cover_output), output: coverOutput },
      { type: "decode", command: "ffmpeg", args: ["-v", "error", "-xerror", "-i", finalOutput, "-f", "null", "-"] },
      { type: "record-output" },
      { type: "release-check", command: process.execPath, args: [path.join(BUILD_TOOLS_DIR, "check_course_release.mjs"), index.__indexPath ?? ""] },
      { type: "qc-report", videoFile: finalOutput, outputDir: path.join(path.dirname(finalOutput), "qc"), timelineFile: absolute(rootDir, index.timeline_summary), coverDurationS: 0, fps: 30 },
    ],
  };
}

function copyRequired(source, target) {
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
    throw new Error(`所需文件不存在：${source}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

export function prepareCourseAct(act, plan, { spawnSyncImpl = spawnSync } = {}) {
  const sourceText = fs.readFileSync(act.source, { encoding: "utf8" });
  if (act.range) {
    const timing = JSON.parse(fs.readFileSync(act.timings, { encoding: "utf8" }));
    if (act.range[1] > Number(act.vibe ? timing.total_s : timing.total)) throw new Error("片段结束时间不能超过本幕时间表");
    if (/<(?:video|audio)\b|\bdata-composition-src\s*=/iu.test(sourceText)) {
      throw new Error("片段预览目前只支持单根 GSAP 画面和外置 WAV，不支持内嵌媒体或子合成");
    }
  }
  if (!act.prepare.includeCover && /\bid\s*=\s*(['"])cover-intro\1/iu.test(sourceText)) {
    throw new Error("review 源 HTML 不得遗留 cover-intro 封面层");
  }
  const checkStep = act.steps.find((step) => step.type === "check");
  const layoutCheckTimes = extractCourseLayoutCheckTimes(sourceText).filter(
    (time) => !act.prepare.includeCover || time > act.prepare.coverDurationS,
  );
  if (checkStep && layoutCheckTimes.length) {
    const separator = checkStep.args.indexOf("--");
    if (separator >= 0) checkStep.args.splice(separator);
    checkStep.args.push("--", "--at", layoutCheckTimes.join(","));
  }
  const templateDir = path.join(plan.rootDir, "templates/course-explainer-3x4");
  fs.mkdirSync(act.buildDir, { recursive: true });
  copyRequired(path.join(templateDir, "package.json"), path.join(act.buildDir, "package.json"));
  copyRequired(
    path.join(templateDir, "fonts/NotoSansSC-400.woff2"),
    path.join(act.buildDir, "fonts/NotoSansSC-400.woff2"),
  );
  copyRequired(
    path.join(templateDir, "fonts/NotoSansSC-700.woff2"),
    path.join(act.buildDir, "fonts/NotoSansSC-700.woff2"),
  );
  copyRequired(
    path.join(templateDir, "assets/red-maple-leaf.png"),
    path.join(act.buildDir, "assets/red-maple-leaf.png"),
  );
  for (const asset of act.visualAssets ?? []) {
    copyRequired(asset, path.join(act.buildDir, 'assets', path.basename(asset)));
  }

  const subtitleArgs = [path.join(BUILD_TOOLS_DIR, "../teaching/timings_to_subs.py"), act.timings];
  if (act.subtitleHighlights.length) {
    if (typeof act.subtitleHighlights[0] === "string") {
      subtitleArgs.push(act.subtitleHighlights.join(","));
    } else {
      subtitleArgs.push("--highlights-json", JSON.stringify(act.subtitleHighlights));
    }
  }
  const subtitles = act.vibe ? vibeSubtitleDeclaration(act.timings) : runCaptured(PYTHON_COMMAND, subtitleArgs, {
    cwd: plan.rootDir,
    spawnSyncImpl,
  });
  const subsFile = path.join(act.buildDir, "subs.txt");
  fs.writeFileSync(subsFile, subtitles, { encoding: "utf8" });
  const withSubs = path.join(act.buildDir, "index.with-subs.html");
  runCaptured(PYTHON_COMMAND, [
    path.join(BUILD_TOOLS_DIR, "inject_course_subs.py"),
    act.source,
    subsFile,
    withSubs,
  ], { cwd: plan.rootDir, spawnSyncImpl });
  const indexFile = path.join(act.buildDir, "index.html");
  if (act.prepare.includeCover) {
    const coverTarget = path.join(act.buildDir, "assets/cover.png");
    copyRequired(act.prepare.coverFile, coverTarget);
    runCaptured(PYTHON_COMMAND, [
      path.join(BUILD_TOOLS_DIR, "../teaching/inject_course_cover.py"),
      withSubs,
      "assets/cover.png",
      indexFile,
      "--duration", String(act.prepare.coverDurationS),
    ], { cwd: plan.rootDir, spawnSyncImpl });
  } else {
    fs.copyFileSync(withSubs, indexFile);
  }
  if (act.prepare.chapter) {
    const prepared = fs.readFileSync(indexFile, { encoding: "utf8" });
    fs.writeFileSync(indexFile, injectCourseChapterProgressHtml(prepared, act.prepare.chapter), {
      encoding: "utf8",
    });
  }
  fs.rmSync(withSubs, { force: true });
}

export function canReuseCourseAct(act, { spawnSyncImpl = spawnSync } = {}) {
  if (act.range) return false;
  if (!fs.existsSync(act.output) || !fs.statSync(act.output).isFile()) {
    return false;
  }
  for (const input of act.inputs) {
    if (!fs.existsSync(input)) {
      return false;
    }
  }
  const stateFile = path.join(act.buildDir, ".course-video-state.json");
  if (!fs.existsSync(stateFile)) {
    return false;
  }
  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, { encoding: "utf8" }));
  } catch {
    return false;
  }
  if (state.signature !== courseActSignature(act)) {
    return false;
  }
  if (state.output_hash !== hashFile(act.output)) return false;
  const decode = spawnSyncImpl("ffmpeg", [
    "-v", "error", "-i", act.output, "-f", "null", "-",
  ], { encoding: "utf8", windowsHide: true });
  return decode.status === 0;
}

function hashFile(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function courseActSignature(act) {
  const inputs = act.inputs.map((file) => {
    return { file: path.resolve(file), sha256: hashFile(file) };
  });
  return createHash("sha256").update(JSON.stringify({
    inputs,
    subtitle_highlights: act.subtitleHighlights,
    motion_check: act.motionCheck,
    allowed_warnings: act.allowedWarnings,
    include_cover: act.prepare.includeCover,
    cover_duration_s: act.prepare.coverDurationS,
    ...(act.prepare.chapter ? { chapter: act.prepare.chapter } : {}),
  })).digest("hex");
}

export function markCourseActComplete(act) {
  if (act.range) throw new Error("片段预览不能登记整幕完成缓存");
  if (!fs.existsSync(act.output) || !fs.statSync(act.output).isFile()) {
    throw new Error(`不能记录未生成的分幕输出：${act.output}`);
  }
  const stateFile = path.join(act.buildDir, ".course-video-state.json");
  fs.writeFileSync(stateFile, `${JSON.stringify({
    signature: courseActSignature(act),
    output: act.output,
    output_hash: hashFile(act.output),
  }, null, 2)}\n`, { encoding: "utf8" });
}

function waitForCourseRenderOutput(file, { timeoutMs = 600000, pollMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 0) return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
  }
  throw new Error(`render 返回后未在 ${timeoutMs / 1000} 秒内生成无声视频：${file}`);
}

export function parseCourseWarnings(output) {
  const warnings = {};
  for (const line of String(output).split(/\r?\n/u)) {
    if (!line.includes("⚠")) continue;
    const coded = line.match(/⚠\s+([a-z][a-z0-9_-]+)\s*:/iu);
    if (coded) {
      warnings[coded[1]] = (warnings[coded[1]] ?? 0) + 1;
      continue;
    }
    const contrast = line.match(/⚠\s+WCAG AA contrast warnings\s*\((\d+)\)/iu);
    if (contrast) {
      warnings.wcag_aa_contrast = Number(contrast[1]);
      continue;
    }
    warnings.unclassified_warning = (warnings.unclassified_warning ?? 0) + 1;
  }
  return warnings;
}

export function verifyCourseVideoInputs(plan) {
  for (const file of plan.requiredInputs) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
      throw new Error(`输入预检失败，文件不存在或为空：${file}`);
    }
  }
  if (requiresEpisodeContract(plan.index?.episode, 9, plan.index?.production_contract === "current")) {
    for (const act of plan.acts) {
      if (!act.source) continue;
      const sourceText = fs.readFileSync(act.source, { encoding: "utf8" });
      assertCourseVisualLayoutPolicy(sourceText, `第 ${act.act} 幕画面源`);
    }
  }
  if (plan.index?.route === "vibe") {
    assertVibeContent(plan.index, { rootDir: plan.rootDir, checkPreview: true, acts: plan.mode === "publish"
      ? plan.index.acts : plan.acts.map(act => ({ act: act.act, visual_timing: act.timings })) });
    const timeline = JSON.parse(fs.readFileSync(absolute(plan.rootDir, plan.index.timeline_summary), { encoding: "utf8" }));
    assertVibeTimeline(timeline, plan.index.acts.length, plan.index.publish_spec.duration_s);
    for (const act of plan.acts) {
      const timing = readVibeTiming(act.timings);
      const source = fs.readFileSync(act.source, { encoding: "utf8" });
      const duration = Number(source.match(/\bconst\s+DUR\s*=\s*([\d.]+)/u)?.[1]);
      if (Math.abs(duration - timing.total_s) > .002 || !Number.isFinite(duration)) throw new Error("Vibe画面DUR与时间表不一致");
      const rootTag = source.match(/<[^>]+\bdata-composition-id\s*=\s*["']main["'][^>]*>/u)?.[0] ?? "";
      const rootDuration = Number(rootTag.match(/data-duration\s*=\s*["']([\d.]+)["']/u)?.[1]);
      if (!Number.isFinite(rootDuration) || Math.abs(rootDuration - timing.total_s) > .002) throw new Error("Vibe根data-duration与时间表不一致");
      for (const field of ["width", "height"]) {
        const actual = Number(rootTag.match(new RegExp(`data-${field}\\s*=\\s*["'](\\d+)["']`, 'u'))?.[1]);
        if (actual !== plan.index.publish_spec[field]) throw new Error(`Vibe画面${field}与发布规格不一致`);
      }
      const boundary = timeline.acts[act.act - 1];
      if (Math.abs(boundary.duration_s - timing.total_s) > .002) throw new Error("Vibe整期时间表已过期，请重新生成");
    }
    return;
  }
  if (!requiresEpisodeContract(plan.index?.episode, 6, plan.index?.production_contract === "current")) return;
  const lastActNumber = plan.index?.acts?.length ?? 4;
  const lastAct = plan.acts.find((act) => Number(act.act) === lastActNumber);
  if (!lastAct) {
    if (plan.partial) return;
    throw new Error(`输入预检失败，缺少最后一幕（第 ${lastActNumber} 幕）`);
  }
  assertCourseOutroTailArtifacts({
    audioFile: lastAct.audio,
    timingsFile: lastAct.timings,
    visualFile: lastAct.source,
  });
}


function recordCourseVideoOutput(plan, { spawnSyncImpl = spawnSync } = {}) {
  if (!fs.existsSync(plan.finalOutput) || !fs.statSync(plan.finalOutput).isFile()
    || fs.statSync(plan.finalOutput).size === 0) {
    throw new Error("不能登记视频，文件不存在或为空：" + plan.finalOutput);
  }
  const indexPath = absolute(plan.rootDir, plan.index.__indexPath);
  const storedIndex = JSON.parse(fs.readFileSync(indexPath, { encoding: "utf8" }));
  for (const key of ["episode", "slug", "current_version"]) {
    if (storedIndex[key] !== plan.index[key]) {
      throw new Error("制作索引在渲染期间发生变化：" + key);
    }
  }
  const timeline = JSON.parse(fs.readFileSync(
    absolute(plan.rootDir, storedIndex.timeline_summary), { encoding: "utf8" },
  ));
  const duration = Number(timeline.total_s);
  const probe = JSON.parse(runCaptured("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "json", plan.finalOutput,
  ], { cwd: plan.rootDir, spawnSyncImpl }));
  const actualDuration = Number(probe.format?.duration);
  const tolerance = Number(storedIndex.publish_spec?.duration_tolerance_s ?? 0.1);
  if (!Number.isFinite(duration) || duration <= 0
    || !Number.isFinite(actualDuration) || actualDuration <= 0
    || !Number.isFinite(tolerance) || tolerance < 0
    || Math.abs(actualDuration - duration) > tolerance) {
    throw new Error("生成视频时长与正式时间表不符，不能登记输出");
  }
  const ledgerPath = path.join(plan.rootDir, "course", "episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  const episodeNumber = Number(String(storedIndex.episode).replace(/^ep/iu, ""));
  const episode = ledger.episodes?.find((item) => Number(item.ep) === episodeNumber);
  if (!episode || episode.slug !== storedIndex.slug || episode.topic !== storedIndex.topic) {
    throw new Error("课程台账期号、slug 或主题与制作索引不一致，不能登记输出");
  }

  // 只登记已经生成并解码的文件；时长沿用正式音频时间表，允许容器编码尾差。
  const outputKey = plan.mode + "_output";
  const output = path.relative(plan.rootDir, plan.finalOutput).replaceAll("\\", "/");
  storedIndex[outputKey] = output;
  if (storedIndex.route === "vibe") storedIndex.publish_bundle = null;
  if (storedIndex.route === "vibe" && plan.mode === "review") {
    storedIndex.review_base_output = output;
    if (storedIndex.review_approval?.sha256 !== hashFile(plan.finalOutput)) storedIndex.review_approval = null;
    storedIndex.audio_mix = null;
  }
  if (storedIndex.route === "vibe" && plan.mode === "publish") {
    const cover = path.relative(plan.rootDir, plan.coverOutput).replaceAll("\\", "/");
    if (!storedIndex.cover_upload_output || storedIndex.cover_upload_output === storedIndex.cover_output) storedIndex.cover_upload_output = cover;
    storedIndex.cover_output = cover;
  }
  const publishedFile = typeof storedIndex.publish_output === "string"
    ? absolute(plan.rootDir, storedIndex.publish_output) : null;
  const keepPublishedOutput = plan.mode === "review" && publishedFile
    && episode.version === storedIndex.current_version
    && typeof episode.output === "string"
    && absolute(plan.rootDir, episode.output) === publishedFile
    && fs.existsSync(publishedFile) && fs.statSync(publishedFile).isFile()
    && fs.statSync(publishedFile).size > 0;
  if (!keepPublishedOutput) {
    storedIndex.publish_spec = { ...storedIndex.publish_spec, duration_s: duration };
    episode.output = output;
    episode.version = storedIndex.current_version;
    episode.duration_s = duration;
  }
  fs.writeFileSync(indexPath, JSON.stringify(storedIndex, null, 2) + "\n", { encoding: "utf8" });
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n", { encoding: "utf8" });
  plan.index[outputKey] = output;
}

export function executeCourseStep(step, plan, {
  spawnSyncImpl = spawnSync,
  waitForRenderOutput = waitForCourseRenderOutput,
  writeOutput = (value) => process.stdout.write(value),
  qcReporter = (qcStep) => {
    const timeline = JSON.parse(fs.readFileSync(qcStep.timelineFile, { encoding: "utf8" }));
    return generateCourseQcReport({
      videoFile: qcStep.videoFile,
      outputDir: qcStep.outputDir,
      timeline,
      coverDurationS: qcStep.coverDurationS,
      fps: qcStep.fps,
      spawnSyncImpl,
    });
  },
} = {}) {
  if (step.type === "copy-review" || step.type === "copy-cover") {
    if (path.resolve(step.input) !== path.resolve(step.output)) copyRequired(step.input, step.output);
    return;
  }
  if (step.type === "record-output") {
    recordCourseVideoOutput(plan, { spawnSyncImpl });
    return;
  }
  if (step.type === "qc-report") {
    qcReporter(step, plan);
    return;
  }
  let command = step.command;
  let args = step.args;
  if (step.type === "concat") {
    fs.mkdirSync(path.dirname(step.output), { recursive: true });
    const listFile = `${step.output}.concat.txt`;
    const list = `${step.inputs.map((file) => ffconcatFileLine(path.resolve(file))).join("\n")}\n`;
    fs.writeFileSync(listFile, list, { encoding: "utf8" });
    command = "ffmpeg";
    args = [
      "-y", "-f", "concat", "-safe", "0",
      "-i", listFile,
      "-map", "0:v:0", ...(step.audio === false ? [] : ["-map", "0:a:0"]),
      ...(step.copyVideo ? ["-c:v", "copy"] : ["-c:v", "h264_nvenc", "-preset", "p4", "-profile:v", "main", "-pix_fmt", "yuv420p"]),
      ...(step.audio === false ? [] : ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", String(step.channels ?? 1)]),
      "-movflags", "+faststart", step.output,
      "-loglevel", "error",
    ];
  }
  if (!command || !Array.isArray(args)) {
    throw new Error(`${step.type} 缺少可执行命令`);
  }
  if (process.platform === "win32" && command === "npm.cmd") {
    command = GIT_BASH;
    args = ["-lc", 'npm "$@"', "course-video-npm", ...args];
  }
  if (step.type === "render" && typeof step.output === "string" && step.output.trim()) {
    fs.rmSync(step.output, { force: true });
  }
  const captureOutput = step.type === "check";
  const result = spawnSyncImpl(command, args, {
    cwd: plan.rootDir,
    ...(captureOutput ? { encoding: "utf8" } : { stdio: "inherit" }),
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });
  if (captureOutput) {
    if (result.stdout) writeOutput(String(result.stdout));
    if (result.stderr) writeOutput(String(result.stderr));
  }
  if (result.status !== 0) {
    const detail = result.error?.message ? `：${result.error.message}` : "";
    throw new Error(`${step.type} 失败，退出码 ${result.status}${detail}`);
  }
  if (step.type === "render") {
    if (typeof step.output !== "string" || !step.output.trim()) {
      throw new Error("render 缺少无声输出路径");
    }
    waitForRenderOutput(step.output);
  }
  if (captureOutput) {
    const warnings = parseCourseWarnings(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    for (const [code, actual] of Object.entries(warnings)) {
      const allowed = Number(step.allowedWarnings?.[code] ?? 0);
      if (actual > allowed) {
        throw new Error(`warning ${code} 实际 ${actual}，允许最多 ${allowed}`);
      }
    }
  }
}

export function runCourseVideoPlan(plan, {
  verifyInputs = verifyCourseVideoInputs,
  canReuseAct = canReuseCourseAct,
  prepareAct = prepareCourseAct,
  executeStep = executeCourseStep,
  markActComplete = markCourseActComplete,
  logger = () => {},
} = {}) {
  verifyInputs(plan);
  for (const act of plan.acts) {
    if (!plan.checkOnly && !plan.range && canReuseAct(act)) {
      logger(`第 ${act.act} 幕输出仍有效，跳过重渲染`);
      continue;
    }
    try {
      logger(`第 ${act.act} 幕：准备构建目录`);
      prepareAct(act, plan);
      for (const step of act.steps) {
        if (step.type === "render" && act.range) prepareCourseRange(act);
        logger(`第 ${act.act} 幕：${step.type}`);
        executeStep(step, plan);
      }
      if (!plan.checkOnly && !plan.range) markActComplete(act);
    } catch (error) {
      throw new Error(`第 ${act.act} 幕失败：${error.message}`, { cause: error });
    }
  }
  for (const step of plan.finalSteps) {
    try {
      logger(`整期：${step.type}`);
      executeStep(step, plan);
    } catch (error) {
      throw new Error(`最终步骤 ${step.type} 失败：${error.message}`, { cause: error });
    }
  }
}

// 检查原始整幕后，只在独立预览目录映射采帧时间；正式 HTML 和完成缓存不变。
export function prepareCourseRange(act) {
  const file = path.join(act.buildDir, "index.html");
  const source = fs.readFileSync(file, { encoding: "utf8" });
  const [start, end] = act.range;
  if (!/<\/body>/iu.test(source) || !/data-duration\s*=\s*["'][\d.]+["']/iu.test(source)) {
    throw new Error("片段预览需要完整 HTML 和根 data-duration");
  }
  const adapter = `<script>
  (() => {
    const original = window.__timelines?.main;
    if (!original || !window.gsap) throw new Error('片段预览缺少 GSAP main 时间轴');
    original.pause();
    const preview = gsap.timeline({paused:true});
    preview.fromTo(original, {time:${start}}, {time:${end}, duration:${end - start}, ease:'none', immediateRender:true});
    window.__timelines.main = preview;
  })();
  </script>`;
  fs.writeFileSync(file, source.replace(/data-duration\s*=\s*["'][\d.]+["']/iu, `data-duration="${end - start}"`)
    .replace(/<\/body>/iu, `${adapter}</body>`), { encoding: "utf8" });
}

export function parseCourseVideoOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    const key = {"--act":"act", "--check-only":"checkOnly", "--range":"range"}[flag];
    if (!key || key in options) throw new Error(`未知或重复选项：${flag}`);
    if (flag === "--check-only") { options.checkOnly = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少参数`);
    if (flag === "--act") options.act = Number(value);
    else {
      if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/u.test(value)) throw new Error("--range 格式为起秒:止秒");
      options.range = value.split(":").map(Number);
    }
  }
  return options;
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const [mode, indexPath, ...extra] = process.argv.slice(2);
  if (!mode || !indexPath) {
    console.error("用法：node build/common/course_video.mjs <review|publish> <制作索引.json> [--act N] [--check-only | --range 起秒:止秒]");
    process.exitCode = 2;
  } else {
    try {
      const absoluteIndexPath = path.resolve(indexPath);
      const index = JSON.parse(fs.readFileSync(absoluteIndexPath, { encoding: "utf8" }));
      index.__indexPath = path.relative(process.cwd(), absoluteIndexPath).replaceAll("\\", "/");
      const plan = createCourseVideoPlan(index, mode, parseCourseVideoOptions(extra));
      if (mode === "publish" && !index.example && markCourseDashboardPendingPublish(index, { rootDir: plan.rootDir })) {
        console.log("课程台账：正式封面已确认，看板状态已同步为待发布");
      }
      if (mode === "publish" && index.example) console.log("技术示例：只验收本地发布包，不登记用户确认或公开发布事实");
      runCourseVideoPlan(plan, { logger: (message) => console.log(message) });
      console.log(`${index.episode} ${index.current_version} ${mode} ${plan.checkOnly ? '预检完成（未渲染）' : plan.partial ? `分幕${plan.range ? '片段预览' : ''}完成：${plan.acts[0].output}` : `流程完成：${plan.finalOutput}`}`);
    } catch (error) {
      console.error(`课程视频流程失败：${error.message}`);
      process.exitCode = 1;
    }
  }
}
