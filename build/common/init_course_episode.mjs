#!/usr/bin/env node
// 用途：为新一期课程创建统一的课程、脚本和音频目录。
// 运行：node build/common/init_course_episode.mjs <NN-slug>
// 依赖：Node.js 内置 fs、path 和 url 模块，无第三方依赖。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EPISODE_DIR_RE = /^\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EPISODE_SCRIPT_POLICY_START = 1;

export function assertCourseEpisodeScriptLocation(root) {
  const buildDir = path.join(root, "build");
  if (!fs.existsSync(buildDir)) return;
  const misplaced = fs.readdirSync(buildDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => {
      const match = name.match(/^(?:course_)?ep(\d+)(?:[_-].+)?\.(?:py|[cm]?js|sh)$/iu);
      return match && Number(match[1]) >= EPISODE_SCRIPT_POLICY_START;
    });
  if (misplaced.length) {
    throw new Error(`本期专用脚本不能放在 build 根目录：${misplaced.join("、")}；请移到 course/episodes/NN-<slug>/`);
  }
}

export function initCourseEpisode(root, episode, { topic = "待确认", topicTerms = [topic], route = "course" } = {}) {
  if (!["course", "vibe"].includes(route)) throw new Error("路线必须为 course 或 vibe");
  if (!EPISODE_DIR_RE.test(episode)) {
    throw new Error("期目录名必须符合 NN-slug，例如 07-new-topic");
  }
  assertCourseEpisodeScriptLocation(root);

  const [number, ...slugParts] = episode.split("-");
  const ep = Number(number);
  const slug = slugParts.join("-");
  const ledgerFile = path.join(root, "course", "episodes.json");
  const episodeRoot = path.join(root, "course", "episodes");
  if (!fs.existsSync(ledgerFile) && fs.existsSync(episodeRoot)
    && fs.readdirSync(episodeRoot).some(name => fs.existsSync(path.join(episodeRoot, name, "制作索引.json")))) {
    throw new Error("已有制作索引但课程台账缺失，请先恢复台账，不能当作首次运行");
  }
  const ledger = fs.existsSync(ledgerFile)
    ? JSON.parse(fs.readFileSync(ledgerFile, { encoding: "utf8" }))
    : { note: "本仓库课程台账", episodes: [], topic_backlog: [] };
  const existing = ledger.episodes.find(item => item.ep === ep || item.slug === slug);
  if (existing && (existing.ep !== ep || existing.slug !== slug)) {
    throw new Error("期号或 slug 已用于其他主题，不能重复登记");
  }
  const existingIndex = path.join(root, "course", "episodes", episode, "制作索引.json");
  if (fs.existsSync(existingIndex)
    && (JSON.parse(fs.readFileSync(existingIndex, { encoding: "utf8" })).route ?? "course") !== route) {
    throw new Error("已有期次的路线不同，请继续使用原路线，不自动切换");
  }

  const paths = {
    episode,
    courseEpisodeDir: path.join(root, "course", "episodes", episode),
    scriptDir: path.join(root, "pipeline", "01_script", episode),
    audioDir: path.join(root, "pipeline", "02_audio", episode),
  };

  for (const dir of Object.values(paths).slice(1)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.mkdirSync(path.join(root, "course", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "course", "acts", `ep${number}_${slug}`), { recursive: true });
  if (!existing) {
    ledger.episodes.push({ ep, type: "concept_explainer", topic, topic_terms: topic === "待确认" ? [] : topicTerms,
      slug, status: "选题中", publish_status: "未发布", version: "v1", script: null, output: null,
      selection_note: "待补录", notes: "", route });
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2) + "\n", { encoding: "utf8" });
  }
  const indexFile = path.join(paths.courseEpisodeDir, "制作索引.json");
  if (!fs.existsSync(indexFile)) {
    const index = { episode: `ep${number}`, slug, topic: existing?.topic ?? topic, type: "concept_explainer",
      current_version: "v1", production_contract: "current", route, source_refs: [], script: null, split_preview: null,
      selected_style: null, cover_selection: null, cover_output: null, cover_upload_output: null,
      timeline_summary: null, chapter_titles: [], audio_review: null, review_approval: null,
      review_output: null, publish_output: null, publish_copy: null,
      ...(route === "course" ? { visual_plan: null, visual_review: null, visual_review_status: { status: "pending" } } : {}),
      cover_embed: { duration_s: 0.5, ssim_threshold: 0.97 },
      publish_spec: { width: 1080, height: 1440, fps: 30, video_codec: "h264", video_profiles: ["High", "Main"],
        pixel_format: "yuv420p", audio_codec: "aac", audio_sample_rate: 48000, audio_channels: 1,
        duration_s: null, duration_tolerance_s: 0.2 },
      acts: [1, 2, 3, 4].map(act => ({ act, script: null, audio: null, timings: null,
        visual_source: null, subtitle_highlights: [], allowed_warnings: {} })) };
    if (route === "vibe") {
      index.narrative_mode = "vibe_knowledge";
      index.cover_embed = { duration_s: 0 };
      Object.assign(index.publish_spec, { width: 1920, height: 1080, audio_channels: 2 });
      index.content_approval = null;
      index.bgm = null;
      index.acts.forEach(act => Object.assign(act, { visual_timing: null, sfx: null }));
    }
    fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + "\n", { encoding: "utf8" });
  }
  return paths;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const episode = process.argv[2];
  if (!episode) {
    console.error("用法：node build/common/init_course_episode.mjs <NN-slug>");
    process.exit(1);
  }

  const root = path.resolve(path.dirname(currentFile), "../..");
  try {
    const topicAt = process.argv.indexOf("--topic");
    const routeAt = process.argv.indexOf("--route");
    if (routeAt >= 0 && !process.argv[routeAt + 1]?.trim()) throw new Error("--route 缺少路线");
    if (topicAt >= 0 && !process.argv[topicAt + 1]?.trim()) throw new Error("--topic 缺少主题词");
    const paths = initCourseEpisode(root, episode, {
      ...(topicAt >= 0 ? { topic: process.argv[topicAt + 1] } : {}),
      ...(routeAt >= 0 ? { route: process.argv[routeAt + 1] } : {}),
    });
    console.log(`课程期目录已就绪：${paths.episode}`);
    console.log(path.relative(root, paths.courseEpisodeDir));
    console.log(path.relative(root, paths.scriptDir));
    console.log(path.relative(root, paths.audioDir));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
