#!/usr/bin/env node
/**
 * 用途：只读列出已发布课程的清理候选，不把文件名匹配当成可删除证明。
 * 运行：node build/common/cleanup_course_builds.mjs --published --intermediates
 * 依赖：Node.js；独立重建验证尚未完成，非空计划的 --apply 暂停执行。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");

export function parseEpisodeSpec(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("缺少期数范围");
  const episodes = new Set();
  for (const part of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const range = part.match(/^(\d+)-(\d+)$/u);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start) throw new Error(`期数范围无效：${part}`);
      for (let episode = start; episode <= end; episode += 1) episodes.add(episode);
      continue;
    }
    if (!/^\d+$/u.test(part) || Number(part) < 1) throw new Error(`期数无效：${part}`);
    episodes.add(Number(part));
  }
  return [...episodes].sort((left, right) => left - right);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, { encoding: "utf8" }));
}

function pathSize(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) throw new Error(`拒绝清理目录链接：${targetPath}`);
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(targetPath, { withFileTypes: true }).reduce(
    (total, entry) => total + pathSize(path.join(targetPath, entry.name)),
    0,
  );
}

function filesWithin(directory, rootDir, parentChecked = false) {
  if (!fs.existsSync(directory)) return [];
  if (!parentChecked) {
    const relative = path.relative(path.resolve(rootDir), path.resolve(directory));
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw new Error(`清理路径越界：${directory}`);
    let ancestor = path.resolve(rootDir);
    for (const component of ["", ...relative.split(path.sep).filter(Boolean)]) {
      ancestor = path.join(ancestor, component);
      if (fs.lstatSync(ancestor).isSymbolicLink()) throw new Error(`拒绝清理目录链接：${ancestor}`);
    }
  }
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw new Error(`拒绝清理目录链接：${directory}`);
  if (stat.isFile()) return [directory];
  return fs.readdirSync(directory).flatMap((name) => filesWithin(path.join(directory, name), rootDir, true));
}

function sourceDependencies(rootDir) {
  const dependencies = new Set();
  for (const directory of ["course/acts", "course/episodes", "templates"]) {
    for (const file of filesWithin(path.join(rootDir, directory), rootDir)) {
      if (!/\.(html|js|css)$/u.test(file)) continue;
      const source = fs.readFileSync(file, { encoding: "utf8" });
      // 分别匹配各类引号，避免HTML属性中的内外引号互相吞掉；CSS也支持无引号url。
      const patterns = [/"([^"\n]+)"/gu, /'([^'\n]+)'/gu, /`([^`\n]+)`/gu, /url\(\s*([^'"\s)]+)\s*\)/gu];
      for (const match of patterns.flatMap((pattern) => [...source.matchAll(pattern)])) {
        const value = match[1].split(/[?#]/u)[0];
        if (!value || value.includes("${")) continue;
        const target = path.resolve(/^(pipeline|course|templates)\//u.test(value) ? rootDir : path.dirname(file), value);
        if (fs.existsSync(target) && fs.statSync(target).isFile()) dependencies.add(fs.realpathSync(target));
      }
    }
  }
  return dependencies;
}

function intermediateFiles(rootDir, indexPath, publishOutput) {
  const outputRoot = ["course", "teaching", "vibe"].map(folder => path.join(rootDir, "pipeline/output", folder))
    .find(candidate => {
      const relative = path.relative(candidate, publishOutput);
      return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
    });
  if (!outputRoot) throw new Error("正式成片不在已支持的 output 目录，拒绝扩展清理");
  const outputName = path.relative(outputRoot, publishOutput).split(path.sep)[0];
  const episode = path.basename(path.dirname(indexPath)).split("-")[0];
  if (!outputName.startsWith(`ep${episode}_`)) throw new Error("正式成片不在本期 output 目录，拒绝扩展清理");
  const frameDirectories = new Set(["actual-mp4-frames", "source-frames", "review-frames", "motion-sequence", "check", "frames", "keyframes"]);
  const outputFiles = filesWithin(path.join(outputRoot, outputName), rootDir).filter((file) => {
    const image = /\.(png|jpe?g)$/iu.test(file);
    return (image && file.split(path.sep).some((part) => frameDirectories.has(part)))
      || (image && /^(detail|focus|whole)-\d/iu.test(path.basename(file)))
      || /(?:^|[_-])silent(?:[_-]|\.)[^/\\]*mp4$/iu.test(path.basename(file));
  });
  const audioRoot = path.join(rootDir, "pipeline/02_audio", path.basename(path.dirname(indexPath)));
  const audioFiles = filesWithin(audioRoot, rootDir).filter((file) => {
    const parts = file.split(path.sep);
    return (/\.wav$/iu.test(file) && parts.some((part) => part.endsWith("_raw") || part === "trim"))
      || /^(?:.*[-_])?concat(?:[-_].*)?\.txt$/iu.test(path.basename(file));
  });
  return [...outputFiles, ...audioFiles];
}

function assertDirectBuildChild(targetPath, buildRoot) {
  const resolvedBuildRoot = fs.realpathSync(buildRoot);
  const resolvedTarget = fs.realpathSync(targetPath);
  if (path.dirname(resolvedTarget) !== resolvedBuildRoot) {
    throw new Error(`拒绝删除 build 直属目录之外的路径：${targetPath}`);
  }
}

function findEpisodeIndex(rootDir, episode) {
  const episodesRoot = path.join(rootDir, "course", "episodes");
  const prefix = `${String(episode).padStart(2, "0")}-`;
  const directories = fs.readdirSync(episodesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix));
  if (directories.length !== 1) {
    throw new Error(`第 ${episode} 期制作目录数量异常：${directories.length}`);
  }
  return path.join(episodesRoot, directories[0].name, "制作索引.json");
}

export function createCourseBuildCleanupPlan({ rootDir = PROJECT_ROOT, episodeSpec, includeIntermediates = false }) {
  const absoluteRoot = path.resolve(rootDir);
  const buildRoot = path.join(absoluteRoot, "pipeline", "build");
  const ledgerPath = path.join(absoluteRoot, "course", "episodes.json");
  if (!fs.existsSync(buildRoot) || !fs.statSync(buildRoot).isDirectory()) {
    throw new Error(`构建目录不存在：${buildRoot}`);
  }
  if (!fs.existsSync(ledgerPath)) throw new Error(`课程台账不存在：${ledgerPath}`);

  const episodes = parseEpisodeSpec(episodeSpec);
  const episodeSet = new Set(episodes);
  const ledger = readJson(ledgerPath);
  const dependencies = sourceDependencies(absoluteRoot);
  const targetsByEpisode = new Map(episodes.map((episode) => [episode, []]));
  const namePattern = /^(?:course_)?ep(\d{2})(?:_|$)/u;

  for (const entry of fs.readdirSync(buildRoot, { withFileTypes: true })) {
    const match = entry.name.match(namePattern);
    if (!match) continue;
    const episode = Number(match[1]);
    if (!episodeSet.has(episode)) continue;
    targetsByEpisode.get(episode).push(path.join(buildRoot, entry.name));
  }

  for (const episode of episodes) {
    const episodeTargets = targetsByEpisode.get(episode);
    const ledgerEntry = ledger.episodes?.find((item) => Number(item.ep) === episode);
    if (ledgerEntry?.publish_status !== "已发布") {
      throw new Error(`第 ${episode} 期尚未标记为已发布，拒绝清理`);
    }
    const indexPath = findEpisodeIndex(absoluteRoot, episode);
    if (!fs.existsSync(indexPath)) throw new Error(`第 ${episode} 期制作索引不存在`);
    const index = readJson(indexPath);
    const publishOutput = path.resolve(absoluteRoot, String(index.publish_output ?? ""));
    if (!index.publish_output || !fs.existsSync(publishOutput) || fs.statSync(publishOutput).size === 0) {
      throw new Error(`第 ${episode} 期正式发布成片不存在`);
    }
    for (const act of index.acts ?? []) {
      for (const input of [act.script, act.audio, act.timings, act.visual_source, ...(act.visual_assets ?? [])].filter(Boolean)) {
        const inputPath = path.resolve(absoluteRoot, input);
        if (!fs.existsSync(inputPath) || (fs.statSync(inputPath).isFile() && fs.statSync(inputPath).size === 0)) throw new Error(`正式重建输入不存在：${input}`);
        dependencies.add(fs.realpathSync(inputPath));
      }
    }
    dependencies.add(fs.realpathSync(publishOutput));
    for (const targetPath of episodeTargets) assertDirectBuildChild(targetPath, buildRoot);
    if (includeIntermediates) episodeTargets.push(...intermediateFiles(absoluteRoot, indexPath, publishOutput));
  }

  const targets = [...targetsByEpisode.values()].flat().filter((target) => {
    const files = filesWithin(target, absoluteRoot);
    const resolved = fs.realpathSync(target);
    if ([...dependencies].some((input) => input === resolved || input.startsWith(resolved + path.sep) || resolved.startsWith(input + path.sep))) return false;
    return !files.some((file) => dependencies.has(fs.realpathSync(file)));
  }).sort();
  return {
    rootDir: absoluteRoot,
    buildRoot,
    episodes,
    includeIntermediates,
    targets,
    totalBytes: targets.reduce((total, targetPath) => total + pathSize(targetPath), 0),
  };
}

export function applyCourseBuildCleanup(plan) {
  const current = createCourseBuildCleanupPlan({ rootDir: plan.rootDir,
    episodeSpec: plan.episodes.join(","), includeIntermediates: plan.includeIntermediates });
  if (current.targets.some((target) => !plan.targets.includes(target))) throw new Error("清理目标已变化，请重新预览");
  if (current.targets.length) {
    // 静态引用扫描不能证明没有动态、跨期或增量入口依赖，缺少证据时保持文件原样。
    throw new Error("候选尚未完成独立重建验证，已暂停自动删除。请按 published_cleanup.md 保留文件并逐项复核。");
  }
  return { deletedCount: 0, deletedBytes: 0 };
}

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function parseCli(argv) {
  const publishedOnly = argv.includes("--published");
  const episodeIndex = argv.indexOf("--episodes");
  if ((!publishedOnly && (episodeIndex < 0 || !argv[episodeIndex + 1])) || (publishedOnly && episodeIndex >= 0)) {
    throw new Error("用法：node build/common/cleanup_course_builds.mjs (--episodes 1-9 | --published) [--intermediates] [--apply]");
  }
  const known = new Set(["--episodes", argv[episodeIndex + 1], "--published", "--intermediates", "--apply"]);
  const unknown = argv.filter((item) => !known.has(item));
  if (unknown.length) throw new Error(`未知参数：${unknown.join(" ")}`);
  const episodeSpec = publishedOnly
    ? readJson(path.join(PROJECT_ROOT, "course/episodes.json")).episodes.filter((item) => item.publish_status === "已发布").map((item) => item.ep).join(",")
    : argv[episodeIndex + 1];
  return { episodeSpec, includeIntermediates: argv.includes("--intermediates"), apply: argv.includes("--apply") };
}

function runCli(argv) {
  const options = parseCli(argv);
  if (!options.episodeSpec) { console.log("没有已发布期次，无需清理。"); return; }
  const plan = createCourseBuildCleanupPlan(options);
  console.log(`期数：${plan.episodes.join(", ")}`);
  console.log(`候选：${plan.targets.length} 项，共 ${formatBytes(plan.totalBytes)}（不代表已验证可删除）`);
  for (const targetPath of plan.targets) {
    console.log(`- ${path.relative(plan.rootDir, targetPath)}`);
  }
  if (!options.apply) {
    console.log("只读预览完成；独立重建验证未完成，非空计划的 --apply 已暂停。");
    return;
  }
  const result = applyCourseBuildCleanup(plan);
  console.log(`候选为空，未删除文件（${result.deletedCount} 项）。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
