// 用途：验证分发技能复用固定 CLI 版本，并能在 Windows 启动依赖安装入口。
// 运行：node --test build/skill_helpers.test.mjs
// 依赖：Node.js 及其自带 npm；安装测试仅执行 npm --version，不下载依赖。
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHyperframesPlan } from "./hyperframes_hidden.mjs";

const version = createHyperframesPlan(["lint", "."]).args.find(arg => arg.startsWith("hyperframes@")).split("@")[1];
for (const skill of ["hyperframes", "hyperframes-animation", "hyperframes-creative"]) {
  const loader = new URL(`../.agents/skills/${skill}/scripts/package-loader.mjs`, import.meta.url);
  test(`${skill} 辅助工具使用项目固定的 HyperFrames 版本`, async () => {
    const { hyperframesPackageSpec } = await import(loader.href);
    assert.equal(hyperframesPackageSpec("@hyperframes/core"), `@hyperframes/core@${version}`);
  });
  test(`${skill} 在 Windows 使用 Node 启动 npm 安装入口`, { skip: process.platform !== "win32" }, () => {
    const script = `
import assert from 'node:assert/strict';
import path from 'node:path';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
const originalSpawn=childProcess.spawnSync;
childProcess.spawnSync=(command,args)=>{
  assert.equal(command,process.execPath);
  assert.equal(args[0],path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'));
  assert.ok(args.includes('--ignore-scripts'));
  const result=originalSpawn(command,[args[0],'--version'],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  console.log('npm-version='+result.stdout.trim());
  return {status:43};
};
syncBuiltinESMExports();
const {importPackagesOrBootstrap}=await import(${JSON.stringify(loader.href)});
await importPackagesOrBootstrap(['course-video-bootstrap-test-missing'],{npmPackages:['course-video-bootstrap-test-missing@0.0.0']});
`;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: path.dirname(fileURLToPath(import.meta.url)), encoding: "utf8", windowsHide: true,
      env: { ...process.env, HYPERFRAMES_SKILL_DEPS_BOOTSTRAPPED: "", HYPERFRAMES_SKILL_BOOTSTRAP_DEPS: "1" },
    });
    assert.equal(result.status, 43, result.stderr);
    assert.match(result.stdout, /npm-version=\d+\.\d+\.\d+/);
  });
}
