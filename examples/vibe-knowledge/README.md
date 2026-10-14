# 8秒Vibe技术示例

主题固定为沉没成本：花掉的钱收不回，剩下的时间还能选择。两段各4秒，无人声旁白，完整屏幕文字与词级强调，1920×1080、30fps；3:4代码封面独立交付。它验证通用入口，不占用正式期号，也不代表用户审看认可。

先准备通用环境：

```bash
npm run doctor -- --route vibe
```

从仓库根目录按顺序执行：

```bash
npm run example:vibe -- prepare
npm run example:vibe -- video
npm run example:vibe -- mix
npm run example:vibe -- package
```

- prepare复制当前通用工具与字体到隔离目录，初始化Vibe索引，生成画面时间表、两段动画源码、真实代码封面与本地合成测试声音。
- video使用正式review入口，串行检查、高清渲染、合入动作测试音、拼接并输出本地质检页。
- mix使用正式混音入口，以动作100%、测试音乐25%验证增益、起止、视频编码数据不变及无削波。这是固定技术参数，不伪造用户选择。
- package生成同版发布TXT，使用正式publish入口复制高清视频并检查视频、独立封面、文案、章节和台账。

默认工作区`.local/vibe-example/`，输出位于其`pipeline/output/course/ep01_sunk-cost/v1/`：

- `course_ep01_sunk-cost_v1.mp4`：无BGM审片底片。
- `course_ep01_sunk-cost_v1_sfx100_bgm25.mp4`：已混测试音乐的审片版。
- `course_ep01_sunk-cost_v1_publish.mp4`、同版TXT、`cover.png`与`release-check.json`：高清发布及验收。
- `qc/report.html`：实际导出关键帧质检；封面在工作区`course/episodes/01-sunk-cost/cover/cover.png`。

测试音由FFmpeg生成，无下载、密钥、VoxCPM或个人参考声音；不把它当成正式音乐或动作音色。封面采用代码方式验证共同交付，正式项目可按[路线规则](../../course/docs/vibe_workflow.md)选择AI生图。

输出保留在隔离目录，不修改正式两份台账。四步可重复运行；已有成片时prepare只同步通用工具，保留制作数据。需要验证修改后的示例文字或画面源时，用`VIBE_EXAMPLE_DIR`指定新的工作区，再按四步运行，保留旧结果。修改通用工具后可重新prepare，再执行受影响的后续阶段。
