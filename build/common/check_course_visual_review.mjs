// 用途：校验教学视觉复核证据与当前输入、视频的一致性，独立于技术检测及用户审片。
// 运行：node build/common/check_course_visual_review.mjs <制作索引.json> [--record]
// 依赖：Node.js 内置模块；助手复核须有实际片段，用户最终接受须绑定确认依据与版本。
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolveRetainedMedia } from "./retained_media.mjs";

// 这些工具与共享资产会改变实际字幕、章节栏和渲染结果，须与已审版本一起锁定。
export const COURSE_VISUAL_RENDER_INPUTS = [
  "build/common/course_video.mjs",
  "build/common/inject_course_subs.py",
  "build/teaching/timings_to_subs.py",
  "build/teaching/course_chapter_progress.mjs",
  "templates/course-explainer-3x4/package.json",
  "templates/course-explainer-3x4/fonts/NotoSansSC-400.woff2",
  "templates/course-explainer-3x4/fonts/NotoSansSC-700.woff2",
  "templates/course-explainer-3x4/assets/red-maple-leaf.png",
];

export function requiresCourseVisualReview(index) {
  return index.route !== "vibe" && !index.example && index.production_contract === "current";
}

function requiredFile(rootDir, value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " 缺少文件路径");
  const file = /\.mp4$/i.test(value) ? resolveRetainedMedia(rootDir, value).absolute : path.resolve(rootDir, value);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
    throw new Error(label + " 文件不存在或为空：" + value);
  }
  return file;
}

function digest(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function visualArtifact(rootDir, value) {
  return { path: value.replaceAll("\\", "/"), sha256: digest(requiredFile(rootDir, value, "视觉证据")) };
}

export function assertCourseVisualPlan(index, { rootDir = process.cwd() } = {}) {
  if (requiresCourseVisualReview(index)) requiredFile(rootDir, index.visual_plan, "visual_plan 独立编排");
}

export function captureCourseVisualInputs(index, { rootDir = process.cwd() } = {}) {
  const paths = [index.visual_plan, index.timeline_summary, ...COURSE_VISUAL_RENDER_INPUTS];
  for (const act of index.acts) {
    paths.push(act.script, act.audio, act.timings, act.visual_source, ...(act.visual_assets ?? []));
    if (act.opening_overlay?.video) paths.push(act.opening_overlay.video);
  }
  const config = {
    chapter_titles: index.chapter_titles,
    selected_style: index.selected_style,
    publish_spec: index.publish_spec,
    acts: index.acts.map(act => ({
      act: act.act, subtitle_highlights: act.subtitle_highlights,
      allowed_warnings: act.allowed_warnings, motion_check: act.motion_check,
      opening_overlay: act.opening_overlay,
    })),
  };
  return {
    version: index.current_version,
    files: [...new Set(paths)].map(value => visualArtifact(rootDir, value)),
    config_sha256: createHash("sha256").update(JSON.stringify(config)).digest("hex"),
  };
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " 不能为空");
}

function checkArtifact(artifact, rootDir, label) {
  if (!artifact || visualArtifact(rootDir, artifact.path).sha256 !== artifact.sha256) {
    throw new Error(label + " 缺失或哈希不一致");
  }
}

function checkPlayback(record, duration, label) {
  if (!record || record.method !== "continuous_playback" || record.playback_rate !== 1
    || record.start_s !== 0 || !Number.isFinite(record.end_s) || Math.abs(record.end_s - duration) > .05) {
    throw new Error(label + " 必须记录正常速度完整连续审看");
  }
  requireText(record.observation, label + " 实际观察");
  if (record.result !== "passed") throw new Error(label + " 失败或待核验");
}

export function inspectCourseVisualReview(index, { rootDir = process.cwd() } = {}) {
  if (!requiresCourseVisualReview(index)) return { status: "not_required" };
  try {
    if (!index.visual_review) {
      const approval = index.review_approval;
      if (approval?.visual_quality_accepted !== true) return { status: "pending", reason: "缺少 visual_review 视觉复核证据" };
      requireText(approval.source, "用户整片视觉接受依据");
      if (approval.confirmed !== true || approval.reviewer !== "user") throw new Error("缺少用户明确的整片视觉接受");
      const media = visualArtifact(rootDir, index.review_output);
      if (approval.version !== index.current_version || approval.sha256 !== media.sha256
        || JSON.stringify(approval.inputs) !== JSON.stringify(captureCourseVisualInputs(index, { rootDir }))) {
        return { status: "stale", reason: "用户接受的版本、视频或输入已变化，不能沿用确认" };
      }
      return { status: "accepted_by_user", reason: "用户明确接受当前整片视觉质量；助手未完成的连续审看仍单独保留待核验" };
    }
    const evidence = JSON.parse(fs.readFileSync(requiredFile(rootDir, index.visual_review, "视觉复核"), { encoding: "utf8" }));
    const inputs = captureCourseVisualInputs(index, { rootDir });
    if (JSON.stringify(evidence.inputs) !== JSON.stringify(inputs)) {
      return { status: "stale", reason: "编排、版本、源文件、配音或构建配置变化，旧视觉复核失效" };
    }
    const media = visualArtifact(rootDir, index.review_output);
    if (evidence.media?.path !== media.path || evidence.media?.sha256 !== media.sha256) {
      return { status: "stale", reason: "审片视频变化，旧视觉复核失效" };
    }
    if (!Array.isArray(evidence.acts) || evidence.acts.length !== index.acts.length) throw new Error("视觉复核缺少整幕证据");
    for (const act of index.acts) {
      const review = evidence.acts.find(item => item.act === act.act);
      if (!review) throw new Error("缺少第 " + act.act + " 幕视觉复核");
      const expectedMedia = "pipeline/build/course_" + index.episode + "_act" + act.act + "_" + index.current_version
        + "_review/act" + act.act + "_final_standard.mp4";
      if (review.media?.path !== expectedMedia) throw new Error("分幕视频不是当前版本的正式审片输出");
      checkArtifact(review.media, rootDir, "分幕视频");
      const timings = JSON.parse(fs.readFileSync(requiredFile(rootDir, act.timings, "timings"), { encoding: "utf8" }));
      const segments = review.segments;
      if (!Array.isArray(segments) || !segments.length) throw new Error("缺少动作片段");
      for (const segment of segments) {
        if (!Number.isFinite(segment.start_s) || !Number.isFinite(segment.end_s)
          || segment.start_s < 0 || segment.end_s <= segment.start_s || segment.end_s > timings.total + .05) {
          throw new Error("动作片段时段无效");
        }
        for (const key of ["plan_ref", "expected", "observed_before", "observed_change", "observed_after", "fix_and_recheck"]) {
          requireText(segment[key], "动作片段 " + key);
        }
        if (segment.method !== "continuous_playback" || segment.playback_rate !== 1 || segment.result !== "passed") {
          throw new Error("动作片段失败或未按正常速度连续复核");
        }
        checkArtifact(segment.clip, rootDir, "实际动画片段");
        if (!Array.isArray(segment.frames) || segment.frames.length !== 3) throw new Error("缺少动作前、中、后三帧");
        let lastTime = -1;
        for (const [i,frame] of segment.frames.entries()) {
          if (frame.phase !== ["before","during","after"][i] || !Number.isFinite(frame.time_s)
            || frame.time_s < segment.start_s || frame.time_s > segment.end_s || frame.time_s <= lastTime) {
            throw new Error("动作前、中、后帧时段不一致");
          }
          checkArtifact(frame, rootDir, "动作帧");
          lastTime = frame.time_s;
        }
      }
      for (const phrase of timings.phrases) {
        if (!segments.some(segment => segment.narration_ids?.includes(phrase.id)
          && segment.start_s <= phrase.start + .05 && segment.end_s >= phrase.end - .05)) {
          throw new Error("第 " + act.act + " 幕旁白 " + phrase.id + " 未被完整复核");
        }
      }
      const knownIds = new Set(timings.phrases.map(phrase => phrase.id));
      if (segments.some(segment => !Array.isArray(segment.narration_ids) || !segment.narration_ids.length
        || segment.narration_ids.some(id => !knownIds.has(id)))) throw new Error("复核旁白 ID 不存在");
      checkPlayback(review.full_review, timings.total, "第 " + act.act + " 幕");
    }
    const timeline = JSON.parse(fs.readFileSync(requiredFile(rootDir, index.timeline_summary, "整期时间表"), { encoding: "utf8" }));
    checkPlayback(evidence.full_review, timeline.total_s, "整期");
    return { status: "passed", reason: "证据完整且与当前输入、视频一致；教学质量取决于记录的实际审看判断" };
  } catch (error) {
    return { status: "invalid", reason: error.message };
  }
}

export function assertCourseVisualReady(index, options = {}) {
  const result = inspectCourseVisualReview(index, options);
  if (!["passed","accepted_by_user","not_required"].includes(result.status)) throw new Error("视觉复核未通过：" + result.reason);
  if (!requiresCourseVisualReview(index)) return;
  const approval = index.review_approval;
  const media = visualArtifact(options.rootDir ?? process.cwd(), index.review_output);
  if (approval?.confirmed !== true || approval.version !== index.current_version || approval.sha256 !== media.sha256) {
    throw new Error("需要用户确认当前具体版本，review_approval 版本或视频哈希不一致");
  }
}

export function refreshCourseVisualStatus(index, options = {}) {
  const result = inspectCourseVisualReview(index, options);
  if (result.status === "not_required") return result;
  const passed = result.status === "passed";
  const acceptedByUser = result.status === "accepted_by_user";
  index.visual_review_status = result;
  const status = passed ? "reviewed_with_evidence" : acceptedByUser ? "accepted_by_user" : "pending_visual_review";
  const assistantStatus = passed ? "reviewed_with_evidence" : "pending_visual_review";
  for (const act of index.acts) {
    act.visual_status = status;
    if (!passed && act.assistant_visual_review && act.assistant_visual_review.status !== assistantStatus) {
      act.prior_assistant_visual_review = act.assistant_visual_review;
    }
    act.assistant_visual_review = { status: assistantStatus, report: index.visual_review ?? null, reason: result.reason };
  }
  const approval = index.review_approval;
  const approvalCurrent = !["stale","invalid"].includes(result.status) && approval?.confirmed === true && approval.version === index.current_version
    && approval.sha256 === visualArtifact(options.rootDir ?? process.cwd(), index.review_output).sha256;
  if (approval && !approvalCurrent) {
    index.prior_review_approval = index.review_approval;
    index.review_approval = null;
  }
  index.review_visual_check = {
    status, report: index.visual_review ?? null,
    full_normal_speed_review: passed ? "recorded_with_evidence" : acceptedByUser ? "not_recorded_by_assistant" : "pending",
    user_review: approvalCurrent ? "confirmed" : "pending",
  };
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [indexPath, flag, ...extra] = process.argv.slice(2);
    if (!indexPath || (flag && flag !== "--record") || extra.length) throw new Error("用法：<制作索引.json> [--record]");
    const index = JSON.parse(fs.readFileSync(indexPath, { encoding: "utf8" }));
    const result = flag ? refreshCourseVisualStatus(index) : inspectCourseVisualReview(index);
    if (flag) fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n", { encoding: "utf8" });
    console.log(JSON.stringify(result, null, 2));
    if (!["passed","accepted_by_user","not_required"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
