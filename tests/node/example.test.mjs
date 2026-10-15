import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeActHtml } from "../../examples/context-window/visuals.mjs";

test("生成的示例 HTML 可执行字幕动画并正确显示定点高亮", () => {
  const timing = { total: 8, phrases: [{ start: 0, dur: 3 }, { start: 3.1, dur: 4.9 }] };
  const html = makeActHtml(1, timing).replace("/*__SUBS__*/", 'const SUBS=[{s:0,e:3,t:"今天学习**上下文窗口**"}];');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].at(-1)[1];
  const subtitles = [];
  const timeline = { fromTo() {}, to() {} };
  const sandbox = { gsap: { timeline: () => timeline }, window: {}, document: {
    createElement: () => ({}), getElementById: () => ({ appendChild: element => subtitles.push(element) }),
  } };
  vm.runInNewContext(script, sandbox);
  assert.match(subtitles[0].innerHTML, /今天学习<span class="hl">上下文窗口<\/span>/u);
  assert.equal(sandbox.window.__timelines.main, timeline);
});

test("示例在指定隔离目录生成四幕，重跑不占用正式台账、不伪造确认", () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "course-example-"));
  try {
    const run = () => spawnSync(process.execPath, ["examples/context-window/run.mjs", "prepare"], {
      cwd: new URL("../../", import.meta.url), encoding: "utf8", windowsHide: true,
      env: { ...process.env, COURSE_EXAMPLE_DIR: work },
    });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const index = JSON.parse(fs.readFileSync(path.join(work, "course/episodes/01-context-window/制作索引.json"), "utf8"));
    assert.equal(index.acts.length, 4);
    assert.equal(index.production_contract, "current");
    assert.equal(index.review_approval, null);
    assert.equal(index.audio_review, null);
    for (const act of index.acts) {
      const script = JSON.parse(fs.readFileSync(path.join(work, act.script), "utf8"));
      assert.equal(script.segments.length, 2);
      assert.equal(script.segments.at(-1).pause_after, 0);
    }
    const preview = JSON.parse(fs.readFileSync(path.join(work, index.split_preview), "utf8"));
    assert.equal(preview.acts.length, 4);
    const copiedTool = path.join(work, "build/common/doctor.mjs");
    fs.writeFileSync(copiedTool, "旧的工具副本", "utf8");
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(copiedTool, "utf8"), fs.readFileSync(new URL("../../build/common/doctor.mjs", import.meta.url), "utf8"));
    const ledger = JSON.parse(fs.readFileSync(path.join(work, "course/episodes.json"), "utf8"));
    assert.equal(ledger.episodes.length, 1);
    assert.equal(ledger.episodes[0].publish_status, "未发布");
    const relativePython = spawnSync(process.execPath, ["examples/context-window/run.mjs", "audio"], {
      cwd: new URL("../../", import.meta.url), encoding: "utf8", windowsHide: true,
      env: { ...process.env, COURSE_EXAMPLE_DIR: work, COURSE_PYTHON: "relative/missing-python.exe" },
    });
    assert.notEqual(relativePython.status, 0);
    const expectedPython = path.join(fileURLToPath(new URL("../../", import.meta.url)), "relative/missing-python.exe").replaceAll("\\", "/");
    assert.ok(relativePython.stderr.replaceAll("\\", "/").includes(expectedPython), relativePython.stderr);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});
