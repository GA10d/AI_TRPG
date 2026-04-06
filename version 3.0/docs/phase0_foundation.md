# Version 3.0 Phase 0 基线设计

## 1. 目标

这份文档用于固定 `version 3.0` 的第一版技术和数据基线。

本阶段只做设计，不做业务实现。目标是让后续开发都基于同一套边界：

- 第一里程碑：`单人假闭环`
- 长期方向：支持 `单 Agent 主持`、`多 Agent 协作`、`多人联机`、`私聊`
- 内容形式：`文件夹 + 文本内容 + 少量结构化元数据`
- 状态原则：AI 可以自由裁量，但系统里的状态、日志、存档必须可落盘、可回放、可调试

## 2. 已确认的关键决策

### 2.1 技术路线

- 前端：`React + TypeScript`
- 会话服务：`Node + TypeScript`
- 第一阶段模型调用模式：`mock`、`server_proxy`
- 预留但暂不实现：`browser_direct`

选择这条路线的原因：

- 未来要做多人联机、私聊、等待回复、统一结算，天然需要服务端维护权威 `Session`
- 前后端都用 TypeScript，可以共享类型定义，减少协议漂移
- 3.0 不直接继承 2.0 的 Python 运行时，但保留 2.0 的内容组织和状态设计思路

### 2.2 主持架构

3.0 从一开始就支持两种主持范式：

- `single_agent`
  一个主持人 AI 同时负责叙事、主持、NPC 扮演，并产出结构化裁定结果
- `multi_agent`
  将 `Narrator / NPC / Adjudicator` 等职责拆开

第一阶段只需要落地 `single_agent` 的接口边界，但类型和流程不能把 `multi_agent` 封死。

### 2.3 状态权威

不采用“服务器完全写死结局判定”，也不采用“自由文本直接作为唯一状态真相”。

采用混合方案：

- AI 负责给出 `结构化裁定结果`
- 服务器负责 `校验 -> 应用 -> 落盘 -> 记录回放`
- 结局允许三类：
  - `preset`：预设普通结局
  - `hidden`：预设隐藏结局
  - `emergent`：AI 基于实际游玩涌现出的结局

这样既保留主持人 AI 的自由裁量，也保留系统可调试、可恢复、可回放的能力。

### 2.4 存档策略

- 第一阶段：`localStorage`
- 存档内容：保存完整消息历史，不只保存摘要
- 摘要、工作记忆、上下文裁剪结果都属于派生数据，允许重建
- 后续如果日志和上下文变大，迁移到 `IndexedDB`

### 2.5 私聊策略

- 第一阶段：只预留数据结构，不做单人 UI 入口
- 当存在 AI 队友或多人玩家时，前端再显示私聊入口

### 2.6 日志策略

- 系统内部永远保留细粒度日志
- 前端显示支持三档：
  - `all`
  - `compact`
  - `hidden`

## 3. 推荐目录结构

`version 3.0` 建议逐步演进到下面这套结构：

```text
version 3.0/
  apps/
    web/
    server/
  packages/
    shared-types/
    shared-config/
  content/
    <ruleId>/
      rule/
      story/
  docs/
  test_ipynb/
```

说明：

- `apps/web`：React 前端
- `apps/server`：Node 会话服务
- `packages/shared-types`：前后端共用核心类型
- `packages/shared-config`：模型配置、语言配置、通用常量
- `content`：社区可编辑内容包
- `test_ipynb`：保留给 prompt 实验、日志分析、批量回放测试

当前 `version 3.0/code` 可以在真正开始实现时，被 `apps/` 和 `packages/` 结构替代。

## 4. 内容包设计

## 4.1 设计原则

内容包优先满足两个目标：

- 社区作者容易写
- 程序和 AI 都能稳定读取

因此采用混合式内容方案：

- 叙事正文和演出文本：`Markdown / txt`
- 元信息和兼容性字段：`JSON` 或 `YAML`

不使用 TypeScript 作为社区创作格式。

## 4.2 Rule 包结构

建议结构：

```text
content/
  VHS/
    rule/
      manifest.json
      locales/
        zh-CN/
          intro.md
          rule.md
        en-US/
          intro.md
          rule.md
```

迁移兼容：

- 在过渡期，允许保留当前的 `intro.txt`、`rule.md`
- 如果不存在 `locales/<locale>/`，则根目录文件视为默认语言

`manifest.json` 最少包含：

```json
{
  "schemaVersion": "0.1.0",
  "id": "VHS",
  "version": "1.0.0",
  "defaultLocale": "zh-CN",
  "availableLocales": ["zh-CN", "en-US"],
  "title": {
    "zh-CN": "VHS复古恐怖录像带",
    "en-US": "VHS Retro Horror Tape"
  },
  "themes": ["horror", "survival", "investigation"],
  "tones": ["immersive", "oppressive", "high-risk"],
  "supportsModes": ["single_player", "multiplayer"],
  "gmStyles": ["single_agent", "multi_agent"],
  "authoringSpec": "规则范式(1)",
  "contentWarnings": ["violence", "body-harm", "psychological-horror"]
}
```

`rule.md` 的作者组织方式仍然以你当前的《规则范式》为准，重点包括：

- 世界观
- 判定机制
- 风险与后果
- 角色创建
- 行动与场景规则
- 可选资源/成长/流程示例

## 4.3 Story 包结构

建议结构：

```text
content/
  VHS/
    story/
      The_Silence/
        manifest.json
        locales/
          zh-CN/
            intro.md
            story.md
          en-US/
            intro.md
            story.md
        assets/
        extras/
          scene-index.json
          entities.json
          endings.json
```

其中：

- `story.md` 是作者主文档，按《剧本范式》组织
- `manifest.json` 提供程序必须读的字段
- `extras/` 用于后续把部分结构从大文档中拆出来，但不是第一阶段硬要求

`manifest.json` 最少包含：

```json
{
  "schemaVersion": "0.1.0",
  "id": "THE_SILENCE",
  "version": "1.0.0",
  "ruleId": "VHS",
  "defaultLocale": "zh-CN",
  "availableLocales": ["zh-CN", "en-US"],
  "title": {
    "zh-CN": "湖岸录像谜灵",
    "en-US": "The Silence"
  },
  "playerCount": {
    "min": 1,
    "max": 1
  },
  "supportsModes": ["single_player"],
  "recommendedLength": "medium",
  "recommendedPacing": "medium",
  "gmStyle": "strong-guidance",
  "tags": ["horror", "vhs", "investigation", "survival"],
  "contentWarnings": ["fire-death", "suffocation", "trauma"],
  "authoringSpec": "剧本范式(1)",
  "startSceneId": "entry_plaza"
}
```

`story.md` 的作者组织方式以你当前的《剧本范式》为准，至少覆盖：

- 剧本元信息
- Story Intro
- 玩家角色定位
- 核心目标
- 主推进轴
- 场景/节点结构
- 关键实体
- 关键信息单元
- 触发器与状态变化
- 风险与后果
- 分支点
- 结局结构
- 主持约束

## 4.4 Authoring 和 Runtime 分离

作者写的是 `authoring content`，运行时读的是 `runtime package`。

两者关系：

- 作者主要维护 `manifest + markdown`
- 内容加载器负责把它们整理为运行时可消费的统一对象
- 后续如果需要，可以增加编译步骤，把 Markdown 转为标准化 JSON

这样做的好处：

- 作者体验简单
- 不强迫社区用户写结构化代码
- 程序端依然能拿到稳定字段

## 5. 核心运行组件

3.0 运行时建议拆成下面几个组件。

### 5.1 Web App

职责：

- 会话创建与设置
- 展示叙事、日志、角色信息、存档入口
- 显示不同日志视图
- 后续扩展私聊入口和多人状态

### 5.2 Session Service

职责：

- 创建和恢复 `Session`
- 维护权威 `GameState`
- 记录消息、回放和调试日志
- 协调 AI 调用
- 应用结构化裁定结果

### 5.3 Content Loader

职责：

- 读取 `content/`
- 做 rule/story 兼容性检查
- 选择语言与回退语言
- 生成给前端和 AI 使用的标准化内容对象

### 5.4 Model Gateway

职责：

- 抽象 `mock`、`server_proxy`、`browser_direct`
- 屏蔽不同 provider 的细节
- 统一输出文本结果、结构化结果、错误对象、调试信息

### 5.5 Game Master Service

职责：

- 在 `single_agent` 模式下，生成主持人叙事和 NPC 发言
- 读取 rule/story/current state/recent log
- 不直接负责落盘

### 5.6 Adjudicator Service

职责：

- 返回结构化状态变化
- 判断是否进入结局态
- 给出 `preset / hidden / emergent` 结局候选
- 解释本轮为什么这么判

说明：

- 第一阶段可以由同一个模型承担 `Game Master` 和 `Adjudicator`
- 但接口层面必须把文本输出和结构化输出分开

## 6. 核心类型草案

下面是第一版推荐类型边界。

## 6.1 Supporting Types

```ts
type LocaleCode = "zh-CN" | "en-US" | string

type SessionStatus =
  | "draft"
  | "active"
  | "paused"
  | "ending"
  | "ended"

type PlayMode =
  | "single_player"
  | "single_player_with_npc"
  | "multiplayer"

type GmArchitecture =
  | "single_agent"
  | "multi_agent"

type ModelAccessMode =
  | "mock"
  | "server_proxy"
  | "browser_direct"

type Visibility =
  | "public"
  | "private"
  | "gm_only"
  | "system"

type EndingType =
  | "preset"
  | "hidden"
  | "emergent"
```

```ts
type Participant = {
  id: string
  role: "human_player" | "npc" | "gm" | "system"
  displayName: string
  isAiControlled: boolean
  isLocalUser: boolean
  locale?: LocaleCode
}
```

```ts
type StatePatchOp = {
  op: "set" | "increment" | "append" | "remove"
  path: string
  value?: unknown
  reason?: string
}
```

## 6.2 Session

```ts
type Session = {
  id: string
  schemaVersion: string
  status: SessionStatus
  playMode: PlayMode
  gmArchitecture: GmArchitecture
  modelAccessMode: ModelAccessMode
  locale: LocaleCode
  ruleId: string
  storyId: string
  currentRound: number
  createdAt: string
  updatedAt: string
  participants: Participant[]
  playerParticipantId: string
  settings: SessionSettings
  gameState: GameState
}
```

```ts
type SessionSettings = {
  logViewMode: "all" | "compact" | "hidden"
  debugEnabled: boolean
  modelProfileId?: string
  promptDebugEnabled: boolean
}
```

## 6.3 GameState

```ts
type GameState = {
  schemaVersion: string
  phase: "setup" | "playing" | "ending" | "ended"
  sceneId: string
  sceneState: Record<string, unknown>
  actorState: Record<string, unknown>
  storyFlags: Record<string, boolean | number | string | null>
  clocks: Record<string, number>
  discoveredInfoIds: string[]
  objectiveState: {
    active: string[]
    completed: string[]
    failed: string[]
  }
  unresolvedHooks: string[]
  endingState: null | {
    endingId: string
    endingType: EndingType
    title: string
    summary: string
    confirmedAtRound: number
  }
}
```

说明：

- `storyFlags` 用于容纳剧本中的状态值、关系值、风险等级、开关量
- `sceneState` 和 `actorState` 保持泛化，避免第一版过早写死所有题材
- `endingState` 只有在结局确认后才落入权威状态

## 6.4 Message

```ts
type Message = {
  id: string
  round: number
  createdAt: string
  senderId: string
  recipientIds: string[]
  visibility: Visibility
  kind:
    | "player_input"
    | "npc_chat"
    | "gm_narration"
    | "gm_dialogue"
    | "system"
    | "debug"
  content: string
  tags?: string[]
}
```

说明：

- 未来多人和私聊直接复用同一套消息结构
- 单人第一阶段只实际使用 `public` 和 `system`
- 即使前端隐藏私聊入口，底层结构也不要删掉

## 6.5 ReplayEvent

```ts
type ReplayEvent = {
  id: string
  round: number
  createdAt: string
  actorId: string
  type:
    | "message_created"
    | "submission_locked"
    | "gm_response_received"
    | "adjudication_received"
    | "state_patch_applied"
    | "ending_candidate_detected"
    | "ending_confirmed"
    | "save_created"
    | "save_loaded"
  displayLevel: "core" | "detail" | "debug"
  summary: string
  payload?: Record<string, unknown>
}
```

日志显示规则：

- `all`：显示 `core + detail + debug`
- `compact`：显示 `core`
- `hidden`：前端不显示，但事件仍然保留

## 6.6 AdjudicationResult

```ts
type AdjudicationResult = {
  id: string
  round: number
  sourceArchitecture: GmArchitecture
  patchOps: StatePatchOp[]
  unlockedInfoIds: string[]
  sceneTransition: null | {
    fromSceneId: string
    toSceneId: string
    reason: string
  }
  risks: {
    escalated: string[]
    relieved: string[]
  }
  isGameOver: boolean
  endingCandidate: EndingCandidate | null
  rationale: string[]
  followUpHooks: string[]
}
```

## 6.7 EndingCandidate

```ts
type EndingCandidate = {
  id: string
  type: EndingType
  title: string
  summary: string
  visibility: "public" | "hidden"
  confidence: number
  reasons: string[]
}
```

说明：

- `preset` 和 `hidden` 结局应尽量对应 story 中定义的结局结构
- `emergent` 允许 AI 根据实际游玩产生新结局
- 服务端不决定叙事内容，但会检查结构是否完整

## 7. 回合流程

第一阶段的最小可运行流程如下。

### 7.1 建立会话

1. 前端选择 `rule + story + locale + model mode`
2. 服务端加载内容包
3. 服务端创建 `Session`
4. 服务端初始化 `GameState`
5. 服务端写入开场 `Message` 和 `ReplayEvent`

### 7.2 单轮处理

1. 玩家输入一条面向主持人的公开指令
2. 服务端将该输入写成 `Message`
3. `Game Master Service` 生成：
   - 主持叙事
   - NPC 发言
   - 可见反馈文本
4. `Adjudicator Service` 生成：
   - `patchOps`
   - `sceneTransition`
   - `endingCandidate`
   - `isGameOver`
5. 服务端验证结构体：
   - 字段是否合法
   - patch 路径是否合法
   - 结局结果是否完整
6. 服务端应用 `patchOps` 并更新 `GameState`
7. 服务端写入：
   - 新消息
   - 回放事件
   - 调试记录
8. 前端刷新主叙事区和日志区

### 7.3 结局确认

结局不由服务器纯硬编码判断，而由 `Adjudicator` 提出候选。

服务端职责是：

- 校验 `EndingCandidate` 结构
- 记录它是 `preset / hidden / emergent`
- 在满足结束条件时把 `Session.status` 切到 `ending` 或 `ended`
- 将最终确认的结局写入 `GameState.endingState`

这样可以保留“主持人 AI 有自由裁量”的体验，同时又不会让状态失控。

## 8. 存档与上下文

## 8.1 存档内容

第一阶段存档包建议包含：

```ts
type SaveBundle = {
  schemaVersion: string
  savedAt: string
  session: Session
  messages: Message[]
  replay: ReplayEvent[]
  agentContexts: Record<string, Message[]>
  derivedMemory?: {
    sceneSummary?: string
    objectiveSummary?: string
    actorSummaries?: Record<string, string>
  }
}
```

其中：

- `messages` 是完整历史
- `replay` 是细粒度调试与回放历史
- `agentContexts` 保存各 Agent 的工作上下文
- `derivedMemory` 不是唯一真相，可随时重建

## 8.2 上下文使用原则

运行时不建议把全部历史每轮原样喂给模型。

推荐三层：

- `canonical log`
  完整历史，持久保存
- `derived memory`
  由完整历史提炼出的摘要、关系变化、未完成目标
- `runtime context`
  真正喂给模型的上下文，只包含必要静态前缀、当前状态、最近消息和必要摘要

这套设计能同时满足：

- 不丢信息
- 可调试
- 控制 token 成本
- 兼容后续 prompt caching

## 9. 多语言策略

3.0 从第一版起就按“多语言可扩展”设计。

最低要求：

- `manifest` 中有 `defaultLocale` 和 `availableLocales`
- 文本文件支持 `zh-CN`、`en-US`
- 前端文案和内容文案分开管理

建议：

- UI 文案独立于故事内容
- 内容包使用 `locales/<locale>/...`
- 如果目标语言缺失，回退到 `defaultLocale`

## 10. 调试与 Notebook

即使 3.0 主工程不再用 Python 作为前后端主逻辑，`ipynb` 仍然值得保留。

`test_ipynb/` 的推荐用途：

- 调本地 Node 服务接口
- 批量跑 mock session
- 对比 prompt 版本
- 分析 replay 和结局触发
- 检查内容包加载结果

因此后续服务端应预留调试接口，例如：

- `create session`
- `submit turn`
- `export replay`
- `dump state`

## 11. 从 2.0 可复用的东西

3.0 不直接搬 2.0 的运行时代码，但建议复用下面这些思路：

- 状态分层思维
  参考 2.0 的 `models.py`
- 内容包装配思维
  参考 2.0 的 `prompt_loader.py`
- 会话、存档、导出 payload 的边界
  参考 2.0 的 `http_server.py`
- provider 配置思路
  参考 2.0 的 `data_TextModel.yml`、`data_DefaultPreference.json`
- 前端交互经验
  参考 2.0 中 session 创建、save/load、log/monitor 的处理方式

不建议直接复用：

- 2.0 的 Python 多 Agent 运行时
- 2.0 当前未完全收束的重复实现部分
- 2.0 尚未真正接通的图像链路

## 12. Phase 0 结束标准

当以下内容被确认，Phase 0 即可结束：

- 技术边界明确
- 目录结构明确
- 内容包 schema 明确
- 核心类型明确
- 单轮流程明确
- 存档边界明确
- 多语言和调试边界明确

Phase 0 完成后，下一步进入：

`项目骨架搭建 + shared types 落地 + content loader 最小实现`
