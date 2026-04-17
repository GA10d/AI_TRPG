# Version 3.0 内容生成器设计

## 1. 文档目标

这份文档定义一套面向用户可用的 `version 3.0` 剧本生成器设计。

目标不是“让 LLM 一次性吐出一堆文件”，而是建立一条稳定的生成流水线：

- 用户可以填写结构化表单，或上传旧版 `rule/story` 文件
- 系统先把输入统一整理成一份中间结构稿
- 再由脚本和 LLM 分工生成 `version 3.0` 所需文件
- 最后做校验、预览、局部重生成和导出

本文以你给出的 `version 2.0` 示例为基准：

- 规则输入：`version 2.0/Story/NIHON/Rule/NIHON_PROMPT.txt`
- 剧本输入：`version 2.0/Story/NIHON/Story/DAZHIZHAN/DAZHIZHAN.txt`

核心问题是：

1. 旧文件如何拆解
2. 每个目标文件如何生成
3. 哪些部分应交给脚本，哪些部分应交给 LLM
4. 提示词该如何分层设计，才能稳定映射到 `version 3.0`

## 2. 设计结论

结论先写在前面：

- 不能直接从一份旧规则文件和一份旧剧本文本，一步生成全部 3.0 文件
- 必须先建立一份 `NormalizedPackageSpec` 作为中间真相
- `manifest.json`、目录结构、文件命名、校验逻辑应尽量由脚本确定
- `rule.md`、`story.md`、`intro.txt`、`beginning.zh-CN.md`、`npc_prompt/*.txt`、图片提示词适合由 LLM 生成
- 图片本身交给 image model，但图片槽位规划必须先由 LLM 或规则引擎确定
- 整个系统必须支持“局部重生成”，不能整包全重跑

一句话概括：

> 生成器应采用“结构抽取 -> 结构补全 -> 文件生成 -> 校验导出”的分层架构，而不是“一个 prompt 直接写完整包”的黑箱架构。

## 3. 3.0 目标产物

### 3.1 最小可运行包

当前 `version 3.0` 运行时最低需要以下文件：

```text
content/
  <ruleId>/
    rule/
      manifest.json
      intro.txt
      rule.md
    story/
      <storyId>/
        manifest.json
        intro.txt
        story.md
```

### 3.2 完整体验包

建议生成器 V1 默认额外产出：

```text
content/
  <ruleId>/
    rule/
      manifest.json
      intro.txt
      rule.md
    story/
      <storyId>/
        manifest.json
        intro.txt
        story.md
        text_assets/
          beginning.zh-CN.md
        npc_prompt/
          <NPC名>.txt
        art_assets/
          cover.png
          other/
            map.png
            clue_board.png
            key_object.png
```

说明：

- `text_assets/beginning.zh-CN.md` 不是运行时绝对必需，但能直接提升开局稳定性
- `npc_prompt/*.txt` 当前 3.0 已可读取，适合直接作为 NPC 立绘 prompt 输入
- `art_assets/cover.png` 与 `art_assets/other/*.png` 已可被当前内容侧读取和展示

## 4. 输入类型

生成器应支持两类入口：

### 4.1 结构化填写

用户按 `规则范式.md` 与 `剧本范式.md` 填表：

- 规则元信息
- 世界观
- 判定机制
- 风险与后果
- 角色创建
- 行动与场景规则
- 剧本元信息
- 故事 Intro
- 场景节点
- 关键实体
- 结局结构
- 主持约束

这种模式下，LLM 主要负责润色、补全、转文件，不负责“猜结构”。

### 4.2 文件上传

用户上传已有文本，如：

- 一份旧规则 prompt
- 一份旧剧本文本
- 或者各自多份补充资料

这种模式下，LLM 先承担“结构抽取”职责，再进入统一生成流程。

### 4.3 规则与故事分开上传的绑定关系

生成器必须支持“规则单独上传”和“故事单独上传”。

但这两者在数据模型上不是平级独立的：

- 规则包输出到：`content/<ruleId>/rule/`
- 剧本包输出到：`content/<ruleId>/story/<storyId>/`

这意味着：

- 单独上传规则时，系统要确定或创建 `ruleId`
- 单独上传故事时，系统必须确定它要挂到哪个 `ruleId` 下面

因此，**单独上传故事时，前端必须让用户明确选择“关联规则”**。

这不是 UI 优化，而是数据落盘所必需的信息，因为：

1. `story/manifest.json` 里必须写入 `ruleId`
2. 最终输出路径必须落到 `content/<ruleId>/story/<storyId>/`
3. opening、规则摘要、主持约束和兼容性校验都依赖对应规则包

允许的行为：

- 用户从已有规则列表中选择一个规则
- 用户先上传新规则，再把当前故事绑定到这条新规则
- 系统根据故事文本内容自动猜测最可能的规则，但只能作为默认建议，不能跳过用户确认

不允许的行为：

- 用户上传故事后，系统在未展示规则绑定结果的情况下直接写入某个规则目录
- 用户未确认 `ruleId` 时直接生成 `story/manifest.json`

### 4.4 前端显示要求：分开上传时的规则选择

前端应显式提供以下入口模式：

- `上传规则`
- `上传故事`
- `同时上传规则与故事`
- `表单创建`

当用户选择 `上传故事` 时，页面必须显示一个必填的“关联规则”区域。

这个区域至少包含：

- 当前可选规则列表
- 每条规则的 `title`
- 每条规则的 `ruleId`
- 简短标签，如题材、风格、默认语言
- 一个明确的目标路径预览：`content/<ruleId>/story/<storyId>/`

交互要求：

1. `关联规则` 为必填项，未选择时禁止进入生成阶段
2. 如果系统从故事文本中推断出一个可能规则，可以预选，但要清楚标注“系统推荐”
3. 用户切换规则后，目标输出路径预览必须立即刷新
4. 如果当前工作区没有任何规则包，前端要提示“请先上传规则，或切换到同时上传规则与故事”
5. 如果用户本次会话里刚上传了一个新规则，这条规则要立刻出现在故事上传页的候选列表中
6. 在最终确认页，必须再次展示：
   - 规则名
   - `ruleId`
   - 剧本名
   - `storyId`
   - 最终写入路径

建议的前端文案：

- 字段名：`关联规则`
- 占位提示：`请选择这个故事要挂载到哪套规则下`
- 路径预览标题：`目标输出路径`
- 无规则时提示：`当前没有可用规则包，请先上传规则，或选择“同时上传规则与故事”`

### 4.5 推荐的前端流程

#### 流程 A：只上传规则

1. 用户上传规则文件
2. 系统抽取 `ruleSpec`
3. 用户确认 `ruleId`、标题、标签
4. 系统生成 `content/<ruleId>/rule/`

#### 流程 B：只上传故事

1. 用户上传故事文件
2. 系统抽取 `storySpec`
3. 用户在前端选择 `关联规则`
4. 页面展示目标路径：`content/<ruleId>/story/<storyId>/`
5. 用户确认后再进入生成

#### 流程 C：同时上传规则与故事

1. 用户同时上传规则文件和故事文件
2. 系统先抽取 `ruleSpec`
3. 再抽取 `storySpec`
4. 前端默认把故事绑定到本次新建的 `ruleId`
5. 用户确认后一起生成整包

#### 流程 D：表单创建

1. 用户先创建或选择规则
2. 再填写故事骨架
3. 系统始终显示当前故事所归属的规则包和目标路径
4. 最终统一生成

## 5. 中间层：NormalizedPackageSpec

### 5.1 为什么必须有中间层

如果没有中间层，会出现以下问题：

- 改一个 NPC，需要整包重生
- 无法区分“抽取错误”和“成文质量问题”
- 无法做稳定校验
- 无法支持人工确认
- 无法局部重生成图片、opening、某个 NPC prompt

因此生成器必须先产出一份标准化结构稿：

```json
{
  "ruleSpec": {},
  "storySpec": {},
  "assetPlan": {},
  "generationMeta": {}
}
```

### 5.2 建议字段

建议最少包含：

#### `ruleSpec`

| 字段 | 含义 | 典型来源 | 备注 |
| --- | --- | --- | --- |
| `id` | 规则包的稳定标识符，用于目录名、`manifest.id` 和故事绑定。 | 用户填写、规则标题 slug、人工确认 | 一旦发布后不应频繁修改。 |
| `version` | 规则包版本号，用于内容演进和兼容判断。 | 默认值或用户填写 | V1 可默认 `0.1.0`。 |
| `defaultLocale` | 规则包默认语言。 | 系统默认 | V1 固定 `zh-CN`。 |
| `title` | 规则包的多语言标题对象，例如 `{ "zh-CN": "幕府斩鬼" }`。 | 规则标题抽取、用户填写 | 不是纯字符串，而是按语言分层的标题映射。 |
| `themes` | 题材标签，用于搜索、筛选、封面规划和规则归类。 | 从规则文本中抽取 | 例如 `horror`、`investigation`、`romance`。 |
| `tones` | 语气或体验标签，用于控制文风、配图氛围和主持预期。 | 从规则文本中抽取 | 例如 `oppressive`、`hopeful`、`high-risk`。 |
| `supportsModes` | 规则支持的玩家模式，如单人、多人。 | 规则文本、默认策略 | 影响前端入口和后端兼容性校验。 |
| `gmStyles` | 规则支持的主持架构或主持风格。 | 规则文本、系统默认 | 例如 `single_agent`、`multi_agent`。 |
| `contentWarnings` | 内容风险提示标签。 | 规则文本、人工补充 | 用于前端告警和安全边界说明。 |
| `worldview` | 规则层的世界观摘要，说明这个规则适用什么样的世界、角色和冲突。 | 规则文本抽取 | 常作为 `rule/intro.txt` 与图片风格的上游输入。 |
| `judgementSystem` | 判定机制摘要，说明行动成功/失败如何裁定。 | 规则文本抽取 | 不要求数值制，但要说清“怎么判”。 |
| `riskAndConsequences` | 风险、代价和后果机制摘要。 | 规则文本抽取 | 会直接影响 opening 和主持方式。 |
| `characterCreation` | 玩家角色如何创建、限制在哪里、能否自由背景。 | 规则文本抽取 | 与剧本中的玩家定位共同工作。 |
| `actionAndSceneRules` | 行动流程、场景推进、对话/探索/战斗的核心处理规则。 | 规则文本抽取 | 是 `rule.md` 的重点章节之一。 |
| `optionalModules` | 资源系统、成长、流程示例等可选子模块。 | 规则文本抽取 | 允许为空对象。 |
| `gmConstraints` | 主持约束，说明 AI/主持人能做什么、不能做什么。 | 规则文本抽取 | 高风险字段，不能随意补写。 |

#### `storySpec`

| 字段 | 含义 | 典型来源 | 备注 |
| --- | --- | --- | --- |
| `id` | 剧本包的稳定标识符，对应故事目录名和 `manifest.id`。 | 剧本标题 slug、用户填写、人工确认 | 应在规则包内唯一。 |
| `version` | 剧本版本号。 | 默认值或用户填写 | V1 可默认 `0.1.0`。 |
| `ruleId` | 这个剧本归属的规则包 ID。 | 前端选择的 `关联规则` | 单独上传故事时必须由用户确认。 |
| `title` | 剧本的多语言标题对象。 | 剧本标题抽取、用户填写 | 不是纯字符串。 |
| `tags` | 剧本题材或玩法标签。 | 剧本文本抽取 | 用于筛选、推荐、封面规划。 |
| `tones` | 剧本语气和情绪风格标签。 | 剧本文本抽取 | 会影响 `intro`、opening 和美术风格。 |
| `playerCount` | 推荐玩家人数范围，如 `{ min: 1, max: 1 }`。 | 剧本文本或规则默认 | 影响产品入口和兼容性显示。 |
| `recommendedLength` | 推荐流程长度，例如短篇/中篇/长篇。 | 剧本文本抽取 | 用于前端展示和玩法预期。 |
| `recommendedPacing` | 推荐节奏，如快节奏、慢热。 | 剧本文本抽取 | 可影响 opening 文风和玩家预期。 |
| `gmStyle` | 这部剧本建议的主持风格。 | 剧本文本抽取 | 例如重氛围、强引导、高自由。 |
| `coverQuote` | 放在封面或故事卡片上的短句。 | 从剧本 intro 提炼或人工填写 | 要强识别度、低剧透。 |
| `intro` | 剧本入口摘要，即玩家进入前会看到的核心背景文案。 | 剧本文本抽取或重写 | 是 `story/intro.txt` 的主要上游。 |
| `playerRole` | 玩家身份、初始处境、初始认知、优势与限制。 | 剧本文本抽取 | 和 opening 中的角色确认强相关。 |
| `coreGoals` | 剧本的显性目标、隐性目标、成功/失败条件和阶段目标。 | 剧本文本抽取 | 高风险字段，不可随意脑补。 |
| `mainProgressAxis` | 剧本主要靠什么推进，例如调查推进、情感推进、时间压力。 | 剧本文本抽取 | 会影响主持和场景组织。 |
| `startScene` | 默认开场节点的结构化摘要，至少应包含 `id`、名称和入口说明。 | 从 `scenes` 中推导或人工指定 | 用于生成 `beginning.zh-CN.md`，而 `startSceneId` 可由它导出。 |
| `scenes` | 场景或节点列表，是剧本结构骨架。 | 剧本文本抽取 | 每项通常要带 `id`、功能、进入/离开条件等。 |
| `entities` | 关键实体列表，包括 NPC、敌对者、组织、怪物、场景意识体等。 | 剧本文本抽取 | 是 `npc_prompt` 和剧情交互的主要来源。 |
| `informationUnits` | 线索、证言、设定知识、错误信息等信息单元列表。 | 剧本文本抽取 | 支撑调查、解谜和提示兜底。 |
| `triggers` | 哪些条件会触发状态变化、事件推进或 NPC 变化。 | 剧本文本抽取 | 支撑主持推演。 |
| `risks` | 剧本内具体化的风险源、升级方式和后果。 | 剧本文本抽取 | 不同于规则层的通用风险机制。 |
| `branchPoints` | 关键分支点及其短期/长期影响。 | 剧本文本抽取 | 决定路线分化和结局可达性。 |
| `endingStructure` | 结局类型、达成条件、必要前提和禁止条件。 | 剧本文本抽取 | 高风险字段，必须慎重。 |
| `agentConstraints` | 这部剧本对主持 Agent 的额外限制。 | 剧本文本抽取 | 例如不能提前说哪些信息。 |
| `timeStructure` | 全局时间轴、倒计时和时间节点事件。 | 剧本文本抽取 | 没有就可为空。 |
| `specialModules` | 特殊机制，如污染值、证据闭环、幻觉机制等。 | 剧本文本抽取 | 可按题材扩展。 |

#### `assetPlan`

| 字段 | 含义 | 典型来源 | 备注 |
| --- | --- | --- | --- |
| `cover` | 封面图规划对象，描述封面要表达什么、服务什么认知目标。 | `plan_assets` 输出 | 后续会转成 `cover.png` 的 prompt。 |
| `otherAssets` | 辅助图片规划列表，如地图、线索板、关键物件图。 | `plan_assets` 输出 | V1 建议最多 3 张。 |
| `npcPortraits` | NPC 肖像规划列表，记录哪些角色需要立绘及其对应 prompt。 | `entities` + 视觉规划 | V1 可只生成 prompt，不强制全部出图。 |

#### `generationMeta`

| 字段 | 含义 | 典型来源 | 备注 |
| --- | --- | --- | --- |
| `sourceFiles` | 这次生成使用了哪些原始输入文件。 | 输入接入阶段 | 便于溯源和 debug。 |
| `missingFields` | 当前 spec 中缺失但理论上需要的字段列表。 | 抽取与校验阶段 | 用于提醒补录。 |
| `lowConfidenceFields` | 模型抽取置信度较低的字段列表。 | 结构抽取阶段 | 应在前端重点提示。 |
| `humanReviewRequired` | 必须人工确认后才能继续的高风险项列表。 | 补全与校验阶段 | 比如 `ruleId` 绑定、失败条件、终局条件。 |

### 5.2.1 字段包装约定

为了便于抽取、调试和二次编辑，建议对高风险文本字段采用统一包装结构：

```json
{
  "value": "...",
  "confidence": 0.86,
  "sourceExcerpt": "..."
}
```

字段含义：

| 子字段 | 含义 | 用途 |
| --- | --- | --- |
| `value` | 当前阶段认为最可信的字段内容。 | 直接参与后续生成。 |
| `confidence` | 模型对这一抽取值的置信度，范围建议 `0 ~ 1`。 | 决定是否需要人工确认。 |
| `sourceExcerpt` | 支撑这一抽取值的原文片段。 | 便于调试、审核和回溯。 |

### 5.2.2 常用嵌套对象字段说明

下面这些不是顶层字段，但在后续前端、后端、prompt 和图片生成里都会频繁出现，建议尽早统一语义。

#### `scene`

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `id` | 场景稳定标识符。 | 应可用于 `startSceneId` 和触发器引用。 |
| `name` | 场景名。 | 给作者和前端展示。 |
| `type` | 场景类型，如开场、探索、对话、战斗、结局。 | 用于主持节奏控制。 |
| `function` | 这个场景在剧本中的作用。 | 例如投线索、施压、转折。 |
| `description` | 场景描述。 | 提供环境和氛围素材。 |
| `entryConditions` | 进入条件。 | 用于主持与校验。 |
| `exitConditions` | 离开条件。 | 用于推进判断。 |
| `visibleElements` | 玩家一进入就能看到的元素。 | 有助于开场描述和交互。 |
| `interactableObjects` | 可直接互动的对象。 | 有助于生成行动建议。 |
| `obtainableInfo` | 在场景中可获得的信息。 | 与 `informationUnits` 关联。 |
| `risks` | 该场景的即时风险。 | 用于危险提示和结局路径控制。 |
| `hooks` | 指向下一步的钩子。 | 帮助主持保持流动性。 |

#### `entity`

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `id` | 实体稳定标识符。 | 应可与图片、线索、触发器关联。 |
| `name` | 实体名。 | 前端展示和文件命名都会用到。 |
| `type` | 实体类型，如 NPC、敌对者、组织、怪物。 | 决定主持和美术策略。 |
| `surfaceImpression` | 玩家初见时的表层印象。 | 常用于 intro 和肖像 prompt。 |
| `appearance` | 可视外观信息。 | 是出图 prompt 的核心来源。 |
| `motivation` | 真实动机。 | 主持推进的重要依据。 |
| `stance` | 当前立场。 | 会影响敌友关系和对话走向。 |
| `relationshipToPlayer` | 与玩家的关系。 | 有助于互动和情感线。 |
| `knowledgeScope` | 这个实体知道什么。 | 用于线索分配。 |
| `hiddenInfo` | 对玩家隐瞒的信息。 | 高风险字段，要防剧透。 |
| `resourcesOrHelp` | 可提供的信息或资源。 | 用于奖励与推进。 |
| `obstacles` | 会制造的阻碍。 | 用于冲突设计。 |
| `triggerLogic` | 在什么条件下改变行为。 | 影响动态主持。 |
| `props` | 常见手持物或标志性物件。 | 方便肖像和物件图生成。 |

#### `informationUnit`

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `id` | 信息单元稳定标识符。 | 便于交叉引用。 |
| `name` | 信息名。 | 给作者和前端识别。 |
| `type` | 信息类型，如线索、证言、物证、谣言。 | 影响可信度和用途。 |
| `source` | 信息来自哪里。 | 例如某场景、某 NPC、某物件。 |
| `acquisition` | 获取方式。 | 例如搜索、对话、触发事件。 |
| `credibility` | 可信度。 | 用于误导、交叉验证和提示设计。 |
| `purpose` | 这条信息的用途。 | 例如推进真相、误导、情感信号。 |
| `relatedObjects` | 与哪些场景、实体、结局有关。 | 支撑关系图和线索板。 |
| `isCore` | 是否为核心信息。 | 缺失时通常需要补提示。 |
| `needsCrossValidation` | 是否需要交叉验证。 | 适合调查和刑侦题材。 |

#### `assetPlan.cover` / `assetPlan.otherAssets[]`

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `fileName` | 最终图片文件名。 | 决定输出路径。 |
| `purpose` | 这张图服务什么产品目标。 | 例如建立氛围、帮助理解地图。 |
| `visualFocus` | 画面最核心的主体或构图焦点。 | 用于约束图像 prompt。 |
| `spoilerLevel` | 这张图允许承载的剧透等级。 | V1 建议以 `low` 为主。 |

#### 图片 prompt package

| 字段 | 含义 | 备注 |
| --- | --- | --- |
| `positivePrompt` | 给 image model 的正向提示词。 | 描述应该出现什么。 |
| `negativePrompt` | 给 image model 的负向提示词。 | 描述应避免什么。 |
| `styleNotes` | 风格补充说明。 | 例如年代感、质感、镜头语言。 |
| `spoilerCheck` | 生成前的人类可读剧透检查语句。 | 用于审核和回看。 |
| `sizeHint` | 建议图幅。 | 例如 `portrait`、`landscape`。 |

### 5.3 字段级置信度

建议抽取阶段就为关键字段记录：

- `value`
- `confidence`
- `sourceExcerpt`

高风险字段必须重点标注：

- 固定主角还是自由创建
- 失败条件
- 不可逆损失条件
- 终局触发条件
- 哪些信息不可提前说
- 哪些 NPC 是核心实体

这样后续 UI 才能把“需要确认的地方”展示给用户。

## 6. 从 2.0 示例到 3.0 的映射

## 6.1 规则文件映射：`NIHON_PROMPT.txt`

这份文件本质上是“旧版规则 prompt + 主持约束 +世界设定 + 玩法循环”的混合体。

建议映射如下：

| 2.0 内容块 | 3.0 中间字段 | 3.0 输出文件 |
| --- | --- | --- |
| 一句话定位 | `ruleSpec.title/themes/tones`、`rule intro` | `rule/manifest.json`、`rule/intro.txt` |
| AI 身份与职责 | `ruleSpec.gmConstraints`、`gmStyles` | `rule/rule.md`、`rule/manifest.json` |
| 玩家能力与代价 | `characterCreation`、`riskAndConsequences` | `rule/rule.md` |
| 妖鬼生成系统 | `worldview`、`actionAndSceneRules`、`optionalModules` | `rule/rule.md` |
| 人类 NPC 系统 | `worldview`、`actionAndSceneRules` | `rule/rule.md` |
| 核心玩法循环 | `actionAndSceneRules`、`optionalModules.flowExample` | `rule/rule.md` |
| 代价标签系统 | `riskAndConsequences`、`optionalModules.resourceSystem` | `rule/rule.md` |
| 牺牲规则 | `riskAndConsequences` | `rule/rule.md` |
| 战斗与斩杀规则 | `judgementSystem`、`riskAndConsequences` | `rule/rule.md` |
| 信息控制规则 | `gmConstraints` | `rule/rule.md` |
| 章节结构 | `actionAndSceneRules`、`optionalModules.flowExample` | `rule/rule.md` |
| 禁止条款 | `gmConstraints` | `rule/rule.md` |

### 6.2 剧本文件映射：`DAZHIZHAN.txt`

这份文件已经很接近 3.0 的 `剧本范式`，只是还没有拆成运行时需要的多个文件。

建议映射如下：

| 2.0 内容块 | 3.0 中间字段 | 3.0 输出文件 |
| --- | --- | --- |
| 背景与公开传闻 | `storySpec.intro`、`coverQuote`、`world context` | `story/intro.txt`、`story/story.md`、`story/manifest.json` |
| 任务结构 | `coreGoals`、`endingStructure` | `story/story.md` |
| 地图与地点清单 | `scenes`、`assetPlan.otherAssets.map` | `story/story.md`、`art_assets/other/map.png` |
| 核心势力与 NPC 卡 | `entities`、`npcPortraits` | `story/story.md`、`npc_prompt/*.txt` |
| 线索结构 | `informationUnits` | `story/story.md` |
| 时间推进与事件表 | `timeStructure`、`triggers` | `story/story.md` |
| 冲突节点生成器 | `specialModules`、`agentConstraints` | `story/story.md` |
| 情节片段库 | `specialModules.fragmentLibrary` 或演出文本区 | `story/story.md`、`beginning.zh-CN.md` 的素材库 |

## 7. 生成流水线

建议生成器拆成 8 个阶段。

### 7.1 Stage A：输入接入

输入来源：

- 表单填写
- 上传 `rule/story` 文件
- 上传补充图片或参考资料

系统行为：

- 保存原始文件
- 记录来源路径
- 统一转 UTF-8
- 初步切分章节
- 如果是单独上传故事，先加载现有规则列表供前端选择
- 记录当前故事准备绑定的 `ruleId`

脚本负责：

- 文件读写
- 编码处理
- 基础分段
- 扫描现有 `content/*/rule/manifest.json` 以生成规则候选列表

LLM 不参与这一层。

### 7.2 Stage B：结构抽取

把输入转成 `NormalizedPackageSpec` 的初稿。

这里是 LLM 第一轮核心工作，输出必须是严格 JSON，而不是 prose。

建议分成两次调用：

1. `extract_rule_spec`
2. `extract_story_spec`

这样规则和剧本各自独立，失败时更易重试。

### 7.3 Stage C：结构补全

抽取后会有缺项。补全过程不应让 LLM 自由发挥全部内容，而应遵循：

- 只补低风险默认值
- 高风险缺项进入 `humanReviewRequired`
- 对补全字段写明依据和置信度

例如：

- `defaultLocale` 可以固定补成 `zh-CN`
- `availableLocales` 可以先补 `["zh-CN"]`
- `authoringSpec` 固定为 `规则范式(1)` / `剧本范式(1)`
- `recommendedLength` 可以允许 LLM 推断
- `失败条件` 缺失时不能盲编，需要标红等待确认

### 7.4 Stage D：文件生成

这一步从中间结构稿生成目标文件。

原则是：

- `manifest.json` 尽量脚本生成
- `md/txt` 内容文件用 LLM 生成
- 目录和文件命名由脚本固定

### 7.5 Stage E：美术规划

不要直接让 image model 自己猜要画什么。

必须先产出 `assetPlan`：

- 封面画什么
- `other` 里放哪些图
- 每张图服务于哪个玩家认知目标

V1 建议固定 `other` 最多 3 张：

1. `map.png`
2. `clue_board.png`
3. `key_object.png`

### 7.6 Stage F：图片提示词生成

由 LLM 根据 `assetPlan` 生成 image model prompt。

需要分别处理：

- 封面 prompt
- `other` 图 prompt
- 每个 NPC 的肖像 prompt

### 7.7 Stage G：校验

至少要做三类校验：

1. 结构校验
2. 内容校验
3. 运行时校验

结构校验：

- 文件是否齐全
- JSON 是否可解析
- manifest 必填项是否存在

内容校验：

- `ruleId` / `storyId` 是否一致
- `startSceneId` 是否在场景列表中
- `npc_prompt` 文件名是否能映射到实体
- 图片槽位是否与 `assetPlan` 一致

运行时校验：

- 跑现有 `validateContent.ts`
- 必要时做一次 opening 读取测试

### 7.8 Stage H：预览与导出

用户最终应看到：

- 结构化摘要
- 每个生成文件的预览
- 低置信度字段提醒
- 局部重生成按钮
- 导出 zip / 写入本地 `content/` 目录
- 明确的规则绑定结果与最终输出路径

在“单独上传故事”的场景下，确认页至少应显示：

- 关联规则标题
- 关联规则 `ruleId`
- 剧本标题
- 剧本 `storyId`
- 最终落盘目录：`content/<ruleId>/story/<storyId>/`

如果用户在这个阶段修改了 `关联规则`，系统必须：

- 重新生成路径预览
- 更新 `storyManifestDraft.ruleId`
- 重新跑一次兼容性校验

## 8. 每个目标文件怎么生成

## 8.1 `rule/manifest.json`

生成方式：

- 主要由脚本写入
- LLM 只负责抽取元信息字段

来源字段：

- `id`：脚本根据规则名或上传目录稳定生成
- `version`：默认 `0.1.0` 或用户填写
- `defaultLocale`：默认 `zh-CN`
- `availableLocales`：V1 固定 `["zh-CN"]`
- `title`：来自 `ruleSpec.title`
- `themes` / `tones` / `contentWarnings`：来自抽取结果
- `supportsModes` / `gmStyles`：由规则文件和默认策略共同决定
- `authoringSpec`：固定 `规则范式(1)`

不建议让 LLM 直接写 JSON 文件，以免格式漂移。

## 8.2 `rule/intro.txt`

生成方式：

- LLM 摘要生成

目标：

- 玩家或作者快速理解这套规则的体验方向
- 150 到 300 字为宜
- 不能写成长篇规则说明
- 应突出题材、核心体验、风险感和玩家角色位置

输入：

- `ruleSpec.title`
- `themes`
- `tones`
- `worldview`
- `judgementSystem`
- `riskAndConsequences`

## 8.3 `rule/rule.md`

生成方式：

- LLM 按 `规则范式.md` 重写

目标：

- 把旧 prompt 改造成可读、可维护、可继续编辑的作者文档
- 明确区分“硬规则”和“主持建议”

输入：

- `ruleSpec`
- `规则范式.md`
- 原始 `NIHON_PROMPT.txt`

关键要求：

- 保留原规则的行为约束
- 不得把“风格建议”写成“强制规则”
- 对未确定信息使用“建议/可选”表述

## 8.4 `story/manifest.json`

生成方式：

- 脚本写入
- LLM 只负责抽取对应字段

来源字段：

- `id`：脚本根据剧本名稳定生成
- `ruleId`：绑定所选规则
- `title`：来自 `storySpec.title`
- `playerCount`：来自 `storySpec.playerCount`
- `supportsModes`：默认与规则兼容，V1 可先固定单人
- `coverQuote`：从 `storySpec.intro` 或专门摘要中提炼
- `recommendedLength` / `recommendedPacing` / `gmStyle`
- `tags` / `contentWarnings`
- `authoringSpec`：固定 `剧本范式(1)`
- `startSceneId`：来自 `storySpec.scenes[0]` 或显式开场节点

## 8.5 `story/intro.txt`

生成方式：

- LLM 摘要生成

目标：

- 这是玩家进入剧本前看到的核心入口文案
- 应比 manifest 摘要更完整，但要少于完整 `story.md`
- 一般 250 到 600 字

输入：

- `storySpec.intro`
- `playerRole`
- `coreGoals`
- `mainProgressAxis`

约束：

- 可以给氛围和核心张力
- 不应剧透完整责任链和终局真相

## 8.6 `story/story.md`

生成方式：

- LLM 按 `剧本范式.md` 重写

目标：

- 这是整个剧本包的核心作者文档
- 必须覆盖当前 3.0 主持所需的结构性信息

输入：

- `storySpec`
- `剧本范式.md`
- 原始 `DAZHIZHAN.txt`

关键要求：

- 场景节点结构清晰
- 信息单元和触发器要能支持 LLM 主持
- 结局结构必须结构化，不只写情绪化结尾

## 8.7 `story/text_assets/beginning.zh-CN.md`

生成方式：

- LLM 生成开局文本

目标：

- 为当前 3.0 opening 缓存提供稳定文本
- 玩家进入游戏后即可直接开场

输入：

- `rule/intro.txt`
- `rule/rule.md`
- `story/intro.txt`
- `story/story.md`
- `storySpec.playerRole`
- `storySpec.startScene`

约束：

- 需要简述规则体验
- 需要简述背景故事
- 需要明确游戏目的
- 需要引导玩家描述角色或确认角色
- 不得提前爆出关键隐性真相

V1 建议只生成 `beginning.zh-CN.md`，不要一开始就生成多套 `gmArchitecture/difficulty` 版本。

## 8.8 `story/npc_prompt/*.txt`

生成方式：

- 对每个核心 NPC 单独调用 LLM 生成外观 prompt

目标：

- 输出适合 image model 的肖像提示词
- 当前示例更接近英文逗号分隔 prompt，建议继续沿用

输入：

- 实体名称
- 性别和年龄段
- 外貌
- 气质
- 穿着
- 手持物
- 题材氛围

约束：

- 只写可见外观，不写剧情 spoiler
- 单行英文 prompt 优先
- 保持稳定、具体、可画
- 避免抽象词过多

## 8.9 `story/art_assets/cover.png`

生成方式：

- LLM 先写 `cover prompt`
- image model 再出图

目标：

- 让玩家在进入剧本前立刻感知题材、年代感、情绪张力

输入：

- `story intro`
- `coverQuote`
- 题材标签
- 风格标签
- 一个主视觉构图方案

约束：

- 封面不应承载全部信息
- 重点突出氛围、地点、关键象征物
- 避免把终局真相画出来

## 8.10 `story/art_assets/other/*.png`

生成方式：

- 先由 `assetPlan` 决定图的类型
- 再逐张生成 prompt 和图片

V1 建议槽位：

- `map.png`：场景关系图或营地地图
- `clue_board.png`：线索板、人物关系板、证据链板
- `key_object.png`：最关键的物件、录像带、遗物、地图残页等

## 9. LLM 调用链设计

建议不要一个模型干全部事情，而是按任务类型拆分调用。

### 9.1 调用链总览

1. `extract_rule_spec`
2. `extract_story_spec`
3. `fill_missing_fields`
4. `rewrite_rule_md`
5. `rewrite_story_md`
6. `generate_rule_intro`
7. `generate_story_intro`
8. `generate_beginning`
9. `plan_assets`
10. `generate_npc_prompt` x N
11. `generate_cover_prompt`
12. `generate_other_asset_prompt` x M

### 9.2 模型职责分配建议

- 结构抽取：低温、强 JSON 约束
- 缺失补全：低温、强 JSON 约束
- Markdown 重写：中温
- 开场文案：中温偏低
- 图片 prompt：中温

## 10. 提示词设计

下面只定义职责和格式，不绑定具体厂商模型。

## 10.1 Prompt A：规则结构抽取

### 目标

从旧规则文件中抽取 `ruleSpec`。

### 系统提示词职责

- 你是 TRPG 规则结构化编辑器
- 你的任务不是写新规则，而是抽取已有规则
- 你必须区分“明确规则”“主持建议”“氛围表述”
- 缺失字段填 `null`
- 输出必须是合法 JSON

### 用户输入

- 原始 `NIHON_PROMPT.txt`
- 目标 schema

### 输出要求

- 只输出 JSON
- 对关键字段附带 `confidence` 与 `sourceExcerpt`
- 不允许自由扩写未出现的强规则

## 10.2 Prompt B：剧本结构抽取

### 目标

从旧剧本文件中抽取 `storySpec`。

### 系统提示词职责

- 你是 TRPG 剧本结构化编辑器
- 你必须把剧本拆成：元信息、节点、实体、线索、触发器、结局
- 如果某段兼具多个作用，应允许交叉引用，但不要重复编造
- 输出必须是合法 JSON

### 用户输入

- 原始 `DAZHIZHAN.txt`
- 目标 schema

### 输出要求

- 每个 `scene/entity/informationUnit/ending` 应带稳定 ID
- 关键条件字段要有 `confidence`
- 不允许直接输出 Markdown

## 10.3 Prompt C：缺失补全

### 目标

对抽取结果做低风险补全，或标记人工确认项。

### 系统提示词职责

- 你是内容包编辑助理
- 只能补低风险默认值
- 涉及剧情核心判断时不能编造
- 必须输出 `patch + reviewFlags`

### 示例可补项

- `availableLocales = ["zh-CN"]`
- `version = "0.1.0"`
- `authoringSpec`

### 示例不可盲补项

- 成功条件
- 失败条件
- 终局必要前提
- 哪些信息不能提前说

## 10.4 Prompt D：规则文档重写

### 目标

把 `ruleSpec` 转成符合 `规则范式.md` 的 `rule.md`。

### 系统提示词职责

- 你是 TRPG 规则作者助手
- 你要把结构化规则写成清晰、可编辑的作者文档
- 不能改变已有规则逻辑
- 必须使用 `规则范式` 的章节顺序

### 输入

- `ruleSpec`
- `规则范式.md`
- 必要时附原文片段

### 输出

- 纯 Markdown

## 10.5 Prompt E：剧本文档重写

### 目标

把 `storySpec` 转成符合 `剧本范式.md` 的 `story.md`。

### 系统提示词职责

- 你是 TRPG 剧本作者助手
- 你要输出“可主持、可维护、可扩展”的剧本主文档
- 场景、实体、线索、结局必须结构化
- 不能偷写成纯文学小说

### 输出

- 纯 Markdown

## 10.6 Prompt F：Intro 生成

适用于 `rule/intro.txt` 和 `story/intro.txt`。

### 系统提示词职责

- 你是玩家入口文案编辑
- 你的目标是降低进入门槛，而不是完整复述文档
- 保留张力，但控制剧透

### 输出约束

- 简洁
- 高可读
- 强入口感

## 10.7 Prompt G：Beginning 生成

### 目标

生成 `beginning.zh-CN.md`。

### 系统提示词职责

- 你是 TRPG 开场文案设计师
- 你需要写出玩家刚开始游戏时看到的引导文本
- 必须包含：规则简介、背景概述、游戏目的、角色确认
- 必须与 `rule.md` 和 `story.md` 保持一致

### 输出约束

- 不剧透终局
- 可以给出身份建议
- 要自然地邀请玩家输入角色背景

## 10.8 Prompt H：NPC 肖像 prompt 生成

### 目标

为每个核心 NPC 生成一个适合 image model 的英文外观 prompt。

### 系统提示词职责

- 你是角色视觉设计助手
- 你只描述外观，不描述剧情
- 你要让 prompt 可直接用于出图

### 输出约束

- 单行英文
- 逗号分隔
- 聚焦年龄、种族/地域感、发型、服装、状态、手持物、表情
- 避免引入故事秘密

## 10.9 Prompt I：美术规划

### 目标

决定本剧本需要哪些 `cover/other` 图片。

### 系统提示词职责

- 你是叙事美术规划师
- 你不能无限扩图
- 你要优先选择“能帮助玩家理解剧本”的图，而不是“看起来很酷但没用”的图

### 输出格式

```json
{
  "cover": {},
  "otherAssets": [
    {}
  ]
}
```

## 10.10 Prompt J：图片 prompt 生成

### 目标

把 `assetPlan` 转成 image model prompt。

### 系统提示词职责

- 你是图像提示词设计师
- 你要输出稳定、可生成、避免剧透的画面提示

### 输出约束

- 明确主体
- 明确构图
- 明确材质和年代感
- 明确风格关键词

## 10.11 推荐 prompt 骨架

下面给出可直接实现的 prompt 骨架。实际接入时只需要替换 schema、变量和模型参数。

### 模板 1：`extract_rule_spec`

```text
[System]
你是 TRPG 规则结构化编辑器。
你的任务是从作者原始规则文本中抽取结构化规则，不是改写，也不是补写完整规则。
请严格区分：
1. 明确规则
2. 主持建议
3. 氛围描述
缺失信息填 null，不要编造。
输出必须是合法 JSON，不要输出 Markdown，不要输出解释。

[User]
请从下面的原始规则文本中抽取 RuleSpec。

目标字段：
{
  "id": "...",
  "title": {"zh-CN": "..."},
  "themes": [],
  "tones": [],
  "supportsModes": [],
  "gmStyles": [],
  "contentWarnings": [],
  "worldview": {"value": "...", "confidence": 0, "sourceExcerpt": "..."},
  "judgementSystem": {"value": "...", "confidence": 0, "sourceExcerpt": "..."},
  "riskAndConsequences": {"value": "...", "confidence": 0, "sourceExcerpt": "..."},
  "characterCreation": {"value": "...", "confidence": 0, "sourceExcerpt": "..."},
  "actionAndSceneRules": {"value": "...", "confidence": 0, "sourceExcerpt": "..."},
  "optionalModules": {},
  "gmConstraints": {"value": "...", "confidence": 0, "sourceExcerpt": "..."}
}

规则文本如下：
<<<RAW_RULE_TEXT>>>
```

### 模板 2：`extract_story_spec`

```text
[System]
你是 TRPG 剧本结构化编辑器。
你的任务是把原始剧本文本拆成可用于主持和内容生成的结构化剧本。
必须抽取：元信息、玩家定位、场景节点、关键实体、线索、触发器、风险、分支点、结局结构。
缺失信息填 null，不要编造。
输出必须是合法 JSON。

[User]
请从下面的原始剧本文本中抽取 StorySpec。

输出要求：
1. 每个 scene/entity/informationUnit/ending 都要有稳定 id
2. 每个高风险字段都要给 confidence
3. 如果原文不足以支撑判断，请填 null 并加入 lowConfidenceFields

目标 schema：
<<<STORY_SPEC_SCHEMA>>>

剧本文本如下：
<<<RAW_STORY_TEXT>>>
```

### 模板 3：`rewrite_story_md`

```text
[System]
你是 TRPG 剧本作者助手。
请把结构化 StorySpec 改写成一个符合《剧本范式》的作者文档。
这是主持文档，不是小说。
你必须保持结构完整、信息清晰、便于继续编辑。
不能编造与 StorySpec 冲突的新设定。

[User]
请根据以下输入生成 story.md：

剧本范式：
<<<STORY_TEMPLATE_TEXT>>>

StorySpec：
<<<STORY_SPEC_JSON>>>

要求：
1. 必须覆盖剧本元信息、Intro、玩家角色定位、核心目标、主推进轴、场景节点、关键实体、关键信息单元、触发器与状态变化、风险与后果、分支点、结局结构、主持约束
2. 场景、实体、线索、结局必须清楚分段
3. 可读，但不要写成纯文学 prose
4. 输出纯 Markdown
```

### 模板 4：`generate_beginning`

```text
[System]
你是 TRPG 开场文案设计师。
你的任务是生成玩家开始游戏时看到的 opening 文本。
必须包含：
1. 游戏规则简介
2. 背景故事概述
3. 游戏目的
4. 角色确认或角色创建引导
不能提前暴露终局真相。

[User]
请根据以下资料生成 `beginning.zh-CN.md`：

规则简介：
<<<RULE_INTRO>>>

规则主文档：
<<<RULE_MD>>>

剧本简介：
<<<STORY_INTRO>>>

剧本主文档：
<<<STORY_MD>>>

要求：
1. 默认语言是中文
2. 玩家刚进入时即可阅读
3. 结尾要自然引导玩家描述角色背景或确认角色
4. 输出纯 Markdown
```

### 模板 5：`generate_npc_prompt`

```text
[System]
你是角色视觉设计助手。
你只输出一个可直接用于 image model 的英文角色外观 prompt。
不要输出解释，不要换行，不要写剧情，不要写 spoiler。

[User]
请为下面的角色生成单行英文 prompt：

角色名：<<<NPC_NAME>>>
年龄段：<<<NPC_AGE>>>
性别表达：<<<NPC_GENDER_PRESENTATION>>>
外貌特征：<<<NPC_APPEARANCE>>>
气质：<<<NPC_AURA>>>
穿着：<<<NPC_CLOTHING>>>
手持物：<<<NPC_PROPS>>>
题材氛围：<<<STORY_TONE>>>

要求：
1. 单行输出
2. 逗号分隔
3. 聚焦外观与状态
4. 避免抽象词堆砌
```

### 模板 6：`plan_assets`

```text
[System]
你是叙事美术规划师。
你的任务是决定这个剧本最值得生成的图片槽位。
优先帮助玩家理解剧本，不要为了炫技增加无用图片。
输出必须是合法 JSON。

[User]
请根据以下剧本资料输出 assetPlan：

StorySpec：
<<<STORY_SPEC_JSON>>>

限制：
1. 必须有 1 张 cover
2. otherAssets 最多 3 张
3. 每张图都要写明用途、服务的认知目标、是否会剧透

输出格式：
{
  "cover": {
    "fileName": "cover.png",
    "purpose": "",
    "visualFocus": "",
    "spoilerLevel": "low"
  },
  "otherAssets": [
    {
      "fileName": "map.png",
      "purpose": "",
      "visualFocus": "",
      "spoilerLevel": "low"
    }
  ]
}
```

## 10.12 按目标文件的详细 prompt 规格

这一节专门回答一个实现问题：

> 每个需要由 LLM 生成的目标文件，到底该喂什么 prompt？

这里统一约定：

- `System Prompt` 负责锁定角色、边界、禁止事项
- `User Prompt` 负责传入结构化变量和输出格式要求
- 如果模型支持 `response_format/json_schema`，则 JSON 任务应优先走结构化输出
- 如果模型不支持结构化输出，则必须在脚本层增加 JSON 解析和重试

### 10.12.1 调用参数建议

建议参数：

| 任务 | 建议温度 | 输出格式 |
| --- | --- | --- |
| 结构抽取 | `0.0 ~ 0.2` | JSON |
| 缺失补全 | `0.0 ~ 0.2` | JSON |
| `rule/intro.txt` | `0.3 ~ 0.5` | 纯文本 |
| `rule/rule.md` | `0.2 ~ 0.4` | Markdown |
| `story/intro.txt` | `0.3 ~ 0.5` | 纯文本 |
| `story/story.md` | `0.2 ~ 0.4` | Markdown |
| `beginning.zh-CN.md` | `0.3 ~ 0.5` | Markdown |
| `npc_prompt/*.txt` | `0.5 ~ 0.7` | 单行文本 |
| 图片 prompt | `0.4 ~ 0.7` | JSON 或单行文本 |

统一脚本约束：

- 超长输入先做切片和摘要，不要把全部原文粗暴塞给每一次调用
- 任何生成任务都要带 `ruleId`、`storyId`、`defaultLocale`
- LLM 输出写盘前必须经过脚本级 post-process

### 10.12.2 `rule/intro.txt`

#### 文件目标

让玩家或作者快速理解规则包的体验方向。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `ruleSpec.title` | 规则包标题，用来告诉模型“这套规则叫什么”。 | 决定 intro 的命名感和入口识别度。 |
| `ruleSpec.themes` | 规则题材标签。 | 帮助模型快速抓住题材类型。 |
| `ruleSpec.tones` | 规则整体情绪和风格标签。 | 控制文案气质，不让 intro 文风跑偏。 |
| `ruleSpec.worldview` | 规则适用的世界观摘要。 | 让模型知道角色活在什么样的世界里。 |
| `ruleSpec.judgementSystem` | 行动如何被裁定的摘要。 | 让 intro 能简单说明“这套规则怎么处理行动与结果”。 |
| `ruleSpec.riskAndConsequences` | 风险、代价、后果的核心机制。 | 让 intro 突出这套规则的压力感和代价感。 |
| `ruleSpec.characterCreation` | 角色创建方式和限制。 | 帮助 intro 点出“玩家通常扮演谁”。 |
| `ruleSpec.gmConstraints` | 主持风格与主持边界。 | 帮助 intro 概括主持体验，不写成纯背景介绍。 |

#### System Prompt

```text
你是 TRPG 规则入口文案编辑。
你的任务是为一个规则包生成简短的介绍文本，用于玩家进入规则页时快速理解体验方向。
你必须突出题材、体验、代价和主持风格，但不能写成完整规则说明，也不能写成故事 intro。
不要使用项目符号，不要写标题，不要引用原文，不要剧透任何具体剧本内容。
输出纯中文文本。
```

#### User Prompt

```text
请根据以下 RuleSpec 生成 `rule/intro.txt`。

输出要求：
1. 使用简体中文
2. 长度控制在 180 到 320 字
3. 要回答这四件事：
   - 这是什么题材和体验
   - 玩家通常扮演什么样的人
   - 这套规则如何处理行动与后果
   - 主持风格的核心特征是什么
4. 不要写成条目列表
5. 不要提到任何具体剧本名

RuleSpec:
<<<RULE_SPEC_JSON>>>
```

#### 输出检查

- 非空
- 纯文本
- 不包含具体剧本名
- 不超过长度上限

### 10.12.3 `rule/rule.md`

#### 文件目标

生成符合 `规则范式.md` 的规则主文档。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `ruleSpec` | 已抽取完成的规则结构稿。 | 它是 `rule.md` 的主要事实来源。 |
| `规则范式.md` | 当前项目规定的规则文档章节模板。 | 用来约束输出结构，避免模型自由发挥。 |
| `sourceRuleText` | 用户上传的原始规则文本。 | 当 `ruleSpec` 信息不够细时，模型可回看原文措辞。 |
| `ruleManifestDraft` | 即将写入 `rule/manifest.json` 的元信息草稿。 | 让 `rule.md` 与 manifest 标题、标签、模式保持一致。 |

#### System Prompt

```text
你是 TRPG 规则文档作者助手。
你的任务是把结构化 RuleSpec 改写为可编辑、可维护、可继续迭代的规则主文档。
你必须遵循《规则范式》的章节组织方式。
你可以重写措辞，但不能改变已经确定的规则逻辑。
如果某项信息在 RuleSpec 中为空，不要自行发明强规则；可以使用“建议”“可选”“待补充”这类措辞。
不要把故事内容写进规则文档。
输出纯 Markdown。
```

#### User Prompt

```text
请生成 `rule/rule.md`。

你必须遵循以下资料：

规则范式：
<<<RULE_TEMPLATE_TEXT>>>

RuleSpec：
<<<RULE_SPEC_JSON>>>

原始规则文本：
<<<SOURCE_RULE_TEXT>>>

Manifest 草稿：
<<<RULE_MANIFEST_JSON>>>

输出要求：
1. 按《规则范式》的主章节顺序输出
2. 必须覆盖：世界观、判定机制、风险与后果、角色创建、行动与场景规则
3. 如果存在资源系统、成长、流程示例等内容，可以补成可选章节
4. 对不确定内容只能谨慎转述，不可新增硬规则
5. 保留原规则的题材气质和主持约束
6. 输出纯 Markdown，不要额外说明
```

#### 输出检查

- Markdown 可读
- 必需章节存在
- 不包含与 `ruleSpec` 冲突的新规则

### 10.12.4 `story/intro.txt`

#### 文件目标

生成玩家进入剧本前看到的入口简介。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `storySpec.title` | 剧本标题。 | 帮助模型维持正确的剧本识别。 |
| `storySpec.intro` | 已抽取的剧本背景摘要。 | 是生成玩家入口简介的主要素材。 |
| `storySpec.playerRole` | 玩家身份、初始处境、认知边界。 | 确保 intro 说明“玩家是谁、从哪里进入”。 |
| `storySpec.coreGoals` | 显性目标、隐性目标、成功/失败条件。 | 帮助 intro 说明“当前最重要的问题是什么”。 |
| `storySpec.mainProgressAxis` | 剧本推进方式。 | 影响 intro 对故事张力的表述。 |
| `storySpec.risks` | 剧本内的风险源与后果。 | 让 intro 有压力感和 stakes。 |
| `storySpec.coverQuote` | 高识别度短句。 | 可用来增强入口感和封面文案一致性。 |

#### System Prompt

```text
你是 TRPG 剧本入口文案编辑。
你的任务是为玩家生成一段进入剧本前会看到的简介。
它要比一句话摘要更丰富，但不能泄露完整真相、幕后关系链或终局条件。
你必须让玩家知道：我是谁、我身处什么局面、我眼前最重要的问题是什么、这个故事的主要张力来自哪里。
输出纯中文文本，不要使用项目符号，不要加标题。
```

#### User Prompt

```text
请根据以下 StorySpec 生成 `story/intro.txt`。

输出要求：
1. 使用简体中文
2. 长度控制在 280 到 650 字
3. 允许营造氛围，但不得提前揭露终局真相
4. 必须自然包含以下信息：
   - 玩家角色的进入位置
   - 当前局面
   - 核心问题
   - 主要张力来源
5. 不要写成场景列表，不要写成主持人指令

StorySpec：
<<<STORY_SPEC_JSON>>>
```

#### 输出检查

- 纯文本
- 没有明显剧透终局
- 可直接展示给玩家

### 10.12.5 `story/story.md`

#### 文件目标

生成符合 `剧本范式.md` 的剧本主文档。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `storySpec` | 已抽取完成的剧本结构稿。 | 是 `story.md` 的主要事实来源。 |
| `剧本范式.md` | 当前项目规定的剧本章节模板。 | 用来锁定输出结构，保证可主持、可维护。 |
| `sourceStoryText` | 用户上传的原始剧本文本。 | 便于模型回看细节、保持原作风味。 |
| `storyManifestDraft` | 即将写入 `story/manifest.json` 的元信息草稿。 | 保证正文与 manifest 的标题、标签、节奏信息一致。 |
| `linkedRuleSummary` | 当前绑定规则的摘要。 | 避免剧本写法与所属规则冲突。 |

#### System Prompt

```text
你是 TRPG 剧本作者助手。
你的任务是把结构化 StorySpec 改写成一个可用于主持、维护和扩展的剧本主文档。
这是一份结构化主持文档，不是文学小说。
你必须遵循《剧本范式》的章节顺序。
你可以让文字更流畅，但不能改变 StorySpec 中已经确定的事实、节点、线索关系和结局条件。
如果某个可选模块不存在，就省略该模块，不要凭空补设定。
输出纯 Markdown。
```

#### User Prompt

```text
请生成 `story/story.md`。

你必须基于以下资料：

剧本范式：
<<<STORY_TEMPLATE_TEXT>>>

StorySpec：
<<<STORY_SPEC_JSON>>>

原始剧本文本：
<<<SOURCE_STORY_TEXT>>>

规则摘要：
<<<LINKED_RULE_SUMMARY>>>

Manifest 草稿：
<<<STORY_MANIFEST_JSON>>>

输出要求：
1. 必须覆盖：剧本元信息、故事 Intro、玩家角色定位、核心目标、剧本主推进轴、场景/节点结构、关键实体、关键信息单元、触发器与状态变化、风险与后果、分支点、结局结构、主持约束
2. 每个场景节点都要写出功能、进入条件、可得信息、风险和下一步钩子
3. 每个关键实体都要写出表层印象、动机、立场、与玩家关系、知情范围、阻碍与触发逻辑
4. 对已存在的 scene/entity id，正文里应保留或显式引用，便于后续机器再解析
5. 不要偷写成长篇小说，不要用大量抒情替代结构
6. 输出纯 Markdown
```

#### 输出检查

- 必需章节存在
- 场景、实体、线索、结局结构齐全
- 能支撑主持使用

### 10.12.6 `story/text_assets/beginning.zh-CN.md`

#### 文件目标

生成游戏开始时直接展示给玩家的开场缓存文本。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `ruleIntroText` | 规则包的入口简介。 | 用来快速提炼“这场游戏怎么玩”。 |
| `ruleMd` | 规则主文档。 | 当 intro 不足时，模型可从完整规则中补足表述。 |
| `storyIntroText` | 剧本入口简介。 | 用来快速建立背景和张力。 |
| `storyMd` | 剧本主文档。 | 用来确保开场与完整剧本一致。 |
| `storySpec.playerRole` | 玩家角色定位。 | 决定开场里的“角色确认”怎么写。 |
| `storySpec.coreGoals` | 核心目标和阶段目标。 | 决定开场里“游戏目的”怎么写。 |
| `storySpec.startScene` | 开场节点或默认入口场景。 | 决定开场文本从哪里切入。 |
| `storySpec.gmStyle` | 建议主持风格。 | 决定 opening 的引导语气和密度。 |

#### System Prompt

```text
你是 TRPG 开场文案设计师。
你的任务是生成玩家开始游戏时看到的 opening 文本。
它必须同时承担四个作用：
1. 用简洁语言介绍规则体验
2. 交代故事背景和当前入口
3. 明确玩家当前目标
4. 引导玩家确认角色或描述角色背景
不能泄露终局真相，也不能把完整规则全文塞进去。
输出纯 Markdown。
```

#### User Prompt

```text
请根据以下资料生成 `story/text_assets/beginning.zh-CN.md`。

资料如下：

规则简介：
<<<RULE_INTRO_TEXT>>>

规则主文档：
<<<RULE_MD>>>

剧本简介：
<<<STORY_INTRO_TEXT>>>

剧本主文档：
<<<STORY_MD>>>

StorySpec 摘要：
<<<STORY_BOOTSTRAP_JSON>>>

输出要求：
1. 使用中文
2. 使用以下固定标题：
   - 游戏规则简介
   - 背景故事概述
   - 游戏目的
   - 角色确认
3. 每个标题下内容都要简洁可读
4. 最后必须自然地邀请玩家描述角色背景、来意和随身重要物品，或者确认预设角色
5. 不要暴露隐藏结局、幕后最终责任链、未解锁信息
6. 输出纯 Markdown
```

#### 输出检查

- 四个固定标题存在
- 能直接用于当前 3.0 opening 读取
- 无终局级剧透

### 10.12.7 `story/npc_prompt/<NPC名>.txt`

#### 文件目标

为核心 NPC 输出单行英文外观 prompt。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `entity.name` | 角色名。 | 便于日志、文件命名和人工核对。 |
| `entity.type` | 实体类型，如 NPC、敌对者、同伴。 | 帮助模型判断角色呈现方式。 |
| `entity.appearance` | 剧本中明确给出的外观信息。 | 是肖像 prompt 的核心素材。 |
| `entity.surfaceImpression` | 玩家初见时的表层印象。 | 补足神态、姿态和气质信息。 |
| `entity.ageRange` | 年龄段。 | 让图像 prompt 更具体。 |
| `entity.genderPresentation` | 性别表达或外在呈现方式。 | 避免模型自行猜错角色外形。 |
| `entity.props` | 角色经常携带或手持的物件。 | 有助于增强角色辨识度。 |
| `storySpec.tones` | 剧本整体情绪风格。 | 让角色视觉风格与剧本统一。 |
| `ruleSpec.worldview` | 规则世界观摘要。 | 补充时代、地域、题材感。 |

#### System Prompt

```text
You are a character visual prompt writer.
Your task is to produce one single-line English prompt for an image model.
Describe only visible appearance and immediate vibe.
Do not reveal plot twists, secrets, hidden identity, or non-visual backstory.
Do not output explanations, headings, bullet points, or multiple lines.
```

#### User Prompt

```text
Generate one single-line image prompt for this NPC portrait.

Character name: <<<NPC_NAME>>>
Character type: <<<NPC_TYPE>>>
Age range: <<<NPC_AGE_RANGE>>>
Gender presentation: <<<NPC_GENDER_PRESENTATION>>>
Visible appearance: <<<NPC_APPEARANCE>>>
Surface impression: <<<NPC_SURFACE_IMPRESSION>>>
Props: <<<NPC_PROPS>>>
Story tones: <<<STORY_TONES>>>
Worldview/style context: <<<RULE_WORLDVIEW_SUMMARY>>>

Requirements:
1. Output exactly one line in English
2. Use comma-separated descriptive phrases
3. Focus on age, hair, face, clothes, posture, props, and emotional state
4. Keep it concrete and drawable
5. Avoid spoilers and abstract symbolism
```

#### 输出检查

- 单行
- 英文
- 无剧情 spoiler

### 10.12.8 `story/art_assets/cover.png` 的 LLM prompt

说明：

- `cover.png` 本身由 image model 生成
- 这里的 LLM 任务是先生成一个高质量的封面图 prompt

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `assetPlan.cover` | 封面图规划对象。 | 告诉模型封面服务什么用途、该聚焦什么。 |
| `storySpec.title` | 剧本标题。 | 帮助模型维持作品身份感。 |
| `storySpec.coverQuote` | 封面短句。 | 可转成主视觉的情绪锚点。 |
| `storySpec.intro` | 剧本入口摘要。 | 提供封面所需的背景和氛围信息。 |
| `storySpec.tags` | 剧本题材标签。 | 决定封面的题材语言。 |
| `storySpec.tones` | 剧本风格标签。 | 决定封面的色调和情绪。 |
| `ruleSpec.worldview` | 规则适用世界观摘要。 | 防止封面脱离所属规则气质。 |

#### System Prompt

```text
You are a key art prompt designer for narrative games.
Your task is to write a high-quality image prompt for the story cover.
The image should communicate genre, mood, era, and symbolic focus at a glance.
Do not reveal hidden ending information or late-game twists.
Return JSON only.
```

#### User Prompt

```text
Generate an image prompt package for `cover.png`.

Story title: <<<STORY_TITLE>>>
Cover quote: <<<COVER_QUOTE>>>
Story intro: <<<STORY_INTRO_TEXT>>>
Story tags: <<<STORY_TAGS>>>
Story tones: <<<STORY_TONES>>>
Rule/world context: <<<RULE_WORLDVIEW_SUMMARY>>>
Asset plan:
<<<COVER_ASSET_PLAN_JSON>>>

Output JSON format:
{
  "positivePrompt": "",
  "negativePrompt": "",
  "styleNotes": "",
  "spoilerCheck": "",
  "sizeHint": "portrait"
}

Requirements:
1. The cover must emphasize atmosphere, place, and one or two symbolic objects
2. Avoid showing final confrontation or confirmed culprit
3. The prompt must be directly usable by an image model
4. Keep spoilerCheck short and explicit
```

#### 输出检查

- JSON 可解析
- `positivePrompt` 非空
- `spoilerCheck` 明确写无终局剧透

### 10.12.9 `story/art_assets/other/*.png` 的 LLM prompt

#### 文件目标

为 `map.png`、`clue_board.png`、`key_object.png` 等辅助图生成图片 prompt。

#### 输入变量

| 字段 | 含义 | 为什么要传给这个 prompt |
| --- | --- | --- |
| `assetPlan.otherAssets[i]` | 当前正在生成的某一张辅助图规划对象。 | 告诉模型这张图到底是地图、线索板还是物件图。 |
| `storySpec.scenes` | 场景节点列表。 | 地图类图片需要空间关系，线索板也常依赖场景。 |
| `storySpec.entities` | 关键实体列表。 | 线索板、人际关系图等需要引用角色与组织。 |
| `storySpec.informationUnits` | 线索与信息单元列表。 | 让辅助图真正服务于理解，而不是纯装饰。 |
| `storySpec.tones` | 剧本整体情绪风格。 | 让辅助图的视觉风格与故事一致。 |

#### System Prompt

```text
You are an auxiliary narrative asset prompt designer.
Your task is to generate image prompts for support assets such as maps, clue boards, and key objects.
Each image must help the player understand the story package, not just look cool.
Do not reveal hidden endgame facts.
Return JSON only.
```

#### User Prompt

```text
Generate an image prompt package for this support asset.

Asset spec:
<<<ONE_OTHER_ASSET_PLAN_JSON>>>

Relevant scenes:
<<<RELEVANT_SCENES_JSON>>>

Relevant entities:
<<<RELEVANT_ENTITIES_JSON>>>

Relevant information units:
<<<RELEVANT_INFO_UNITS_JSON>>>

Story tones:
<<<STORY_TONES>>>

Output JSON format:
{
  "fileName": "",
  "positivePrompt": "",
  "negativePrompt": "",
  "styleNotes": "",
  "spoilerCheck": ""
}

Requirements:
1. The image must match the asset type
2. If fileName is `map.png`, prioritize spatial readability over painterly drama
3. If fileName is `clue_board.png`, prioritize relationship clarity and evidence mood
4. If fileName is `key_object.png`, prioritize object detail, age, damage, and symbolic importance
5. Avoid explicit late-game spoilers
```

#### 输出检查

- JSON 可解析
- 内容与 `fileName` 类型一致
- 无明显剧透

### 10.12.10 局部重生成 prompt

为了支持产品里的“只重生成某个文件”，建议统一再准备一个修订 prompt。

#### System Prompt

```text
你是内容修订助手。
你的任务不是从零生成，而是在保留已有文件大方向和结构的前提下，根据用户反馈做局部修改。
除非反馈明确要求，否则不要重写未涉及部分。
必须保持与 RuleSpec、StorySpec 和 manifest 一致。
输出只给目标文件内容，不要附解释。
```

#### User Prompt

```text
请根据以下信息重生成目标文件。

目标文件路径：
<<<TARGET_FILE_PATH>>>

当前文件内容：
<<<CURRENT_FILE_TEXT>>>

用户反馈：
<<<USER_FEEDBACK>>>

约束资料：
<<<RELEVANT_SPECS_AND_MANIFESTS>>>

要求：
1. 只修改与反馈相关的部分
2. 保持文件原有结构和语气
3. 不要引入与 spec 冲突的新设定
4. 输出完整的新文件内容
```

### 10.12.11 生成日志建议

虽然这些 prompt 不需要写入内容包本身，但建议把每次生成的以下数据保存在任务日志中：

- `model`
- `temperature`
- `systemPromptVersion`
- `userPrompt`
- `rawResponse`
- `parsedResult`
- `validationErrors`

这样后续调 prompt、复现 bug、回看失败样本都会轻松很多。

## 11. 哪些地方用脚本，哪些地方用 LLM

### 11.1 必须脚本完成

- 建目录
- 生成稳定 ID
- 生成 `manifest.json`
- 写文件
- 运行校验
- 生成 slug / 文件名
- 检查图片与 NPC prompt 是否缺失

### 11.2 适合 LLM 完成

- 结构抽取
- 文档重写
- 摘要
- 开场文案
- NPC 外观 prompt
- 图片规划
- 图片 prompt

### 11.3 不建议交给 LLM 的部分

- 最终 JSON 格式化
- 文件路径命名
- 必填字段兜底
- 高风险逻辑判断的最后裁定

## 12. 示例：NIHON / DAZHIZHAN 的落地结果

如果用这套生成器处理当前示例，预期会得到：

### Rule 包

```text
content/
  NIHON/
    rule/
      manifest.json
      intro.txt
      rule.md
```

其中：

- `manifest.json` 由抽取后的题材、语气、模式、警告标签拼出
- `intro.txt` 总结“幕府斩鬼”世界与代价驱动玩法
- `rule.md` 按 `规则范式` 把旧 prompt 重组为作者可编辑文档

### Story 包

```text
content/
  NIHON/
    story/
      DAZHIZHAN/
        manifest.json
        intro.txt
        story.md
        text_assets/
          beginning.zh-CN.md
        npc_prompt/
          <核心NPC>.txt
        art_assets/
          cover.png
          other/
            map.png
            clue_board.png
            key_object.png
```

其中：

- `story.md` 由旧剧本的背景、地点、NPC、线索、事件表重组而来
- `beginning.zh-CN.md` 会把玩家带入本次案件的入口场景
- `npc_prompt/*.txt` 来自核心人物卡中的外貌字段
- `map.png` 可从地点清单自动规划
- `clue_board.png` 可从线索结构自动规划
- `key_object.png` 可从关键遗物或核心物证自动规划

## 13. 实现建议

V1 可以先做成一个服务端脚本或后台任务，而不是一上来做复杂可视化编辑器。

建议模块：

- `ingestInputs()`
- `extractRuleSpec()`
- `extractStorySpec()`
- `fillMissingFields()`
- `generateRulePackage()`
- `generateStoryPackage()`
- `planAssets()`
- `generateImagePrompts()`
- `validateGeneratedPackage()`

建议运行方式：

1. 用户上传文件或填写表单
2. 如果是单独上传故事，先选择并确认 `关联规则`
3. 后台生成 `NormalizedPackageSpec`
4. 用户确认低置信度字段与目标输出路径
5. 系统写入内容包
6. 跑校验
7. 输出预览和导出

## 14. V1 范围建议

V1 先收敛，不要一次把所有高级特性做完。

建议 V1 只做：

- `zh-CN`
- 单规则 + 单剧本
- 单个 `beginning.zh-CN.md`
- `npc_prompt`
- `cover + other(1~3张)`
- 局部重生成
- `validateContent.ts` 集成
- 支持分开上传规则和故事
- 单独上传故事时强制选择 `关联规则`
- 前端显示目标输出路径预览

先不做：

- 多语言联动生成
- 多结局多版本 opening 缓存
- NPC 批量立绘一致性控制
- 多人协作编辑
- 在线版本历史

## 15. 最终建议

这套生成器的关键，不是“模型够不够强”，而是“是否把内容生成拆成了稳定的中间层与职责边界”。

如果直接拿大 prompt 从旧文件硬生所有输出，短期能出结果，但长期会遇到：

- 文件之间互相不一致
- 改一点就全盘重生
- 无法解释错误来自哪里
- 无法做用户确认和产品化

因此，`version 3.0` 的正确方向应该是：

> 用脚本控制结构、用 LLM 生成内容、用中间结构稿承接一切，并把图片、美术、opening、NPC prompt 都纳入同一套可校验的生成流水线。
