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
    <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      </header>
      <p className="mt-4 text-4xl font-bold text-brand">{value}</p>
      {hint ? (
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500">
          {hint}
          {emphasis ? (
            <span className="rounded-md bg-brand-light px-2 py-0.5 text-brand">
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
    <article className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <ul className="mt-4 space-y-3">
        {items.map(({ name, value }, index) => (
          <li
            key={`${name}-${index}`}
            className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-b-0 last:pb-0"
          >
            <span className="font-medium text-slate-700">{name}</span>
            <span className="text-slate-500">{value}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function RequestsTrend({ data }) {
  return (
    <article className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-lg font-semibold text-slate-800">请求趋势</h3>
      <div className="mt-6 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, left: 0, right: 0 }}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1f7ae0" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#1f7ae0" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: "#E2E8F0" }}
              tick={{ fill: "#64748b", fontSize: 12 }}
            />
            <Tooltip
              cursor={{ stroke: "#1f7ae0", strokeDasharray: "3 3" }}
              contentStyle={{ borderRadius: "12px", borderColor: "#BFDBFE" }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#1f7ae0"
              strokeWidth={3}
              fill="url(#colorRequests)"
              dot={{ stroke: "#1f7ae0", strokeWidth: 2, r: 4, fill: "#fff" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function TimeWindowCard({ info }) {
  const entries = [
    { label: "数据时间范围", value: info.range },
    { label: "峰值", value: info.peak },
    { label: "最低值", value: info.low }
  ];
  return <ListCard title="时间窗口" items={entries} />;
}

export default function App() {
  const { data, isLoading, isError, error } = useDashboardData();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-slate-500">正在加载数据...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-red-500">加载失败：{error.message}</p>
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
    <div className="mx-auto max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">ChatGemini 核心指标总览</h1>
          <p className="text-sm text-slate-500">
            实时追踪用户与模型调用表现，支持自动刷新与 WebSocket 推送。
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-brand px-4 py-1 text-sm text-white">
          数据更新 · {lastUpdatedLabel}
        </span>
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

      <section className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <RequestsTrend data={data.requestsTrend} />
        <TimeWindowCard info={data.timeWindow} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ListCard title="用户排行" items={data.userLeaderboard} />
        <ListCard title="GPTs 使用排行" items={data.gptsLeaderboard} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <ListCard title="模型使用排行" items={data.modelLeaderboard} />
        <ListCard title="监控提示" items={data.alerts} />
      </section>
    </div>
  );
}
