# Phase 6 GM侧多 Agent 迁移方案

## 1. 文档目标

这份文档用于冻结 `feature_MAS` 分支的核心方向：

将 `version 2.0` 的 GM 侧多 agent 讲故事系统迁移到 `version 3.0`，但不再沿用 `v2` 那种“agent 之间主要靠固定字段结果互相传话”的协作方式，而是改为：

- 共享 `version 3.0` 的静态内容、完整日志、session memory 和 runtime context pack
- 为不同 agent 组装不同的上下文包
- 只在“需要提交给引擎执行”的位置保留结构化输出 contract

这份文档只定义目标架构、需求边界和 MVP 落地路径，不在本轮直接改业务代码。

---

## 2. 本轮范围

本轮要解决的是 `GM 侧多 agent`，不是 `玩家侧 AI 队友`。

本轮范围包括：

- `Dicer`
- `NPC Manager`
- `Director`
- `Narrator`
- `Ending Judge`
- 服务端编排器如何驱动这些 agent
- 如何用 `v3` 的 memory/context pack 替代 `v2` 的字段式协作

本轮暂不作为主目标的内容：

- `Phase 4 AI 队友` 的玩家侧协作
- 玩家与 AI 队友私聊如何接入 GM 侧多 agent
- 前端多 agent 可视化监控页
- 一次性迁移全部内容包和全部旧状态结构

---

## 3. 先澄清两种“多 Agent”

仓库里现在同时存在两条“多 agent”语义：

### 3.1 `v2` 的 GM 侧多 agent

这是 `version 2.0` 的老系统，核心角色是：

- `Dicer`
- `NPC Manager`
- `Director`
- `Narrator`

它们共同完成一轮 GM 侧故事推进。

对应旧代码：

- `version 2.0/Code/trpg_runtime/engine.py`
- `version 2.0/Code/trpg_runtime/models.py`

### 3.2 `v3` 的玩家侧 AI 队友

这是 `version 3.0` 当前已经开始设计和部分实现的另一条路线，核心是：

- 主玩家可能是 AI
- 队友可能是 AI
- 每轮先准备玩家侧草稿，再统一提交给 Narrator

对应当前设计与实现：

- `docs/phase4_ai_teammates_plan.md`
- `apps/server/src/session/service.ts`
- `apps/server/src/ai_players/service.ts`

### 3.3 本文聚焦哪一条

本文聚焦 `v2 GM 侧多 agent` 的迁移。

也就是说，这一轮讨论的是：

“如何把 `v2` 的 GM 多 agent 讲故事能力做进 `v3`，并让它使用 `v3` 的压缩上下文体系。”

而不是：

“先把玩家侧 AI 队友做完整。”

---

## 4. `v2` 实际是怎么协作的

`version 2.0` 的核心回合链路大致是：

1. 玩家输入行动
2. `Dicer` 和 `NPC Manager` 并行运行
3. 两者输出结构化结果
4. 引擎把这些结构化结果写进状态
5. `Narrator` 读取：
   - `dicer_result`
   - `npc_result`
   - 上一轮 `director_state`
6. `Narrator` 生成玩家可见叙事
7. `Director` 基于本轮结果再生成“下一轮指导”

关键旧实现位置：

- `version 2.0/Code/trpg_runtime/engine.py`
- `version 2.0/Code/trpg_runtime/models.py`

典型特征有三点：

### 4.1 中间协作 heavily 依赖字段

`Narrator` 不是直接从完整上下文和共享记忆出发思考，而是高度依赖：

- `dicer_result`
- `npc_result`
- `director_state`

这些中间字段结果。

### 4.2 有一层隐藏的 `agent_runtime`

`v2` 里存在一个专门的隐藏运行态：

- `director`
- `last_narration`
- `last_player_action_text`
- `dialogue_window`
- `narrator_memory`
- `dicer_notes`
- `npc_manager_notes`

这说明旧系统并不只是“多个 prompt”，而是有一层明确的 agent 工作内存。

### 4.3 结构化输出既承担“执行 contract”，也承担“agent 间通信”

这是 `v2` 最大的问题来源。

在一个合理的系统里，结构化输出应该主要承担：

- 规则裁定结果
- 世界状态修改建议
- 可执行事件或可提交的引擎 contract

但在 `v2` 里，它还承担了大量：

- 给其他 agent 看的摘要
- 给 Narrator 的故事理解中介
- 给 Director 的下一轮协作材料

结果就是字段越来越重，信息越来越挤压。

---

## 5. 为什么 `v2` 的字段通信效果差

核心不是“多 agent 一定差”，而是“多 agent 主要靠字段结果彼此理解”很差。

主要问题如下：

### 5.1 信息瓶颈太强

当 `Dicer`、`NPC Manager`、`Director` 都必须把自己的理解压进固定 schema 字段，再让 `Narrator` 去消费时，会天然丢掉大量语义：

- 微妙的气氛判断
- 线索权重
- NPC 反应中的潜台词
- 下一轮推进力度
- 某些本轮暂时不执行、但应该被记住的隐性因果

### 5.2 字段会把 agent 思维压扁

结构体适合表达“结论”，不适合表达“供另一个 agent 继续思考的复杂上下文”。

一旦通信主要靠字段，agent 的角色很快会退化成：

- 产表格的人
- 读表格的人

而不是：

- 共享同一世界状态、分别从不同职责切片做判断的人

### 5.3 扩展性很差

一旦后面接入这些能力，旧方案会迅速变得难维护：

- 分支世界线
- 长期剧情回溯
- 玩家侧私聊
- 多种可见范围
- 新增 agent
- 不同 agent 的不同关注重点

因为每增加一种协作语义，就要继续往中间字段层塞东西。

### 5.4 不适合 `v3` 的保存与分支体系

`v3` 已经明显朝这些方向发展：

- `SessionSnapshot`
- `SaveBundle`
- 世界线分支回溯
- `SessionMemory`
- context pack 调试与导出

如果还沿用 `v2` 那套厚重字段层，后面会和 `v3` 的分支/压缩设计互相打架。

---

## 6. `v3` 已经具备哪些可复用基础

`version 3.0` 并不是从零开始。

当前已经有四块关键基础：

### 6.1 通用 structured assistant 能力

`v3` 已经把原本只服务 `ending judge` 的链路泛化成了可复用的 structured assistant 能力。

当前已有：

- `ending_judge`
- `session_memory_fact_extractor`
- `session_memory_episode_compressor`

对应位置：

- `apps/server/src/single_agent/service.ts`

这意味着：

- 后续如果多 agent 中某个角色仍然需要结构化输出，不需要重建新的模型网关

### 6.2 `SessionMemory`

`v3` 已经有独立的 memory 层：

- `facts`
- `openLoops`
- `episodeSummaries`
- `entities`

对应位置：

- `packages/shared-types/src/runtime.ts`
- `apps/server/src/session/memory.ts`

### 6.3 现成的 runtime context pack

`v3` 已经不是单纯“把历史全拼起来”了，而是已经在组装三种 context pack：

- `buildNarratorContextPack`
- `buildCompanionContextPack`
- `buildPrivateChatContextPack`

对应位置：

- `apps/server/src/session/memory.ts`

### 6.4 `gmArchitecture` 入口已经预留

`v3` 的类型和 UI 都已经保留了：

- `single_agent`
- `multi_agent`

但当前主链还主要是 `single_agent`。

这意味着：

- 现在的工作重点是把 `multi_agent` 真正落地
- 不是重新设计入口形态

---

## 7. 本轮核心决策

### 7.1 要替换掉的是什么

要替换掉的是：

“agent 之间主要通过固定字段结果互相理解和协作。”

### 7.2 不应该替换掉的是什么

不应该把所有结构化输出一起废掉。

结构化输出仍然应该保留在这些位置：

- `Dicer` 的规则裁定结果
- `NPC Manager` 的 NPC/world delta
- `Director` 的下一轮指导 contract
- `Ending Judge` 的结局判定
- `SessionMemory` 的结构化提取与压缩

### 7.3 新原则

新的原则应该是：

> agent 之间不再靠“厚字段层”相互传话，而是共享同一套真相源，并由编排器按职责组装不同的 context pack；只有需要提交给引擎执行的结论，才以结构化 contract 落盘或传递。

### 7.4 仍然允许保留一层极小的隐藏运行态

完全去掉隐藏运行态也不合理。

因为有些信息并不属于长期剧情 memory，而属于“编排器的短期工作记忆”，例如：

- 上一轮 Director 留下的下一轮推进提示
- 本轮暂存的 agent 结果摘要
- 某些只属于 GM 编排器的 transient metadata

所以本轮不是“完全不要 runtime state”，而是：

- 不再保留 `v2` 那种厚重、agent-owned 的工作状态层
- 只保留一个很小的、orchestrator-owned 的隐藏运行态

---

## 8. 目标真相分层

迁移到 `v3` 后，建议把真相源分成四层。

### 8.1 Layer A: 静态内容真相

来自内容包本身：

- `rule.txt`
- `story.txt`
- 规则目录与剧本目录中的静态内容

这层是稳定真相。

### 8.2 Layer B: Canonical Log

来自运行日志：

- `messages`
- `replay`

这是会话过程中唯一的完整原始事实源。

### 8.3 Layer C: Derived Memory

来自 `SessionMemory`：

- `facts`
- `openLoops`
- `episodeSummaries`
- `entities`

它是“从日志中提炼出来的可检索长期记忆”。

### 8.4 Layer D: Orchestrator Runtime

这是最小化保留的一层隐藏编排状态，建议只放：

- `directorMemo`
- 少量调试与中间产物引用

这层不是长期剧情真相，不应承担大规模故事记忆。

---

## 9. 目标多 Agent 架构

建议的 GM 侧多 agent 结构如下：

```text
player input
  -> orchestrator
    -> build Dicer context pack
    -> build NPC Manager context pack
    -> run Dicer + NPC Manager in parallel
    -> merge executable results into provisional state
    -> build Narrator context pack
    -> run Narrator
    -> run Ending Judge
    -> build Director context pack
    -> run Director for next-turn memo
    -> commit messages / replay / memory / director memo
```

其中：

- `orchestrator` 负责编排，不负责讲故事
- `Narrator` 仍然是唯一直接面向玩家的 GM 文本输出者
- `Director` 仍然只影响下一轮，不改写刚完成的 Narrator 文本

---

## 10. 各 Agent 的职责与输入输出

### 10.1 Dicer

职责：

- 对玩家行动做规则裁定
- 产出规则层与局部状态层的执行建议

输入：

- 当前玩家输入
- 相关规则内容
- 当前场景与相关状态切片
- 最近公共剧情原文
- 检索出的相关 public/gm_only facts

输出：

- 结构化 `DicerOutput`
- 可执行 `state_delta`

关键点：

- `Dicer` 不负责叙事
- `Dicer` 不负责 NPC 表演
- `Dicer` 不负责宏观推进

### 10.2 NPC Manager

职责：

- 推进本轮 NPC 可见反应
- 推进后台 NPC 行动
- 产出 NPC/world 的小幅状态变化

输入：

- 当前玩家输入
- 当前场景
- 相关 NPC 切片
- 最近公共剧情原文
- 检索出的相关 public/gm_only facts
- 当前关键 open loops

输出：

- 结构化 `NPCManagerOutput`
- 可执行 `state_delta`
- 可供 Narrator 使用的 visible beats

关键点：

- `NPC Manager` 不等待 `Dicer`
- `NPC Manager` 不替 `Director` 做宏观设计

### 10.3 Narrator

职责：

- 生成玩家可见叙事
- 把规则结果、NPC反应、导演指导转成自然叙事

输入不应该再是厚重中间字段堆，而应该是 Narrator 专用 context pack，内容包括：

- 本轮玩家行动
- 最近公共原文窗口
- 检索出的 public/gm_only facts
- 当前关键 open loops
- `Dicer` 的已裁定结果
- `NPC Manager` 的 visible beats
- 上一轮 `DirectorMemo`
- 必要时的 fallback episode summaries

输出：

- 玩家可见 narration 文本

关键点：

- `Narrator` 仍然只输出文本
- `Narrator` 不应直接读取玩家私聊原文
- `Narrator` 不应自己发明关键规则结果

### 10.4 Director

职责：

- 在 Narrator 本轮完成后，生成“下一轮 GM 侧推进指导”

输入：

- 本轮玩家行动
- 本轮 `DicerOutput`
- 本轮 `NPCManagerOutput`
- 本轮 Narrator 输出
- 当前 memory 中的关键 facts/open loops/episode summaries
- 当前分支和剧情节奏信息

输出：

- 结构化 `DirectorMemo`

建议它是轻量 contract，而不是新的厚状态层。

例如：

```ts
type DirectorMemo = {
  sourceRound: number;
  paceStatus: string;
  tone: string;
  guidance: string[];
  foreshadow: string[];
  endgame: boolean;
  updatedAt: string;
};
```

关键点：

- `Director` 的输出只影响下一轮
- `Director` 不直接写给玩家
- `Director` 不应该继续膨胀成新的 `agent_runtime`

### 10.5 Ending Judge

职责保持不变：

- 只判断 Narrator 本轮输出是否进入结局

这条链路继续复用当前 `v3` 实现即可。

---

## 11. Context Pack 设计原则

### 11.1 不同 Agent 必须吃不同 pack

不能再让所有 agent 都吃同一份“大拼接上下文”。

因为：

- `Dicer` 关注规则、行动、状态约束
- `NPC Manager` 关注 NPC 与场景推进
- `Narrator` 关注可见叙事组织
- `Director` 关注节奏、悬念、结构推进

它们的输入重点天然不同。

### 11.2 但所有 pack 必须来自同一套真相源

所有 pack 都应从以下来源派生：

- 静态内容
- canonical log
- session memory
- orchestrator runtime

这样才能保证：

- agent 不会各自维护一套不同的世界观
- 分支恢复时上下文一致
- 存档恢复时语义一致

### 11.3 可见范围必须严控

推荐 visibility 原则：

- `Narrator` 读取 `public + gm_only`
- `Dicer` 读取 `public + gm_only`
- `NPC Manager` 读取 `public + gm_only`
- `Director` 读取 `public + gm_only`
- 玩家侧 AI 队友以后只读取 `public + private(self)`

这意味着：

- 玩家私聊默认不进入 GM 侧多 agent pack
- 除非被明确提升为 `public fact` 或 `gm_only fact`

---

## 12. 推荐的 GM 侧 context pack 组成

### 12.1 Dicer Pack

推荐包含：

- `L0` 规则前缀与必要静态约束
- `L1` 当前玩家行动
- `L2` 当前场景与相关状态切片
- `L3` 最近 4 到 6 条公共原文
- `L4` 检索出的相关 `public/gm_only facts`
- `L5` 必要的 rule/scenario 重点切片

### 12.2 NPC Manager Pack

推荐包含：

- `L0` NPC 管理静态前缀
- `L1` 当前玩家行动
- `L2` 当前场景和相关 NPC 切片
- `L3` 最近 4 到 6 条公共原文
- `L4` 检索出的相关 `public/gm_only facts`
- `L5` 当前关键 open loops

### 12.3 Narrator Pack

推荐包含：

- `L0` Narrator 静态前缀
- `L1` 当前运行态与本轮玩家行动
- `L2` 最近 6 到 8 条公共原文
- `L3` 检索出的 `public/gm_only facts`
- `L4` 当前关键 open loops
- `L5` `DicerOutput` 的叙事可消费摘要
- `L6` `NPCManagerOutput` 的 visible beats 摘要
- `L7` 上一轮 `DirectorMemo`
- `L8` fallback episode summaries

### 12.4 Director Pack

推荐包含：

- `L0` Director 静态前缀
- `L1` 本轮 turn summary
- `L2` 本轮 `DicerOutput`
- `L3` 本轮 `NPCManagerOutput`
- `L4` 本轮 Narrator 输出
- `L5` 当前关键 facts/open loops/episode summaries
- `L6` 当前分支和结局压力信息

---

## 13. 结构化输出 contract 应该保留到什么程度

建议保留三类结构化 contract。

### 13.1 可执行 contract

这类必须保留结构化：

- `DicerOutput`
- `NPCManagerOutput`
- `EndingJudgeDecision`

因为它们直接影响引擎行为。

### 13.2 轻量协作 contract

这类应该保留，但要轻量：

- `DirectorMemo`

因为它只是下一轮指导，不应变成新的大状态层。

### 13.3 Memory contract

这类继续复用当前 `v3` 体系：

- `SessionMemoryDelta`
- `EpisodeCompressionResult`

它们服务于共享记忆，而不是直接替代 agent 思考。

---

## 14. 推荐的一轮 Turn Pipeline

建议 GM 侧多 agent 的一轮流程如下。

### 14.1 回合开始前

准备这些基础输入：

- 当前 snapshot
- 上一轮已提交的 `DirectorMemo`
- 当前 `SessionMemory`
- 本轮玩家输入

### 14.2 并行阶段

由编排器并行执行：

- `Dicer`
- `NPC Manager`

两者各自从共享真相源读取 context pack。

### 14.3 结果归并阶段

编排器拿到两者输出后：

- 应用 `Dicer` 的可执行 delta
- 应用 `NPC Manager` 的可执行 delta
- 得到一个 provisional turn state

### 14.4 Narrator 阶段

使用：

- 本轮玩家行动
- `DicerOutput`
- `NPCManagerOutput`
- 上一轮 `DirectorMemo`
- 共享 memory 检索结果

组装 Narrator pack，然后生成本轮 narration。

### 14.5 Ending Judge 阶段

对本轮 Narrator 输出执行结局判断。

### 14.6 Director 阶段

在 Narrator 完成后，再基于本轮完整结果生成新的 `DirectorMemo`，供下一轮使用。

这保持与 `v2` 相同的原则：

- Director 影响下一轮
- 不改写刚刚结束的 Narrator 文本

### 14.7 提交与记忆更新阶段

提交：

- messages
- replay
- ending state
- `DirectorMemo`

然后更新：

- `SessionMemory`

---

## 15. Memory 更新策略需要改动的地方

这是当前 `v3` 里必须特别注意的一点。

当前实现中，memory 主要通过后台链路做整段重建：

- `scheduleBackgroundMemoryRefresh()`
- `rebuildSnapshotMemory()`

对应位置：

- `apps/server/src/session/service.ts`
- `apps/server/src/session/memory.ts`

这对单 agent MVP 是可接受的，但对 GM 侧多 agent 不够强。

### 15.1 为什么不够

因为多 agent 更依赖“上一轮结果已经被提炼进共享 memory”这件事。

如果 memory 只靠后台慢慢补，就会出现：

- 当前轮用到的是旧 memory
- 下一轮开始时 memory 可能还没补齐
- agent 之间虽然共享 pack，但共享的是过期 pack

### 15.2 推荐改法

推荐把 memory 更新策略改成：

- 当前回合结束后，增量 memory 更新进入主链
- 后台 full rebuild 只保留给：
  - 调试
  - 修复
  - 老存档重建

也就是说：

- `incremental update` 是正式路径
- `background rebuild` 是兜底路径

---

## 16. 建议新增的最小运行态

为了避免把 Director guidance 塞进 memory，建议在 `v3` 里补一个很小的 GM 运行态。

例如：

```ts
type MultiAgentRuntimeState = {
  directorMemo?: DirectorMemo | null;
};
```

它的边界应该非常明确：

- 只存下一轮需要的隐藏指导
- 不存长期剧情事实
- 不存大段 agent 私有工作笔记
- 不重复保存已经能从 memory 重建的东西

---

## 17. 服务端落点建议

推荐沿用当前 `v3` 目录结构，不另起一套完全平行的框架。

建议的主要落点如下：

- `packages/shared-types/src/runtime.ts`
  - 增加 `DirectorMemo`
  - 增加 `MultiAgentRuntimeState`
  - 增加必要的 multi-agent turn result 类型

- `apps/server/src/session/service.ts`
  - 保留 `single_agent` 分支
  - 新增 `multi_agent` 分支的 turn orchestration

- `apps/server/src/session/memory.ts`
  - 继续负责 memory retrieval 和 context pack 基础能力
  - 可新增 GM 侧专用的 `buildDicerContextPack`
  - 可新增 GM 侧专用的 `buildNpcManagerContextPack`
  - 可新增 GM 侧专用的 `buildDirectorContextPack`

- `apps/server/src/single_agent/service.ts`
  - 继续作为 structured assistant prompt/schema loader
  - 复用到 Dicer/NPC/Director 的结构化任务

---

## 18. MVP 建议分期

### 18.1 Phase 6A

先落地最小 GM 侧多 agent：

- 单人玩家输入
- `Dicer + NPC Manager + Narrator + Director + Ending Judge`
- 不接玩家侧 AI 队友
- 不接私聊

目标：

- 先把 `v2` 的 GM 侧多 agent 核心能力移进 `v3`
- 并确保它使用 `v3` 的 memory/context pack

### 18.2 Phase 6B

补运行态与调试能力：

- `DirectorMemo` 持久化
- context pack 调试页补 GM 侧 pack
- replay 中记录多 agent 回合阶段

### 18.3 Phase 6C

再和 `Phase 4 AI 队友` 汇合：

- 玩家侧 AI 队友继续走自己的 companion/private pack
- GM 侧多 agent 与玩家侧多角色协同共存

---

## 19. 需求冻结结论

本轮建议冻结以下判断：

1. 本轮优先接的是 `v2` 的 GM 侧多 agent，不是先做完玩家侧 AI 队友。
2. `v2` 的主要问题是“字段式 agent 间通信”，不是“多 agent”本身。
3. 迁移到 `v3` 后，agent 协作的主骨架应改为“共享真相源 + 不同 context pack”。
4. 结构化输出不应被全部废弃，而应退回到“执行 contract / 轻量协作 contract”的角色。
5. `Director` 继续只影响下一轮，不改写本轮 Narrator。
6. `Narrator` 不直接读取玩家私聊原文。
7. memory 不能继续只靠后台 rebuild，至少需要一条可进入主链的增量更新路径。
8. 需要一个最小化的 `DirectorMemo` 级别隐藏运行态，但不再回到 `v2` 的厚 `agent_runtime` 设计。

---

## 20. 一句话总结

这次迁移的正确方向，不是把 `v2` 的字段通信原样搬进 `v3`，而是让 `Dicer / NPC Manager / Director / Narrator` 一起建立在 `v3` 的共享 memory 与 context pack 之上，并只把真正需要执行的结论保留为结构化 contract。
