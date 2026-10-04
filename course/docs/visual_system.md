# 课程制作视觉系统


> 本文定义 课程制作的视觉与 HyperFrames 合成契约。端到端顺序见 [`sop.md`](sop.md)，从画面点子到 HTML 的具体方法见 [`visual_workflow.md`](visual_workflow.md)。

## 一、长期不变的约束

无论以后采用哪种背景风格，以下规则保持不变：

- 画幅为 3:4 竖屏，`1080×1440`、30fps；
- 配音先行，画面、字幕和场景边界读取正式 `actN_timings.json`；
- 每幕使用独立源 HTML、独立构建目录和独立音频；
- 每幕先渲染无声视频，再 mux 对应整轨音频；
- 每幕使用浏览器 GPU 绘制和 GPU H.264 编码，默认 `workers` 为 2，四幕禁止并行渲染；
- 字幕必须清晰、无遮挡、无越界，画面必须对应当前旁白；
- 默认随旁白逐步构建主体与关系，先完成含首次可见状态的 [语义节拍表](visual_workflow.md#四把一句画面点子拆成场景设计)；完整画面先行仅限该流程规定的讲解例外，不能用强调或装饰运动代替信息首次出现；
- HyperFrames 时间轴必须可 seek、可重复渲染，同一时间点产生相同画面；
- 每幕必须通过静态检查、时间检查和抽帧验收，不能只看 render 返回 0；
- 本仓库所有新期次正文顶部显示[视频内章节进度条](video_chapter_progress.md)，红叶随进度移动；固定开场保留母版品牌标识；
- 成片和中间输出必须包含期号与版本，禁止覆盖上一期或上一版。

## 二、从固定目录选择视频风格

视频风格固定为 A“纸本机械”、B“技术路线”、C“明亮模块”三套长期视觉系统。预设图与说明统一保存在：

```text
course/docs/video_style_presets.html
course/docs/assets/video-style-presets/
```

四幕配音通过技术验收和用户试听确认、片尾处理与整期时间表完成后，AI 生成本期三个同源封面，并在同一轮交付固定视频风格目录与封面对比页。用户分别选择视频风格和封面，允许跨组；详细规则见 [固定视频风格流程](style_preview_workflow.md) 与 [封面流程](cover_workflow.md)。

正式第一幕必须从制作索引 `selected_style.template` 指向的 `templates/course-opening-3x4/a|b|c/index.html` 原样复用开场结构、素材和动画，接入本期正式音频和 timings，再与正文衔接并随整幕完成真实渲染和验收；不得另写一个配色相似但结构不同的开头。

固定风格控制背景材质、主色、字体气质、边界、图形语言和运动节奏。开头以后的正文只继承这些风格属性，不继承共享母版的控制台、框架、状态栏、刻度尺、模块位置或场景结构。每期正文仍须根据讲解内容重新设计主体、关系、场景布局与信息推进；不得把共享开场母版或同一套卡片版式机械铺满全片，也不得只替换主题词。

`templates/course-explainer-3x4/index.html` 继续提供通用的 1080×1440 合成结构、字体和字幕接入、渲染配置及红叶素材；正文的移动红叶由构建入口统一注入。固定风格的具体开场语言以 `templates/course-opening-3x4/a|b|c/index.html` 为准。

## 三、可以按版本调整的视觉层

在已选 A/B/C 固定系统的边界内，以下内容可以按本期叙事或 V2、V3 调整：

- 场景主体、关系和空间布局；
- 卡片、流程图、对照图和数据图的具体结构；
- 与旁白对应的入场、状态变化和转场节奏；
- 不改变主视觉识别的局部强调色、纸张纹理和装饰强度。

切换到另一套固定视频风格必须更新 `selected_style`；新增固定风格必须先更新共享母版与永久预设目录。视觉版本变化不得改变已经冻结的旁白、正式 WAV、timings 和字幕文本，除非该版本明确包含内容修改。

## 四、画面分层

每幕保持以下层级关系：

| 层 | 内容 | 要求 |
|---|---|---|
| 背景层 | Canvas、渐变、纹理、幽灵字或装饰图形 | 确定性、不能抢正文、装饰元素可标记 `data-layout-ignore` |
| 顶部课程条 | 本仓库所有新期次正文为四章标题和按真实时长分配的进度条 | 高 100px，封面及固定开场不显示 |
| 品牌标识 | 红叶透明 PNG | 本仓库所有新期次正文为跟随进度的 52×52px 红叶，不保留第二枚固定红叶；固定开场沿用母版布局 |
| 中部舞台 | 场景隐喻、流程、对照、数据或结构图 | 一眼能看出当前旁白在讲什么，不能退化成纯字幕 PPT |
| 底部字幕 | 按 timings 显隐的字幕和关键词高亮 | 不遮挡主画面，不超出安全区，绝对末尾标点按显示规则处理 |

场景画面应优先表达关系和变化，例如“裁判→教练”“做→检查→调整→再做”，而不是把旁白逐字搬到卡片上。

承担解释作用的具体对象必须有可识别形象，名称标签不能代替物件。汽车、工作台、人物等按 [对象与素材规则](visual_workflow.md#具体对象的形象与素材) 制作，并通过 [对象可识别性验收](render_verification.md#对象可识别性验收)。此约束适用于所有视觉风格。

公开画面的信息边界：

- **保留**：本仓库所有新期次正文的章节栏与移动红叶、固定开场的原有品牌元素、本期主题、场景序号（如 `04 / ONE-HOT`）和有语义的设计细节；
- **禁止**：内部期号、幕号、项目编号、制作标签、调试坐标与画布参数，例如 `NOTE 03`、`ACT 02`、`COURSE NOTE`、`003`、`X 1080 · Y 1440`。

场景序号只表达全片内容顺序，不承担项目管理和调试编号的职责。

### 独立封面

封面在视频风格确认阶段生成，A、B、C 分别继承同字母固定视频方向；固定视频风格目录与本期封面对比页同轮交付，用户分别选择。审片确认后仅复核主题、标题和整体视觉方向是否仍适用，未变化时不重复询问。内容适配、布局标记、候选真实渲染、用户选择和前 0.5 秒封面交付规则统一见 [封面流程](cover_workflow.md)，本文不重复维护。

## 五、源文件和命名

推荐命名：

```text
正式 timings   pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN_timings.json
正式整轨       pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN.wav
画面源         course/acts/epNN_<slug>/actN.html
临时构建       pipeline/build/course_epNN_actN_vK_<review|publish>/
审片无声视频   pipeline/build/course_epNN_actN_vK_review/actN_silent_standard.mp4
审片分幕输出   pipeline/build/course_epNN_actN_vK_review/actN_final_standard.mp4
发布无声视频   pipeline/build/course_epNN_actN_vK_publish/actN_silent_high.mp4
```

## 六、HTML 合成契约

每个 `course/acts/epNN_<slug>/actN.html` 是可长期保留的画面源，至少满足：

1. `<body>` 下直接存在独立合成根节点，不用 `<template>` 包裹；
2. 根节点具有唯一 `data-composition-id`，当前课程幕统一使用 `main`；
3. 根节点具有明确的 `data-width="1080"`、`data-height="1440"` 和 `data-duration`；
4. 根节点和祖先链具有可解析的宽高，避免内容塌缩到左上角；
5. `data-duration` 与 `const DUR` 均等于对应 `timings.total`；
6. HTML 中只有一个 `/*__SUBS__*/` 字幕注入点；
7. 使用 `gsap.timeline({ paused: true })` 同步创建时间轴；
8. 注册到 `window.__timelines["main"]`，键名必须与根 `data-composition-id` 完全一致；
9. 时间轴必须在 `SUBS.forEach` 注册字幕前创建；
10. 所有场景运动都能由时间轴 seek，不依赖播放历史。
11. 固定开场按原母版保留品牌标识；本仓库所有新期次正文红叶由构建入口注入，源 HTML 不再另设固定的 `.course-brand-mark`。

## 七、确定性渲染规则

- 背景随机布局必须使用固定种子的 PRNG，禁止用未设种子的 `Math.random()`；
- 禁止使用 `Date.now()`、`performance.now()` 或真实时钟驱动画面；
- 禁止用 `setTimeout`、Promise、异步回调或事件监听构建正式时间轴；
- 禁止无限循环 `repeat: -1`，循环次数必须有限并限制在本幕时长内；
- 禁止用 `display` 或 `visibility` 做关键动画，使用 opacity 和 transform；
- 不要让多个时间轴同时修改同一元素的同一属性；
- 动态正文自然换行，不使用 `<br>` 强行切行；短标题需要明确设计时可以例外；
- 会缩放、回弹或越界的徽章与装饰要按峰值尺寸预留空间；
- 装饰元素不参与布局审计时使用 `data-layout-ignore`；确需越界的动画使用 `data-layout-allow-overflow`。

### 初始可见状态

- 计划延后入场的内容，必须在首帧前通过 CSS 的 `opacity: 0` 或等效的确定性时间轴初态隐藏，并用显式起止值在计划时刻显示；布局占位不等于对观众可见。
- `fromTo(..., { immediateRender: false })` 只推迟应用 tween，不会自动把默认可见的 DOM 元素提前隐藏。不得仅因写了入场 tween，就认定元素在此前不可见。
- 父场景淡入后，尚未轮到的子元素仍须独立隐藏；标题中的后半句、卡片内部数值、连线和选择标记也要按各自的信息时间处理，不能随父容器一起提前露出。
- 直接跳到中间时刻、顺序播放、从片尾倒退到同一时刻，均应得到相同可见状态；不能依赖只执行一次的回调或播放历史。首次可见与成片复核按 [渲染验收](render_verification.md#5-连续时间与语义推进检查) 执行。

## 八、字幕生成与注入

正式 timings 固定后、制作画面前，AI 通读四幕全部 `subtitle_units`，从整期选择 6～10 个知识锚点并写入制作索引。高亮不是“每句找重点”，只选择同时满足“重要”与“值得额外解释”的内容：核心专业名词首次出现、重要英文简称首次解释、理解整期所必需的难点，以及极少量关键行动入口。仅仅生僻但不重要、容易理解的普通结论、反复出现的 `AI`/`Token` 等常用词不高亮；同一术语后续重复出现默认不再高亮。此步骤不增加独立文件或强制用户门禁，用户要求查看时再提供整期重点清单。

VoxCPM 当前主链使用 timings，不使用 Edge SRT：

```bash
PYTHONUTF8=1 python -B build/timings_to_subs.py \
  <actN_timings.json> \
  --highlights-json '[{"unit_id":"g01.u02","text":"词元","reason":"核心术语首次出现"}]' \
  > <新构建目录>/subs.txt
```

注入要求：

- 以 UTF-8 读取源 HTML 和 `subs.txt`；
- 注入前断言源 HTML 只有一个 `/*__SUBS__*/`；
- 注入后断言构建版 `index.html` 不再包含占位符；
- 字幕条数等于 timings 展平后的 unit 数量；
- 检查没有空字幕、非法时段、重复高亮或 `****` 嵌套标记；
- 新一期四幕结构化高亮合计 6～10 项，每项具有非空 `unit_id`、`text` 和 `reason`；
- 只在指定字幕 ID 中高亮指定文字，字幕 ID 不存在、文字未出现或同一字幕中出现多次时立即失败；
- 每条字幕最多一个重点；核心术语、英文简称通常只在首次需要建立概念时高亮，重复出现不自动染色；
- `.sub` 使用 Flex 对齐时，必须把整句 `phraseHTML(...)` 包在 `display:block;width:100%;text-wrap:balance` 的 `.subtext` 内；禁止把高亮前文本、`.hl` 和高亮后文本直接作为多个 Flex 项，并用均衡换行避免单字尾行；
- 字幕末尾标点只在显示层处理，不修改正式 JSON、`tts_text`、WAV 或 timings。

每幕字幕重点写入制作索引的 `acts[].subtitle_highlights`。每期使用结构化定点格式。`course_video.mjs` 每次从 timings 重新生成 `subs.txt`，不能复用来源不明的旧构建字幕。

## 九、构建、检查、渲染和 mux

正式生产由 AI 运行统一入口：

```bash
node --env-file-if-exists=.env build/course_video.mjs review course/episodes/NN-<slug>/制作索引.json
node --env-file-if-exists=.env build/course_video.mjs publish course/episodes/NN-<slug>/制作索引.json
```

review 只在四幕完整配音试听确认、视频风格与封面分别选定且四幕画面源完成后运行；publish 只在审片版确认、已选正式封面复核仍有效且同版本文案就绪后运行。publish 的第一幕构建版由 `inject_course_cover.py` 幂等注入封面，正式画面源不需要为每个版本手工修改。以下逐幕命令仅用于定位故障，不再作为默认生产入口。

每次使用全新的临时构建目录：

```bash
mkdir -p pipeline/build/course_epNN_actN_vK_<mode>
cp -a templates/course-explainer-3x4/. pipeline/build/course_epNN_actN_vK_<mode>/
```

将源 HTML 注入字幕后写为构建目录的 `index.html`，然后在该构建目录执行：

```bash
npm run check
npm run render -- \
  --output actN_silent.mp4 \
  --quality standard \
  --workers 2 \
  --browser-gpu \
  --gpu
```

模板中的 `npm run check` 依次执行 HyperFrames lint、validate 和 inspect。审片版渲染必须在三项检查无错误后进行；布局 warning 也要人工判断，不能直接忽略。首次可见状态须另按 [渲染验收](render_verification.md#5-连续时间与语义推进检查) 检查，三项检查通过不代表未讲到的信息没有提前显示。

`--browser-gpu` 只负责 Chromium/WebGL 绘制，`--gpu` 才负责 FFmpeg 的 H.264 硬件编码。当前课程制作默认要求两者同时启用。四幕按 1→4 串行执行；一幕渲染、mux、探测和解码全部通过后，才能启动下一幕。用户确认审片版本后，高清发布版把 `--quality standard` 改为 `--quality high`，其余 GPU 与 2 worker 参数不变。

无声视频通过检查后 mux 对应整轨音频：

```bash
ffmpeg -y \
  -i pipeline/build/course_epNN_actN_vK_review/actN_silent_standard.mp4 \
  -i pipeline/02_audio/<NN-slug>/course_epNN_actN_voxcpm/actN.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -shortest \
  pipeline/build/course_epNN_actN_vK_review/actN_final_standard.mp4
```

具体路径必须替换为本期真实路径；禁止直接照抄占位符并覆盖已有版本。

## 十、逐幕验收

按 [`render_verification.md`](render_verification.md) 执行，至少检查：

- 分幕视频时长接近对应 `timings.total`；
- 开头、场景中段、转场和结尾帧均有有效画面；
- 当前画面与当前旁白一致；
- 首次可见状态符合节拍表，已核对正常推进和倒退跳转，完整画面先行的例外有对应旁白依据；
- 字幕无越界、无遮挡，关键词高亮正确；
- 顶部课程条内容正确；
- 没有任何内部期号、幕号、项目编号或调试信息；
- 没有黑帧、白帧、纯背景或时间轴静默失效；
- 全幕 FFmpeg 解码返回 0。

所有分幕验收通过后，才进入 [`sop.md`](sop.md) 的最终 concat 和成片验收。

## 十一、常见失败信号

| 现象 | 优先检查 |
|---|---|
| render 返回 0，但只有背景 | 时间轴是否同步创建并注册；`const tl` 是否位于字幕注册前 |
| 内容堆在左上角 | 根节点和祖先链是否有明确宽高 |
| 字幕或卡片越界 | `npm run check` 的 inspect 结果、安全区、字体大小和容器尺寸 |
| 第二幕中心规则卡遮住后方节点 | 层级 `z-index` 和中心元素占位，保留对应回归测试 |
| 场景开始就显示全部内容，讲到时又动一下 | 初始 CSS 是否已隐藏延后入场元素；父场景淡入是否暴露子元素；是否误把 `immediateRender: false` 当作隐藏 |
| 画面提前讲后面的内容 | 对照 timings 和节拍表核对元素首次可见时间，不能只检查场景切换时间 |
| 同一时间点重复渲染画面不同 | 是否使用真实时钟、未设种子的随机数或异步状态 |
| mp4 比音频短或长 | HTML `data-duration`、`DUR`、timings.total 和 WAV 时长 |

## 十二、长期保留与临时产物

长期保留：

```text
course/episodes/NN-<slug>/制作索引.json
course/docs/video_style_presets.html 与制作索引中的 `selected_style`
course/episodes/NN-<slug>/cover.png
course/acts/epNN_<slug>/actN.html
正式 actN.wav
正式 actN_timings.json
已验收的版本成片
```

版本成片验收后可删除：

```text
pipeline/build/course_epNN_actN_vK_<review|publish>/
subs.txt
无声视频
已拼接进入版本成片的临时分幕视频
抽帧检查目录
```

如果准备制作视觉 V2，先保留 V1 版本成片；V2 继续复用正式音频和 timings，在新的 HTML 版本或新构建目录中调整视觉，不覆盖 V1。
