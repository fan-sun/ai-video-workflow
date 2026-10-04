# 教学选题、登记与标准路径

本仓库制作 `concept_explainer`：基础知识、术语、方法和当前热点词的教学讲解。每期讲清概念是什么、如何工作、用途及边界。

## 选题与查重

在预留期号前运行：

```bash
npm run topic:check -- --topic "候选概念" --summary "核心问题和讲解角度"
```

`course/episodes.json` 的 `topic_terms` 保存完整概念及中英文别名。规范化后的完整匹配是唯一查重硬门禁；“提示词”不阻止“提示词工程”。BM25 和可选的语义结果只提醒相关往期，不自动拒绝扩展概念。缺少 `SILICONFLOW_API_KEY` 时必须记录语义提醒未执行。

查重命令退出码：`0` 完整检查通过，`1` 执行错误，`2` 精确主题重复，`3` 精确查重通过但缺少 Key、语义提醒未执行。退出码 `3` 不能记录为完整语义检查；明确记录缺项后可按 SOP 继续选题。

调研优先使用原始论文、官方文档和直接资料。记录来源链接与采集日期，不把旧榜单或旧讨论量当成当前热度。明确观众的认知缺口、可解释机制、实际用途及适用边界。

### 阶段 0 选题确认概要

登记后向用户交付五项简短概要：主题；受众与认知缺口；第一至第四幕各一句话并分行；原资料主干；预计时长。用户确认后进入写稿，已有明确确认继续有效。

## 标准路径与目录初始化

```bash
npm run init:episode -- 01-topic-slug --topic "主题词"
```

初始化会建立标准目录，登记真实台账，并创建四幕空制作索引；重复运行保留已有文件和用户修改，不重复登记，不复用已占用期号。首次仓库附带空白台账，已有期次时不能用空台账覆盖历史。

| 内容 | 路径 |
|---|---|
| 总台账 | `course/episodes.json` |
| 已公开发布目录 | `course/published-videos.json` |
| 本期索引和专用制作脚本 | `course/episodes/NN-slug/` |
| 讲解稿 | `course/scripts/NN-slug.md` |
| 整期切分预览 | `course/episodes/NN-slug/旁白切分预览.json` |
| 四幕正式 JSON | `pipeline/01_script/NN-slug/course_epNN_actN.json` |
| 原始逐句音频 | `pipeline/02_audio/NN-slug/course_epNN_actN_voxcpm_raw/` |
| 正式音频和 timings | `pipeline/02_audio/NN-slug/course_epNN_actN_voxcpm/` |
| 整期时间表 | `course/episodes/NN-slug/整期时间表.json` |
| 正式画面源 | `course/acts/epNN_slug/actN.html` |
| 风格目录 | `course/docs/video_style_presets.html` |
| 封面候选与正式封面 | `course/episodes/NN-slug/cover-options/`、`cover.png`、`cover-2x.png` |
| 临时构建 | `pipeline/build/course_epNN_actN_vK_review/` 或 `..._publish/` |
| 版本成片与文案 | `pipeline/output/course/epNN_slug/vK/` |

`build/` 只放跨期工具，本期脚本必须放在本期期目录。路径还未生成时索引填 `null`。新索引使用 `production_contract: "current"`，从第一期执行完整的章节栏、片尾和发布文案要求。

台账记录 `ep`、`type`、`topic`、`topic_terms`、`slug`、`status`、`publish_status`、`version`、`selection_note`，真实稿件和成片路径生成后再登记。主题别名全台账内唯一；期号用于正式文件后不能复用。

每幕记录正式 JSON、音频、timings、画面源、`subtitle_highlights` 和 `allowed_warnings`。字幕重点使用 `{ "unit_id": "gNN.uNN", "text": "精确文字", "reason": "理由" }`，整期 6～10 个；不能混用旧字符串格式。`publish_spec` 保存机器可校验的尺寸、帧率、视频/音频编码、时长与容差，不能用自由文本代替。

完成选题确认后读取 [概念讲解稿规范](script_writing_explainer.md)，完整后续流程见 [主 SOP](sop.md)。
