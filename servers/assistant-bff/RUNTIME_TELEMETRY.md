# Runtime Telemetry

前端运行时崩溃与异常事件通过 `assistant-web -> assistant-bff` 上报，并以 JSON Lines 形式写入独立日志文件。

## 日志位置

- 业务日志：`$LOG_BASE/gpt-assistant/app.log`
- 运行时事件日志：`$LOG_BASE/gpt-assistant/runtime-events.log`

`runtime-events.log` 每行一条 JSON，按天轮转，保留 14 份历史文件。

## 主要事件

- `page_open`
- `heartbeat`
- `page_hide`
- `chat_stream_start`
- `chat_stream_end`
- `js_error`
- `unhandled_rejection`
- `react_render_error`
- `suspected_crash`

## 查询接口

- 最近事件：
  - `GET /api/client-runtime/events?event=suspected_crash&hours=24&limit=100`
- 摘要：
  - `GET /api/client-runtime/summary?hours=24`

常用过滤参数：

- `event`
- `runtimeSessionId`
- `chatSessionId`
- `gid`
- `route`
- `userEmail`
- `since`
- `until`
- `hours`
- `limit`

## 直接查日志

示例：

```bash
rg '"event":"suspected_crash"' "$LOG_BASE/gpt-assistant/runtime-events.log"
```

```bash
tail -n 50 "$LOG_BASE/gpt-assistant/runtime-events.log"
```

如果系统安装了 `jq`，可以配合使用：

```bash
tail -n 20 "$LOG_BASE/gpt-assistant/runtime-events.log" | jq .
```

## Dashboard

现有 dashboard payload 已经带上 `runtimeSummary`，可直接查看：

- 疑似崩溃数
- 疑似崩溃率
- JS Error 数
- Promise Rejection 数
- React Render Error 数
- 企微占比
- 高频页面
- 浏览器分布
- 最近疑似崩溃
