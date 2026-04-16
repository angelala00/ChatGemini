export interface GatewayUserTokenInfo {
    token: string;
    tokenId?: string;
    enabled: boolean;
    ownerType: "user" | "project";
    projectId?: string;
    projectName?: string;
    diagnosticsAuthorized?: boolean;
    diagnosticsActive?: boolean;
    diagnosticsExpiresAt?: string | null;
}

export interface GatewayUserTokenUpdateResponse {
    token: string;
    enabled: boolean;
}

export interface TokenDiagnosticsState {
    tokenId: string;
    authorized: boolean;
    active: boolean;
    expiresAt?: string | null;
}

export interface GatewayUserSummary {
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

export interface RankingEntry {
    name: string;
    requests: number;
    tokens: number;
    progress: number;
}

export interface UserVisibilityResponse {
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

export interface UserModelRankingResponse {
    user: string;
    range: string;
    generatedAt: string;
    limit: number;
    ranking: RankingEntry[];
}

export interface ProjectUsageSummary {
    id: string;
    name: string;
    usage?: UserModelRankingResponse | null;
    error?: string;
}

export interface TokenDiagnosticsLogEntry {
    timestamp: string;
    event: string;
    token_id: string;
    model?: string | null;
    endpoint?: string | null;
    gateway_request_id?: string | null;
    request_id?: string | null;
    status?: number | null;
    payload?: unknown;
}

export interface TokenDiagnosticsLogsResponse {
    tokenId: string;
    range: string;
    limit: number;
    entries: TokenDiagnosticsLogEntry[];
    partial?: boolean;
}

export type DiagnosticsEntryRole = "input" | "output" | "other";

export interface DiagnosticsRequestEntry {
    key: string;
    role: DiagnosticsEntryRole;
    payloadText: string;
    entry: TokenDiagnosticsLogEntry;
}

export interface DiagnosticsRequestGroup {
    key: string;
    gatewayRequestId?: string | null;
    summary: TokenDiagnosticsLogEntry;
    entries: DiagnosticsRequestEntry[];
}

export interface UserUsageResponse extends UserModelRankingResponse {
    projects?: ProjectUsageSummary[];
}

export type TopMenu = "console" | "market" | "docs" | "diagnostics";
export type ConsoleSideMenu = "apikey" | "usage";
export type DocsPage = "gateway-api" | "claude-zhipu";

export interface VisibleModelGroup {
    type: string;
    models: UserVisibilityResponse["models"];
}
