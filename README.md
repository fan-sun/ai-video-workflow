# AI Video Workflow · AI知识视频制作流程

把一个知识点、术语或当前热点词制作成视频。仓库提供两条路线：

| 路线 | 默认视频 | 制作重点 | 入口 |
|---|---|---|---|
| 教学 | 3:4竖屏，有旁白 | 理解并学会知识或操作，配音时间驱动画面 | [主SOP](course/docs/sop.md) |
| Vibe知识讲解 | 16:9横屏，先无人声旁白 | 连续动画、完整屏幕文字、动作声与音乐，阅读和动作决定节奏 | [Vibe流程](course/docs/vibe_workflow.md) |

两条路线输出审片版、高清发布视频、独立封面和发布文案。主题与路线分别选择，AI、历史、心理等内容不固定对应某条路线。

这是 AI 助手按 SOP 执行的制作仓库。选题调研、写稿、事实核验及场景设计由助手完成；脚本负责切分、配音、时间轴、检查和渲染。内容、试听、风格、封面及审片确认仍由用户完成。

## 开始使用

获取项目并进入目录：

```bash
git clone https://github.com/fan-sun/ai-video-workflow.git
cd ai-video-workflow
```

先用短示例验证环境，再用自己选定的主题制作正式课程。下面所有命令都在本仓库根目录执行。`npm run` 命令可在 PowerShell 或 Git Bash 中运行；渲染脚本内部需要已安装的 Git Bash。

### 1. 准备环境

首版支持 **Windows + NVIDIA GPU**。两条路线需要Node.js 22.9以上、Git（含Git Bash）、FFmpeg（含ffprobe）、Chrome及Python。教学配音另需Python 3.10～3.12、CUDA版PyTorch和`voxcpm==2.0.3`；只做无人声Vibe时不需要VoxCPM模型或参考声音。Node、Git和FFmpeg应能从终端启动。

只做Vibe可直接按[通用环境](course/docs/setup.md)安装渲染依赖，运行`npm run doctor -- --route vibe`，再看下面的Vibe示例；后面的声音配置用于教学路线。

按 [安装与配置](course/docs/setup.md) 安装 Python 依赖并下载完整的 VoxCPM2 模型；已有可用环境和模型可以直接复用。根项目无需运行 `npm install`，固定版本 HyperFrames CLI 的依赖在首次调用时下载。当前渲染还需联网加载固定版本 GSAP。

准备自己的参考录音 `voices/reference.wav` 和逐字对应的 UTF-8 文本 `voices/reference.txt`。复制 `.env.example` 为 `.env`，填写本机配置；已有 `.env` 时直接检查配置，不要覆盖：

```dotenv
COURSE_PYTHON="C:/path/to/voxcpm-env/python.exe"
VOXCPM_MODEL=models/VoxCPM2
VOXCPM_REF_WAV=voices/reference.wav
VOXCPM_REF_TEXT_FILE=voices/reference.txt
```

路径也可以指向已有文件的绝对位置。默认导入已安装的 VoxCPM 包；使用源码副本时才填写 `VOXCPM_SRC`。Chrome 通常自动定位，特殊安装可填写 `CHROME_PATH`；封面专用浏览器可另设 `COURSE_COVER_CHROME`。

```bash
npm run doctor
```

所有检查通过后继续。`doctor` 检查依赖和路径；实际模型生成、GPU 编码及发布包由下面的示例验证。

### 2. 跑通短示例

示例主题固定为 **“上下文窗口”**，成片约 35 秒。它自带四幕稿、画面及封面，使用你的参考声音生成旁白。严格按顺序运行，当前一步报错时先解决再继续：

```bash
npm run example -- prepare
npm run example -- audio
npm run example -- video
npm run example -- package
```

- `prepare`：创建示例工作区、四幕正式脚本、整期切分预览和制作索引。
- `audio`：生成四幕配音、1.15 倍速整轨及 timings，追加片尾静音，生成时间表。
- `video`：按实际音频构建画面，生成封面和审片版。
- `package`：生成发布文案和 1080×1440 高清视频，检查完整发布包。

默认结果位于 `.local/context-window/`：

| 产物 | 路径（相对于仓库根目录） |
|---|---|
| 审片版 | `.local/context-window/pipeline/output/course/ep01_context-window/v1/course_ep01_context-window_v1.mp4` |
| 高清发布版 | 同一目录下的 `course_ep01_context-window_v1_publish.mp4` |
| 发布文案 | 同一目录下的 `course_ep01_context-window_v1.txt` |
| 视频封面 / 平台封面 | `.local/context-window/course/episodes/01-context-window/cover.png` / `cover-2x.png` |
| 制作索引 | `.local/context-window/course/episodes/01-context-window/制作索引.json` |

示例台账独立，不占用正式第 1 期。它验证技术链路，不代表用户已试听、审片或公开发布；命令不上传到平台。重跑及输入变更的处理见 [示例说明](examples/context-window/README.md)。

### 3. 跑通无旁白Vibe短示例

示例固定为“沉没成本”，8秒、两段连续动画与屏幕文字、16:9视频和3:4独立封面。使用本地合成测试音，不需要声音克隆、音乐下载或API密钥。

```bash
npm run doctor -- --route vibe
npm run example:vibe -- prepare
npm run example:vibe -- video
npm run example:vibe -- mix
npm run example:vibe -- package
```

结果位于`.local/vibe-example/`，独立台账不会占用正式期号。完整路径、重跑边界及测试声音说明见[示例README](examples/vibe-knowledge/README.md)。示例验证工具链，动画质量与正式内容仍由用户审看。

### 4. 制作自己的Vibe知识视频

把主题和目标交给助手，例如：

> 按course/docs/sop.md选择Vibe路线，制作一条讲解“我的主题”的知识短片。先说明观看主线并写稿，确认后安排视觉时间，再逐幕制作。

也可以让助手选一个适合的主题并说明选择。实际流程及用户确认点见[Vibe制作规则](course/docs/vibe_workflow.md)，动作、运镜、背景与字幕要求见[动态画面设计](course/docs/vibe_motion_design.md)。常用入口：

```bash
npm run init:episode -- 03-topic-slug --topic "主题词" --route vibe
npm run timeline:vibe -- course/episodes/03-topic-slug/制作索引.json
npm run review -- course/episodes/03-topic-slug/制作索引.json
npm run preview:music -- course/episodes/03-topic-slug/制作索引.json
npm run mix -- course/episodes/03-topic-slug/制作索引.json
npm run publish:package -- course/episodes/03-topic-slug/制作索引.json
```

这些命令依次使用已经确认的稿件、实际视觉时间表、画面源及音量比例，不自动选题写稿。没有BGM时省略试听和混音。发布前需要用户确认最终完整审片版、选定独立封面并生成同版发布TXT；发布入口直接复用高清画面，通过路线验收后登记本地发布包，不上传平台。

### 5. 制作自己选定的教学视频

选题由用户决定，可以是基础知识、术语或近期受关注的热点概念。把主题及已有资料交给编码助手，例如：

> 按 `course/docs/sop.md`，制作一期讲解“我选择的主题”的教学视频。先给我选题概要，再按 SOP 执行。

助手入口是 [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md)。制作顺序为：选题查重与登记 → 写稿和切分确认 → 四幕配音与试听 → 风格与封面选择 → 画面与审片 → 高清发布包验收。详细规则及用户确认点由 [主 SOP](course/docs/sop.md) 统一维护。

下面是正式制作的常用入口，示意期号和 slug 需替换为实际值：

```bash
npm run topic:check -- --topic "主题词" --summary "核心问题和讲解角度"
npm run init:episode -- 01-topic-slug --topic "主题词"
```

`SILICONFLOW_API_KEY` 只用于可选的语义相关提醒。缺少 Key 时，查重命令退出码为 `3`：精确查重和 BM25 已执行，语义提醒未执行；记录缺项后可继续。重复主题退出码为 `2`，须先处理重复。完整规则见 [选题与标准路径](course/docs/topic_selection.md)。

配音和画面齐备、SOP 前置确认完成后：

```bash
npm run review -- course/episodes/01-topic-slug/制作索引.json
npm run publish:package -- course/episodes/01-topic-slug/制作索引.json
npm run check:release -- course/episodes/01-topic-slug/制作索引.json
```

`review` 和 `publish:package` 处理画面及视频，不会自动写稿或生成配音。正式配音命令见 [配音流程](course/docs/voiceover.md)。`publish:package` 已包含验收，单独的 `check:release` 用于后续复查。正式成片存放在 `pipeline/output/course/epNN_slug/vK/`；对外发布由用户另行授权。

## 项目结构

```text
ai-video-workflow/
├── README.md                 使用入口
├── AGENTS.md / CLAUDE.md      编码助手执行规则
├── .env.example              本机配置模板
├── package.json              npm 命令入口
├── requirements-tts.txt      配音依赖版本
├── build/                    跨期通用工具和 Node 测试
├── course/
│   ├── docs/                 主 SOP、各阶段规则、风格目录
│   ├── episodes.json         正式制作台账（初始为空）
│   └── published-videos.json 已公开发布台账（初始为空）
├── pipeline/02_audio/        VoxCPM 调用脚本、术语读音映射
├── templates/                正文合成模板、A/B/C 固定开场、字体
├── examples/context-window/  教学短示例源码及运行器
├── examples/vibe-knowledge/  无旁白Vibe短示例源码及运行器
├── voices/README.md          用户参考声音的准备说明
├── .agents/skills/           助手使用的本地技能与辅助工具
└── tests/                    Python 测试及夹具
```

使用后会新增以下本地目录；它们由 Git 忽略，不属于分发源码：

| 路径 | 用途 |
|---|---|
| `.env`、`models/`、`voices/` 中的用户文件 | 本机配置、模型、参考声音与配对文本 |
| `.local/` | 隔离的示例工作区及本机辅助依赖 |
| `course/episodes/NN-slug/` | 本期索引、切分预览、时间表、封面和专用脚本 |
| `course/scripts/`、`course/acts/` | 正式讲解稿和画面源 |
| `pipeline/01_script/`、`pipeline/02_audio/NN-slug/` | 正式四幕 JSON、音频和 timings |
| `pipeline/build/`、`pipeline/output/` | 临时构建、版本成片、文案和验收报告 |
| `.cache/`、`node_modules/`、Python 虚拟环境 | 可重建的依赖和缓存 |
| `specs/` | 本地开发追踪文档 |

声音、模型、真实密钥、生成视频和单期素材均不提交。两份台账是随仓库分发的文件；制作后修改了它们，提交前应检查其中是否含个人课程记录或路径。

## 检查命令

```bash
npm test
npm run test:python
```

遇到依赖问题先运行 `npm run doctor`，再查 [安装与配置](course/docs/setup.md)；制作规则和返工起点查 [主 SOP](course/docs/sop.md)。
