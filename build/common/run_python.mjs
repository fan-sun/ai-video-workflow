// 用途：使用配置的 Python 解释器运行配音和 Python 测试。
// 运行：node --env-file-if-exists=.env build/common/run_python.mjs <Python 参数...>
// 依赖：Node.js 和 COURSE_PYTHON 指定的解释器。
import { spawnSync } from "node:child_process";

const python = process.env.COURSE_PYTHON || "python";
const result = spawnSync(python, process.argv.slice(2), {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
});
if (result.error) console.error(`Python 启动失败：${python}；${result.error.message}`);
process.exitCode = result.status ?? 1;
