import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import {
    platformUserGet,
    platformUserPatch,
    platformUserPost,
} from "../helpers/platformApi";

interface GatewayUserTokenInfo {
    token: string;
    enabled: boolean;
    ownerType: "user" | "project";
    projectId?: string;
    projectName?: string;
}

interface GatewayUserTokenUpdateResponse {
    token: string;
    enabled: boolean;
}

interface GatewayUserSummary {
    name: string;
    enabled: boolean;
    isAdmin: boolean;
    tokenCount: number;
    tokens: GatewayUserTokenInfo[];
    projects?: Array<{
        id: string;
        name: string;
        department?: string;
    }>;
    limits?: {
        userMax: number;
        projectMax: number;
    };
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
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;
    const [searchParams, setSearchParams] = useSearchParams();
    const parseTopMenu = (value?: string | null): "console" | "market" | "docs" => {
        if (value === "market" || value === "docs" || value === "console") {
            return value;
        }
        return "console";
    };
    const parseSideMenu = (value?: string | null): "apikey" | "usage" => {
        if (value === "usage" || value === "apikey") {
            return value;
        }
        return "apikey";
    };
    const [activeTopMenu, setActiveTopMenu] = useState<
        "console" | "market" | "docs"
    >(() => parseTopMenu(searchParams.get("top")));
    const [activeSideMenu, setActiveSideMenu] = useState<
        "apikey" | "usage"
    >(() => parseSideMenu(searchParams.get("side")));
    const displayName = useMemo(() => userName || "User", [userName]);
    const [visibleModels, setVisibleModels] = useState<UserVisibilityResponse | null>(null);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [modelsRetryCount, setModelsRetryCount] = useState(0);
    const [apiKeyUser, setApiKeyUser] = useState<GatewayUserSummary | null>(null);
    const [apiKeyLoading, setApiKeyLoading] = useState(false);
    const [apiKeyError, setApiKeyError] = useState<string | null>(null);
    const [apiKeyRetryCount, setApiKeyRetryCount] = useState(0);
    const [createTokenLoading, setCreateTokenLoading] = useState<Record<string, boolean>>({});
    const [createTokenError, setCreateTokenError] = useState<string | null>(null);
    const [createdTokenValue, setCreatedTokenValue] = useState<string | null>(null);
    const [usageData, setUsageData] = useState<UserModelRankingResponse | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);
    const [usageRetryCount, setUsageRetryCount] = useState(0);
    const [usageRange, setUsageRange] = useState("7d");
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [tokenUpdating, setTokenUpdating] = useState<Record<string, boolean>>({});
    const [tokenActionError, setTokenActionError] = useState<string | null>(null);
    const usageRanking = usageData?.ranking ?? [];
    const ownedProjects = apiKeyUser?.projects ?? [];
    const userTokenLimit = apiKeyUser?.limits?.userMax ?? 0;
    const projectTokenLimit = apiKeyUser?.limits?.projectMax ?? 0;
    const userTokenCount = useMemo(
        () => (apiKeyUser?.tokens ?? []).filter((token) => token.ownerType === "user").length,
        [apiKeyUser?.tokens],
    );
    const projectTokenCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const token of apiKeyUser?.tokens ?? []) {
            if (token.ownerType !== "project" || !token.projectId) continue;
            counts[token.projectId] = (counts[token.projectId] ?? 0) + 1;
        }
        return counts;
    }, [apiKeyUser?.tokens]);
    const userLimitReached = userTokenLimit > 0 && userTokenCount >= userTokenLimit;

    useEffect(() => {
        document.title = `Platform - ${site}`;
    }, [site]);

    useEffect(() => {
        const nextTopMenu = parseTopMenu(searchParams.get("top"));
        const nextSideMenu = parseSideMenu(searchParams.get("side"));
        if (nextTopMenu !== activeTopMenu) {
            setActiveTopMenu(nextTopMenu);
        }
        if (nextSideMenu !== activeSideMenu) {
            setActiveSideMenu(nextSideMenu);
        }
    }, [searchParams, activeTopMenu, activeSideMenu]);

    const syncSearchParams = (
        topMenu: "console" | "market" | "docs",
        sideMenu: "apikey" | "usage",
    ) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("top", topMenu);
        nextParams.set("side", sideMenu);
        setSearchParams(nextParams, { replace: true });
    };

    useEffect(() => {
        if (activeTopMenu !== "market") {
            return;
        }
        setModelsRetryCount(0);
        setModelsError(null);
    }, [activeTopMenu]);

    useEffect(() => {
        if (activeTopMenu !== "market" || modelsLoading || visibleModels) {
            return;
        }
        if (modelsRetryCount >= MAX_RETRIES) {
            return;
        }
        const loadModels = async () => {
            setModelsLoading(true);
            setModelsError(null);
            try {
                const payload = await platformUserGet<UserVisibilityResponse>("/visibility");
                setVisibleModels(payload);
                setModelsRetryCount(0);
            } catch (error) {
                setModelsError(error instanceof Error ? error.message : "模型列表加载失败");
                setModelsRetryCount((retryCount) => retryCount + 1);
            } finally {
                setModelsLoading(false);
            }
        };
        const timer = window.setTimeout(
            loadModels,
            modelsRetryCount === 0 ? 0 : RETRY_DELAY_MS,
        );
        return () => window.clearTimeout(timer);
    }, [activeTopMenu, modelsLoading, modelsRetryCount, visibleModels, MAX_RETRIES, RETRY_DELAY_MS]);

    useEffect(() => {
        if (activeTopMenu !== "console" || activeSideMenu !== "apikey") {
            return;
        }
        setApiKeyRetryCount(0);
        setApiKeyError(null);
        setCreatedTokenValue(null);
    }, [activeSideMenu, activeTopMenu]);

    const loadApiKeys = useCallback(async () => {
        setApiKeyLoading(true);
        setApiKeyError(null);
        try {
            const payload = await platformUserGet<GatewayUserSummary>("/api-keys");
            setApiKeyUser(payload ?? null);
            setApiKeyRetryCount(0);
        } catch (error) {
            setApiKeyError(error instanceof Error ? error.message : "API Keys加载失败");
            setApiKeyRetryCount((retryCount) => retryCount + 1);
        } finally {
            setApiKeyLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeTopMenu !== "console" || activeSideMenu !== "apikey") {
            return;
        }
        if (apiKeyLoading || apiKeyUser) {
            return;
        }
        if (apiKeyRetryCount >= MAX_RETRIES) {
            return;
        }
        const timer = window.setTimeout(
            loadApiKeys,
            apiKeyRetryCount === 0 ? 0 : RETRY_DELAY_MS,
        );
        return () => window.clearTimeout(timer);
    }, [
        activeSideMenu,
        activeTopMenu,
        apiKeyLoading,
        apiKeyRetryCount,
        apiKeyUser,
        loadApiKeys,
        MAX_RETRIES,
        RETRY_DELAY_MS,
    ]);

    const loadUsage = useCallback(async () => {
        setUsageLoading(true);
        setUsageError(null);
        try {
            const payload = await platformUserGet<UserModelRankingResponse>("/usage", {
                params: { range: usageRange },
            });
            setUsageData(payload);
            setUsageRetryCount(0);
        } catch (error) {
            setUsageError(error instanceof Error ? error.message : "用量统计加载失败");
            setUsageRetryCount((retryCount) => retryCount + 1);
        } finally {
            setUsageLoading(false);
        }
    }, [usageRange]);

    useEffect(() => {
        if (activeTopMenu !== "console" || activeSideMenu !== "usage") {
            return;
        }
        if (usageLoading || usageData) {
            return;
        }
        if (usageRetryCount >= MAX_RETRIES) {
            return;
        }
        const timer = window.setTimeout(
            loadUsage,
            usageRetryCount === 0 ? 0 : RETRY_DELAY_MS,
        );
        return () => window.clearTimeout(timer);
    }, [
        activeTopMenu,
        activeSideMenu,
        loadUsage,
        usageLoading,
        usageRetryCount,
        usageData,
        MAX_RETRIES,
        RETRY_DELAY_MS,
    ]);

    useEffect(() => {
        if (activeSideMenu !== "usage") {
            return;
        }
        setUsageRetryCount(0);
        setUsageError(null);
        setUsageData(null);
    }, [activeSideMenu, usageRange]);

    const createToken = async (ownerType: "user" | "project", projectId?: string) => {
        const createKey = ownerType === "project" ? `project:${projectId ?? ""}` : "user";
        if (createTokenLoading[createKey]) {
            return;
        }
        setCreateTokenLoading((prev) => ({ ...prev, [createKey]: true }));
        setCreateTokenError(null);
        try {
            const payload = await platformUserPost<{ token?: string }>(
                "/api-keys",
                ownerType === "project" ? { json: { ownerType, projectId } } : { json: { ownerType } },
            );
            await loadApiKeys();
            setCreatedTokenValue(payload?.token ?? null);
        } catch (error) {
            setCreateTokenError(error instanceof Error ? error.message : "创建 API Key 失败");
        } finally {
            setCreateTokenLoading((prev) => ({ ...prev, [createKey]: false }));
        }
    };

    const updateTokenStatus = async (token: string, enabled: boolean) => {
        if (tokenUpdating[token]) {
            return;
        }
        setTokenUpdating((prev) => ({ ...prev, [token]: true }));
        setTokenActionError(null);
        try {
            const payload = await platformUserPatch<GatewayUserTokenUpdateResponse>(
                `/api-keys/${token}`,
                { json: { enabled } },
            );
            setApiKeyUser((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    tokens: prev.tokens.map((item) =>
                        item.token === payload.token ? { ...item, enabled: payload.enabled } : item,
                    ),
                };
            });
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : "Token 状态更新失败");
        } finally {
            setTokenUpdating((prev) => ({ ...prev, [token]: false }));
        }
    };

    const handleCopyToken = (token: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = token;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedToken(token);
    };

    useEffect(() => {
        if (!copiedToken) {
            return;
        }
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
                            LLM Platform
                        </span>
                        <nav className="flex items-center gap-3 text-sm font-medium text-slate-500">
                            {["console", "market", "docs"].map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                        setActiveTopMenu(item as "console" | "market" | "docs");
                                        syncSearchParams(item as "console" | "market" | "docs", activeSideMenu);
                                    }}
                                    className={`rounded-full px-4 py-2 transition ${
                                        activeTopMenu === item
                                            ? "bg-slate-900 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item === "console" && "控制台"}
                                    {item === "market" && "模型广场"}
                                    {item === "docs" && "API 文档"}
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                            {displayName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-slate-400">
                                当前账号
                            </div>
                            <div className="text-sm font-semibold text-slate-700">
                                {displayName}
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            {activeTopMenu === "console" && (
                <div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8">
                    <aside className="w-full max-w-[220px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                            控制台
                        </div>
                        <div className="mt-4 flex flex-col gap-2 text-sm font-medium text-slate-600">
                            {["apikey", "usage"].map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                        setActiveSideMenu(item as "apikey" | "usage");
                                        syncSearchParams(activeTopMenu, item as "apikey" | "usage");
                                    }}
                                    className={`rounded-xl px-3 py-2 text-left transition ${
                                        activeSideMenu === item
                                            ? "bg-slate-900 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item === "apikey" && "API Keys"}
                                    {item === "usage" && "用量统计"}
                                </button>
                            ))}
                        </div>
                    </aside>
                    <main className="flex-1 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        {activeSideMenu === "apikey" && (
                            <div className="flex flex-col gap-3">
                                <h2 className="text-xl font-semibold text-slate-900">API Keys</h2>
                                <p className="text-sm text-slate-600">
                                    管理你的 API Keys、启用/禁用状态以及额度。
                                </p>
                                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-sm text-slate-500">
                                        可用额度：用户 {userTokenCount}/{userTokenLimit || "-"}
                                        ，项目 {Object.keys(projectTokenCounts).length}/{projectTokenLimit || "-"}
                                    </div>
                                    <button
                                        type="button"
                                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600"
                                        onClick={loadApiKeys}
                                        disabled={apiKeyLoading}
                                    >
                                        {apiKeyLoading ? "刷新中..." : "刷新"}
                                    </button>
                                </div>
                                {apiKeyError && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                        {apiKeyError}
                                    </div>
                                )}
                                {createTokenError && (
                                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                        {createTokenError}
                                    </div>
                                )}
                                {createdTokenValue && (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <span>新创建的 Token：</span>
                                            <button
                                                type="button"
                                                className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-700 transition hover:border-emerald-300"
                                                onClick={() => handleCopyToken(createdTokenValue)}
                                            >
                                                {copiedToken === createdTokenValue ? "已复制" : "复制"}
                                            </button>
                                        </div>
                                        <div className="mt-2 rounded-lg bg-white px-3 py-2 font-mono text-xs text-emerald-800">
                                            {createdTokenValue}
                                        </div>
                                    </div>
                                )}
                                <div className="mt-6 flex flex-col gap-4">
                                    {apiKeyLoading && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                            正在加载 API Keys...
                                        </div>
                                    )}
                                    {!apiKeyLoading && apiKeyUser && (
                                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                                                    <tr>
                                                        <th className="px-4 py-3">API Keys</th>
                                                        <th className="px-4 py-3">归属</th>
                                                        <th className="px-4 py-3">状态</th>
                                                        <th className="px-4 py-3">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {apiKeyUser.tokens.map((token) => (
                                                        <tr key={token.token} className="border-t border-slate-100">
                                                            <td className="px-4 py-3 text-slate-600">
                                                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                                                                    {token.token}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600">
                                                                {token.ownerType === "project"
                                                                    ? `项目 · ${token.projectName ?? token.projectId ?? ""}`
                                                                    : "个人"}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600">
                                                                {token.enabled ? "启用" : "禁用"}
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-600">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="rounded-full border border-slate-200 px-2 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                                                        onClick={() => handleCopyToken(token.token)}
                                                                    >
                                                                        {copiedToken === token.token ? "已复制" : "复制"}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                                                                            token.enabled
                                                                                ? "border border-rose-200 text-rose-600 hover:border-rose-300"
                                                                                : "border border-emerald-200 text-emerald-600 hover:border-emerald-300"
                                                                        }`}
                                                                        onClick={() => updateTokenStatus(token.token, !token.enabled)}
                                                                        disabled={tokenUpdating[token.token]}
                                                                    >
                                                                        {token.enabled ? "禁用" : "启用"}
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {!apiKeyLoading && apiKeyUser && apiKeyUser.tokens.length === 0 && (
                                        <div className="px-4 py-6 text-center text-sm text-slate-400">
                                            暂无 API Keys
                                        </div>
                                    )}
                                </div>
                                <div className="mt-6 flex flex-col gap-4">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-slate-800">
                                                    创建个人 Token
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    已创建 {userTokenCount}/{userTokenLimit || "-"}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => createToken("user")}
                                                disabled={
                                                    createTokenLoading.user || userLimitReached
                                                }
                                                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                                                    createTokenLoading.user || userLimitReached
                                                        ? "bg-slate-100 text-slate-400"
                                                        : "bg-slate-900 text-white hover:bg-slate-800"
                                                }`}
                                            >
                                                {createTokenLoading.user
                                                    ? "创建中..."
                                                    : userLimitReached
                                                        ? "额度已满"
                                                        : "创建 Token"}
                                            </button>
                                        </div>
                                    </div>
                                    {ownedProjects.length > 0 ? (
                                        ownedProjects.map((project) => (
                                            <div
                                                key={project.id}
                                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-800">
                                                            {project.name}
                                                        </div>
                                                        <div className="text-xs text-slate-500">
                                                            {project.department ?? "未填写部门"}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                                                            createTokenLoading[`project:${project.id}`] ||
                                                            (projectTokenLimit > 0 &&
                                                                (projectTokenCounts[project.id] ?? 0) >= projectTokenLimit)
                                                                ? "bg-slate-100 text-slate-400"
                                                                : "bg-slate-900 text-white hover:bg-slate-800"
                                                        }`}
                                                        onClick={() => createToken("project", project.id)}
                                                        disabled={
                                                            createTokenLoading[`project:${project.id}`] ||
                                                            (projectTokenLimit > 0 &&
                                                                (projectTokenCounts[project.id] ?? 0) >= projectTokenLimit)
                                                        }
                                                    >
                                                        {createTokenLoading[`project:${project.id}`]
                                                            ? "创建中..."
                                                            : projectTokenLimit > 0 &&
                                                              (projectTokenCounts[project.id] ?? 0) >= projectTokenLimit
                                                                ? "额度已满"
                                                                : "创建 Token"}
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                            暂无项目可创建 Token
                                        </div>
                                    )}
                                    {tokenActionError && (
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                            {tokenActionError}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {activeSideMenu === "usage" && (
                            <div className="flex flex-col gap-3">
                                <h2 className="text-xl font-semibold text-slate-900">用量统计</h2>
                                <p className="text-sm text-slate-600">
                                    查看你的模型调用量、请求数和排行表现。
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {["7d", "30d", "90d"].map((range) => (
                                        <button
                                            key={range}
                                            type="button"
                                            onClick={() => setUsageRange(range)}
                                            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                                                usageRange === range
                                                    ? "bg-slate-900 text-white"
                                                    : "bg-slate-100 text-slate-600"
                                            }`}
                                        >
                                            {range === "7d" && "最近 7 天"}
                                            {range === "30d" && "最近 30 天"}
                                            {range === "90d" && "最近 90 天"}
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
                                                {usageData.ranking.reduce((sum, item) => sum + item.requests, 0)}
                                            </div>
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="text-xs uppercase tracking-widest text-slate-400">
                                                总 Token
                                            </div>
                                            <div className="mt-2 text-2xl font-semibold text-slate-800">
                                                {usageData.ranking.reduce((sum, item) => sum + item.tokens, 0)}
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
                            </div>
                        )}
                    </main>
                </div>
            )}
            {activeTopMenu === "market" && (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <h2 className="text-xl font-semibold">模型广场</h2>
                        <p className="mt-3 text-sm text-slate-600">
                            查看你的可见模型清单。
                        </p>
                        <div className="mt-6 flex flex-col gap-4">
                            {modelsLoading && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                    正在加载模型...
                                </div>
                            )}
                            {modelsError && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                                    {modelsError}
                                </div>
                            )}
                            {!modelsLoading && visibleModels && (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {visibleModels.models.map((model) => (
                                        <div
                                            key={model.name}
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                        >
                                            <div className="text-sm font-semibold text-slate-800">
                                                {model.name}
                                            </div>
                                            <div className="mt-2 text-xs text-slate-500">
                                                {model.backends.join(" · ")}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!modelsLoading && visibleModels && visibleModels.models.length === 0 && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                    暂无可用模型
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {activeTopMenu === "docs" && (
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <h2 className="text-xl font-semibold">API文档</h2>
                        <p className="mt-3 text-sm text-slate-600">
                            访问内部 API 文档或接入指南。
                        </p>
                        <div className="mt-4 text-sm text-slate-500">
                            请联系管理员获取最新文档地址。
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Platform;
