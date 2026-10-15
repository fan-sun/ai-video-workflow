import fs from "node:fs";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const moduleUrl = new URL("../../build/common/init_course_episode.mjs", import.meta.url);

test("新期次专用脚本放在 build 根目录时，初始化在写目录前拒绝", async (t) => {
  const { initCourseEpisode } = await import(moduleUrl.href);
  const root = mkdtempSync(path.join(os.tmpdir(), "course-script-location-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "build"));
  for (const name of ["course_ep24_visuals.py", "ep25_fix.mjs"]) {
    const file = path.join(root, "build", name);
    writeFileSync(file, "", { encoding: "utf8" });
    assert.throws(() => initCourseEpisode(root, "25-new-topic"), /本期专用脚本.*course\/episodes/u);
    assert.equal(existsSync(path.join(root, "course")), false);
    rmSync(file);
  }
});

test("通用工具和本期期目录内的生成器不被误拦", async (t) => {
  const { initCourseEpisode } = await import(moduleUrl.href);
  const root = mkdtempSync(path.join(os.tmpdir(), "course-script-location-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "build"));
  for (const name of ["course_video.mjs", "history_notes.py", "ep24-frame.png"]) {
    writeFileSync(path.join(root, "build", name), "", { encoding: "utf8" });
  }
  const paths = initCourseEpisode(root, "24-agent");
  writeFileSync(path.join(paths.courseEpisodeDir, "generate_visuals.py"), "", { encoding: "utf8" });
  assert.deepEqual(initCourseEpisode(root, "24-agent"), paths);
});

test("初始化课程期目录并可安全重复执行", async (t) => {
  assert.equal(existsSync(moduleUrl), true, "课程期目录初始化命令尚未实现");
  const { initCourseEpisode } = await import(moduleUrl.href);
  const root = mkdtempSync(path.join(os.tmpdir(), "course-episode-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const expected = {
    episode: "07-new-topic",
    courseEpisodeDir: path.join(root, "course", "episodes", "07-new-topic"),
    scriptDir: path.join(root, "pipeline", "01_script", "07-new-topic"),
    audioDir: path.join(root, "pipeline", "02_audio", "07-new-topic"),
  };

  assert.deepEqual(initCourseEpisode(root, "07-new-topic"), expected);
  for (const dir of Object.values(expected).slice(1)) assert.equal(existsSync(dir), true);

  const sentinel = path.join(expected.scriptDir, "保留.txt");
  writeFileSync(sentinel, "不要覆盖", "utf8");
  assert.deepEqual(initCourseEpisode(root, "07-new-topic"), expected);
  assert.equal(existsSync(sentinel), true);
});

test("拒绝不符合 NN-slug 约定的目录名", async () => {
  assert.equal(existsSync(moduleUrl), true, "课程期目录初始化命令尚未实现");
  const { initCourseEpisode } = await import(moduleUrl.href);

  assert.throws(
    () => initCourseEpisode("project-root", "../07-new-topic"),
    /期目录名必须符合 NN-slug/,
  );
});


test("新期次创建真实台账和空索引，重复执行保留用户内容", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "course-init-standalone-"));
  try {
    const { initCourseEpisode } = await import(moduleUrl.href);
    initCourseEpisode(root, "01-context-window", { topic: "上下文窗口" });
    const ledgerFile = path.join(root, "course/episodes.json");
    const indexFile = path.join(root, "course/episodes/01-context-window/制作索引.json");
    const ledger = JSON.parse(fs.readFileSync(ledgerFile, "utf8"));
    assert.equal(ledger.episodes[0].topic, "上下文窗口");
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    assert.equal(index.acts.length, 4);
    assert.equal(index.acts[0].audio, null);
    index.notes = "用户填写的内容";
    fs.writeFileSync(indexFile, JSON.stringify(index), "utf8");
    initCourseEpisode(root, "01-context-window", { topic: "上下文窗口" });
    assert.equal(JSON.parse(fs.readFileSync(indexFile, "utf8")).notes, "用户填写的内容");
    assert.equal(JSON.parse(fs.readFileSync(ledgerFile, "utf8")).episodes.length, 1);
    assert.throws(() => initCourseEpisode(root, "01-another", { topic: "其他" }), /期号/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("课程第一期也禁止 build 根目录的本期脚本", async (t) => {
  const { initCourseEpisode } = await import(moduleUrl.href);
  const root = mkdtempSync(path.join(os.tmpdir(), "course-first-policy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "build"));
  writeFileSync(path.join(root, "build/course_ep01_visuals.py"), "", "utf8");
  assert.throws(() => initCourseEpisode(root, "01-demo"), /本期专用脚本/);
});

test("已有索引却缺少台账时拒绝按首次运行创建空台账", async (t) => {
  const { initCourseEpisode } = await import(moduleUrl.href);
  const root = mkdtempSync(path.join(os.tmpdir(), "course-missing-ledger-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "course/episodes/01-old"), { recursive: true });
  writeFileSync(path.join(root, "course/episodes/01-old/制作索引.json"), "{}", "utf8");
  assert.throws(() => initCourseEpisode(root, "02-new"), /恢复台账/);
  assert.equal(existsSync(path.join(root, "course/episodes.json")), false);
});
