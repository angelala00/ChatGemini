import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useDashboardData } from "./hooks/useDashboardData";

const DEFAULT_TIME_RANGE = "14d";
const TIME_RANGE_STORAGE_KEY = "dashboard:timeRange";

function MetricCard({
  title,
  value,
  hint,
  emphasis,
  detailLabel,
  detailValue,
  detailEmphasis
}) {
  const showDetail = detailLabel || detailValue || detailEmphasis;
  const hasDetailPair = detailValue && detailEmphasis;
  const inlineDetailValue =
    hasDetailPair && typeof detailValue === "string"
      ? detailValue.replace(/\s*(?:次|请求)$/u, "")
      : detailValue;

  return (
    <article className="relative overflow-hidden rounded-soft border border-white/10 bg-panel p-4 shadow-panel">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-200">
            {title}
          </h3>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-50">{value}</p>
          {hint ? (
            <p className="mt-1 flex items-center gap-2 text-xs font-medium text-accent-secondary">
              <span>{hint}</span>
              {emphasis ? (
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  {emphasis}
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {showDetail ? (
          <div className="flex flex-col items-end gap-1 text-right">
            {detailLabel ? (
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                {detailLabel}
              </span>
            ) : null}
            {hasDetailPair ? (
              <span className="flex items-baseline gap-1 text-sm font-semibold text-slate-100">
                <span>{inlineDetailValue}</span>
                <span className="text-xs font-normal text-slate-500">/</span>
                <span className="text-sm font-semibold text-brand">{detailEmphasis}</span>
              </span>
            ) : (
              <>
                {detailValue ? (
                  <span className="text-sm font-semibold text-slate-100">{detailValue}</span>
                ) : null}
                {detailEmphasis ? (
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                    {detailEmphasis}
                  </span>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatLeaderboardValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  const match = trimmed.match(
    /^([\d,]+)\s*(?:次|请求)?\s*[·•]\s*(\d+(?:\.\d+)?)%$/u
  );

  if (match) {
    const [, total, percentage] = match;
    return `${total} / ${percentage}%`;
  }

  return value;
}

function ListCard({ title, items, limit, scrollHeight }) {
  const displayItems = limit ? items.slice(0, limit) : items;
  const enableScroll = Boolean(scrollHeight);

  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <h3 className="text-base font-semibold text-slate-100/90">{title}</h3>
      <ul
        className={`mt-4 space-y-3 ${
          enableScroll ? "flex-1 min-h-0 overflow-y-auto pr-2" : ""
        }`}
        style={enableScroll ? { maxHeight: scrollHeight } : undefined}
      >
        {displayItems.map(({ name, value }, index) => (
          <li
            key={`${name}-${index}`}
            className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-sm text-slate-300 last:border-b-0 last:pb-0"
          >
            <span className="font-medium text-slate-100/80">{name}</span>
            <span className="text-slate-400">{formatLeaderboardValue(value)}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RuntimeMetricCard({ title, value, hint }) {
  return (
    <article className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">{value}</p>
      {hint ? <p className="mt-2 text-sm text-slate-400">{hint}</p> : null}
    </article>
  );
}

function RuntimeAlertBadge({ level }) {
  const classes = {
    high: "border-rose-400/40 bg-rose-500/15 text-rose-200",
    medium: "border-amber-400/40 bg-amber-500/15 text-amber-100",
    low: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
        classes[level] ?? classes.low
      }`}
    >
      {level ?? "low"}
    </span>
  );
}

function RuntimeAlertSection({ alerts }) {
  if (!Array.isArray(alerts) || alerts.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-3 xl:grid-cols-2">
      {alerts.map((alert, index) => (
        <article
          key={`${alert.title}-${index}`}
          className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-slate-100">{alert.title}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
                {alert.value}
              </p>
              <p className="mt-2 text-sm text-slate-400">{alert.hint}</p>
            </div>
            <RuntimeAlertBadge level={alert.level} />
          </div>
        </article>
      ))}
    </section>
  );
}

function formatCrashCase(item) {
  const route = item?.previousRoute || item?.route || "未知页面";
  const sessionLabel = item?.previousChatSessionId || item?.chatSessionId || "无会话";
  const messageCount =
    item?.previousMessageCount ?? item?.messageCount ?? 0;
  const responseLength =
    item?.previousLastResponseLength ?? item?.lastResponseLength ?? 0;
  const wecomLabel = item?.isWeCom ? "企微" : "浏览器";
  return {
    name: `${wecomLabel} · ${route}`,
    value: `${sessionLabel} · ${messageCount} 条消息 · ${responseLength} 字`
  };
}

function formatCrashTimestamp(value) {
  if (!value) {
    return "未知时间";
  }
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch (_error) {
    return String(value);
  }
}

function RuntimeCrashCard({ item }) {
  const transportLabel = item?.isWeCom ? "企微" : "浏览器";
  const inactivitySeconds = Number(item?.inactivitySeconds ?? 0);
  const metaItems = [
    ["时间", formatCrashTimestamp(item?.recordedAt)],
    ["页面", item?.route || "未知页面"],
    ["环境", `${transportLabel} / ${item?.browser || "other"}`],
    ["会话", item?.chatSessionId || "无"],
    ["对话", item?.conversationId || "无"],
    ["GPT", item?.gid || "默认"],
    ["模型", item?.selectedModel || "未记录"],
    ["消息数", `${item?.messageCount ?? 0}`],
    ["回复长度", `${item?.lastResponseLength ?? 0} 字`],
    ["附件数", `${item?.attachmentCount ?? 0}`],
    ["中断前静默", `${inactivitySeconds}s`],
    ["崩前状态", item?.busy ? "生成中" : "空闲"],
  ];

  return (
    <article className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-slate-100">
            {transportLabel} · {item?.route || "未知页面"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            runtimeSessionId: {item?.runtimeSessionId || "未记录"}
          </p>
        </div>
        <RuntimeAlertBadge level={item?.busy ? "high" : "medium"} />
      </div>
      <dl className="mt-4 grid gap-x-4 gap-y-3 md:grid-cols-2">
        {metaItems.map(([label, value]) => (
          <div key={label} className="border-b border-slate-800/70 pb-2 last:border-b-0">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </dt>
            <dd className="mt-1 text-sm text-slate-200">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function RuntimeSummarySection({ summary }) {
  const runtimeAlerts = Array.isArray(summary?.runtimeAlerts)
    ? summary.runtimeAlerts
    : [];
  const topRoutes = Array.isArray(summary?.topRoutes)
    ? summary.topRoutes.map((item) => ({
        name: item.route,
        value: `${item.count} 次`
      }))
    : [];
  const topBrowsers = Array.isArray(summary?.topBrowsers)
    ? summary.topBrowsers.map((item) => ({
        name: item.browser,
        value: `${item.count} 次`
      }))
    : [];
  const recentCrashes = Array.isArray(summary?.recentSuspectedCrashes)
    ? summary.recentSuspectedCrashes.map(formatCrashCase)
    : [];

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between rounded-soft border border-white/10 bg-panel p-4 shadow-panel">
        <div>
          <h2 className="text-base font-semibold text-slate-100">前端运行时稳定性</h2>
          <p className="mt-1 text-sm text-muted">
            来自 runtime-events.log 的日志摘要，含疑似崩溃与前端异常
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <RuntimeMetricCard
          title="疑似崩溃"
          value={String(summary?.suspectedCrashCount ?? 0)}
          hint={`相对 page_open 比例 ${summary?.suspectedCrashRate ?? "0.0%"}`}
        />
        <RuntimeMetricCard
          title="JS Error"
          value={String(summary?.jsErrorCount ?? 0)}
          hint="window.onerror"
        />
        <RuntimeMetricCard
          title="Promise Rejection"
          value={String(summary?.unhandledRejectionCount ?? 0)}
          hint="unhandledrejection"
        />
        <RuntimeMetricCard
          title="Render Error"
          value={String(summary?.reactRenderErrorCount ?? 0)}
          hint="React 错误边界捕获"
        />
        <RuntimeMetricCard
          title="企微占比"
          value={summary?.wecomCrashShare ?? "0.0%"}
          hint="最近疑似崩溃中的企微比例"
        />
      </div>

      <RuntimeAlertSection alerts={runtimeAlerts} />

      <div className="grid gap-3 lg:grid-cols-3">
        <ListCard title="高频页面" items={topRoutes} />
        <ListCard title="浏览器分布" items={topBrowsers} />
        <ListCard title="最近疑似崩溃" items={recentCrashes} />
      </div>

      {Array.isArray(summary?.recentSuspectedCrashes) &&
      summary.recentSuspectedCrashes.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {summary.recentSuspectedCrashes.map((item, index) => (
            <RuntimeCrashCard
              key={`${item.runtimeSessionId || item.chatSessionId || "crash"}-${index}`}
              item={item}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RequestsTrend({ data }) {
  return (
    <article className="h-full rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100/90">请求趋势</h3>
      </header>
      <div className="mt-6 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, left: 0, right: 0 }}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "#22d3ee", strokeDasharray: "3 3" }}
              contentStyle={{
                borderRadius: "12px",
                borderColor: "#164e63",
                backgroundColor: "#0f172a",
                color: "#e2e8f0"
              }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#22d3ee"
              strokeWidth={3}
              fill="url(#colorRequests)"
              dot={{ stroke: "#22d3ee", strokeWidth: 2, r: 4, fill: "#0f172a" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

export default function App() {
  const [timeRange, setTimeRange] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_TIME_RANGE;
    }

    return (
      window.sessionStorage.getItem(TIME_RANGE_STORAGE_KEY) ?? DEFAULT_TIME_RANGE
    );
  });
  const { data, isLoading, isError, error, isFetching } =
    useDashboardData(timeRange);
  const [cachedData, setCachedData] = useState(null);

  useEffect(() => {
    if (data) {
      setCachedData(data);
    }
  }, [data]);

  const displayData = data ?? cachedData;
  const showInitialLoader = isLoading && !displayData;
  const showInitialError = isError && !displayData;
  const showRefreshOverlay = isFetching && !!displayData;

  const metrics = displayData?.metrics ?? [];
  const requestsTrend = displayData?.requestsTrend ?? [];
  const userLeaderboard = displayData?.userLeaderboard ?? [];
  const gptsLeaderboard = displayData?.gptsLeaderboard ?? [];
  const modelLeaderboard = displayData?.modelLeaderboard ?? [];
  const requestedModelLeaderboard =
    displayData?.requestedModelLeaderboard ?? [];
  const runtimeSummary = displayData?.runtimeSummary ?? {};

  const timeRangeOptions = useMemo(
    () => [
      { value: "today", label: "今天" },
      { value: "7d", label: "过去 7 天" },
      { value: "14d", label: "过去 14 天" },
      { value: "30d", label: "过去 30 天" },
      { value: "all", label: "所有时间" }
    ],
    []
  );

  const handleTimeRangeChange = (event) => {
    const nextTimeRange = event.target.value;
    setTimeRange(nextTimeRange);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(TIME_RANGE_STORAGE_KEY, nextTimeRange);
    }
  };

  useEffect(() => {
    const isValidTimeRange = timeRangeOptions.some(
      (option) => option.value === timeRange
    );

    if (!isValidTimeRange) {
      setTimeRange(DEFAULT_TIME_RANGE);

      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          TIME_RANGE_STORAGE_KEY,
          DEFAULT_TIME_RANGE
        );
      }
    }
  }, [timeRange, timeRangeOptions]);

  if (showInitialLoader) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">正在加载数据...</p>
      </div>
    );
  }

  if (showInitialError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-rose-400">加载失败：{error.message}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-col gap-3 p-3">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr),auto]">
        <div className="flex-1 rounded-soft border border-white/10 bg-panel p-4 shadow-panel">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold tracking-wide text-slate-100">
              GPT助手 核心指标总览
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            实时追踪用户与模型调用表现
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-4 rounded-soft border border-white/10 bg-panel p-3 shadow-panel">
          <label className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="text-slate-300/80">时间范围</span>
            <div className="relative">
              <select
                value={timeRange}
                onChange={handleTimeRangeChange}
                className="h-9 appearance-none rounded-md border border-white/10 bg-slate-950/70 px-3 pr-9 text-sm font-medium text-slate-100 shadow-inner transition-colors focus:border-brand focus:ring-2 focus:ring-brand/40 focus:outline-none"
              >
                {timeRangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-500">⌄</span>
            </div>
          </label>
          <span
            className={`flex min-w-[132px] items-center gap-2 rounded-md border border-white/5 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-400 transition-opacity duration-200 ${
              isFetching ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={!isFetching}
          >
            <svg
              className="h-3.5 w-3.5 animate-spin text-brand"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-20"
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                d="M21 12a9 9 0 00-9-9"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            数据刷新中...
          </span>
        </div>
      </header>
      {isError ? (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          加载最新数据失败：{error.message}
        </p>
      ) : null}
      <main className="grid flex-1 grid-cols-1 gap-3">
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              title={metric.title}
              value={metric.value}
              hint={metric.hint}
              emphasis={metric.emphasis}
              detailLabel={metric.detailLabel}
              detailValue={metric.detailValue}
              detailEmphasis={metric.detailEmphasis}
            />
          ))}
        </section>

        <section className="grid gap-3 lg:min-h-0 lg:grid-cols-[2fr_1fr]">
          <RequestsTrend data={requestsTrend} />
          <ListCard
            title="用户排行"
            items={userLeaderboard}
            limit={15}
            scrollHeight="18.5rem"
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <ListCard title="GPTs 使用排行" items={gptsLeaderboard} />
          <ListCard title="模型使用排行" items={modelLeaderboard} />
          <ListCard
            title="模型选择占比"
            items={requestedModelLeaderboard}
          />
        </section>

        <RuntimeSummarySection summary={runtimeSummary} />
      </main>
      {showRefreshOverlay ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-950/30 backdrop-blur-sm">
          <svg
            className="h-12 w-12 animate-spin text-brand"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="opacity-20"
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M21 12a9 9 0 00-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-sm font-medium text-slate-200/90">正在刷新最新数据...</p>
        </div>
      ) : null}
    </div>
  );
}
