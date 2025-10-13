# ChatGemini Assistant Dashboard

使用 React + Vite 构建的可视化大屏原型，集成 Tailwind CSS、React Query、Axios 与 Recharts，并预留 WebSocket 推送能力。

## 快速开始

```bash
npm install
npm run dev
```

默认会在 `http://localhost:4173` 启动开发服务器。应用会周期性请求 `public/data/dashboard.json` 并在 `.env` 中配置 `VITE_WS_URL` 时监听 WebSocket 推送。

## 环境变量

| 变量名 | 说明 | 默认值 |
| ------ | ---- | ------ |
| `VITE_API_BASE_URL` | Axios 请求的基础路径 | ``（相对路径） |
| `VITE_DASHBOARD_ENDPOINT` | 仪表盘数据接口路径 | `/data/dashboard.json` |
| `VITE_REFRESH_INTERVAL` | React Query 自动刷新间隔（毫秒） | `30000` |
| `VITE_WS_URL` | WebSocket 地址，推送 `dashboard:update` 事件 | 未配置则不建立连接 |

## 数据结构

示例数据位于 `public/data/dashboard.json`。如需对接真实接口，请保证返回字段与示例结构一致。

更多日志采集建议参见 [docs/logging.md](./docs/logging.md)。
