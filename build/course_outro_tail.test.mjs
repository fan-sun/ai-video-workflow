import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  applyCourseOutroTail,
  assertCourseOutroTailArtifacts,
  assertCourseOutroTailTiming,
} from "./course_outro_tail.mjs";

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}

function probeDuration(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1",
    file,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}

test("片尾 timings 必须保留精确 1 秒且最后一句边界不变", () => {
  const timing = {
    total: 2.25,
    phrases: [{ id: "g01", start: 0, end: 1.25, gap: 1 }],
  };

  assert.doesNotThrow(() => assertCourseOutroTailTiming(timing));
  assert.throws(
    () => assertCourseOutroTailTiming({
      total: 1.25,
      phrases: [{ id: "g01", start: 0, end: 1.25, gap: 0 }],
    }),
    /片尾.*1 秒|gap.*1/,
  );
});

test("片尾处理追加一次静音并且重复执行不会继续增长", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-outro-tail-"));
  const audioFile = path.join(rootDir, "act4.wav");
  const timingsFile = path.join(rootDir, "act4_timings.json");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audioFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    writeJson(timingsFile, {
      out: "act4.wav",
      total: 0.4,
      count: 1,
      phrases: [{ id: "g01", text: "最后一句。", start: 0, end: 0.4, dur: 0.4, gap: 0 }],
    });

    const first = applyCourseOutroTail({ audioFile, timingsFile });
    const afterFirst = JSON.parse(fs.readFileSync(timingsFile, { encoding: "utf8" }));
    assert.equal(first.changed, true);
    assert.equal(afterFirst.phrases[0].end, 0.4);
    assert.equal(afterFirst.phrases[0].gap, 1);
    assert.equal(afterFirst.total, 1.4);
    assert.ok(Math.abs(probeDuration(audioFile) - 1.4) <= 0.01);

    const second = applyCourseOutroTail({ audioFile, timingsFile });
    assert.equal(second.changed, false);
    assert.ok(Math.abs(probeDuration(audioFile) - 1.4) <= 0.01);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("片尾门禁同时核对 WAV、timings 和第四幕 HTML 时长", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-outro-gate-"));
  const audioFile = path.join(rootDir, "act4.wav");
  const timingsFile = path.join(rootDir, "act4_timings.json");
  const visualFile = path.join(rootDir, "act4.html");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
      "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
      "-map", "[out]",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audioFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    writeJson(timingsFile, {
      total: 1.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 1 }],
    });
    fs.writeFileSync(
      visualFile,
      '<div data-duration="1.4"></div><script>const DUR=1.4;</script>',
      { encoding: "utf8" },
    );

    assert.doesNotThrow(() => assertCourseOutroTailArtifacts({
      audioFile,
      timingsFile,
      visualFile,
    }));

    fs.writeFileSync(
      visualFile,
      '<div data-duration="0.4"></div><script>const DUR=1.4;</script>',
      { encoding: "utf8" },
    );
    assert.throws(
      () => assertCourseOutroTailArtifacts({ audioFile, timingsFile, visualFile }),
      /data-duration.*timings\.total/,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("片尾最后 1 秒持续有声时拒绝通过静音门禁", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-outro-audible-"));
  const audioFile = path.join(rootDir, "act4.wav");
  const timingsFile = path.join(rootDir, "act4_timings.json");
  const visualFile = path.join(rootDir, "act4.html");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1.4",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audioFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    writeJson(timingsFile, {
      total: 1.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 1 }],
    });
    fs.writeFileSync(
      visualFile,
      '<div data-duration="1.4"></div><script>const DUR=1.4;</script>',
      { encoding: "utf8" },
    );

    assert.throws(
      () => assertCourseOutroTailArtifacts({ audioFile, timingsFile, visualFile }),
      /片尾.*静音/,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("片尾起点的毫秒量化残留不会误判为持续有声", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-outro-quantized-"));
  const audioFile = path.join(rootDir, "act4.wav");
  const timingsFile = path.join(rootDir, "act4_timings.json");
  const visualFile = path.join(rootDir, "act4.html");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4004",
      "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
      "-map", "[out]",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audioFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    writeJson(timingsFile, {
      total: 1.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 1 }],
    });
    fs.writeFileSync(
      visualFile,
      '<div data-duration="1.4"></div><script>const DUR=1.4;</script>',
      { encoding: "utf8" },
    );

    assert.doesNotThrow(() => assertCourseOutroTailArtifacts({
      audioFile,
      timingsFile,
      visualFile,
    }));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
