# Assistant Metrics API

FastAPI 服务，为 `apps/assistant-dashboard` 大屏提供指标数据与 WebSocket 推送示例。

## 快速开始

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# ``tzdata`` ships the IANA timezone database so the API can format
# timestamps consistently even on minimal environments.
uvicorn app.main:app --host 0.0.0.0 --port 5010
```

启动后将提供下列接口：

| Endpoint | 描述 |
| -------- | ---- |
| `GET /healthz` | 健康检查 |
| `GET /api/dashboard` | 返回仪表盘统计数据 |
| `WS /ws/dashboard` | 周期性推送 `dashboard:update` 消息 |

推送间隔可以通过环境变量 `DASHBOARD_PUSH_INTERVAL`（秒）进行调整，默认 30 秒。
