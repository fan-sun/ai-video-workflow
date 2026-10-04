#!/usr/bin/env node
// 用途：把 四幕 actN_timings.json 汇总为整期时间表。
// 运行：node build/course_timeline_summary.mjs --out <整期时间表.json> <四个 timings 路径>。
// 依赖：Node.js 标准库；重复运行会同步覆盖同一份派生文件。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ACT_COUNT = 4;

function secondsFromMilliseconds(milliseconds) {
  return milliseconds / 1000;
}

function formatTime(milliseconds) {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor((milliseconds % 60000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function buildTimelineSummary(entries) {
  if (!Array.isArray(entries) || entries.length !== ACT_COUNT) {
    throw new Error(`必须提供 ${ACT_COUNT} 幕 timings`);
  }

  let elapsedMilliseconds = 0;
  const acts = entries.map((entry, index) => {
    if (typeof entry?.total !== "number" || !Number.isFinite(entry.total) || entry.total <= 0) {
      throw new Error(`第 ${index + 1} 幕 timings.total 必须是正数`);
    }

    const durationMilliseconds = Math.round(entry.total * 1000);
    const startMilliseconds = elapsedMilliseconds;
    elapsedMilliseconds += durationMilliseconds;

    return {
      act: index + 1,
      source: entry.source,
      duration_s: secondsFromMilliseconds(durationMilliseconds),
      start_s: secondsFromMilliseconds(startMilliseconds),
      end_s: secondsFromMilliseconds(elapsedMilliseconds),
      start_time: formatTime(startMilliseconds),
      end_time: formatTime(elapsedMilliseconds),
    };
  });

  return {
    sources: entries.map(({ source }) => source),
    acts,
    total_s: secondsFromMilliseconds(elapsedMilliseconds),
    total_time: formatTime(elapsedMilliseconds),
  };
}

export function generateTimelineSummary(sourcePaths, outputPath) {
  const entries = sourcePaths.map((source) => {
    let timing;
    try {
      timing = JSON.parse(fs.readFileSync(source, { encoding: "utf8" }));
    } catch (error) {
      throw new Error(`无法读取 timings：${source}（${error.message}）`);
    }
    return { source: source.replaceAll("\\", "/"), total: timing.total };
  });

  const summary = buildTimelineSummary(entries);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, { encoding: "utf8" });
  return summary;
}

function usage() {
  return `用法:
  node build/course_timeline_summary.mjs --out <整期时间表.json> <act1_timings.json> <act2_timings.json> <act3_timings.json> <act4_timings.json>`;
}

function parseArgs(argv) {
  const outIndex = argv.indexOf("--out");
  if (outIndex < 0 || !argv[outIndex + 1]) throw new Error("必须提供 --out <整期时间表.json>");

  const outputPath = argv[outIndex + 1];
  const sourcePaths = argv.filter((_, index) => index !== outIndex && index !== outIndex + 1);
  if (sourcePaths.length !== ACT_COUNT) throw new Error(`必须提供 ${ACT_COUNT} 幕 timings`);
  return { outputPath, sourcePaths };
}

function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const { outputPath, sourcePaths } = parseArgs(argv);
  const summary = generateTimelineSummary(sourcePaths, outputPath);
  console.log(`已生成 ${outputPath}（总时长 ${summary.total_time}）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 1;
  }
}
