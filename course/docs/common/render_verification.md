# 共用渲染工具与技术验收

本文只维护两条路线共同使用的工具、检查方法和能力边界。制作与媒体输出顺序按所属路线执行；具体尺寸、质量、声音、时间来源和封面行为不能从工具名称推断。

正式制作使用所属路线的审片命令；以下 Node 命令说明共用底层接口及局部参数，路线入口原样转发这些参数。输出位置按[共用输出规则](output_paths.md)。

## 分幕制作和局部返工的统一入口

从第一次分幕制作起就使用本入口，禁止另写字幕注入或手动拼接分幕，再让整期 review 重渲染同一内容。以下命令由 AI 执行，不增加用户确认门禁：

```bash
# 只构建并检查第二幕，尚未制作的其他画面不阻挡此步骤
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2 --check-only

# 示例：只采集第二幕第 39～43 秒，并裁取同一段已配置的外置声音
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2 --range 39:43

# 本幕定稿后完成整幕渲染、合音、解码和配置的运动检查，自动登记可复用缓存
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json --act 2

# 全部分幕齐备后，复用有效分幕并拼接；只重建发生变化或验收无效的幕
node --env-file-if-exists=.env build/common/course_video.mjs review course/episodes/NN-<slug>/制作索引.json
```

- 单幕与整期使用相同 `course_epNN_actN_vK_review` 目录、正式字幕高亮配置和验收步骤；单幕不登记整期输出。
- `--check-only` 使用独立 `_check` 目录；`--range` 使用独立 `_preview_起秒-止秒` 目录。两者不写整幕完成缓存，不更新索引、台账或正式 MP4。
- 局部修改先在浏览器检查入场与语义关系，再选择覆盖问题及前后上下文的区间出片；片段通过后，定稿时完整渲染受影响幕。无需每改一个入场时间就完整渲染整幕。
- 当前锁定的 HyperFrames 版本无原生区间参数，片段入口在独立构建中将 GSAP `main` 时间轴映射为指定区间，只采集该区间帧；只支持单根 GSAP 画面与外置 WAV，内嵌音视频或子合成会明确拒绝。源 HTML 与正式时长不变。
- 片段不等于全幕验收。最后仍须整幕解码、所属路线配置的运动检查及整期交界复查。
- 缓存核对源文件、路线对应的音轨、时间表、素材、工具、模板的内容 SHA-256，以及字幕高亮、运动配置、warning 基线和封面配置；输出内容哈希一致且全流解码成功才复用。仅修改文件时间不再触发渲染。缓存缺少当前验收签名时，重新验收并渲染；禁止手工补签名冒充完成。
- 新增或修改自定义素材时，须确认该素材已进入构建与缓存依赖；外置素材按[素材与输入签名](visual_contract.md#素材与输入签名)登记并进入构建。

## 渲染前门禁

所有新期次，该入口会先拒绝源码中的整幕布局豁免，再从每幕 `push()` / `enter()` 转场时间和 `DUR` 自动选择各场景转场前 1.2 秒的稳定英雄帧，将这些时间传给 HyperFrames 布局检查；不能把整幕豁免复制到新一期。文字超出卡片、字幕区或画布时必须修正后重跑；检查器对有意裁切或叠放产生误报时，AI 必须先查看对应实际帧，确认语义和可读性均正常，再只对最小局部元素添加 `data-layout-allow-overflow` 或 `data-layout-allow-overlap`。禁止通过扩大 `acts[].allowed_warnings`、恢复整幕豁免或跳过检查继续渲染。

文字、字幕和语义卡片必须位于所属视觉容器内。禁止给整个 `.scene` 设置 `data-layout-allow-overflow` 或 `data-layout-allow-overlap`；真实越界、未声明重叠或整幕豁免必须在渲染前阻断。

在本幕临时构建目录中执行：

```bash
npm run check
```

当前课程模板的 `check` 依次执行 HyperFrames `lint`、`validate` 和 `inspect`。必须满足：

- 没有 error；
- warning 首次出现时逐项人工判断，并把代码与最大数量写入本幕 `allowed_warnings`；编排器遇到新增代码或数量增加时阻断，数量减少可以继续，不能因为命令返回 0 就忽略；

- 根画幅、`data-duration`、`const DUR` 与本期路线规定的画幅和正式时间来源一致；
- 构建版已完成字幕注入，无残留占位符；字幕、对象和标题无错误遮挡；
- 主时间轴与确定性要求按[合成契约](visual_contract.md)。

按[首次可见复核](visual_review.md#首次可见复核方法)检查实际浏览器，再用实际 MP4 复核；静态检查不能替代。

## GPU 与资源使用

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

只有 smoke 成功且标签显示 `h264_nvenc` 才能进入正式渲染。任一命令失败时停止并说明原因，不允许静默改用 CPU `libx264`；失败产生的空 smoke 文件可以按上述精确路径删除。实际渲染质量由所属路线规定。

资源规则：

- `--browser-gpu` 强制 Chromium 使用主机 GPU 绘制；日志应显示浏览器硬件 GPU 生效；
- `--gpu` 启用 FFmpeg GPU 编码；没有该参数时即使浏览器使用 GPU，H.264 仍可能由 CPU `libx264` 编码；
- 分幕严格串行，禁止同时启动多个 render；
- 每幕 render 完成后先确认文件可读取、相关 Chrome/Node/FFmpeg 子进程已退出，再执行 mux 或下一幕；
- 出现 `Timed out closing browser` 时，即使退出码为 0 也必须单独探测文件；若 `stat`、`ffprobe` 等基础命令持续超时，停止后续渲染，等待系统恢复。


每幕默认 2 个 worker，使用 --browser-gpu 绘制、--gpu 编码；两者不能互相替代。输出若仍为 libx264，或浏览器关闭超时后文件不可读取，立即停止，不静默回退 CPU。每幕完成探测、全文件解码及编码器核验后才进入下一幕。

## 分幕与整片媒体核验

在本期实际输出上运行 ffprobe，核对视频流、音频流、尺寸、帧率、像素格式、Profile、编码器、采样率和声道符合制作索引 publish_spec；时长与所属路线正式时间表一致，仅允许已定义的帧取整或编码容差。差异超出容差须查明原因。

```bash
ffprobe -v error -show_entries format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:stream_tags=encoder -of json <实际视频.mp4>
ffmpeg -v error -i <实际视频.mp4> -map 0:v:0 -map 0:a:0 -f null -
```

全幕和最终整片均须完整解码成功且无错误。按[共用视觉检查](visual_review.md)核对实际抽帧、连续过程、接点及全片；实际媒体通过不代表视觉表达通过。

## 主体停滞工具的能力边界

配置 acts[].motion_check 后，review/publish 在该幕渲染、合音与解码之后调用 build/common/check_course_motion.mjs，报告为本幕构建目录 motion-report.json，失败阻止后续分幕。是否必须配置、使用何阈值由所属路线规定；未运行须记未执行。

```bash
node --env-file-if-exists=.env build/common/check_course_motion.mjs <本幕视频.mp4> <宽:高:x:y> <报告.json> <阈值秒数>
```

该工具用 FFmpeg freezedetect 检查缩小后的灰度主体帧，覆盖静止到片尾的情况。缺省 6 秒只表示工具默认参数，不是所有场景的时长要求。主体区域覆盖解释对象，排除字幕及常驻装饰，不能裁成不停转动的小图标。不得仅为消除失败放宽阈值。

工具只检测像素变化：完整答案提前出现后不断移动也可能通过。首次可见、语义、视觉表现、用户审片必须分别记录，不能用 motion-report 的 passed 代替。

## 缓存、版本与发布交接

执行与版本保留按[共同执行规则](execution.md)。发布前先满足所属路线审片与封面条件，输出方式由路线决定；本文件不要求所有路线重新渲染。正式规格来自索引，发布包一致性、生成后登记和公开发布授权由[发布交付](release_delivery.md)维护。

缓存复用必须满足前述输入签名、输出哈希、当前验收签名及完整解码条件；不手工补签名冒充完成。成片验收不等于可以删除缓存，按[清理规则](published_cleanup.md)处理。

## 常见失败信号

| 现象 | 检查 |
|---|---|
| render 返回 0，但只有背景 | 时间轴创建、注册与确定性，字幕注册是否早于主时间轴 |
| 对象挤到左上角或文字越界 | 合成根及祖先宽高、安全区、真实字体、层级 |
| 初始已经摆齐，后面只高亮 | 初始显隐、父子状态和本期计划，不只查场景切换点 |
| 同一时刻正播与倒退不同 | 真实时钟、无种子随机数、回调或播放历史依赖 |
| 分幕正常而拼接异常 | 分幕流参数、concat 顺序、正式时间表边界 |
| 文件存在却不能发布 | 路线审片条件、正式封面、版本文案、索引和台账 |

## 入口维护后的回归检查

修改公共编排或产物登记代码后，运行公共与两路线相关测试；只整理文档时检查引用和规则覆盖，不以未运行的测试声明通过。

```bash
node --test tests/node/course_video.test.mjs tests/node/course_video_incremental.test.mjs tests/node/check_course_reveal.test.mjs tests/node/check_course_motion.test.mjs tests/node/check_course_release.test.mjs tests/node/vibe_workflow.test.mjs
```

实际片段对齐测试可设置 COURSE_PREVIEW_FILE、COURSE_PREVIEW_REFERENCE、COURSE_PREVIEW_WAV、COURSE_PREVIEW_START 后运行 course_video_incremental.test.mjs；未提供参数会跳过该集成项。测试不替代正式 GPU 渲染及全片审看。
