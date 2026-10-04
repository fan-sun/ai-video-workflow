import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildTopicDocuments,
  checkCourseTopicDuplicate,
  findRelatedTopics,
  findTopicDuplicate,
  loadSiliconFlowApiKey,
  normalizeTopicTerm,
  rankBm25,
  requestEmbeddings,
  tokenizeForBm25,
  updateEmbeddingCache,
  validateTopicTerms,
} from "./check_course_topic_duplicate.mjs";

function fixtureEpisodes() {
  return [
    {
      ep: 4,
      topic: "提示词（Prompt）",
      topic_terms: ["提示词", "Prompt"],
    },
    {
      ep: 8,
      topic: "上下文窗口（Context Window）",
      topic_terms: ["上下文窗口", "Context Window"],
    },
    {
      ep: 11,
      topic: "预训练与后训练（Pre-training and Post-training）",
      topic_terms: ["预训练", "后训练", "Pre-training", "Post-training"],
    },
    {
      ep: 15,
      topic: "提示词工程（Prompt Engineering）",
      topic_terms: ["提示词工程", "Prompt Engineering"],
    },
  ];
}

function writeLedger(rootDir, episodes = fixtureEpisodes()) {
  const ledgerPath = path.join(rootDir, "course", "episodes.json");
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  writeFileSync(
    ledgerPath,
    JSON.stringify({ episodes }, null, 2) + "\n",
    { encoding: "utf8" },
  );
  return ledgerPath;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("主题词规范化只消除书写差异", () => {
  assert.equal(normalizeTopicTerm(" Prompt "), "prompt");
  assert.equal(normalizeTopicTerm("Ｐｒｏｍｐｔ"), "prompt");
  assert.equal(normalizeTopicTerm("Prompt Engineering"), "promptengineering");
  assert.equal(normalizeTopicTerm("Prompt-Engineering"), "promptengineering");
  assert.equal(normalizeTopicTerm("AI 幻觉"), "ai幻觉");
  assert.equal(normalizeTopicTerm("AI幻觉"), "ai幻觉");
});

test("同一完整概念及其中英文别名判为重复", () => {
  const episodes = fixtureEpisodes();

  assert.deepEqual(findTopicDuplicate(episodes, "提示词"), {
    duplicate: true,
    candidate: "提示词",
    normalized: "提示词",
    ep: 4,
    topic: "提示词（Prompt）",
    matchedTerm: "提示词",
  });
  assert.equal(findTopicDuplicate(episodes, "prompt").ep, 4);
  assert.equal(findTopicDuplicate(episodes, "PRE-TRAINING").ep, 11);
  assert.equal(findTopicDuplicate(episodes, "后训练").ep, 11);
});

test("包含旧词的扩展概念不会被旧主题误判", () => {
  const onlyBaseTopics = fixtureEpisodes().filter((episode) => ![11, 15].includes(episode.ep));

  assert.deepEqual(findTopicDuplicate(onlyBaseTopics, "提示词工程"), {
    duplicate: false,
    candidate: "提示词工程",
    normalized: "提示词工程",
  });
  assert.deepEqual(findTopicDuplicate(onlyBaseTopics, "上下文工程"), {
    duplicate: false,
    candidate: "上下文工程",
    normalized: "上下文工程",
  });
});

test("台账拒绝缺失、空值、同一期重复和跨期冲突", () => {
  assert.throws(
    () => validateTopicTerms([{ ep: 1, topic: "缺字段" }]),
    /Episode 1.*topic_terms/,
  );
  assert.throws(
    () => validateTopicTerms([{ ep: 1, topic: "空数组", topic_terms: [] }]),
    /Episode 1.*不能为空/,
  );
  assert.throws(
    () => validateTopicTerms([{ ep: 1, topic: "空词", topic_terms: [" "] }]),
    /Episode 1.*第 1 项/,
  );
  assert.throws(
    () => validateTopicTerms([{
      ep: 4,
      topic: "提示词",
      topic_terms: ["Prompt Engineering", "Prompt-Engineering"],
    }]),
    /Episode 4.*规范化后重复/,
  );
  assert.throws(
    () => validateTopicTerms([
      { ep: 4, topic: "提示词", topic_terms: ["Prompt"] },
      { ep: 21, topic: "重复", topic_terms: ["prompt"] },
    ]),
    /Episode 4.*Episode 21.*prompt/i,
  );
});

test("读取真实格式台账完成只读检查", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-dedup-"));
  try {
    const ledgerPath = writeLedger(rootDir);
    const before = sha256(ledgerPath);

    const duplicate = checkCourseTopicDuplicate({ rootDir, topic: "Prompt" });
    const available = checkCourseTopicDuplicate({ rootDir, topic: "上下文工程" });

    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.ep, 4);
    assert.equal(available.duplicate, false);
    assert.equal(sha256(ledgerPath), before);
    assert.equal(
      readFileSync(ledgerPath, { encoding: "utf8" }).includes("topic_terms"),
      true,
    );
    assert.equal(existsSync(path.join(rootDir, "pipeline")), false);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("台账解析错误和空候选给出明确错误", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-dedup-error-"));
  try {
    const ledgerPath = path.join(rootDir, "course", "episodes.json");
    mkdirSync(path.dirname(ledgerPath), { recursive: true });
    writeFileSync(ledgerPath, "{bad json", { encoding: "utf8" });

    assert.throws(
      () => checkCourseTopicDuplicate({ rootDir, topic: "提示词" }),
      /无法解析课程台账/,
    );
    assert.throws(
      () => findTopicDuplicate(fixtureEpisodes(), "　 "),
      /候选主题不能为空/,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("CLI 用退出码区分可用主题、重复主题和参数错误", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-dedup-cli-"));
  try {
    writeLedger(rootDir);
    const scriptPath = fileURLToPath(
      new URL("./check_course_topic_duplicate.mjs", import.meta.url),
    );

    const duplicate = spawnSync(
      process.execPath,
      [scriptPath, "--root", rootDir, "--topic", "Prompt"],
      { encoding: "utf8" },
    );
    assert.equal(duplicate.status, 2, duplicate.stderr);
    assert.match(duplicate.stdout, /主题已讲过/);
    assert.match(duplicate.stdout, /EP04/);
    assert.match(duplicate.stdout, /提示词（Prompt）/);

    const available = spawnSync(
      process.execPath,
      [scriptPath, "--root", rootDir, "--topic", "上下文工程"],
      {
        encoding: "utf8",
        env: { ...process.env, SILICONFLOW_API_KEY: "" },
      },
    );
    assert.equal(available.status, 3, available.stderr);
    assert.match(available.stdout, /未发现重复主题词/);
    assert.match(available.stdout, /语义提醒未执行/);

    const invalid = spawnSync(
      process.execPath,
      [scriptPath, "--root", rootDir],
      { encoding: "utf8" },
    );
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /用法/);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("真实课程台账的主题词完整且互不冲突", () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const ledger = JSON.parse(
    readFileSync(path.join(projectRoot, "course", "episodes.json"), {
      encoding: "utf8",
    }),
  );

  assert.doesNotThrow(() => validateTopicTerms(ledger.episodes));
});

test("BM25 同时召回完整主题和共享词的相关主题", () => {
  const documents = buildTopicDocuments(fixtureEpisodes());
  const tokens = tokenizeForBm25("提示词工程 Prompt-Engineering");
  assert.equal(tokens.includes("提示"), true);
  assert.equal(tokens.includes("示词"), true);
  assert.equal(tokens.includes("prompt"), true);
  assert.equal(tokens.includes("engineering"), true);

  const results = rankBm25("提示词工程", documents);
  assert.equal(results[0].ep, 15);
  assert.equal(results.some((item) => item.ep === 4), true);
  assert.equal(results[0].score > 0, true);
  assert.equal(results[0].matchedTokens.length > 0, true);
});

test("硅基流动 Embeddings 适配器验证返回并且不泄露 Key", async () => {
  let authorization = "";
  const vectors = await requestEmbeddings(["提示词", "上下文"], {
    apiKey: "secret-key",
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return {
        ok: true,
        json: async () => ({
          data: [
            { index: 0, embedding: [1, 0] },
            { index: 1, embedding: [0, 1] },
          ],
        }),
      };
    },
  });

  assert.equal(authorization, "Bearer secret-key");
  assert.deepEqual(vectors, [[1, 0], [0, 1]]);
  await assert.rejects(
    () => requestEmbeddings(["提示词"], {
      apiKey: "secret-key",
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    }),
    (error) => !error.message.includes("secret-key") && /401/.test(error.message),
  );
  await assert.rejects(
    () => requestEmbeddings(["提示词"], { apiKey: "" }),
    /SILICONFLOW_API_KEY 未设置/,
  );
  await assert.rejects(
    () => requestEmbeddings(["提示词"], {
      apiKey: "secret-key",
      fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }),
    }),
    /返回数量与请求不一致/,
  );
});

test("历史向量缓存只请求新增或变化的主题文档", async () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-cache-"));
  try {
    const cachePath = path.join(rootDir, "embeddings.json");
    const documents = buildTopicDocuments(fixtureEpisodes());
    let requestedTexts = [];
    const fetchImpl = async (_url, options) => {
      const body = JSON.parse(options.body);
      requestedTexts.push(...body.input);
      return {
        ok: true,
        json: async () => ({
          data: body.input.map((_text, index) => ({ index, embedding: [index + 1, 1] })),
        }),
      };
    };

    const first = await updateEmbeddingCache(documents, {
      cachePath,
      apiKey: "secret-key",
      fetchImpl,
    });
    assert.equal(requestedTexts.length, documents.length);
    assert.equal(first.size, documents.length);

    requestedTexts = [];
    const second = await updateEmbeddingCache(documents, {
      cachePath,
      apiKey: "secret-key",
      fetchImpl,
    });
    assert.equal(requestedTexts.length, 0);
    assert.equal(second.size, documents.length);

    requestedTexts = [];
    const changedDocuments = documents.map((document) =>
      document.ep === 4
        ? { ...document, text: document.text + "\n新增说明" }
        : document);
    const third = await updateEmbeddingCache(changedDocuments, {
      cachePath,
      apiKey: "secret-key",
      fetchImpl,
    });
    assert.equal(requestedTexts.length, 1);
    assert.equal(third.size, documents.length);

    const cacheBeforeFailure = readFileSync(cachePath, { encoding: "utf8" });
    const brokenDocuments = changedDocuments.map((document) =>
      document.ep === 8
        ? { ...document, text: document.text + "\n再次变化" }
        : document);
    await assert.rejects(
      () => updateEmbeddingCache(brokenDocuments, {
        cachePath,
        apiKey: "secret-key",
        fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
      }),
      /503/,
    );
    assert.equal(readFileSync(cachePath, { encoding: "utf8" }), cacheBeforeFailure);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("相关提醒融合 BM25 与语义排名但不改变精确重复结论", async () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-related-"));
  try {
    const cachePath = path.join(rootDir, "embeddings.json");
    const vectorFor = (text) => {
      const normalized = normalizeTopicTerm(text);
      if (normalized.includes("提示词") || normalized.includes("prompt")) return [1, 0, 0];
      if (normalized.includes("上下文") || normalized.includes("context")) return [0, 1, 0];
      return [0, 0, 1];
    };
    const fetchImpl = async (_url, options) => {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          data: body.input.map((text, index) => ({ index, embedding: vectorFor(text) })),
        }),
      };
    };

    const related = await findRelatedTopics(fixtureEpisodes(), {
      topic: "提示词工程评测",
      summary: "比较提示词版本并检查输出是否稳定",
      apiKey: "secret-key",
      fetchImpl,
      cachePath,
    });
    assert.equal(related.complete, true);
    assert.equal(related.results[0].ep, 15);
    assert.equal(related.results.some((item) => item.ep === 4), true);
    assert.equal(related.results[0].semanticSimilarity > 0, true);

    const exact = findTopicDuplicate(fixtureEpisodes(), "提示词工程");
    assert.equal(exact.duplicate, true);
    assert.equal(exact.ep, 15);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("缺少 Key 时只返回 BM25 并明确语义提醒未执行", async () => {
  let called = false;
  const related = await findRelatedTopics(fixtureEpisodes(), {
    topic: "提示词评测",
    summary: "检查不同提示词版本",
    apiKey: "",
    fetchImpl: async () => {
      called = true;
      throw new Error("不应调用");
    },
  });

  assert.equal(called, false);
  assert.equal(related.complete, false);
  assert.equal(related.semanticStatus, "missing_key");
  assert.equal(related.results.some((item) => item.ep === 4), true);
});

test("优先读取系统 Key，没有时读取项目根目录 .env", () => {
  const rootDir = mkdtempSync(path.join(os.tmpdir(), "course-topic-env-"));
  try {
    writeFileSync(
      path.join(rootDir, ".env"),
      "# 本地密钥\nSILICONFLOW_API_KEY=from-file\nOTHER=value\n",
      { encoding: "utf8" },
    );

    assert.equal(
      loadSiliconFlowApiKey(rootDir, { SILICONFLOW_API_KEY: "from-env" }),
      "from-env",
    );
    assert.equal(loadSiliconFlowApiKey(rootDir, {}), "from-file");

    writeFileSync(
      path.join(rootDir, ".env"),
      "export SILICONFLOW_API_KEY=\"quoted-key\"\n",
      { encoding: "utf8" },
    );
    assert.equal(loadSiliconFlowApiKey(rootDir, {}), "quoted-key");
    assert.equal(loadSiliconFlowApiKey(path.join(rootDir, "missing"), {}), "");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
