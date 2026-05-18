# AI TRPG 3.0

以文字叙事为核心的 AI TRPG 原型项目。

这个仓库包含一套正在迭代中的完整工程骨架：`React + Vite` 前端、`Node + TypeScript` 会话服务、可编辑内容包、单 Agent / 多 Agent 预留架构，以及文本模型与图像模型的接入底座。项目当前重点是把“可游玩、可存档、可回放、可扩展”的单人 AI TRPG 主循环打磨稳定。

## 项目展示

### 多题材封面

下面三张示例封面用于说明项目的题材兼容性：同一套 AI TRPG 框架可以承载狐影奇幻、恋爱叙事、太空科幻等不同风格。

| 狐影题材 | 恋爱题材 | 太空题材 |
| --- | --- | --- |
| ![狐影题材游戏封面](show_case/cover%20fox.png) | ![恋爱题材游戏封面](show_case/cover%20love.png) | ![太空题材游戏封面](show_case/cover%20space.png) |

### 当前项目界面

下面两张图展示当前项目的启动封面与主菜单效果。

| 启动封面 | 主菜单 |
| --- | --- |
| ![当前项目启动封面](show_case/%E5%B0%81%E9%9D%A2.png) | ![当前项目主菜单](show_case/%E4%B8%BB%E8%8F%9C%E5%8D%95.png) |

### 演示视频

[查看演示视频](show_case/%E6%BC%94%E7%A4%BAdemo.mp4)

<video controls src="show_case/%E6%BC%94%E7%A4%BAdemo.mp4" width="100%"></video>

## 当前能力

- Web 主菜单、开始游戏、继续游戏、战绩、设置、退出
- 单人文字叙事游玩主循环
- `Narrator + Ending Judge` 的 MVP 双 Agent 运行时
- 开场 AI 预览、角色概念 AI 生成与补全
- 本地存档、继续游戏、回放日志
- 结局后的分支回溯树
- `mock` 与 `server_proxy` 两种模型接入模式
- 多文本模型档案切换：`ChatGPT / DeepSeek / Gemini / Doubao / Custom OpenAI-compatible`
- NPC 档案入口与文生图 pipeline 底座
- 基于 `content/` 的规则包与剧本包加载机制

## 项目目标

- 做一个以自然语言叙事为主、可长期扩展的 AI TRPG 运行时
- 在保留 AI 自由裁量感的同时，让状态、日志、存档和回放都可落盘、可调试
- 为后续的 `multi_agent`、多人联机、私聊、图像扩展和社区内容创作预留稳定边界

## 技术栈

- Frontend: `React 18 + TypeScript + Vite`
- Backend: `Node.js + TypeScript`
- Workspace: `npm workspaces`
- Runtime mode: `mock`, `server_proxy`
- Shared packages: `packages/shared-types`, `packages/shared-config`
- Content format: `Markdown / txt + JSON`

## 快速开始

建议使用支持 `node --experimental-strip-types` 的较新 Node.js 版本。

1. 安装依赖

```powershell
npm.cmd install
```

2. 复制环境变量模板

```powershell
Copy-Item .env.example .env
```

3. 按需填写 `.env`

- 文本模型相关变量见 `.env.example`
- 默认支持 `ChatGPT / DeepSeek / Gemini / Doubao / Custom OpenAI-compatible`
- 如果只想跑本地流程验证，可以先使用 `mock` 模式

4. 启动服务端

```powershell
npm.cmd run dev:server
```

5. 启动前端

```powershell
npm.cmd run dev:web
```

6. 打开浏览器

```text
http://127.0.0.1:4317/
```

## 常用命令

```powershell
# 启动服务端
npm.cmd run dev:server

# 启动前端
npm.cmd run dev:web

# 构建前端
npm.cmd run build:web

# 校验内容包
npm.cmd run content:catalog

# 用英文 locale 校验内容包
npm.cmd run content:catalog:en

# 跑一轮业务流自测
npm.cmd run test:real -- --mode=mock
```

说明：

- 如果存在 `apps/web/dist`，服务端可以直接托管前端构建产物
- `server_proxy` 模式下可以通过设置页或 `.env` 切换不同模型档案

## 仓库结构

```text
apps/
  web/        React 前端
  server/     Node 会话服务与模型网关
  prompt/     Narrator、Ending Judge、文生图等 prompt 资源
packages/
  shared-types/
  shared-config/
content/      规则包与剧本包
docs/         设计文档、字段审阅、阶段规划
scripts/      辅助脚本
test_ipynb/   prompt 实验、批量验证与回放分析
```

## 已收录内容包

### 规则包

- `VHS`：`VHS复古恐怖录像带`
- `ROM`：`心动边界`
- `MOCA`：`Mock A 都市异象`
- `MOCB`：`Mock B 乡镇怪谈`

### 示例剧本

- `VHS / 湖岸录像谜灵`
- `VHS / 老宅狐影`
- `ROM / 初夏未读消息`
- `MOCA / 雾站月台`
- `MOCA / 霓虹走廊`
- `MOCB / 赤页档案`
- `MOCB / 断桥渡口`

这些内容包以文件夹形式组织，便于继续扩写、替换和社区化创作。

## 当前开发重点

- 优化“叙事阅读 + 行动输入”为中心的游戏主界面
- 稳定 `Narrator + Ending Judge` 的单人可游玩链路
- 扩充 NPC 资料展示与图像生成能力
- 继续完善存档、回放、分支树和模型配置体验

## 相关文档

- `docs/phase0_foundation.md`：3.0 基线设计
- `docs/phase2_field_audit.md`：字段瘦身审阅
- `docs/phase3_plan.md`：当前阶段实现规划
- `docs/ending_branch_playthrough_design.md`：结局后分支回溯树设计

## 状态说明

当前仓库仍处于积极迭代阶段，已有可运行原型，但 API、数据结构、UI 和内容规范都还会继续收敛。适合作为：

- AI TRPG 原型开发底座
- Prompt / Agent 编排实验场
- 文件化规则包与剧本包设计参考
- 单人文字交互游戏运行时样例
