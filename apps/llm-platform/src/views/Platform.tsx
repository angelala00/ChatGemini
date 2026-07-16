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
    DiagnosticsParsedToolCall,
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
        if (
            value === "market" ||
            value === "docs" ||
            value === "console" ||
            value === "diagnostics" ||
            value === "skills" ||
            value === "mcps"
        ) {
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
        if (value === "claude-zhipu" || value === "gateway-api" || value === "aicode-cli") {
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
            return "****";
        }
        return `${safeToken.slice(0, head)}****${safeToken.slice(-tail)}`;
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
    const normalizeToolArguments = (value: unknown) => {
        if (value === null || value === undefined) {
            return "";
        }
        if (typeof value === "string") {
            return value;
        }
        if (Array.isArray(value) && value.length === 0) {
            return "";
        }
        if (
            typeof value === "object" &&
            value &&
            !Array.isArray(value) &&
            Object.keys(value as Record<string, unknown>).length === 0
        ) {
            return "";
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    };
    const mergeToolArguments = (current: string, incoming: string) => {
        if (!incoming) {
            return current;
        }
        if (!current) {
            return incoming;
        }
        if (incoming === current) {
            return current;
        }
        if (incoming.startsWith(current)) {
            return incoming;
        }
        if (current.startsWith(incoming)) {
            return current;
        }
        return `${current}${incoming}`;
    };
    const parseDiagnosticsSsePayloads = (rawPayload: unknown) => {
        if (typeof rawPayload !== "string" || !rawPayload.trim()) {
            return [];
        }
        const payloads: Record<string, unknown>[] = [];
        for (const eventBlock of rawPayload.split(/\n\n+/)) {
            const trimmedBlock = eventBlock.trim();
            if (!trimmedBlock) {
                continue;
            }
            const dataLines = trimmedBlock
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim());
            if (dataLines.length === 0) {
                continue;
            }
            const payloadText = dataLines.join("\n").trim();
            if (!payloadText || payloadText === "[DONE]") {
                continue;
            }
            try {
                const parsed = JSON.parse(payloadText);
                if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                    payloads.push(parsed as Record<string, unknown>);
                }
            } catch {
                continue;
            }
        }
        return payloads;
    };
    const parseDiagnosticsToolCalls = (rawPayload: unknown): DiagnosticsParsedToolCall[] => {
        const payloads = parseDiagnosticsSsePayloads(rawPayload);
        const calls = new Map<
            string,
            {
                key: string;
                source: "openai" | "anthropic";
                index?: number | null;
                callId?: string | null;
                name?: string | null;
                type?: string | null;
                argumentsText: string;
            }
        >();
        const upsertCall = (
            key: string,
            source: "openai" | "anthropic",
            patch: Partial<DiagnosticsParsedToolCall> & { argumentsText?: string },
        ) => {
            const current = calls.get(key) ?? {
                key,
                source,
                index: null,
                callId: null,
                name: null,
                type: null,
                argumentsText: "",
            };
            current.source = source;
            if (patch.index !== undefined) {
                current.index = patch.index ?? null;
            }
            if (patch.callId !== undefined) {
                current.callId = patch.callId ?? null;
            }
            if (patch.name !== undefined) {
                current.name = patch.name ?? null;
            }
            if (patch.type !== undefined) {
                current.type = patch.type ?? null;
            }
            if (patch.argumentsText) {
                current.argumentsText = mergeToolArguments(current.argumentsText, patch.argumentsText);
            }
            calls.set(key, current);
        };
        const collectOpenAiToolCall = (toolCall: unknown, fallbackKey: string) => {
            if (!toolCall || typeof toolCall !== "object") {
                return;
            }
            const tool = toolCall as Record<string, unknown>;
            const index = typeof tool.index === "number" ? tool.index : null;
            const callId = typeof tool.id === "string" && tool.id ? tool.id : null;
            const functionPayload =
                tool.function && typeof tool.function === "object"
                    ? (tool.function as Record<string, unknown>)
                    : null;
            const key = callId || (index !== null ? `openai:${index}` : fallbackKey);
            upsertCall(key, "openai", {
                index,
                callId,
                type: typeof tool.type === "string" ? tool.type : "function",
                name: typeof functionPayload?.name === "string" ? functionPayload.name : null,
                argumentsText: normalizeToolArguments(functionPayload?.arguments ?? tool.arguments),
            });
        };
        const collectOpenAiFunctionCall = (functionCall: unknown, fallbackKey: string) => {
            if (!functionCall || typeof functionCall !== "object") {
                return;
            }
            const functionPayload = functionCall as Record<string, unknown>;
            upsertCall(fallbackKey, "openai", {
                type: "function",
                name: typeof functionPayload.name === "string" ? functionPayload.name : null,
                argumentsText: normalizeToolArguments(functionPayload.arguments),
            });
        };

        payloads.forEach((payload, payloadIndex) => {
            const choices = Array.isArray(payload.choices) ? payload.choices : [];
            choices.forEach((choice, choiceIndex) => {
                if (!choice || typeof choice !== "object") {
                    return;
                }
                const choicePayload = choice as Record<string, unknown>;
                const containers = [choicePayload, choicePayload.delta, choicePayload.message];
                containers.forEach((container, containerIndex) => {
                    if (!container || typeof container !== "object") {
                        return;
                    }
                    const objectContainer = container as Record<string, unknown>;
                    const toolCalls = Array.isArray(objectContainer.tool_calls) ? objectContainer.tool_calls : [];
                    toolCalls.forEach((toolCall, toolIndex) =>
                        collectOpenAiToolCall(
                            toolCall,
                            `openai:${payloadIndex}:${choiceIndex}:${containerIndex}:${toolIndex}`,
                        ),
                    );
                    if (objectContainer.function_call) {
                        collectOpenAiFunctionCall(
                            objectContainer.function_call,
                            `openai:function:${payloadIndex}:${choiceIndex}:${containerIndex}`,
                        );
                    }
                });
            });

            const payloadType = typeof payload.type === "string" ? payload.type : "";
            const eventIndex = typeof payload.index === "number" ? payload.index : null;
            if (payloadType === "content_block_start") {
                const contentBlock =
                    payload.content_block && typeof payload.content_block === "object"
                        ? (payload.content_block as Record<string, unknown>)
                        : null;
                if (contentBlock?.type === "tool_use") {
                    const key =
                        (typeof contentBlock.id === "string" && contentBlock.id) ||
                        (eventIndex !== null ? `anthropic:${eventIndex}` : `anthropic:start:${payloadIndex}`);
                    upsertCall(key, "anthropic", {
                        index: eventIndex,
                        callId: typeof contentBlock.id === "string" ? contentBlock.id : null,
                        type: "tool_use",
                        name: typeof contentBlock.name === "string" ? contentBlock.name : null,
                        argumentsText: normalizeToolArguments(contentBlock.input),
                    });
                }
            }
            if (payloadType === "content_block_delta") {
                const delta =
                    payload.delta && typeof payload.delta === "object"
                        ? (payload.delta as Record<string, unknown>)
                        : null;
                if (delta?.type === "input_json_delta") {
                    const key = eventIndex !== null ? `anthropic:${eventIndex}` : `anthropic:delta:${payloadIndex}`;
                    upsertCall(key, "anthropic", {
                        index: eventIndex,
                        type: "tool_use",
                        argumentsText:
                            typeof delta.partial_json === "string" ? delta.partial_json : "",
                    });
                }
            }
        });

        return Array.from(calls.values()).map((toolCall) => ({
            ...toolCall,
            argumentsText: formatDiagnosticsPayload(toolCall.argumentsText),
        }));
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
            const rawPayloadSource =
                entry.raw_payload ??
                (entry.payload_mode === "raw_sse" && entry.payload !== undefined ? entry.payload : null);
            const parsedToolCalls = parseDiagnosticsToolCalls(rawPayloadSource);
            const displayPayloadSource =
                entry.display_payload ??
                (entry.payload_mode === "raw_sse" && parsedToolCalls.length > 0 ? null : entry.payload);
            const payloadText = formatDiagnosticsPayload(displayPayloadSource);
            const rawPayloadText =
                rawPayloadSource === null || rawPayloadSource === undefined
                    ? null
                    : formatDiagnosticsPayload(rawPayloadSource);
            const item: DiagnosticsRequestEntry = {
                key: `${entry.timestamp}-${entry.event}-${gatewayRequestId ?? entry.request_id ?? index}`,
                role: getDiagnosticsEntryRole(entry.event),
                payloadText,
                rawPayloadText,
                copyPayloadText: payloadText || rawPayloadText || "",
                parsedToolCalls,
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
        if (modelsLoading || visibleModels) {
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
    }, [modelsLoading, modelsRetryCount, visibleModels, MAX_RETRIES, RETRY_DELAY_MS]);

    const isUserAdmin = useMemo(() => {
        return (
            visibleModels?.isAdmin ||
            apiKeyUser?.isAdmin
        );
    }, [visibleModels?.isAdmin, apiKeyUser?.isAdmin]);

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

    const createToken = async (ownerType: "user" | "project", projectId?: string, note?: string) => {
        const createKey = ownerType === "project" ? `project:${projectId ?? ""}` : "user";
        if (createTokenLoading[createKey]) {
            return;
        }
        setCreateTokenLoading((prev) => ({ ...prev, [createKey]: true }));
        setCreateTokenError(null);
        try {
            const jsonPayload: Record<string, unknown> = { ownerType };
            if (ownerType === "project") {
                jsonPayload.projectId = projectId;
            }
            if (note) {
                jsonPayload.note = note;
            }
            const payload = await platformUserPost<{ token?: string }>(
                "/tokens",
                { json: jsonPayload },
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

    const updateTokenNote = async (token: string, note: string | null) => {
        if (tokenUpdating[token]) {
            return;
        }
        setTokenUpdating((prev) => ({ ...prev, [token]: true }));
        setTokenActionError(null);
        try {
            await platformUserPatch<{ token: string; note: string | null }>(
                `/tokens/${token}/note`,
                { json: { note } },
            );
            setApiKeyUser((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    tokens: prev.tokens.map((item) =>
                        item.token === token ? { ...item, note } : item,
                    ),
                };
            });
        } catch (error) {
            setTokenActionError(error instanceof Error ? error.message : "备注更新失败");
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
                                    ? [
                                          "console",
                                          "market",
                                          "docs",
                                          ...(isUserAdmin ? ["skills", "mcps"] : []),
                                          "diagnostics",
                                      ]
                                    : [
                                          "console",
                                          "market",
                                          "docs",
                                          ...(isUserAdmin ? ["skills", "mcps"] : []),
                                      ]
                            ).map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => {
                                        setActiveTopMenu(item as TopMenu);
                                        syncPath(item as TopMenu, activeSideMenu, activeDocsPage);
                                    }}
                                    className={`relative rounded-full px-4 py-2 transition ${
                                        activeTopMenu === item
                                            ? "bg-blue-800 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item === "console" && "控制台"}
                                    {item === "market" && "模型广场"}
                                    {item === "docs" && "API 文档"}
                                    {item === "skills" && "Skills"}
                                    {item === "mcps" && "MCPs"}
                                    {item === "diagnostics" && "诊断日志"}
                                    {(item === "skills" || item === "mcps") && (
                                        <span className="absolute -right-1 -top-1 flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                                        </span>
                                    )}
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
                    updateTokenNote={updateTokenNote}
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
            {(activeTopMenu === "skills" || activeTopMenu === "mcps") && (
                <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 px-6 text-center">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.675.337a4 4 0 01-2.574.346l-2.387-.477a2 2 0 00-1.022.547l-1.5 1.5a2 2 0 000 2.828l1.5 1.5a2 2 0 002.828 0l1.5-1.5a2 2 0 00.547-1.022l.477-2.387a6 6 0 00-.517-3.86l-.337-.675a4 4 0 01-.346-2.574l.477-2.387a2 2 0 00-.547-1.022l-1.5-1.5a2 2 0 00-2.828 0l-1.5 1.5a2 2 0 000 2.828l1.5 1.5a2 2 0 001.022.547l2.387.477a6 6 0 003.86-.517l.675-.337a4 4 0 012.574-.346l2.387.477a2 2 0 001.022-.547l1.5-1.5a2 2 0 000-2.828l-1.5-1.5a2 2 0 00-2.828 0l-1.5 1.5z" />
                        </svg>
                    </div>
                    <div className="flex flex-col gap-2">
                        <h3 className="text-xl font-bold text-slate-800">
                            {activeTopMenu === "skills" ? "Skills" : "MCPs"} 功能开发中
                        </h3>
                        <p className="max-w-md text-slate-500">
                            我们正在努力构建 {activeTopMenu === "skills" ? "插件系统 (Skills)" : "MCP 协议支持"}，该功能将允许你扩展模型能力并连接更多外部工具。敬请期待！
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openApiKeysPage}
                        className="mt-4 rounded-full bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                        返回控制台
                    </button>
                </div>
            )}
        </div>
    );
};

export default Platform;
