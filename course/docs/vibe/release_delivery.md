# Vibe发布文案与交付

用于[SOP第5、6步](sop.md#5-独立封面与发布文案)。通用格式、章节、公开发布及归档执行[共用发布交付](../common/release_delivery.md)，本文只维护Vibe专属要求。

## 发布文案

发布TXT依次包含标题、发布文案、标签、视频总结、视频章节。

- 标题为`Vibe知识大赏｜主题词：短问题或反差`，冒号后含标点最多15个字符，通常10～12个汉字即可，不为凑长度加词。
- 正文简短展开同一个矛盾，结尾保留一个有力的问题，避免重复反问。只改发布文案不自动改讲解稿或视频。
- 标签包含`#Vibe知识大赏`及与主题相关的标签；不强制`#AI基础`或`#深度讲解`。
- 总结内容解释核心认识和必要边界；长度、禁用内容及独立性按[共同文案格式](../common/release_delivery.md#二发布文案格式)。
- 发布章节按[共同章节规则](../common/release_delivery.md#三章节标题与时间)生成；不要求视频覆盖栏。

## 发布包

完整最终视频获用户确认后，助手在`review_approval`保存`confirmed: true`、用户原话与该文件的SHA256。发布入口拒绝确认后变动的文件；示例例外只表示技术核验，不创建用户认可。

```bash
npm run vibe:publish -- course/episodes/03-topic-slug/制作索引.json
```

发布入口直接复制已确认的high审片版，将选定的独立封面复制为同目录`cover.png`，保留同版文案，并执行路线发布检查。它核对文件、版本、规格、时长、章节、文案、音轨一致、3:4封面和台账；不要求片尾静音或首帧嵌入封面。通过后保存`release-check.json`，真实登记`publish_bundle.complete`。

修改文案、封面或索引后独立复查：

```bash
npm run vibe:check-release -- course/episodes/03-topic-slug/制作索引.json
```

新期次输出在`pipeline/output/vibe/epNN_slug/vK/`；历史目录兼容按共用输出规则。公开上传须按用户授权另行执行，不把本地交付写成已公开发布。生成视频、用户声音、音乐、模型、密钥和个人路径继续本地忽略；生产规则和通用工具随仓库分发。
