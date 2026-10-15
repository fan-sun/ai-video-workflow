import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("环境检查列出缺失模型并非零退出，不导入真实模型", () => {
  const result = spawnSync(process.execPath, ["build/common/doctor.mjs"], {
    cwd: new URL("../../", import.meta.url), encoding: "utf8",
    env: { ...process.env, VOXCPM_MODEL: "missing-model-for-test", VOXCPM_REF_WAV: "missing-ref.wav",
      VOXCPM_REF_TEXT_FILE: "missing-ref.txt" }, windowsHide: true,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /模型.*不存在/);
  assert.match(result.stdout + result.stderr, /参考/);
});
