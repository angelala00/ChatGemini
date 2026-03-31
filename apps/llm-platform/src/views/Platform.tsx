import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
    id?: string;
    displayName?: string | null;
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
        type?: string | null;
        backends: string[];
        is_new?: boolean;
        sunset_soon?: boolean;
        supports_image_input?: boolean;
        supports_reasoning?: boolean;
        supports_tool_calling?: boolean;
        thinking_format?: string | null;
    }>;
}

interface UserModelRankingResponse {
    user: string;
    range: string;
    generatedAt: string;
    limit: number;
    ranking: RankingEntry[];
}

interface ProjectUsageSummary {
    id: string;
    name: string;
    usage?: UserModelRankingResponse | null;
    error?: string;
}

interface UserUsageResponse extends UserModelRankingResponse {
    projects?: ProjectUsageSummary[];
}

type TopMenu = "console" | "market" | "docs";
type ConsoleSideMenu = "apikey" | "usage";
type DocsPage = "gateway-api" | "claude-zhipu";

const StatusBadge = ({
    children,
    tone,
}: {
    children: string;
    tone: "accent" | "warning";
}) => {
    const toneClasses =
        tone === "accent"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-300 bg-slate-100 text-slate-600";
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClasses}`}
        >
            {children}
        </span>
    );
};

const CapabilityBadge = ({
    children,
    supported,
}: {
    children: string;
    supported: boolean;
}) => (
    <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            supported
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-100 text-slate-500"
        }`}
    >
        {children} · {supported ? "支持" : "不支持"}
    </span>
);

const API_DOC_GROUP_ORDER = ["模型", "对话", "检索", "音频", "Claude", "其他"] as const;

const getApiDocGroupLabel = (title: string) => {
    if (title.startsWith("GET /v1/models")) {
        return "模型";
    }
    if (title.includes("/v1/chat/completions")) {
        return "对话";
    }
    if (title.includes("/v1/embeddings") || title.includes("/v1/rerank")) {
        return "检索";
    }
    if (title.includes("/v1/audio/")) {
        return "音频";
    }
    if (title.includes("/v1/messages")) {
        return "Claude";
    }
    return "其他";
};

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
        if (value === "market" || value === "docs" || value === "console") {
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
    const [tokenUpdating, setTokenUpdating] = useState<Record<string, boolean>>({});
    const [tokenActionError, setTokenActionError] = useState<string | null>(null);
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
    const getUsageTotals = (ranking: RankingEntry[] = []) => ({
        requests: ranking.reduce((sum, item) => sum + item.requests, 0),
        tokens: ranking.reduce((sum, item) => sum + item.tokens, 0),
    });
    const apiDocs = [
        {
            title: "GET /v1/models",
            summary: "获取可用模型列表（OpenAI 兼容）。",
            request: `curl -X GET \\
  -H "Authorization: Bearer $API_KEY" \\
  https://{HOST}/v1/models`,
            response: `{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-mini",
      "object": "model",
      "created": 0,
      "owned_by": "gateway"
    }
  ]
}`,
            notes: [
                "需要 Authorization Bearer Token。",
                "返回字段遵循 OpenAI 模型列表结构，网关会基于 token 权限过滤。",
            ],
        },
        {
            title: "POST /v1/chat/completions",
            summary: "聊天对话（OpenAI 兼容，支持 stream、tools）。",
            request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/chat/completions \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Say hi"}
    ],
    "temperature": 0.7,
    "stream": false
  }'`,
            response: `{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "Hi!"},
      "finish_reason": "stop"
    }
  ],
  "model": "gpt-4o-mini"
}`,
            notes: [
                "Header 可选：`x-tool-mode` 支持 `native`/`prompt`/`auto`。",
                "stream=true 时返回 SSE（text/event-stream）。",
            ],
        },
        {
            title: "POST /v1/chat/completions（多模态）",
            summary: "多模态对话（OpenAI 兼容，支持图片输入）。",
            request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/chat/completions \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "这张图里有什么？"},
          {"type": "image_url", "image_url": {"url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA..."}}
        ]
      }
    ]
  }'`,
            response: `{
  "id": "chatcmpl_xxx",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "图中是..."},
      "finish_reason": "stop"
    }
  ],
  "model": "gpt-4o-mini"
}`,
            notes: [
                "图片可使用 data URL（Base64）。",
                "仅支持视觉/多模态的模型可用传图片参数调用该接口。",
            ],
        },
        {
            title: "POST /v1/embeddings",
            summary: "文本向量（OpenAI 兼容请求体）。",
            request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/embeddings \\
  -d '{
    "model": "text-embedding-3-large",
    "input": "hello world"
  }'`,
            response: `{
  "object": "list",
  "data": [
    {"object": "embedding", "index": 0, "embedding": [0.01, 0.02]}
  ],
  "model": "text-embedding-3-large"
}`,
            notes: [
                "input 支持字符串或数组。",
                "网关会将 model 名称映射到后端实际模型。",
            ],
        },
        {
            title: "POST /v1/audio/transcriptions",
            summary: "音频转写（multipart/form-data 文件上传）。",
            request: `curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  https://{HOST}/v1/audio/transcriptions \
  -F 'file=@/path/to/audio.wav' \
  -F 'model=whisper-1'`,
            response: `{
  "text": "hello world"
}`,
            notes: [
                "file 必须作为真实文件上传，不要写成带额外引号的 @ 路径。",
                "model 传网关暴露的模型名，网关会映射到后端实际模型。",
            ],
        },
        {
            title: "POST /v1/audio/speech",
            summary: "文本转语音（返回音频二进制）。",
            request: `curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  https://{HOST}/v1/audio/speech \
  -d '{
    "model": "tts-1",
    "input": "你好，欢迎使用网关服务。",
    "voice": "alloy",
    "response_format": "mp3"
  }' \
  --output speech.mp3`,
            response: `Binary audio stream (for example: audio/mpeg)`,
            notes: [
                "该接口返回音频二进制，不是 JSON。",
                "可用字段与后端 TTS 模型能力保持一致，常见字段包括 input、voice、response_format。",
            ],
        },
        {
            title: "POST /v1/rerank",
            summary: "相关性重排（Rerank 请求体）。",
            request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/rerank \\
  -d '{
    "model": "rerank-multilingual-v3.0",
    "query": "how to reset password",
    "documents": [
      "Reset your password in settings",
      "Pricing and billing guide"
    ],
    "top_n": 2
  }'`,
            response: `{
  "results": [
    {"index": 0, "relevance_score": 0.92},
    {"index": 1, "relevance_score": 0.12}
  ],
  "model": "rerank-multilingual-v3.0"
}`,
            notes: [
                "documents 通常为字符串数组（部分后端也接受对象数组）。",
                "返回 results 按相关性排序。",
            ],
        },
        {
            title: "POST /v1/messages",
            summary: "Claude Messages 兼容接口（自动转 OpenAI 再返回 Claude 结构）。",
            request: `curl -X POST \\
  -H "Authorization: Bearer $API_KEY" \\
  -H "Content-Type: application/json" \\
  https://{HOST}/v1/messages \\
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 256,
    "messages": [
      {"role": "user", "content": "Hello from Claude format"}
    ]
  }'`,
            response: `{
  "id": "msg_xxx",
  "type": "message",
  "role": "assistant",
  "content": [{"type": "text", "text": "Hello!"}],
  "model": "claude-3-5-sonnet"
}`,
            notes: [
                "支持 stream，返回 SSE（text/event-stream）。",
                "metadata 字段会被忽略。",
            ],
        },
    ];
    const [expandedApiDoc, setExpandedApiDoc] = useState<string>("GET /v1/models");
    const groupedApiDocs = API_DOC_GROUP_ORDER.map((label) => ({
        label,
        docs: apiDocs.filter((doc) => getApiDocGroupLabel(doc.title) === label),
    })).filter((group) => group.docs.length > 0);
    const usageRanking = usageData?.ranking ?? [];
    const projectUsage = usageData?.projects ?? [];
    const usageTotals = getUsageTotals(usageRanking);
    const ownedProjects = apiKeyUser?.projects ?? [];
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
                            {header}
                        </span>
                        <nav className="flex items-center gap-3 text-sm font-medium text-slate-500">
                            {["console", "market", "docs"].map((item) => (
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
                                            setActiveSideMenu(item as ConsoleSideMenu);
                                            syncPath(activeTopMenu, item as ConsoleSideMenu, activeDocsPage);
                                        }}
                                    className={`rounded-xl px-3 py-2 text-left transition ${
                                        activeSideMenu === item
                                            ? "bg-blue-800 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item === "apikey" && "API Keys"}
                                    {item === "usage" && "用量统计"}
                                </button>
                            ))}
                        </div>
                    </aside>
                    <main className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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
                                            {maskToken(createdTokenValue)}
                                        </div>
                                        <div className="mt-1 text-xs text-emerald-600">
                                            为安全起见已打码，可使用复制获取完整 Token。
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
                                                                    {maskToken(token.token)}
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
                                                        : "bg-blue-800 text-white hover:bg-blue-700"
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
                                                                : "bg-blue-800 text-white hover:bg-blue-700"
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
                                <div className="space-y-6">
                                    {groupedVisibleModels.map((group) => (
                                        <div key={group.type}>
                                            <div className="text-xs uppercase tracking-widest text-slate-400">
                                                {group.type}
                                            </div>
                                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                                                {group.models.map((model) => (
                                                    <div
                                                        key={model.name}
                                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                                    >
                                                        {(() => {
                                                            const capabilityEntries = [
                                                                {
                                                                    label: "图片输入",
                                                                    value: model.supports_image_input,
                                                                },
                                                                {
                                                                    label: "思考开关",
                                                                    value: model.supports_reasoning,
                                                                },
                                                                {
                                                                    label: "工具调用",
                                                                    value: model.supports_tool_calling,
                                                                },
                                                            ].filter(
                                                                (
                                                                    item,
                                                                ): item is {
                                                                    label: string;
                                                                    value: boolean;
                                                                } =>
                                                                    typeof item.value === "boolean",
                                                            );
                                                            const thinkingFormatLabel =
                                                                model.thinking_format?.trim() || "";
                                                            return (
                                                                <>
                                                        <div className="text-sm font-semibold text-slate-800">
                                                            {model.name}
                                                        </div>
                                                        {(model.is_new || model.sunset_soon) && (
                                                            <div className="mt-2 flex flex-wrap gap-2">
                                                                {model.is_new && (
                                                                    <StatusBadge tone="accent">
                                                                        新上
                                                                    </StatusBadge>
                                                                )}
                                                                {model.sunset_soon && (
                                                                    <StatusBadge tone="warning">
                                                                        即将下线
                                                                    </StatusBadge>
                                                                )}
                                                            </div>
                                                        )}
                                                        {capabilityEntries.length > 0 && (
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                {capabilityEntries.map((item) => (
                                                                    <CapabilityBadge
                                                                        key={`${model.name}-${item.label}`}
                                                                        supported={item.value}
                                                                    >
                                                                        {item.label}
                                                                    </CapabilityBadge>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {thinkingFormatLabel && (
                                                            <div className="mt-3">
                                                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                                                    思考格式 · {thinkingFormatLabel}
                                                                </span>
                                                            </div>
                                                        )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                ))}
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
                <div className="mx-auto flex w-full max-w-6xl gap-6 px-6 py-8">
                    <aside className="w-full max-w-[260px] shrink-0 basis-[260px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                            API 文档
                        </div>
                        <div className="mt-4 flex flex-col gap-2 text-sm font-medium text-slate-600">
                            {[
                                { key: "gateway-api", label: "Gateway API 文档" },
                                { key: "claude-zhipu", label: "Claude Code 接入" },
                            ].map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => {
                                        setActiveDocsPage(item.key as DocsPage);
                                        syncPath("docs", activeSideMenu, item.key as DocsPage);
                                    }}
                                    className={`rounded-xl px-3 py-2 text-left transition ${
                                        activeDocsPage === item.key
                                            ? "bg-blue-800 text-white"
                                            : "hover:bg-slate-100"
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </aside>
                    <main className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        {activeDocsPage === "gateway-api" && (
                            <div className="flex flex-col gap-6">
                                <div>
                                    <h2 className="text-xl font-semibold">Gateway API 文档</h2>
                                    <p className="mt-3 text-sm text-slate-600">
                                        Gateway Server 提供的 OpenAI 兼容接口与 Claude Messages 接口。
                                        Base URL 为当前网关地址：`{gatewayBaseUrl}`。
                                    </p>
                                    <div className="mt-4 text-xs text-slate-500">
                                        本页面文档由 AI 自动生成，如有问题请联系管理员{adminContact ? ` ${adminContact}` : ""}。
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                    当前共 {apiDocs.length} 个接口，已按能力分组展示。点击卡片可展开请求示例、响应示例和备注。
                                </div>
                                <div className="space-y-6">
                                    {groupedApiDocs.map((group) => (
                                        <section key={group.label} className="space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                                                    {group.label}
                                                </div>
                                                <div className="text-xs text-slate-400">
                                                    {group.docs.length} 个接口
                                                </div>
                                            </div>
                                            <div className="space-y-3">
                                                {group.docs.map((doc) => {
                                                    const isExpanded = expandedApiDoc === doc.title;
                                                    return (
                                                        <div
                                                            key={doc.title}
                                                            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setExpandedApiDoc((current) =>
                                                                        current === doc.title ? "" : doc.title
                                                                    )
                                                                }
                                                                className="flex w-full items-start justify-between gap-4 text-left"
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-semibold text-slate-900">
                                                                        {doc.title}
                                                                    </div>
                                                                    <div className="mt-2 text-sm text-slate-600">
                                                                        {doc.summary}
                                                                    </div>
                                                                </div>
                                                                <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                                                                    {isExpanded ? "收起" : "展开"}
                                                                </span>
                                                            </button>
                                                            {isExpanded && (
                                                                <div className="mt-4 border-t border-slate-200 pt-4">
                                                                    <div>
                                                                        <div className="text-xs font-semibold text-slate-500">
                                                                            请求示例
                                                                        </div>
                                                                        <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                                                            {doc.request}
                                                                        </pre>
                                                                    </div>
                                                                    <div className="mt-4">
                                                                        <div className="text-xs font-semibold text-slate-500">
                                                                            响应示例
                                                                        </div>
                                                                        <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                                                            {doc.response}
                                                                        </pre>
                                                                    </div>
                                                                    <div className="mt-4 text-xs text-slate-500">
                                                                        {doc.notes.map((note) => (
                                                                            <div key={note}>• {note}</div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            </div>
                        )}
                        {activeDocsPage === "claude-zhipu" && (
                            <div className="flex flex-col gap-6">
                                <div>
                                    <h2 className="text-xl font-semibold">
                                        Claude Code 接入大模型
                                    </h2>
                                    <p className="mt-3 text-sm text-slate-600">
                                        该页内容整理自智谱官方文档：
                                        https://docs.bigmodel.cn/cn/coding-plan/tool/claude
                                        ，用于在本地平台内快速查阅。
                                    </p>
                                    <div className="mt-2 text-xs text-slate-500">
                                        主要覆盖：安装、环境配置、启动使用、模型切换和常见故障排查。
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-sm font-semibold text-slate-800">步骤一：安装 Claude Code</div>
                                    <div className="mt-2 text-sm text-slate-600">
                                        前提条件：Node.js 18+；Windows 需安装 Git for Windows。
                                    </div>
                                    <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        npm install -g @anthropic-ai/claude-code
                                    </pre>
                                    <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        claude --version
                                    </pre>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-sm font-semibold text-slate-800">步骤二：修改配置文件</div>
                                    <div className="mt-2 text-sm text-slate-600">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActiveTopMenu("console");
                                                setActiveSideMenu("apikey");
                                                syncPath("console", "apikey", activeDocsPage);
                                            }}
                                            className="text-blue-700 underline hover:text-blue-800"
                                        >
                                            在这里申请 API Key
                                        </button>
                                        ；随后配置 Claude 所需环境变量。
                                    </div>
                                    <div className="mt-3 text-xs font-semibold text-slate-500">
                                        手动配置 `~/.claude/settings.json`
                                    </div>
                                    <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        {claudeSettingsExample}
                                    </pre>
                                    <div className="mt-3 text-xs font-semibold text-slate-500">
                                        同时配置 `~/.claude.json`
                                    </div>
                                    <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        {claudeOnboardingExample}
                                    </pre>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-sm font-semibold text-slate-800">步骤三：开始使用</div>
                                    <div className="mt-2 text-sm text-slate-600">
                                        在代码目录执行 `claude` 启动；首次询问 API Key 使用授权时选择 Yes。
                                        配置改动后建议打开新终端窗口再启动。
                                    </div>
                                    <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        claude
                                    </pre>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                                    <div className="text-sm font-semibold text-slate-800">常见问题</div>
                                    <div className="mt-3 text-sm text-slate-600">
                                        若手工配置不生效：关闭所有 Claude Code 窗口、重开终端后再启动；
                                        必要时删除 `~/.claude/settings.json` 后重新配置，并校验 JSON 格式。
                                    </div>
                                    <div className="mt-3 text-sm text-slate-600">
                                        推荐使用较新版本，可通过以下命令检查与升级：
                                    </div>
                                    <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
                                        claude --version

claude update
                                    </pre>
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            )}
        </div>
    );
};

export default Platform;
