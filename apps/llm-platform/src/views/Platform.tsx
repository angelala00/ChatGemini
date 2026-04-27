import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { globalConfig } from "../config/global";
import { RouterComponentProps } from "../config/router";
import {
    platformUserGet,
    platformUserPatch,
    platformUserPost,
} from "../helpers/platformApi";
import ApiDocsPage from "./platform/ApiDocsPage";
import ConsolePage from "./platform/ConsolePage";
import DiagnosticsPage from "./platform/DiagnosticsPage";
import ModelMarketPage from "./platform/ModelMarketPage";
import {
    ConsoleSideMenu,
    DiagnosticsEntryRole,
    DiagnosticsRequestEntry,
    DiagnosticsRequestGroup,
    DocsPage,
    GatewayUserSummary,
    GatewayUserTokenInfo,
    GatewayUserTokenUpdateResponse,
    RankingEntry,
    TokenDiagnosticsLogsResponse,
    TokenDiagnosticsState,
    TopMenu,
    UserUsageResponse,
    UserVisibilityResponse,
} from "./platform/types";

const Platform = (props: RouterComponentProps) => {
    const { site, header } = globalConfig.title;
    const adminContact = globalConfig.support.adminContact;
    const gatewayBaseUrl =
        globalConfig.gateway.baseUrl || "请配置 REACT_APP_GATEWAY_BASE_URL";
    const userName = props.userName?.trim();
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;
    const location = useLocation();
    const navigate = useNavigate();
    const parseTopMenu = (value?: string | null): TopMenu => {
        if (value === "market" || value === "docs" || value === "console" || value === "diagnostics") {
            return value;
        }
        return "console";
    };
    const parseSideMenu = (value?: string | null): ConsoleSideMenu => {
        if (value === "usage" || value === "apikey") {
            return value;
        }
        return "apikey";
    };
    const parseDocsPage = (value?: string | null): DocsPage => {
        if (value === "claude-zhipu" || value === "gateway-api") {
            return value;
        }
        return "gateway-api";
    };
    const getMenuStateFromPath = (pathname: string) => {
        const cleanedPath = pathname.replace(/^\/+|\/+$/g, "");
        const parts = cleanedPath ? cleanedPath.split("/") : [];
        const topMenu = parseTopMenu(parts[0]);
        const sideMenu = parseSideMenu(parts[1]);
        const docsPage = parseDocsPage(parts[1]);
        return {
            topMenu,
            sideMenu: topMenu === "console" ? sideMenu : "apikey",
            docsPage: topMenu === "docs" ? docsPage : "gateway-api",
        };
    };
    const initialMenuState = getMenuStateFromPath(location.pathname);
    const [activeTopMenu, setActiveTopMenu] = useState<TopMenu>(() => initialMenuState.topMenu);
    const [activeSideMenu, setActiveSideMenu] = useState<ConsoleSideMenu>(
        () => initialMenuState.sideMenu,
    );
    const [activeDocsPage, setActiveDocsPage] = useState<DocsPage>(
        () => initialMenuState.docsPage,
    );
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
    const [usageData, setUsageData] = useState<UserUsageResponse | null>(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usageError, setUsageError] = useState<string | null>(null);
    const [usageRetryCount, setUsageRetryCount] = useState(0);
    const [usageRange, setUsageRange] = useState("7d");
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [copiedDiagnosticsPayload, setCopiedDiagnosticsPayload] = useState<string | null>(null);
    const [expandedDiagnosticsGroups, setExpandedDiagnosticsGroups] = useState<Record<string, boolean>>({});
    const [tokenUpdating, setTokenUpdating] = useState<Record<string, boolean>>({});
    const [tokenActionError, setTokenActionError] = useState<string | null>(null);
    const [diagnosticsRange, setDiagnosticsRange] = useState("24h");
    const [diagnosticsLogs, setDiagnosticsLogs] = useState<TokenDiagnosticsLogsResponse | null>(null);
    const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
    const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
    const [diagnosticsActionLoading, setDiagnosticsActionLoading] = useState<Record<string, boolean>>({});
    const [expandedApiDoc, setExpandedApiDoc] = useState<string>("GET /v1/models");

    const maskToken = (token: string, head = 6, tail = 4) => {
        const safeToken = token?.trim() ?? "";
        if (!safeToken) {
            return "";
        }
        if (safeToken.length <= head + tail) {
            return "*".repeat(Math.max(safeToken.length, head + tail));
        }
        const maskedLength = Math.max(4, safeToken.length - head - tail);
        return `${safeToken.slice(0, head)}${"*".repeat(maskedLength)}${safeToken.slice(-tail)}`;
    };
    const formatDateTime = (value?: string | null) => {
        if (!value) {
            return "-";
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            return value;
        }
        return parsed.toLocaleString("zh-CN", {
            hour12: false,
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };
    const formatDiagnosticsPayload = (payload: unknown) => {
        if (payload === null || payload === undefined) {
            return "";
        }
        if (typeof payload === "string") {
            const trimmed = payload.trim();
            if (!trimmed) {
                return "";
            }
            if (
                (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
                (trimmed.startsWith("[") && trimmed.endsWith("]"))
            ) {
                try {
                    return JSON.stringify(JSON.parse(trimmed), null, 2);
                } catch {
                    return payload;
                }
            }
            return payload;
        }
        try {
            return JSON.stringify(payload, null, 2);
        } catch {
            return String(payload);
        }
    };
    const getDiagnosticsEntryRole = (event: string): DiagnosticsEntryRole => {
        const normalized = event.trim().toLowerCase();
        if (
            normalized.includes("request") ||
            normalized.includes("input") ||
            normalized.includes("prompt") ||
            normalized.includes("received") ||
            normalized.includes("normalized")
        ) {
            return "input";
        }
        if (
            normalized.includes("response") ||
            normalized.includes("output") ||
            normalized.includes("completion") ||
            normalized.includes("result") ||
            normalized.includes("reply")
        ) {
            return "output";
        }
        return "other";
    };
    const getUsageTotals = (ranking: RankingEntry[] = []) => ({
        requests: ranking.reduce((sum, item) => sum + item.requests, 0),
        tokens: ranking.reduce((sum, item) => sum + item.tokens, 0),
    });

    const usageRanking = usageData?.ranking ?? [];
    const projectUsage = usageData?.projects ?? [];
    const usageTotals = getUsageTotals(usageRanking);
    const ownedProjects = apiKeyUser?.projects ?? [];
    const diagnosticsTokenFromQuery = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const tokenId = params.get("tokenId");
        return tokenId?.trim() || "";
    }, [location.search]);
    const userTokenLimit = apiKeyUser?.limits?.userMax ?? 0;
    const projectTokenLimit = apiKeyUser?.limits?.projectMax ?? 0;
    const userTokenCount = useMemo(
        () => (apiKeyUser?.tokens ?? []).filter((token) => token.ownerType === "user").length,
        [apiKeyUser?.tokens],
    );
    const claudeSettingsExample = `{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your_api_key",
    "ANTHROPIC_BASE_URL": "${gatewayBaseUrl}",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "模型名(强)",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "模型名(默认)",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "模型名(快)",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1
  }
}`;
    const claudeOnboardingExample = `{
  "hasCompletedOnboarding": true
}`;
    const projectTokenCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const token of apiKeyUser?.tokens ?? []) {
            if (token.ownerType !== "project" || !token.projectId) continue;
            counts[token.projectId] = (counts[token.projectId] ?? 0) + 1;
        }
        return counts;
    }, [apiKeyUser?.tokens]);
    const diagnosticsTokens = useMemo(
        () => (apiKeyUser?.tokens ?? []).filter((token) => token.diagnosticsAuthorized && token.tokenId),
        [apiKeyUser?.tokens],
    );
    const selectedDiagnosticsToken = useMemo(() => {
        if (diagnosticsTokens.length === 0) {
            return null;
        }
        if (diagnosticsTokenFromQuery) {
            const matched = diagnosticsTokens.find((token) => token.tokenId === diagnosticsTokenFromQuery);
            if (matched) {
                return matched;
            }
        }
        return diagnosticsTokens[0];
    }, [diagnosticsTokenFromQuery, diagnosticsTokens]);
    const groupedDiagnosticsLogs = useMemo<DiagnosticsRequestGroup[]>(() => {
        const groups: DiagnosticsRequestGroup[] = [];
        const groupByGatewayRequestId = new Map<string, DiagnosticsRequestGroup>();
        const getTimeValue = (value?: string | null) => {
            const parsed = new Date(value ?? "");
            return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
        };

        for (const [index, entry] of (diagnosticsLogs?.entries ?? []).entries()) {
            const gatewayRequestId = entry.gateway_request_id?.trim() || null;
            const item: DiagnosticsRequestEntry = {
                key: `${entry.timestamp}-${entry.event}-${gatewayRequestId ?? entry.request_id ?? index}`,
                role: getDiagnosticsEntryRole(entry.event),
                payloadText: formatDiagnosticsPayload(entry.payload),
                entry,
            };

            if (gatewayRequestId) {
                const existing = groupByGatewayRequestId.get(gatewayRequestId);
                if (existing) {
                    existing.entries.push(item);
                    continue;
                }
                const group: DiagnosticsRequestGroup = {
                    key: `gateway:${gatewayRequestId}`,
                    gatewayRequestId,
                    summary: entry,
                    entries: [item],
                };
                groupByGatewayRequestId.set(gatewayRequestId, group);
                groups.push(group);
                continue;
            }

            groups.push({
                key: `entry:${item.key}`,
                gatewayRequestId: null,
                summary: entry,
                entries: [item],
            });
        }

        for (const group of groups) {
            group.entries.sort(
                (a, b) => getTimeValue(a.entry.timestamp) - getTimeValue(b.entry.timestamp),
            );
            const recognizedCount = group.entries.filter((item) => item.role !== "other").length;
            if (recognizedCount === 0 && group.entries.length === 2) {
                group.entries[0].role = "input";
                group.entries[1].role = "output";
            }
            group.summary = group.entries[0]?.entry ?? group.summary;
        }

        return groups.sort(
            (a, b) => getTimeValue(b.summary.timestamp) - getTimeValue(a.summary.timestamp),
        );
    }, [diagnosticsLogs]);
    const userLimitReached = userTokenLimit > 0 && userTokenCount >= userTokenLimit;
    const groupedVisibleModels = useMemo(() => {
        const entries = visibleModels?.models ?? [];
        const groups: Record<string, typeof entries> = {};
        for (const model of entries) {
            const typeLabel = model.type?.trim() || "其他";
            if (!groups[typeLabel]) {
                groups[typeLabel] = [];
            }
            groups[typeLabel].push(model);
        }
        const orderedTypes = Object.keys(groups).sort((a, b) => {
            const aKey = a.toLowerCase();
            const bKey = b.toLowerCase();
            if (aKey === "llm" && bKey !== "llm") return -1;
            if (bKey === "llm" && aKey !== "llm") return 1;
            if (a === "其他") return 1;
            if (b === "其他") return -1;
            return a.localeCompare(b);
        });
        return orderedTypes.map((type) => ({
            type,
            models: [...groups[type]].sort((a, b) => {
                const aRank = a.is_new ? 0 : a.sunset_soon ? 2 : 1;
                const bRank = b.is_new ? 0 : b.sunset_soon ? 2 : 1;
                if (aRank !== bRank) {
                    return aRank - bRank;
                }
                return a.name.localeCompare(b.name);
            }),
        }));
    }, [visibleModels]);

    useEffect(() => {
        document.title = `Platform - ${site}`;
    }, [site]);

    useEffect(() => {
        const legacyParams = new URLSearchParams(location.search);
        const legacyTop = legacyParams.get("top");
        const legacySide = legacyParams.get("side");
        if (legacyTop || legacySide) {
            const legacyTopMenu = parseTopMenu(legacyTop);
            const legacySideMenu = parseSideMenu(legacySide);
            const legacyPath =
                legacyTopMenu === "console"
                    ? `/${legacyTopMenu}/${legacySideMenu}`
                    : `/${legacyTopMenu}`;
            navigate(legacyPath, { replace: true });
            return;
        }
        const { topMenu: nextTopMenu, sideMenu: nextSideMenu } = getMenuStateFromPath(
            location.pathname,
        );
        const { docsPage: nextDocsPage } = getMenuStateFromPath(location.pathname);
        if (nextTopMenu !== activeTopMenu) {
            setActiveTopMenu(nextTopMenu);
        }
        if (nextSideMenu !== activeSideMenu) {
            setActiveSideMenu(nextSideMenu);
        }
        if (nextDocsPage !== activeDocsPage) {
            setActiveDocsPage(nextDocsPage);
        }
    }, [location.pathname, location.search, activeTopMenu, activeSideMenu, activeDocsPage, navigate]);

    const syncPath = (
        topMenu: TopMenu,
        sideMenu: ConsoleSideMenu,
        docsPage: DocsPage,
    ) => {
        const nextPath =
            topMenu === "console"
                ? `/${topMenu}/${sideMenu}`
                : topMenu === "docs"
                    ? `/${topMenu}/${docsPage}`
                    : topMenu === "diagnostics"
                        ? "/diagnostics"
                        : `/${topMenu}`;
        navigate(nextPath, { replace: true });
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
        if (
            !(
                (activeTopMenu === "console" && activeSideMenu === "apikey") ||
                activeTopMenu === "diagnostics"
            )
        ) {
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

    const loadDiagnosticsLogs = useCallback(async () => {
        if (!selectedDiagnosticsToken?.tokenId) {
            setDiagnosticsLogs(null);
            setDiagnosticsError(null);
            return;
        }
        setDiagnosticsLoading(true);
        setDiagnosticsError(null);
        try {
            const payload = await platformUserGet<TokenDiagnosticsLogsResponse>("/diagnostics/logs", {
                params: {
                    tokenId: selectedDiagnosticsToken.tokenId,
                    range: diagnosticsRange,
                    limit: 100,
                },
            });
            setDiagnosticsLogs(payload ?? null);
        } catch (error) {
            setDiagnosticsError(error instanceof Error ? error.message : "诊断日志加载失败");
        } finally {
            setDiagnosticsLoading(false);
        }
    }, [diagnosticsRange, selectedDiagnosticsToken?.tokenId]);

    useEffect(() => {
        if (
            !(
                (activeTopMenu === "console" && activeSideMenu === "apikey") ||
                activeTopMenu === "diagnostics"
            )
        ) {
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
            const payload = await platformUserGet<UserUsageResponse>("/usage", {
                params: { range: usageRange, includeProjects: "true" },
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
        if (activeTopMenu !== "diagnostics") {
            return;
        }
        if (apiKeyLoading) {
            return;
        }
        if (!selectedDiagnosticsToken?.tokenId) {
            setDiagnosticsLogs(null);
            return;
        }
        void loadDiagnosticsLogs();
    }, [activeTopMenu, apiKeyLoading, loadDiagnosticsLogs, selectedDiagnosticsToken?.tokenId]);

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
                "/tokens",
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
                `/tokens/${token}/enabled`,
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

    const updateDiagnosticsState = async (token: GatewayUserTokenInfo, activate: boolean) => {
        if (!token.tokenId) {
            setTokenActionError("该 API Key 缺少 Key ID，无法操作调试功能");
            return;
        }
        if (diagnosticsActionLoading[token.tokenId]) {
            return;
        }
        setDiagnosticsActionLoading((prev) => ({ ...prev, [token.tokenId!]: true }));
        setTokenActionError(null);
        try {
            const payload = await platformUserPost<TokenDiagnosticsState>(
                `/diagnostics/tokens/${token.tokenId}/${activate ? "activate" : "deactivate"}`,
            );
            setApiKeyUser((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    tokens: prev.tokens.map((item) =>
                        item.tokenId === payload.tokenId
                            ? {
                                  ...item,
                                  diagnosticsAuthorized: payload.authorized,
                                  diagnosticsActive: payload.active,
                                  diagnosticsExpiresAt: payload.expiresAt ?? null,
                              }
                            : item,
                    ),
                };
            });
            if (activeTopMenu === "diagnostics") {
                await loadDiagnosticsLogs();
            }
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : "调试状态更新失败");
        } finally {
            setDiagnosticsActionLoading((prev) => ({ ...prev, [token.tokenId!]: false }));
        }
    };

    const openDiagnosticsPage = (tokenId?: string) => {
        const query = tokenId ? `?tokenId=${encodeURIComponent(tokenId)}` : "";
        navigate(`/diagnostics${query}`, { replace: true });
        setActiveTopMenu("diagnostics");
    };

    const openApiKeysPage = () => {
        setActiveTopMenu("console");
        setActiveSideMenu("apikey");
        syncPath("console", "apikey", activeDocsPage);
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

    const handleCopyDiagnosticsPayload = (key: string, payload: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = payload;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedDiagnosticsPayload(key);
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

    useEffect(() => {
        if (!copiedDiagnosticsPayload) {
            return;
        }
        const timer = window.setTimeout(() => {
            setCopiedDiagnosticsPayload(null);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [copiedDiagnosticsPayload]);

    useEffect(() => {
        setExpandedDiagnosticsGroups({});
    }, [selectedDiagnosticsToken?.tokenId, diagnosticsRange, diagnosticsLogs?.entries.length]);

    return (
        <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
            <header className="w-full border-b border-slate-200/70 bg-white/80 backdrop-blur">
                <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
                    <div className="flex flex-wrap items-center gap-8">
                        <span className="text-lg font-semibold tracking-wide text-slate-900">
                            {header}
                        </span>
                        <nav className="flex items-center gap-3 text-sm font-medium text-slate-500">
                            {(
                                activeTopMenu === "diagnostics"
                                    ? ["console", "market", "docs", "diagnostics"]
                                    : ["console", "market", "docs"]
                            ).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                        setActiveTopMenu(item as TopMenu);
                                        syncPath(item as TopMenu, activeSideMenu, activeDocsPage);
                                    }}
                                    className={`rounded-full px-4 py-2 transition ${
                                        activeTopMenu === item
                                            ? "bg-blue-800 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item === "console" && "控制台"}
                                    {item === "market" && "模型广场"}
                                    {item === "docs" && "API 文档"}
                                    {item === "diagnostics" && "诊断日志"}
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
                <ConsolePage
                    activeSideMenu={activeSideMenu}
                    activeTopMenu={activeTopMenu}
                    activeDocsPage={activeDocsPage}
                    apiKeyUser={apiKeyUser}
                    apiKeyLoading={apiKeyLoading}
                    apiKeyError={apiKeyError}
                    createTokenError={createTokenError}
                    createdTokenValue={createdTokenValue}
                    userTokenCount={userTokenCount}
                    userTokenLimit={userTokenLimit}
                    projectTokenLimit={projectTokenLimit}
                    projectTokenCounts={projectTokenCounts}
                    userLimitReached={userLimitReached}
                    copiedToken={copiedToken}
                    createTokenLoading={createTokenLoading}
                    tokenUpdating={tokenUpdating}
                    tokenActionError={tokenActionError}
                    diagnosticsActionLoading={diagnosticsActionLoading}
                    ownedProjects={ownedProjects}
                    usageRange={usageRange}
                    usageError={usageError}
                    usageLoading={usageLoading}
                    usageData={usageData}
                    usageTotals={usageTotals}
                    usageRanking={usageRanking}
                    projectUsage={projectUsage}
                    setActiveSideMenu={setActiveSideMenu}
                    setUsageRange={setUsageRange}
                    syncPath={syncPath}
                    openDiagnosticsPage={openDiagnosticsPage}
                    handleCopyToken={handleCopyToken}
                    maskToken={maskToken}
                    createToken={createToken}
                    updateTokenStatus={updateTokenStatus}
                    updateDiagnosticsState={updateDiagnosticsState}
                    getUsageTotals={getUsageTotals}
                />
            )}
            {activeTopMenu === "diagnostics" && (
                <DiagnosticsPage
                    apiKeyLoading={apiKeyLoading}
                    apiKeyError={apiKeyError}
                    tokenActionError={tokenActionError}
                    diagnosticsError={diagnosticsError}
                    diagnosticsTokens={diagnosticsTokens}
                    selectedDiagnosticsToken={selectedDiagnosticsToken}
                    diagnosticsRange={diagnosticsRange}
                    diagnosticsLogs={diagnosticsLogs}
                    diagnosticsLoading={diagnosticsLoading}
                    groupedDiagnosticsLogs={groupedDiagnosticsLogs}
                    expandedDiagnosticsGroups={expandedDiagnosticsGroups}
                    copiedDiagnosticsPayload={copiedDiagnosticsPayload}
                    setDiagnosticsRange={setDiagnosticsRange}
                    setExpandedDiagnosticsGroups={setExpandedDiagnosticsGroups}
                    openDiagnosticsPage={openDiagnosticsPage}
                    maskToken={maskToken}
                    formatDateTime={formatDateTime}
                    handleCopyDiagnosticsPayload={handleCopyDiagnosticsPayload}
                />
            )}
            {activeTopMenu === "market" && (
                <ModelMarketPage
                    modelsLoading={modelsLoading}
                    modelsError={modelsError}
                    visibleModels={visibleModels}
                    groupedVisibleModels={groupedVisibleModels}
                />
            )}
            {activeTopMenu === "docs" && (
                <ApiDocsPage
                    activeDocsPage={activeDocsPage}
                    activeSideMenu={activeSideMenu}
                    gatewayBaseUrl={gatewayBaseUrl}
                    adminContact={adminContact}
                    expandedApiDoc={expandedApiDoc}
                    claudeSettingsExample={claudeSettingsExample}
                    claudeOnboardingExample={claudeOnboardingExample}
                    setActiveDocsPage={setActiveDocsPage}
                    setExpandedApiDoc={setExpandedApiDoc}
                    syncPath={syncPath}
                    openApiKeysPage={openApiKeysPage}
                />
            )}
        </div>
    );
};

export default Platform;
