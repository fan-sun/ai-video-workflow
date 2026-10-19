import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const scriptPath = path.join(process.cwd(), "build", "common", "cleanup_course_builds.mjs");
const cleanup = fs.existsSync(scriptPath)
  ? await import(pathToFileURL(scriptPath).href)
  : {};

function writeText(filePath, text = "x") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, { encoding: "utf8" });
}

function createFixture({ episode = 2, publishStatus = "已发布", withOutput = true, outputFolder = "course" } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-course-builds-"));
  const padded = String(episode).padStart(2, "0");
  const episodeDir = path.join(rootDir, "course", "episodes", `${padded}-demo`);
  const publishOutput = `pipeline/output/${outputFolder}/ep${padded}_demo/v1/final.mp4`;

  writeText(path.join(rootDir, "course", "episodes.json"), `${JSON.stringify({
    episodes: [{ ep: episode, publish_status: publishStatus }],
  }, null, 2)}\n`);
  writeText(path.join(episodeDir, "制作索引.json"), `${JSON.stringify({ publish_output: publishOutput }, null, 2)}\n`);
  if (withOutput) writeText(path.join(rootDir, publishOutput), "video");

  const courseTarget = path.join(rootDir, "pipeline", "build", `course_ep${padded}_act1_v1_review`);
  const auxiliaryTarget = path.join(rootDir, "pipeline", "build", `ep${padded}_qc`);
  writeText(path.join(courseTarget, "frame.png"));
  writeText(path.join(auxiliaryTarget, "report.json"));
  writeText(path.join(rootDir, "pipeline", "build", "universal_opening_a_final", "index.html"));
  writeText(path.join(rootDir, "pipeline", "build", "course_ep10_act1_v1_review", "index.html"));

  return { rootDir, courseTarget, auxiliaryTarget };
}

for (const outputFolder of ["teaching", "vibe"]) {
  test(`${outputFolder}输出目录仍可预览候选，且不允许执行删除`, t => {
    const fixture = createFixture({ outputFolder });
    t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));
    const frame = path.join(fixture.rootDir, `pipeline/output/${outputFolder}/ep02_demo/v1/frames/one.png`);
    writeText(frame);
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    assert.ok(plan.targets.includes(frame));
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /独立重建验证/u);
    assert.ok(fs.existsSync(frame));
  });
}

test("期数参数支持范围和逗号组合，并去重排序", () => {
  assert.equal(typeof cleanup.parseEpisodeSpec, "function");
  assert.deepEqual(cleanup.parseEpisodeSpec("1-3,5,3"), [1, 2, 3, 5]);
  assert.throws(() => cleanup.parseEpisodeSpec("3-1"), /期数范围/);
});

test("清理计划只选择指定期数的 build 直属产物", () => {
  assert.equal(typeof cleanup.createCourseBuildCleanupPlan, "function");
  const fixture = createFixture();
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({
      rootDir: fixture.rootDir,
      episodeSpec: "2",
    });
    assert.deepEqual(plan.episodes, [2]);
    assert.deepEqual(plan.targets.sort(), [fixture.auxiliaryTarget, fixture.courseTarget].sort());
    assert.ok(fs.existsSync(fixture.courseTarget), "预览计划不应删除目录");
    assert.ok(fs.existsSync(path.join(fixture.rootDir, "pipeline", "build", "universal_opening_a_final")));
    assert.ok(fs.existsSync(path.join(fixture.rootDir, "pipeline", "build", "course_ep10_act1_v1_review")));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
test("存在构建产物时拒绝清理未发布或缺少正式成片的期次", () => {
  assert.equal(typeof cleanup.createCourseBuildCleanupPlan, "function");
  const unpublished = createFixture({ episode: 3, publishStatus: "未发布" });
  const missingOutput = createFixture({ episode: 4, withOutput: false });
  try {
    assert.throws(
      () => cleanup.createCourseBuildCleanupPlan({ rootDir: unpublished.rootDir, episodeSpec: "3" }),
      /尚未标记为已发布/,
    );
    assert.throws(
      () => cleanup.createCourseBuildCleanupPlan({ rootDir: missingOutput.rootDir, episodeSpec: "4" }),
      /正式发布成片不存在/,
    );
  } finally {
    fs.rmSync(unpublished.rootDir, { recursive: true, force: true });
    fs.rmSync(missingOutput.rootDir, { recursive: true, force: true });
  }
});

test("显式执行也不能删除尚未完成重建验证的候选", () => {
  assert.equal(typeof cleanup.applyCourseBuildCleanup, "function");
  const fixture = createFixture({ episode: 5 });
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({
      rootDir: fixture.rootDir,
      episodeSpec: "5",
    });
    assert.ok(fs.existsSync(fixture.courseTarget));
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /独立重建验证/);
    assert.ok(fs.existsSync(fixture.courseTarget));
    assert.ok(fs.existsSync(fixture.auxiliaryTarget));
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /独立重建验证/, "重复调用仍不删除");
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("扩展预览区分已知引用，但未经重建验证仍不删除任何候选", () => {
  const fixture = createFixture();
  const output = path.join(fixture.rootDir, "pipeline/output/course/ep02_demo/v1");
  const audio = path.join(fixture.rootDir, "pipeline/02_audio/02-demo");
  const disposable = [
    path.join(output, "actual-mp4-frames/frame-1.png"),
    path.join(output, "check/caption-1.png"),
    path.join(output, "act1_silent.mp4"),
    path.join(audio, "act1_voxcpm_raw/seg-1.wav"),
    path.join(audio, "act1_voxcpm/trim/seg-1.wav"),
    path.join(audio, "act1_voxcpm/concat.txt")
  ];
  const retained = [
    path.join(output, "final.mp4"), path.join(output, "old-confirmed.mp4"),
    path.join(output, "cover.png"), path.join(output, "report.json"),
    path.join(output, "actual-mp4-frames/used.png"),
    path.join(audio, "act1_voxcpm/act1.wav"),
    path.join(audio, "act1_voxcpm/act1_timings.json")
  ];
  for (const file of [...disposable, ...retained]) writeText(file);
  writeText(path.join(fixture.rootDir, "course/acts/ep02_demo/index.html"),
    '<img src="../../../pipeline/output/course/ep02_demo/v1/actual-mp4-frames/used.png">');
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    for (const file of disposable) assert.ok(plan.targets.includes(file), file);
    for (const file of retained) assert.ok(!plan.targets.includes(file), file);
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /独立重建验证/);
    for (const file of disposable) assert.ok(fs.existsSync(file), file);
    for (const file of retained) assert.ok(fs.existsSync(file), file);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("预览后发布状态撤回时整次拒绝删除", () => {
  const fixture = createFixture();
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2" });
    writeText(path.join(fixture.rootDir, "course/episodes.json"), JSON.stringify({ episodes: [{ ep: 2, publish_status: "未发布" }] }));
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /尚未标记为已发布/);
    assert.ok(fs.existsSync(fixture.courseTarget));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("拒绝清理通过目录链接指向项目外的文件", () => {
  const fixture = createFixture();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-outside-"));
  try {
    writeText(path.join(outside, "frame.png"));
    fs.symlinkSync(outside, path.join(fixture.courseTarget, "frames"), "junction");
    assert.throws(() => cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2" }), /链接|越界/);
    assert.ok(fs.existsSync(path.join(outside, "frame.png")));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("保护CSS素材和HTML嵌套引号中的抽帧引用", () => {
  const fixture = createFixture();
  const output = path.join(fixture.rootDir, "pipeline/output/course/ep02_demo/v1/source-frames");
  const cssImage = path.join(output, "css-used.png");
  const inlineImage = path.join(output, "inline-used.png");
  const source = path.join(fixture.rootDir, "course/acts/ep02_demo");
  writeText(cssImage); writeText(inlineImage);
  writeText(path.join(source, "style.css"), '.scene { background: url(../../../pipeline/output/course/ep02_demo/v1/source-frames/css-used.png); }');
  writeText(path.join(source, "index.html"), '<div style="background-image:url(\'../../../pipeline/output/course/ep02_demo/v1/source-frames/inline-used.png\')"></div>');
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    assert.ok(!plan.targets.includes(cssImage), "外部CSS引用的图片不能删除");
    assert.ok(!plan.targets.includes(inlineImage), "HTML嵌套引号引用的图片不能删除");
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("拒绝build祖先目录指向项目内其他位置的链接", () => {
  const fixture = createFixture();
  try {
    const build = path.join(fixture.rootDir, "pipeline/build");
    const moved = path.join(fixture.rootDir, "relocated-build");
    fs.renameSync(build, moved);
    fs.symlinkSync(moved, build, "junction");
    assert.throws(() => cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2" }), /链接/);
    assert.ok(fs.existsSync(path.join(moved, path.basename(fixture.courseTarget), "frame.png")));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("索引登记目录输入时保留该目录及其全部文件", () => {
  const fixture = createFixture();
  try {
    writeText(path.join(fixture.rootDir, "course/episodes/02-demo/制作索引.json"), JSON.stringify({
      publish_output: "pipeline/output/course/ep02_demo/v1/final.mp4",
      acts: [{ visual_source: "pipeline/build/course_ep02_act1_v1_review" }]
    }));
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2" });
    assert.ok(!plan.targets.includes(fixture.courseTarget), "正式目录输入不能作为构建副本删除");
    writeText(path.join(fixture.rootDir, "course/episodes/02-demo/制作索引.json"), JSON.stringify({
      publish_output: "pipeline/output/course/ep02_demo/v1/final.mp4",
      acts: [{ visual_source: "pipeline/build" }]
    }));
    const parentPlan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2" });
    assert.equal(parentPlan.targets.length, 0, "目录输入的后代也应保留");
    const image = path.join(fixture.rootDir, "pipeline/output/course/ep02_demo/v1/source-frames/used.png");
    writeText(image);
    writeText(path.join(fixture.rootDir, "course/episodes/02-demo/制作索引.json"), JSON.stringify({
      publish_output: "pipeline/output/course/ep02_demo/v1/final.mp4",
      acts: [{ visual_assets: ["pipeline/output/course/ep02_demo/v1/source-frames"] }]
    }));
    const imagePlan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    assert.ok(!imagePlan.targets.includes(image), "目录素材中的独立图片候选也应保留");
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("已发布和成片存在不等于候选可重建，未验证时不得执行删除", () => {
  const fixture = createFixture();
  const input = path.join(fixture.rootDir, "pipeline/02_audio/02-demo/sfx_raw/only-copy.wav");
  writeText(input, "唯一动作音效");
  writeText(path.join(fixture.rootDir, "course/episodes/02-demo/制作索引.json"), JSON.stringify({
    publish_output: "pipeline/output/course/ep02_demo/v1/final.mp4",
    acts: [{ sfx: "pipeline/02_audio/02-demo/sfx_raw/only-copy.wav" }]
  }));
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /重建验证|暂停自动删除/);
    assert.equal(fs.readFileSync(input, { encoding: "utf8" }), "唯一动作音效");
    assert.ok(fs.existsSync(fixture.courseTarget));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("其他期次及MJS生成脚本引用的素材不会被未验证清单删除", () => {
  const fixture = createFixture();
  const input = path.join(fixture.rootDir, "pipeline/output/course/ep02_demo/v1/source-frames/reused.png");
  writeText(input, "跨期复用的素材");
  writeText(path.join(fixture.rootDir, "course/episodes/03-demo/制作索引.json"), JSON.stringify({
    acts: [{ visual_assets: ["pipeline/output/course/ep02_demo/v1/source-frames/reused.png"] }]
  }));
  writeText(path.join(fixture.rootDir, "course/episodes/03-demo/render.mjs"),
    'readFileSync("pipeline/output/course/ep02_demo/v1/source-frames/reused.png")');
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({ rootDir: fixture.rootDir, episodeSpec: "2", includeIntermediates: true });
    assert.throws(() => cleanup.applyCourseBuildCleanup(plan), /重建验证|暂停自动删除/);
    assert.equal(fs.readFileSync(input, { encoding: "utf8" }), "跨期复用的素材");
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
