# 课程制作 · 渲染与成片验收


> 本文只定义 课程制作的验收门禁。制作顺序见 [`sop.md`](../sop.md)，画面实现见 [`visual_workflow.md`](../teaching/visual_workflow.md)。命令中的占位符必须替换为本期真实路径，禁止直接覆盖已验收版本。

本文件的WAV/timings、章节覆盖栏、固定开场、片尾静音和视频首帧封面是教学线要求。Vibe按[实际画面验收](../vibe/visual_review.md)执行连续审片与技术检查，再按[路线发布检查](../vibe/sop.md#6-确认高清审片版生成并验收发布包)交付；布局、解码、可识别对象、首次可见、反向定位、动作与实际导出复核仍须执行。

## 一、验收顺序

下面的固定A/B/C风格、四幕配音及standard审片顺序用于教学线。Vibe使用high审片、视觉时间表和独立封面，具体顺序以[Vibe SOP](../vibe/sop.md)为准。

```text
读取固定 A/B/C 视频风格目录，按同字母方向生成本期封面，三个方向均不使用暗色主视觉
→ 三张封面真实渲染为 PNG、检查冲突，并生成本期封面对比 HTML
→ 用户分别选择视频风格和正式封面；需要时对选中封面方向再生成三种构图
→ 选中封面单独复验并生成 cover.png
→ 按已选固定视频风格制作四幕构建版 HTML；第一幕开场随正式画面一起验收
→ HyperFrames 静态与布局检查
→ 首次可见状态检查
→ 无声视频
→ mux 分幕音频
→ 分幕技术与画面验收
→ 按幕序 concat
→ 对照整期时间表检查总时长和幕间交界
→ 审片版验收并由用户确认具体 vK
→ 复核已选封面仍与主题、标题和整体视觉方向一致，同时生成含视频总结的同版本发布文案
→ 将正式封面覆盖第一幕前 0.5 秒
→ 从同版正式源创建临时发布构建版，注入封面后输出高清发布版
→ 最终视频解码及时长检查通过后，自动登记索引和台账
→ 自动执行发布版、封面、发布文案、制作索引、课程台账五方核对
```

任何一幕未通过，都不能进入最终拼接。

四幕配音已通过用户试听、视频风格与封面已分别选定且四幕画面源完成后，由 AI 运行 `node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json`，不要求用户手动执行逐幕命令。

命令从已经确认的四幕 WAV/timings 开始，自动准备独立构建目录、生成并注入字幕、依次执行 `lint`、`validate`、`inspect`、标注元素首次可见检查、standard 渲染、WAV 封装、逐幕完整解码、配置的主体停滞检查和整期拼接，生成审片版：

```text
course_epNN_<slug>_vK.mp4
```

审片版逐幕使用 `--quality standard --workers 2 --browser-gpu --gpu`。`--browser-gpu` 负责 Chromium 绘制，`--gpu` 负责 H.264 硬件编码，两者不能互相替代。两个 worker 仅在同一幕内并行采帧，禁止并行渲染四幕；每幕必须在 `ffprobe`、全文件解码和编码器核验通过后，才启动下一幕。如果输出仍显示 `libx264`、浏览器关闭超时后文件无法读取，或基础文件命令持续超时，立即停止，不静默回退到 CPU 编码。



### 分幕制作和局部返工的统一入口

从第一次分幕制作起就使用本入口，禁止另写字幕注入或手动拼接分幕，再让整期 review 重渲染同一内容。以下命令由 AI 执行，不增加用户确认门禁：

```bash
# 只构建并检查第二幕，尚未制作的其他画面不阻挡此步骤
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2 --check-only

# 示例：只采集第二幕第 39～43 秒，并裁取同一段正式旁白
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2 --range 39:43

# 本幕定稿后完成整幕渲染、配音、解码和运动验收，自动登记可复用缓存
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2

# 四幕齐备后，复用有效分幕并拼接；只重建发生变化或验收无效的幕
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json
```

- 单幕与整期使用相同 `course_epNN_actN_vK_review` 目录、正式字幕高亮配置和验收步骤；单幕不登记整期输出。
- `--check-only` 使用独立 `_check` 目录；`--range` 使用独立 `_preview_起秒-止秒` 目录。两者不写整幕完成缓存，不更新索引、台账或正式 MP4。
- 局部修改先在浏览器检查入场与语义关系，再选择覆盖问题及前后上下文的区间出片；片段通过后，定稿时完整渲染受影响幕。无需每改一个入场时间就完整渲染整幕。
- 当前锁定的 HyperFrames 版本无原生区间参数，片段入口在独立构建中将 GSAP `main` 时间轴映射为指定区间，只采集该区间帧；只支持单根 GSAP 画面与外置 WAV，内嵌音视频或子合成会明确拒绝。源 HTML 与正式时长不变。
- 片段不等于全幕验收，尤其不足 6 秒的片段不能证明没有长停滞。最后仍须整幕解码、运动检测和整期交界检查。
- 缓存核对源文件、WAV、timings、工具、模板的内容 SHA-256，以及字幕高亮、运动配置、warning 基线和封面配置；输出内容哈希一致且全流解码成功才复用。仅修改文件时间不再触发渲染。缓存缺少当前验收签名时，重新验收并渲染；禁止手工补签名冒充完成。
- 新增或修改自定义素材时，须确认该素材已进入构建与缓存依赖；此入口当前自动复制的素材仍为模板字体、品牌图和发布封面。

## 二、渲染前门禁

所有新期次，该入口会先拒绝源码中的整幕布局豁免，再从每幕 `push()` / `enter()` 转场时间和 `DUR` 自动选择各场景转场前 1.2 秒的稳定英雄帧，将这些时间传给 HyperFrames 布局检查；不能把整幕豁免复制到新一期。文字超出卡片、字幕区或画布时必须修正后重跑；检查器对有意裁切或叠放产生误报时，AI 必须先查看对应实际帧，确认语义和可读性均正常，再只对最小局部元素添加 `data-layout-allow-overflow` 或 `data-layout-allow-overlap`。禁止通过扩大 `acts[].allowed_warnings`、恢复整幕豁免或跳过检查继续渲染。

文字、字幕和语义卡片必须位于所属视觉容器内。禁止给整个 `.scene` 设置 `data-layout-allow-overflow` 或 `data-layout-allow-overlap`；真实越界、未声明重叠或整幕豁免必须在渲染前阻断。

在本幕临时构建目录中执行：

```bash
npm run check
```

当前课程模板的 `check` 依次执行 HyperFrames `lint`、`validate` 和 `inspect`。必须满足：

- 没有 error；
- warning 首次出现时逐项人工判断，并把代码与最大数量写入本幕 `allowed_warnings`；编排器遇到新增代码或数量增加时阻断，数量减少可以继续，不能因为命令返回 0 就忽略；
- `data-duration`、`const DUR` 与正式 `actN_timings.json.total` 一致；
- 构建版 `index.html` 已注入字幕，不再含 `/*__SUBS__*/`；
- 字幕、卡片和标题没有越界或被其他层级遮挡；
- 时间轴已注册到 `window.__timelines["main"]`。

渲染前还须按第三节第 5 项，在实际浏览器时间轴中核对计划入场元素的首次可见状态。`lint`、`validate`、`inspect` 通过不能替代此项；完成渲染后，再用实际 MP4 的动作前后帧及片段复核，不能只以源 HTML 的状态推断成片。

首次渲染前不能只查看编码器帮助，必须实际完成一次 1 秒 NVENC smoke：

```bash
nvidia-smi
ffmpeg -y \
  -f lavfi -i color=c=black:s=320x240:r=30:d=1 \
  -c:v h264_nvenc -preset p4 -pix_fmt yuv420p \
  pipeline/build/nvenc_smoke.mp4
ffprobe -v error \
  -show_entries stream_tags=encoder \
  -of default=nw=1 \
  pipeline/build/nvenc_smoke.mp4
rm -f pipeline/build/nvenc_smoke.mp4
```

只有 smoke 成功且标签显示 `h264_nvenc` 才能进入正式渲染。任一命令失败时停止并说明原因，不允许静默改用 CPU `libx264`；失败产生的空 smoke 文件可以按上述精确路径删除。通过后渲染审片版无声视频：

```bash
npm run render -- \
  --output actN_silent.mp4 \
  --quality standard \
  --workers 2 \
  --browser-gpu \
  --gpu
```

资源规则：

- `--browser-gpu` 强制 Chromium 使用主机 GPU 绘制；日志应显示浏览器硬件 GPU 生效；
- `--gpu` 启用 FFmpeg GPU 编码；没有该参数时即使浏览器使用 GPU，H.264 仍可能由 CPU `libx264` 编码；
- 四幕严格串行，禁止同时启动多个 render；
- 每幕 render 完成后先确认文件可读取、相关 Chrome/Node/FFmpeg 子进程已退出，再执行 mux 或下一幕；
- 出现 `Timed out closing browser` 时，即使退出码为 0 也必须单独探测文件；若 `stat`、`ffprobe` 等基础命令持续超时，停止后续渲染，等待系统恢复。

## 三、分幕技术验收

### 1. 检查流、规格和时长

```bash
ffprobe -v error \
  -show_entries format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:stream_tags=encoder \
  -of json \
  pipeline/build/course_epNN_actN_vK_review/actN_final_standard.mp4
```

核对：

- 同时存在视频流和音频流；
- 视频为当前课程线规格：1080×1440、30fps；
- 视频编码器标签为 `h264_nvenc` 或本机等价 GPU 编码器；若仍是 `libx264`，说明 GPU 编码未生效，不能继续下一幕；
- 音频参数与正式整轨一致；
- MP4 时长接近 `actN_timings.json.total` 和 `actN.wav` 实际时长；
- 若差异超过正常帧取整或编码尾差，必须查明原因，不能凭肉眼放行。

### 2. 全幕解码

```bash
ffmpeg -v error \
  -i pipeline/build/course_epNN_actN_vK_review/actN_final_standard.mp4 \
  -map 0:v:0 -map 0:a:0 \
  -f null -
```

命令必须返回 0 且没有解码错误。

### 3. 抽取关键帧

至少覆盖：开头、每个场景中段、每次转场前后、结尾前。时间点必须按本幕 timings 和实际场景边界填写，不能机械复用示例数字。

```bash
mkdir -p pipeline/build/course_epNN_actN_vK_review/frames
for t in <时间点1> <时间点2> <时间点3>; do
  ffmpeg -y -ss "$t" \
    -i pipeline/build/course_epNN_actN_vK_review/actN_final_standard.mp4 \
    -frames:v 1 -q:v 3 \
    "pipeline/build/course_epNN_actN_vK_review/frames/f_${t}s.jpg" \
    -loglevel error
done
```

### 4. 人工画面检查

- 当前画面与当前旁白一致，没有提前剧透后面内容；
- 不是黑屏、白屏、纯背景或时间轴失效后的静止空画面；
- 字幕清晰、无遮挡、无越界，末尾标点符合本期显示规则；
- 关键词高亮、标题和顶部课程条内容正确；
- 教学线所有新期次按[视频内章节进度条](../teaching/video_chapter_progress.md)核对封面及固定开场无章节栏、正文首帧显现、两行截断、红叶与进度同速、四幕边界连续；旧正文顶线和分割线残段不得露在轨道下方；
- 每幕至少抽查一条包含关键词高亮的长字幕；允许自然分成两行，但不得因 Flex 分块或普通换行产生孤立单字行；
- 卡片、流程节点和装饰层的层级关系正确；
- 动效帮助理解，没有抢旁白注意力；
- 音画同步，开头和结尾没有异常静音或截断。

#### 对象可识别性验收

按 `visual_plan` 的主体清单逐项查看正式分幕画面，包括第一幕开场及正文对象的稳定帧和动作片段。固定视频风格预设图只用于选择，不属于按期视频验收对象；所选风格的开场随正式第一幕一起检查。记录对象、时间点或帧路径、判断结果，失败修正后复看。此项是 AI 的人工视觉检查，不新增用户门禁，也不是现有自动检查器已经具备的能力。

- 遮住或忽略名称标签后，仍能根据外形和关键部件认出所讲的对象；汽车、工作台、人物等不能靠方框内的名称才能辨认。
- 对象是可看清的解释主体，而非文字大卡角落里点缀的小图标。画面应看得见旁白所依赖的部件与关系。
- 旁白讲到放置、行驶、取出、检查等动作时，对象确实参与相应动作；检查完整片段，不能只看单张漂亮静帧。
- 抽象节点、消息、表格和界面可以保留文字与容器，但不能借此替代场景内应出现的具体对象。

任一项失败，本场景不能通过画面验收；须修改对象或场景并复验。像素运动、首现时机、布局及解码检查通过，均不能抵消对象缺失或只用文字代替物件的问题。

### 5. 连续时间与语义推进检查

静态 QC 的幕中帧、转场帧用于布局检查，不能证明同一构图内部在随旁白变化。每幕必须同时检查：

1. 对照 `visual_plan` 中每个旁白 ID，查看动作前后帧及完整片段，确认新信息在对应讲解处加入已有画面，逐步形成关系。对“已经全部展示、讲到时再移动或高亮”的场景，检查是否具有节拍表记录的完整画面先行理由；无依据时不通过，不能仅因有动作就放行。
2. 教学线在本幕 `acts[]` 记录 `motion_check: { "crop": "宽:高:x:y", "max_still_s": 6 }`，每幕须配置主体检测区域。区域按真实舞台确定，覆盖主解释图形，排除顶部品牌、底部字幕和常驻装饰；不能裁成某个不停转动的小图标。Vibe按[检查能力与边界](../vibe/visual_review.md#技术检查的范围)选用该像素筛查；未配置时记录未执行，连续发展与视觉表现仍必须实际审看，不把此阈值转成场景时长规则。
3. 配置该项后，review/publish 在该幕渲染、mux 与解码之后自动运行 `build/common/check_course_motion.mjs`，报告写入本幕构建目录 `motion-report.json`；检测到连续主体静止则返回非零并停止后续分幕。单独排查命令：

```bash
node --env-file-if-exists=.env build/common/check_course_motion.mjs <本幕视频.mp4> <宽:高:x:y> <motion-report.json> 6
```

检查使用 FFmpeg `freezedetect`，以缩小后的灰度主体帧检测近似不变区间，包含一直静止到文件末尾的情况。6 秒是复查触发值，不是必须每 6 秒切镜：优先按旁白恢复语义动作；确为必要的阅读/思考停留时，在节拍表写明准确起止、当前内容和理由，再按该幕实际需要设定阈值并复核，不能为了让失败消失而直接放宽。1 秒片尾正常停留不受影响。

#### 首次可见复核方法

- 以节拍表独立列出每个计划入场的信息元素或同时表达同一信息的元素组，记录目标、对应旁白、计划首次可见时间；不能只从动画代码生成清单后自证通过。检查范围包括父容器内稍后才讲到的文字、数值、连线和结果标记。
- 渲染前在实际浏览器中检查：场景刚开始、首次可见时刻前一帧、入场完成后的稳定帧，以及先跳到片尾再倒退回入场前一帧。前两种状态不得暴露后续信息，入场后须正常可见；直接 seek 和顺序推进应一致。
- 既检查元素自身的初始显隐，也检查父容器和子元素共同形成的实际可见结果；不能让尚未显示的父场景掩盖子元素初态错误。CSS 中已经能读出的暗色内容算可见，不算隐藏。
- 渲染后从实际 MP4 抽取同样语义节点的动作前后帧，并查看对应连续片段，核对初始局部、中间新增和最终整体。分步出现不能造成空白讲解、已讲内容无故消失、标题孤立标点或文字压框。
- 逐幕把首次可见检查的时间点、预期/实际状态、失败修正及例外理由写回 `visual_plan` 的验收记录；采用程序化检查时，把 `first-reveal-report.json` 保存在该幕构建目录并登记路径。数量通过不能替代对计划时间是否符合旁白的判断。

这项检查由 AI 在画面阶段执行，不增加用户确认步骤。`review/publish` 已在渲染前调用 `build/common/check_course_reveal.mjs`，检查 `data-reveal-at` 元素自身透明度的入场前、入场后和从实际片尾倒退状态，失败阻止渲染；长入场动画可用 `data-reveal-duration` 指定从入场到检查的秒数，默认 0.9 秒。依赖可由 `PUPPETEER_ROOT`、`CHROME_PATH` 指定，默认查找本机已安装的 HyperFrames 依赖与 Chrome。无标注时报告为 `not_applicable`，不能声称首现已通过；AI 仍须按节拍表核对标注覆盖、祖先遮挡、场景起点及旁白语义，`npm run check` 本身仍不含此项。发现提前展示时，按 [初始可见状态契约](../teaching/visual_system.md#初始可见状态) 修正，再复核受影响画面。

主体停滞工具只能发现像素停滞；完整画面提前出现后持续移动，也可能通过。因此 `motion-report.json` 的 `passed` 不能代替首次可见及语义复核。交付时分别记录“首次可见检查”“主体停滞检测”“语义对位复核”和“用户审片”状态，不得将静态截图或像素运动检查写成全片动画体验已通过。

### 6. 片尾 1 秒收尾检查

本项只检查教学线第四幕和整期结尾。教学线所有新期次都执行该硬门禁；Vibe结尾按其连续动作与收束要求验收，不套用本项静音片尾：

- `act4_timings.json` 最后一个 phrase 的 `gap` 为 `1`，且 `total - phrase.end` 精确为 1 秒；
- `act4.wav` 实际时长、第四幕 `data-duration`、`const DUR` 与更新后的 `timings.total` 一致，只允许正常毫秒或帧取整尾差；
- 静音采样允许起点存在不超过 20ms 的 WAV 边界量化残留；高清发布版考虑一个 AAC 编码帧，允许不超过 30ms 的起点残留。容差之后的剩余片尾必须保持静音，持续有声必须失败；
- 最后一句字幕在 phrase 的 `end` 时消失，后续 1 秒不再显示字幕；
- 最终结论画面在这一秒内持续可见，不切黑、不离场、不出现新信息；允许已有元素做轻微呼吸动效，但不能形成新的视觉事件；
- 至少抽取“最后一句结束后约 0.2 秒”和“视频结束前约 0.1 秒”两帧，确认两帧均为有效收尾画面。

## 四、最终拼接验收

四幕分别通过后，才可按幕序 concat 为带版本号的正式成片：

```text
pipeline/output/course/epNN_<slug>/vK/course_epNN_<slug>_vK.mp4
```

### 1. 检查最终规格和总时长

对最终成片再次执行 `ffprobe`。核对：

- 视频流、音频流、分辨率、帧率和音频参数正确；
- 总时长与 `course/episodes/NN-<slug>/整期时间表.json` 的 `total_s` 一致，且该时间表已经包含第四幕片尾 1 秒，只允许正常容器或编码尾差；
- 文件名中的期号、slug、版本号与本次制作目标一致。

### 2. 全片解码

```bash
ffmpeg -v error \
  -i pipeline/output/course/epNN_<slug>/vK/course_epNN_<slug>_vK.mp4 \
  -map 0:v:0 -map 0:a:0 \
  -f null -
```

命令必须返回 0 且没有解码错误。

### 3. 检查幕间交界

读取 `整期时间表.json` 中第一至第三幕的 `end_s`，分别抽取每个交界点前后画面。例如在交界点前后各取一帧：

```bash
ffmpeg -y -ss <交界点前0.3秒> \
  -i pipeline/output/course/epNN_<slug>/vK/course_epNN_<slug>_vK.mp4 \
  -frames:v 1 -q:v 3 <交界前图片>.jpg -loglevel error

ffmpeg -y -ss <交界点后0.3秒> \
  -i pipeline/output/course/epNN_<slug>/vK/course_epNN_<slug>_vK.mp4 \
  -frames:v 1 -q:v 3 <交界后图片>.jpg -loglevel error
```

三个幕间交界都要确认：

- 幕序正确；
- 没有黑帧、花屏、重复帧或上一幕残帧；
- 音频没有突然缺失、重叠或明显跳时；
- 下一幕标题、字幕和画面从正确状态开始。

### 4. 通看全片

自动检查不能代替完整观看。至少用正常速度通看一遍版本成片，重点复查字幕节奏、遮挡、突兀转场和音画错位。

## 五、用户确认审片版本

完成技术检查后，用户必须正常速度通看审片版，并明确确认具体版本，例如“确认 v4”。如果仍需修改旁白、字幕、画面、动效或品牌信息，继续生成新的审片版本；此时不要提前生成高清发布版。

用户确认的是内容版本，不是“某个低码率文件以后直接扩码率”。确认后应锁定该版本使用的：

```text
四幕正式 JSON
四幕 WAV 与 timings
四幕画面源 HTML
构建和字幕注入配置
```

## 六、高清发布版输出与验收

确认 `vK`、复核已选正式封面仍有效并准备第一幕 0.5 秒封面层后，生成同版本发布母版：

```text
pipeline/output/course/epNN_<slug>/vK/course_epNN_<slug>_vK_publish.mp4
```

发布版内容必须与已确认审片版一致，版本仍为 `vK`；唯一允许增加的是用户从三张候选中选定的前 0.5 秒封面层。应从同版正式 HTML、WAV 和 timings 创建临时发布构建版，只在第一幕构建版注入封面后重新高质量输出，正式源不改写；禁止对已经明显压缩的审片 MP4 简单提高码率并宣称清晰度得到恢复，也禁止在高清成片完成后追加封面并二次编码整片。

publish 入口先核验正式封面并同步待发布状态，再串行生成四幕 high 无声视频，拼接后直接复制已确认审片版的 AAC 音轨，不重新编码音频；随后完整解码、核对实测时长与正式时间表，自动回填真实输出路径、版本与正式时长，再执行发布门禁并生成 `qc/report.html`。内容签名、输出哈希与验收配置一致且完整解码通过的分幕可以安全续跑；否则自动重建该幕。

本地高清发布母版基准：

- 1080×1440、30fps；
- H.264 Main 或 High Profile、`yuv420p`；Profile 必须属于制作索引 `video_profiles` 允许值；
- 从同版 HTML 使用 `--quality high --workers 2 --browser-gpu --gpu` 重新渲染；
- 当前课程制作生产机默认使用 NVIDIA NVENC，禁止在未确认的情况下回退到 CPU `libx264`；
- AAC、48kHz、单声道、192kbps；
- 启用 `faststart`，便于网络端渐进加载。

CPU x264 预设仅作为无 NVENC 机器的备用说明，不能在当前生产机上自动启用；具体编码背景见 [`render_presets.md`](../teaching/render_presets.md)。码率不是唯一清晰度标准；发布版还必须检查小字号、细线、网格、纸张纹理、渐变和转场运动中是否出现糊边、色块或明显压缩噪点。

`course_video.mjs publish` 和 `check_course_release.mjs` 自动执行：

1. `ffprobe` 流、分辨率、帧率、像素格式、音频参数和时长检查；
2. 全片 FFmpeg 解码；
3. 审片版与发布版解码音频 MD5 一致性检查；
4. 封面起点、封面结束前和正文第一帧 SSIM 检查；
5. 四幕中点与三个幕间前后帧抽取到 `qc/report.html`；
6. 与审片版核对内容、字幕、音画同步和场景顺序；
7. 输出登记在发布包检查之前执行，细则见 [发布交付](release_delivery.md)；该登记不改变公开发布状态。

## 七、封面与发布包交接

进入高清渲染前，核对视频风格确认阶段已按 [封面流程](../teaching/cover_workflow.md) 完成所有候选的真实渲染门禁、用户选择和选中封面的单独复验，并确认后续审片未使主题、标题或整体视觉方向失效；没有有效的正式 `cover.png` 不能继续。封面设计与候选检查细则只在该文档维护。

## 八、版本与发布一致性门禁

发布文案格式、章节、期号与版本一致性、台账状态、发布授权和已发布目录登记，统一按 [发布交付](release_delivery.md) 执行。publish 自动调用发布包检查器；后续修改配套产物时由 AI 独立重跑该检查。

本文件负责媒体技术验收：实际分辨率、帧率、编码、Profile、像素格式、音频参数、时长容差符合索引 `publish_spec`；全片解码返回 0；审片/发布解码音频 MD5 一致；所有新期次最终音轨末尾 1 秒静音；封面时间窗内两帧达到 SSIM 门槛且 0.5 秒后恢复正文。失败必须修复后重跑，不能通过放宽约束或手改状态绕过。

制作视觉 V2 时必须保留 V1，使用新版本文件名重新完成相关验收，不得覆盖旧版后沿用旧验收结论。

## 九、常见失败信号

| 现象 | 优先检查 |
|---|---|
| render 返回 0，但画面只有背景 | 时间轴创建、注册和确定性执行；`const tl` 是否位于字幕注册前 |
| 字幕或卡片被遮挡、越界 | `inspect` 结果、容器尺寸、安全区和 `z-index` |
| 第二幕中心元素遮住后方内容 | 中心元素占位、层级和场景切换时的显隐状态 |
| 场景开头摆齐，讲到某处才动一下 | 元素首次可见时间与初始 CSS；`immediateRender: false` 是否被误当作隐藏；父容器出现时是否暴露后续内容 |
| 画面提前出现后面内容 | 对照正式 timings 与节拍表核对元素入场，而不只核对场景锚点 |
| MP4 比 WAV 明显短或长 | `data-duration`、`DUR`、timings.total、WAV 时长和 mux 参数 |
| 分幕正常，拼接后交界异常 | concat 清单顺序、分幕流参数是否一致、交界点是否计算正确 |
| 视频合格但不能发布 | 版本文案缺失、台账路径错误或发布状态未经确认 |
| 发布版体积变大但细节没有改善 | 是否只是把审片 MP4 扩码率重编码，而没有从同版正式源重新输出 |
| 只为封面导致整片重新编码 | 停止成片后追加；应在高清输出前把正式 PNG 注入第一幕临时发布构建版，其他输入未变且满足续跑条件时只重渲染第一幕 |
| 独立封面正确但视频首帧不是该封面 | 检查第一幕临时发布构建版是否加入 `class="clip"` 的 0.5 秒最高图层，并重新渲染第一幕 |

## 十、验收后清理门禁

版本成片验收及输入存在，不足以证明删除安全。以下只列为候选，必须按[发布后清理规则](published_cleanup.md)排查所有依赖并完成独立重建验证；当前保留，自动删除已暂停：

```text
临时构建目录
无声视频
抽帧图片
临时 concat 清单
已拼入版本成片的临时分幕视频
```

不得删除：正式讲解稿、整期旁白切分预览、整期时间表、制作索引、正式分幕 JSON、正式整轨 WAV、正式 timings、分幕源 HTML、已确认审片版、高清发布版、正式独立封面，以及与该版本匹配的发布文案。

## 十一、入口维护后的回归检查

修改渲染编排或产物登记逻辑后，从项目根目录运行：

```bash
node --test tests/node/course_video.test.mjs tests/node/course_video_incremental.test.mjs tests/node/check_course_reveal.test.mjs tests/node/check_course_motion.test.mjs tests/node/check_course_release.test.mjs
```

测试覆盖首次空路径、生成后登记、失败不登记、重复执行、单幕到整期缓存复用、仅时间戳变化、输出被替换、预检与片段隔离、首现失败阻断和已发布路径保护，并核对既有发布门禁。实际片段对齐测试可设置 `COURSE_PREVIEW_FILE`、`COURSE_PREVIEW_REFERENCE`（原整幕 MP4）、`COURSE_PREVIEW_WAV`、`COURSE_PREVIEW_START` 后运行 `tests/node/course_video_incremental.test.mjs`，会比较同时间段画面 SSIM 和解码旁白相关性；未提供参数时明确跳过该集成项。测试不替代正式课程的 GPU 渲染与全片审片。
