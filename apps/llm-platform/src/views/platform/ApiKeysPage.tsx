import { useMemo, useState } from "react";
import {
    GatewayUserSummary,
    GatewayUserTokenInfo,
} from "./types";

interface ApiKeysPageProps {
    apiKeyUser: GatewayUserSummary | null;
    apiKeyLoading: boolean;
    apiKeyError: string | null;
    createTokenError: string | null;
    createdTokenValue: string | null;
    userTokenCount: number;
    userTokenLimit: number;
    projectTokenLimit: number;
    projectTokenCounts: Record<string, number>;
    userLimitReached: boolean;
    copiedToken: string | null;
    createTokenLoading: Record<string, boolean>;
    tokenUpdating: Record<string, boolean>;
    tokenActionError: string | null;
    diagnosticsActionLoading: Record<string, boolean>;
    ownedProjects: NonNullable<GatewayUserSummary["projects"]>;
    openDiagnosticsPage: (tokenId?: string) => void;
    handleCopyToken: (token: string) => void;
    maskToken: (token: string, head?: number, tail?: number) => string;
    createToken: (ownerType: "user" | "project", projectId?: string, note?: string) => void;
    updateTokenStatus: (token: string, enabled: boolean) => void;
    updateTokenNote: (token: string, note: string | null) => void;
    updateDiagnosticsState: (token: GatewayUserTokenInfo, activate: boolean) => void;
}

interface TokenTableProps {
    tokens: GatewayUserTokenInfo[];
    editingToken: string | null;
    editNoteValue: string;
    copiedToken: string | null;
    tokenUpdating: Record<string, boolean>;
    diagnosticsActionLoading: Record<string, boolean>;
    handleCopyToken: (token: string) => void;
    maskToken: (token: string, head?: number, tail?: number) => string;
    setEditNoteValue: (value: string) => void;
    startEditNote: (token: string, currentNote: string | null | undefined) => void;
    saveNote: (token: string) => void;
    cancelEditNote: () => void;
    updateTokenStatus: (token: string, enabled: boolean) => void;
    updateDiagnosticsState: (token: GatewayUserTokenInfo, activate: boolean) => void;
    openDiagnosticsPage: (tokenId?: string) => void;
}

const TokenTable = ({
    tokens,
    editingToken,
    editNoteValue,
    copiedToken,
    tokenUpdating,
    diagnosticsActionLoading,
    handleCopyToken,
    maskToken,
    setEditNoteValue,
    startEditNote,
    saveNote,
    cancelEditNote,
    updateTokenStatus,
    updateDiagnosticsState,
    openDiagnosticsPage,
}: TokenTableProps) => {
    if (tokens.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                暂无 API Keys
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                    <tr>
                        <th className="w-28 px-4 py-3">API Keys</th>
                        <th className="min-w-[120px] px-4 py-3">备注</th>
                        <th className="w-20 px-4 py-3">状态</th>
                        <th className="w-36 px-4 py-3">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {tokens.map((token) => (
                        <tr
                            key={token.token}
                            className="border-t border-slate-100 transition-colors hover:bg-slate-50/30"
                        >
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono">
                                    {maskToken(token.token)}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                {editingToken === token.token ? (
                                    <div className="flex w-full items-center gap-1.5">
                                        <input
                                            type="text"
                                            value={editNoteValue}
                                            onChange={(e) => setEditNoteValue(e.target.value)}
                                            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
                                            placeholder="输入备注..."
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") saveNote(token.token);
                                                if (e.key === "Escape") cancelEditNote();
                                            }}
                                        />
                                        <div className="flex shrink-0 items-center gap-1">
                                            <button
                                                type="button"
                                                className="rounded-md bg-blue-600 p-1 text-white transition hover:bg-blue-700"
                                                onClick={() => saveNote(token.token)}
                                                title="保存"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-slate-200 p-1 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
                                                onClick={cancelEditNote}
                                                title="取消"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="group flex min-h-[28px] cursor-pointer items-center justify-between rounded-lg px-2 py-1 text-xs transition hover:bg-slate-100/50"
                                        onClick={() => startEditNote(token.token, token.note)}
                                        title="点击编辑备注"
                                    >
                                        <span className="block max-w-[calc(100%-16px)] truncate text-slate-700">
                                            {token.note ? token.note : "点击添加备注"}
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="ml-1 h-3 w-3 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </div>
                                )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                                <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                        token.enabled
                                            ? "bg-emerald-50 text-emerald-700"
                                            : "bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    {token.enabled ? "启用" : "禁用"}
                                </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                                <div className="flex items-center gap-1 whitespace-nowrap">
                                    <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
                                        onClick={() => handleCopyToken(token.token)}
                                    >
                                        {copiedToken === token.token ? "已复制" : "复制"}
                                    </button>
                                    <button
                                        type="button"
                                        className={`rounded-lg px-1.5 py-1 text-[11px] font-medium transition ${
                                            token.enabled
                                                ? "border border-rose-100 text-rose-600 hover:bg-rose-50"
                                                : "border border-emerald-100 text-emerald-600 hover:bg-emerald-50"
                                        }`}
                                        onClick={() => updateTokenStatus(token.token, !token.enabled)}
                                        disabled={tokenUpdating[token.token]}
                                    >
                                        {token.enabled ? "禁用" : "启用"}
                                    </button>
                                    {token.diagnosticsAuthorized && token.tokenId && (
                                        <div className="ml-0.5 flex items-center gap-1 border-l border-slate-100 pl-1.5">
                                            <button
                                                type="button"
                                                className={`rounded-lg border px-1.5 py-1 text-[11px] transition ${
                                                    token.diagnosticsActive
                                                        ? "border-blue-200 bg-blue-50 text-blue-700"
                                                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                                }`}
                                                onClick={() =>
                                                    updateDiagnosticsState(
                                                        token,
                                                        !token.diagnosticsActive,
                                                    )
                                                }
                                                disabled={diagnosticsActionLoading[token.tokenId]}
                                            >
                                                {token.diagnosticsActive ? "调试" : "开启调试"}
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] text-slate-600 transition hover:bg-slate-50"
                                                onClick={() => openDiagnosticsPage(token.tokenId)}
                                            >
                                                日志
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

interface TokenSectionProps {
    title: string;
    subtitle: string;
    tokenCountLabel: string;
    createLabel: string;
    createDisabled: boolean;
    onCreate: () => void;
    tokens: GatewayUserTokenInfo[];
    tableProps: TokenTableProps;
}

const TokenSection = ({
    title,
    subtitle,
    tokenCountLabel,
    createLabel,
    createDisabled,
    onCreate,
    tokens,
    tableProps,
}: TokenSectionProps) => (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <div className="text-xs text-slate-500">{subtitle}</div>
            </div>
            <div className="flex items-center gap-3">
                <div className="text-xs text-slate-500">{tokenCountLabel}</div>
                <button
                    type="button"
                    onClick={onCreate}
                    disabled={createDisabled}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        createDisabled
                            ? "bg-slate-100 text-slate-400"
                            : "bg-blue-800 text-white hover:bg-blue-700"
                    }`}
                >
                    {createLabel}
                </button>
            </div>
        </div>
        <div className="mt-4">
            <TokenTable {...tableProps} tokens={tokens} />
        </div>
    </section>
);

const ApiKeysPage = ({
    apiKeyUser,
    apiKeyLoading,
    apiKeyError,
    createTokenError,
    createdTokenValue,
    userTokenCount,
    userTokenLimit,
    projectTokenLimit,
    projectTokenCounts,
    userLimitReached,
    copiedToken,
    createTokenLoading,
    tokenUpdating,
    tokenActionError,
    diagnosticsActionLoading,
    ownedProjects,
    openDiagnosticsPage,
    handleCopyToken,
    maskToken,
    createToken,
    updateTokenStatus,
    updateTokenNote,
    updateDiagnosticsState,
}: ApiKeysPageProps) => {
    const [editingToken, setEditingToken] = useState<string | null>(null);
    const [editNoteValue, setEditNoteValue] = useState("");
    const [createNoteValue, setCreateNoteValue] = useState("");
    const [createTokenType, setCreateTokenType] = useState<"user" | "project" | null>(null);
    const [createTokenProjectId, setCreateTokenProjectId] = useState<string | null>(null);

    const startEditNote = (token: string, currentNote: string | null | undefined) => {
        setEditingToken(token);
        setEditNoteValue(currentNote ?? "");
    };

    const saveNote = (token: string) => {
        const trimmed = editNoteValue.trim();
        updateTokenNote(token, trimmed || null);
        setEditingToken(null);
        setEditNoteValue("");
    };

    const cancelEditNote = () => {
        setEditingToken(null);
        setEditNoteValue("");
    };

    const startCreateToken = (ownerType: "user" | "project", projectId?: string) => {
        setCreateTokenType(ownerType);
        setCreateTokenProjectId(projectId ?? null);
        setCreateNoteValue("");
    };

    const confirmCreateToken = () => {
        if (!createTokenType) return;
        const trimmed = createNoteValue.trim();
        createToken(createTokenType, createTokenProjectId ?? undefined, trimmed || undefined);
        setCreateTokenType(null);
        setCreateTokenProjectId(null);
        setCreateNoteValue("");
    };

    const cancelCreateToken = () => {
        setCreateTokenType(null);
        setCreateTokenProjectId(null);
        setCreateNoteValue("");
    };

    const allTokens = apiKeyUser?.tokens ?? [];
    const personalTokens = useMemo(
        () => allTokens.filter((token) => token.ownerType === "user"),
        [allTokens],
    );
    const projectTokensByProjectId = useMemo(() => {
        const grouped = new Map<string, GatewayUserTokenInfo[]>();
        for (const token of allTokens) {
            if (token.ownerType !== "project" || !token.projectId) {
                continue;
            }
            const existing = grouped.get(token.projectId) ?? [];
            existing.push(token);
            grouped.set(token.projectId, existing);
        }
        return grouped;
    }, [allTokens]);
    const visibleProjectSections = useMemo(
        () =>
            ownedProjects.map((project) => ({
                ...project,
                tokens: projectTokensByProjectId.get(project.id) ?? [],
            })),
        [ownedProjects, projectTokensByProjectId],
    );
    const orphanProjectSections = useMemo(() => {
        const ownedProjectIds = new Set(ownedProjects.map((project) => project.id));
        return [...projectTokensByProjectId.entries()]
            .filter(([projectId]) => !ownedProjectIds.has(projectId))
            .map(([projectId, tokens]) => ({
                id: projectId,
                name: tokens[0]?.projectName?.trim() || `项目 ${projectId}`,
                department: "未出现在项目列表中",
                tokens,
            }));
    }, [ownedProjects, projectTokensByProjectId]);

    const tablePropsBase = {
        editingToken,
        editNoteValue,
        copiedToken,
        tokenUpdating,
        diagnosticsActionLoading,
        handleCopyToken,
        maskToken,
        setEditNoteValue,
        startEditNote,
        saveNote,
        cancelEditNote,
        updateTokenStatus,
        updateDiagnosticsState,
        openDiagnosticsPage,
    };

    const isCreating = createTokenType !== null;
    const createKey =
        createTokenType === "project" ? `project:${createTokenProjectId ?? ""}` : "user";
    const isCreateLoading = isCreating && createTokenLoading[createKey];
    const creatingProject = createTokenProjectId
        ? ownedProjects.find((project) => project.id === createTokenProjectId) ??
          orphanProjectSections.find((project) => project.id === createTokenProjectId)
        : null;

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-slate-900">API Keys</h2>
            <p className="text-sm text-slate-600">
                管理你的 API Keys、启用/禁用状态以及额度。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="text-sm text-slate-500">
                    可用额度：用户 {userTokenCount}/{userTokenLimit || "-"}
                    ，项目 {Object.keys(projectTokenCounts).length}/{projectTokenLimit || "-"}
                </div>
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
            {isCreating && (
                <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <div className="text-sm font-semibold text-blue-800">
                        创建{createTokenType === "project" ? `项目 Token${creatingProject ? ` · ${creatingProject.name}` : ""}` : "个人 Token"}
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                        <input
                            type="text"
                            value={createNoteValue}
                            onChange={(e) => setCreateNoteValue(e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                            placeholder="备注（可选，方便识别用途）"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter") confirmCreateToken();
                                if (e.key === "Escape") cancelCreateToken();
                            }}
                        />
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="rounded-full bg-blue-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                                onClick={confirmCreateToken}
                                disabled={isCreateLoading}
                            >
                                {isCreateLoading ? "创建中..." : "确认创建"}
                            </button>
                            <button
                                type="button"
                                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300"
                                onClick={cancelCreateToken}
                            >
                                取消
                            </button>
                        </div>
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
                    <>
                        <TokenSection
                            title="个人 API Keys"
                            subtitle="仅归属于当前用户个人账号的密钥。"
                            tokenCountLabel={`已创建 ${userTokenCount}/${userTokenLimit || "-"}`}
                            createLabel={
                                createTokenLoading.user
                                    ? "创建中..."
                                    : userLimitReached
                                      ? "额度已满"
                                      : "创建 Token"
                            }
                            createDisabled={Boolean(createTokenLoading.user || userLimitReached)}
                            onCreate={() => startCreateToken("user")}
                            tokens={personalTokens}
                            tableProps={tablePropsBase}
                        />

                        {visibleProjectSections.map((project) => {
                            const projectLimitReached =
                                projectTokenLimit > 0 &&
                                (projectTokenCounts[project.id] ?? 0) >= projectTokenLimit;
                            return (
                                <TokenSection
                                    key={project.id}
                                    title={`${project.name} API Keys`}
                                    subtitle={project.department ?? "未填写部门"}
                                    tokenCountLabel={`已创建 ${project.tokens.length}/${projectTokenLimit || "-"}`}
                                    createLabel={
                                        createTokenLoading[`project:${project.id}`]
                                            ? "创建中..."
                                            : projectLimitReached
                                              ? "额度已满"
                                              : "创建 Token"
                                    }
                                    createDisabled={Boolean(
                                        createTokenLoading[`project:${project.id}`] || projectLimitReached,
                                    )}
                                    onCreate={() => startCreateToken("project", project.id)}
                                    tokens={project.tokens}
                                    tableProps={tablePropsBase}
                                />
                            );
                        })}

                        {orphanProjectSections.map((project) => (
                            <section
                                key={project.id}
                                className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
                            >
                                <div>
                                    <div className="text-sm font-semibold text-amber-900">
                                        {project.name} API Keys
                                    </div>
                                    <div className="text-xs text-amber-700">
                                        该项目未出现在当前项目列表中，但仍返回了可见 Token。
                                    </div>
                                </div>
                                <div className="mt-4">
                                    <TokenTable {...tablePropsBase} tokens={project.tokens} />
                                </div>
                            </section>
                        ))}

                        {visibleProjectSections.length === 0 && orphanProjectSections.length === 0 && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                                暂无项目可创建 Token
                            </div>
                        )}
                    </>
                )}
                {tokenActionError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                        {tokenActionError}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ApiKeysPage;
