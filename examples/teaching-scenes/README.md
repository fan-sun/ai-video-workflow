# 教学画面素材：通用结构

制作视频时执行 `course/docs/teaching/scene_library_usage.md`；用户要求添加素材时执行 `course/docs/teaching/scene_library_addition.md`。选用、编排、优化和入库规则在这两份生产文档维护，本页说明现有条目、参数及命令。

这里只收独立的无声画面结构，不要求讲解稿、配音或timings。现有8项，均为1080×1440、30fps、无任何音轨。A、E及其通用化示例已获认可；01-A、01-B、08-A、外层O17-A、O19-A及O11-A优化版由用户选中入库，换主题版本用于验证。

| 素材ID | 保留的结构 | 实际替换示例 |
|---|---|---|
| object-swap | 固定接口与连接，旧对象上移退出，新对象接替 | 模型芯片 → 电池 |
| door-reveal | 门扇打开，露出空间，同一人物迈步进入 | 工作室 → 展厅 |
| scan-transfer | 输入扫描、提取结果、送入目标并确认（5.4秒） | 小票入账 → 照片标签归档 |
| rule-preview | 左侧规则、右侧动态图形及时间游标（5.8秒） | 时钟图形 → 包裹 |
| focus-detail | 总览选中第二项、放大、叠化进入详情（3.3秒） | 流程文件 → 摄影展详情及配图 |
| list-transfer | 同一组三个对象依次跨栏迁移，左侧腾空、右侧接收（3.3秒） | 规则纸页 → 三张照片归入相册 |
| route-switch | 消息与路径共同切换目标，仅当前工位高亮（4.2秒） | 客服分流 → 图像、文字、音频任务分流 |
| choice-fill | 选中的同一对象连续进入可见结果槽，未选项淡化（2.8秒） | 候选词填句 → 天气图标写入结果 |

素材源码位于 `templates/teaching-scenes/<素材ID>/`。本期使用时复制为工作副本，修改参数，不覆盖模板。查重按画面结构和动作；同一模板的两个示例不是两个素材。

## 入库保存在哪里

| 保存内容 | 项目根目录下的位置 |
|---|---|
| 正式目录，记录名称、结构、用途和状态 | `templates/teaching-scenes/catalog.json` |
| 每项可编辑素材 | `templates/teaching-scenes/<素材ID>/`：`index.html`画面、`timeline.js`动作、`presets.json`替换参数、`assets/`图形、字体、GSAP和`来源.json` |
| 浏览页面、接入工具与使用说明 | `examples/teaching-scenes/` |
| 可重建的工作副本及无声MP4 | `.local/teaching-scenes/visuals/<素材ID>/<original或demo>/` |
| 候选片段、选择依据和本地筛选记录 | `specs/视频素材积累/`内的对应批次目录 |

`.local/`和`specs/`用于本地展示与过程留档，正式复用代码不依赖它们；预览MP4丢失可从模板重新导出。Vibe库仍在`templates/vibe-scenes/`，两条路线分别登记。

## 预览

启动已有素材服务器后，访问终端端口下的 `/teaching-scenes/`：

```bash
node examples/vibe-styles/run.mjs serve
```

默认5591；本轮已运行的页面为 `http://127.0.0.1:5594/teaching-scenes/`。可同时播放原造型与换主题版本，或直接下载无声MP4。

## 准备和导出

在项目根目录运行。WSL调用Windows程序时使用 `node.exe`。

```bash
node examples/teaching-scenes/visual.mjs prepare object-swap
node examples/teaching-scenes/visual.mjs render object-swap
node examples/teaching-scenes/visual.mjs render object-swap examples/teaching-scenes/visual-demo.json
node examples/teaching-scenes/visual.mjs render door-reveal
node examples/teaching-scenes/visual.mjs render door-reveal examples/teaching-scenes/visual-demo.json
```

输出为 `.local/teaching-scenes/visuals/<素材ID>/<original或demo>/`，含独立HTML、动作代码、实际替换资产、设置和 `preview.mp4`。重复运行会更新对应工作副本。新一期请在设置JSON中指定独立 `outRoot`，避免覆盖示例。

## 更换内容

复制以下设置到本期目录，填写真实素材路径；路径相对项目根目录。然后把设置JSON作为上述命令的第三个参数。

```json
{
  "preset": "original",
  "outRoot": ".local/my-episode/visuals",
  "settings": {
    "socketLabel": "统一接口",
    "oldLabel": "原组件",
    "newLabel": "新组件",
    "oldAsset": null,
    "newAsset": null
  }
}
```

A的 `oldAsset`、`newAsset` 可填本地SVG、PNG、JPEG或WebP。为null时使用原芯片及标签；提供图片时用图片整体替换，原芯片标签不再显示。两个对象共用228×208的适配区，保持纵横比；不会自动把任意图片改造成统一风格。固定接口标签限10字。

E的设置只需：

```json
{
  "preset": "original",
  "outRoot": ".local/my-episode/visuals",
  "settings": {"roomAsset": null,"doorColor": "#d9b77d"}
}
```

`roomAsset` 为null使用原工作室，也可填写本地SVG／图片替换门后330×275区域；`doorColor` 为六位HEX。当前保留原人物与步态。换人物、门形、对象运动路线需要改源码，不宣称已有任意造型自动适配能力。

新增三个条目使用同一个命令，只需把素材ID换成表中对应ID。`scan-transfer`支持`inputAsset`、`targetAsset`和提取结果文字；扫描设备与路径固定。`rule-preview`支持`objectAsset`、面板标题、规则文字和对象标签；它是规则与结果的视觉演示，不执行输入的代码。`focus-detail`支持四张卡片、总览与详情文字、`detailAsset`；当前固定选中第二项，换选择位置需改源码。各项完整字段与示例见对应`presets.json`；以`Text`结尾的说明最多40字，其余标签最多10字，实际还需按版面检查换行与遮挡。

`list-transfer`同样使用`visual.mjs prepare|render list-transfer`。可改`sourceLabel`、`targetLabel`、`row1Text`～`row3Text`、`resultText`及三项各自的`row1Asset`～`row3Asset`。图片为null保留规则纸页，填写本地图片或SVG时加入对应缩略图；换内容示例为三张不同照片图形。固定三项与522×44的交接位移，不能通过参数自动增加数量或改变路径。接收框已补足第三项底部边距。

`route-switch`使用相同入口。可改`messageLabel`、`message1Text`～`message3Text`、`target1Label`～`target3Label`及`target1Asset`～`target3Asset`。道具为null时使用物流／售后／财务造型，填写本地SVG或图片时替换对应道具。人物与工位、三个目标数量和从上到下的切换顺序固定；消息替换后仍须检查一至两行的实际排版。

`choice-fill`同样使用`visual.mjs prepare|render choice-fill`。可改前文、处理器、候选区、结果区的标签与文字，以及`candidate1Asset`～`candidate3Asset`三张SVG或图片。当前固定三个候选、选择第一项、落入同一结果槽；前景文字或图形不缩放，金色背景单独收窄。换长文本仍须调整构图与落点，不支持自动排版。

动画时点集中在各条目的 `timeline.js`。当前展示时长2.8～5.8秒；如调整时长，需同时核对HTML的 `data-duration`、动作完成时机和末态停留。正式视频使用时才与本期文字或配音对齐，素材本身不绑定某句旁白。

## 来源与检查

各条目的 `来源.json` 记录原HTML、SHA256和选中对象。A移除课程包装后整体下移居中，保留对象间距与原动作；E保留原位置、门扇与行走曲线。扫描结构补齐原片入场，独立版5.4秒，候选截片为4.7秒；双栏和聚焦转场保留原动作时距及短叠化。换主题SVG为验证新制作，不冒充原片内容。

`list-transfer`来自外层17期整片112.6～115.6秒的O17-A，保留0.6秒逐项交接与原相对位置，去掉课程包装并缩短结果说明。`route-switch`来自外层19期58.4～60.4秒的O19-A，按用户反馈补全三目标明暗、消息内容及路径对齐，4.2秒优化版已获用户认可。保留原片来源和优化说明，不将补做效果冒充原片已有。

`choice-fill`来自外层11期13.0～15.1秒的O11-A。优化后由同一对象进入提前可见的结果槽，保持43像素字号与结果基线，修复原版淡出后换一份完整句子的突跳；2.8秒优化版已获用户认可。原片保留对照，天气图标版用于验证实际对象替换。

```bash
node --test tests/node/teaching_visuals.test.mjs
node examples/teaching-scenes/check-visuals.mjs
```

检查对象首现、倒退、替换图片显示、无声媒体及预览交互。首次准备或改素材后重新运行并核对实际画面。

以前的有声分工demo保留为技术历史：`narrated-demo.html`、`run.mjs`及 `task-handoff-技术试作.md`。它不计入本页的通用画面素材，也不作为后续默认入库形式。
