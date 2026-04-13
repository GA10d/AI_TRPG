# Phase 4 AI队友实现路径

## 文档目标

这份文档只讨论实现方案，不在本轮直接改业务代码。

目标是基于《Phase 4 AI队友》设计需求，以及当前 `version 3.0` 的代码现状，整理出一条能实际落地、且尽量不推翻现有主循环的实现路径。

---

## 需求归纳

本轮需求可以拆成 8 个核心目标：

1. 开局页左侧游戏模式新增 `故事模式`。
2. 开局页右侧 `AI伙伴` 从占位模块变成真实的可编辑列表。
3. 每个 AI 队友都可以设置：
   - 名字
   - 多选性格 tag
4. AI 玩家 / AI 队友的 system prompt 由以下纯文本拼接得到：
   - `apps/prompt/ai_player/personality.txt`
   - 用户选择的人格条目（名称 + 描述）
   - `apps/prompt/ai_player/rule.txt`
   - `apps/prompt/ai_player/language.txt`
   - 用户选择的语言
5. `beginning` 阶段生成的文本，需要作为 AI 玩家第一条历史消息。
6. 游戏内新增人类玩家与 AI 队友的私聊能力。
7. 每轮中，AI 队友需要基于：
   - 公共剧情上下文
   - 本轮已输入的玩家文本
   - 与自己相关的私聊内容
   并行生成自己的本轮公开发言。
8. 故事模式下，主玩家也是 AI，需要支持：
   - `自动进行`
   - `玩家介入`
   两种运行模式。

---

## 当前代码现状

结合代码，当前 3.0 还停留在“单人文字主循环 + AI队友占位 UI”的阶段。

### 1. 前端开局页已有 companions 入口，但仍是占位

- `apps/web/src/components/GameSetupScreen.tsx`
- 当前 `companions` 只是三张静态卡片。
- `playMode` 仍只有：
  - `single_player`
  - `single_player_with_npc`
  - `multiplayer`

这意味着开局页布局已经预留好了，但没有真实的 AI 队友数据结构和编辑表单。

### 2. Session 结构仍然假设“一个玩家 + 一个主持人”

- `packages/shared-types/src/runtime.ts`
- `Session` 当前只有一个 `playerParticipantId`
- `submitTurn` 的输入仍然是单个：
  - `SubmitTurnRequest = { playerInput: string }`

这和 Phase 4 的“多名玩家侧参与者同时准备本轮文本”是直接冲突的。

### 3. 服务端回合主循环仍是单输入链路

- `apps/server/src/session/service.ts`
- 当前流程是：
  - 玩家提交一个 `playerInput`
  - Narrator 生成一段叙事
  - Ending Judge 判断是否结局

没有“本轮草稿生成”“等待所有玩家侧文本就绪”“统一提交”这几个阶段。

### 4. Message 结构还不足以表达私聊

- `packages/shared-types/src/runtime.ts`
- 当前 `Message` 只有：
  - `senderId`
  - `recipientIds`
  - `visibility`
  - `kind`

它勉强能塞私聊，但还缺少“频道类型 / 线程 / 历史归属”的明确语义，后续做 AI 上下文拼接时会很快混乱。

### 5. 好消息：模型层已经有通用文本生成入口

- `apps/server/src/model_gateway/types.ts`
- `apps/server/src/model_gateway/gateway.ts`
- `apps/server/src/text_completion/service.ts`

当前已经存在 `generatePromptedText` 这一类通用接口，适合直接复用来生成：

- AI 主玩家回合文本
- AI 队友回合文本
- 私聊回复

这意味着 Phase 4 不需要重新发明一套模型网关。

### 6. Prompt 资源已经在仓库里

- `apps/prompt/ai_player/personality.txt`
- `apps/prompt/ai_player/rule.txt`
- `apps/prompt/ai_player/language.txt`
- `apps/prompt/personality_list/personality_list.json`

因此本轮的重点不是 prompt 资源缺失，而是：

- prompt 组装逻辑
- 会话上下文设计
- 回合编排

---

## 核心判断

### 1. AI队友不应该继续被建模为 play mode

当前的 `single_player_with_npc` 更像旧阶段的占位概念。

从需求看，`故事模式` 和 `AI队友列表` 是两个不同维度：

- `playMode` 决定“主玩家是谁”
- `aiCompanions` 决定“玩家侧还有哪些 AI 队友”

推荐把这两个维度拆开，而不是继续把“是否带队友”塞进 `playMode`。

### 2. Phase 4 不能只改 UI，必须改成“回合编排器”

当前 `submitTurn(playerInput)` 是单步接口。

Phase 4 需要的是：

1. 进入新一轮
2. 收集主玩家文本
3. 并行生成 AI 队友文本
4. 等全部公开文本准备完成
5. 再统一提交给 Narrator

所以推荐把当前“提交回合”拆成两个阶段：

- `prepare round`
- `commit round`

### 3. 私聊不应该直接喂给 Narrator

根据需求语义，私聊更像玩家侧讨论与策略沟通。

因此推荐：

- 私聊进入 AI 队友自己的历史
- 私聊影响 AI 队友公开回合文本
- Narrator 只接收“最终公开提交的玩家侧发言”

这样能避免主持人直接读到所有策略私聊，语义也更清晰。

---

## 推荐数据模型调整

下面是 Phase 4 最值得先落的结构。

### 1. 扩展 `PlayMode`

推荐目标值：

- `single_player`
- `story_mode`
- `multiplayer`

兼容建议：

- 先保留旧值 `single_player_with_npc` 作为兼容输入
- 在前端新 UI 中不再主展示这个旧值
- 内容包 `supportsModes` 在 Phase 4 先做兼容映射，不急着同步改全量 `content/` 清单

也就是说，Phase 4 先解决运行时，不把内容包迁移变成阻塞项。

### 2. 新增 AI 队友配置

建议新增独立的会话配置结构，例如：

```ts
type AiCompanionConfig = {
  participantId: string;
  displayName: string;
  personalityTags: Array<{
    group: string;
    keyword: string;
    description: string;
  }>;
};
```

并在 `CreateSessionRequest` 中增加类似字段：

```ts
type SessionPartySetup = {
  primaryPlayerMode: "human" | "ai";
  aiCompanions: AiCompanionConfig[];
  primaryAiControlMode?: "auto" | "manual_intervention";
};
```

### 3. 扩展 Participant

当前 `Participant.role` 建议新增：

- `ai_player`

这样可以明确区分：

- `human_player`
- `ai_player`
- `npc`
- `gm`

这对后续前端 UI 和服务端上下文拼接都更稳定。

### 4. Session 中补充玩家侧映射

当前只有一个 `playerParticipantId` 不够用。

推荐新增：

```ts
type Session = {
  ...
  playerParticipantId: string;
  localHumanParticipantId?: string | null;
  companionParticipantIds?: string[];
  partySetup?: SessionPartySetup;
};
```

说明：

- `playerParticipantId` 可先保留，避免一下子把全链路打断
- 普通模式下它指向人类主玩家
- 故事模式下它指向主 AI 玩家
- `localHumanParticipantId` 用来表达“当前界面真实控制者是谁”

### 5. Message 补足“公共剧情 / 私聊”语义

推荐不要只靠 `visibility` 猜语义，建议补：

```ts
type MessageChannel =
  | "public_story"
  | "private_chat"
  | "system";

type Message = {
  ...
  channel?: MessageChannel;
  threadId?: string | null;
  relatedParticipantId?: string | null;
};
```

最低要求是让服务端在构建 AI 上下文时可以稳定区分：

- 公共剧情历史
- 某个 AI 队友自己的私聊历史

### 6. 增加“本轮草稿状态”

Phase 4 的核心不是消息本身，而是“消息还没正式提交前”的草稿。

推荐新增持久化的回合状态：

```ts
type RoundDraft = {
  participantId: string;
  status: "pending" | "generating" | "ready" | "locked";
  source: "human" | "ai";
  content: string;
  editable: boolean;
  generatedAt?: string | null;
};
```

并挂到：

```ts
type GameState = {
  ...
  roundInputState?: {
    phase:
      | "collecting"
      | "generating_ai"
      | "ready_to_commit"
      | "committing";
    controlMode?: "auto" | "manual_intervention";
    drafts: RoundDraft[];
  };
};
```

这样保存/读档时，未提交的一轮也不会丢。

---

## 服务端实现路径

## 1. 新增 AI 玩家相关服务层

建议新增目录：

- `apps/server/src/ai_players/`

建议拆成 4 个文件：

- `personality.ts`
  - 读取 `personality_list.json`
  - 向前端提供人格 tag 列表
- `prompt.ts`
  - 构造 AI 玩家 / AI 队友 system prompt
- `context.ts`
  - 构造公共剧情上下文、私聊上下文
- `service.ts`
  - 调用 `modelGateway.generatePromptedText`

### 2. system prompt 组装逻辑

按需求，推荐严格走以下拼接顺序：

1. `personality.txt`
2. 选中的人格条目列表
3. `rule.txt`
4. `language.txt`
5. 目标语言说明

其中“人格条目列表”建议在服务端统一渲染为稳定文本，例如：

```text
Selected personality tags:
- 温柔：...
- 谨慎：...
- 好奇：...
```

这样比把 JSON 原样塞进 prompt 更稳定。

### 3. 会话创建阶段要补“玩家侧 roster”

当前 `createSessionSnapshot()` 只创建：

- 一个玩家
- 一个 GM

Phase 4 推荐改成：

- 普通模式：
  - 1 个 `human_player`
  - N 个 `ai_player` 队友
  - 1 个 `gm`
- 故事模式：
  - 1 个主 `ai_player`
  - N 个 `ai_player` 队友
  - 1 个 `gm`

### 4. story mode 的开局播种

需求里要求“把 `beginning` 生成文本作为第一条消息发给这个 AI 玩家”。

推荐做法：

- 会话创建完成后
- 对主 AI 玩家插入一条 `private/system` 历史种子消息
- 内容就是开场生成的 beginning 文本

注意这条消息不必暴露给 Narrator 当作公共玩家发言，它更像 AI 玩家自己的初始认知。

### 5. 把当前 `submitTurn` 拆成两段

当前：

- `POST /api/sessions/:id/turns`

Phase 4 推荐拆成：

- `POST /api/sessions/:id/rounds/prepare`
  - 根据当前主玩家文本、私聊记录，生成所有 AI 玩家公开草稿
- `POST /api/sessions/:id/rounds/commit`
  - 将所有公开草稿一次性提交给 Narrator

推荐理由：

- AI 队友生成不是最终提交
- 需要允许手动介入和修改
- 需要支持“所有文本就绪后才能发送”

### 6. Narrator 输入改为“玩家侧公开发言集合”

当前 Narrator 只吃一个 `playerInput: string`。

Phase 4 推荐改成服务端先聚合为结构化文本，再喂给 Narrator。

例如：

```text
Round 3 public player actions:
- [主玩家: 林岚] 我先检查门缝里的灰，再问昨晚是谁最后离开仓库。
- [AI队友: 许河] 我留在后面盯着楼梯口，防止有人从上面下来。
- [AI队友: 沈意] 我翻看桌上散乱的收据，想找出时间线。
```

这样 Narrator 仍然只接收一段文本，但语义已经支持多玩家侧输入。

### 7. 私聊 API 单独设计

推荐新增：

- `POST /api/sessions/:id/private-chat/messages`
- `GET /api/sessions/:id/private-chat/threads`

私聊的服务端职责：

1. 写入消息历史
2. 标明发送者、接收者、threadId
3. 必要时触发 AI 队友私聊回复
4. 将该 thread 纳入该 AI 队友下次公开回合草稿的上下文

### 8. AI 队友公开草稿建议并行生成

服务端可按 `Promise.all()` 并行跑所有 AI 队友生成。

但建议做两层保护：

- MVP 上限：最多 3 名 AI 队友
- 单个队友生成失败时，不要让整个回合直接崩掉

推荐策略：

- 某个 AI 队友失败时，把该草稿标记为 `failed`
- 前端允许用户重试该单个队友
- `commit round` 只有在所有草稿 `ready` 时才允许

---

## 前端实现路径

### 1. 开局页先把 companions 从占位改成真实表单

目标文件：

- `apps/web/src/components/GameSetupScreen.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/hooks/useBootstrapState.ts`
- `apps/web/src/storage.ts`

建议改造点：

1. `playMode` 下拉中新增 `故事模式`
2. 右侧 companions 区块改为真实 list
3. 每个 AI 队友卡片支持：
   - 名字输入
   - 性格 tag 选择
   - 删除
4. 增加“添加 AI 队友”按钮
5. 从 `/api/bootstrap` 拿人格列表，而不是硬编码到前端

### 2. setup 状态不要混进“全局默认设置”

当前 `storage.ts` 里的 `StoredWebDefaults` 更适合放：

- 默认语言
- 默认模型
- 默认日志显示

AI 队友名单更像“本次建局草稿”，不建议直接写成长期默认值。

推荐：

- 本轮建局配置放在 `App.tsx` / `GameSetupScreen` 临时状态
- 只有真的创建会话时才提交到服务端

### 3. 游戏内新增“玩家侧准备区”

目标文件：

- `apps/web/src/components/GameScreen.tsx`

推荐新增三个区域：

1. `主玩家草稿区`
2. `AI队友公开发言区`
3. `私聊入口区`

普通模式下：

- 主玩家草稿区是人类输入框
- AI 队友公开发言区展示生成结果

故事模式下：

- 主玩家草稿区默认展示主 AI 玩家生成结果
- 若是 `自动进行`，则输入框锁定不可编辑
- 若是 `玩家介入`，则允许人类修改主 AI 玩家草稿

### 4. 发送按钮旁加模式开关

需求明确要求：

- `自动进行`
- `玩家介入`

推荐将其挂在当前发送按钮旁侧，并和 `roundInputState.phase` 联动：

- `collecting` 时可切换
- `committing` 时锁定

### 5. 发送按钮的可用条件要改

当前只校验：

- 输入框非空

Phase 4 应改成：

- 所有必需参与者的公开草稿都处于 `ready`
- 当前不在生成中
- 当前不在提交中

也就是从“单输入可发”变成“整轮就绪可发”。

### 6. 私聊 UI 推荐独立抽屉，不要塞进详情页

用户的使用频率会比较高。

推荐做法：

- 在游戏页增加一个 `私聊` 抽屉或侧栏
- 左侧列出 AI 队友
- 右侧是当前 thread 的小聊天窗口

这样最贴近需求里的“小聊天软件界面”。

---

## 上下文拼接建议

这是 Phase 4 最容易失控的部分，建议尽早统一格式。

### 1. AI 队友的上下文来源

每个 AI 队友生成公开回合文本时，建议只吃三类材料：

1. 公共剧情历史
2. 本轮其他玩家已确定的公开输入
3. 与自己相关的私聊历史

### 2. 推荐上下文模板

建议统一按块拼接，而不是简单把消息乱串。

示意：

```text
[Public Story Context]
R1 Narrator: ...
R1 Human Player: ...
R1 Companion A: ...

[Current Round Public Inputs]
Human Player: ...

[Private Chat With Human]
Human -> You: ...
You -> Human: ...

[Task]
As this AI companion, write your public turn reply for the current round.
```

### 3. Narrator 的上下文不要混入私聊原文

推荐 Narrator 只接：

- 公共剧情历史
- 本轮最终公开提交集合

这样角色边界会更稳定。

---

## 推荐实施顺序

为了降低风险，推荐分 5 步做。

### Phase 4.1 先做数据结构和开局页

交付目标：

- `PlayMode` 扩展
- `CreateSessionRequest` 扩展
- `bootstrap` 返回人格列表
- `GameSetupScreen` 变成真实 AI 队友编辑器

先不接游戏内私聊，也先不接完整回合生成。

### Phase 4.2 接 AI 玩家 prompt 与建局播种

交付目标：

- 后端能读取 personality list
- 能拼出 AI 玩家 / AI 队友 system prompt
- 故事模式能创建主 AI 玩家
- beginning 文本能注入主 AI 玩家历史

### Phase 4.3 重构回合为 prepare / commit

交付目标：

- AI 队友并行生成公开草稿
- 游戏页能展示每名参与者的准备状态
- 所有草稿准备完成后才能正式提交给 Narrator

这是 Phase 4 的主干。

### Phase 4.4 接私聊

交付目标：

- 私聊 thread
- 人类和 AI 队友私聊
- 私聊影响 AI 队友公开回合文本

### Phase 4.5 接故事模式自动/介入

交付目标：

- 主 AI 玩家自动生成
- 自动进行自动提交
- 玩家介入允许编辑主 AI 玩家草稿

---

## 兼容与迁移建议

### 1. 老存档兼容

`SaveBundle`、`SessionSnapshot`、`localStorage` 都围绕现有结构。

推荐：

- Phase 4 提升 `schemaVersion`
- 读档时对缺失字段做默认值回填
- 老存档默认视为：
  - `playMode = single_player`
  - `aiCompanions = []`
  - `roundInputState = null`

### 2. 内容包兼容

`content/` 里很多 `supportsModes` 还是旧值。

推荐：

- Phase 4 先在 bootstrap / 过滤逻辑中做兼容映射
- 等运行时稳定后，再单独做内容包清理

### 3. 前端默认设置兼容

`StoredWebDefaults` 里已有 `playMode`。

推荐：

- 遇到旧值 `single_player_with_npc` 时
  - 先回退到 `single_player`
  - 不自动补 AI 队友列表

不要在默认设置恢复时偷偷构造虚假 companion 数据。

---

## 主要风险

### 1. 回合状态很容易死锁

如果“所有人都要 ready 才能提交”，就必须明确：

- 谁是必需参与者
- 谁生成失败后可以重试
- 哪些状态会锁按钮

否则 UI 很容易卡在“永远不能发送”。

### 2. 私聊会快速放大 token 压力

每个 AI 队友如果都带上完整公共历史 + 私聊历史，成本会涨很快。

建议 MVP 做两个限制：

- AI 队友最多 3 名
- 私聊上下文只保留最近若干条，或最近若干轮

### 3. story mode 和 companion mode 容易混成一团

一定要坚持两个问题分开建模：

- 主玩家是谁
- 还有哪些 AI 队友

否则后面逻辑会不断出现特判。

### 4. 当前代码很多地方默认只有一个玩家

尤其是：

- `Session`
- `submitTurn`
- `GameScreen`
- 分支图和存档链路

所以推荐先补抽象，再接功能，不要直接在旧字段上堆条件分支。

---

## 建议的 MVP 边界

为了让 Phase 4 第一版尽快闭环，建议先只做以下边界：

1. 最多 3 名 AI 队友
2. 私聊只支持：
   - 人类 <-> AI 队友
3. Narrator 不读取私聊原文
4. 玩家介入模式先只允许编辑“主 AI 玩家草稿”
5. AI 队友公开草稿先只支持重新生成，不做流式逐字展示

这样能先把“建局 -> 生成 -> 等待 -> 提交 -> 继续剧情”这条主链跑通。

---

## 我对实现顺序的建议

如果下一轮开始写代码，我建议按下面顺序推进：

1. 先改共享类型和 `CreateSessionRequest`
2. 再把开局页 AI 队友列表做实
3. 然后接服务端 AI 玩家 prompt 服务
4. 再拆 `submitTurn` 为 `prepare` 和 `commit`
5. 最后接私聊与故事模式自动化

原因很简单：

- 先有正确的数据结构
- 才能有稳定的 API
- 再往上接 UI

---

## 本轮结论

Phase 4 真正的难点不在 prompt，而在“把单人主循环升级成多参与者回合编排器”。

好消息是，当前 3.0 已经有三块很好的基础：

- 开局页 companions 布局预留好了
- 模型网关已经有通用文本生成能力
- AI 玩家 prompt 资源和人格库已经在仓库里

因此 Phase 4 不需要推翻重写，推荐做法是：

- 保留当前 Narrator / Ending Judge 主链
- 在玩家侧前面补一层 `party round orchestration`
- 再把私聊接成 AI 队友的专属上下文来源

这样改造风险最低，也最符合这份需求文档的方向。
