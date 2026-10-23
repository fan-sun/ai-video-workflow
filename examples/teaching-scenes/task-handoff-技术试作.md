# AI教学素材库：任务分工与交接

教学路线首项，与 `templates/vibe-scenes/` 分开。保存画面源码、可改内容和旁白—动作绑定，当前固定3:4、三个助手、价签／评论／地图三类道具。

原例来自EP06《多智能体协作》第一幕25.426—44.416秒，约19秒；复用例为咖啡店选址，约24秒。均含配音、不加配乐，属于技术小样，不代表正式课程的试听或审片确认。

## 打开预览

在项目根目录运行，打开终端显示的端口下的 `/teaching-scenes/`：

```bash
node examples/vibe-styles/run.mjs serve
```

默认端口5591。如已占用，可另开5594：

```bash
node --input-type=module -e "import {serve} from './examples/vibe-styles/run.mjs';serve(5594)"
```

选择原片或复用例；点击旁白定位画面，下载有声MP4。从WSL调用Windows程序时使用 `node.exe`。

## 文件位置

- `templates/teaching-scenes/task-handoff/`：实际SVG、字体、配色、动作及来源记录。
- `examples/teaching-scenes/original.json`、`demo.json`：两个输入样例。
- `.local/teaching-scenes/inputs/`：本机逐句配音、整轨WAV与实测timings。
- `.local/teaching-scenes/task-handoff/<版本>/`：工作副本、旁白分镜对照及有声 `preview.mp4`。
- `specs/视频素材积累/教学入库demo/`：选段、讲解稿、提取脚本及验收记录。

## 换成自己的任务

1. 复制 `demo.json` 到本期目录，修改 `content` 中的任务名、资料名、标题和结尾问句。价签对应价格／租金，评论对应用户需求，地图对应位置／覆盖；无关概念须同时更换道具。
2. 按教学流程生成本期配音及timings，修改 `audio`、`timings`。路径相对项目根目录。
3. 将 `binding` 的九个动作键绑定到实际 `subtitle_units[].id`；没有切分单元时使用phrase ID。顺序必须与讲解一致。
4. 新任务设置独立 `outRoot`，再准备、导出：

```bash
node examples/teaching-scenes/run.mjs prepare examples/teaching-scenes/demo.json
node examples/teaching-scenes/run.mjs render examples/teaching-scenes/demo.json
```

`prepare` 可重复运行，会覆盖设置指向的工作副本，不改正式课程。`render` 先渲染静音画面，再封装真实配音。HyperFrames“没有audio元素”的提示针对中间静音文件；最终 `preview.mp4` 应含AAC音轨。

动作保留原速度，不按总时长平均分配、不整段拉伸。极短新讲解须检查动作能否完成；本例不支持任意语速、人数和道具。结尾表达“材料收齐后仍需综合”，适合接后续判断或决策。

## 重建与验证

原例输入可运行 `python specs/视频素材积累/教学入库demo/提取原场景.py` 重建；会重新提取原场景模板与音频片段。新例沿用现有VoxCPM参考声音：

```bash
node --env-file-if-exists=.env build/common/run_python.mjs pipeline/02_audio/voxcpm_tts.py --job specs/视频素材积累/教学入库demo/咖啡店选址-配音稿.json .local/teaching-scenes/inputs/demo/raw
node --env-file-if-exists=.env build/teaching/course_audio.mjs specs/视频素材积累/教学入库demo/咖啡店选址-配音稿.json .local/teaching-scenes/inputs/demo/raw act1 --out-dir .local/teaching-scenes/inputs/demo/processed --speed 1.15
```

音频工具拒绝覆盖已有处理结果。重配请换输入目录并更新设置。原例字幕沿用语义级估算；新例每个配音segment只有一个unit，以实测句子边界定位动作。

```bash
node --test tests/node/teaching_scenes.test.mjs
node examples/teaching-scenes/check.mjs
```

核验动作首次出现、倒退残留、原动画抽帧对照、两个MP4的播放与逐句定位，记录在 `.local/teaching-scenes/check/report.json`。接入正式课程时继续遵循教学SOP的试听、分镜与审片要求。
