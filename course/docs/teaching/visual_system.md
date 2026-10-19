# 课程制作视觉系统


> 本文定义 课程制作的视觉与 HyperFrames 合成契约。端到端顺序见 [`sop.md`](../sop.md)，从画面点子到 HTML 的具体方法见 [`visual_workflow.md`](visual_workflow.md)。

## 一、长期不变的约束

无论以后采用哪种背景风格，以下规则保持不变：

- 画幅为 3:4 竖屏，`1080×1440`、30fps；
- 配音先行，画面、字幕和场景边界读取正式 `actN_timings.json`；
- 每幕使用独立源 HTML、独立构建目录和独立音频；
- 每幕先渲染无声视频，再 mux 对应整轨音频；
- 渲染资源按[共同 GPU 规则](../common/render_verification.md#gpu-与资源使用)执行；
- 字幕必须清晰、无遮挡、无越界，画面必须对应当前旁白；
- 默认随旁白逐步构建主体与关系，先完成含首次可见状态的 [语义节拍表](visual_workflow.md#四把一句画面点子拆成场景设计)；完整画面先行仅限该流程规定的讲解例外，不能用强调或装饰运动代替信息首次出现；
- 时间轴实现按[共用合成契约](../common/visual_contract.md)；
- 每幕必须通过静态检查、时间检查和抽帧验收，不能只看 render 返回 0；
- 本仓库所有新期次正文顶部显示[视频内章节进度条](video_chapter_progress.md)，红叶随进度移动；固定开场保留母版品牌标识；
- 版本和真实文件登记按[共同执行规则](../common/execution.md)。

## 二、从固定目录选择视频风格

视频风格固定为 A“纸本机械”、B“技术路线”、C“明亮模块”三套长期视觉系统。预设图与说明统一保存在：

```text
course/docs/teaching/video_style_presets.html
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

**可选配色建议：** 在保持所选风格和文字可读性的前提下，可为卡片、流程节点或对象适当加入少量低饱和辅助色，帮助区分内容；同类内容尽量保持同色。已有配色清楚协调时直接沿用，无需逐屏补色或凑足颜色数量。此建议不新增色板交付、用户确认或验收门禁，也不因未增加颜色而要求返工或阻断制作。

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

教学主体在[视觉节拍表](visual_workflow.md#具体对象的形象与素材)登记并执行[共用对象检查](../common/visual_review.md#对象可识别性验收)。

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

## 六、教学合成参数

写源 HTML 前读取[共用合成、素材及确定性契约](../common/visual_contract.md)。教学画幅为1080×1440，data-duration 和 DUR 取正式 timings.total；工具支持四幕或六幕，acts、chapter_titles 与时间表章节数一致，单幕制作只要求该幕就绪，片尾作用于实际末幕。

固定开场保留母版品牌，正文红叶由构建入口注入，源 HTML 不另设固定 .course-brand-mark。教学动态正文自然换行，不用 br 强行断行；短标题可按明确设计换行。

## 八、字幕生成与注入

正式 timings 固定后、制作画面前，AI 通读四幕全部 `subtitle_units`，从整期选择 6～10 个知识锚点并写入制作索引。高亮不是“每句找重点”，只选择同时满足“重要”与“值得额外解释”的内容：核心专业名词首次出现、重要英文简称首次解释、理解整期所必需的难点，以及极少量关键行动入口。仅仅生僻但不重要、容易理解的普通结论、反复出现的 `AI`/`Token` 等常用词不高亮；同一术语后续重复出现默认不再高亮。此步骤不增加独立文件或强制用户门禁，用户要求查看时再提供整期重点清单。

VoxCPM 当前主链使用 timings，不使用 Edge SRT：

```bash
PYTHONUTF8=1 python -B build/teaching/timings_to_subs.py \
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

## 九、教学构建与验收入口

字幕注入后进入[教学渲染验收](render_verification.md)，按其教学声音与封面流程执行；预检、局部预览、缓存、GPU 和完整解码只按[共用渲染规范](../common/render_verification.md)维护。首次可见、对象识别及实际片段检查在该阶段调用[共用视觉方法](../common/visual_review.md)。

教学专属复核：时长对应 WAV/timings，画面解释当前旁白；语义节拍表有信息首次可见依据；正文章节栏和品牌正确，无内部期号、幕号、制作标签、调试信息。通过后按教学 SOP 拼接并审片。

## 十一、失败定位

时间轴、布局、提前显现、随机状态及拼接问题按[共同失败信号](../common/render_verification.md#常见失败信号)定位；教学音画不同步时检查 WAV、timings.total、DUR 和合音边界。

## 十二、保留与返工

输入依赖按[教学重建输入](published_cleanup.md)保留，版本处理按[共同执行规则](../common/execution.md#版本与修改)。仅修改画面时可继续使用未变化的正式音频与 timings，在新版本重新验收受影响范围。
