import test from "node:test";
import assert from "node:assert/strict";

import * as previewModule from "../../build/teaching/course_act_split_preview.mjs";

const {
  buildSegments,
  extractActNarration,
  splitNarrationText,
  validateSegments,
} = previewModule;

test("JSON 序列化保持顶层缩进且每个 segment 单独占一行", () => {
  assert.equal(typeof previewModule.stringifyPreviewJson, "function");

  const preview = {
    title: "课程旁白切分预览 · act1",
    voice: "voxcpm_clone",
    segments: [
      { id: "s0", voice_id: "clone", pause_after: 0.15, text: "包含\"引号\"和反斜杠\\的中文。" },
      { id: "g01", voice_id: "clone", pause_after: 0, text: "第二句。" },
    ],
    meta: { act: 1 },
  };

  const output = previewModule.stringifyPreviewJson(preview);
  const lines = output.split("\n");

  assert.deepEqual(JSON.parse(output), preview);
  assert.equal(lines.filter((line) => /^    \{ "id":/.test(line)).length, 2);
  assert.ok(lines.includes("  \"segments\": ["));
  assert.ok(lines.includes("  \"meta\": {"));
  assert.ok(lines.some((line) => line.includes("包含\\\"引号\\\"和反斜杠\\\\的中文。")));
});

test("默认不在逗号处切分旁白", () => {
  const result = splitNarrationText("可实际上，在大多数人的用法里，人就是那个循环本身。", {
    maxChars: 30,
  });

  assert.deepEqual(result.chunks, ["可实际上，在大多数人的用法里，人就是那个循环本身。"]);
  assert.equal(result.secondarySplits, 0);
});

test("二次切分忽略成对引号内部的弱标点", () => {
  const result = splitNarrationText("看起来是你在跟 AI 对话——但真正在跑那个「改了看、看了再改」循环的，从头到尾都是你自己。", {
    maxChars: 30,
  });

  assert.deepEqual(result.chunks, [
    "看起来是你在跟 AI 对话——但真正在跑那个「改了看、看了再改」循环的，",
    "从头到尾都是你自己。",
  ]);
  assert.equal(result.secondarySplits, 1);
});

test("短小且以弱标点结尾的悬空片段向后合并", () => {
  const result = splitNarrationText("2026 年 6 月，一位叫 Peter Steinberger 的开发者发了句话：你不该再给 AI 写提示词了，你应该去设计「循环」来提示你的 AI。", {
    maxChars: 30,
  });

  assert.deepEqual(result.chunks.slice(0, 2), [
    "2026 年 6 月，一位叫 Peter Steinberger 的开发者发了句话：",
    "你不该再给 AI 写提示词了，",
  ]);
});

test("较长且承担强调作用的逗号片段不自动向后合并", () => {
  const result = splitNarrationText("说白了就一句话——别再一句句指挥 AI，去设计一个让它自己跑的循环。", {
    maxChars: 30,
  });

  assert.deepEqual(result.chunks, [
    "说白了就一句话——别再一句句指挥 AI，",
    "去设计一个让它自己跑的循环。",
  ]);
});

test("超过上限的长句才在逗号处二次切分", () => {
  const result = splitNarrationText("你只要一开始把规则说清楚，剩下的让它自己转，直到最后完成。", {
    maxChars: 24,
  });

  assert.deepEqual(result.chunks, [
    "你只要一开始把规则说清楚，",
    "剩下的让它自己转，直到最后完成。",
  ]);
  assert.equal(result.secondarySplits, 1);
});

test("默认允许 31 到 36 字的完整比较句保持一次配音", () => {
  const result = splitNarrationText(
    "麻烦在于，“猫”和“狗”的距离，跟“猫”和“汽车”的距离没有区别。",
  );

  assert.deepEqual(result.chunks, [
    "麻烦在于，“猫”和“狗”的距离，跟“猫”和“汽车”的距离没有区别。",
  ]);
  assert.equal(result.secondarySplits, 0);
});

test("不在分号处拆开 36 字以内的同组对比", () => {
  const result = splitNarrationText(
    "那“猫”就是第一格为一、其他格为零；“狗”则是第二格为一。",
  );

  assert.deepEqual(result.chunks, [
    "那“猫”就是第一格为一、其他格为零；“狗”则是第二格为一。",
  ]);
  assert.equal(result.secondarySplits, 0);
});

test("长段超过上限时仍可把分号作为二次切点", () => {
  const result = splitNarrationText(
    "第一部分先完整说明一个需要保留的具体条件和使用背景；第二部分再完整说明对应结果和限制条件。",
    { maxChars: 24 },
  );

  assert.deepEqual(result.chunks, [
    "第一部分先完整说明一个需要保留的具体条件和使用背景；",
    "第二部分再完整说明对应结果和限制条件。",
  ]);
  assert.equal(result.secondarySplits, 1);
});

test("提取 act1 时可以同时包含开场点题", () => {
  const markdown = `# 示例\n\n## 开场点题\n\n旁白：今天聊一个词，Loop Engineering，循环工程。\n画面：词卡。\n\n## 第一幕 · 你才是那个循环\n\n**S1**\n旁白：你大概干过这种事：让 AI 写封邮件，它写完了。\n\n## 第二幕 · 它到底换了什么\n\n旁白：第二幕内容。\n`;

  const paragraphs = extractActNarration(markdown, 1, true);

  assert.deepEqual(paragraphs, [
    "今天聊一个词，Loop Engineering，循环工程。",
    "你大概干过这种事：让 AI 写封邮件，它写完了。",
  ]);
});

test("构建 segments 时开场第一句使用 s0，末句 pause_after 为 0", () => {
  const segments = buildSegments([
    "今天聊一个词，Loop Engineering，循环工程。",
    "说白了就一句话——别再一句句指挥 AI。",
  ], {
    includeOpening: true,
    pause: 0.15,
  });

  assert.deepEqual(segments, [
    {
      id: "s0",
      voice_id: "clone",
      pause_after: 0.15,
      text: "今天聊一个词，Loop Engineering，循环工程。",
    },
    {
      id: "g01",
      voice_id: "clone",
      pause_after: 0,
      text: "说白了就一句话——别再一句句指挥 AI。",
    },
  ]);
});

test("默认校验允许语义完整片段放宽到 36 字", () => {
  const result = validateSegments([
    {
      id: "g01",
      voice_id: "clone",
      pause_after: 0,
      text: "看起来是你在跟 AI 对话——但真正在跑那个「改了看、看了再改」循环的，",
    },
  ]);

  assert.equal(result.warnings.length, 0);
});

test("校验能发现空文本、重复 id、过长与过短片段", () => {
  const result = validateSegments([
    { id: "g01", voice_id: "clone", pause_after: 0.15, text: "短。" },
    { id: "g01", voice_id: "clone", pause_after: 0.15, text: "" },
    {
      id: "g03",
      voice_id: "clone",
      pause_after: 0.15,
      text: "这是一条明显超过限制并且需要人工复核的长句子，用来验证 warning 是否会出现。",
    },
  ], {
    maxChars: 20,
    minChars: 4,
  });

  assert.equal(result.errors.length, 2);
  assert.ok(result.errors.some((item) => item.message.includes("重复 id")));
  assert.ok(result.errors.some((item) => item.message.includes("空文本")));
  assert.ok(result.warnings.some((item) => item.message.includes("过短")));
  assert.ok(result.warnings.some((item) => item.message.includes("过长")));
});
