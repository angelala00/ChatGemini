import { useEffect, useMemo, useState } from "react";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import { platformUserGet } from "../helpers/platformApi";

interface GatewayUserTokenInfo {
    token: string;
    enabled: boolean;
    roles: string[];
    isAdmin: boolean;
    restrictToConfiguredModels: boolean;
}

interface GatewayUserSummary {
    name: string;
    enabled: boolean;
    isAdmin: boolean;
    tokenCount: number;
    tokens: GatewayUserTokenInfo[];
}

interface RankingEntry {
    name: string;
    requests: number;
    tokens: number;
    progress: number;
}

interface UserVisibilityResponse {
    user: string;
    models: Array<{
        name: string;
        backends: string[];
    }>;
}

interface UserModelRankingResponse {
    user: string;
    range: string;
    generatedAt: string;
    limit: number;
    ranking: RankingEntry[];
}

const Platform = (props: RouterComponentProps) => {
    const { site } = globalConfig.title;
    const userName = props.userName?.trim();
    const [activeTopMenu, setActiveTopMenu] = useState<
        "console" | "market" | "docs"
    >("console");
    const [activeSideMenu, setActiveSideMenu] = useState<
        "apikey" | "usage"
    >("apikey");
    const displayName = useMemo(() => userName || "User", [userName]);
    const [visibleModels, setVisibleModels] = useState<UserVisibilityResponse | null>(null);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [apiKeyUser, setApiKeyUser] = useState<GatewayUserSummary | null>(null);
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [usageData, setUsageData] = useState<UserModelRankingResponse | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);
    const [usageRange, setUsageRange] = useState("7d");
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    useEffect(() => {
        document.title = `Platform - ${site}`;
    }, [site]);

    useEffect(() => {
        if (activeTopMenu !== "market" || modelsLoading || visibleModels) {
            return;
        }
        const loadModels = async () => {
            setModelsLoading(true);
            setModelsError(null);
            try {
                const payload = await platformUserGet<UserVisibilityResponse>("/visibility");
                setVisibleModels(payload);
            } catch (error) {
                setModelsError(error instanceof Error ? error.message : "模型列表加载失败");
            } finally {
                setModelsLoading(false);
            }
        };
        loadModels();
    }, [activeTopMenu, modelsLoading, visibleModels]);

    useEffect(() => {
        if (activeTopMenu !== "console" || activeSideMenu !== "apikey") {
            return;
        }
        if (apiKeyLoading || apiKeyUser) {
            return;
        }
        const loadApiKeys = async () => {
            setApiKeyLoading(true);
            setApiKeyError(null);
            try {
                const payload = await platformUserGet<GatewayUserSummary>("/api-keys");
                setApiKeyUser(payload ?? null);
            } catch (error) {
                setApiKeyError(error instanceof Error ? error.message : "API Keys加载失败");
            } finally {
                setApiKeyLoading(false);
            }
        };
        loadApiKeys();
    }, [activeSideMenu, activeTopMenu, apiKeyLoading, apiKeyUser]);

    useEffect(() => {
        if (activeTopMenu !== "console" || activeSideMenu !== "usage") {
            return;
        }
        if (usageLoading) {
            return;
        }
        const loadUsage = async () => {
            setUsageLoading(true);
            setUsageError(null);
            try {
                const payload = await platformUserGet<UserModelRankingResponse>("/usage", {
                    params: { range: usageRange, limit: 10 },
                });
                setUsageData(payload);
            } catch (error) {
                setUsageError(error instanceof Error ? error.message : "用量统计加载失败");
            } finally {
                setUsageLoading(false);
            }
        };
        loadUsage();
    }, [activeSideMenu, activeTopMenu, usageLoading, usageRange]);

    const maskToken = (token: string) => {
        if (!token) return "";
        if (token.length <= 10) return token;
        return `${token.slice(0, 4)}...${token.slice(-4)}`;
    };

    const copyToken = async (token: string) => {
        if (!token) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(token);
                setCopiedToken(token);
                return;
            }
        } catch (error) {
            console.warn("clipboard api failed", error);
        }
        const textArea = document.createElement("textarea");
        textArea.value = token;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedToken(token);
    };

    useEffect(() => {
        if (!copiedToken) return;
        const timer = window.setTimeout(() => {
            setCopiedToken(null);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [copiedToken]);

    return (
        <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
            <header className="w-full border-b border-slate-200/70 bg-white/80 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
                    <div className="flex flex-wrap items-center gap-8">
                        <span className="text-lg font-semibold tracking-wide text-slate-900">
                            我联大模型
                        </span>
                        <nav className="flex items-center gap-3 text-sm font-medium text-slate-500">
                            <button
                                type="button"
                                onClick={() => setActiveTopMenu("console")}
                                className={`rounded-full px-4 py-2 transition ${
                                    activeTopMenu === "console"
                                        ? "bg-blue-700 text-white"
                                        : "hover:bg-slate-100 hover:text-slate-700"
                                }`}
                            >
                                控制台
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTopMenu("market")}
                                className={`rounded-full px-4 py-2 transition ${
                                    activeTopMenu === "market"
                                        ? "bg-blue-700 text-white"
                                        : "hover:bg-slate-100 hover:text-slate-700"
                                }`}
                            >
                                模型广场
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTopMenu("docs")}
                                className={`rounded-full px-4 py-2 transition ${
                                    activeTopMenu === "docs"
                                        ? "bg-blue-700 text-white"
                                        : "hover:bg-slate-100 hover:text-slate-700"
                                }`}
                            >
                                API文档
                            </button>
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                            {displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-slate-400">
                                Signed in
                            </div>
                            <div className="text-sm font-semibold text-slate-700">
                                {displayName}
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {activeTopMenu === "console" ? (
                <div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8">
                    <aside className="w-full max-w-[220px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                            菜单
                        </div>
                        <div className="mt-4 flex flex-col gap-2 text-sm font-medium text-slate-600">
                            <button
                                type="button"
                                onClick={() => setActiveSideMenu("apikey")}
                                className={`rounded-xl px-3 py-2 text-left transition ${
                                    activeSideMenu === "apikey"
                                        ? "bg-blue-700 text-white"
                                        : "hover:bg-slate-100"
                                }`}
                            >
                                API Keys管理
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveSideMenu("usage")}
                                className={`rounded-xl px-3 py-2 text-left transition ${
                                    activeSideMenu === "usage"
                                        ? "bg-blue-700 text-white"
                                        : "hover:bg-slate-100"
                                }`}
                            >
                                用量统计
                            </button>
                        </div>
                    </aside>

                    <main className="flex-1 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <div className="flex flex-col gap-3">
                            <h2 className="text-xl font-semibold text-slate-900">
                                {activeSideMenu === "apikey" && "API Keys管理"}
                                {activeSideMenu === "usage" && "用量统计"}
                            </h2>
                            <p className="text-sm text-slate-600">
                                {activeSideMenu === "usage" && ""}
                            </p>
                        </div>
                        {activeSideMenu === "usage" && (
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="text-sm text-slate-500">
                                    统计区间
                                </div>
                                <select
                                    value={usageRange}
                                    onChange={(event) => {
                                        setUsageData(null);
                                        setUsageRange(event.target.value);
                                    }}
                                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
                                >
                                    <option value="1h">最近 1 小时</option>
                                    <option value="6h">最近 6 小时</option>
                                    <option value="24h">最近 24 小时</option>
                                    <option value="7d">最近 7 天</option>
                                    <option value="14d">最近 14 天</option>
                                </select>
                            </div>
                        )}
                        {activeSideMenu === "apikey" && (
                            <div className="mt-6 flex flex-col gap-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        disabled
                                        className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400 opacity-70"
                                    >
                                        新建 API Key（待接入）
                                    </button>
                                </div>
                                {apiKeyLoading && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                        正在加载 API Keys...
                                    </div>
                                )}
                                {apiKeyError && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                        {apiKeyError}
                                    </div>
                                )}
                                {!apiKeyLoading && !apiKeyError && (
                                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                                                <tr>
                                                    <th className="px-4 py-3">API Keys</th>
                                                    <th className="px-4 py-3">状态</th>
                                                    <th className="px-4 py-3">操作</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {apiKeyUser && (
                                                    <tr
                                                        key={apiKeyUser.name}
                                                        className="border-t border-slate-100"
                                                    >
                                                        <td className="px-4 py-3 text-slate-600">
                                                            <div className="flex flex-col gap-1">
                                                                {apiKeyUser.tokens.map((token) => (
                                                                    <div
                                                                        key={token.token}
                                                                        className="flex flex-wrap items-center gap-2"
                                                                    >
                                                                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                                                                            {maskToken(token.token)}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600">
                                                            {apiKeyUser.enabled ? "启用" : "禁用"}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-600">
                                                            <div className="flex flex-col gap-2">
                                                                {apiKeyUser.tokens.map((token) => (
                                                                    <button
                                                                        key={`${token.token}-copy`}
                                                                        type="button"
                                                                        onClick={() => copyToken(token.token)}
                                                                        className="w-fit self-start rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                                                    >
                                                                        {copiedToken === token.token ? "已复制" : "复制"}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                                {!apiKeyUser && (
                                                    <tr>
                                                        <td
                                                            colSpan={3}
                                                            className="px-4 py-6 text-center text-sm text-slate-400"
                                                        >
                                                            暂无 API Keys 数据
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeSideMenu === "usage" && (
                            <div className="mt-6 flex flex-col gap-4">
                                {usageLoading && !usageData && !usageError && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                        正在加载用量统计...
                                    </div>
                                )}
                                {usageError && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                        {usageError}
                                    </div>
                                )}
                                {usageData && (
                                    <div className="flex flex-col gap-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs uppercase tracking-widest text-slate-400">
                                                    总请求
                                                </div>
                                                <div className="mt-2 text-2xl font-semibold text-slate-800">
                                                    {usageData.ranking.reduce(
                                                        (total, item) => total + item.requests,
                                                        0,
                                                    )}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs uppercase tracking-widest text-slate-400">
                                                    总 Tokens
                                                </div>
                                                <div className="mt-2 text-2xl font-semibold text-slate-800">
                                                    {usageData.ranking.reduce(
                                                        (total, item) => total + item.tokens,
                                                        0,
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <div className="text-sm font-semibold text-slate-700">
                                                我的模型用量
                                            </div>
                                            <div className="mt-3 space-y-2">
                                                {usageData.ranking.map((item) => (
                                                    <div
                                                        key={item.name}
                                                        className="flex items-center justify-between text-sm text-slate-600"
                                                    >
                                                        <span>{item.name}</span>
                                                        <span>
                                                            {item.requests} 次 · {item.tokens} tokens
                                                        </span>
                                                    </div>
                                                ))}
                                                {!usageData.ranking.length && (
                                                    <div className="text-sm text-slate-400">
                                                        暂无用量数据
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>
                </div>
            ) : activeTopMenu === "market" ? (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <h2 className="text-xl font-semibold">模型广场</h2>
                        <p className="mt-3 text-sm text-slate-600">
                            在这里展示模型列表、推荐与快速入口。
                        </p>
                        <div className="mt-6 flex flex-col gap-4">
                            {modelsLoading && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                    正在加载模型列表...
                                </div>
                            )}
                            {modelsError && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                    {modelsError}
                                </div>
                            )}
                            {!modelsLoading && !modelsError && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {(visibleModels?.models ?? []).map((model) => (
                                        <div
                                            key={model.name}
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                        >
                                            <div className="text-sm font-semibold text-slate-800">
                                                {model.name}
                                            </div>
                                        </div>
                                    ))}
                                    {!visibleModels?.models?.length && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                                            暂无模型数据
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <h2 className="text-xl font-semibold">API文档</h2>
                        <p className="mt-3 text-sm text-slate-600">
                            这里可以接入你的 API 文档内容或跳转链接。
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Platform;
