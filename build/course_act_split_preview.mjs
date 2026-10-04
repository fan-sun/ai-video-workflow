#!/usr/bin/env node
/**
 * 课程制作 act 旁白切分预演。
 *
 * 默认只读 Markdown，按 VoxCPM 音频优先规则生成 segments 预览。
 * 不调用 VoxCPM、不调用 ffmpeg、不生成音频、不覆盖现有逐句脚本。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRIMARY_END = "。！？…!?";
const SECONDARY_END = "；;，、：,:";
const TRAILING_CLOSERS = "」』”’）】》〉』";
const DEFAULT_MAX_CHARS = 36;
const DEFAULT_MERGE_MAX_CHARS = 36;
const DEFAULT_MIN_CHARS = 4;
const DEFAULT_PAUSE = 0.15;
const PAIRED_MARKS = {
  "「": "」",
  "『": "』",
  "“": "”",
  "‘": "’",
  "（": "）",
  "【": "】",
  "《": "》",
};

function charCount(text) {
  return Array.from(String(text).replace(/\s+/g, "")).length;
}

function usage() {
  return `用法:
  node build/course_act_split_preview.mjs --md <课程讲解稿.md> --act <幕编号> [选项]

选项:
  --include-opening          act1 同时纳入“开场点题”旁白
  --format table|json|both   输出格式，默认 table
  --compare <json>           与现有 act JSON 做统计对比
  --max-chars <n>            长句二切阈值，默认 ${DEFAULT_MAX_CHARS}
  --min-chars <n>            过短提示阈值，默认 ${DEFAULT_MIN_CHARS}
  --pause <seconds>          默认句间停顿，默认 ${DEFAULT_PAUSE}
  --check-only               只输出校验摘要
  --out <path>               显式写出 JSON；默认不写文件
  --force                    允许覆盖 --out 已存在文件

示例:
  node build/course_act_split_preview.mjs --md course/scripts/02-loop-engineering-精简版.md --act 1 --include-opening --format table
`;
}

export function parseArgs(argv) {
  const args = {
    format: "table",
    includeOpening: false,
    maxChars: DEFAULT_MAX_CHARS,
    minChars: DEFAULT_MIN_CHARS,
    pause: DEFAULT_PAUSE,
    checkOnly: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${key} 缺少参数`);
      i += 1;
      return argv[i];
    };

    if (key === "--md") args.md = next();
    else if (key === "--act") args.act = Number(next());
    else if (key === "--include-opening") args.includeOpening = true;
    else if (key === "--format") args.format = next();
    else if (key === "--compare") args.compare = next();
    else if (key === "--max-chars") args.maxChars = Number(next());
    else if (key === "--min-chars") args.minChars = Number(next());
    else if (key === "--pause") args.pause = Number(next());
    else if (key === "--check-only") args.checkOnly = true;
    else if (key === "--out") args.out = next();
    else if (key === "--force") args.force = true;
    else if (key === "--help" || key === "-h") args.help = true;
    else throw new Error(`未知参数: ${key}`);
  }

  if (!args.help) {
    if (!args.md) throw new Error("必须提供 --md <课程讲解稿.md>");
    if (!Number.isInteger(args.act) || args.act <= 0) throw new Error("必须提供 --act <正整数>");
    if (!["table", "json", "both"].includes(args.format)) throw new Error("--format 只能是 table、json 或 both");
    if (!Number.isFinite(args.maxChars) || args.maxChars <= 0) throw new Error("--max-chars 必须是正数");
    if (!Number.isFinite(args.minChars) || args.minChars < 0) throw new Error("--min-chars 必须是非负数");
    if (!Number.isFinite(args.pause) || args.pause < 0) throw new Error("--pause 必须是非负数");
  }

  return args;
}

function actHeadingRegex(actNumber) {
  const names = ["第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十"];
  const zh = names[actNumber - 1];
  if (!zh) return new RegExp(`^##\\s*第${actNumber}幕`, "m");
  return new RegExp(`^##\\s*${zh}幕`, "m");
}

function sectionBetween(markdown, startRe, endRe) {
  const start = markdown.search(startRe);
  if (start < 0) return "";
  const rest = markdown.slice(start);
  const endMatch = rest.slice(1).search(endRe);
  if (endMatch < 0) return rest;
  return rest.slice(0, endMatch + 1);
}

function extractNarrationLines(section) {
  const lines = [];
  const re = /^旁白：(.+)$/gm;
  let m;
  while ((m = re.exec(section)) !== null) {
    const text = m[1].trim();
    if (text) lines.push(text);
  }
  return lines;
}

export function extractActNarration(markdown, actNumber, includeOpening = false) {
  const parts = [];
  if (includeOpening) {
    const opening = sectionBetween(markdown, /^##\s*开场点题/m, /^##\s*第一幕/m);
    parts.push(...extractNarrationLines(opening));
  }

  const startRe = actHeadingRegex(actNumber);
  const endRe = actHeadingRegex(actNumber + 1);
  const actSection = sectionBetween(markdown, startRe, endRe);
  parts.push(...extractNarrationLines(actSection));
  return parts;
}

export function splitByPrimaryPunctuation(text) {
  const chars = Array.from(String(text).trim());
  const chunks = [];
  let buf = "";

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    buf += ch;
    if (PRIMARY_END.includes(ch)) {
      while (i + 1 < chars.length && TRAILING_CLOSERS.includes(chars[i + 1])) {
        i += 1;
        buf += chars[i];
      }
      const trimmed = buf.trim();
      if (trimmed) chunks.push(trimmed);
      buf = "";
    }
  }

  const tail = buf.trim();
  if (tail) chunks.push(tail);
  return chunks;
}

function splitSecondaryPieces(sentence) {
  const pieces = [];
  const closers = [];
  let buf = "";

  for (const ch of Array.from(sentence)) {
    buf += ch;
    if (PAIRED_MARKS[ch]) closers.push(PAIRED_MARKS[ch]);
    else if (closers.at(-1) === ch) closers.pop();

    if (SECONDARY_END.includes(ch) && closers.length === 0) {
      pieces.push(buf);
      buf = "";
    }
  }
  if (buf) pieces.push(buf);
  return pieces.filter((p) => p.trim()).map((p) => p.trim());
}

function mergeShortDanglingChunks(chunks, maxChars = DEFAULT_MERGE_MAX_CHARS) {
  const merged = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const current = chunks[i];
    const next = chunks[i + 1];
    if (
      next
      && charCount(current) <= 8
      && SECONDARY_END.includes(current.at(-1))
      && charCount(current + next) <= maxChars
    ) {
      merged.push(current + next);
      i += 1;
    } else {
      merged.push(current);
    }
  }

  return merged;
}

function splitLongPiecesBalanced(pieces, maxChars) {
  const sentence = pieces.join("").trim();
  if (charCount(sentence) <= maxChars || pieces.length <= 1) return [sentence];

  const total = charCount(sentence);
  let best = null;
  let left = "";
  for (let i = 0; i < pieces.length - 1; i += 1) {
    left += pieces[i];
    const right = pieces.slice(i + 1).join("");
    const leftLen = charCount(left);
    const rightLen = charCount(right);
    const score = Math.abs(total / 2 - leftLen) + (leftLen > maxChars ? 1000 : 0) + (rightLen > maxChars ? 1000 : 0);
    if (!best || score < best.score) best = { index: i, score };
  }

  if (!best) return [sentence];
  const leftPieces = pieces.slice(0, best.index + 1);
  const rightPieces = pieces.slice(best.index + 1);
  return [
    ...splitLongPiecesBalanced(leftPieces, maxChars),
    ...splitLongPiecesBalanced(rightPieces, maxChars),
  ].filter(Boolean);
}

export function splitLongChunk(sentence, options = {}) {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  if (charCount(sentence) <= maxChars) return { chunks: [sentence], secondarySplits: 0 };

  const pieces = splitSecondaryPieces(sentence);
  if (pieces.length <= 1) return { chunks: [sentence], secondarySplits: 0 };

  const chunks = splitLongPiecesBalanced(pieces, maxChars);
  return { chunks, secondarySplits: Math.max(0, chunks.length - 1) };
}

export function splitNarrationText(text, options = {}) {
  const primary = splitByPrimaryPunctuation(text);
  const chunks = [];
  let secondarySplits = 0;

  for (const item of primary) {
    const result = splitLongChunk(item, options);
    chunks.push(...result.chunks);
    secondarySplits += result.secondarySplits;
  }

  return { chunks: mergeShortDanglingChunks(chunks), secondarySplits };
}

export function buildSegments(chunks, options = {}) {
  const pause = options.pause ?? DEFAULT_PAUSE;
  const includeOpening = Boolean(options.includeOpening);
  let g = 1;

  return chunks.map((text, index) => {
    let id;
    if (includeOpening && index === 0) id = "s0";
    else {
      id = `g${String(g).padStart(2, "0")}`;
      g += 1;
    }

    return {
      id,
      voice_id: "clone",
      pause_after: index === chunks.length - 1 ? 0 : pause,
      text,
    };
  });
}

export function validateSegments(segments, options = {}) {
  const maxChars = options.warningMaxChars ?? DEFAULT_MERGE_MAX_CHARS;
  const minChars = options.minChars ?? DEFAULT_MIN_CHARS;
  const errors = [];
  const warnings = [];
  const seen = new Set();

  segments.forEach((seg, index) => {
    if (!seg.id) errors.push({ index, id: seg.id, message: "缺少 id" });
    if (seen.has(seg.id)) errors.push({ index, id: seg.id, message: `重复 id: ${seg.id}` });
    seen.add(seg.id);

    if (!String(seg.text ?? "").trim()) {
      errors.push({ index, id: seg.id, message: "空文本" });
      return;
    }

    const length = charCount(seg.text);
    if (length < minChars) warnings.push({ index, id: seg.id, message: `过短: ${length} 字`, text: seg.text });
    if (length > maxChars) warnings.push({ index, id: seg.id, message: `过长: ${length} 字`, text: seg.text });

    if (!Number.isFinite(Number(seg.pause_after)) || Number(seg.pause_after) < 0) {
      errors.push({ index, id: seg.id, message: "pause_after 必须是非负数字" });
    }
  });

  return { errors, warnings };
}

function statsForSegments(segments) {
  const lengths = segments.map((s) => charCount(s.text));
  const totalChars = lengths.reduce((a, b) => a + b, 0);
  const totalPause = segments.reduce((sum, s) => sum + Number(s.pause_after || 0), 0);
  return {
    count: segments.length,
    totalChars,
    avgChars: segments.length ? totalChars / segments.length : 0,
    maxChars: lengths.length ? Math.max(...lengths) : 0,
    minChars: lengths.length ? Math.min(...lengths) : 0,
    totalPause,
  };
}

export function compareWithExisting(generated, existingJson) {
  const existingSegments = existingJson?.segments ?? [];
  return {
    existing: statsForSegments(existingSegments),
    generated: statsForSegments(generated),
  };
}

function makePreviewJson(mdPath, act, includeOpening, segments) {
  return {
    title: `课程旁白切分预览 · act${act}`,
    voice: "voxcpm_clone",
    note: `由 build/course_act_split_preview.mjs 按 course/docs/act_split_rules.md 从 ${mdPath} 生成预览；默认仅 dry-run。voxcpm_tts.py 只读 id/text。`,
    segments,
    meta: {
      source: mdPath,
      act,
      include_opening: includeOpening,
      generated_by: "build/course_act_split_preview.mjs",
    },
  };
}

function buildReport(args, paragraphs, splitResults, segments, validation, comparison) {
  const stats = statsForSegments(segments);
  const secondarySplits = splitResults.reduce((sum, item) => sum + item.secondarySplits, 0);
  return {
    source: { md: args.md, act: args.act, includeOpening: args.includeOpening },
    rules: {
      primary: PRIMARY_END,
      secondaryWhenLongerThan: args.maxChars,
      secondary: SECONDARY_END,
      defaultPause: args.pause,
    },
    generated: {
      paragraphs: paragraphs.length,
      segments: stats.count,
      totalChars: stats.totalChars,
      avgChars: Number(stats.avgChars.toFixed(1)),
      maxChars: stats.maxChars,
      minChars: stats.minChars,
      totalPause: Number(stats.totalPause.toFixed(2)),
      secondarySplits,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
    },
    segments,
    validation,
    comparison,
  };
}

function printTableReport(report) {
  console.log("Source:");
  console.log(`  md: ${report.source.md}`);
  console.log(`  act: ${report.source.act}`);
  console.log(`  includeOpening: ${report.source.includeOpening}`);
  console.log("");
  console.log("Rules:");
  console.log(`  primary: ${report.rules.primary}`);
  console.log(`  secondaryWhenLongerThan: ${report.rules.secondaryWhenLongerThan}`);
  console.log(`  secondary: ${report.rules.secondary}`);
  console.log(`  defaultPause: ${report.rules.defaultPause}`);
  console.log("");
  console.log("Generated:");
  for (const [key, value] of Object.entries(report.generated)) console.log(`  ${key}: ${value}`);

  if (report.comparison) {
    console.log("");
    console.log("Compare:");
    console.log(`  existing.segments: ${report.comparison.existing.count}`);
    console.log(`  generated.segments: ${report.comparison.generated.count}`);
    console.log(`  existing.avgChars: ${report.comparison.existing.avgChars.toFixed(1)}`);
    console.log(`  generated.avgChars: ${report.comparison.generated.avgChars.toFixed(1)}`);
    console.log(`  existing.maxChars: ${report.comparison.existing.maxChars}`);
    console.log(`  generated.maxChars: ${report.comparison.generated.maxChars}`);
    console.log(`  existing.totalPause: ${report.comparison.existing.totalPause.toFixed(2)}`);
    console.log(`  generated.totalPause: ${report.comparison.generated.totalPause.toFixed(2)}`);
  }

  if (report.validation.errors.length) {
    console.log("");
    console.log("Errors:");
    for (const item of report.validation.errors) console.log(`  - ${item.id ?? `#${item.index}`}: ${item.message}`);
  }

  if (report.validation.warnings.length) {
    console.log("");
    console.log("Warnings:");
    for (const item of report.validation.warnings) console.log(`  - ${item.id ?? `#${item.index}`}: ${item.message} ${item.text ? `| ${item.text}` : ""}`);
  }

  console.log("");
  console.log("Segments:");
  console.log("  id    chars  pause  text");
  for (const seg of report.segments) {
    const id = seg.id.padEnd(5, " ");
    const len = String(charCount(seg.text)).padStart(5, " ");
    const pause = Number(seg.pause_after).toFixed(2).padStart(5, " ");
    console.log(`  ${id} ${len}  ${pause}  ${seg.text}`);
  }
}

export function stringifyPreviewJson(data) {
  const entries = Object.entries(data);
  const lines = ["{"];

  entries.forEach(([key, value], index) => {
    const suffix = index === entries.length - 1 ? "" : ",";
    const prefix = `  ${JSON.stringify(key)}: `;

    if (key === "segments" && Array.isArray(value)) {
      lines.push(`${prefix}[`);
      value.forEach((segment, segmentIndex) => {
        const fields = Object.entries(segment)
          .map(([field, fieldValue]) => `${JSON.stringify(field)}: ${JSON.stringify(fieldValue)}`)
          .join(", ");
        const segmentSuffix = segmentIndex === value.length - 1 ? "" : ",";
        lines.push(`    { ${fields} }${segmentSuffix}`);
      });
      lines.push(`  ]${suffix}`);
      return;
    }

    const serialized = JSON.stringify(value, null, 2).split("\n");
    lines.push(`${prefix}${serialized[0]}`);
    for (const line of serialized.slice(1)) lines.push(`  ${line}`);
    lines[lines.length - 1] += suffix;
  });

  lines.push("}");
  return lines.join("\n");
}

function writeOutput(outPath, data, force) {
  const abs = path.resolve(outPath);
  if (fs.existsSync(abs) && !force) throw new Error(`输出文件已存在，拒绝覆盖: ${abs}；如需覆盖请加 --force`);
  fs.writeFileSync(abs, `${stringifyPreviewJson(data)}\n`, "utf8");
}

export function runCli(rawArgs) {
  const args = parseArgs(rawArgs);
  if (args.help) {
    console.log(usage());
    return 0;
  }

  const mdPath = path.resolve(args.md);
  const markdown = fs.readFileSync(mdPath, "utf8");
  const paragraphs = extractActNarration(markdown, args.act, args.includeOpening);
  if (!paragraphs.length) throw new Error(`没有提取到 act${args.act} 旁白`);

  const splitResults = paragraphs.map((text) => splitNarrationText(text, args));
  const chunks = splitResults.flatMap((item) => item.chunks);
  const segments = buildSegments(chunks, args);
  const validation = validateSegments(segments, args);

  let comparison = null;
  if (args.compare) {
    const existingJson = JSON.parse(fs.readFileSync(path.resolve(args.compare), "utf8"));
    comparison = compareWithExisting(segments, existingJson);
  }

  const previewJson = makePreviewJson(args.md, args.act, args.includeOpening, segments);
  const report = buildReport(args, paragraphs, splitResults, segments, validation, comparison);

  if (args.out) writeOutput(args.out, previewJson, args.force);

  if (args.checkOnly) {
    console.log(`check: errors=${validation.errors.length}, warnings=${validation.warnings.length}, segments=${segments.length}`);
  } else if (args.format === "json") {
    console.log(stringifyPreviewJson(previewJson));
  } else if (args.format === "both") {
    printTableReport(report);
    console.log("");
    console.log(stringifyPreviewJson(previewJson));
  } else {
    printTableReport(report);
  }

  return validation.errors.length ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const code = runCli(process.argv.slice(2));
    process.exitCode = code;
  } catch (err) {
    console.error(err.message);
    console.error("");
    console.error(usage());
    process.exitCode = 2;
  }
}
