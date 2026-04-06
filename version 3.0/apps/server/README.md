# Server Skeleton

`apps/server` 负责 3.0 的会话状态、内容加载、模型调用编排和调试接口。

Phase 1 当前已包含：

- 最小内容加载器
- 内容验证脚本
- 供前后端复用的共享类型接入点

后续阶段将在这里继续补：

- Session Service
- Model Gateway
- Save / Load
- Replay 导出
