import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildTimelineSummary,
  generateTimelineSummary,
} from "../../build/teaching/course_timeline_summary.mjs";

const SOURCES = [
  { source: "audio/act1_timings.json", total: 49.962 },
  { source: "audio/act2_timings.json", total: 71.53 },
  { source: "audio/act3_timings.json", total: 72.018 },
  { source: "audio/act4_timings.json", total: 87.937 },
];

test("四幕 timings 累计为秒数和分钟时间码", () => {
  assert.deepEqual(buildTimelineSummary(SOURCES), {
    sources: SOURCES.map(({ source }) => source),
    acts: [
      {
        act: 1,
        source: "audio/act1_timings.json",
        duration_s: 49.962,
        start_s: 0,
        end_s: 49.962,
        start_time: "00:00.000",
        end_time: "00:49.962",
      },
      {
        act: 2,
        source: "audio/act2_timings.json",
        duration_s: 71.53,
        start_s: 49.962,
        end_s: 121.492,
        start_time: "00:49.962",
        end_time: "02:01.492",
      },
      {
        act: 3,
        source: "audio/act3_timings.json",
        duration_s: 72.018,
        start_s: 121.492,
        end_s: 193.51,
        start_time: "02:01.492",
        end_time: "03:13.510",
      },
      {
        act: 4,
        source: "audio/act4_timings.json",
        duration_s: 87.937,
        start_s: 193.51,
        end_s: 281.447,
        start_time: "03:13.510",
        end_time: "04:41.447",
      },
    ],
    total_s: 281.447,
    total_time: "04:41.447",
  });
});

test("只接受四幕且拒绝无效 total", () => {
  assert.throws(() => buildTimelineSummary(SOURCES.slice(0, 3)), /必须提供 4 幕/);
  assert.throws(
    () => buildTimelineSummary(SOURCES.map((item, index) => (
      index === 2 ? { ...item, total: "72.018" } : item
    ))),
    /第 3 幕.*total/,
  );
});

test("从四个 timings JSON 幂等写出 UTF-8 时间表", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-timeline-"));
  try {
    const sourcePaths = SOURCES.map((item, index) => {
      const file = path.join(tempDir, `act${index + 1}_timings.json`);
      fs.writeFileSync(file, `${JSON.stringify({ total: item.total })}\n`, { encoding: "utf8" });
      return file;
    });
    const out = path.join(tempDir, "episode", "整期时间表.json");

    const first = generateTimelineSummary(sourcePaths, out);
    const firstText = fs.readFileSync(out, { encoding: "utf8" });
    const second = generateTimelineSummary(sourcePaths, out);
    const secondText = fs.readFileSync(out, { encoding: "utf8" });

    assert.deepEqual(second, first);
    assert.equal(secondText, firstText);
    assert.equal(JSON.parse(secondText).total_time, "04:41.447");
    assert.ok(secondText.endsWith("\n"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
