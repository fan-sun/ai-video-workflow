import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { checkCourseRelease } from "./check_course_release.mjs";
import * as releaseChecker from "./check_course_release.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8" });
}

function createFixture({ publishCopy = null, publishCopyText = "", realMedia = false } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-release-"));
  const outputDir = path.join(rootDir, "pipeline/output/course/ep02_loop-engineering/v3");
  const episodeDir = path.join(rootDir, "course/episodes/02-loop-engineering");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(episodeDir, { recursive: true });
  const videoFile = path.join(outputDir, "course_ep02_loop-engineering_v3_publish.mp4");
  const reviewFile = path.join(outputDir, "course_ep02_loop-engineering_v3.mp4");
  const coverFile = path.join(episodeDir, "cover.png");
  if (realMedia) {
    const videoResult = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "color=c=red:s=32x32:r=30:d=0.5",
      "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=30:d=9.5",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=10",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", "-map", "2:a:0",
      "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-ar", "48000", "-ac", "1", "-shortest", videoFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    const coverResult = spawnSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "color=c=red:s=32x32",
      "-frames:v", "1", coverFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(videoResult.status, 0, videoResult.stderr);
    assert.equal(coverResult.status, 0, coverResult.stderr);
    fs.copyFileSync(videoFile, reviewFile);
  } else {
    fs.writeFileSync(videoFile, "video");
    fs.writeFileSync(reviewFile, "review");
    fs.writeFileSync(coverFile, "png");
  }

  const timelinePath = path.join(episodeDir, "整期时间表.json");
  writeJson(timelinePath, {
    acts: [
      { act: 1, start_s: 0, end_s: 2.4 },
      { act: 2, start_s: 2.4, end_s: 5.1 },
      { act: 3, start_s: 5.1, end_s: 7.6 },
      { act: 4, start_s: 7.6, end_s: 10 },
    ],
    total_s: 10,
  });
  const act4Timings = "pipeline/02_audio/02-loop-engineering/course_ep02_act4_voxcpm/act4_timings.json";
  writeJson(path.join(rootDir, act4Timings), {
    total: 2.4,
    phrases: [{ id: "g01", start: 0, end: 1.4, gap: 1 }],
  });

  const publishOutput = "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3_publish.mp4";
  if (publishCopy) {
    const publishCopyFile = path.join(rootDir, publishCopy);
    fs.mkdirSync(path.dirname(publishCopyFile), { recursive: true });
    fs.writeFileSync(publishCopyFile, publishCopyText, { encoding: "utf8" });
  }
  const indexPath = path.join(episodeDir, "制作索引.json");
  writeJson(indexPath, {
    episode: "ep02",
    topic: "Loop Engineering（循环工程）",
    slug: "loop-engineering",
    current_version: "v3",
    chapter_titles: ["基础概念", "循环闭合", "最小示例", "适用边界"],
    timeline_summary: "course/episodes/02-loop-engineering/整期时间表.json",
    review_output: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.mp4",
    publish_output: publishOutput,
    cover_output: "course/episodes/02-loop-engineering/cover.png",
    cover_embed: { duration_s: 0.5, ssim_threshold: 0.98 },
    acts: [1, 2, 3, 4].map((act) => ({
      act,
      timings: act === 4 ? act4Timings : `audio/act${act}_timings.json`,
    })),
    publish_copy: publishCopy,
    publish_spec: {
      width: 32,
      height: 32,
      fps: 30,
      video_codec: "h264",
      video_profiles: ["Main", "High"],
      pixel_format: "yuv420p",
      audio_codec: "aac",
      audio_sample_rate: 48000,
      audio_channels: 1,
      duration_s: 10,
      duration_tolerance_s: 0.1,
    },
  });
  writeJson(path.join(rootDir, "course/episodes.json"), {
    episodes: [{
      ep: 2,
      topic: "Loop Engineering（循环工程）",
      slug: "loop-engineering",
      version: "v3",
      duration_s: 10,
      output: publishOutput,
    }],
  });
  return { rootDir, indexPath };
}

const validVideoSummary = "循环工程是一种把目标、执行、反馈和停止条件组成可验证闭环的方法。它强调依据检查结果持续修正，同时保留人工边界，避免模型陷入没有标准和终点的无限重复。";

test("六幕发布包核对全部章节，并在第六幕检查片尾收尾", () => {
  const copyPath = "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt";
  const titles = ["选题", "写稿", "切分", "配音", "画面", "发布"];
  const labels = ["一", "二", "三", "四", "五", "六"];
  const fixture = createFixture({ publishCopy: copyPath, publishCopyText: `【标题】\n示例\n【发布文案】\n制作流程\n【标签】\n#AI #AI基础 #深度讲解\n【视频总结】\n${validVideoSummary}\n【视频章节】\n` + titles.map((title, i) => `00:${String(i * 2).padStart(2, "0")}–00:${String((i + 1) * 2).padStart(2, "0")}　第${labels[i]}幕 · ${title}`).join("\n") });
  try {
    const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
    index.production_contract = "current";
    index.chapter_titles = titles;
    index.acts = titles.map((_, i) => ({ act: i + 1, timings: `audio/act${i + 1}_timings.json` }));
    index.publish_spec.duration_s = 12;
    writeJson(fixture.indexPath, index);
    const timeline = { acts: titles.map((_, i) => ({ act: i + 1, start_s: i * 2, end_s: (i + 1) * 2, duration_s: 2 })), total_s: 12 };
    writeJson(path.join(fixture.rootDir, index.timeline_summary), timeline);
    const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
    ledger.episodes[0].duration_s = 12;
    writeJson(ledgerPath, ledger);
    writeJson(path.join(fixture.rootDir, index.acts[5].timings), { total: 2, phrases: [{ id: "g01", start: 0, end: 1, gap: 1 }] });
    assert.equal(checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }).ok, true);
    fs.writeFileSync(path.join(fixture.rootDir, copyPath), fs.readFileSync(path.join(fixture.rootDir, copyPath), { encoding: "utf8" }).replace("第六幕 · 发布", "第六幕 · 错误"), { encoding: "utf8" });
    assert.throws(() => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }), /第 6 幕章节/);
  } finally { fs.rmSync(fixture.rootDir, { recursive: true, force: true }); }
});

function publishCopyWithChapters(
  chapter2 = "循环闭合",
  summary = validVideoSummary,
  publishText = "示例正文",
) {
  return `【标题】
示例标题

【发布文案】
${publishText}

【视频总结】
${summary}

【视频章节】

00:00–00:02　第一幕 · 基础概念
00:02–00:05　第二幕 · ${chapter2}
00:05–00:08　第三幕 · 最小示例
00:08–00:10　第四幕 · 适用边界

【标签】
#示例
`;
}

function publishCopyWithoutSummary() {
  return publishCopyWithChapters().replace(
    /\n【视频总结】\n[\s\S]*?\n【视频章节】/,
    "\n【视频章节】",
  );
}

function publishCopyWithModernOrder(tags = "#AI #AI基础 #深度讲解 #示例") {
  return `【标题】
示例标题

【发布文案】
示例正文

【标签】
${tags}

【视频总结】
${validVideoSummary}

【视频章节】

00:00–00:02　第一幕 · 基础概念
00:02–00:05　第二幕 · 循环闭合
00:05–00:08　第三幕 · 最小示例
00:08–00:10　第四幕 · 适用边界
`;
}

function setFixtureEpisode(fixture, episodeNumber) {
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  index.episode = `ep${String(episodeNumber).padStart(2, "0")}`;
  writeJson(fixture.indexPath, index);
  const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].ep = episodeNumber;
  writeJson(ledgerPath, ledger);
}

test("发布文案路径为空时拒绝发布包", () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /publish_copy.*不能为空/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布文案不在当前版本目录时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v2/course_ep02_loop-engineering_v2.txt",
    publishCopyText: "历史版本文案",
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /publish_copy.*当前版本 v3/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("高清发布版路径不属于当前版本时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  index.publish_output = "pipeline/output/course/ep02_loop-engineering/v2/course_ep02_loop-engineering_v2_publish.mp4";
  writeJson(fixture.indexPath, index);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /publish_output.*当前版本 v3/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布文案缺少视频章节时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: `【标题】\n示例标题\n\n【发布文案】\n示例正文\n\n【视频总结】\n${validVideoSummary}\n\n【标签】\n#示例\n`,
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /【视频章节】/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布文案缺少视频总结时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithoutSummary(),
  });
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  index.episode = "ep04";
  writeJson(fixture.indexPath, index);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /【视频总结】/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 1 至 3 期历史发布文案允许没有视频总结", () => {
  for (const episodeNumber of [1, 2, 3]) {
    const fixture = createFixture({
      publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
      publishCopyText: publishCopyWithoutSummary(),
    });
    const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
    index.episode = `ep${String(episodeNumber).padStart(2, "0")}`;
    writeJson(fixture.indexPath, index);
    const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
    ledger.episodes[0].ep = episodeNumber;
    writeJson(ledgerPath, ledger);
    try {
      assert.doesNotThrow(
        () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      );
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  }
});

test("视频总结少于 50 个非空白字符时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters("循环闭合", "内容太短"),
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /视频总结.*50.*200/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("视频总结超过 200 个非空白字符时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters("循环闭合", "长".repeat(201)),
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /视频总结.*50.*200/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("视频总结与发布文案相同时拒绝发布包", () => {
  const duplicate = "循环工程是一种把目标、执行、反馈和停止条件组成可验证闭环的方法。它强调依据检查结果持续修正，同时保留人工边界，避免模型陷入没有标准和终点的无限重复。";
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters("循环闭合", duplicate, duplicate),
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /视频总结.*发布文案.*不能相同/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("视频总结不在发布文案与视频章节之间时拒绝发布包", () => {
  const summaryBlock = `【视频总结】\n${validVideoSummary}\n\n`;
  const misplaced = publishCopyWithChapters()
    .replace(summaryBlock, "")
    .replace("【标签】", `${summaryBlock}【标签】`);
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: misplaced,
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /区块顺序.*【发布文案】.*【视频总结】.*【视频章节】/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 9 期起标签必须位于视频总结前", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  setFixtureEpisode(fixture, 9);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /区块顺序.*【标签】.*【视频总结】/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 9 期起接受标签在视频总结前的新顺序", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithModernOrder(),
  });
  setFixtureEpisode(fixture, 9);
  try {
    assert.doesNotThrow(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 9 期起缺少任一必需标签时拒绝发布包", () => {
  for (const tags of [
    "#AI基础 #深度讲解 #示例",
    "#AI #深度讲解 #示例",
    "#AI #AI基础 #示例",
  ]) {
    const fixture = createFixture({
      publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
      publishCopyText: publishCopyWithModernOrder(tags),
    });
    setFixtureEpisode(fixture, 9);
    try {
      assert.throws(
        () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
        /标签.*#AI.*#AI基础.*#深度讲解/,
      );
    } finally {
      fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    }
  }
});

test("视频章节与制作索引或整期时间表不一致时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters("错误标题"),
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /第 2 幕.*章节.*不一致/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 23 期起发布包拒绝带首尾空白的章节标题", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithModernOrder().replace("第二幕 · 循环闭合", "第二幕 ·  循环闭合"),
  });
  try {
    setFixtureEpisode(fixture, 23);
    const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
    index.chapter_titles[1] = " 循环闭合";
    writeJson(fixture.indexPath, index);
    assert.throws(() => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /章节标题.*首尾空白/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布包记录的封面文件不存在时拒绝", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  fs.rmSync(path.join(fixture.rootDir, "course/episodes/02-loop-engineering/cover.png"));
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /cover_output 文件不存在/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("制作索引未声明首帧封面时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  delete index.cover_embed;
  writeJson(fixture.indexPath, index);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /cover_embed.*0.5/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("课程台账版本与制作索引不一致时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].version = "v2";
  writeJson(ledgerPath, ledger);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /episodes.json.*version.*v3/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("课程台账期号或主题与制作索引不一致时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].ep = 3;
  ledger.episodes[0].topic = "错误主题";
  writeJson(ledgerPath, ledger);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /episodes.json.*ep.*ep02|episodes.json.*topic/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("课程台账输出路径与高清发布版不一致时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].output = "pipeline/output/course/ep02_loop-engineering/v2/old.mp4";
  writeJson(ledgerPath, ledger);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /episodes.json.*output.*publish_output/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("课程台账时长与发布规格不一致时拒绝发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const ledgerPath = path.join(fixture.rootDir, "course/episodes.json");
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].duration_s = 9.5;
  writeJson(ledgerPath, ledger);
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /episodes.json.*duration_s.*10/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("整期时间表与发布文件的正常编码尾差不阻塞发布包", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const timelinePath = path.join(fixture.rootDir, "course/episodes/02-loop-engineering/整期时间表.json");
  const timeline = JSON.parse(fs.readFileSync(timelinePath, { encoding: "utf8" }));
  timeline.total_s = 9.98;
  writeJson(timelinePath, timeline);
  try {
    assert.doesNotThrow(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布包在媒体检查前拒绝缺少 1 秒收尾的第四幕 timings", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  setFixtureEpisode(fixture, 6);
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  const timingsPath = path.join(fixture.rootDir, index.acts[3].timings);
  writeJson(timingsPath, {
    total: 1.4,
    phrases: [{ id: "g01", start: 0, end: 1.4, gap: 0 }],
  });
  try {
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
      /片尾.*1 秒|gap.*1/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 2 至 5 期历史发布包不追溯要求片尾 1 秒契约", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  setFixtureEpisode(fixture, 5);
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  writeJson(path.join(fixture.rootDir, index.acts[3].timings), {
    total: 2.4,
    phrases: [{ id: "g01", start: 0, end: 2.4, gap: 0 }],
  });
  try {
    assert.doesNotThrow(
      () => checkCourseRelease(fixture.indexPath, { rootDir: fixture.rootDir }),
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("第 6 期起发布包会拒绝最终音轨最后一秒持续有声", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
    realMedia: true,
  });
  setFixtureEpisode(fixture, 6);
  try {
    assert.equal(typeof releaseChecker.verifyEncodedCourseOutroTail, "function");
    assert.throws(
      () => checkCourseRelease(fixture.indexPath, {
        rootDir: fixture.rootDir,
        outroTailVerifier: releaseChecker.verifyEncodedCourseOutroTail,
      }),
      /片尾.*静音/,
    );
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("最终音轨静音检查按实际媒体结尾定位而不是按规格时长截断", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-release-tail-drift-"));
  const audioFile = path.join(rootDir, "tail-drift.wav");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-t", "1", "-i", "sine=frequency=440:sample_rate=48000",
      "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-f", "lavfi", "-t", "0.08", "-i", "sine=frequency=440:sample_rate=48000",
      "-filter_complex", "[0:a][1:a][2:a]concat=n=3:v=0:a=1[out]",
      "-map", "[out]",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audioFile,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);

    assert.throws(
      () => releaseChecker.verifyEncodedCourseOutroTail({
        videoFile: audioFile,
        startS: 1,
      }),
      /片尾.*静音/,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("发布包检查调用首帧封面比对器", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  let callCount = 0;
  try {
    checkCourseRelease(fixture.indexPath, {
      rootDir: fixture.rootDir,
      coverFrameVerifier({ videoFile, coverFile, threshold }) {
        callCount += 1;
        assert.match(videoFile, /course_ep02_loop-engineering_v3_publish\.mp4$/);
        assert.match(coverFile, /cover\.png$/);
        assert.equal(threshold, 0.98);
      },
    });
    assert.equal(callCount, 1);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("发布包检查调用实际媒体与封面时间窗验收器", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  let mediaCalls = 0;
  let coverWindowCalls = 0;
  try {
    checkCourseRelease(fixture.indexPath, {
      rootDir: fixture.rootDir,
      mediaVerifier({ publishFile, reviewFile, spec }) {
        mediaCalls += 1;
        assert.match(publishFile, /_v3_publish\.mp4$/);
        assert.match(reviewFile, /_v3\.mp4$/);
        assert.equal(spec.width, 32);
      },
      coverWindowVerifier({ durationS, fps, threshold }) {
        coverWindowCalls += 1;
        assert.equal(durationS, 0.5);
        assert.equal(fps, 30);
        assert.equal(threshold, 0.98);
      },
    });
    assert.equal(mediaCalls, 1);
    assert.equal(coverWindowCalls, 1);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("首帧封面相似度默认门槛允许正常 H.264 编码损失", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
  });
  const index = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  delete index.cover_embed.ssim_threshold;
  writeJson(fixture.indexPath, index);
  let actualThreshold;
  try {
    checkCourseRelease(fixture.indexPath, {
      rootDir: fixture.rootDir,
      coverFrameVerifier({ threshold }) {
        actualThreshold = threshold;
      },
    });
    assert.equal(actualThreshold, 0.97);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("首帧与正式封面相似度不足时拒绝发布包", () => {
  assert.throws(
    () => releaseChecker.verifyEmbeddedCoverFrame({
      videoFile: "video.mp4",
      coverFile: "cover.png",
      threshold: 0.98,
      spawnSyncImpl: () => ({
        status: 0,
        stdout: "",
        stderr: "SSIM Y:0.91 U:0.92 V:0.93 All:0.915000 (10.0)",
      }),
    }),
    /首帧.*正式封面.*0\.915.*0\.98/,
  );
});

test("命令行检查完整发布包后返回成功", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
    realMedia: true,
  });
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check_course_release.mjs");
  try {
    const result = spawnSync(process.execPath, [scriptPath, fixture.indexPath], {
      cwd: fixture.rootDir,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /发布包检查通过.*ep02.*v3/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("命令行检查发现视频首帧与正式封面不一致时失败", () => {
  const fixture = createFixture({
    publishCopy: "pipeline/output/course/ep02_loop-engineering/v3/course_ep02_loop-engineering_v3.txt",
    publishCopyText: publishCopyWithChapters(),
    realMedia: true,
  });
  const coverFile = path.join(fixture.rootDir, "course/episodes/02-loop-engineering/cover.png");
  const coverResult = spawnSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=blue:s=32x32",
    "-frames:v", "1", coverFile,
    "-loglevel", "error",
  ], { encoding: "utf8" });
  assert.equal(coverResult.status, 0, coverResult.stderr);
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "check_course_release.mjs");
  try {
    const result = spawnSync(process.execPath, [scriptPath, fixture.indexPath], {
      cwd: fixture.rootDir,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /视频 0–0\.5 秒未稳定显示正式封面/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
