import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const scriptPath = path.join(process.cwd(), "build", "cleanup_course_builds.mjs");
const cleanup = fs.existsSync(scriptPath)
  ? await import(pathToFileURL(scriptPath).href)
  : {};

function writeText(filePath, text = "x") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, { encoding: "utf8" });
}

function createFixture({ episode = 2, publishStatus = "已发布", withOutput = true } = {}) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "cleanup-course-builds-"));
  const padded = String(episode).padStart(2, "0");
  const episodeDir = path.join(rootDir, "course", "episodes", `${padded}-demo`);
  const publishOutput = `pipeline/output/course/ep${padded}_demo/v1/final.mp4`;

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

test("只有显式执行清理计划才删除已验证目标", () => {
  assert.equal(typeof cleanup.applyCourseBuildCleanup, "function");
  const fixture = createFixture({ episode: 5 });
  try {
    const plan = cleanup.createCourseBuildCleanupPlan({
      rootDir: fixture.rootDir,
      episodeSpec: "5",
    });
    assert.ok(fs.existsSync(fixture.courseTarget));
    cleanup.applyCourseBuildCleanup(plan);
    assert.equal(fs.existsSync(fixture.courseTarget), false);
    assert.equal(fs.existsSync(fixture.auxiliaryTarget), false);
    assert.equal(cleanup.applyCourseBuildCleanup(plan).deletedCount, 0, "重复执行应保持幂等");
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});
