#!/usr/bin/env node
// 用途：检查 课程候选主题是否与台账中的完整主题词重复。
// 运行：node build/check_course_topic_duplicate.mjs --topic "候选主题"
// 依赖：Node.js 内置 fs、path 和 url 模块，无第三方依赖。
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EMBEDDING_MODEL = "BAAI/bge-m3";
const EMBEDDING_ENDPOINT = "https://api.siliconflow.cn/v1/embeddings";
const CACHE_SCHEMA_VERSION = 1;
const RELATED_LIMIT = 5;
const RRF_K = 60;
const BM25_RRF_WEIGHT = 1.2;
const SEMANTIC_RRF_WEIGHT = 1;

const REMOVABLE_CHARACTERS = new Set(
  Array.from(" \t\r\n-_.,:;!?\"'`()[]{}（）【】《》〈〉，。；：！？“”‘’、·•・‐‑‒–—―"),
);

export function normalizeTopicTerm(value) {
  if (typeof value !== "string") return "";
  const normalized = value.normalize("NFKC").toLowerCase();
  return Array.from(normalized)
    .filter((character) => !REMOVABLE_CHARACTERS.has(character))
    .join("");
}

export function loadSiliconFlowApiKey(rootDir, environment = process.env) {
  const environmentValue = environment?.SILICONFLOW_API_KEY;
  if (typeof environmentValue === "string" && environmentValue.trim()) {
    return environmentValue.trim();
  }

  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return "";
  const lines = fs.readFileSync(envPath, { encoding: "utf8" }).split(/\r?\n/u);
  for (const line of lines) {
    const match = line.match(
      /^\s*(?:export\s+)?SILICONFLOW_API_KEY\s*=\s*(.*?)\s*$/u,
    );
    if (!match) continue;
    let value = match[1];
    if (
      value.length >= 2 &&
      ((value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    return value.trim();
  }
  return "";
}

function collectSelectionText(value, key = "") {
  if (/source|url|ref|date|captured/i.test(key)) return [];
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) return [];
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSelectionText(item, key));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([childKey, childValue]) =>
      collectSelectionText(childValue, childKey));
  }
  return [];
}

export function buildTopicDocuments(episodes) {
  validateTopicTerms(episodes);
  return episodes.map((episode) => ({
    id: "ep" + String(episode.ep).padStart(2, "0"),
    ep: episode.ep,
    topic: episode.topic,
    topicTerms: [...episode.topic_terms],
    lexicalText: [episode.topic, ...episode.topic_terms].join("\n"),
    text: [
      episode.topic,
      ...episode.topic_terms,
      ...collectSelectionText(episode.selection_note),
    ].filter(Boolean).join("\n"),
  }));
}

export function tokenizeForBm25(value) {
  if (typeof value !== "string") return [];
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‐‑‒–—―_-]+/gu, " ");
  const parts = normalized.match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? [];
  const tokens = [];
  for (const part of parts) {
    if (/^[\p{Script=Han}]+$/u.test(part)) {
      tokens.push(part);
      if (part.length === 1) {
        tokens.push(part);
      } else {
        for (let index = 0; index < part.length - 1; index += 1) {
          tokens.push(part.slice(index, index + 2));
        }
      }
    } else {
      tokens.push(part);
    }
  }
  return tokens;
}

export function rankBm25(query, documents) {
  if (!Array.isArray(documents) || documents.length === 0) return [];
  const queryTokens = [...new Set(tokenizeForBm25(query))];
  if (queryTokens.length === 0) return [];

  const tokenized = documents.map((document) =>
    tokenizeForBm25(document.lexicalText ?? document.text));
  const averageLength = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) /
    tokenized.length;
  const documentFrequency = new Map();
  for (const tokens of tokenized) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const k1 = 1.2;
  const b = 0.75;
  const results = documents.map((document, documentIndex) => {
    const tokens = tokenized[documentIndex];
    const frequencies = new Map();
    for (const token of tokens) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
    let score = 0;
    const matchedTokens = [];
    for (const token of queryTokens) {
      const frequency = frequencies.get(token) ?? 0;
      if (frequency === 0) continue;
      matchedTokens.push(token);
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
      const denominator = frequency + k1 * (
        1 - b + b * tokens.length / Math.max(averageLength, 1)
      );
      score += idf * frequency * (k1 + 1) / denominator;
    }
    return { ...document, score, matchedTokens };
  });

  return results
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.ep - right.ep);
}

function validateVector(vector, expectedDimension = null) {
  if (!Array.isArray(vector) || vector.length === 0) return false;
  if (expectedDimension !== null && vector.length !== expectedDimension) return false;
  return vector.every((value) => typeof value === "number" && Number.isFinite(value));
}

export async function requestEmbeddings(inputs, {
  apiKey,
  fetchImpl = globalThis.fetch,
  endpoint = EMBEDDING_ENDPOINT,
} = {}) {
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY 未设置");
  if (!Array.isArray(inputs) || inputs.length === 0) return [];
  if (typeof fetchImpl !== "function") throw new Error("当前 Node.js 不支持 fetch");

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
      encoding_format: "float",
    }),
  });
  if (!response.ok) {
    throw new Error("硅基流动 Embeddings 请求失败，HTTP " + response.status);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.data) || payload.data.length !== inputs.length) {
    throw new Error("硅基流动 Embeddings 返回数量与请求不一致");
  }
  const ordered = [...payload.data].sort((left, right) => left.index - right.index);
  const dimension = ordered[0]?.embedding?.length ?? null;
  if (ordered.some((item, index) =>
    item.index !== index || !validateVector(item.embedding, dimension))) {
    throw new Error("硅基流动 Embeddings 返回了无效向量");
  }
  return ordered.map((item) => item.embedding);
}

function documentHash(document) {
  return createHash("sha256")
    .update(EMBEDDING_MODEL + "\n" + document.text, "utf8")
    .digest("hex");
}

function readEmbeddingCache(cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) return { items: [] };
  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, { encoding: "utf8" }));
  } catch (error) {
    throw new Error("无法读取主题向量缓存 " + cachePath + "：" + error.message);
  }
  if (cache.schema_version !== CACHE_SCHEMA_VERSION || cache.model !== EMBEDDING_MODEL) {
    return { items: [] };
  }
  if (!Array.isArray(cache.items)) {
    throw new Error("主题向量缓存 items 必须是数组");
  }
  return cache;
}

function writeEmbeddingCache(cachePath, items) {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const temporaryPath = cachePath + "." + process.pid + ".tmp";
  const content = JSON.stringify({
    schema_version: CACHE_SCHEMA_VERSION,
    model: EMBEDDING_MODEL,
    items,
  }, null, 2) + "\n";
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8" });
    fs.renameSync(temporaryPath, cachePath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export async function updateEmbeddingCache(documents, {
  cachePath,
  apiKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!cachePath) throw new Error("主题向量缓存路径不能为空");
  const cache = readEmbeddingCache(cachePath);
  const existing = new Map(cache.items.map((item) => [item.id, item]));
  const stale = documents.filter((document) => {
    const item = existing.get(document.id);
    return !item || item.hash !== documentHash(document) || !validateVector(item.embedding);
  });

  let generated = [];
  if (stale.length > 0) {
    generated = await requestEmbeddings(stale.map((document) => document.text), {
      apiKey,
      fetchImpl,
    });
  }
  const generatedById = new Map(stale.map((document, index) => [
    document.id,
    generated[index],
  ]));
  const items = documents.map((document) => ({
    id: document.id,
    hash: documentHash(document),
    embedding: generatedById.get(document.id) ?? existing.get(document.id).embedding,
  }));
  if (stale.length > 0 || cache.items.length !== items.length || !fs.existsSync(cachePath)) {
    writeEmbeddingCache(cachePath, items);
  }
  return new Map(items.map((item) => [item.id, item.embedding]));
}

function cosineSimilarity(left, right) {
  if (!validateVector(left) || !validateVector(right, left.length)) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function fuseRelatedRanks(documents, bm25, semantic) {
  const byId = new Map(documents.map((document) => [document.id, {
    ...document,
    combinedScore: 0,
    bm25Score: 0,
    semanticSimilarity: null,
    matchedTokens: [],
  }]));
  bm25.forEach((item, index) => {
    const result = byId.get(item.id);
    result.combinedScore += BM25_RRF_WEIGHT / (RRF_K + index + 1);
    result.bm25Score = item.score;
    result.matchedTokens = item.matchedTokens;
  });
  semantic.forEach((item, index) => {
    const result = byId.get(item.id);
    result.combinedScore += SEMANTIC_RRF_WEIGHT / (RRF_K + index + 1);
    result.semanticSimilarity = item.similarity;
  });
  return [...byId.values()]
    .filter((item) => item.bm25Score > 0 || item.semanticSimilarity !== null)
    .sort((left, right) =>
      right.combinedScore - left.combinedScore ||
      (right.semanticSimilarity ?? -1) - (left.semanticSimilarity ?? -1) ||
      left.ep - right.ep)
    .slice(0, RELATED_LIMIT);
}

export async function findRelatedTopics(episodes, {
  topic,
  summary = "",
  apiKey = "",
  fetchImpl = globalThis.fetch,
  cachePath = null,
} = {}) {
  const documents = buildTopicDocuments(episodes);
  const query = [topic, summary].filter((value) => typeof value === "string" && value.trim())
    .join("\n");
  const bm25 = rankBm25(topic, documents);

  if (!apiKey) {
    return {
      complete: false,
      semanticStatus: "missing_key",
      model: EMBEDDING_MODEL,
      results: bm25.slice(0, RELATED_LIMIT).map((item) => ({
        ...item,
        bm25Score: item.score,
        semanticSimilarity: null,
      })),
    };
  }

  const vectors = await updateEmbeddingCache(documents, {
    cachePath,
    apiKey,
    fetchImpl,
  });
  const [queryVector] = await requestEmbeddings([query], { apiKey, fetchImpl });
  const semantic = documents
    .map((document) => ({
      ...document,
      similarity: cosineSimilarity(queryVector, vectors.get(document.id)),
    }))
    .sort((left, right) => right.similarity - left.similarity || left.ep - right.ep);
  return {
    complete: true,
    semanticStatus: "complete",
    model: EMBEDDING_MODEL,
    results: fuseRelatedRanks(documents, bm25, semantic),
  };
}

function episodeLabel(episode, index) {
  return "Episode " + (episode?.ep ?? index + 1);
}

export function validateTopicTerms(episodes) {
  if (!Array.isArray(episodes)) {
    throw new Error("课程台账 episodes 必须是数组");
  }

  const seen = new Map();

  episodes.forEach((episode, episodeIndex) => {
    const label = episodeLabel(episode, episodeIndex);
    const terms = episode?.topic_terms;
    if (!Array.isArray(terms)) {
      throw new Error(label + " 缺少 topic_terms 数组");
    }
    if (terms.length === 0) {
      throw new Error(label + " 的 topic_terms 不能为空");
    }

    const local = new Map();
    terms.forEach((term, termIndex) => {
      if (typeof term !== "string" || normalizeTopicTerm(term) === "") {
        throw new Error(
          label + " 的 topic_terms 第 " + (termIndex + 1) + " 项必须是非空字符串",
        );
      }

      const normalized = normalizeTopicTerm(term);
      if (local.has(normalized)) {
        throw new Error(
          label + " 的 topic_terms 规范化后重复：" +
          local.get(normalized) + " / " + term,
        );
      }
      local.set(normalized, term);

      if (seen.has(normalized)) {
        const previous = seen.get(normalized);
        throw new Error(
          "主题词冲突：" + previous.label + " 与 " + label +
          " 都登记了 " + normalized,
        );
      }
      seen.set(normalized, { label, episode, term });
    });
  });

  return seen;
}

export function findTopicDuplicate(episodes, candidate) {
  const normalized = normalizeTopicTerm(candidate);
  if (normalized === "") {
    throw new Error("候选主题不能为空");
  }

  const terms = validateTopicTerms(episodes);
  const match = terms.get(normalized);
  const cleanCandidate = candidate.trim();
  if (!match) {
    return {
      duplicate: false,
      candidate: cleanCandidate,
      normalized,
    };
  }

  return {
    duplicate: true,
    candidate: cleanCandidate,
    normalized,
    ep: match.episode.ep,
    topic: match.episode.topic,
    matchedTerm: match.term,
  };
}

export function checkCourseTopicDuplicate({
  rootDir,
  topic,
  ledgerPath = path.join(rootDir, "course", "episodes.json"),
}) {
  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, { encoding: "utf8" });
  } catch (error) {
    throw new Error("无法读取课程台账 " + ledgerPath + "：" + error.message);
  }

  let ledger;
  try {
    ledger = JSON.parse(raw);
  } catch (error) {
    throw new Error("无法解析课程台账 " + ledgerPath + "：" + error.message);
  }

  return findTopicDuplicate(ledger.episodes, topic);
}

export function parseArgs(argv) {
  const args = { rootDir: null, topic: null, summary: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--topic") {
      args.topic = argv[index + 1];
      index += 1;
    } else if (arg === "--summary") {
      args.summary = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--root") {
      args.rootDir = argv[index + 1];
      index += 1;
    } else {
      throw new Error("未知参数：" + arg);
    }
  }

  if (normalizeTopicTerm(args.topic) === "") {
    throw new Error(
      "用法：node build/check_course_topic_duplicate.mjs --topic \"候选主题\"",
    );
  }
  return args;
}

function printResult(result) {
  if (result.duplicate) {
    console.log("主题已讲过");
    console.log("候选：" + result.candidate);
    console.log("命中词：" + result.matchedTerm);
    console.log("历史期次：EP" + String(result.ep).padStart(2, "0"));
    console.log("正式主题：" + result.topic);
    return;
  }

  console.log("未发现重复主题词");
  console.log("候选：" + result.candidate);
}

function printRelatedTopics(related) {
  if (related.results.length === 0) {
    console.log("未发现相关往期");
  } else {
    console.log("相关往期提醒：");
    related.results.forEach((item, index) => {
      const semantic = item.semanticSimilarity === null
        ? "未执行"
        : item.semanticSimilarity.toFixed(3);
      console.log(
        String(index + 1) + ". EP" + String(item.ep).padStart(2, "0") +
        " " + item.topic + "（BM25=" + item.bm25Score.toFixed(3) +
        "，语义=" + semantic + "）",
      );
    });
  }
  if (!related.complete) {
    console.log("语义提醒未执行：未设置 SILICONFLOW_API_KEY");
    console.log("精确主题词门禁已完成，相关主题检查尚未完整完成");
  } else {
    console.log("可以继续进入选题流程");
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const rootDir = args.rootDir
      ? path.resolve(args.rootDir)
      : path.resolve(path.dirname(currentFile), "..");
    const result = checkCourseTopicDuplicate({ rootDir, topic: args.topic });
    printResult(result);
    if (result.duplicate) {
      process.exitCode = 2;
    } else {
      const related = await findRelatedTopics(
        JSON.parse(fs.readFileSync(path.join(rootDir, "course", "episodes.json"), {
          encoding: "utf8",
        })).episodes,
        {
          topic: args.topic,
          summary: args.summary,
          apiKey: loadSiliconFlowApiKey(rootDir),
          cachePath: path.join(
            rootDir,
            "pipeline",
            "build",
            "course_topic_search",
            "embeddings.json",
          ),
        },
      );
      printRelatedTopics(related);
      process.exitCode = related.complete ? 0 : 3;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
