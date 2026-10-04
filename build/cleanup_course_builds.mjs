#!/usr/bin/env node
/**
 * 用途：按课程期数安全清理 pipeline/build 中可重建的构建产物。
 * 运行：node build/cleanup_course_builds.mjs --episodes 1-9 [--apply]
 * 依赖：Node.js；默认只预览，只有 --apply 才删除。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

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
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(targetPath, { withFileTypes: true }).reduce(
    (total, entry) => total + pathSize(path.join(targetPath, entry.name)),
    0,
  );
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

export function createCourseBuildCleanupPlan({ rootDir = PROJECT_ROOT, episodeSpec }) {
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
    if (episodeTargets.length === 0) continue;
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
    for (const targetPath of episodeTargets) assertDirectBuildChild(targetPath, buildRoot);
  }

  const targets = [...targetsByEpisode.values()].flat().sort();
  return {
    rootDir: absoluteRoot,
    buildRoot,
    episodes,
    targets,
    totalBytes: targets.reduce((total, targetPath) => total + pathSize(targetPath), 0),
  };
}

export function applyCourseBuildCleanup(plan) {
  let deletedCount = 0;
  let deletedBytes = 0;
  for (const targetPath of plan.targets) {
    if (!fs.existsSync(targetPath)) continue;
    assertDirectBuildChild(targetPath, plan.buildRoot);
    deletedBytes += pathSize(targetPath);
    fs.rmSync(targetPath, { recursive: true, force: true });
    deletedCount += 1;
  }
  return { deletedCount, deletedBytes };
}

function formatBytes(bytes) {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function parseCli(argv) {
  const episodeIndex = argv.indexOf("--episodes");
  if (episodeIndex < 0 || !argv[episodeIndex + 1]) {
    throw new Error("用法：node build/cleanup_course_builds.mjs --episodes 1-9 [--apply]");
  }
  const known = new Set(["--episodes", argv[episodeIndex + 1], "--apply"]);
  const unknown = argv.filter((item) => !known.has(item));
  if (unknown.length) throw new Error(`未知参数：${unknown.join(" ")}`);
  return { episodeSpec: argv[episodeIndex + 1], apply: argv.includes("--apply") };
}

function runCli(argv) {
  const options = parseCli(argv);
  const plan = createCourseBuildCleanupPlan({ episodeSpec: options.episodeSpec });
  console.log(`期数：${plan.episodes.join(", ")}`);
  console.log(`目标：${plan.targets.length} 项，共 ${formatBytes(plan.totalBytes)}`);
  for (const targetPath of plan.targets) {
    console.log(`- ${path.relative(plan.rootDir, targetPath)}`);
  }
  if (!options.apply) {
    console.log("预览完成；确认后增加 --apply 执行删除。");
    return;
  }
  const result = applyCourseBuildCleanup(plan);
  console.log(`已删除 ${result.deletedCount} 项，释放 ${formatBytes(result.deletedBytes)}。`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
