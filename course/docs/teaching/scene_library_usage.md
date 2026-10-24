# 教学画面素材：使用流程

在教学画面编排和实现阶段执行本流程。素材是可编辑的无声画面结构，使用时仍须对齐本期旁白、分镜和已选视觉风格。下文路径相对内部项目根目录 `ai-video-workflow/`；用户已有选择直接沿用。

用户要求把某个片段加入素材库时，执行同目录 `scene_library_addition.md`。Vibe沿用自己的素材库与制作流程。

## 1. 先确定分镜需要表达什么

读取本期正式稿、timings、制作索引和已有视觉节拍表。在写画面代码前，查看 `templates/teaching-scenes/catalog.json`，按“对象关系＋主动作＋结果”找结构，并播放有希望条目的完整预览。目录名称只能帮助定位，还要读取该项的 `来源.json`、`presets.json`，核实实际动作及可替换范围。

启动现有预览服务：

```bash
node examples/vibe-styles/run.mjs serve
```

访问终端实际端口下的 `/teaching-scenes/`。预览视频尚未生成时，先按第2节准备和导出；源码和素材的正常使用不依赖 `specs/` 中的历史筛选记录。

例如，讲“消息交给不同对象处理”可检查 `route-switch`，讲“选一个候选补入结果”可检查 `choice-fill`。选用依据是实际动作能否解释这句旁白；不因题材名称相近就直接套用，不设每幕必须用几项的数量要求。没有合适结构时按本期内容设计。

选用后，在本期唯一的 `视觉节拍表.md` 对应分镜中补充以下内容，不另建一张素材计划表：

- 素材ID、具体源文件，以及保留哪些造型、运动或镜头。
- 对应旁白原文、ID、真实时段，动作在什么词句触发。
- 本期要替换的对象与内容、初始可见状态、动作结果，以及前后如何接续。

素材预览的初态可能已经摆出多个对象。接入教学时仍按旁白安排首次出现，不能直接把整段预览当成分镜编排。正常选用由助手完成，随原有审片环节检查，不新增逐个素材审批。

## 2. 准备本期工作副本，替换实际内容

正式实现位于 `templates/teaching-scenes/<素材ID>/`。保留其有效造型和动作，从工作副本修改。读取 `presets.json` 的字段和原型，不把某项固定三对象、固定路径的能力理解成任意数量或自动排版。

在本期 `course/episodes/NN-slug/vK/` 保存设置JSON。以下是 `object-swap` 的完整设置形状；将期号、版本、标签和图片路径换成本期真实值，其他素材使用其自身字段：

```json
{
  "preset": "original",
  "outRoot": "course/episodes/NN-slug/vK/scene-work",
  "settings": {
    "socketLabel": "统一接口",
    "oldLabel": "原组件",
    "newLabel": "新组件",
    "oldAsset": null,
    "newAsset": null
  }
}
```

`outRoot` 用本期独立路径。图片参数填相对项目根目录的真实SVG、PNG、JPEG或WebP路径；为null时使用原造型。运行现有入口：

```bash
node examples/teaching-scenes/visual.mjs prepare object-swap course/episodes/NN-slug/vK/scene-settings.json
```

输出为 `<outRoot>/<素材ID>/<original或demo>/`，含HTML、时间轴、依赖、替换素材及解析后的设置。先检查换图、文字长度、字形和对象是否合适，再制作实际片段。仅改设置时可运行同一命令的 `render`，它会重新准备工作副本、检查并导出 `preview.mp4`。

**手工改过工作副本后，不再对该副本运行库的prepare或render。**这两个入口会从模板重新复制文件。此时直接检查和渲染已修改的副本：

```bash
node build/common/hyperframes_hidden.mjs lint <工作副本目录>
node build/common/hyperframes_hidden.mjs inspect <工作副本目录> --at <起点,动作中段,落定时点> --json
node build/common/hyperframes_hidden.mjs render <工作副本目录> --output preview.mp4 --quality high --fps 30 --workers 2 --gpu
```

命令中的尖括号替换为实际值；Windows跨WSL运行时使用 `node.exe`。渲染资源继续遵循现有渲染规范。替换对象、运动时点或时长时保留本期版本，不回写正式模板。

## 3. 接入本期分幕

按是否需要修改动作，选择一种接入方式：

| 方式 | 实际步骤 |
|---|---|
| 合并可编辑实现 | 把选中对象及所需绘制、样式、动作迁入本期 `course/acts/epNN_slug/actN.html`；处理ID和变量冲突，动作加入本幕已有的暂停主时间轴，按分镜触发。去掉独立预览的合成根、时间轴注册和播放控制，不引入第二套播放时钟。 |
| 接入已渲染片段 | 将验收过的无声MP4复制到本期画面素材目录，使用稳定且不冲突的文件名；在分幕HTML中按分镜安排播放起止、位置和裁切，字幕与旁白继续由本幕正式timings驱动。 |

两种方式使用的外置图片、视频、脚本等文件都登记在制作索引对应幕的 `acts[].visual_assets`，填写相对仓库路径。构建入口按文件名复制到 `assets/`，因此文件名须互不冲突，HTML相应改为 `assets/<文件名>`。不能只依赖 `.local/` 预览地址、绝对盘符或原期次目录。

保留本期画幅、章节栏和字幕安全区；移除素材自带的重复栏目或讲解字幕。素材本身不生成配音和配乐，旁白沿用本期已确认音频。需要改变节奏时调整本期工作副本的动作与停留，不拉长静帧或整体变速来凑旁白；固定开场仍沿用原SOP。

## 4. 在实际分镜中验证并交付

先检查一个完整动作段，再展开其他分镜。按对应旁白核对起点、中段、接触或转折、落定以及相邻接点：对象身份连续，路径、目标、明暗和内容同步；重要字形、标签与落点对齐；倒退定位无残留。实际更换对象后还要检查造型和尺寸，不能只凭模板示例通过。

独立素材预览合格后，仍须通过本期 `teaching:review` 的局部及整幕检查。按 `visual_workflow.md`、`../common/visual_contract.md` 和 `../common/visual_review.md` 完成语义对位、首次可见、构建依赖和实际视频审看；独立素材的检查不替代本期审片。

交付本期预览、对应分镜范围、所用素材ID和主要修改。日常使用不会新增库条目；本期改出了值得跨主题复用的新结构，且用户要求积累时，再进入添加流程。
