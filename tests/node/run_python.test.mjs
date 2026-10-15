import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("Python 入口显式解释器无效时非零退出并保留错误", () => {
  const result = spawnSync(process.execPath, ["build/common/run_python.mjs", "--version"], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8", windowsHide: true,
    env: { ...process.env, COURSE_PYTHON: "missing-python-for-test" },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Python.*missing-python-for-test/);
});
