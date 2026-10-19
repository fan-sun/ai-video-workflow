# VoxCPM2 调用与排错

本仓库使用固定版本的 `voxcpm` 安装包，不需要另一个项目的目录结构。公共依赖先按[安装与配置](../common/setup.md)准备，再完成下方教学配音配置。

生产入口是 `npm run voiceover -- <参数>`。四幕使用重复的 `--job <正式 JSON> <原始 WAV 目录>` 一次加载模型；调用时使用同一参考音及准确文本。`reference_wav_path` 提供音色参考，`prompt_wav_path` 与 `prompt_text` 提供精确的续写参考；具体代码在 `pipeline/02_audio/voxcpm_tts.py`。

Windows 配音先导入 torch，再导入音频处理依赖；Numba 缓存固定到仓库 `.cache/numba`。各阶段保留超时和日志，不使用后台启动绕过异常。

模型加载可能有较高内存峰值。失败时先读取第一幕原始音频目录里的 `voxcpm_run.log`，确定失败在依赖导入、模型加载还是某句生成；不能仅凭 GPU 占用判断原因，也不能把本机实测值当成所有机器的硬门槛。

逐句 WAV 为原始素材。正式语速由 `course_audio.mjs --speed 1.15` 在拼接后处理，并按最终实际时长同步缩放 timings。字幕单元在父音频边界内按文字权重估算，不是逐字声学强制对齐。

## 安装与模型配置

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

教学 .env 字段：

```dotenv
COURSE_PYTHON="你的 VoxCPM 环境/python.exe"
VOXCPM_MODEL=models/VoxCPM2
VOXCPM_REF_WAV=voices/reference.wav
VOXCPM_REF_TEXT_FILE=voices/reference.txt
```

默认从安装包导入 VoxCPM。只有需要指定源码副本时才填写 `VOXCPM_SRC`，它必须指向包含 `voxcpm/` 的目录。浏览器和 Git Bash 配置见共同安装文档。

教学配音优先使用 npm run voiceover 包装入口。配置后运行 npm run doctor；doctor 不加载模型，实际配音与 GPU 编码使用[教学短示例](../../../examples/context-window/README.md)验证。
