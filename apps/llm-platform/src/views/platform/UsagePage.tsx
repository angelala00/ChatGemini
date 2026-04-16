import {
    ProjectUsageSummary,
    RankingEntry,
    UserUsageResponse,
} from "./types";

interface UsageTotals {
    requests: number;
    tokens: number;
}

interface UsagePageProps {
    usageRange: string;
    usageError: string | null;
    usageLoading: boolean;
    usageData: UserUsageResponse | null;
    usageTotals: UsageTotals;
    usageRanking: RankingEntry[];
    projectUsage: ProjectUsageSummary[];
    setUsageRange: (range: string) => void;
    getUsageTotals: (ranking?: RankingEntry[]) => UsageTotals;
}

const UsagePage = ({
    usageRange,
    usageError,
    usageLoading,
    usageData,
    usageTotals,
    usageRanking,
    projectUsage,
    setUsageRange,
    getUsageTotals,
}: UsagePageProps) => (
    <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-slate-900">用量统计</h2>
        <p className="text-sm text-slate-600">
            查看你的模型调用量、请求数和排行表现。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
            {["7d", "14d"].map((range) => (
                <button
                    key={range}
                    type="button"
                    onClick={() => setUsageRange(range)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        usageRange === range
                            ? "bg-blue-800 text-white"
                            : "bg-slate-100 text-slate-600"
                    }`}
                >
                    {range === "7d" && "最近 7 天"}
                    {range === "14d" && "最近 14 天"}
                </button>
            ))}
        </div>
        {usageError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                {usageError}
            </div>
        )}
        {usageLoading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                正在加载统计数据...
            </div>
        )}
        {!usageLoading && usageData && (
            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-widest text-slate-400">
                        总请求
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-800">
                        {usageTotals.requests}
                    </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-widest text-slate-400">
                        总 Token
                    </div>
                    <div className="mt-2 text-2xl font-semibold text-slate-800">
                        {usageTotals.tokens}
                    </div>
                </div>
            </div>
        )}
        {!usageLoading && usageData && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-700">
                    模型排行
                </div>
                <div className="mt-3 space-y-2">
                    {usageRanking.map((item) => (
                        <div
                            key={item.name}
                            className="flex items-center justify-between text-sm text-slate-600"
                        >
                            <span>{item.name}</span>
                            <span>
                                {item.requests} 次 · {item.tokens} token
                            </span>
                        </div>
                    ))}
                    {usageRanking.length === 0 && (
                        <div className="text-sm text-slate-400">
                            暂无数据
                        </div>
                    )}
                </div>
            </div>
        )}
        {!usageLoading && usageData && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold text-slate-700">
                    项目用量
                </div>
                <div className="mt-3 space-y-3">
                    {projectUsage.length === 0 && (
                        <div className="text-sm text-slate-400">
                            暂无可见项目用量
                        </div>
                    )}
                    {projectUsage.map((project) => {
                        const ranking = project.usage?.ranking ?? [];
                        const totals = getUsageTotals(ranking);
                        return (
                            <div
                                key={project.id}
                                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                                <div className="text-sm font-semibold text-slate-700">
                                    {project.name}
                                </div>
                                {project.error && (
                                    <div className="mt-2 text-sm text-rose-600">
                                        {project.error}
                                    </div>
                                )}
                                {!project.error && !project.usage && (
                                    <div className="mt-2 text-sm text-slate-400">
                                        暂无数据
                                    </div>
                                )}
                                {!project.error && project.usage && (
                                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="text-xs uppercase tracking-widest text-slate-400">
                                                总请求
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-800">
                                                {totals.requests}
                                            </div>
                                        </div>
                                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                                            <div className="text-xs uppercase tracking-widest text-slate-400">
                                                总 Token
                                            </div>
                                            <div className="mt-1 text-lg font-semibold text-slate-800">
                                                {totals.tokens}
                                            </div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="text-xs uppercase tracking-widest text-slate-400">
                                                模型排行
                                            </div>
                                            <div className="mt-2 space-y-1 text-sm text-slate-600">
                                                {ranking.map((item) => (
                                                    <div
                                                        key={`${project.id}-${item.name}`}
                                                        className="flex items-center justify-between"
                                                    >
                                                        <span>{item.name}</span>
                                                        <span>
                                                            {item.requests} 次 · {item.tokens} token
                                                        </span>
                                                    </div>
                                                ))}
                                                {ranking.length === 0 && (
                                                    <div className="text-sm text-slate-400">
                                                        暂无数据
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        )}
    </div>
);

export default UsagePage;
