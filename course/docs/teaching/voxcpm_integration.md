# VoxCPM2 调用与排错

本仓库使用固定版本的 `voxcpm` 安装包，不需要另一个项目的目录结构。安装、模型下载、参考音配对和环境变量见 [安装与配置](../common/setup.md)。

生产入口是 `npm run voiceover -- <参数>`。四幕使用重复的 `--job <正式 JSON> <原始 WAV 目录>` 一次加载模型；调用时使用同一参考音及准确文本。`reference_wav_path` 提供音色参考，`prompt_wav_path` 与 `prompt_text` 提供精确的续写参考；具体代码在 `pipeline/02_audio/voxcpm_tts.py`。

Windows 配音先导入 torch，再导入音频处理依赖；Numba 缓存固定到仓库 `.cache/numba`。各阶段保留超时和日志，不使用后台启动绕过异常。

模型加载可能有较高内存峰值。失败时先读取第一幕原始音频目录里的 `voxcpm_run.log`，确定失败在依赖导入、模型加载还是某句生成；不能仅凭 GPU 占用判断原因，也不能把本机实测值当成所有机器的硬门槛。

逐句 WAV 为原始素材。正式语速由 `course_audio.mjs --speed 1.15` 在拼接后处理，并按最终实际时长同步缩放 timings。字幕单元在父音频边界内按文字权重估算，不是逐字声学强制对齐。
