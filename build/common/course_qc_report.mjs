#!/usr/bin/env node
/**
 * 用途：为 课程成片生成封面边界、幕中代表帧、幕间交界和片尾收尾的本地质检 HTML。
 * 运行：由 build/common/course_video.mjs 自动调用。
 * 依赖：Node.js 与 FFmpeg；报告不依赖浏览器服务或外部网络资源。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";


function floorMilliseconds(value) {
  return Math.floor(value * 1000) / 1000;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function createQcSamples({ timeline, coverDurationS = 0.5, fps = 30 }) {
  if (!Array.isArray(timeline?.acts) || (timeline.route === "vibe"
    ? timeline.acts.length < 1 || timeline.acts.length > 6 : ![4, 6].includes(timeline.acts.length))) {
    throw new Error("质检时间表必须包含 4 幕或 6 幕");
  }
  const totalDuration = Number(timeline.total_s);
  if (!Number.isFinite(totalDuration) || totalDuration <= 1) {
    throw new Error("质检时间表 total_s 必须大于 1 秒");
  }
  const frameDuration = 1 / fps;
  const samples = [
    { group: "封面边界", label: "封面起始", time_s: 0, stem: "cover-start" },
    {
      group: "封面边界",
      label: "封面结束前",
      time_s: floorMilliseconds(Math.max(0, coverDurationS - frameDuration)),
      stem: "cover-last",
    },
    {
      group: "封面边界",
      label: "正文第一帧",
      time_s: floorMilliseconds(coverDurationS + frameDuration),
      stem: "content-first",
    },
  ];
  if (coverDurationS === 0) samples.splice(0, 3, { group: "开场", label: "正文第一帧", time_s: 0, stem: "content-first" });
  timeline.acts.forEach((act, index) => {
    samples.push({
      group: "幕中代表帧",
      label: `第 ${index + 1} 幕中点`,
      time_s: floorMilliseconds((Number(act.start_s) + Number(act.end_s)) / 2),
      stem: `act-${index + 1}-middle`,
    });
  });
  timeline.acts.slice(0, -1).forEach((act, index) => {
    const boundary = Number(act.end_s);
    samples.push(
      {
        group: "幕间交界",
        label: `第 ${index + 1}→${index + 2} 幕前`,
        time_s: floorMilliseconds(Math.max(0, boundary - 0.2)),
        stem: `transition-${index + 1}-${index + 2}-before`,
      },
      {
        group: "幕间交界",
        label: `第 ${index + 1}→${index + 2} 幕后`,
        time_s: floorMilliseconds(Math.min(Number(timeline.total_s), boundary + 0.2)),
        stem: `transition-${index + 1}-${index + 2}-after`,
      },
    );
  });
  samples.push(
    {
      group: "片尾收尾",
      label: timeline.route === "vibe" ? "视频结束前约 0.8 秒" : "最后一句结束后约 0.2 秒",
      time_s: floorMilliseconds(totalDuration - 0.8),
      stem: timeline.route === "vibe" ? "outro-before-end-08" : "outro-after-voice",
    },
    {
      group: "片尾收尾",
      label: "视频结束前约 0.1 秒",
      time_s: floorMilliseconds(totalDuration - 0.1),
      stem: "outro-before-end",
    },
  );
  return samples.map((sample, index) => ({
    ...sample,
    file: `${String(index + 1).padStart(2, "0")}-${sample.stem}.png`,
  }));
}

function renderHtml(videoFile, samples, vibe = false) {
  const groups = [...new Set(samples.map((sample) => sample.group))];
  const sections = groups.map((group) => {
    const cards = samples
      .filter((sample) => sample.group === group)
      .map((sample) => `
        <figure class="card">
          <img src="${escapeHtml(sample.file)}" alt="${escapeHtml(sample.label)}">
          <figcaption><b>${escapeHtml(sample.label)}</b><code>${sample.time_s.toFixed(3)}s</code></figcaption>
        </figure>`).join("");
    return `<section><h2>${escapeHtml(group)}</h2><div class="grid">${cards}</div></section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>课程视频质检报告</title>
  <style>
    :root{--paper:#f2eadb;--card:#fffaf0;--ink:#18263b;--blue:#1f4e79;--red:#d94a3d;--line:#c5b699}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"Noto Sans SC",system-ui,sans-serif}
    main{width:min(1440px,calc(100% - 40px));margin:0 auto;padding:44px 0 72px}header{border-bottom:3px solid var(--blue);padding-bottom:24px}
    .eyebrow{font:700 13px ui-monospace,monospace;letter-spacing:.18em;color:var(--red)}h1{margin:8px 0 12px;font-size:clamp(34px,5vw,68px);line-height:1}
    .progress{display:flex;gap:10px;flex-wrap:wrap}.progress span{border:1px solid var(--blue);padding:7px 11px;background:var(--card);font-size:13px;font-weight:700}
    .source{margin:14px 0 0;color:#615746;word-break:break-all}section{margin-top:42px}h2{font-size:24px;border-left:8px solid var(--red);padding-left:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}.card{margin:0;background:var(--card);border:1px solid var(--line);box-shadow:7px 8px 0 rgba(31,78,121,.13)}
    img{display:block;width:100%;${vibe ? "height:auto;" : "aspect-ratio:3/4;object-fit:cover;"}background:#ddd}figcaption{display:flex;justify-content:space-between;gap:16px;padding:14px 16px;border-top:2px solid var(--blue)}
    code{color:var(--red);font-weight:700}@media(max-width:560px){main{width:min(100% - 24px,1440px);padding-top:24px}.grid{grid-template-columns:1fr 1fr;gap:12px}figcaption{display:block}code{display:block;margin-top:6px}}
  </style>
</head>
<body><main>
  <header>
    <div class="eyebrow">LOCAL QC / STATIC HTML</div>
    <h1>课程视频质检报告</h1>
    <div class="progress"><span>✓ 抽帧完成</span><span>✓ ${vibe ? "开场" : "封面边界"}</span><span>✓ ${samples.filter(sample => sample.group === "幕中代表帧").length} 幕代表帧</span>${samples.some(sample => sample.group === "幕间交界") ? "<span>✓ 幕间交界</span>" : ""}<span>✓ 片尾收尾</span></div>
    <p class="source">视频：${escapeHtml(videoFile)}</p>
  </header>
  ${sections}
</main></body></html>\n`;
}

export function generateCourseQcReport({
  videoFile,
  outputDir,
  timeline,
  coverDurationS = 0.5,
  fps = 30,
  spawnSyncImpl = spawnSync,
}) {
  const samples = createQcSamples({ timeline, coverDurationS, fps });
  fs.mkdirSync(outputDir, { recursive: true });
  const reportFile = path.join(outputDir, "report.json");
  const htmlFile = path.join(outputDir, "report.html");
  fs.rmSync(reportFile, { force: true });
  fs.rmSync(htmlFile, { force: true });
  for (const sample of samples) {
    const frameFile = path.join(outputDir, sample.file);
    const result = spawnSyncImpl("ffmpeg", [
      "-y", "-ss", String(sample.time_s),
      "-i", videoFile,
      "-frames:v", "1",
      "-loglevel", "error",
      frameFile,
    ], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0 || !fs.existsSync(frameFile)) {
      const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
      throw new Error(`质检抽帧失败 ${sample.label} (${sample.time_s}s)：${detail || "未生成图片"}`);
    }
  }
  const report = {
    status: "complete",
    video: videoFile,
    samples,
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8" });
  fs.writeFileSync(htmlFile, renderHtml(videoFile, samples, timeline.route === "vibe"), { encoding: "utf8" });
  return { htmlFile, reportFile, samples };
}
