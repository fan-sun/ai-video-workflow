# 安装与配置

支持 Windows + Git Bash + NVIDIA GPU 的制作环境。以下安装命令使用 Git Bash，在仓库根目录执行；`npm run` 入口也可在 PowerShell 中运行，渲染脚本内部仍使用 Git Bash。先装 Node.js 22.9 以上、Git、FFmpeg（含 ffprobe）和 Chrome，确保 Node、Git、FFmpeg 能从终端启动。

无旁白的 Vibe 路线还需要可运行的 Python，但不需要安装 VoxCPM、下载声音模型或准备参考录音。可以跳过下面的配音环境，配置 `COURSE_PYTHON` 为自己的 Python 路径，运行 `npm run doctor -- --route vibe`，再按 [Vibe SOP](../vibe/sop.md) 制作。下面的声音克隆配置用于有旁白的教学路线。

Vibe正式制作还需要按[固定配乐配置](../vibe/sop.md#4-固定背景音乐与混音)准备本地音乐；音乐不随仓库分发，doctor也不检查该文件。技术示例使用测试音，只验证链路，不代表正式音乐已准备好。

## 配音环境

使用独立的 Python 3.10～3.12 环境，安装与 GPU/驱动匹配的 CUDA 版 PyTorch，再安装本项目固定的 VoxCPM 版本。已有可用环境可直接复用。

```bash
python -m pip install -r requirements-tts.txt
```

项目固定使用 `voxcpm==2.0.3`，调用 `VoxCPM.from_pretrained` 和声音克隆接口。安装依据见 [VoxCPM 官方发行页](https://pypi.org/project/voxcpm/2.0.3/)，PyTorch 安装见 [官方安装选择器](https://pytorch.org/get-started/locally/)。

将 [VoxCPM2 模型](https://huggingface.co/openbmb/VoxCPM2) 完整下载到 `models/VoxCPM2`，或在配置中指定已经存在的本地模型目录。下面命令使用安装 VoxCPM 时附带的模型下载依赖：

```bash
python -c "from modelscope import snapshot_download; snapshot_download('OpenBMB/VoxCPM2', local_dir='models/VoxCPM2')"
```

准备自己的参考 WAV 和逐字对应的 UTF-8 文本，放在 `voices/reference.wav`、`voices/reference.txt`。两个文件必须来自同一段录音；模型和声音文件均被 Git 忽略。

## 本机配置

```bash
cp .env.example .env
```

仅首次配置时复制；已有 `.env` 时检查字段，不覆盖原配置。

填写以下字段，路径可以是仓库内相对路径或绝对路径。含空格的路径用双引号包住：

```dotenv
COURSE_PYTHON="你的 VoxCPM 环境/python.exe"
VOXCPM_MODEL=models/VoxCPM2
VOXCPM_REF_WAV=voices/reference.wav
VOXCPM_REF_TEXT_FILE=voices/reference.txt
```

默认从安装包导入 VoxCPM。只有需要指定源码副本时才填写 `VOXCPM_SRC`，它必须指向包含 `voxcpm/` 的目录。Git Bash 默认由 Git 安装路径定位；特殊安装可填写 `COURSE_GIT_BASH`。Chrome 可通过 `CHROME_PATH` 指定；封面使用其他浏览器时另设 `COURSE_COVER_CHROME`。未填写时，封面与画面检查均搜索 HyperFrames 浏览器缓存和标准安装目录。显式配置的浏览器不存在时直接报错。

可选的 `SILICONFLOW_API_KEY` 只用于选题的语义相关提醒。缺少 Key 时精确查重和 BM25 仍可运行，但命令会明确报告语义提醒未执行。

所有 `npm run` 入口自动读取 `.env` 并传给子进程。直接运行 `node build/...` 或 Python 脚本不会自动读取 `.env`：Node 命令应加 `--env-file-if-exists=.env`；配音优先使用 `npm run voiceover -- ...`，或明确传入 Python 的命令参数和环境变量。默认制作使用 NVENC；首版没有自动回退 CPU 编码。

## 检查与使用

```bash
npm run doctor
npm test
npm run test:python
```

首次渲染会由固定版本 `hyperframes@0.6.113` 下载运行依赖及浏览器。模板的 GSAP 脚本来自固定版本 CDN，因此首次使用需要网络。
渲染时也需要能访问该 GSAP CDN；当前版本没有提供离线资源打包。

如果 doctor 只缺 Chrome，可先运行 `node --env-file-if-exists=.env build/common/hyperframes_hidden.mjs lint templates/course-explainer-3x4` 安装 CLI，再按 CLI 的浏览器提示安装 Chromium；也可直接配置本机 Chrome。

配置完成后从 [主 SOP](../sop.md) 制作正式课程，或运行 [短示例](../../../examples/context-window/README.md) 验证技术链路。doctor 不加载模型，实际配音与 GPU 编码由示例验证。
