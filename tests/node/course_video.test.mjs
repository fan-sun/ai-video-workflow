import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createCourseVideoPlan,
  markCourseDashboardPendingPublish,
  runCourseVideoPlan,
  verifyCourseVideoInputs,
} from "../../build/common/course_video.mjs";
import * as courseVideo from "../../build/common/course_video.mjs";

function fixtureIndex() {
  return {
    episode: "ep04",
    slug: "prompt",
    current_version: "v1",
    timeline_summary: "course/episodes/04-prompt/整期时间表.json",
    publish_spec: { fps: 30 },
    review_output: "pipeline/output/course/ep04_prompt/v1/course_ep04_prompt_v1.mp4",
    publish_output: "pipeline/output/course/ep04_prompt/v1/course_ep04_prompt_v1_publish.mp4",
    cover_output: "course/episodes/04-prompt/cover.png",
    cover_embed: { duration_s: 0.5 },
    acts: [1, 2, 3, 4].map((act) => ({
      act,
      audio: `audio/act${act}.wav`,
      timings: `audio/act${act}_timings.json`,
      visual_source: `course/acts/ep04_prompt/act${act}.html`,
      subtitle_highlights: act === 1 ? ["任务委托书"] : [],
      allowed_warnings: { gsap_studio_edit_blocked: 1, wcag_aa_contrast: 0 },
    })),
  };
}

test("课程第一期也执行当前章节契约", () => {
  const index = { ...fixtureIndex(), episode: "ep01", production_contract: "current" };
  assert.throws(() => createCourseVideoPlan(index, "review"), /chapter_titles/);
});

test("review 和 publish 在渲染前拦截 build 根目录的新期次专用脚本", (t) => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-script-location-"));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(rootDir, "build"));
  fs.writeFileSync(path.join(rootDir, "build", "course_ep24_visuals.py"), "", { encoding: "utf8" });
  for (const mode of ["review", "publish"]) {
    assert.throws(() => createCourseVideoPlan(fixtureIndex(), mode, { rootDir }), /本期专用脚本.*course\/episodes/u);
  }
});

test("配置主体区域后，review 在每幕解码后执行运动检查并纳入续跑签名", () => {
  const index = fixtureIndex();
  index.acts.forEach(act => { act.motion_check = { crop: '952:820:64:260', max_still_s: 6 }; });
  const plan = createCourseVideoPlan(index, 'review', { rootDir: 'E:/repo' });
  for (const act of plan.acts) {
    assert.equal(act.steps.at(-1).type, 'motion-check');
    assert.ok(act.steps.at(-1).args.includes('952:820:64:260'));
    assert.ok(act.inputs.some(file => file.endsWith('check_course_motion.mjs')));
  }
});

test("主体检测配置错误应在渲染计划建立时拒绝", () => {
  const index = fixtureIndex();
  index.acts[0].motion_check = { crop: 'full-frame', max_still_s: 6 };
  assert.throws(() => createCourseVideoPlan(index, 'review'), /motion_check/);
  index.acts[0].motion_check = { crop: '952:820:64:260', max_still_s: 0 };
  assert.throws(() => createCourseVideoPlan(index, 'review'), /motion_check/);
});

test("主体停滞失败后不执行下一幕或整片拼接", () => {
  const index = fixtureIndex();
  index.acts.forEach(act => { act.motion_check = { crop: '952:820:64:260', max_still_s: 6 }; });
  const executed = [];
  const plan = createCourseVideoPlan(index, 'review');
  assert.throws(() => runCourseVideoPlan(plan, {
    verifyInputs: () => {}, canReuseAct: () => false, prepareAct: () => {}, markActComplete: () => {},
    executeStep: step => { executed.push(step); if (step.type === 'motion-check') throw new Error('主体停滞'); },
  }), /第 1 幕失败.*主体停滞/);
  assert.ok(!executed.some(step => step.act === 2 || step.type === 'concat'));
});

test("publish 计划四幕串行使用 high、2 worker、浏览器 GPU 和 NVENC", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "publish", { rootDir: "E:/repo" });

  assert.equal(plan.acts.length, 4);
  assert.deepEqual(plan.acts.map((act) => act.act), [1, 2, 3, 4]);
  for (const act of plan.acts) {
    const render = act.steps.find((step) => step.type === "render");
    assert.ok(render.args.includes("high"));
    assert.ok(render.args.includes("--workers"));
    assert.equal(render.args[render.args.indexOf("--workers") + 1], "2");
    assert.ok(render.args.includes("--browser-gpu"));
    assert.ok(render.args.includes("--gpu"));
  }
  assert.equal(plan.acts[0].prepare.includeCover, true);
  assert.ok(plan.acts.slice(1).every((act) => act.prepare.includeCover === false));
  assert.deepEqual(
    plan.finalSteps.map((step) => step.type),
    ["concat", "mux-review-audio", "decode", "record-output", "release-check", "qc-report"],
  );
  assert.equal(plan.finalSteps[0].audio, false);
  const mux = plan.finalSteps.find((step) => step.type === "mux-review-audio");
  assert.ok(mux.args.includes("+faststart"));
});

test("正式封面确认后同步看板为待发布且不改详细生产状态", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-dashboard-status-"));
  try {
    const ledgerPath = path.join(rootDir, "course", "episodes.json");
    const coverOutput = "course/episodes/10-distillation/cover.png";
    const coverFile = path.join(rootDir, coverOutput);
    fs.mkdirSync(path.dirname(coverFile), { recursive: true });
    fs.writeFileSync(coverFile, "png", { encoding: "utf8" });
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, JSON.stringify({
      episodes: [{
        ep: 10,
        topic: "蒸馏",
        status: "正式封面已确认，高清发布版构建中",
        publish_status: "未发布",
      }],
    }), { encoding: "utf8" });

    const index = fixtureIndex();
    index.episode = "ep10";
    index.cover_output = coverOutput;
    index.cover_selection = { id: "C" };

    assert.equal(markCourseDashboardPendingPublish(index, { rootDir, ledgerPath }), true);
    let ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
    assert.equal(ledger.episodes[0].dashboard_status, "待发布");
    assert.equal(ledger.episodes[0].publish_status, "未发布");
    assert.equal(ledger.episodes[0].status, "正式封面已确认，高清发布版构建中");
    assert.equal(markCourseDashboardPendingPublish(index, { rootDir, ledgerPath }), false);

    ledger.episodes[0].dashboard_status = "已发布";
    ledger.episodes[0].publish_status = "已发布";
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger), { encoding: "utf8" });
    assert.equal(markCourseDashboardPendingPublish(index, { rootDir, ledgerPath }), false);
    ledger = JSON.parse(fs.readFileSync(ledgerPath, { encoding: "utf8" }));
    assert.equal(ledger.episodes[0].dashboard_status, "已发布");
    assert.equal(ledger.episodes[0].publish_status, "已发布");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("review 计划使用 standard 并逐幕封装正式 WAV", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "review", { rootDir: "E:/repo" });

  for (const act of plan.acts) {
    assert.equal(act.prepare.includeCover, false);
    assert.deepEqual(
      act.steps.map((step) => step.type),
      ["check", "first-reveal", "render", "mux-wav", "decode"],
    );
    const render = act.steps.find((step) => step.type === "render");
    assert.ok(render.args.includes("standard"));
    assert.equal(render.args[render.args.indexOf("--workers") + 1], "2");
  }
  assert.deepEqual(
    plan.finalSteps.map((step) => step.type),
    ["concat", "decode", "record-output", "qc-report"],
  );
});

test("第一幕配置固定开头时在渲染后覆盖原始开头并纳入续跑签名", () => {
  const index = fixtureIndex();
  index.acts[0].opening_overlay = {
    video: "course/episodes/04-prompt/opening-a.mp4",
    duration_s: 2.117,
    fade_s: 0.56,
  };

  const plan = createCourseVideoPlan(index, "review", { rootDir: "E:/repo" });
  const act1 = plan.acts[0];
  assert.deepEqual(
    act1.steps.map((step) => step.type),
    ["check", "first-reveal", "render", "opening-overlay", "mux-wav", "decode"],
  );
  const overlay = act1.steps.find((step) => step.type === "opening-overlay");
  assert.ok(overlay.args.some((value) => String(value).includes("opening-a.mp4")));
  assert.ok(overlay.args.some((value) => String(value).includes("2.117")));
  assert.ok(act1.inputs.some((file) => file.endsWith("opening-a.mp4")));
});

test("Windows 无 Shell 执行显式使用 npm.cmd", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "review", { rootDir: "E:/repo" });
  const expected = process.platform === "win32" ? "npm.cmd" : "npm";

  assert.equal(plan.acts[0].steps.find((step) => step.type === "check").command, expected);
  assert.equal(plan.acts[0].steps.find((step) => step.type === "render").command, expected);
});

test("画面源禁止用整幕豁免绕过文字溢出检查", () => {
  assert.equal(typeof courseVideo.assertCourseVisualLayoutPolicy, "function");
  assert.throws(
    () => courseVideo.assertCourseVisualLayoutPolicy(`
      <section class="scene"></section>
      <script>
        document.querySelectorAll(".scene").forEach((node) => {
          node.setAttribute("data-layout-allow-overflow", "");
        });
      </script>
    `, "act1.html"),
    /整幕.*data-layout-allow-overflow/,
  );
  assert.throws(
    () => courseVideo.assertCourseVisualLayoutPolicy(
      '<section class="scene active" data-layout-allow-overflow></section>',
      "act1.html",
    ),
    /整幕.*data-layout-allow-overflow/,
  );
  assert.doesNotThrow(() => courseVideo.assertCourseVisualLayoutPolicy(`
    <section class="scene">
      <span class="stamp" data-layout-allow-overflow>REPEAT</span>
    </section>
  `, "act1.html"));
});

test("视频输入预检在渲染前拒绝整幕布局豁免", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-layout-policy-"));
  const visual = path.join(rootDir, "act1.html");
  try {
    fs.writeFileSync(visual, `
      <section class="scene"></section>
      <script>
        document.querySelectorAll(".scene").forEach((node) => {
          node.setAttribute("data-layout-allow-overflow", "");
        });
      </script>
    `, { encoding: "utf8" });
    assert.throws(
      () => verifyCourseVideoInputs({
        requiredInputs: [visual],
        acts: [{ act: 1, source: visual }],
      }),
      /第 1 幕.*整幕.*data-layout-allow-overflow/,
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("第 8 期历史画面可重跑但第 9 期起拒绝整幕布局豁免", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-layout-version-"));
  const visual = path.join(rootDir, "act4.html");
  const audio = path.join(rootDir, "act4.wav");
  const timings = path.join(rootDir, "act4_timings.json");
  try {
    fs.writeFileSync(visual, `
      <div data-duration="1.4"></div><section class="scene" data-layout-allow-overflow></section>
      <script>const DUR=1.4;</script>
    `, { encoding: "utf8" });
    fs.writeFileSync(timings, JSON.stringify({
      total: 1.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 1 }],
    }), { encoding: "utf8" });
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
      "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
      "-map", "[out]", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audio,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    const plan = {
      index: { episode: "ep08" },
      requiredInputs: [visual, audio, timings],
      acts: [{ act: 4, source: visual, audio, timings }],
    };

    assert.doesNotThrow(() => verifyCourseVideoInputs(plan));
    plan.index.episode = "ep09";
    assert.throws(() => verifyCourseVideoInputs(plan), /整幕.*data-layout-allow-overflow/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("布局检查自动选择每个场景转场前的稳定英雄帧", () => {
  assert.equal(typeof courseVideo.extractCourseLayoutCheckTimes, "function");
  assert.deepEqual(
    courseVideo.extractCourseLayoutCheckTimes(`
      const DUR=40;
      push("#s0", "#s1", 10);
      push("#s1", "#s2", 25);
    `),
    [8.8, 23.8, 38.8],
  );
});

test("分幕续跑签名包含实际参与构建的工具文件", () => {
  const review = createCourseVideoPlan(fixtureIndex(), "review", { rootDir: "E:/repo" });
  const publish = createCourseVideoPlan(fixtureIndex(), "publish", { rootDir: "E:/repo" });
  const reviewTools = review.acts[0].inputs.map((file) => file.replaceAll("\\", "/"));
  const publishTools = publish.acts[0].inputs.map((file) => file.replaceAll("\\", "/"));

  assert.ok(reviewTools.some((file) => file.endsWith("/build/common/course_video.mjs")));
  assert.ok(reviewTools.some((file) => file.endsWith("/build/teaching/timings_to_subs.py")));
  assert.ok(reviewTools.some((file) => file.endsWith("/build/common/inject_course_subs.py")));
  assert.ok(!reviewTools.some((file) => file.endsWith("/build/teaching/inject_course_cover.py")));
  assert.ok(publishTools.some((file) => file.endsWith("/build/teaching/inject_course_cover.py")));
});

test("任一幕失败后立即停止且不启动下一幕", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "review", { rootDir: "E:/repo" });
  const executed = [];

  assert.throws(
    () => runCourseVideoPlan(plan, {
      verifyInputs: () => {},
      canReuseAct: () => false,
      markActComplete: () => {},
      prepareAct: (act) => executed.push(`prepare-${act.act}`),
      executeStep: (step) => {
        executed.push(`${step.act ?? "final"}-${step.type}`);
        if (step.act === 2 && step.type === "render") {
          throw new Error("render failed");
        }
      },
    }),
    /第 2 幕.*render failed/,
  );
  assert.ok(executed.includes("2-render"));
  assert.ok(!executed.some((item) => item.startsWith("3-")));
});

test("只有输入未变化且输出通过复用检查的幕才跳过", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "review", { rootDir: "E:/repo" });
  const prepared = [];
  const executed = [];

  runCourseVideoPlan(plan, {
    verifyInputs: () => {},
    canReuseAct: (act) => act.act === 1,
    markActComplete: () => {},
    prepareAct: (act) => prepared.push(act.act),
    executeStep: (step) => executed.push(`${step.act ?? "final"}-${step.type}`),
  });

  assert.deepEqual(prepared, [2, 3, 4]);
  assert.ok(!executed.some((item) => item.startsWith("1-")));
  assert.ok(executed.includes("2-check"));
  assert.ok(executed.includes("final-concat"));
});

test("修改主体检测区域或阈值后不能复用旧验收", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'course-motion-reuse-'));
  try {
    const output = path.join(dir, 'act.mp4');
    fs.writeFileSync(output, 'fixture', { encoding: 'utf8' });
    const act = { output, buildDir: dir, inputs: [], subtitleHighlights: [],
      prepare: {}, motionCheck: { crop: '320:160:0:0', max_still_s: 6 } };
    courseVideo.markCourseActComplete(act);
    const options = { spawnSyncImpl: () => ({ status: 0 }) };
    assert.equal(courseVideo.canReuseCourseAct(act, options), true);
    act.motionCheck = { crop: '320:100:0:0', max_still_s: 4 };
    assert.equal(courseVideo.canReuseCourseAct(act, options), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("全局输入缺失时在任何分幕准备和渲染前失败", () => {
  const plan = createCourseVideoPlan(fixtureIndex(), "publish", { rootDir: "E:/repo" });
  const prepared = [];

  assert.throws(
    () => runCourseVideoPlan(plan, {
      prepareAct: (act) => prepared.push(act.act),
      executeStep: () => {},
    }),
    /输入预检失败.*不存在或为空/,
  );
  assert.deepEqual(prepared, []);
});

test("缺少四幕或字幕高亮配置时在执行前拒绝", () => {
  const missingAct = fixtureIndex();
  missingAct.acts.pop();
  assert.throws(
    () => createCourseVideoPlan(missingAct, "review", { rootDir: "E:/repo" }),
    /必须包含 4 幕/,
  );

  const missingHighlights = fixtureIndex();
  delete missingHighlights.acts[2].subtitle_highlights;
  assert.throws(
    () => createCourseVideoPlan(missingHighlights, "review", { rootDir: "E:/repo" }),
    /第 3 幕.*subtitle_highlights/,
  );

  const missingWarnings = fixtureIndex();
  delete missingWarnings.acts[1].allowed_warnings;
  assert.throws(
    () => createCourseVideoPlan(missingWarnings, "review", { rootDir: "E:/repo" }),
    /第 2 幕.*allowed_warnings/,
  );
});

test("结构化字幕重点要求全文 6 到 10 处且每项字段完整", () => {
  const valid = fixtureIndex();
  const cues = [
    { unit_id: "g01.u01", text: "词元", reason: "核心术语首次出现" },
    { unit_id: "g02.u01", text: "分词器", reason: "关键机制首次出现" },
    { unit_id: "g03.u01", text: "BPE", reason: "英文简称首次解释" },
    { unit_id: "g04.u01", text: "输入 Token", reason: "关键计量概念" },
    { unit_id: "g05.u01", text: "共享容量", reason: "关键理解锚点" },
    { unit_id: "g06.u01", text: "提示词撰写视频", reason: "重要行动入口" },
  ];
  valid.acts.forEach((act) => { act.subtitle_highlights = []; });
  valid.acts[0].subtitle_highlights = cues.slice(0, 2);
  valid.acts[1].subtitle_highlights = cues.slice(2, 3);
  valid.acts[2].subtitle_highlights = cues.slice(3, 5);
  valid.acts[3].subtitle_highlights = cues.slice(5);
  assert.doesNotThrow(() => createCourseVideoPlan(valid, "review", { rootDir: "E:/repo" }));

  const tooFew = structuredClone(valid);
  tooFew.acts[3].subtitle_highlights = [];
  assert.throws(
    () => createCourseVideoPlan(tooFew, "review", { rootDir: "E:/repo" }),
    /结构化字幕重点.*6.*10/,
  );

  const incomplete = structuredClone(valid);
  delete incomplete.acts[0].subtitle_highlights[0].reason;
  assert.throws(
    () => createCourseVideoPlan(incomplete, "review", { rootDir: "E:/repo" }),
    /unit_id.*text.*reason/,
  );

  const mixed = structuredClone(valid);
  mixed.acts[0].subtitle_highlights.push("词元");
  assert.throws(
    () => createCourseVideoPlan(mixed, "review", { rootDir: "E:/repo" }),
    /不能混用/,
  );
});

test("缺少模式所需输出或质检时间表时在执行前明确拒绝", () => {
  const missingReview = fixtureIndex();
  delete missingReview.review_output;
  assert.throws(
    () => createCourseVideoPlan(missingReview, "publish", { rootDir: "E:/repo" }),
    /publish 模式.*review_output/,
  );

  const missingTimeline = fixtureIndex();
  delete missingTimeline.timeline_summary;
  assert.throws(
    () => createCourseVideoPlan(missingTimeline, "review", { rootDir: "E:/repo" }),
    /timeline_summary 不能为空/,
  );
});

test("review 和 publish 在渲染前强制检查第四幕 1 秒收尾契约", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-outro-"));
  const audio = path.join(rootDir, "act4.wav");
  const timings = path.join(rootDir, "act4_timings.json");
  const visual = path.join(rootDir, "act4.html");
  try {
    const generate = spawnSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.4",
      "-f", "lavfi", "-t", "1", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
      "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1[out]",
      "-map", "[out]",
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le",
      audio,
      "-loglevel", "error",
    ], { encoding: "utf8" });
    assert.equal(generate.status, 0, generate.stderr);
    fs.writeFileSync(timings, JSON.stringify({
      total: 0.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 0 }],
    }), { encoding: "utf8" });
    fs.writeFileSync(
      visual,
      '<div data-duration="0.4"></div><script>const DUR=0.4;</script>',
      { encoding: "utf8" },
    );
    const plan = {
      requiredInputs: [audio, timings, visual],
      acts: [{ act: 4, audio, timings, source: visual }],
    };

    assert.throws(() => verifyCourseVideoInputs(plan), /片尾.*1 秒|gap.*1/);

    fs.writeFileSync(timings, JSON.stringify({
      total: 1.4,
      phrases: [{ id: "g01", start: 0, end: 0.4, gap: 1 }],
    }), { encoding: "utf8" });
    fs.writeFileSync(
      visual,
      '<div data-duration="1.4"></div><script>const DUR=1.4;</script>',
      { encoding: "utf8" },
    );
    assert.doesNotThrow(() => verifyCourseVideoInputs(plan));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("首次 review 路径为空时只计算目标位置，不预填索引", () => {
  const index = fixtureIndex();
  index.review_output = null;
  index.publish_output = null;
  const before = structuredClone(index);
  const plan = createCourseVideoPlan(index, "review", { rootDir: process.cwd() });

  assert.equal(plan.finalOutput, path.resolve(fixtureIndex().review_output));
  assert.deepEqual(index, before);
});

test("首次 publish 路径为空时可计算目标位置，仍要求已确认审片输入", () => {
  const index = fixtureIndex();
  index.publish_output = null;
  const before = structuredClone(index);
  const plan = createCourseVideoPlan(index, "publish", { rootDir: process.cwd() });

  assert.equal(plan.finalOutput, path.resolve(fixtureIndex().publish_output));
  assert.deepEqual(index, before);
  index.review_output = null;
  assert.throws(() => createCourseVideoPlan(index, "publish"), /review_output/);
});

function outputRecordFixture(t, mode) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-output-record-"));
  t.after(() => {
    assert.equal(path.dirname(rootDir), path.resolve(os.tmpdir()));
    fs.rmSync(rootDir, { recursive: true, force: true });
  });
  const index = fixtureIndex();
  index.topic = "提示词";
  index.__indexPath = "course/episodes/04-prompt/制作索引.json";
  index.publish_spec.duration_s = null;
  index.publish_spec.duration_tolerance_s = 0.1;
  index.publish_output = null;
  if (mode === "review") index.review_output = null;
  const indexPath = path.join(rootDir, index.__indexPath);
  const ledgerPath = path.join(rootDir, "course/episodes.json");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  const { __indexPath, ...storedIndex } = index;
  fs.writeFileSync(indexPath, JSON.stringify(storedIndex), { encoding: "utf8" });
  const episode = {
    ep: 4, slug: "prompt", topic: index.topic, version: "v1",
    output: mode === "publish" ? index.review_output : null,
    duration_s: null, publish_status: "已发布", dashboard_status: "已发布",
    status: "审片已确认", notes: "保留用户选择",
  };
  fs.writeFileSync(ledgerPath, JSON.stringify({
    episodes: [episode, { ep: 5, slug: "other", output: "unchanged.mp4" }],
  }), { encoding: "utf8" });
  fs.writeFileSync(path.join(rootDir, index.timeline_summary),
    JSON.stringify({ total_s: 0.4 }), { encoding: "utf8" });
  const video = path.join(rootDir, "sample.mp4");
  const generate = spawnSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=32x32:r=30:d=0.4",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", video, "-loglevel", "error",
  ], { encoding: "utf8", windowsHide: true });
  assert.equal(generate.status, 0, generate.stderr);
  return { rootDir, index, indexPath, ledgerPath, video, episode };
}

for (const mode of ["review", "publish"]) {
  test(mode + " 首次生成后自动登记，发布检查能读取新记录且重复登记结果不变", (t) => {
    const fixture = outputRecordFixture(t, mode);
    const plan = createCourseVideoPlan(fixture.index, mode, { rootDir: fixture.rootDir });
    let registered = false;
    let reachedEnd = false;
    runCourseVideoPlan(plan, {
      verifyInputs: () => {},
      canReuseAct: () => true,
      executeStep: (step) => {
        if (step.type === "concat" || step.type === "mux-review-audio") {
          const output = step.type === "concat" ? step.output : plan.finalOutput;
          fs.mkdirSync(path.dirname(output), { recursive: true });
          fs.copyFileSync(fixture.video, output);
        } else if (step.type === "decode" || step.type === "record-output") {
          courseVideo.executeCourseStep(step, plan);
          if (step.type === "record-output") registered = true;
        } else {
          assert.equal(registered, true, "验收或质检前必须完成真实产物登记");
          const saved = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
          const ledger = JSON.parse(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" }));
          const output = path.relative(fixture.rootDir, plan.finalOutput).replaceAll("\\", "/");
          assert.equal(saved[mode + "_output"], output);
          assert.equal(saved.__indexPath, undefined);
          assert.equal(saved.publish_spec.duration_s, 0.4);
          assert.equal(ledger.episodes[0].output, output);
          assert.equal(ledger.episodes[0].duration_s, 0.4);
          assert.equal(ledger.episodes[0].publish_status, "已发布");
          assert.equal(ledger.episodes[0].dashboard_status, "已发布");
          assert.equal(ledger.episodes[0].status, fixture.episode.status);
          assert.equal(ledger.episodes[0].notes, fixture.episode.notes);
          assert.deepEqual(ledger.episodes[1], { ep: 5, slug: "other", output: "unchanged.mp4" });
          if (mode === "review") assert.equal(saved.publish_output, null);
          reachedEnd = true;
        }
      },
    });
    assert.equal(reachedEnd, true);
    const before = fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" });
    const indexBefore = fs.readFileSync(fixture.indexPath, { encoding: "utf8" });
    courseVideo.executeCourseStep(plan.finalSteps.find((step) => step.type === "record-output"), plan);
    assert.equal(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" }), before);
    assert.equal(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }), indexBefore);
  });
}

test("最终视频解码失败时不登记输出、不进入发布检查", (t) => {
  const fixture = outputRecordFixture(t, "publish");
  const plan = createCourseVideoPlan(fixture.index, "publish", { rootDir: fixture.rootDir });
  const indexBefore = fs.readFileSync(fixture.indexPath, { encoding: "utf8" });
  const ledgerBefore = fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" });
  assert.throws(() => runCourseVideoPlan(plan, {
    verifyInputs: () => {},
    canReuseAct: () => true,
    executeStep: (step) => {
      if (step.type === "decode") {
        courseVideo.executeCourseStep(step, plan, {
          spawnSyncImpl: () => ({ status: 1 }),
        });
      }
      assert.ok(!["record-output", "release-check", "qc-report"].includes(step.type));
    },
  }), /decode.*失败/);
  assert.equal(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }), indexBefore);
  assert.equal(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" }), ledgerBefore);
});

test("登记拒绝未生成或时长不符的视频，不篡改已有索引和台账", (t) => {
  const fixture = outputRecordFixture(t, "review");
  const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });
  const step = plan.finalSteps.find((item) => item.type === "record-output");
  assert.ok(step, "编排必须包含登记步骤");
  const indexBefore = fs.readFileSync(fixture.indexPath, { encoding: "utf8" });
  const ledgerBefore = fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" });
  assert.throws(() => courseVideo.executeCourseStep(step, plan), /不存在或为空/);
  fs.mkdirSync(path.dirname(plan.finalOutput), { recursive: true });
  fs.copyFileSync(fixture.video, plan.finalOutput);
  fs.writeFileSync(path.join(fixture.rootDir, fixture.index.timeline_summary),
    JSON.stringify({ total_s: 5 }), { encoding: "utf8" });
  assert.throws(() => courseVideo.executeCourseStep(step, plan), /时长/);
  assert.equal(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }), indexBefore);
  assert.equal(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" }), ledgerBefore);
});

test("同版本已有正式发布输出时，重跑 review 不回退台账发布路径", (t) => {
  const fixture = outputRecordFixture(t, "review");
  const published = fixtureIndex().publish_output;
  const publishedFile = path.join(fixture.rootDir, published);
  fs.mkdirSync(path.dirname(publishedFile), { recursive: true });
  fs.copyFileSync(fixture.video, publishedFile);
  const stored = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  stored.publish_output = published;
  stored.publish_spec.duration_s = 0.4;
  fs.writeFileSync(fixture.indexPath, JSON.stringify(stored), { encoding: "utf8" });
  const ledger = JSON.parse(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" }));
  ledger.episodes[0].output = published;
  ledger.episodes[0].duration_s = 0.4;
  fs.writeFileSync(fixture.ledgerPath, JSON.stringify(ledger), { encoding: "utf8" });
  const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });
  fs.copyFileSync(fixture.video, plan.finalOutput);

  courseVideo.executeCourseStep(plan.finalSteps.find((step) => step.type === "record-output"), plan);

  const saved = JSON.parse(fs.readFileSync(fixture.indexPath, { encoding: "utf8" }));
  assert.equal(saved.review_output, fixtureIndex().review_output);
  assert.equal(saved.publish_output, published);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(fixture.ledgerPath, { encoding: "utf8" })),
    ledger,
  );
});
