# 课程制作配音与时间轴


> 本文对应 [`sop.md`](../sop.md) 的“正式 JSON → 配音 → timings”阶段。新课程默认使用 VoxCPM；画面和字幕只能读取已验收的整轨音频与 timings。

## 一、当前主链

```text
四幕正式 course_epNN_actN.json
  ↓ voxcpm_tts.py（一次加载模型，连续处理四幕）
四幕逐句 <segment-id>.wav
  ↓ course_audio.mjs（裁切、拼接并统一为 1.15 倍速）
四份 1.15 倍速 actN.wav + 同步缩放的 actN_timings.json
  ↓ 四幕完成后统一交付用户试听
  ↓ 用户四幕试听确认
第四幕追加 1 秒静音收尾并同步 timings → 整期时间表
  ↓ 固定视频风格目录与本期封面候选，由用户分别选择
正式画面与字幕（读取已确认音频和 timings）
```

四类文件职责不同：

| 文件 | 作用 | 是否长期保留 |
|---|---|---|
| 正式 act JSON | 显示文本、朗读文本、停顿和字幕单元的唯一契约 | 是 |
| 逐句 WAV | VoxCPM 原始生成结果，供裁切和拼接 | 版本验收后可删除 |
| `actN.wav` | 本幕正式整轨配音，供视频 mux | 是 |
| `actN_timings.json` | 字幕和画面时间轴的正式依据 | 是 |
| `整期时间表.json` | 四幕起止时间、累计时长和分钟时间码 | 是 |

正式音频规格统一为：逐句 VoxCPM WAV 保持原生 48kHz；整轨 `actN.wav` 使用 1.15 倍速、48kHz、单声道、PCM 16-bit；最终视频使用 48kHz AAC。1.15 倍速改变时长但不主动升高音调。

`course/episodes/NN-<slug>/旁白切分预览.json` 长期保留，方便用户查看整期每个配音单位；每幕临时 `.preview.json` 可在正式化后删除。两者都只用于审阅，禁止传给 `voxcpm_tts.py`、`course_audio.mjs` 或正式合成。

## 二、正式 JSON 契约

正式文件推荐命名：

```text
pipeline/01_script/<NN-slug>/course_epNN_actN.json
```

每个 `segments[]` 至少包含：

```json
{
  "id": "g01",
  "text": "字幕显示和默认朗读文本。",
  "pause_after": 0.15
}
```

可选字段：

- `tts_text`：数字、英文发音形式、专名、双引号术语或特殊读法；正式化代码先应用 `pipeline/02_audio/tts_mappings.json`，未命中映射时 VoxCPM 使用 `tts_text ?? text`；
- `subtitle_units`：显式控制一条父音频内的字幕切分和朗读映射；
- `voice_id`：保留在数据中用于标识音色，当前脚本实际使用命令指定或默认参考音。

正式配音前检查：

- `id` 匹配 `[A-Za-z0-9_-]+`，整份文件内唯一；
- `text` 非空；存在 `tts_text` 时也必须非空；
- `text` 含中文或英文双引号时，必须显式提供删除双引号后的 `tts_text`；`tts_text` 本身不得残留双引号；
- 已知术语必须先应用 TTS 映射；未在映射表声明的英文不得删除、翻译或替换，配音入口会在模型加载前强制校验；
- 最后一个 segment 的 `pause_after` 为 0；
- 特殊数字、英文和专名已由 AI 检查读法是否合理；
- 显式 `subtitle_units` 的显示文本能完整拼回父 `text`；
- units 的有效朗读文本能完整拼回父 `tts_text ?? text`；
- 正式 JSON 已人工确认，不再依赖临时 TTS JSON 或 preview 文件。

正式 JSON 固定后、启动配音前，对四幕分别执行：

```bash
npm run voiceover -- \
  --apply-mappings-only \
  --script pipeline/01_script/<NN-slug>/course_epNN_actN.json
```

命令按完整术语匹配，把结果同步写入父 `tts_text` 和字幕单元 `tts_text`；重复执行修改数必须为 0。映射表只保存“显示写法 → 朗读写法”，不记录确认依据。新增或修改映射后应先用单句试听验证，再用于正式配音。

## 三、参考音与参考文本必须成对

声音克隆的参考 WAV 和 transcript 必须精确对应，不能只换其中一个。

默认参考对是仓库内的 voices/reference.wav 和 voices/reference.txt，文件由使用者准备且不提交到 Git。可通过 .env 的 VOXCPM_REF_WAV / VOXCPM_REF_TEXT_FILE 或命令参数同时替换。模型由 VOXCPM_MODEL / --model 指定；默认导入安装的 voxcpm 包，VOXCPM_SRC / --voxcpm-src 仅供显式使用源码副本。

如果以后更换音色：

1. 为参考 WAV 建立一份只包含其准确内容的 UTF-8 文本文件；
2. 使用 `--ref <wav>` 和 `--ref-text-file <txt>` 同时指定；
3. 先用少量固定测试句试听；
4. 确认后在课程台账记录本期使用的参考音版本；
5. 不修改已经冻结版本的参考音配置。


## 四、一次加载模型并生成四幕逐句 WAV

在仓库根目录使用 VoxCPM 环境的 Python：

```bash
npm run voiceover -- \
  --job pipeline/01_script/<NN-slug>/course_epNN_act1.json pipeline/02_audio/<NN-slug>/course_epNN_act1_voxcpm_raw \
  --job pipeline/01_script/<NN-slug>/course_epNN_act2.json pipeline/02_audio/<NN-slug>/course_epNN_act2_voxcpm_raw \
  --job pipeline/01_script/<NN-slug>/course_epNN_act3.json pipeline/02_audio/<NN-slug>/course_epNN_act3_voxcpm_raw \
  --job pipeline/01_script/<NN-slug>/course_epNN_act4.json pipeline/02_audio/<NN-slug>/course_epNN_act4_voxcpm_raw
```

脚本会在输出目录生成：

```text
s0.wav
g01.wav
g02.wav
...
```

执行规则：

- `旁白切分预览.json` 经用户确认并固定四幕正式 JSON 后，直接启动四幕批量任务；
- `--job` 按“正式 JSON、逐句输出目录”成对重复传入，模型只加载一次；
- 所有任务先完成脚本预检，任一幕非法时不创建输出目录、不加载模型；
- 每次使用新的期号、幕号或版本目录，不覆盖已确认目录；
- 默认不加 `--skip-existing`；
- 仅在崩溃续跑且已确认现有 WAV 对应同一份正式 JSON 时使用 `--skip-existing`；
- 如果某个 segment 的文本或朗读文本发生变化，旧同名 WAV 不能跳过；
- 模型源码、模型权重和 Python 路径属于本机配置，不写死到通用 SOP；
- 生成期间不得修改正式 JSON；
- 配音必须前台一次跑完：后台启动（`nohup`/`setsid`）会在启动它的调用结束时被回收，表现为 tqdm `OSError: [Errno 22]` 与进程静默消失；诊断日志 `voxcpm_run.log` 固定写在第一幕逐句目录，四幕共用一份。

### 沙箱缓存兼容与超时防护

`voxcpm_tts.py` 会在导入 VoxCPM 前把 `NUMBA_CACHE_DIR` 强制设置为仓库内的 `.cache/numba`，并自动创建该目录。原因是 `librosa` 首次惰性导入时会启用 Numba 缓存；受限沙箱不能在仓库外的 Python 安装目录写缓存，Windows 临时文件逻辑可能因此持续重试，表现为首句长时间无进度。项目内缓存目录可由沙箱写入，并已加入 `.gitignore`。

脚本不会因为进程账户是 `CodexSandbox*` 而拒绝运行。日志仍记录操作系统的真实进程账户，便于区分沙箱与普通账户的执行结果。不要在命令外另设 `NUMBA_CACHE_DIR`：生产入口会覆盖该值，确保缓存始终落到已验证的项目目录。

依赖导入、模型加载、每条音频的生成与写盘分别受 180 秒上限保护。需要调整时，在原命令追加 `--timeout-seconds 300`；必须为有限正数，不能以 0 关闭防护。超时后本机看门狗将调用栈写入第一幕逐句输出目录的 `voxcpm_run.log`，并以非零状态直接退出整个配音进程。该机制已测试可处理中断不了的、持有 GIL 的本机调用，但不能保证处理操作系统或驱动本身失去响应的情况。

日志追加保存时间、PID、真实账户、解释器、模型路径、PyTorch 版本、当前脚本与 segment ID、阶段耗时；普通异常也会保留原始堆栈。先看最后一个未完成阶段，再排查对应组件，禁止只看 GPU 利用率就认定 CUDA 死锁。

超时退出后不自动重试，也不自动使用 `--skip-existing`。先确认旧 PID 已退出，再检查已生成文件；失败句可能只有不完整 WAV，不能因为文件存在就续跑跳过。排除问题后，按本文版本隔离和续跑规则处理。

## 五、内部逐句检查和局部重配

逐句生成后，制作环节内部先检查：

- 是否漏字、错字、重复、乱序或吞音；
- 数字、英文、专名是否按 `tts_text` 正确朗读；
- 句首句尾是否存在明显爆音或异常长静音；
- 相邻句音色、语速、情绪和音量是否突变；
- 短句是否出现不自然拉长。

如果只有少数 segment 有问题：

1. 先判断是文本问题、`tts_text` 问题还是随机生成质量问题；
2. 文本问题修改正式 JSON，并重新审阅相关字幕映射；
3. 在新的临时目录只重新生成实际改动的 segment；
4. 其他已确认逐句 WAV 可以复用，但必须确认 ID 和文本没有变化；
5. 不为少量问题无必要地重配整幕。

逐句检查用于定位问题，不设置为每次都要求用户逐个确认的主流程门禁。完成四幕裁切和拼接后，再统一交付本期 `旁白切分预览.json` 与四份完整 `actN.wav`；用户可以边看切分边按幕试听，只有听出问题时才回到相应 segment 定位和局部重配。禁止只提供 WAV 而省略切分预览，也禁止采用“先生成第一幕 → 等用户确认 → 再生成后三幕”的默认流程。

## 六、裁切、拼接并生成 timings

逐句试听通过后执行：

```bash
node --env-file-if-exists=.env build/teaching/course_audio.mjs \
  pipeline/01_script/<NN-slug>/course_epNN_actN.json \
  pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm_raw \
  actN \
  --out-dir pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm \
  --speed 1.15
```

产出：

```text
pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN.wav
pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN_timings.json
```

`course_audio.mjs` 会：

- 裁切逐句首尾静音；
- 将裁切音频和句间静音统一为 48kHz、单声道；
- 按 `pause_after` 拼接；
- 对拼接后的整轨执行 `atempo=1.15`，输出正式 `actN.wav`；
- 用 ffprobe 获取变速后正式 WAV 的实际总时长；
- 按“正式 WAV 实际时长 ÷ 原速拼接时长”的比例同步缩放父 phrase、`gap` 和 subtitle units 时间，并在 timings 顶层记录 `speed`；
- 默认拒绝覆盖已有整轨、timings、裁切文件和输入文件。

`--speed` 默认值就是 `1.15`，SOP 命令仍显式传入，便于从命令记录直接确认生产参数。只允许 `0.5` 到 `2` 之间的有限数值。不要另外生成只有 WAV、没有匹配 timings 的 `actN_1.15x.wav`，也不要在 HTML、播放器或最终视频封装阶段临时改变播放速度。

未经明确确认不要使用 `--force`。如果目标目录已有正式结果，优先使用新版本目录。

## 七、timings 的含义

- 父 phrase 的原始边界来自裁切后逐句 WAV，正式 `start/end/dur` 再按变速后 WAV 的实际时长同比缩放；
- `gap` 随整轨一起按相同比例缩短，只影响下一父 phrase 的开始，不分配给字幕；
- subtitle unit 在父边界内按有效朗读字符权重估算；
- unit 时间只能称为“语义级大致同步”，不是声学强制对齐；
- 画面场景和字幕必须读取 timings，不能按文本重新猜时间。

后续字幕生成与定点高亮统一按 [视觉系统的字幕规则](visual_system.md#八字幕生成与注入) 执行；每期使用字幕 ID 定点格式。

字幕末尾标点只在显示层处理，不修改正式 JSON、`tts_text`、WAV 或 timings。

## 八、整轨与 timings 验收

每幕进入画面阶段前必须完成：

```bash
ffprobe -v error -show_entries format=duration \
  -of default=nw=1:nk=1 \
  pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN.wav
```

检查：

- `actN.wav` 能完整解码；
- WAV 时长与 `actN_timings.json.total` 在毫秒取整范围内一致；
- `actN_timings.json.speed` 为 `1.15`；
- phrases 顺序、数量和正式 JSON 的 segments 一致；
- 首句从 0 开始，最后 phrase 结束接近 total；
- 相邻父 phrase 边界单调、不重叠；
- 整轨试听无漏句、重复、明显断裂和异常静音；
- 特殊朗读和字幕显示均符合正式 JSON。

四幕整轨和 timings 全部通过技术检查后统一交付用户；同一条交付消息必须列出整期 `旁白切分预览.json` 和四份完整 `actN.wav` 的实际路径，不能让用户回查旧消息。只有用户完成四幕试听确认，才允许进入视频风格确认；选定风格后才制作正式画面。新一期画面源使用 `course/acts/epNN_<slug>/actN.html`。

### 试听确认后的片尾处理与整期时间表

全部旁白确认后、生成整期时间表前，只对已经完成 1.15 倍速的第四幕执行片尾收尾处理：在 `act4.wav` 末尾追加恰好 1 秒、48kHz、单声道静音，并同步更新 `act4_timings.json`。最后一个 phrase 的 `end` 和字幕单元时间保持不变，`gap` 记为 `1`，`total` 等于最后一个 phrase 的 `end + 1`。正式 JSON 最后一个 segment 的 `pause_after` 仍保持 `0`；这 1 秒静音不得先于变速处理，否则会被压缩。片尾静音属于成片后处理，不能伪装成旁白句间停顿。WAV、timings 和后续画面时长必须一起更新，禁止只手改其中一个。完成后再运行时间表生成器：

```bash
node --env-file-if-exists=.env build/teaching/course_outro_tail.mjs \
  pipeline/02_audio/<NN-slug>/course_epNN_act4_voxcpm/act4.wav \
  pipeline/02_audio/<NN-slug>/course_epNN_act4_voxcpm/act4_timings.json

node --env-file-if-exists=.env build/teaching/course_timeline_summary.mjs \
  --out course/episodes/NN-<slug>/整期时间表.json \
  pipeline/02_audio/<NN-slug>/course_epNN_act1_voxcpm/act1_timings.json \
  pipeline/02_audio/<NN-slug>/course_epNN_act2_voxcpm/act2_timings.json \
  pipeline/02_audio/<NN-slug>/course_epNN_act3_voxcpm/act3_timings.json \
  pipeline/02_audio/<NN-slug>/course_epNN_act4_voxcpm/act4_timings.json
```

四幕任一 timings 发生变化，都必须重新运行该命令覆盖旧时间表，再进入画面制作。第四幕 HTML 的 `data-duration` 和 `const DUR` 必须使用包含片尾 1 秒后的 `act4_timings.json.total`。完成后进入 [固定视频风格与封面确认](style_preview_workflow.md)，不再回到写稿阶段。

## 九、版本隔离和清理

音频内容未变化、只修改背景或动效时：

- V2 可以继续复用 V1 已确认的 `actN.wav` 和 timings；
- 不重新配音，不重新生成字幕时间；
- 在课程台账 notes 记录“仅视觉改版，音频沿用 V1”。

音频版本冻结后长期保留：

```text
正式 act JSON
actN.wav
actN_timings.json
course/episodes/NN-<slug>/整期时间表.json
实际使用的参考音版本记录
```

确认可重建且版本成片验收后可删除：

```text
逐句 segment WAV
trim/
concat.txt
试听临时文件
失败重配目录
```

删除前必须确认整轨、timings、画面源和版本成片均已保留。
