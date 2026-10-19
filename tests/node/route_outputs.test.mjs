import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { initCourseEpisode } from "../../build/common/init_course_episode.mjs";
import { createCourseVideoPlan } from "../../build/common/course_video.mjs";

function fixture(t, route) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-output-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  initCourseEpisode(root, "01-demo", { route, topic: "示例" });
  const file = path.join(root, "course/episodes/01-demo/制作索引.json");
  const index = JSON.parse(fs.readFileSync(file, { encoding: "utf8" }));
  index.example = { technical_only: true };
  index.timeline_summary = "timeline.json";
  // 这里验证路径计划，专属契约由既有正式链路测试覆盖。
  delete index.production_contract;
  index.acts.forEach((act, i) => Object.assign(act, {
    visual_source: `a${i}.html`, visual_timing: `t${i}.json`,
    audio: `a${i}.wav`, timings: `t${i}.json`,
  }));
  if (route === "vibe") index.acts.forEach(act => fs.writeFileSync(path.join(root, act.visual_timing),
    JSON.stringify({ total_s: 3, source_text: "测试", captions: [{ id: "c1", start: 0, end: 3, text: "测试" }] }),
    { encoding: "utf8" }));
  return { root, index, file };
}

for (const [route, folder] of [["course", "teaching"], ["vibe", "vibe"]]) {
  test(`新建${route}审片和发布使用${folder}目录`, t => {
    const { root, index } = fixture(t, route);
    const review = createCourseVideoPlan(index, "review", { rootDir: root });
    assert.equal(review.finalOutput, path.join(root, `pipeline/output/${folder}/ep01_demo/v1/course_ep01_demo_v1.mp4`));
    index.review_output = path.relative(root, review.finalOutput);
    index.cover_output = "cover.png";
    index.cover_selection = { id: "A" };
    index.publish_copy = `pipeline/output/${folder}/ep01_demo/v1/course_ep01_demo_v1.txt`;
    const publish = createCourseVideoPlan(index, "publish", { rootDir: root });
    assert.equal(publish.finalOutput, path.join(root, `pipeline/output/${folder}/ep01_demo/v1/course_ep01_demo_v1_publish.mp4`));
    if (route === "vibe") {
      assert.equal(publish.finalSteps.find(s => s.type === "copy-cover").output,
        path.join(root, "pipeline/output/vibe/ep01_demo/v1/cover.png"));
    }
  });
}

test("已有course路径的Vibe版本继续使用历史根目录，换版不覆盖旧版本", t => {
  const { root, index } = fixture(t, "vibe");
  index.review_base_output = "pipeline/output/course/ep01_demo/v1/course_ep01_demo_v1.mp4";
  index.review_output = "pipeline/output/course/ep01_demo/v1/course_ep01_demo_v1_bgm25.mp4";
  index.current_version = "v2";
  assert.equal(createCourseVideoPlan(index, "review", { rootDir: root }).finalOutput,
    path.join(root, "pipeline/output/course/ep01_demo/v2/course_ep01_demo_v2.mp4"));
});

test("新建Vibe换版仍在Vibe目录，底片和配乐版不会混用", t => {
  const { root, index } = fixture(t, "vibe");
  index.review_base_output = "pipeline/output/vibe/ep01_demo/v1/course_ep01_demo_v1.mp4";
  index.review_output = "pipeline/output/vibe/ep01_demo/v1/course_ep01_demo_v1_bgm25.mp4";
  index.current_version = "v2";
  assert.equal(createCourseVideoPlan(index, "review", { rootDir: root }).finalOutput,
    path.join(root, "pipeline/output/vibe/ep01_demo/v2/course_ep01_demo_v2.mp4"));
});

test("明确登记到另一条路线的目录时在生成计划前拒绝", t => {
  for (const [route, wrongFolder] of [["course", "vibe"], ["vibe", "teaching"]]) {
    const { root, index } = fixture(t, route);
    index.review_output = `pipeline/output/${wrongFolder}/ep01_demo/v1/review.mp4`;
    assert.throws(() => createCourseVideoPlan(index, "review", { rootDir: root }), /输出目录.*路线/u);
  }
});

test("路线命令拒绝另一条路线，不改写索引或启动渲染", t => {
  const { root, index, file } = fixture(t, "vibe");
  fs.writeFileSync(file, JSON.stringify(index), { encoding: "utf8" });
  const before = fs.readFileSync(file);
  const result = spawnSync(process.execPath,
    [path.resolve("build/common/route_command.mjs"), "course", "review", file],
    { cwd: root, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /路线不匹配/u);
  assert.deepEqual(fs.readFileSync(file), before);
  assert.equal(fs.existsSync(path.join(root, "pipeline/build")), false);
});

test("路线命令初始化真实隔离期次，并拒绝覆盖已有路线", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "route-init-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.resolve("build/common/route_command.mjs");
  const run = route => spawnSync(process.execPath, [cli, route, "init", "01-demo", "--topic", "测试"],
    { cwd: root, encoding: "utf8", windowsHide: true });
  const first = run("vibe");
  assert.equal(first.status, 0, first.stderr);
  const file = path.join(root, "course/episodes/01-demo/制作索引.json");
  assert.equal(JSON.parse(fs.readFileSync(file, { encoding: "utf8" })).route, "vibe");
  assert.equal(run("vibe").status, 0);
  const changed = run("course");
  assert.equal(changed.status, 1);
  assert.match(changed.stderr, /路线不同/u);
});

test("两条命令映射到共用工具并原样传递局部参数", async t => {
  const { createRouteCommand } = await import("../../build/common/route_command.mjs");
  const { root, file, index } = fixture(t, "vibe");
  fs.writeFileSync(file, JSON.stringify(index), { encoding: "utf8" });
  const plan = createRouteCommand("vibe", "review", [file, "--act", "2", "--range", "0:3"], { rootDir: root });
  assert.equal(plan.args[0], "--env-file-if-exists=.env");
  assert.match(plan.args[1], /course_video\.mjs$/u);
  assert.deepEqual(plan.args.slice(2), ["review", file, "--act", "2", "--range", "0:3"]);
  assert.throws(() => createRouteCommand("vibe", "unknown", [file]), /操作/u);
});
