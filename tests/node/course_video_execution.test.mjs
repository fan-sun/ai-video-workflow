import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { injectCourseChapterProgressHtml } from "../../build/teaching/course_chapter_progress.mjs";

import {
  canReuseCourseAct,
  createCourseVideoPlan,
  executeCourseStep,
  markCourseActComplete,
  parseCourseWarnings,
  prepareCourseAct,
} from "../../build/common/course_video.mjs";

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { encoding: "utf8" });
}

function createProjectFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-video-"));
  write(path.join(rootDir, "templates/course-explainer-3x4/package.json"), '{"scripts":{}}\n');
  write(path.join(rootDir, "templates/course-explainer-3x4/fonts/NotoSansSC-400.woff2"), "font400");
  write(path.join(rootDir, "templates/course-explainer-3x4/fonts/NotoSansSC-700.woff2"), "font700");
  write(path.join(rootDir, "templates/course-explainer-3x4/assets/red-maple-leaf.png"), "leaf");
  write(path.join(rootDir, "course/episodes/04-prompt/cover.png"), "cover");
  const acts = [1, 2, 3, 4].map((act) => {
    write(
      path.join(rootDir, `course/acts/ep04_prompt/act${act}.html`),
      '<html><head></head><body><div id="root" data-composition-id="main"><script>/*__SUBS__*/</script></div></body></html>',
    );
    write(
      path.join(rootDir, `audio/act${act}_timings.json`),
      JSON.stringify({ phrases: [{ id: "g01", start: 0, end: 1, text: "任务委托书" }] }),
    );
    write(path.join(rootDir, `audio/act${act}.wav`), "wav");
    return {
      act,
      audio: `audio/act${act}.wav`,
      timings: `audio/act${act}_timings.json`,
      visual_source: `course/acts/ep04_prompt/act${act}.html`,
      subtitle_highlights: ["任务委托书"],
      allowed_warnings: { gsap_studio_edit_blocked: 1, wcag_aa_contrast: 0 },
    };
  });
  const index = {
    episode: "ep04",
    slug: "prompt",
    current_version: "v1",
    timeline_summary: "course/episodes/04-prompt/整期时间表.json",
    publish_spec: { fps: 30 },
    review_output: "output/review.mp4",
    publish_output: "output/publish.mp4",
    cover_output: "course/episodes/04-prompt/cover.png",
    cover_embed: { duration_s: 0.5 },
    acts,
  };
  return { rootDir, index };
}

test('分幕截图和视频素材进入构建目录并参与输入签名', t => {
  const { rootDir, index } = createProjectFixture();
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const asset = 'course/episodes/04-prompt/source-assets/comment.png';
  write(path.join(rootDir, asset), '真实截图素材');
  index.acts[0].visual_assets = [asset];
  const plan = createCourseVideoPlan(index, 'review', { rootDir, act: 1 });
  const act = plan.acts[0];
  assert.ok(act.inputs.includes(path.join(rootDir, asset)));
  prepareCourseAct(act, plan);
  assert.equal(fs.readFileSync(path.join(act.buildDir, 'assets/comment.png'), { encoding: 'utf8' }), '真实截图素材');
});

test("章节标题按 HTML 与脚本上下文分别转义，重复注入保持幂等", () => {
  const source = '<html><head></head><body><main id="root" data-composition-id="main"></main></body></html>';
  const chapter = {
    titles: ["</script><script>alert(1)</script>", "第二章", "第三章", "第四章"],
    totalS: 40,
    acts: [
      { startS: 0, endS: 10 }, { startS: 10, endS: 20 },
      { startS: 20, endS: 30 }, { startS: 30, endS: 40 },
    ],
    startS: 0, endS: 10, introEndS: 2,
  };
  const injected = injectCourseChapterProgressHtml(source, chapter);
  assert.doesNotMatch(injected, /<\/script><script>alert/);
  assert.match(injected, /&lt;\/script&gt;&lt;script&gt;/);
  assert.match(injected, /\\u003c\/script>/);
  assert.equal(injectCourseChapterProgressHtml(injected, chapter), injected);
});

test("章节标题初始深色，已播放的整片文字区盖浅灰滤镜", () => {
  const source = '<html><head></head><body><main id="root" data-composition-id="main"></main></body></html>';
  const chapter = {
    titles: ["第一章", "第二章", "第三章", "第四章"],
    totalS: 40,
    acts: [
      { startS: 0, endS: 10 }, { startS: 10, endS: 20 },
      { startS: 20, endS: 30 }, { startS: 30, endS: 40 },
    ],
    startS: 10, endS: 20, introEndS: 0,
  };

  const injected = injectCourseChapterProgressHtml(source, chapter);

  assert.match(injected, /id="course-chapter-played"[^>]*width:256px/);
  assert.match(injected, /timeline\.fromTo\("#course-chapter-played",[\s\S]*width:512/);
  assert.match(injected, /\.course-chapter-title\{[^}]*color:#19354b/);
  assert.match(injected, /#course-chapter-played\{[^}]*background:rgba\(192,198,198,\.48\)/);
  assert.equal((injected.match(/<span class="course-chapter-title"/g) ?? []).length, 4);
  assert.match(injected, /#course-chapter-fill\{[^}]*background:#ef6b6b/);
});

test("单行章节标题收紧排版，双行标题保留原排版", () => {
  const source = '<html><head></head><body><main id="root" data-composition-id="main"></main></body></html>';
  const chapter = {
    titles: ["共同连接规则", "谁负责接线", "能力怎样交接", "连接后的判断"],
    totalS: 40,
    acts: [
      { startS: 0, endS: 10 }, { startS: 10, endS: 20 },
      { startS: 20, endS: 30 }, { startS: 30, endS: 40 },
    ],
    startS: 0, endS: 10, introEndS: 0,
  };
  const compact = injectCourseChapterProgressHtml(source, chapter);
  assert.match(compact, /id="course-chapter-hud" class="course-chapter-compact"/);
  assert.match(compact, /\.course-chapter-compact \.course-chapter-cells\{[^}]*height:60px/);
  assert.match(compact, /\.course-chapter-compact #course-chapter-played\{[^}]*height:60px/);
  assert.match(compact, /\.course-chapter-compact \.course-chapter-rail\{[^}]*top:66px/);
  assert.match(compact, /\.course-chapter-compact #course-chapter-leaf\{[^}]*top:44px/);
  const wrapped = injectCourseChapterProgressHtml(source, {
    ...chapter,
    titles: ["正在建立用于不同系统之间互相连接的规则", ...chapter.titles.slice(1)],
  });
  assert.doesNotMatch(wrapped, /class="course-chapter-compact"/);
});

test("红叶在文字覆盖层之上完整显示", () => {
  const source = '<html><head></head><body><main id="root" data-composition-id="main"></main></body></html>';
  const chapter = {
    titles: ["第一章", "第二章", "第三章", "第四章"],
    totalS: 40,
    acts: [
      { startS: 0, endS: 10 }, { startS: 10, endS: 20 },
      { startS: 20, endS: 30 }, { startS: 30, endS: 40 },
    ],
    startS: 10, endS: 20, introEndS: 0,
  };

  const injected = injectCourseChapterProgressHtml(source, chapter);

  assert.match(injected, /#course-chapter-leaf\{[^}]*z-index:3/);
  assert.match(injected, /#course-chapter-leaf\{[^}]*top:64px;width:52px;height:52px/);
});

test("新期次从真实时间表建立四幕连续章节进度，并按开场实际结束时间显示", () => {
  const fixture = createProjectFixture();
  try {
    fixture.index.episode = "ep23";
    fixture.index.chapter_titles = [
      "订单函数选择与执行流程", "读懂函数说明书", "请求参数与交接", "核对执行与结果",
    ];
    write(
      path.join(fixture.rootDir, fixture.index.timeline_summary),
      JSON.stringify({
        total_s: 60,
        acts: [
          { act: 1, start_s: 0, end_s: 10, duration_s: 10 },
          { act: 2, start_s: 10, end_s: 30, duration_s: 20 },
          { act: 3, start_s: 30, end_s: 42, duration_s: 12 },
          { act: 4, start_s: 42, end_s: 60, duration_s: 18 },
        ],
      }),
    );
    write(
      path.join(fixture.rootDir, fixture.index.acts[0].visual_source),
      '<html><head></head><body><main id="root" data-composition-id="main"><div id="opening" class="clip" data-duration="2.7"></div><script>/*__SUBS__*/</script></main></body></html>',
    );
    for (const [index, total] of [10, 20, 12, 18].entries()) {
      write(path.join(fixture.rootDir, fixture.index.acts[index].timings), JSON.stringify({
        total, phrases: [{ id: "g01", start: 0, end: 1, text: "任务委托书" }],
      }));
    }

    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });
    assert.ok(plan.acts.every((act) => act.prepare.chapter), "新期次每幕都须带章节进度数据");
    assert.equal(plan.acts[0].prepare.chapter.introEndS, 2.7);
    assert.deepEqual(plan.acts.map((act) => act.prepare.chapter.startS), [0, 10, 30, 42]);
    assert.deepEqual(plan.acts.map((act) => act.prepare.chapter.endS), [10, 30, 42, 60]);
    assert.ok(plan.acts.every((act) => act.inputs.includes(path.join(fixture.rootDir, fixture.index.timeline_summary))));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("新期次拒绝与正式 timings 不符的章节时间，单幕只要求该幕已制作", () => {
  const fixture = createProjectFixture();
  try {
    fixture.index.episode = "ep23";
    fixture.index.chapter_titles = ["第一章", "第二章", "第三章", "第四章"];
    write(path.join(fixture.rootDir, fixture.index.timeline_summary), JSON.stringify({
      total_s: 60,
      acts: [
        { act: 1, start_s: 0, end_s: 10 },
        { act: 2, start_s: 10, end_s: 30 },
        { act: 3, start_s: 30, end_s: 42 },
        { act: 4, start_s: 42, end_s: 60 },
      ],
    }));
    write(path.join(fixture.rootDir, fixture.index.acts[0].visual_source),
      '<html><head></head><body><main id="root" data-composition-id="main"><div id="opening" data-duration="2"></div></main></body></html>');
    for (const [index, total] of [10, 20, 12, 18].entries()) {
      write(path.join(fixture.rootDir, fixture.index.acts[index].timings), JSON.stringify({
        total, phrases: [{ id: "g01", start: 0, end: 1, text: "任务委托书" }],
      }));
    }
    assert.doesNotThrow(() => createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir }));
    write(path.join(fixture.rootDir, fixture.index.acts[1].timings), JSON.stringify({ total: 21 }));
    assert.throws(() => createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir }),
      /第二幕.*时间表.*timings/);
    assert.doesNotThrow(() => createCourseVideoPlan(fixture.index, "review", {
      rootDir: fixture.rootDir, act: 3,
    }));
    assert.throws(() => createCourseVideoPlan(fixture.index, "review", {
      rootDir: fixture.rootDir, act: 2,
    }), /第二幕.*时间表.*timings/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("新期次章节标题不允许首尾空白，以免画面与发布文案不一致", () => {
  const fixture = createProjectFixture();
  try {
    fixture.index.episode = "ep23";
    fixture.index.chapter_titles = [" 第一章", "第二章", "第三章", "第四章"];
    write(path.join(fixture.rootDir, fixture.index.timeline_summary), JSON.stringify({
      total_s: 40,
      acts: [
        { act: 1, start_s: 0, end_s: 10 },
        { act: 2, start_s: 10, end_s: 20 },
        { act: 3, start_s: 20, end_s: 30 },
        { act: 4, start_s: 30, end_s: 40 },
      ],
    }));
    assert.throws(() => createCourseVideoPlan(fixture.index, "review", {
      rootDir: fixture.rootDir, act: 2,
    }), /章节标题.*首尾空白/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("新期次的 review 与 publish 构建版都注入章节栏，旧期次保持原状", () => {
  const fixture = createProjectFixture();
  try {
    fixture.index.episode = "ep23";
    fixture.index.chapter_titles = [
      "订单函数选择与执行流程", "读懂函数说明书", "请求参数与交接", "核对执行与结果",
    ];
    write(
      path.join(fixture.rootDir, fixture.index.timeline_summary),
      JSON.stringify({
        total_s: 60,
        acts: [
          { act: 1, start_s: 0, end_s: 10, duration_s: 10 },
          { act: 2, start_s: 10, end_s: 30, duration_s: 20 },
          { act: 3, start_s: 30, end_s: 42, duration_s: 12 },
          { act: 4, start_s: 42, end_s: 60, duration_s: 18 },
        ],
      }),
    );
    write(
      path.join(fixture.rootDir, fixture.index.acts[0].visual_source),
      '<html><head></head><body><main id="root" data-composition-id="main"><div id="opening" class="clip" data-duration="2.7"></div><script>/*__SUBS__*/</script></main></body></html>',
    );
    for (const [index, total] of [10, 20, 12, 18].entries()) {
      write(path.join(fixture.rootDir, fixture.index.acts[index].timings), JSON.stringify({
        total, phrases: [{ id: "g01", start: 0, end: 1, text: "任务委托书" }],
      }));
    }
    for (const mode of ["review", "publish"]) {
      const plan = createCourseVideoPlan(fixture.index, mode, { rootDir: fixture.rootDir });
      prepareCourseAct(plan.acts[0], plan);
      prepareCourseAct(plan.acts[1], plan);
      const first = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), { encoding: "utf8" });
      const second = fs.readFileSync(path.join(plan.acts[1].buildDir, "index.html"), { encoding: "utf8" });
      assert.match(first, /id="course-chapter-hud"/);
      assert.match(first, /订单函数选择与执行流程/);
      assert.match(first, /introEndS":2\.7/);
      assert.match(second, /id="course-chapter-hud"/);
      assert.match(second, /startS":10/);
      assert.equal((first.match(/id="course-chapter-hud"/g) ?? []).length, 1);
      if (mode === "publish") assert.match(first, /id="cover-intro"/);
    }
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 生成字幕、复制模板资产并仅为第一幕注入封面", () => {
  const fixture = createProjectFixture();
  try {
    const plan = createCourseVideoPlan(fixture.index, "publish", { rootDir: fixture.rootDir });
    prepareCourseAct(plan.acts[0], plan);
    prepareCourseAct(plan.acts[1], plan);

    const act1 = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), { encoding: "utf8" });
    const act2 = fs.readFileSync(path.join(plan.acts[1].buildDir, "index.html"), { encoding: "utf8" });
    assert.match(act1, /const SUBS=/);
    assert.match(act1, /\*\*任务委托书\*\*/);
    assert.equal((act1.match(/id="cover-intro"/g) || []).length, 1);
    assert.doesNotMatch(act2, /cover-intro/);
    assert.equal(
      fs.readFileSync(path.join(plan.acts[0].buildDir, "assets/cover.png"), { encoding: "utf8" }),
      "cover",
    );
    assert.ok(fs.existsSync(path.join(plan.acts[0].buildDir, "fonts/NotoSansSC-400.woff2")));
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 向 main 主合成根节点注入封面", () => {
  const fixture = createProjectFixture();
  try {
    const source = path.join(fixture.rootDir, "course/acts/ep04_prompt/act1.html");
    write(source, '<html><head></head><body><main id="root" data-composition-id="main"><script>/*__SUBS__*/</script></main></body></html>');
    const plan = createCourseVideoPlan(fixture.index, "publish", { rootDir: fixture.rootDir });

    prepareCourseAct(plan.acts[0], plan);

    const act1 = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), { encoding: "utf8" });
    assert.equal((act1.match(/id="cover-intro"/g) || []).length, 1);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 重复执行保持单一字幕声明和封面层", () => {
  const fixture = createProjectFixture();
  try {
    const plan = createCourseVideoPlan(fixture.index, "publish", { rootDir: fixture.rootDir });
    prepareCourseAct(plan.acts[0], plan);
    const once = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), { encoding: "utf8" });
    prepareCourseAct(plan.acts[0], plan);
    const twice = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), { encoding: "utf8" });

    assert.equal(twice, once);
    assert.equal((twice.match(/const SUBS=/g) || []).length, 1);
    assert.equal((twice.match(/id="cover-intro"/g) || []).length, 1);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 将稳定英雄帧传给布局检查", () => {
  const fixture = createProjectFixture();
  try {
    const source = path.join(fixture.rootDir, "course/acts/ep04_prompt/act1.html");
    write(source, `<html><body><div id="root" data-composition-id="main">
      <script>
        const DUR=40;
        function push() {}
        push("#s0", "#s1", 10);
        push("#s1", "#s2", 25);
        /*__SUBS__*/
      </script>
    </div></body></html>`);
    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });

    prepareCourseAct(plan.acts[0], plan);

    const check = plan.acts[0].steps.find((step) => step.type === "check");
    assert.deepEqual(check.args.slice(-3), ["--", "--at", "8.8,23.8,38.8"]);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 发布版布局检查跳过封面覆盖时段", () => {
  const fixture = createProjectFixture();
  try {
    const source = path.join(fixture.rootDir, "course/acts/ep04_prompt/act1.html");
    write(source, `<html><head></head><body><div id="root" data-composition-id="main">
      <script>
        const DUR=2;
        function push() {}
        push("#s0", "#s1", 1.5);
        /*__SUBS__*/
      </script>
    </div></body></html>`);
    const plan = createCourseVideoPlan(fixture.index, "publish", { rootDir: fixture.rootDir });

    prepareCourseAct(plan.acts[0], plan);

    const check = plan.acts[0].steps.find((step) => step.type === "check");
    assert.deepEqual(check.args.slice(-3), ["--", "--at", "0.8"]);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("prepareCourseAct 按字幕 ID 定点高亮而不全局染色", () => {
  const fixture = createProjectFixture();
  try {
    const structured = [
      { unit_id: "g01", text: "任务", reason: "本幕指定锚点" },
      { unit_id: "g02", text: "词元", reason: "占位锚点 2" },
      { unit_id: "g03", text: "BPE", reason: "占位锚点 3" },
      { unit_id: "g04", text: "输入 Token", reason: "占位锚点 4" },
      { unit_id: "g05", text: "共享容量", reason: "占位锚点 5" },
      { unit_id: "g06", text: "提示词撰写视频", reason: "占位锚点 6" },
    ];
    fixture.index.acts.forEach((act) => { act.subtitle_highlights = []; });
    fixture.index.acts[0].subtitle_highlights = structured.slice(0, 1);
    fixture.index.acts[1].subtitle_highlights = structured.slice(1, 3);
    fixture.index.acts[2].subtitle_highlights = structured.slice(3, 5);
    fixture.index.acts[3].subtitle_highlights = structured.slice(5);
    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });

    prepareCourseAct(plan.acts[0], plan);

    const html = fs.readFileSync(path.join(plan.acts[0].buildDir, "index.html"), {
      encoding: "utf8",
    });
    assert.match(html, /\*\*任务\*\*委托书/);
    assert.doesNotMatch(html, /\*\*任务委托书\*\*/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("canReuseCourseAct 仅复用内容和验收配置未变且可完整解码的输出", () => {
  const fixture = createProjectFixture();
  try {
    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });
    const act = plan.acts[0];
    write(act.output, "video");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(act.output, future, future);
    markCourseActComplete(act);

    assert.equal(canReuseCourseAct(act, { spawnSyncImpl: () => ({ status: 0 }) }), true);
    assert.equal(canReuseCourseAct(act, { spawnSyncImpl: () => ({ status: 1 }) }), false);

    const later = new Date(Date.now() + 10000);
    fs.utimesSync(act.source, later, later);
    assert.equal(canReuseCourseAct(act, { spawnSyncImpl: () => ({ status: 0 }) }), true);

    write(act.source, "changed source");
    assert.equal(canReuseCourseAct(act, { spawnSyncImpl: () => ({ status: 0 }) }), false);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("字幕高亮等索引元数据变化后不得复用旧分幕", () => {
  const fixture = createProjectFixture();
  try {
    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });
    const act = plan.acts[0];
    write(act.output, "video");
    const future = new Date(Date.now() + 5000);
    fs.utimesSync(act.output, future, future);
    markCourseActComplete(act);
    act.subtitleHighlights.push("新高亮");

    assert.equal(canReuseCourseAct(act, { spawnSyncImpl: () => ({ status: 0 }) }), false);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("review 构建拒绝源 HTML 遗留封面层", () => {
  const fixture = createProjectFixture();
  try {
    const source = path.join(fixture.rootDir, "course/acts/ep04_prompt/act1.html");
    write(source, '<html><head></head><body><div id="root" data-composition-id="main"><img id="cover-intro" src="cover.png"><script>/*__SUBS__*/</script></div></body></html>');
    const plan = createCourseVideoPlan(fixture.index, "review", { rootDir: fixture.rootDir });

    assert.throws(() => prepareCourseAct(plan.acts[0], plan), /review.*封面层/);
  } finally {
    fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  }
});

test("executeCourseStep 为 concat 写 UTF-8 清单并使用 NVENC 重编码", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-concat-"));
  const calls = [];
  try {
    const output = path.join(rootDir, "output/final.mp4");
    const inputs = [path.join(rootDir, "act1.mp4"), path.join(rootDir, "act2.mp4")];
    executeCourseStep({ type: "concat", inputs, output }, { rootDir }, {
      spawnSyncImpl(command, args) {
        calls.push({ command, args });
        return { status: 0 };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "ffmpeg");
    assert.ok(calls[0].args.includes("h264_nvenc"));
    assert.ok(!calls[0].args.includes("copy"));
    const listFile = calls[0].args[calls[0].args.indexOf("-i") + 1];
    const list = fs.readFileSync(listFile, { encoding: "utf8" });
    assert.match(list, /file '.*act1\.mp4'/);
    assert.match(list, /file '.*act2\.mp4'/);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("executeCourseStep 拼接无声分幕时不映射不存在的音频流", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-silent-concat-"));
  const calls = [];
  try {
    const output = path.join(rootDir, "output/final.mp4");
    const inputs = [path.join(rootDir, "act1.mp4"), path.join(rootDir, "act2.mp4")];
    executeCourseStep({ type: "concat", inputs, output, audio: false }, { rootDir }, {
      spawnSyncImpl(command, args) {
        calls.push({ command, args });
        return { status: 0 };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "ffmpeg");
    assert.ok(!calls[0].args.includes("0:a:0"));
    assert.ok(!calls[0].args.includes("-c:a"));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("executeCourseStep 保留长任务标准输出且非零退出立即失败", () => {
  assert.throws(
    () => executeCourseStep(
      { type: "render", command: "npm", args: ["run", "render"] },
      { rootDir: process.cwd() },
      {
        spawnSyncImpl(_command, _args, options) {
          assert.equal(options.stdio, "inherit");
          assert.equal(options.timeout, undefined);
          return { status: 1 };
        },
      },
    ),
    /render.*退出码 1/,
  );
});

test("render 子进程早返回时先清理旧无声文件，再等待新输出落盘", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-render-output-wait-"));
  const silentFile = path.join(rootDir, "act1_silent_standard.mp4");
  try {
    write(silentFile, "stale-video");
    let waited = false;
    executeCourseStep(
      { type: "render", command: "npm", args: ["run", "render"], output: silentFile },
      { rootDir },
      {
        spawnSyncImpl() {
          assert.equal(fs.existsSync(silentFile), false, "启动新渲染前必须删除旧无声文件");
          return { status: 0 };
        },
        waitForRenderOutput(file) {
          assert.equal(file, silentFile);
          write(file, "new-video");
          waited = true;
        },
      },
    );
    assert.equal(waited, true);
    assert.equal(fs.readFileSync(silentFile, { encoding: "utf8" }), "new-video");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("Windows 执行边界能够真实启动 npm", { skip: process.platform !== "win32" }, () => {
  assert.doesNotThrow(() => executeCourseStep(
    { type: "npm-smoke", command: "npm.cmd", args: ["--version"] },
    { rootDir: process.cwd() },
  ));
});

test("executeCourseStep 的 qc-report 默认生成本地 HTML", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "course-qc-step-"));
  try {
    const timelineFile = path.join(rootDir, "timeline.json");
    write(timelineFile, JSON.stringify({
      acts: [
        { start_s: 0, end_s: 1 },
        { start_s: 1, end_s: 2 },
        { start_s: 2, end_s: 3 },
        { start_s: 3, end_s: 4 },
      ],
      total_s: 4,
    }));
    const outputDir = path.join(rootDir, "qc");
    executeCourseStep({
      type: "qc-report",
      videoFile: path.join(rootDir, "video.mp4"),
      outputDir,
      timelineFile,
      coverDurationS: 0.5,
      fps: 30,
    }, { rootDir }, {
      spawnSyncImpl(_command, args) {
        fs.writeFileSync(args.at(-1), "png");
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.ok(fs.existsSync(path.join(outputDir, "report.html")));
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("解析 HyperFrames warning 代码和 WCAG 数量", () => {
  const warnings = parseCourseWarnings(`
  ⚠ gsap_studio_edit_blocked: GSAP tweens target x
  ⚠ WCAG AA contrast warnings (15):
  `);

  assert.deepEqual(warnings, {
    gsap_studio_edit_blocked: 1,
    wcag_aa_contrast: 15,
  });
});

test("check 只允许基线内 warning，新增代码或数量增加时阻断", () => {
  const baseStep = {
    type: "check",
    command: "npm.cmd",
    args: ["run", "check"],
    allowedWarnings: { gsap_studio_edit_blocked: 1, wcag_aa_contrast: 15 },
  };
  const run = (stdout) => executeCourseStep(baseStep, { rootDir: process.cwd() }, {
    writeOutput: () => {},
    spawnSyncImpl: () => ({ status: 0, stdout, stderr: "" }),
  });

  assert.doesNotThrow(() => run("⚠ gsap_studio_edit_blocked: x\n⚠ WCAG AA contrast warnings (15):"));
  assert.throws(() => run("⚠ WCAG AA contrast warnings (16):"), /wcag_aa_contrast.*16.*15/);
  assert.throws(() => run("⚠ new_warning: x"), /new_warning.*1.*0/);
});
