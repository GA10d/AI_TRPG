# Phase 2 字段瘦身审阅稿

## 目的

这份文档用于收敛 `version 3.0` 当前的数据结构复杂度，避免重走 `version 2.0` 的字段膨胀路线。

当前判断基于这几个前提：

- MVP 先做单人对话式 TRPG
- 大部分 Agent 返回会以自然语言为主
- 结构字段只保留“流程控制必需项”
- 真正的第一真相应当是 `messages`
- `replay` 主要承担调试、排错、回放

当前审阅主要参考：

- `packages/shared-types/src/runtime.ts`
- `packages/shared-types/src/api.ts`
- `packages/shared-types/src/content.ts`
- `apps/server/src/session/service.ts`
- `apps/web/src/components/GameScreen.tsx`

---

## 必留

这些字段建议保留为 MVP 核心字段。

| 字段 | 当前所在结构 | 作用 | 备注 |
| --- | --- | --- | --- |
| `Session.id` | `Session` | 会话唯一标识，用于 save/load、继续游戏、恢复 | 必留 |
| `Session.status` | `Session` | 标识这局是否进行中、已结束、已暂停 | 必留 |
| `Session.ruleId` | `Session` | 标识当前使用的规则包 | 必留 |
| `Session.storyId` | `Session` | 标识当前使用的剧本包 | 必留 |
| `Session.locale` | `Session` | 标识当前使用语言 | 必留 |
| `Session.currentRound` | `Session` | 回合推进与显示排序基础 | 必留 |
| `Session.createdAt` | `Session` | 存档/最近记录排序 | 必留 |
| `Session.updatedAt` | `Session` | 存档/最近记录排序 | 必留 |
| `Session.modelAccessMode` | `Session` | 区分 `mock / server_proxy` | 必留 |
| `Session.settings.modelProfileId` | `SessionSettings` | 指向当前模型档案 | 必留 |
| `Session.settings.logViewMode` | `SessionSettings` | 控制日志显示级别 | 必留 |
| `Message.id` | `Message` | 消息唯一标识 | 必留 |
| `Message.round` | `Message` | 消息属于哪一回合 | 必留 |
| `Message.createdAt` | `Message` | 消息排序与回放时间线 | 必留 |
| `Message.senderId` | `Message` | 标识谁发送了这条消息 | 必留 |
| `Message.recipientIds` | `Message` | 标识发给谁，后续可支持私聊 | 建议保留最小寻址能力 |
| `Message.visibility` | `Message` | 区分公开、私密、系统、仅主持 | 建议保留 |
| `Message.kind` | `Message` | 区分玩家输入、主持叙事、系统消息等 | 必留 |
| `Message.content` | `Message` | 自然语言正文，本项目最重要的真相之一 | 必留 |
| `ReplayEvent.id` | `ReplayEvent` | 回放事件唯一标识 | 必留 |
| `ReplayEvent.round` | `ReplayEvent` | 事件属于哪一回合 | 必留 |
| `ReplayEvent.createdAt` | `ReplayEvent` | 回放排序 | 必留 |
| `ReplayEvent.type` | `ReplayEvent` | 区分创建会话、提交回合、保存成功等事件 | 必留 |
| `ReplayEvent.displayLevel` | `ReplayEvent` | 对应日志显示粒度 | 必留 |
| `ReplayEvent.summary` | `ReplayEvent` | 面向前端显示的简短说明 | 必留 |
| `SaveBundle.savedAt` | `SaveBundle` | 存档时间 | 必留 |
| `SaveBundle.session` | `SaveBundle` | 恢复一局游戏的核心元数据 | 必留 |
| `SaveBundle.messages` | `SaveBundle` | 完整消息历史 | 必留 |
| `SaveBundle.replay` | `SaveBundle` | 完整回放/调试日志 | 必留 |
| `CreateSessionRequest.ruleDirectoryName` | `CreateSessionRequest` | 选择哪个规则目录创建会话 | 必留 |
| `CreateSessionRequest.storyDirectoryName` | `CreateSessionRequest` | 选择哪个剧本目录创建会话 | 必留 |
| `CreateSessionRequest.locale` | `CreateSessionRequest` | 创建时指定语言 | 必留 |
| `CreateSessionRequest.modelAccessMode` | `CreateSessionRequest` | 创建时指定模型模式 | 必留 |
| `CreateSessionRequest.modelProfileId` | `CreateSessionRequest` | 创建时指定模型档案 | 必留 |
| `Content.ruleId / storyId` | `content` | 内容包唯一标识 | 必留 |
| `Content.title` | `content` | 前端选剧本页面显示标题 | 必留 |
| `Content.defaultLocale / availableLocales` | `content` | 内容语言选择与回退 | 必留 |
| `StoryManifest.ruleId` | `StoryManifest` | 保证 story 和 rule 绑定正确 | 必留 |

---

## 可空

这些字段不是当前 MVP 核心，但如果你担心后面要接功能，可以保留为可空或弱化字段。

| 字段 | 当前所在结构 | 作用 | 备注 |
| --- | --- | --- | --- |
| `Session.playMode` | `Session` | 标识单人、单人带 NPC、多人 | MVP 初期可默认单人 |
| `Session.gmArchitecture` | `Session` | 标识单 Agent 或多 Agent | 如果 MVP 固定单 Agent，可弱化 |
| `Session.schemaVersion` | `Session` | 用于未来存档迁移 | 可留，但不是主流程核心 |
| `Session.settings.debugEnabled` | `SessionSettings` | 控制开发调试信息 | 更偏开发开关 |
| `Session.settings.promptDebugEnabled` | `SessionSettings` | 控制 prompt 调试显示 | 更偏开发开关 |
| `Participant[]` | `Session` | 描述参与者列表 | 若近期不做私聊/多人，可先弱化 |
| `Participant.locale` | `Participant` | 每个参与者的语言设置 | 当前非刚需 |
| `Participant.isAiControlled` | `Participant` | 标识是否 AI 控制 | 当前可空 |
| `Participant.isLocalUser` | `Participant` | 标识是否本地用户 | 当前可空 |
| `Message.tags` | `Message` | 给消息加来源或调试标签 | 可空 |
| `ReplayEvent.actorId` | `ReplayEvent` | 标识哪个参与者触发了事件 | 有助排错，但不是 MVP 真相 |
| `ReplayEvent.payload` | `ReplayEvent` | 扩展调试信息 | 可空 |
| `SaveBundle.contentSummary` | `SaveBundle` | 为存档列表提供简要展示文案 | 不存也可从 session 推导 |
| `SaveBundle.runtimeConfig.modelProfileId` | `SaveRuntimeConfig` | 恢复模型档案时更方便 | 可空 |
| `SaveBundle.runtimeConfig.runtimeModelConfig.baseUrl` | `SaveRuntimeConfig` | 恢复模型调用地址 | 可空 |
| `SaveBundle.runtimeConfig.runtimeModelConfig.model` | `SaveRuntimeConfig` | 恢复模型名 | 可空 |
| `SaveBundle.runtimeConfig.runtimeModelConfig.apiKey` | `SaveRuntimeConfig` | 恢复 API key | 建议默认不存，若保留应可空 |
| `GameState.phase` | `GameState` | 表示 setup/playing/ending/ended | 若保留 `GameState` 薄层，可留 |
| `GameState.endingState` | `GameState` | 存储最终结局信息 | 若近期要做结局页，可留可空 |
| `RuleManifest.themes / tones / gmStyles` | `content` | 选剧本页展示增强信息 | 不影响主循环 |
| `StoryManifest.tags / contentWarnings / recommendedLength / recommendedPacing / gmStyle / playerCount / supportsModes` | `content` | 选剧本页展示增强信息 | 更偏内容展示层 |
| `ContentCatalogAsset` | `content` | 封面图等资源 | 没图也能跑主流程 |

---

## 删除

这些字段当前更像 `version 2.0` 式的“预支复杂度”，建议从 MVP 核心结构里移除。

| 字段 | 当前所在结构 | 作用 | 删除理由 |
| --- | --- | --- | --- |
| `GameState.schemaVersion` | `GameState` | GameState 自身版本号 | 与 `Session.schemaVersion` 重复，优先删 |
| `GameState.sceneId` | `GameState` | 当前场景 id | 现在主要由 mock 驱动，MVP 对话式流程不必依赖 |
| `GameState.sceneState` | `GameState` | 场景扩展状态容器 | 当前边界过于松散，且主要用于 mock 展示 |
| `GameState.actorState` | `GameState` | 角色运行时状态 | 太重，当前没有真实消费方 |
| `GameState.storyFlags` | `GameState` | 结构化剧情旗标 | 典型膨胀字段，MVP 不宜先背 |
| `GameState.clocks` | `GameState` | 倒计时/威胁计时器 | 当前是 mock 概念，不是 MVP 核心 |
| `GameState.discoveredInfoIds` | `GameState` | 结构化线索发现列表 | 当前更像线索树系统，超出 MVP |
| `GameState.objectiveState` | `GameState` | 目标追踪 | 当前只是 UI 骨架，不是必要真相 |
| `GameState.unresolvedHooks` | `GameState` | 未解决剧情钩子 | 明显是预埋复杂度，先删最干净 |
| `StatePatchOp` | 独立类型 | 结构化状态补丁操作 | 与“自然语言为主”的目标冲突 |
| `EndingCandidate` | 独立类型 | 结局候选结构体 | 现在没有真实业务依赖，可等结局页前再补 |
| `AdjudicationResult` | 独立类型 | AI 裁定结构体 | 当前没有真实落地，不适合先背 |
| `SaveBundle.agentContexts` | `SaveBundle` | 各 Agent 上下文 | 目前只是由消息历史派生，非真相 |
| `SaveBundle.derivedMemory` | `SaveBundle` | 派生记忆摘要 | 可由消息历史重建，不该作为核心存档字段 |

---

## 我给你的总体建议

如果按当前产品方向继续收缩，MVP 的核心建议压缩为：

- `Session`
- `Message[]`
- `ReplayEvent[]`
- `SaveBundle`
- 最小 `content metadata`

换句话说：

- 第一真相是完整消息历史
- 第二真相是最小流程状态
- 不要在 MVP 里先做世界状态模拟器

---

## 待你审阅

你可以直接在下面补意见：

### 1. 必留字段里，哪些你觉得还可以继续删？

- 

### 2. 可空字段里，哪些你其实想升级为必留？

- 

### 3. 删除字段里，哪些你想保留？

- 

### 4. 你是否接受把 `GameState` 缩成极薄版本？

- 例如只留：
  - `phase?`
  - `endingState?`

你的意见：

- 

