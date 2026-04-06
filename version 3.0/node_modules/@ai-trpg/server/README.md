# Server App

`apps/server` 负责 3.0 的会话状态、内容加载、模型调用编排和调试接口。

当前已经具备：

- 最小内容加载器
- 内容验证脚本
- Session 创建接口
- mock turn 接口
- Model Gateway 基线
- `server_proxy` 第一版真实文本调用
- 一键业务流自测脚本
- 如果存在 `apps/web/dist`，可直接托管前端构建产物

`server_proxy` 使用方式：

1. 复制根目录的 [.env.example](/f:/Documents/GitHub/AI_TRPG_616/version%203.0/.env.example) 为 `.env` 或 `.env.local`
2. 配置 `TRPG_SERVER_PROXY_MODEL`
3. 配置 `TRPG_SERVER_PROXY_API_KEY`
4. 如果你不是走 OpenAI 原生接口，再补 `TRPG_SERVER_PROXY_BASE_URL`

本地 smoke test：

- 运行 `node --experimental-strip-types ./apps/server/src/scripts/validateServerProxy.ts`
- 这个脚本会起一个本地假的 OpenAI-compatible 服务，验证 `server_proxy` 调用链是否正常

业务流自测：

- 根目录运行 `npm.cmd run test:real -- --mode=mock`
- 或直接双击 [test_real_business.cmd](/f:/Documents/GitHub/AI_TRPG_616/version%203.0/scripts/test_real_business.cmd)
- bash 环境可运行 [test_real_business.sh](/f:/Documents/GitHub/AI_TRPG_616/version%203.0/scripts/test_real_business.sh)

后续阶段会继续补：

- 更正式的 Session Service
- 结构化 adjudication / ending
- Save / Load
- Replay 导出
