import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createQcSamples,
  generateCourseQcReport,
} from "./course_qc_report.mjs";

const TIMELINE = {
  acts: [
    { act: 1, start_s: 0, end_s: 10 },
    { act: 2, start_s: 10, end_s: 20 },
    { act: 3, start_s: 20, end_s: 30 },
    { act: 4, start_s: 30, end_s: 40 },
  ],
  total_s: 40,
};

test("六幕质检覆盖每幕正文和五处交界", () => {
  const timeline = { acts: Array.from({ length: 6 }, (_, i) => ({ act: i + 1, start_s: i * 10, end_s: (i + 1) * 10 })), total_s: 60 };
  const samples = createQcSamples({ timeline });
  assert.equal(samples.length, 21);
  assert.equal(samples.filter(sample => sample.group === "幕中代表帧").length, 6);
  assert.equal(samples.filter(sample => sample.group === "幕间交界").length, 10);
  assert.ok(samples.some(sample => sample.stem === "transition-5-6-after"));
});

test("质检采样覆盖封面边界、四幕代表帧、幕间交界和片尾 1 秒", () => {
  const samples = createQcSamples({
    timeline: TIMELINE,
    coverDurationS: 0.5,
    fps: 30,
  });

  assert.equal(samples.length, 15);
  assert.deepEqual(samples.slice(0, 3).map((sample) => sample.time_s), [0, 0.466, 0.533]);
  assert.equal(samples.filter((sample) => sample.group === "幕中代表帧").length, 4);
  assert.equal(samples.filter((sample) => sample.group === "幕间交界").length, 6);
  assert.deepEqual(
    samples.filter((sample) => sample.group === "片尾收尾").map((sample) => sample.time_s),
    [39.2, 39.9],
  );
});

test("生成完全本地、UTF-8、可直接打开的质检 HTML", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-qc-"));
  const calls = [];
  try {
    const result = generateCourseQcReport({
      videoFile: "video.mp4",
      outputDir,
      timeline: TIMELINE,
      coverDurationS: 0.5,
      fps: 30,
      spawnSyncImpl(command, args) {
        calls.push({ command, args });
        fs.writeFileSync(args.at(-1), "png");
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.equal(calls.length, 15);
    assert.ok(calls.every((call) => call.command === "ffmpeg"));
    const html = fs.readFileSync(result.htmlFile, { encoding: "utf8" });
    const report = JSON.parse(fs.readFileSync(result.reportFile, { encoding: "utf8" }));
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /封面边界/);
    assert.match(html, /幕间交界/);
    assert.match(html, /片尾收尾/);
    assert.doesNotMatch(html, /https?:\/\//);
    assert.equal(report.samples.length, 15);
    assert.ok(report.samples.every((sample) => fs.existsSync(path.join(outputDir, sample.file))));
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});

test("任一抽帧失败时不生成误导性的质检报告", () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-qc-fail-"));
  let calls = 0;
  try {
    fs.writeFileSync(path.join(outputDir, "report.html"), "旧成功报告", { encoding: "utf8" });
    fs.writeFileSync(path.join(outputDir, "report.json"), '{"status":"complete"}\n', {
      encoding: "utf8",
    });
    assert.throws(
      () => generateCourseQcReport({
        videoFile: "video.mp4",
        outputDir,
        timeline: TIMELINE,
        coverDurationS: 0.5,
        fps: 30,
        spawnSyncImpl() {
          calls += 1;
          return { status: calls === 2 ? 1 : 0, stdout: "", stderr: "extract failed" };
        },
      }),
      /抽帧失败/,
    );
    assert.equal(fs.existsSync(path.join(outputDir, "report.html")), false);
    assert.equal(fs.existsSync(path.join(outputDir, "report.json")), false);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
