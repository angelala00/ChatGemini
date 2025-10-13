# ChatGemini Assistant Dashboard

使用 React + Vite 构建的可视化大屏原型，集成 Tailwind CSS、React Query、Axios 与 Recharts，并预留 WebSocket 推送能力。

## 快速开始

```bash
npm install
npm run dev
```

默认会在 `http://localhost:4173` 启动开发服务器。应用会周期性请求 `Assistant Metrics API` 服务提供的接口，并在 `.env` 中配置 WebSocket 相关变量后监听实时推送。

本仓库已经提供了参考后端：`servers/assistant-metrics-api`。在单独的终端中执行下列命令即可启动默认的数据 API：

```bash
cd servers/assistant-metrics-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 5010
```

前端开发服务器内置了对 `http://localhost:5010` 的反向代理，因而可以直接访问 `/api/dashboard` 与 `/ws/dashboard`。

## 环境变量

| 变量名 | 说明 | 默认值 |
| ------ | ---- | ------ |
| `VITE_API_BASE_URL` | Axios 请求的基础路径 | ``（相对路径） |
| `VITE_DASHBOARD_ENDPOINT` | 仪表盘数据接口路径 | `/api/dashboard` |
| `VITE_REFRESH_INTERVAL` | React Query 自动刷新间隔（毫秒） | `30000` |
| `VITE_WS_URL` | WebSocket 地址，推送 `dashboard:update` 事件 | 未配置则根据 `VITE_API_BASE_URL` 或当前域名推导 |
| `VITE_DEV_API_PROXY_TARGET` | Vite 开发环境代理目标地址 | `http://localhost:5010` |

## 数据结构

后端示例数据由 `Assistant Metrics API` 动态生成，字段结构与此前的 `public/data/dashboard.json` 保持一致。如需对接真实接口，请保证返回字段与示例结构兼容。

更多日志采集建议参见 [docs/logging.md](./docs/logging.md)。
