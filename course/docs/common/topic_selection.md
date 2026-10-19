# 选题、登记与标准路径

主题类型与表达路线分别选择。已选主题和路线按[共同执行规则](execution.md)沿用，内容组织与选题确认概要由所属路线定义。

## 选题与查重

在预留期号前运行：

```bash
npm run topic:check -- --topic "候选概念" --summary "核心问题和讲解角度"
```

`course/episodes.json` 的 `topic_terms` 保存完整概念及中英文别名。规范化后的完整匹配是唯一查重硬门禁；“提示词”不阻止“提示词工程”。BM25 和可选的语义结果只提醒相关往期，不自动拒绝扩展概念。缺少 `SILICONFLOW_API_KEY` 时必须记录语义提醒未执行。

查重命令退出码：`0` 完整检查通过，`1` 执行错误，`2` 精确主题重复，`3` 精确查重通过但缺少 Key、语义提醒未执行。退出码 `3` 不能记录为完整语义检查；明确记录缺项后可按 SOP 继续选题。


调研优先原始论文、官方文档及直接资料，记录来源链接和采集日期，不把旧榜单或旧讨论量当作当前热度。实际采用内容的核验按[事实与润色规则](script_content_review.md)。

## 标准路径与目录初始化

精确查重通过后，使用所属路线 SOP 的初始化命令建立索引，不手工伪造初始化结果。工具建立标准目录、登记真实台账；重复运行保留已有文件和用户修改，不重复登记，不复用已占用期号。空白台账不能覆盖已有历史。

| 内容 | 路径 |
|---|---|
| 总台账 | course/episodes.json |
| 已公开发布目录 | course/published-videos.json |
| 本期索引和专用脚本 | course/episodes/NN-slug/ |
| 正式讲解稿 | course/scripts/NN-slug.md |
| 整期时间表 | course/episodes/NN-slug/整期时间表.json |
| 画面源 | course/acts/epNN_slug/ |
| 封面候选与正式封面 | course/episodes/NN-slug/cover-options/、cover.png |
| 临时构建 | pipeline/build/course_epNN_actN_vK_review/ 或 _publish/ |
| 版本成片与文案 | pipeline/output/<路线目录>/epNN_slug/vK/ |

路线专属切分、声音、字幕时间和上传封面产物按各路线阶段文档登记。未生成路径填 null，生产规则与本地归档边界按[共同执行规则](execution.md)。

路线输出根目录由各自 SOP 明确声明，命令路由、路径计算和历史兼容按[共用输出规则](output_paths.md)。

## 索引与本期脚本

build/ 只放跨期工具，本期生成或修复脚本放在 course/episodes/NN-slug/，独立版本放其 vK/ 子目录。本期脚本随本期产物本地归档，跨期工具按仓库代码管理；优先复用现有入口，不要求每期创建生成器。初始化和 review/publish 按文件名检查本期脚本位置，编辑器能创建文件不代表该位置能通过生产入口。

新索引保留 production_contract: "current"，route 决定所属路线的产物与验收。publish_spec 用结构化字段保存真实尺寸、帧率、视频/音频编码、时长与容差，不能用自由文本替代。按路线登记正式时间来源，不创建占位文件伪装已生成。

台账记录 ep、type、topic、topic_terms、slug、status、publish_status、version、selection_note，真实文件生成后才登记。完整主题别名全台账唯一，期号用于正式文件后不能复用。发布状态含义及变更按[发布交付](release_delivery.md)。
