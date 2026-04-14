# Phase 5 TRPG Context Compression Design

## 1. 文档目标

这份文档给 `version 3.0` 设计一套最适合 TRPG 的上下文压缩方案。

目标不是单纯“减少 token”，而是同时满足下面几件事：

1. 不丢关键线索、秘密、人物关系和未解决问题。
2. 兼容 `public story`、`private chat`、`gm only` 三种可见范围。
3. 兼容当前 `SessionSnapshot / SaveBundle / InMemorySessionStore` 架构。
4. 兼容未来结局分支、节点恢复、重新开线。
5. 尽量复用现有“结局辅助 AI”这条结构化 JSON 输出链路，不额外发明一套模型接入层。

这份设计文档只描述目标架构和推荐落点，不在本轮直接改动业务代码。

---

## 2. 为什么 TRPG 不能只靠普通摘要

普通聊天应用里，长历史压成一段 summary 往往已经够用；TRPG 不一样。

TRPG 的上下文同时包含：

- 长期稳定规则：世界观、规则、角色设定、人格标签
- 中期状态：当前场景、队伍目标、已知线索、已触发但未解决的问题
- 短期动作：最近几轮玩家公开行动、主持人旁白、AI 队友公开发言
- 私密状态：玩家和某名 AI 队友的私聊、该队友自己的秘密判断
- 分支状态：某条世界线里出现过的事实，不应污染其它分支

如果只做“滚动摘要”，最容易丢掉的恰恰是 TRPG 最重要的东西：

- 一个不起眼但关键的线索
- 某个 NPC 之前说过的矛盾细节
- 某个私聊里形成的策略约定
- 尚未揭晓、但必须持续施压的未解问题

所以这套设计不采用“单一摘要记忆”，而采用“分层 memory + 结构化事实检索 + 最近原文窗口”。

---

## 3. 当前 version 3.0 的可复用基础

### 3.1 现有 session 主干已经很清晰

当前会话快照结构是：

- `SessionSnapshot = { session, messages, replay, contentSummary }`
- `SaveBundle` 会把 `session / messages / replay / contentSummary` 一起存盘
- `InMemorySessionStore` 直接保存完整快照

对应代码：

- `packages/shared-types/src/api.ts`
- `packages/shared-types/src/runtime.ts`
- `apps/server/src/session/store.ts`
- `apps/server/src/save_repository.ts`

这意味着：

- `canonical log` 已经存在，不需要重做
- 新的 memory 层可以作为 `snapshot` 的派生/补充结构进入快照和存档
- 分支恢复时也能自然跟着 `SaveBundle` 走

### 3.2 当前真正送给模型的上下文仍偏“整段拼接”

目前 Narrator 生成主要吃的是：

- 最新玩家输入
- `conversationContext`

而 `conversationContext` 是 `public_story` 消息直接串起来得到的完整文本。

对应代码：

- `apps/server/src/session/service.ts`
- `apps/server/src/model_gateway/openai_compatible.ts`
- `apps/server/src/single_agent/service.ts`

AI 队友和私聊也类似：

- `publicStoryContext`
- `privateContext`
- 最近输入

对应代码：

- `apps/server/src/ai_players/service.ts`

所以 Phase 5 的核心不是替换整个 session 流程，而是把“上下文组装器”从纯字符串拼接改成“分层检索后的 context pack”。

### 3.3 现有“结局辅助 AI”已经具备结构化输出能力

当前结局辅助 AI 这条链路已经支持：

- `json_schema`
- `json_object`
- 严格 schema 失败后 fallback
- 把模型输出解析成业务结构体

对应代码：

- `apps/server/src/single_agent/service.ts`
- `apps/server/src/model_gateway/single_agent_proxy.ts`
- `apps/server/src/model_gateway/types.ts`
- `apps/prompt/ending_judge/system_prompt.txt`
- `apps/prompt/ending_judge/output_schema.json`

这正好适合复用来做：

- 事实抽取
- open loop 更新
- scene summary 压缩
- memory delta 合并建议

结论：

> Phase 5 不需要再发明一个新的“结构化 AI 调用框架”，而应该把现有 ending judge 辅助链路泛化为通用的 structured assistant。

---

## 4. 推荐总架构

```text
canonical log
  ├─ messages            // 完整消息历史，唯一事实来源
  ├─ replay              // 调试/回放事件
  └─ save bundle         // 持久化

derived memory
  ├─ facts               // 结构化事实
  ├─ open loops          // 未解决问题/悬念/目标
  ├─ scene summaries     // 场景级摘要
  ├─ entity registry     // NPC/地点/物品/组织索引
  └─ private thread memory

runtime context pack
  ├─ static prefix       // 规则、提示词、人格、语言
  ├─ live state          // 当前回合、当前场景、当前目标
  ├─ recent raw window   // 最近原文
  ├─ retrieved facts     // 检索出来的相关事实
  ├─ open loops          // 当前应持续施压的未解问题
  └─ episodic fallback   // 检索不足时补场景摘要
```

关键原则：

1. `messages/replay` 是唯一真相，不删。
2. `derived memory` 可以重建，但建议持久化，减少恢复成本。
3. 模型实际看到的是 `runtime context pack`，不是全量日志。
4. 对不同任务，context pack 的组成不同。

---

## 5. 最适合 TRPG 的 memory 分层

## 5.1 Layer A: Canonical Log

这一层保持现状，是完整历史：

- `messages`
- `replay`

职责：

- 存档恢复
- 调试排查
- 重建 derived memory
- 分支回放

这一层不参与直接压缩，只参与“重新提炼”。

## 5.2 Layer B: Structured Facts

这是 Phase 5 的核心。

推荐新增统一事实结构：

```ts
type SessionFactScope =
  | { visibility: "public" }
  | { visibility: "private"; participantId: string }
  | { visibility: "gm_only" };

type SessionFactKind =
  | "identity"
  | "relationship"
  | "location"
  | "item"
  | "clue"
  | "goal"
  | "condition"
  | "secret"
  | "event"
  | "rule";

type SessionFact = {
  id: string;
  scope: SessionFactScope;
  kind: SessionFactKind;
  title: string;
  summary: string;
  entities: string[];
  tags: string[];
  status: "active" | "superseded" | "resolved";
  confidence: "high" | "medium" | "low";
  priority: number;
  sourceMessageIds: string[];
  roundFirstSeen: number;
  roundLastSeen: number;
  createdAt: string;
  updatedAt: string;
};
```

解释：

- `summary` 是给模型直接消费的短事实句
- `entities` 用于检索
- `status` 用来处理“已被推翻”或“已解决”
- `scope` 决定哪些 agent 能看到

TRPG 里真正需要被长期记住的东西，大都适合沉淀成这层。

## 5.3 Layer C: Open Loops

TRPG 的剧情推进高度依赖“未解问题”，所以建议单独建模，不把它埋进 summary。

```ts
type SessionOpenLoop = {
  id: string;
  scope: SessionFactScope;
  title: string;
  summary: string;
  relatedEntities: string[];
  status: "open" | "resolved" | "stale";
  sourceMessageIds: string[];
  openedAtRound: number;
  resolvedAtRound?: number | null;
  updatedAt: string;
};
```

典型 open loop：

- 谁杀了白娘子
- 阁楼脚印为什么会在雨夜后依然干燥
- 李维是否真的见过那场大火
- 某个 AI 队友私下怀疑谁

这层对 Narrator 非常重要，因为它决定主持人接下来应该继续推进什么。

## 5.4 Layer D: Scene / Episode Summaries

摘要仍然需要，但不应替代 facts。

推荐建模为场景级摘要：

```ts
type SessionEpisodeSummary = {
  id: string;
  scope: SessionFactScope;
  title: string;
  summary: string;
  coveredRounds: {
    from: number;
    to: number;
  };
  relatedEntities: string[];
  keyFactIds: string[];
  openLoopIds: string[];
  createdAt: string;
};
```

建议触发时机：

- 场景明显切换
- 连续 3 到 5 轮后
- 历史 token 超预算时
- 保存前或分支前做一次补齐

作用：

- 压缩“中期剧情走势”
- 在检索不足时当 fallback
- 给分支恢复提供稳定的中层记忆

## 5.5 Layer E: Entity Registry

为了让检索稳定，推荐维护一个轻量实体索引。

```ts
type SessionEntityMemory = {
  id: string;
  canonicalName: string;
  aliases: string[];
  kind: "player" | "companion" | "npc" | "location" | "item" | "organization" | "concept";
  scope: SessionFactScope;
  summary: string;
  factIds: string[];
  updatedAt: string;
};
```

这一层不是必须给模型看的，而是服务端内部检索和去重的辅助索引。

---

## 6. Session Memory 应该怎么拆

推荐不要把所有 memory 都塞进 `session.gameState`。

`gameState` 适合存玩家可见、当前运行态字段，例如：

- `endingState`
- `roundInputState`
- `storyControlMode`

而上下文压缩相关内容更适合作为独立 memory 层。

推荐新增：

```ts
type SessionMemory = {
  version: 1;
  facts: SessionFact[];
  openLoops: SessionOpenLoop[];
  episodeSummaries: SessionEpisodeSummary[];
  entityRegistry: SessionEntityMemory[];
};
```

并接入：

```ts
type SessionSnapshot = {
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary: SessionContentSummary;
  memory?: SessionMemory;
};

type SaveBundle = {
  schemaVersion?: string;
  savedAt: string;
  session: Session;
  messages: Message[];
  replay: ReplayEvent[];
  contentSummary?: SessionContentSummary;
  runtimeConfig?: SaveRuntimeConfig;
  memory?: SessionMemory;
};
```

这样拆的好处：

1. `memory` 不污染玩家态业务字段。
2. 存档和分支恢复天然兼容。
3. `memory` 未来可以整体重建。
4. `InMemorySessionStore` 不需要改存储模式，只是快照变大。

---

## 7. 事实检索怎么做

推荐 V1 采用“结构化事实 + 混合词法检索”，不要一上来就强依赖 embedding。

原因：

1. 现在的 3.0 架构是轻量本地服务，不适合一上来就加复杂向量存储。
2. TRPG 事实普遍短小，实体名、线索词、地点名、道具名都很强词法特征。
3. 先做可解释检索，调试成本最低。

推荐召回流程：

1. 根据当前任务构造查询：
   - 最新玩家输入
   - 当前轮 prepared inputs
   - 当前 agent 身份
   - 当前可见范围
2. 先做范围过滤：
   - Narrator: `public + gm_only`
   - AI 队友公开回合: `public + 自己 private`
   - 私聊回复: `public + 自己 private`
3. 再做实体匹配：
   - `entityRegistry.aliases`
   - `fact.entities`
   - `openLoop.relatedEntities`
4. 再做轻量词法打分：
   - 标题命中
   - summary 命中
   - tags 命中
5. 排序时加权：
   - `open loop` > 普通 facts
   - `active` > `resolved`
   - 最近更新优先
   - 高 priority 优先
6. 最终只取小批量：
   - Narrator: 8 到 12 条
   - AI 队友公开回合: 6 到 10 条
   - 私聊: 5 到 8 条

V2 可以再加：

- embedding rerank
- entity normalization
- unresolved clue boosting

但不建议作为 Phase 5 首批必做项。

---

## 8. 上下文压缩的实际组装策略

## 8.1 Narrator 的 runtime context pack

Narrator 最需要的是：

- 最近发生了什么
- 当前局面有哪些“真的还在生效”的事实
- 哪些未解问题应该继续推进

推荐组装：

```text
L0 静态前缀
  - narrator system prompt
  - 规则 / 语言 / 风格

L1 当前运行态
  - story title
  - round
  - latest committed player input
  - current scene heading

L2 最近原文
  - 最近 6 到 8 条 public_story 原文消息

L3 检索 facts
  - 8 到 12 条 public / gm_only facts

L4 open loops
  - 3 到 5 条当前最关键未解问题

L5 fallback summary
  - 最近一个或两个 episode summaries
```

不建议 Narrator 看到所有 private chat 内容。

最多只允许通过明确的业务规则把某些“已公开化”私密结果转成 public fact。

## 8.2 AI 队友公开回合的 context pack

AI 队友需要：

- 最近公共剧情
- 和自己有关的私密历史
- 当前队友已经起草了什么
- 自己的人格与立场

推荐组装：

```text
L0 静态前缀
  - ai_player/personality.txt
  - ai_player/rule.txt
  - ai_player/language.txt
  - 选中的人格标签

L1 当前输入
  - 当前 round
  - 已有 preparedInputs

L2 最近公共原文
  - 最近 4 到 6 条 public_story

L3 检索 public facts
  - 5 到 8 条

L4 私密相关 facts
  - 3 到 5 条只属于该 participant 的 private facts

L5 private thread recent raw
  - 最近 4 到 8 条与玩家的私聊
```

## 8.3 私聊回复的 context pack

私聊更像“战术层”和“关系层”对话。

推荐：

- 公共剧情只放一个非常短的 scene summary
- 私聊线程 recent raw 为主
- 再补少量 private facts

这样能避免私聊模型把整个公共剧情重新复述一遍。

---

## 9. 如何复用现有“结局辅助 AI”来产出结构体

用户已经明确要求：

> 如果需要用一个 AI 返回一些结构体，请使用目前判断结局的辅助 AI。

这条我建议直接作为 Phase 5 的硬约束。

## 9.1 推荐做法：泛化 ending judge helper

当前 ending judge 链路已经有：

- prompt loader
- output schema loader
- strict `json_schema`
- fallback `json_object`
- JSON 解析与默认值兜底

所以推荐把现在的“只服务 ending judge”的 helper 泛化成：

```ts
type StructuredAssistantTask = {
  name: string;
  systemPromptPath: string;
  outputSchemaPath: string;
  userPrompt: string;
};
```

在服务端内部新增类似能力：

```ts
runStructuredAssistantViaServerProxy(task)
```

然后让 `judgeEndingViaServerProxy()` 变成它的一个具体实例，而不是唯一用途。

## 9.2 Phase 5 推荐新增的结构化任务

### A. Memory Delta Extractor

输入：

- 最近新增消息
- 当前 memory 摘要
- 当前轮次
- 当前可见范围说明

输出：

```ts
type SessionMemoryDelta = {
  newFacts: SessionFact[];
  supersededFactIds: string[];
  resolvedFactIds: string[];
  newOpenLoops: SessionOpenLoop[];
  resolvedOpenLoopIds: string[];
  newEntities: SessionEntityMemory[];
  shouldRefreshEpisodeSummary: boolean;
};
```

### B. Episode Compressor

输入：

- 某个 round 区间的原始 messages
- 当前 open loops
- 当前 facts 摘要

输出：

```ts
type EpisodeCompressionResult = {
  title: string;
  summary: string;
  keyFactIds: string[];
  openLoopIds: string[];
};
```

### C. Optional Conflict Resolver

如果后面发现 fact merge 冲突频繁，可以再加一个结构化裁决器，判断新旧事实谁应该保留。

## 9.3 为什么不建议每种任务都再建一条模型网关

因为现在的难点不是“模型怎么调”，而是：

- prompt/schema 怎么定义
- memory delta 怎么 merge
- 哪些信息能被谁看到

复用 ending judge helper，能把“结构化输出稳定性”这个基础问题一次解决。

---

## 10. 服务端设计图

```text
session/service.ts
  ├─ commit round / private chat / manual narration
  ├─ append canonical messages
  ├─ update replay
  ├─ call memory pipeline
  │    ├─ fact extractor
  │    ├─ open loop updater
  │    ├─ episode compressor
  │    └─ merge into snapshot.memory
  ├─ build runtime context pack
  └─ call narrator / ai teammate / private chat generation
```

## 10.1 推荐新增模块

推荐新增这些文件：

- `apps/server/src/session/memory_types.ts`
- `apps/server/src/session/memory_merge.ts`
- `apps/server/src/session/memory_retrieval.ts`
- `apps/server/src/session/memory_runtime_context.ts`
- `apps/server/src/session/memory_pipeline.ts`

职责建议：

- `memory_types.ts`
  - 集中定义 memory 内部类型
- `memory_merge.ts`
  - 合并新 facts、标记 superseded/resolved
- `memory_retrieval.ts`
  - 做过滤、召回、排序
- `memory_runtime_context.ts`
  - 组装 Narrator / AI teammate / private chat 的 context pack
- `memory_pipeline.ts`
  - 串联 structured AI 提取、摘要刷新和 merge

## 10.2 推荐接入点

### 创建会话后

在首条 Narrator 开场生成完成后：

- 从 opening narration 和 player info 里抽第一批 public facts
- 初始化 scene summary

### 每次 `commit round` 后

在玩家侧输入和 Narrator 回复都写入 `messages` 后：

- 以本轮增量消息为输入生成 `SessionMemoryDelta`
- merge 到 `snapshot.memory`
- 再用于下一轮 Narrator/AI teammate 检索

### 每次 private chat 后

只更新该 participant 的 private facts/open loops，不污染 public facts。

### `manual narration` 后

和正常 Narrator 回复一样更新 memory。

### 读取存档 / 世界线恢复后

- 如果 `saveBundle.memory` 存在，直接恢复
- 如果不存在，允许后端提供 `rebuild memory` 调试入口，从 `messages` 全量重建

---

## 11. 前端设计图

Phase 5 的上下文压缩不建议做成“玩家必须手动管理”的功能。

前端 V1 应该做到：

1. 玩家无感使用
2. 调试时可观察
3. 必要时可人工刷新

## 11.1 玩家侧

默认不新增复杂配置项。

原因：

- 上下文压缩属于系统内部能力，不是主要玩法配置
- 过早暴露“压缩模式”“检索模式”只会增加理解负担

V1 玩家侧只需要继续看到：

- 正常的剧情
- 正常的私聊
- 正常的 AI 队友发言

## 11.2 调试侧

推荐在 `GameScreen` 的详情/调试区域新增只读 memory 面板，显示：

- `Current context pack`
- `Retrieved facts`
- `Open loops`
- `Recent raw window`
- `Episode summaries`

建议只在 `debugEnabled` 时显示。

这样做的价值非常高：

- 能直接看到模型为什么会说出某句话
- 能快速定位是检索错了、事实没抽到，还是摘要冲掉了线索

## 11.3 可选前端接口

如果要让前端可观察，推荐新增只读接口：

- `GET /api/sessions/:id/memory`
- `GET /api/sessions/:id/context-pack?target=narrator`
- `GET /api/sessions/:id/context-pack?target=companion&participantId=...`

如果要支持调试修复，再加：

- `POST /api/sessions/:id/memory/rebuild`

但这条建议只在 debug 模式开放。

---

## 12. 存档、分支和世界线怎么处理

TRPG 的 context compression 方案如果不能处理分支，后面一定要返工。

推荐原则：

1. `SaveBundle` 连 `memory` 一起存。
2. 新分支从旧节点恢复时，复制当时的 `memory`。
3. 分支继续推进时，memory 在新 session 内独立演化。
4. 不同分支之间不共享 private facts。

这意味着：

- `memory` 是“该世界线当前已知信息”的快照
- 不是全局知识库

这和 TRPG 的叙事语义是一致的。

---

## 13. 推荐 rollout 顺序

## Phase 5A: 最小可用版

只做：

- `SessionMemory`
- `SessionFact`
- `SessionOpenLoop`
- Narrator / AI 队友 / 私聊三种 context pack
- 结构化 AI 做 memory delta 抽取
- 存档持久化 memory

不做：

- embedding
- 复杂 entity linking
- 可视化编辑器
- 自动冲突裁决器

这是性价比最高的一版。

## Phase 5B: 调试可观测版

新增：

- 前端 memory 调试面板
- context pack 调试接口
- rebuild memory 调试接口

## Phase 5C: 强化检索版

再考虑：

- embeddings rerank
- 更稳定的 alias/entity linking
- scene boundary 自动检测
- memory quality eval

---

## 14. 推荐文件改动清单

### shared-types

- `packages/shared-types/src/runtime.ts`
  - 新增 `SessionMemory` 及相关类型
- `packages/shared-types/src/api.ts`
  - `SessionSnapshot` 增加 `memory?: SessionMemory`

### server

- `apps/server/src/session/service.ts`
  - 在 create/commit/private/manual narration 链路接入 memory pipeline
- `apps/server/src/session/store.ts`
  - 无需改存储方式，但快照会携带 memory
- `apps/server/src/save_repository.ts`
  - 跟随 `SaveBundle.memory` 一起持久化
- `apps/server/src/model_gateway/types.ts`
  - 可新增结构化 assistant 的通用输入输出类型
- `apps/server/src/single_agent/service.ts`
  - 泛化 ending judge prompt/schema helper
- `apps/server/src/model_gateway/single_agent_proxy.ts`
  - 泛化 strict structured JSON 调用逻辑

### prompt

推荐新增：

- `apps/prompt/session_memory/fact_extractor_system_prompt.txt`
- `apps/prompt/session_memory/fact_extractor_output_schema.json`
- `apps/prompt/session_memory/episode_compressor_system_prompt.txt`
- `apps/prompt/session_memory/episode_compressor_output_schema.json`

### web

- `apps/web/src/components/GameScreen.tsx`
  - 新增 debug memory 面板
- `apps/web/src/api.ts`
  - 如果暴露只读 memory/debug 接口，则新增客户端调用

---

## 15. 最终推荐方案

如果只用一句话概括：

> 对这套 `version 3.0` 来说，最适合 TRPG 的上下文压缩方案，不是“把长历史压成一段摘要”，而是“保留完整日志，增量提炼结构化事实和未解问题，在请求时用最近原文窗口 + 事实检索 + 场景摘要 fallback 组装 runtime context”，并且用现有 ending judge 辅助 AI 的 JSON 输出链路来完成结构化提取。

这套方案的优点是：

1. 和现在的代码主干兼容。
2. 对 TRPG 的线索、秘密、私聊边界更友好。
3. 后续做世界线恢复不会推翻重来。
4. 调试性强，出了问题能看清是抽取错、检索错，还是 prompt 组装错。

---

## 16. 本文档对应的实现优先级建议

按优先级排序：

1. 泛化 ending judge helper 为通用 structured assistant。
2. 新增 `SessionMemory`，并让它进入 `SessionSnapshot / SaveBundle`。
3. 做 `SessionMemoryDelta` 抽取与 merge。
4. 把 Narrator/AI teammate/private chat 的纯字符串上下文改成 context pack。
5. 补前端 debug 观察面板。
6. 最后再考虑 embedding 或更重的检索基础设施。

这会是一条最稳、最适合你当前 3.0 架构的落地路径。
