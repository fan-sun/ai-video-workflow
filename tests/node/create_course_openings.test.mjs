import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const scriptPath = path.join(process.cwd(), "build", "teaching", "create_course_openings.mjs");
const openings = fs.existsSync(scriptPath)
  ? await import(pathToFileURL(scriptPath).href)
  : {};

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, { encoding: "utf8" });
}

function createFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-openings-"));
  const templateRoot = path.join(rootDir, "templates", "course-opening-3x4");
  const episodeDir = path.join(rootDir, "course", "episodes", "20-demo");
  const audioPath = path.join(rootDir, "audio", "opening.wav");
  const html = `<!doctype html>
<main data-composition-id="main" data-duration="2.433333333333333">
  <h1>__OPENING_LEAD_HTML__</h1>
  <span>__OPENING_TOPIC_HTML__</span>
  <audio src="narration.wav" data-duration="2.4004791666666665"></audio>
</main>
<script>
const DUR = 2.433333333333333;
const CONFIG = { lead: "__OPENING_LEAD_JSON__", topic: "__OPENING_TOPIC_JSON__", topicStart: __OPENING_TOPIC_START__ };
</script>`;
  for (const style of ["a", "b", "c"]) writeText(path.join(templateRoot, style, "index.html"), html);
  writeText(path.join(templateRoot, "assets", "red-maple-leaf.png"), "leaf");
  writeText(path.join(templateRoot, "fonts", "NotoSansSC-400.woff2"), "font-400");
  writeText(path.join(templateRoot, "fonts", "NotoSansSC-700.woff2"), "font-700");
  writeText(audioPath, "audio");
  return { rootDir, templateRoot, episodeDir, audioPath };
}

test("生成三个可复用开场并按实际音频时长更新变量和画布", (t) => {
  assert.equal(typeof openings.createCourseOpenings, "function");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));

  const first = openings.createCourseOpenings({
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    topic: "上下文工程",
    audioPath: fixture.audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4004791666666665,
  });
  const second = openings.createCourseOpenings({
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    topic: "上下文工程",
    audioPath: fixture.audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4004791666666665,
  });

  assert.equal(first.outputRoot, path.join(fixture.episodeDir, "style-options", "opening"));
  assert.deepEqual(first.outputs, second.outputs);
  assert.equal(first.duration, 2.433333333333333);
  for (const style of ["a", "b", "c"]) {
    const outputDir = path.join(first.outputRoot, style);
    const html = fs.readFileSync(path.join(outputDir, "index.html"), { encoding: "utf8" });
    const variables = JSON.parse(fs.readFileSync(path.join(outputDir, "variables.json"), { encoding: "utf8" }));
    assert.match(html, /data-composition-id="main" data-duration="2\.433333333333333"/);
    assert.match(html, /data-duration="2\.4004791666666665"/);
    assert.match(html, /const DUR = 2\.433333333333333;/);
    assert.doesNotMatch(html, /__OPENING_/);
    assert.match(html, /今天要学习的是/);
    assert.match(html, /上下文工程/);
    assert.match(html, /topicStart: 1\.41/);
    assert.deepEqual(variables, {
      lead: "今天要学习的是",
      topic: "上下文工程",
      topicStart: 1.41,
    });
    assert.equal(fs.readFileSync(path.join(outputDir, "narration.wav"), { encoding: "utf8" }), "audio");
    assert.equal(fs.existsSync(path.join(outputDir, "assets", "red-maple-leaf.png")), true);
    assert.equal(fs.existsSync(path.join(outputDir, "fonts", "NotoSansSC-700.woff2")), true);
  }
});

test("拒绝空主题和落在音频之外的主题词起点", (t) => {
  assert.equal(typeof openings.createCourseOpenings, "function");
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));
  const base = {
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    audioPath: fixture.audioPath,
    probeDuration: () => 2.4,
  };

  assert.throws(() => openings.createCourseOpenings({ ...base, topic: " ", topicStart: 1 }), /主题词/);
  assert.throws(() => openings.createCourseOpenings({ ...base, topic: "测试", topicStart: 1.2 }), /朗读起点/);
  assert.throws(() => openings.createCourseOpenings({ ...base, topic: "测试", topicStart: 1.51 }), /朗读起点/);
  assert.throws(() => openings.createCourseOpenings({ ...base, topic: "测试", topicStart: 2.4 }), /朗读起点/);
});

test("同参重跑保留人工修改，输入变化时拒绝覆盖固定输出目录", (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));
  const options = {
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    topic: "上下文工程",
    audioPath: fixture.audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4,
  };
  const first = openings.createCourseOpenings(options);
  const customized = path.join(first.outputRoot, "b", "index.html");
  fs.appendFileSync(customized, "\n<!-- 人工调整 -->\n", { encoding: "utf8" });

  openings.createCourseOpenings(options);

  assert.match(fs.readFileSync(customized, { encoding: "utf8" }), /人工调整/);
  assert.throws(
    () => openings.createCourseOpenings({ ...options, topic: "提示词工程" }),
    /拒绝覆盖/,
  );
  assert.match(fs.readFileSync(customized, { encoding: "utf8" }), /人工调整/);
});

test("同参重跑拒绝复用缺失或内容被替换的非定制产物", (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));
  const options = {
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    topic: "上下文工程",
    audioPath: fixture.audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4,
  };
  const result = openings.createCourseOpenings(options);
  const font = path.join(result.outputRoot, "a", "fonts", "NotoSansSC-700.woff2");
  fs.rmSync(font);
  assert.throws(() => openings.createCourseOpenings(options), /产物缺失或内容不一致/);

  writeText(font, "font-700");
  fs.writeFileSync(path.join(result.outputRoot, "b", "narration.wav"), "错误音频", { encoding: "utf8" });
  assert.throws(() => openings.createCourseOpenings(options), /产物缺失或内容不一致/);
});

test("主题词中的 replacement 特殊符号按原文写入模板", (t) => {
  const fixture = createFixture();
  t.after(() => fs.rmSync(fixture.rootDir, { recursive: true, force: true }));
  const topic = "$& $` $'";

  const result = openings.createCourseOpenings({
    templateRoot: fixture.templateRoot,
    episodeDir: fixture.episodeDir,
    topic,
    audioPath: fixture.audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4,
  });

  const html = fs.readFileSync(path.join(result.outputRoot, "a", "index.html"), { encoding: "utf8" });
  const variables = JSON.parse(fs.readFileSync(path.join(result.outputRoot, "a", "variables.json"), "utf8"));
  assert.equal(variables.topic, topic);
  assert.equal(html.includes("$&amp; $` $&#39;"), true);
  assert.doesNotMatch(html, /__OPENING_/);
});

test("正式 A/B/C 模板可生成并保留安全落点窗口", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "course-openings-real-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const audioPath = path.join(directory, "opening.wav");
  writeText(audioPath, "audio");

  const result = openings.createCourseOpenings({
    templateRoot: path.join(process.cwd(), "templates", "course-opening-3x4"),
    episodeDir: path.join(directory, "20-demo"),
    topic: "驾驭工程",
    audioPath,
    topicStart: 1.41,
    probeDuration: () => 2.4004791666666665,
  });

  for (const style of ["a", "b", "c"]) {
    const html = fs.readFileSync(path.join(result.outputRoot, style, "index.html"), "utf8");
    assert.doesNotMatch(html, /__OPENING_/);
    assert.match(html, /Math\.max\(Number\(variables\.topicStart\).*1\.27\)/s);
    assert.match(html, /DUR - (?:0\.9|\.9)/);
  }
});
