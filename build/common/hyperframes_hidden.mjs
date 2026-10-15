#!/usr/bin/env node
/**
 * 用途：在 Windows 下隐藏 HyperFrames 子进程窗口，同时保留当前终端日志。
 * 运行：node build/common/hyperframes_hidden.mjs <lint|inspect|snapshot|render> <合成目录> [HyperFrames 参数]
 * 依赖：Node.js，以及随 Node 安装的 npm/npx。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "../..");
export const HYPERFRAMES_VERSION = "0.6.113";
const ALLOWED_COMMANDS = new Set(["lint", "inspect", "snapshot", "render"]);

export function createHyperframesPlan(argv, {
  rootDir = PROJECT_ROOT,
  execPath = process.execPath,
  npxCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
} = {}) {
  const [commandName, compositionDir, ...hyperframesArgs] = argv;
  if (!ALLOWED_COMMANDS.has(commandName)) {
    throw new Error("仅支持 lint、inspect、snapshot、render");
  }
  if (!compositionDir) {
    throw new Error("缺少合成目录");
  }

  return {
    command: execPath,
    args: [
      npxCli,
      "--yes",
      `hyperframes@${HYPERFRAMES_VERSION}`,
      commandName,
      ".",
      ...hyperframesArgs,
    ],
    options: {
      cwd: path.resolve(rootDir, compositionDir),
      windowsHide: true,
      shell: false,
      stdio: "inherit",
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
    },
  };
}

export function runHyperframesHidden(argv, dependencies = {}) {
  const plan = createHyperframesPlan(argv, dependencies);
  if (!fs.existsSync(plan.options.cwd) || !fs.statSync(plan.options.cwd).isDirectory()) {
    throw new Error(`合成目录不存在：${plan.options.cwd}`);
  }
  if (!fs.existsSync(plan.args[0])) {
    throw new Error(`找不到 npx 入口：${plan.args[0]}`);
  }

  const spawnSyncImpl = dependencies.spawnSyncImpl ?? spawnSync;
  const result = spawnSyncImpl(plan.command, plan.args, plan.options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`HyperFrames ${argv[0]} 失败，退出码 ${result.status}`);
  }
  return result.status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runHyperframesHidden(process.argv.slice(2));
  } catch (error) {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  }
}
