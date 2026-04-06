# Web App

`apps/web` 是 3.0 的 React + Vite 前端入口。

当前已经具备：

- 主菜单
- 开始游戏 / 继续游戏 / 战绩 / 设置 / 退出 五个页面入口
- 最小游戏页
- mock turn 提交
- 消息流与回放显示
- 本地继续进度、战绩摘要、默认设置保存
- `server_proxy` 配置状态提示

开发命令：

- 根目录运行 `npm.cmd run dev:web`
- 默认地址是 `http://127.0.0.1:4317/`

说明：

- 开发模式下由 Vite 代理 `/api` 到本地 Node 服务
- 构建后输出到 `apps/web/dist`
- 当前前端目录已经拆成 `components + pages + hooks + lib/api client`
- 还没有正式接入路由系统，后面可以继续往 `pages + router + hooks + api client` 方向演进
