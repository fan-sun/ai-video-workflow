import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../build/common/hyperframes_hidden.mjs");
const hiddenRunner = fs.existsSync(scriptPath)
  ? await import(pathToFileURL(scriptPath).href)
  : {};

test("隐藏入口固定 HyperFrames 版本并隐藏 Windows 子进程窗口", () => {
  assert.equal(typeof hiddenRunner.createHyperframesPlan, "function");

  const plan = hiddenRunner.createHyperframesPlan(
    ["render", "pipeline/build/demo", "--output", "demo.mp4", "--workers", "2"],
    {
      rootDir: "E:/repo",
      execPath: "D:/Node/node.exe",
      npxCli: "D:/Node/node_modules/npm/bin/npx-cli.js",
    },
  );

  assert.equal(plan.command, "D:/Node/node.exe");
  assert.deepEqual(plan.args, [
    "D:/Node/node_modules/npm/bin/npx-cli.js",
    "--yes",
    "hyperframes@0.6.113",
    "render",
    ".",
    "--output",
    "demo.mp4",
    "--workers",
    "2",
  ]);
  assert.equal(plan.options.cwd, path.resolve("E:/repo", "pipeline/build/demo"));
  assert.equal(plan.options.windowsHide, true);
  assert.equal(plan.options.shell, false);
  assert.equal(plan.options.stdio, "inherit");
});

test("隐藏入口支持 lint、inspect、snapshot 和 render，并拒绝不存在的 check 命令", () => {
  assert.equal(typeof hiddenRunner.createHyperframesPlan, "function");

  for (const command of ["lint", "inspect", "snapshot", "render"]) {
    const plan = hiddenRunner.createHyperframesPlan([command, "pipeline/build/demo"], {
      rootDir: "E:/repo",
      execPath: "D:/Node/node.exe",
      npxCli: "D:/Node/node_modules/npm/bin/npx-cli.js",
    });
    assert.equal(plan.args[3], command);
  }

  assert.throws(
    () => hiddenRunner.createHyperframesPlan(["check", "pipeline/build/demo"], {
      rootDir: "E:/repo",
      execPath: "D:/Node/node.exe",
      npxCli: "D:/Node/node_modules/npm/bin/npx-cli.js",
    }),
    /仅支持 lint、inspect、snapshot、render/,
  );
});
