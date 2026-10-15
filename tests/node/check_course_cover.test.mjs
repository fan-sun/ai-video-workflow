import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildAuditHtml,
  detectCoverLayoutIssues,
  parseAuditPayload,
  resolveChromeExecutable,
} from "../../build/common/check_course_cover.mjs";
import * as coverChecker from "../../build/common/check_course_cover.mjs";


test("封面门禁会拦截文字元素侵入相邻语义卡片", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 180, y: 500, width: 720, height: 360 },
    elements: [
      { id: "chip-1", text: "文字", x: 230, y: 900, width: 198, height: 122 },
      { id: "arrow-1", text: "→", x: 424, y: 940, width: 44, height: 44 },
      { id: "chip-2", text: "分词器", x: 446, y: 900, width: 228, height: 122 },
    ],
  });

  assert.deepEqual(report.collisions, [
    { first: "arrow-1", second: "chip-1" },
    { first: "arrow-1", second: "chip-2" },
  ]);
});

test("封面门禁会拦截主题卡实体背景遮挡外部文字", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 140, y: 580, width: 800, height: 330 },
    elements: [
      { id: "drawer", text: "稳定偏好", x: 100, y: 525, width: 255, height: 112 },
      {
        id: "topic-title",
        text: "AI 记忆",
        x: 145,
        y: 652,
        width: 789,
        height: 145,
        insideTopic: true,
      },
    ],
  });

  assert.deepEqual(report.collisions, [
    { first: "drawer", second: "cover-topic" },
  ]);
});

test("封面门禁会拦截无直接文本的语义卡片遮挡外部文字", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 390, y: 820, width: 300, height: 220 },
    boxes: [
      { id: "memory-card", x: 100, y: 500, width: 300, height: 200 },
    ],
    elements: [
      {
        id: "card-title",
        text: "长期记忆",
        x: 140,
        y: 540,
        width: 180,
        height: 50,
        boxAncestors: ["memory-card"],
      },
      { id: "external-note", text: "外部说明", x: 350, y: 620, width: 170, height: 50 },
    ],
  });

  assert.deepEqual(report.collisions, [
    { first: "external-note", second: "memory-card" },
  ]);
});

test("语义卡片不会与自身直接承载的文字发生碰撞", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 390, y: 820, width: 300, height: 220 },
    boxes: [
      { id: "memory-card", x: 100, y: 500, width: 300, height: 200 },
    ],
    elements: [
      {
        id: "memory-card-text",
        text: "短期记忆",
        x: 100,
        y: 500,
        width: 300,
        height: 200,
        boxId: "memory-card",
      },
    ],
  });

  assert.deepEqual(report.collisions, []);
});

test("封面门禁会拦截语义卡片之间的重叠", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 390, y: 820, width: 300, height: 220 },
    boxes: [
      { id: "card-1", x: 100, y: 500, width: 300, height: 200 },
      { id: "card-2", x: 350, y: 620, width: 300, height: 200 },
    ],
    elements: [],
  });

  assert.deepEqual(report.collisions, [{ first: "card-1", second: "card-2" }]);
});

test("封面门禁会拦截主题框与外部语义卡片重叠但允许合法嵌套", () => {
  const overlap = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 390, y: 500, width: 300, height: 220 },
    boxes: [
      { id: "external-card", x: 350, y: 620, width: 300, height: 200 },
    ],
    elements: [],
  });
  const nested = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 390, y: 500, width: 300, height: 220 },
    boxes: [
      {
        id: "nested-card",
        x: 430,
        y: 540,
        width: 180,
        height: 100,
        insideTopic: true,
      },
    ],
    elements: [],
  });

  assert.deepEqual(overlap.collisions, [
    { first: "external-card", second: "cover-topic" },
  ]);
  assert.deepEqual(nested.collisions, []);
});

test("封面门禁允许显式标注的设计性重叠", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 180, y: 500, width: 720, height: 360 },
    elements: [
      { id: "stamp", text: "不是字数", x: 720, y: 960, width: 210, height: 210, overlapOk: true },
      { id: "note", text: "共享容量", x: 700, y: 1060, width: 260, height: 80 },
    ],
  });

  assert.deepEqual(report.collisions, []);
});

test("设计性重叠豁免不能绕过文字越界检查", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 180, y: 500, width: 720, height: 360 },
    elements: [
      { id: "stamp", text: "装饰章", x: 1040, y: 960, width: 120, height: 120, overlapOk: true },
    ],
  });

  assert.deepEqual(report.overflows, ["stamp"]);
});

test("封面门禁不会把父子文本容器误判为冲突", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 180, y: 500, width: 720, height: 360 },
    elements: [
      { id: "strip", text: "共享同一块容量", x: 100, y: 1180, width: 880, height: 120 },
      {
        id: "strip-strong",
        text: "同一块容量",
        x: 520,
        y: 1210,
        width: 240,
        height: 45,
        ancestors: ["strip"],
      },
    ],
  });

  assert.deepEqual(report.collisions, []);
});

test("封面门禁会拦截越界文字和偏离中央的主题", () => {
  const report = detectCoverLayoutIssues({
    width: 1080,
    height: 1440,
    topic: { x: 40, y: 300, width: 420, height: 220 },
    elements: [
      { id: "footer", text: "说明", x: 980, y: 1380, width: 140, height: 80 },
    ],
  });

  assert.deepEqual(report.overflows, ["footer"]);
  assert.equal(report.topicCentered, false);
});

test("指定浏览器不存在时门禁明确失败而不是静默跳过", () => {
  assert.throws(
    () => resolveChromeExecutable({
      env: { COURSE_COVER_CHROME: "E:/missing/chrome.exe" },
      homeDir: "C:/Users/test",
      existsSync: () => false,
    }),
    /封面真实渲染浏览器不存在/,
  );
});

test("首次安装只配置 CHROME_PATH 时封面也使用同一浏览器", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-chrome-path-"));
  const executable = path.join(tempDir, "chrome.exe");
  fs.writeFileSync(executable, "browser fixture", { encoding: "utf8" });
  try {
    assert.equal(resolveChromeExecutable({
      env: { CHROME_PATH: executable },
      homeDir: tempDir,
    }), executable);
    assert.throws(() => resolveChromeExecutable({
      env: { CHROME_PATH: path.join(tempDir, "missing.exe") },
      homeDir: tempDir,
    }), /浏览器不存在/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("没有渲染缓存时可发现标准安装目录中的 Chrome", () => {
  const installedChrome = path.join("C:/Program Files", "Google/Chrome/Application/chrome.exe");
  assert.equal(resolveChromeExecutable({
    env: {},
    homeDir: "C:/Users/no-cache",
    existsSync: (file) => file === installedChrome,
  }), installedChrome);
});

test("封面门禁同时核对页面和 PNG 的 1080×1440 尺寸", () => {
  assert.equal(typeof coverChecker.assertCoverRenderDimensions, "function");
  assert.doesNotThrow(() => coverChecker.assertCoverRenderDimensions({
    metrics: { width: 1080, height: 1440 },
    png: { width: 1080, height: 1440 },
  }));
  assert.throws(
    () => coverChecker.assertCoverRenderDimensions({
      metrics: { width: 1080, height: 1440 },
      png: { width: 1079, height: 1440 },
    }),
    /PNG.*1080×1440/,
  );
});

test("真实渲染审计脚本会等待字体并写入可解析的页面指标", () => {
  const html = buildAuditHtml("<!doctype html><html><body><main>Token</main></body></html>");

  assert.match(html, /document\.fonts\.ready/);
  assert.match(html, /data-cover-audit/);
  assert.match(html, /data-audit-box/);
  assert.match(html, /boxAncestors/);
  assert.match(html, /insideTopic:Boolean\(element\.closest\("\[data-role=cover-topic\]"\)\)/);
  assert.ok(html.indexOf("data-cover-audit") < html.indexOf("</body>"));
});

test("门禁可以从 Chrome dump-dom 结果读取页面指标", () => {
  const payload = { width: 1080, height: 1440, fontReady: true, elements: [] };
  const dom = `<html data-cover-audit="${encodeURIComponent(JSON.stringify(payload))}"></html>`;

  assert.deepEqual(parseAuditPayload(dom), payload);
});

test("封面门禁可以用真实 Chrome 生成并核验 1080×1440 PNG", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-cover-qc-"));
  const fixture = path.join(tempDir, "cover.html");
  const outputDir = path.join(tempDir, "qc");
  fs.writeFileSync(fixture, `<!doctype html>
<html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1440px;overflow:hidden}
main{position:relative;width:1080px;height:1440px;background:#f4efe6}
.topic{position:absolute;left:190px;top:520px;width:700px;height:300px;display:grid;place-items:center}
</style></head><body><main><div class="topic" data-role="cover-topic">AI 记忆</div></main></body></html>`, {
    encoding: "utf8",
  });
  try {
    const result = spawnSync(process.execPath, [
      path.resolve("build/common/check_course_cover.mjs"),
      fixture,
      "--out",
      outputDir,
    ], { encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(fs.readFileSync(path.join(outputDir, "cover.json"), {
      encoding: "utf8",
    }));
    assert.equal(report.status, "passed");
    assert.equal(report.metrics.width, 1080);
    assert.equal(report.metrics.height, 1440);
    assert.ok(fs.statSync(path.join(outputDir, "cover.png")).size > 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
