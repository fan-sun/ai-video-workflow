# 共用安装与配置

支持 Windows + Git Bash + NVIDIA GPU。安装命令在仓库根目录使用 Git Bash；npm run 也可由 PowerShell 启动，内部渲染仍使用 Git Bash。

## 公共环境

准备 Node.js 22.9 以上、Git、FFmpeg（含 ffprobe）、Chrome 和可运行的 Python。Node、Git、FFmpeg 须可从终端调用；默认使用 NVENC，当前生产入口不自动回退 CPU。具体配音或音乐素材由所属路线配置。

首次复制配置，已有 .env 时只检查字段，不能覆盖：

```bash
cp .env.example .env
```

COURSE_PYTHON 指向所选路线可用的 Python。Git Bash 默认从 Git 安装位置定位，特殊位置填写 COURSE_GIT_BASH；Chrome 可设 CHROME_PATH，封面浏览器可设 COURSE_COVER_CHROME。未填写时搜索 HyperFrames 缓存和标准安装目录，显式路径不存在直接报错。路径可相对仓库或绝对，含空格加双引号；个人路径、模型和密钥不提交。

可选 SILICONFLOW_API_KEY 用于语义相关提醒，缺少时仍能精确查重及 BM25，需按[查重规则](topic_selection.md)记录缺项。

所有 npm run 入口读取 .env 并传给子进程。直接运行 Node/Python 不自动读取 .env；Node 加 --env-file-if-exists=.env，Python 显式传配置或使用 npm 包装入口。

## 路线配置与示例入口

- [教学配音环境、doctor 和短示例](../teaching/voxcpm_integration.md#安装与模型配置)。
- [Vibe 环境与固定配乐准备](../vibe/sop.md#从这里开始)。

按所选路线检查，不把另一条路线的可选组件当作必装依赖。doctor 的探测不等于实际生产验证，示例不等于正式内容获确认。

## 渲染依赖

首次运行固定版本 hyperframes@0.6.113 下载依赖和浏览器；模板使用固定版本 GSAP CDN，当前运行仍需联网，未提供离线资源包。

仅缺 Chrome 时，可先运行以下命令安装 CLI，再按其浏览器提示安装 Chromium，也可配置本机 Chrome：

```bash
node --env-file-if-exists=.env build/common/hyperframes_hidden.mjs lint templates/course-explainer-3x4
```

上面仅借用现有模板初始化工具，不决定正式视频路线。通用开发检查为 npm test 和 npm run test:python；正式渲染的 GPU smoke 和验收按[共同渲染规范](render_verification.md)。
