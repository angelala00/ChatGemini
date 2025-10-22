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
            {detailValue ? (
              <span className="text-sm font-semibold text-slate-100">{detailValue}</span>
            ) : null}
            {detailEmphasis ? (
              <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                {detailEmphasis}
              </span>
            ) : null}
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
