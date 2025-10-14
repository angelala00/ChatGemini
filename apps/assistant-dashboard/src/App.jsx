import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { useDashboardData } from "./hooks/useDashboardData";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import zhCN from "date-fns/locale/zh-CN";

function MetricCard({ title, value, hint, emphasis }) {
  return (
    <article className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100/90">{title}</h3>
      </header>
      <p className="mt-5 text-4xl font-semibold tracking-tight text-brand">{value}</p>
      {hint ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-400">
          {hint}
          {emphasis ? (
            <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
              {emphasis}
            </span>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}

function ListCard({ title, items }) {
  return (
    <article className="h-full rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <h3 className="text-base font-semibold text-slate-100/90">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map(({ name, value }, index) => (
          <li
            key={`${name}-${index}`}
            className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-sm text-slate-300 last:border-b-0 last:pb-0"
          >
            <span className="font-medium text-slate-100/80">{name}</span>
            <span className="text-slate-400">{value}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RequestsTrend({ data, rangeLabel }) {
  return (
    <article className="h-full rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-[0_20px_45px_-30px_rgba(15,23,42,1)] backdrop-blur">
      <header className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-100/90">请求趋势</h3>
        {rangeLabel ? (
          <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
            {rangeLabel}
          </span>
        ) : null}
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
  const { data, isLoading, isError, error } = useDashboardData();
  const [timeRange, setTimeRange] = useState("14d");

  const timeRangeOptions = useMemo(
    () => [
      { value: "7d", label: "过去 7 天" },
      { value: "14d", label: "过去 14 天" },
      { value: "30d", label: "过去 30 天" }
    ],
    []
  );

  const activeRange = useMemo(
    () => timeRangeOptions.find((option) => option.value === timeRange),
    [timeRange, timeRangeOptions]
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">正在加载数据...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-rose-400">加载失败：{error.message}</p>
      </div>
    );
  }

  const lastUpdatedLabel = data?.lastUpdated
    ? formatDistanceToNowStrict(parseISO(data.lastUpdated), {
        locale: zhCN,
        addSuffix: true
      })
    : "--";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900 px-6 py-10 text-slate-200">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-100">
              ChatGemini 核心指标总览
            </h1>
            <p className="text-sm text-slate-400">
              实时追踪用户与模型调用表现，支持自动刷新与 WebSocket 推送。
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            <label className="flex items-center gap-3 rounded-full border border-slate-800/80 bg-slate-900/80 px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-400">
              <span>时间范围</span>
              <div className="relative">
                <select
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  className="appearance-none rounded-md border border-slate-800/60 bg-slate-900/80 px-3 py-1 text-sm font-medium text-slate-100 focus:border-brand focus:outline-none"
                >
                  {timeRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-slate-500">⌄</span>
              </div>
            </label>
            <span className="inline-flex items-center rounded-full bg-brand/20 px-4 py-1 text-sm font-medium text-brand">
              数据更新 · {lastUpdatedLabel}
            </span>
          </div>
        </header>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {data.metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              title={metric.title}
              value={metric.value}
              hint={metric.hint}
              emphasis={metric.emphasis}
            />
          ))}
        </section>

        <section className="mt-6">
          <RequestsTrend
            data={data.requestsTrend}
            rangeLabel={activeRange?.label ?? ""}
          />
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          <ListCard title="用户排行" items={data.userLeaderboard} />
          <ListCard title="GPTs 使用排行" items={data.gptsLeaderboard} />
        </section>

        <section className="mt-6 grid gap-4">
          <ListCard title="模型使用排行" items={data.modelLeaderboard} />
        </section>
      </div>
    </div>
  );
}
