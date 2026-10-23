# Vibe自有场景素材库

从已完成的Vibe作品保存完整的局部场景，保留对象、材质、动作、运镜和依赖。与[20种完整风格](../vibe-styles/README.md)、[8类基础动效](../vibe-motion/README.md)共存；自有片段不算新增风格编号。

## 查看

在项目根目录运行：

```bash
npm run preview:styles
```

打开终端显示的地址，点击“自有场景”；默认地址为`http://127.0.0.1:5591/scenes/`。可以切换原效果与复用demo、播放、暂停和拖动。已导出时会显示MP4入口。实时预览运行原场景代码，无BGM；WebGL场景的实时流畅度取决于电脑，导出MP4便于完整观看。

## 已收录的五项

| 场景ID | 原片范围 | 长度 | 实际可改内容 |
|---|---|---|---|
| `feeling-scale` | 损失厌恶01:38.1—01:46.6 | 8.5秒 | 标签、形变单字和比例；砝码与倾角联动 |
| `cinema-exit` | 沉没成本01:24.8—01:34.8 | 10秒 | 剩余分钟数、票名、去留及剩余时间标签；刻度数量联动 |
| `choice-comparison` | 选择过载00:11.333—00:15.4 | 约4.07秒 | 12个菜品名称及造型编号、5次选择的顺序、手机标题 |
| `attention-contrast` | 聚光灯效应00:10.4—00:18.2 | 7.8秒 | 注意标签、五字立体标题，保留字形厚度和扫光 |
| `many-worlds` | 聚光灯效应01:26.033—01:35.1 | 约9.07秒 | 两次近景的空间顺序，保留拉远、转向和回全景 |

每项含原效果、复用示例和来源校验记录。取的是完整动作段，因此边界与用户最初报的近似秒数不同。四个新增片段保留原工程的共享场景构造、人物和依赖，仅裁定时间段、去除本期正文字幕并开放对应参数。它们仍有题材边界：影院仍是影院，菜单仍是菜品，生活街区仍是三个已有空间；换成其他行业的道具，需要在工作副本里改造型。

## 使用新增四项

与天平使用同一个入口，以下以菜品比较为例：

```bash
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs prepare choice-comparison
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs render choice-comparison
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs render choice-comparison templates/vibe-scenes/choice-comparison/demo.json
```

其他三项替换场景ID即可。四项的示例预设名为`demo`，天平沿用`focus`。复制各目录的`demo.json`到本期期次，再改其中的`settings`与`outRoot`；prepare/render会重新生成相应工作副本。默认输出`.local/vibe-scenes/<场景ID>/<original或demo>/preview.mp4`。

- 影院：`minutes`为10—120的整数；文字字段最多5字。数字和刻度一起变化，动作时长不变。
- 菜品：`items`必须12项，格式为`[名称,造型编号]`，名称最多6字。造型0—9依次为拌饭、汤面、咖喱、饺子、鸡排饭、汉堡、寿司、意面、沙拉、披萨。`attempts`是5个0—11的候选索引，决定路径依次指向哪盘菜。当前未开放菜价。
- 注意力反差：`attentionLabel`最多5字，`title`恰好5字。原标题和“注意力转移”的矢量已随库保存，不需要额外安装。其他标题通过prepare调用`title_glyphs.py`生成真实字形，需要带fontTools、Brotli的Python；用环境变量`SCENE_PYTHON`指定解释器。缺字体或工具时明确报错，不退化为平面文字。
- 多空间：`focusOrder`包含两个不同编号，0＝通勤站台，1＝工作桌，2＝出门玄关。示例从原先的工作桌→玄关改为站台→工作桌；前后的全景和人物行为保持连续。

新增四项的浏览器检查命令为`node examples/vibe-scenes/check-batch.mjs`，报告在`.local/vibe-scenes/batch-check/`。原效果对照需要本地`.local/vibe-scenes/source-references/`，由本次归档提取脚本生成；正常使用库和渲染无此依赖。

## 首项：实体天平——权重失衡

- 来源：损失厌恶最终整片v15，第三幕沿用v11源码。
- 保留范围：原片约01:38.1—01:46.6，独立场景8.5秒。
- 连续过程：蓝图部件组装→扫描显现实体→两个字形聚成砝码→依次落盘并回弹→天平失衡→镜头拉开，比例与标注跟随落定。
- 原例内容：得到的乐／失去的痛，1∶2.25。
- 复用示例：日常事务／重点任务，1∶3。此处为精力分配的演示比例。
- 适用：权重比较、感受差异、资源分配。当前实现只支持右侧不轻于左侧的1—3倍示意关系，不是物理测量器。

源码和依赖在[场景目录](../../templates/vibe-scenes/feeling-scale/)，[来源记录](../../templates/vibe-scenes/feeling-scale/来源.json)包含原文件和校验值。抽出的场景去掉了上一段题目纸张和本期字幕，保留天平本体、扫描、12000点形变、材质光照、落盘回弹、镜头与引导线。参数联动改变右侧砝码体积、最终倾角、粒子目标和跟随标注。

## 换内容与准备工作副本

可改六项：标题、左右标签、左右形变单字和右/左比例。标题最多10字，标签最多8字，形变文字各1字；当前支持比例1—3。输入限制用于保留现有构图，不承诺任意长句可直接放入。

设置文件示例：

```json
{
  "preset":"focus",
  "outRoot":"course/episodes/NN-topic/scene-work-v1",
  "settings":{
    "title":"精力分配",
    "leftLabel":"日常事务",
    "rightLabel":"重点任务",
    "leftGlyph":"日",
    "rightGlyph":"重",
    "ratio":3
  }
}
```

先准备默认原效果，或用真实设置文件准备本期副本：

```bash
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs prepare feeling-scale
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs prepare feeling-scale examples/vibe-scenes/focus-demo.json
```

默认产物分别在`.local/vibe-scenes/feeling-scale/original/`与`focus/`。设置outRoot时，输出为`<outRoot>/feeling-scale/<preset>/`。只改本期副本；prepare及下面的库render会从库内源码重新生成对应副本，手动改过副本后不要用它们覆盖。

## 导出与接入本期

原效果及复用demo都使用high、1920×1080、30fps、GPU输出，无音轨：

```bash
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs render feeling-scale
node --env-file-if-exists=.env examples/vibe-scenes/run.mjs render feeling-scale examples/vibe-scenes/focus-demo.json
```

输出为各副本的`preview.mp4`。手动修改后的副本用既有渲染器直接导出：

```bash
node --env-file-if-exists=.env build/common/hyperframes_hidden.mjs render <工作副本目录> --output <片段.mp4> --quality high --fps 30 --workers 2 --browser-gpu --gpu
```

选用前先看完整过程，按本期表达确认是否适合。渲染片段按既有方式复制到本期素材目录并登记visual_assets，作为静音视频接到整幕；正文字幕和动作声由本期时间表安排。要更深地改变动作或镜头，可编辑场景工作副本，继续使用唯一暂停时间轴并重新审看。天平固定8.5秒，其他条目时长见目录，不通过整体变速强行凑字幕时长。

## 验证与新增

```bash
node --test tests/node/vibe_scenes.test.mjs tests/node/vibe_styles.test.mjs
node --env-file-if-exists=.env examples/vibe-scenes/check.mjs
```

检查涵盖独立准备、参数边界、旧入口可用、原场景视觉对照、倒退、实际播放推进与参数联动。源码对照需本地保留的ep05第三幕v11；正常使用库和生成工作副本不依赖原期次或specs。浏览器报告在`.local/vibe-scenes/check/report.json`。技术验证与用户对新demo的视觉认可分别记录。

首项两个版本已实际导出8.5秒、1920×1080、30fps、255帧的静音MP4，并通过完整解码和关键帧审看。默认效果在抽取段2.2、2.8、3.6、6.7、8.2秒与去掉字幕的原实现对照通过，倒退定位无残留；这不代表包含已移除题目纸张的前段也与原片逐帧相同。当前机器首次加载约39—58秒；HyperFrames 0.6.113的`validate`在10秒导航限制处超时，未记为通过，使用独立浏览器检查和实际渲染核验。静态lint通过。

后续新增一项：把实现与必要依赖放入`templates/vibe-scenes/<id>/`，记录来源和使用范围，加入catalog.json，并按实际内容接入准备、预览及验证。沿用SceneConfig参数接口、唯一暂停时间轴和统一预览接口；目录里声明各预设的名称与用途。不能只追加目录就声称效果已经可用。
