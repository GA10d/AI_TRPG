# 结局后回溯分支树设计稿

## 1. 背景

无论 3.0 最后内部实现是：

- `mock`
- `single_agent`
- `multi_agent`

用户侧看到的主循环都基本一致：

- 玩家一句话
- 主持人一句话
- 再进入下一轮

因此，分支回溯系统不应该依赖某一种特定 Agent 架构，而应该建立在更稳定的“每轮会话快照”之上。

本设计稿要解决的是：

1. 玩家进入结局后，能回看这一局此前形成的所有节点。
2. 玩家可以回到任意历史节点，从该节点对应的回合继续游玩。
3. 多次回溯后，整局游戏形成树状结构。
4. 前端显示节点 + 连线图，并高亮当前玩家所处节点。
5. 点击节点可以读取对应存档。
6. 后续允许在结局节点之后衍生：
   - 复盘
   - 后日谈
   - 其他结局后特殊内容
7. 边的颜色需要表达：
   - 不同周目
   - 同一周目的深度
   - 普通剧情 vs 复盘/后日谈

---

## 2. 一个关键前提

## 2.1 结局判定来源

本项目后续无论是单 Agent 还是多 Agent，都应保证有一个 AI 负责返回结构化结局裁定，例如：

```ts
type EndingAdjudication = {
  isGameOver: boolean
  endingState: null | {
    endingId: string
    endingType: "preset" | "hidden" | "emergent"
    title: string
    summary: string
  }
}
```

核心原则：

- 进入结局，不由程序通过关键词、flag、回合数等硬编码条件自动判定
- 程序只负责接收 AI 的结构化结果、落盘、展示、限制继续行为

也就是说：

- **AI 决定“是不是结局”**
- **系统决定“怎么记录这个结局节点”**

---

## 2.2 必须区分两种“叶子”

树里会有两种看起来都“没有子节点”的点，但它们意义不同：

### 1. 普通叶子

只是“当前还没有长出下一步”，但理论上仍然可以继续扩展。

例如：

- 当前玩家停在第 5 轮
- 这时树的最末端还没有新子节点
- 但玩家继续输入后，仍然会长出第 6 轮

这种叶子：

- 不是终局
- 可以继续
- 只是暂时没子节点

### 2. 终局叶子

AI 已经裁定：

- `isGameOver = true`
- 并给出 `endingState`

这种节点才是真正的终局叶子。

它的含义是：

- 当前分支到此封口
- 不能再长普通剧情节点
- 不能再长另一个结局节点
- 但允许连接“复盘 / 后日谈 / 结局后特殊节点”

这个区分非常重要。  
否则系统会把“当前末端”误当成“永远终局”。

---

## 3. 当前存档结构是否够用

## 3.1 当前 `SaveBundle` 的优点

当前 `SaveBundle` 已经包含：

- `session`
- `messages`
- `replay`
- `contentSummary`
- `runtimeConfig`

这意味着：

**它已经足够作为“一个节点的完整快照”。**

也就是说：

- 不需要重造新的快照正文结构
- 当前 `SaveBundle` 就可以直接作为节点快照使用

---

## 3.2 当前结构还缺什么

当前系统虽然能保存“一个点”，但还缺这些东西：

1. 没有“图”的元数据
   - 不知道哪个节点的父节点是谁
   - 不知道哪些节点属于同一棵树
   - 不知道当前玩家停在哪个节点

2. 没有“节点类型”和“边类型”
   - 现在只有快照，没有树语义

3. 没有“终局锁定规则”
   - 没显式区分：
     - 普通可继续节点
     - 终局封口节点
     - 结局后特殊节点

4. 没有“每轮自动 checkpoint”
   - 当前主要是手动 save/load
   - 分支树要求每轮都能变成回溯点

5. 当前存储层不适合大量节点快照
   - 现在主要使用 `localStorage`
   - 如果每轮都存完整 `SaveBundle`，体积会增长很快

---

## 4. 设计结论

推荐方案：

**保留 `SaveBundle` 作为节点快照正文，再增加一层 `PlaythroughGraph` 元数据层。**

这套设计里：

- `SaveBundle`
  回答：这个节点当时的完整游戏状态是什么？

- `PlaythroughNode`
  回答：这个节点是什么类型？能不能继续？是不是终局？

- `PlaythroughEdge`
  回答：这个节点是如何从前一个节点长出来的？属于哪一条路线？怎么上色？

- `PlaythroughGraph`
  回答：这一整棵树现在发展到什么程度？当前玩家在哪个节点？

---

## 5. 推荐数据结构

## 5.1 `PlaythroughGraph`

```ts
type PlaythroughGraph = {
  id: string
  ruleId: string
  storyId: string
  locale: string

  createdAt: string
  updatedAt: string

  rootNodeId: string
  currentNodeId: string

  unlockedAtEnding: boolean
  firstEndingReachedAt?: string

  nodeCount: number
  terminalNodeIds: string[]
}
```

### 作用

- 表示“一整棵分支树”
- 记录根节点
- 记录当前节点
- 记录是否已解锁结局后树 UI
- 记录哪些节点是终局节点

---

## 5.2 `PlaythroughNode`

```ts
type PlaythroughNode = {
  id: string
  graphId: string
  parentNodeId: string | null

  nodeKind: "opening" | "turn" | "manual" | "ending" | "debrief" | "epilogue"

  round: number
  createdAt: string
  checkpointKind: "opening" | "turn" | "manual" | "ending"

  sourceSessionId: string
  snapshotId: string

  playerPreview: string | null
  gmPreview: string | null

  statusAtCapture: "active" | "ending" | "ended"

  expandability: {
    mode: "open" | "locked_by_ending" | "special_followup_only" | "closed"
    reason?: string
  }

  terminalState: {
    isTerminal: boolean
    reason: "open" | "ending_confirmed"
    adjudicationSource: "single_agent" | "multi_agent" | "unknown"
  }

  endingState?: {
    endingId: string
    endingType: "preset" | "hidden" | "emergent"
    title: string
    summary: string
    confirmedAtRound: number
  } | null

  tags?: string[]
}
```

### 节点类型解释

#### `opening`

- 开场后的根节点
- 属于普通剧情起点

#### `turn`

- 普通剧情推进节点

#### `manual`

- 玩家主动打标记的 checkpoint 节点
- 语义上仍然属于普通剧情体系

#### `ending`

- AI 已裁定进入结局的节点
- 是普通剧情分支的封口点

#### `debrief`

- 结局后的复盘节点
- 不是普通剧情节点

#### `epilogue`

- 结局后的后日谈节点
- 不是普通剧情节点

---

### `expandability` 的意义

它比 `terminalState` 更偏“前端交互和连接规则”：

- `open`
  节点可以继续长普通剧情

- `locked_by_ending`
  节点被终局封口，不允许再长普通剧情或结局节点

- `special_followup_only`
  节点不能再长普通剧情，但允许连接复盘/后日谈等特殊节点

- `closed`
  节点彻底关闭，不允许再扩展

推荐约定：

- 普通剧情节点默认是 `open`
- 结局节点默认是 `special_followup_only`
- 特殊节点默认是 `closed`

---

### `terminalState` 的意义

它不是在说“有没有子节点”，  
而是在说“这个节点是否已经被 AI 确认封口”。

#### `terminalState.isTerminal`

- `false`
  说明这个节点仍然属于开放节点

- `true`
  说明这个节点已经被系统视为封口节点

#### `terminalState.reason`

MVP 第一版建议只做两种：

- `open`
- `ending_confirmed`

以后如果有需要，再扩展：

- `manual_locked`
- `archived`

---

## 5.3 `PlaythroughEdge`

边建议正式建模，不再只靠 `parentNodeId` 隐式表达。

```ts
type PlaythroughEdge = {
  id: string
  graphId: string

  fromNodeId: string
  toNodeId: string

  edgeKind: "turn_progression" | "branch_resume" | "after_ending_followup"

  routeId: string
  depthInRoute: number

  visualFamily: "mainline" | "branch" | "after_ending"
}
```

### 为什么边必须单独建模

因为后面你已经明确提出：

- 不同周目的边要不同颜色
- 同一周目的边要同色系不同深度
- 复盘和普通剧情边要不同色系

如果只有 `parentNodeId`，这些信息很难稳定表达。

---

### 边类型解释

#### `turn_progression`

正常剧情推进边。

典型情况：

- `opening -> turn`
- `turn -> turn`
- `manual -> turn`
- `turn -> ending`

#### `branch_resume`

从旧节点重新继续时产生的第一条新边。

典型情况：

- 玩家回到第 3 轮
- 从第 3 轮重新走出一个新的第 4 轮
- 这条边记为 `branch_resume`

#### `after_ending_followup`

结局后特殊延展边。

典型情况：

- `ending -> debrief`
- `ending -> epilogue`
- `debrief -> epilogue`（如果后续允许特殊节点内部继续）

---

## 5.4 `routeId` 与颜色

为了支持“同一周目同色系，不同周目不同色系”，建议引入 `routeId`。

### `routeId`

它表示：

**一条连续游玩路线的视觉归属。**

推荐规则：

- 初始主线有一个默认 `routeId`
- 玩家从历史节点重新继续时，生成新的 `routeId`
- 该分支后续所有普通剧情边都继承这个 `routeId`

### `depthInRoute`

它表示一条边在当前路线里的深度，用于颜色深浅。

推荐渲染方式：

- 同一个 `routeId`
  - 使用同一基础色相
  - 深度越深，颜色越深或透明度越低

### `visualFamily`

用于区分不同语义的色系：

- `mainline`
  普通剧情主线
- `branch`
  从旧节点重新长出的新周目
- `after_ending`
  复盘 / 后日谈 / 特殊结局后内容

---

## 5.5 节点与边的连接约束

这是整个系统里最重要的一张规则表。

### A. 普通剧情节点

包括：

- `opening`
- `turn`
- `manual`

它们可以连接到：

- `turn`
- `ending`

不能连接到：

- 另一个 `opening`
- `debrief`
- `epilogue`

除非未来你明确允许“未结局直接进入复盘”，否则当前不建议开放。

### B. 结局节点

包括：

- `ending`

它们：

- **不能连接到普通剧情节点**
- **不能连接到另一个结局节点**
- 只允许连接到：
  - `debrief`
  - `epilogue`
  - 或未来其它“结局后特殊节点”

也就是说：

- `ending -> turn`：不允许
- `ending -> ending`：不允许
- `ending -> debrief`：允许
- `ending -> epilogue`：允许

### C. 特殊后续节点

包括：

- `debrief`
- `epilogue`

MVP 第一版建议：

- 默认作为特殊叶子处理
- 即：
  - 可以从 `ending` 长出来
  - 它们自身默认不再继续扩展

如果未来你想允许：

- `debrief -> epilogue`
- `epilogue -> extra epilogue`

那也应当只允许在“特殊节点体系内部”连接，不能再回流到普通剧情节点或结局节点。

---

## 5.6 `SnapshotBlob`

```ts
type SnapshotBlob = {
  id: string
  graphId: string
  nodeId: string
  createdAt: string
  saveBundle: SaveBundle
}
```

### 作用

- 真正保存完整快照正文
- 直接复用当前 `SaveBundle`

---

## 6. 当前存档应该保存什么“结局信息”

我的建议是：

**要保存，而且要保存两层。**

## 6.1 在 `SaveBundle.session.gameState` 里保存

当前轻量 `GameState` 已经有：

```ts
gameState: {
  phase?: "setup" | "playing" | "ending" | "ended"
  endingState?: ...
}
```

这一层继续保留，原因是：

- 它表示“这个快照当时的会话状态”
- 如果加载的是一个结局快照，系统必须知道它当时已经结束

所以当 AI 返回：

- `isGameOver = true`
- `endingState != null`

时，建议把当前快照写成：

```ts
session.status = "ended"
session.gameState.phase = "ended"
session.gameState.endingState = { ...AI 返回内容... }
```

这层是快照内真相。

---

## 6.2 在 `PlaythroughNode` 里再存一层轻量终局元数据

这一层是为了树图快速判断：

- 这个节点是不是终局
- 该不该允许“从此继续”
- 它是不是只允许接复盘/后日谈
- UI 应该用什么样式显示

所以：

- `SaveBundle.session.gameState.endingState`
  是完整快照内的结局真相

- `PlaythroughNode.terminalState + expandability + endingState`
  是树索引层的轻量投影

这两层并不冲突，而是职责不同。

---

## 7. 节点生成规则

## 7.1 什么时候生成节点

推荐从一开始就自动记录节点，而不是等到结局后再补。

规则如下：

1. 创建会话后
   - 生成根节点
   - `nodeKind = "opening"`
   - `checkpointKind = "opening"`

2. 每一轮完整结束后
   - 即“玩家一句 + 主持人一句”完成后
   - 自动生成一个新节点
   - 如果 AI 未判定结局：
     - `nodeKind = "turn"`
     - `expandability.mode = "open"`
   - 如果 AI 已判定结局：
     - `nodeKind = "ending"`
     - `expandability.mode = "special_followup_only"`
     - `terminalState.isTerminal = true`

3. 如果玩家手动存档
   - 不一定要复制一份新快照
   - 可以给当前节点加 `manual` 标记

4. 如果进入结局
   - 当前节点记为 `ending`
   - `graph.unlockedAtEnding = true`
   - 该节点加入 `graph.terminalNodeIds`

---

## 7.2 为什么必须“平时就记录节点”

因为玩家是在结局之后才看到树，  
但树里的历史节点来自“结局之前的每一轮”。

如果不提前存，结局之后是补不出来的。

所以：

- **采集行为**：从一开始就做
- **UI 解锁行为**：到结局后再做

---

## 8. 分支是怎么形成的

## 8.1 从旧节点继续

当玩家点击旧节点并选择“从这里继续”时：

1. 读取该节点对应的 `SnapshotBlob.saveBundle`
2. 恢复为当前活跃会话
3. **重新生成新的 `session.id`**
4. 当前游玩光标切到该节点
5. 玩家继续输入下一轮
6. 下一轮结束后，创建新的子节点

也就是说：

- 点击旧节点本身不会立刻生成新节点
- 只有玩家从这里真的继续玩，才会长出新分支

---

## 8.2 终局节点能不能继续？

我的建议很明确：

### 不能继续普通剧情

终局节点一旦被 AI 裁定：

- `isGameOver = true`

那么它就应当视为普通剧情分支的封口点。

所以：

- `ending -> turn`：不允许
- `ending -> ending`：不允许

### 但可以继续特殊后续内容

如果玩家想看：

- 复盘
- 后日谈

那么：

- `ending -> debrief`：允许
- `ending -> epilogue`：允许

也就是说：

终局节点不是“完全死节点”，  
而是“**对普通剧情关闭、对特殊后续开放**”。

---

## 9. 前端交互建议

## 9.1 在什么时候显示树

建议：

- 正常游玩中：不打断主对话界面
- 进入结局后：显示“分支回溯树”入口
- 点击后：进入专门页面，或在游戏页右侧展开树视图

---

## 9.2 节点上显示什么

每个节点建议显示：

- 回合号
- 玩家输入预览
- 主持人回复预览
- 是否是当前节点
- 是否是手动标记节点
- 是否是终局节点
- 是否是复盘/后日谈节点

建议视觉规则：

- 普通节点：默认样式
- 终局节点：强调边框或图标
- 复盘/后日谈节点：独立图标 + 独立色带

---

## 9.3 点击节点后的操作

### 普通节点

显示：

- 该回合详情
- `读取此节点`
- `从此继续`

### 终局节点

显示：

- 结局标题
- 结局摘要
- 该回合详情
- `读取此节点`
- `查看结局详情`
- `生成复盘`
- `生成后日谈`

不显示：

- `从此继续`

### 特殊后续节点

如果是 `debrief / epilogue`：

- 显示其类型
- 显示 AI 生成的摘要
- 默认只读查看
- 是否允许再长特殊节点，取决于其 `expandability`

---

## 10. 当前结构怎么接入

## 10.1 最小改造方案

当前最适合的接法是：

- 保留现有 `SaveBundle`
- 新增：
  - `PlaythroughGraph`
  - `PlaythroughNode`
  - `PlaythroughEdge`
  - `SnapshotBlob`
- 每轮自动生成一份 `SaveBundle`
- 把它保存为 `SnapshotBlob.saveBundle`

---

## 10.2 存储建议

### `localStorage`

只保存轻量信息：

- 最近打开的 graph id
- UI 折叠状态
- 最近使用的规则/剧本
- 默认模型配置

### `IndexedDB`

保存大数据：

- `PlaythroughGraph`
- `PlaythroughNode`
- `PlaythroughEdge`
- `SnapshotBlob`
- 手动存档正文

理由：

- 分支树会产生大量快照
- `localStorage` 容量太小
- 每轮都存完整 `SaveBundle` 会很快膨胀

---

## 11. 对当前系统的影响

## 11.1 后端

后端在 MVP 阶段不一定要持久化整棵树。  
它最需要补的是：

1. 从某个 `SaveBundle` 恢复时，支持“克隆成新的 session”
2. 当 AI 裁定结局时，把终局状态写进当前快照
3. 允许前端请求“当前会话导出 checkpoint 快照”

也就是说：

- 树元数据可以先放在前端本地
- 后端继续只管当前活跃会话

---

## 11.2 前端

前端需要新增一个 `PlaythroughGraph Store`，负责：

1. 管 graph 元数据
2. 管节点列表
3. 管边列表
4. 管节点到 snapshot 的映射
5. 处理“从节点继续”的交互
6. 处理终局节点和特殊节点的限制
7. 在结局后解锁树 UI

---

## 12. 推荐实现顺序

### Step 1
做“每轮自动 checkpoint”

### Step 2
做“AI 终局裁定进入快照”

### Step 3
做“终局后解锁节点列表”

### Step 4
做“从普通历史节点继续”

### Step 5
做“终局节点只读 + 特殊后续节点入口”

### Step 6
把列表升级成真正的树状图

### Step 7
加路线颜色系统

---

## 13. 最终结论

这次你补充的点会直接影响节点模型，结论如下：

1. **终局是否成立，必须来自 AI 的结构化裁定，不由程序硬编码判断。**
2. **树里必须区分“普通叶子”和“终局叶子”。**
3. **终局叶子不能再连接普通剧情节点或结局节点。**
4. **终局叶子可以连接复盘 / 后日谈等特殊节点。**
5. **边必须正式建模，因为后面要承载路线颜色、周目深度和特殊色系。**
6. **当前 `SaveBundle` 仍然足够当节点快照使用；真正需要新增的是“图元数据层 + IndexedDB 存储层”。**
7. **终局锁定状态应该同时保存在：**
   - `SaveBundle.session.gameState.endingState`
   - `PlaythroughNode.terminalState`
   - `PlaythroughNode.expandability`

