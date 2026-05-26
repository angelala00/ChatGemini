import {
    DiagnosticsParsedToolCall,
    DiagnosticsRequestGroup,
    GatewayUserTokenInfo,
    TokenDiagnosticsLogEntry,
    TokenDiagnosticsLogsResponse,
} from "./types";

interface DiagnosticsPageProps {
    apiKeyLoading: boolean;
    apiKeyError: string | null;
    tokenActionError: string | null;
    diagnosticsError: string | null;
    diagnosticsTokens: GatewayUserTokenInfo[];
    selectedDiagnosticsToken: GatewayUserTokenInfo | null;
    diagnosticsRange: string;
    diagnosticsLogs: TokenDiagnosticsLogsResponse | null;
    diagnosticsLoading: boolean;
    groupedDiagnosticsLogs: DiagnosticsRequestGroup[];
    expandedDiagnosticsGroups: Record<string, boolean>;
    copiedDiagnosticsPayload: string | null;
    setDiagnosticsRange: (range: string) => void;
    setExpandedDiagnosticsGroups: (
        updater: (prev: Record<string, boolean>) => Record<string, boolean>,
    ) => void;
    openDiagnosticsPage: (tokenId?: string) => void;
    maskToken: (token: string, head?: number, tail?: number) => string;
    formatDateTime: (value?: string | null) => string;
    handleCopyDiagnosticsPayload: (key: string, payload: string) => void;
}

type TokenStatItem = {
    label: string;
    value: number;
};

const hasTokenValue = (value?: number | null): value is number =>
    typeof value === "number" && Number.isFinite(value);

const formatTokenValue = (value: number) => value.toLocaleString();

const resolveGroupTokenValue = (
    group: DiagnosticsRequestGroup,
    fieldName: "input_tokens" | "output_tokens",
    preferredRole: "input" | "output",
) => {
    const preferredEntry = group.entries.find(
        (item) => item.role === preferredRole && hasTokenValue(item.entry[fieldName]),
    );
    if (preferredEntry) {
        return preferredEntry.entry[fieldName] as number;
    }
    const fallbackEntry = group.entries.find((item) => hasTokenValue(item.entry[fieldName]));
    return fallbackEntry ? (fallbackEntry.entry[fieldName] as number) : null;
};

const buildTokenStats = (
    entry: TokenDiagnosticsLogEntry,
    items: Array<[label: string, value: number | null | undefined]>,
) =>
    items.reduce<TokenStatItem[]>((result, [label, value]) => {
        if (hasTokenValue(value)) {
            result.push({ label, value });
        }
        return result;
    }, []);

const getEntryTokenStats = (entry: TokenDiagnosticsLogEntry) => ({
    summaryStats: buildTokenStats(entry, [
        ["输入", entry.input_tokens],
        ["输出", entry.output_tokens],
        ["总计", entry.total_tokens],
    ]),
    inputStats: buildTokenStats(entry, [
        ["消息", entry.input_message_tokens],
        ["图片", entry.input_image_tokens],
        ["工具 Schema", entry.input_tool_schema_tokens],
        ["JSON 开销", entry.input_json_overhead_tokens],
        ["工具调用", entry.input_tool_call_tokens],
    ]),
    outputStats: buildTokenStats(entry, [
        ["消息", entry.output_message_tokens],
        ["Reasoning", entry.output_reasoning_tokens],
        ["工具调用", entry.output_tool_call_tokens],
    ]),
    backendStats: buildTokenStats(entry, [
        ["输入", entry.backend_input_tokens],
        ["输出", entry.backend_output_tokens],
        ["总计", entry.backend_total_tokens],
    ]),
});

const renderTokenChips = (stats: TokenStatItem[], tone: "slate" | "emerald" | "sky" | "amber" = "slate") => {
    if (stats.length === 0) {
        return null;
    }

    const toneClassName = {
        slate: "border-slate-200 bg-white text-slate-700",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        sky: "border-sky-200 bg-sky-50 text-sky-700",
        amber: "border-amber-200 bg-amber-50 text-amber-700",
    }[tone];

    return (
        <div className="flex flex-wrap gap-2">
            {stats.map((stat) => (
                <span
                    key={stat.label}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}
                >
                    {stat.label} {formatTokenValue(stat.value)}
                </span>
            ))}
        </div>
    );
};

const renderToolCallCards = (toolCalls: DiagnosticsParsedToolCall[]) => {
    if (toolCalls.length === 0) {
        return null;
    }

    return (
        <div className="space-y-3">
            {toolCalls.map((toolCall) => (
                <div
                    key={toolCall.key}
                    className="rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3"
                >
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-violet-700">
                        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 font-semibold">
                            Tool Use
                        </span>
                        {toolCall.name && <span className="font-medium text-violet-900">{toolCall.name}</span>}
                        {toolCall.callId && <span>ID {toolCall.callId}</span>}
                        {typeof toolCall.index === "number" && <span>Index {toolCall.index}</span>}
                        <span>{toolCall.source === "anthropic" ? "Anthropic SSE" : "OpenAI SSE"}</span>
                    </div>
                    {toolCall.argumentsText && (
                        <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white px-3 py-3 text-xs leading-6 text-slate-700">
                            {toolCall.argumentsText}
                        </pre>
                    )}
                </div>
            ))}
        </div>
    );
};

const DiagnosticsPage = ({
    apiKeyLoading,
    apiKeyError,
    tokenActionError,
    diagnosticsError,
    diagnosticsTokens,
    selectedDiagnosticsToken,
    diagnosticsRange,
    diagnosticsLogs,
    diagnosticsLoading,
    groupedDiagnosticsLogs,
    expandedDiagnosticsGroups,
    copiedDiagnosticsPayload,
    setDiagnosticsRange,
    setExpandedDiagnosticsGroups,
    openDiagnosticsPage,
    maskToken,
    formatDateTime,
    handleCopyDiagnosticsPayload,
}: DiagnosticsPageProps) => (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900">诊断日志</h2>
                    <p className="mt-2 text-sm text-slate-600">
                        查看已授权 API Key 的原文诊断日志，并按 Key 与时间范围筛选。
                    </p>
                </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-600">
                    <span className="mr-2">API Key</span>
                    <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={selectedDiagnosticsToken?.tokenId ?? ""}
                        onChange={(event) => openDiagnosticsPage(event.target.value || undefined)}
                    >
                        {diagnosticsTokens.length === 0 && <option value="">暂无已授权 Key</option>}
                        {diagnosticsTokens.map((token) => (
                            <option key={token.tokenId} value={token.tokenId}>
                                {maskToken(token.token)} ·{" "}
                                {token.ownerType === "project"
                                    ? `项目 ${token.projectName ?? token.projectId ?? ""}`
                                    : "个人"}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="text-sm text-slate-600">
                    <span className="mr-2">时间范围</span>
                    <select
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        value={diagnosticsRange}
                        onChange={(event) => setDiagnosticsRange(event.target.value)}
                    >
                        <option value="1h">最近 1 小时</option>
                        <option value="6h">最近 6 小时</option>
                        <option value="24h">最近 24 小时</option>
                    </select>
                </label>
            </div>
            {selectedDiagnosticsToken?.diagnosticsAuthorized && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    当前状态：
                    <span className="ml-2 font-medium text-slate-800">
                        {selectedDiagnosticsToken.diagnosticsActive ? "采集中" : "未开启"}
                    </span>
                    {selectedDiagnosticsToken.diagnosticsExpiresAt && (
                        <span className="ml-3 text-slate-500">
                            截至 {formatDateTime(selectedDiagnosticsToken.diagnosticsExpiresAt)}
                        </span>
                    )}
                </div>
            )}
            {apiKeyError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                    {apiKeyError}
                </div>
            )}
            {tokenActionError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                    {tokenActionError}
                </div>
            )}
            {diagnosticsError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                    {diagnosticsError}
                </div>
            )}
            {!apiKeyLoading && diagnosticsTokens.length === 0 && (
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                    当前账号还没有被授权可用的诊断 Key。管理员需要先在 portal 中为某个 API Key 打开调试权限。
                </div>
            )}
            {!apiKeyLoading && diagnosticsTokens.length > 0 && (
                <div className="mt-6 space-y-4">
                    {diagnosticsLogs?.partial && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
                            部分节点日志暂时不可用，当前结果可能不完整。
                        </div>
                    )}
                    {diagnosticsLoading && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            正在加载诊断日志...
                        </div>
                    )}
                    {!diagnosticsLoading && diagnosticsLogs && diagnosticsLogs.entries.length === 0 && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            当前时间范围内暂无日志。
                        </div>
                    )}
                    {!diagnosticsLoading && diagnosticsLogs && diagnosticsLogs.entries.length > 0 && (
                        <div className="space-y-3">
                            {groupedDiagnosticsLogs.map((group) => {
                                const isExpanded = Boolean(expandedDiagnosticsGroups[group.key]);
                                const groupInputTokens = resolveGroupTokenValue(group, "input_tokens", "input");
                                const groupOutputTokens = resolveGroupTokenValue(group, "output_tokens", "output");
                                const inputEntries = group.entries.filter((item) => item.role === "input");
                                const outputEntries = group.entries.filter((item) => item.role === "output");
                                const otherEntries = group.entries.filter((item) => item.role === "other");
                                const sections = [
                                    { key: "input", title: "输入", items: inputEntries },
                                    { key: "output", title: "输出", items: outputEntries },
                                    { key: "other", title: "其他", items: otherEntries },
                                ].filter((section) => section.items.length > 0);
                                return (
                                    <div
                                        key={group.key}
                                        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                                    >
                                        <button
                                            type="button"
                                            className="flex w-full flex-wrap items-center justify-between gap-3 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
                                            onClick={() =>
                                                setExpandedDiagnosticsGroups((prev) => ({
                                                    ...prev,
                                                    [group.key]: !prev[group.key],
                                                }))
                                            }
                                        >
                                            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                                                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                                                    请求
                                                </span>
                                                <span>{formatDateTime(group.summary.timestamp)}</span>
                                                {group.gatewayRequestId ? (
                                                    <span>网关请求 {group.gatewayRequestId}</span>
                                                ) : (
                                                    <span>未关联网关请求</span>
                                                )}
                                                {group.summary.model && <span>模型 {group.summary.model}</span>}
                                                {group.summary.endpoint && <span>{group.summary.endpoint}</span>}
                                                {typeof group.summary.status === "number" && (
                                                    <span>状态 {group.summary.status}</span>
                                                )}
                                                {(hasTokenValue(groupInputTokens) || hasTokenValue(groupOutputTokens)) && (
                                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">
                                                        输入 {hasTokenValue(groupInputTokens) ? formatTokenValue(groupInputTokens) : "-"}
                                                        {" · "}
                                                        输出 {hasTokenValue(groupOutputTokens) ? formatTokenValue(groupOutputTokens) : "-"}
                                                    </span>
                                                )}
                                                <span>{group.entries.length} 条日志</span>
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                {isExpanded ? "收起" : "展开"}
                                            </span>
                                        </button>
                                        {isExpanded && (
                                            <div className="border-t border-slate-200 bg-slate-50">
                                                {sections.map((section) => (
                                                    <div
                                                        key={section.key}
                                                        className="border-t border-slate-200 first:border-t-0"
                                                    >
                                                        <div className="bg-slate-100 px-4 py-2 text-xs font-medium tracking-wide text-slate-600">
                                                            {section.title}
                                                        </div>
                                                        <div className="divide-y divide-slate-200">
                                                            {section.items.map((item) => {
                                                                const { summaryStats, inputStats, outputStats, backendStats } =
                                                                    getEntryTokenStats(item.entry);
                                                                const hasTokenStats =
                                                                    summaryStats.length > 0 ||
                                                                    inputStats.length > 0 ||
                                                                    outputStats.length > 0 ||
                                                                    backendStats.length > 0;
                                                                return (
                                                                <div key={item.key}>
                                                                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500">
                                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                                            <span>{item.entry.event}</span>
                                                                            <span>{formatDateTime(item.entry.timestamp)}</span>
                                                                            {item.entry.model && (
                                                                                <span>模型 {item.entry.model}</span>
                                                                            )}
                                                                            {item.entry.endpoint && (
                                                                                <span>{item.entry.endpoint}</span>
                                                                            )}
                                                                            {typeof item.entry.status === "number" && (
                                                                                <span>状态 {item.entry.status}</span>
                                                                            )}
                                                                            {item.entry.request_id && (
                                                                                <span>请求 {item.entry.request_id}</span>
                                                                            )}
                                                                            {item.entry.payload_mode && (
                                                                                <span>{item.entry.payload_mode}</span>
                                                                            )}
                                                                            {item.entry.upstream_content_type && (
                                                                                <span>{item.entry.upstream_content_type}</span>
                                                                            )}
                                                                        </div>
                                                                        {item.copyPayloadText && (
                                                                            <button
                                                                                type="button"
                                                                                className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                                                                                onClick={(event) => {
                                                                                    event.stopPropagation();
                                                                                    handleCopyDiagnosticsPayload(
                                                                                        item.key,
                                                                                        item.copyPayloadText,
                                                                                    );
                                                                                }}
                                                                            >
                                                                                {copiedDiagnosticsPayload === item.key
                                                                                    ? "已复制"
                                                                                    : "复制"}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {hasTokenStats && (
                                                                        <div className="border-t border-slate-200 bg-white/70 px-4 py-3">
                                                                            <div className="flex flex-col gap-2">
                                                                                {renderTokenChips(summaryStats)}
                                                                                {inputStats.length > 0 && (
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                                                                            输入明细
                                                                                        </span>
                                                                                        {renderTokenChips(inputStats, "emerald")}
                                                                                    </div>
                                                                                )}
                                                                                {outputStats.length > 0 && (
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                                                                            输出明细
                                                                                        </span>
                                                                                        {renderTokenChips(outputStats, "sky")}
                                                                                    </div>
                                                                                )}
                                                                                {backendStats.length > 0 && (
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                                                                            后端上报
                                                                                        </span>
                                                                                        {renderTokenChips(backendStats, "amber")}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    {(item.parsedToolCalls.length > 0 ||
                                                                        item.payloadText ||
                                                                        (item.rawPayloadText &&
                                                                            item.rawPayloadText !== item.payloadText)) && (
                                                                        <div className="space-y-3 border-t border-slate-200 bg-slate-50/50 px-4 py-4">
                                                                            {renderToolCallCards(item.parsedToolCalls)}
                                                                            {item.payloadText && (
                                                                                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-white px-4 py-4 text-xs leading-6 text-slate-700">
                                                                                    {item.payloadText}
                                                                                </pre>
                                                                            )}
                                                                            {item.rawPayloadText &&
                                                                                item.rawPayloadText !== item.payloadText && (
                                                                                    <details className="rounded-xl border border-slate-200 bg-white">
                                                                                        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-slate-600">
                                                                                            查看原始 SSE
                                                                                        </summary>
                                                                                        <div className="border-t border-slate-200 px-4 py-4">
                                                                                            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-slate-700">
                                                                                                {item.rawPayloadText}
                                                                                            </pre>
                                                                                        </div>
                                                                                    </details>
                                                                                )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )})}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    </div>
);

export default DiagnosticsPage;
