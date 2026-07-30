import { useMemo, useState } from "react";
import {
    GatewayEffectiveSpaceSummary,
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
    copiedToken: string | null;
    createTokenLoading: Record<string, boolean>;
    tokenUpdating: Record<string, boolean>;
    tokenActionError: string | null;
    diagnosticsActionLoading: Record<string, boolean>;
    ownedProjects: NonNullable<GatewayUserSummary["projects"]>;
    openDiagnosticsPage: (tokenId?: string) => void;
    handleCopyToken: (token: string) => void;
    maskToken: (token: string, head?: number, tail?: number) => string;
    createToken: (ownerType: "user" | "project", spaceId: string, projectId?: string, note?: string) => void;
    deleteToken: (token: string) => void;
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
    deleteToken: (token: string) => void;
    updateDiagnosticsState: (token: GatewayUserTokenInfo, activate: boolean) => void;
    openDiagnosticsPage: (tokenId?: string) => void;
    showSpaceColumn?: boolean;
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
    deleteToken,
    updateDiagnosticsState,
    openDiagnosticsPage,
    showSpaceColumn = false,
}: TokenTableProps) => {
    if (tokens.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                暂无 API Keys
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className={`w-full text-left text-sm ${showSpaceColumn ? "min-w-[760px]" : "min-w-[640px]"}`}>
                <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400">
                    <tr>
                        <th className="w-28 px-4 py-3">API Keys</th>
                        <th className="min-w-[120px] px-4 py-3">备注</th>
                        {showSpaceColumn ? <th className="w-36 px-4 py-3">服务空间</th> : null}
                        <th className="w-20 px-4 py-3">状态</th>
                        <th className="w-44 px-4 py-3">操作</th>
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
                            {showSpaceColumn ? <td className="px-4 py-3">
                                {token.spaceId ? (
                                    <div>
                                        <div className="text-xs font-medium text-slate-700">
                                            {token.spaceLabel || token.spaceId}
                                        </div>
                                        <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                                            {token.spaceId}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-amber-700">旧 Key · 兼容范围</span>
                                )}
                            </td> : null}
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
                                    <button
                                        type="button"
                                        className="rounded-lg border border-rose-100 px-1.5 py-1 text-[11px] text-rose-600 transition hover:bg-rose-50"
                                        onClick={() => deleteToken(token.token)}
                                        disabled={tokenUpdating[token.token]}
                                    >
                                        吊销
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
    spaces: GatewayEffectiveSpaceSummary[];
    tokens: GatewayUserTokenInfo[];
    tokenLimit: number;
    tableProps: TokenTableProps;
}

const countTokensInSpace = (
    tokens: GatewayUserTokenInfo[],
    spaces: GatewayEffectiveSpaceSummary[],
    spaceId: string,
) => {
    const defaultSpaceId = spaces.find((space) => space.isDefault)?.id;
    return tokens.filter((token) => (token.spaceId || defaultSpaceId) === spaceId).length;
};

const hasSpaceWithRemainingQuota = (
    tokens: GatewayUserTokenInfo[],
    spaces: GatewayEffectiveSpaceSummary[],
    tokenLimit: number,
) =>
    spaces.some(
        (space) =>
            space.available &&
            (tokenLimit <= 0 || countTokensInSpace(tokens, spaces, space.id) < tokenLimit),
    );

const TokenSection = ({
    title,
    subtitle,
    tokenCountLabel,
    createLabel,
    createDisabled,
    onCreate,
    spaces,
    tokens,
    tokenLimit,
    tableProps,
}: TokenSectionProps) => {
    const showSpaceContext = spaces.length > 1;
    return (
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
        {showSpaceContext ? <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400">可用服务空间</span>
            {spaces.filter((space) => space.available).length > 0 ? (
                spaces.filter((space) => space.available).map((space) => (
                    <span key={space.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        {space.label} · {countTokensInSpace(tokens, spaces, space.id)}/{tokenLimit || "-"} 个 Key
                        {" · "}{space.modelCount} 个模型
                    </span>
                ))
            ) : (
                <span className="text-amber-700">暂无，请联系管理员授权</span>
            )}
        </div> : null}
        <div className="mt-4">
            <TokenTable
                {...tableProps}
                tokens={tokens}
                showSpaceColumn={showSpaceContext}
            />
        </div>
      </section>
    );
};

const ApiKeysPage = ({
    apiKeyUser,
    apiKeyLoading,
    apiKeyError,
    createTokenError,
    createdTokenValue,
    userTokenCount,
    userTokenLimit,
    projectTokenLimit,
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
    deleteToken,
    updateTokenStatus,
    updateTokenNote,
    updateDiagnosticsState,
}: ApiKeysPageProps) => {
    const [editingToken, setEditingToken] = useState<string | null>(null);
    const [editNoteValue, setEditNoteValue] = useState("");
    const [createNoteValue, setCreateNoteValue] = useState("");
    const [createTokenType, setCreateTokenType] = useState<"user" | "project" | null>(null);
    const [createTokenProjectId, setCreateTokenProjectId] = useState<string | null>(null);
    const [createSpaceId, setCreateSpaceId] = useState("");

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

    const startCreateToken = (
        ownerType: "user" | "project",
        spaces: GatewayEffectiveSpaceSummary[],
        tokens: GatewayUserTokenInfo[],
        tokenLimit: number,
        projectId?: string,
    ) => {
        setCreateTokenType(ownerType);
        setCreateTokenProjectId(projectId ?? null);
        setCreateSpaceId(
            spaces.find(
                (space) =>
                    space.available &&
                    (tokenLimit <= 0 ||
                        countTokensInSpace(tokens, spaces, space.id) < tokenLimit),
            )?.id ?? "",
        );
        setCreateNoteValue("");
    };

    const confirmCreateToken = () => {
        if (!createTokenType || !createSpaceId) return;
        const trimmed = createNoteValue.trim();
        createToken(
            createTokenType,
            createSpaceId,
            createTokenProjectId ?? undefined,
            trimmed || undefined,
        );
        setCreateTokenType(null);
        setCreateTokenProjectId(null);
        setCreateSpaceId("");
        setCreateNoteValue("");
    };

    const cancelCreateToken = () => {
        setCreateTokenType(null);
        setCreateTokenProjectId(null);
        setCreateSpaceId("");
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
                spaces: [],
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
        deleteToken,
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
    const creatingSpaces =
        createTokenType === "project"
            ? creatingProject?.spaces ?? []
            : apiKeyUser?.spaces ?? [];
    const selectedCreatingSpace = creatingSpaces.find((space) => space.id === createSpaceId);
    const creatingTokens =
        createTokenType === "project" ? creatingProject?.tokens ?? [] : personalTokens;
    const creatingTokenLimit =
        createTokenType === "project" ? projectTokenLimit : userTokenLimit;
    const selectedCreatingSpaceTokenCount = selectedCreatingSpace
        ? countTokensInSpace(creatingTokens, creatingSpaces, selectedCreatingSpace.id)
        : 0;
    const selectedCreatingSpaceLimitReached =
        Boolean(selectedCreatingSpace) &&
        creatingTokenLimit > 0 &&
        selectedCreatingSpaceTokenCount >= creatingTokenLimit;
    const showCreatingSpaceSelector = creatingSpaces.length > 1;

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-slate-900">API Keys</h2>
            <p className="text-sm text-slate-600">
                管理你的 API Keys、启用/禁用状态以及额度。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="text-sm text-slate-500">
                    额度按服务空间独立计算：个人每个 Space 最多 {userTokenLimit || "-"} 个，
                    项目每个 Space 最多 {projectTokenLimit || "-"} 个
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
                        {showCreatingSpaceSelector ? <label className="grid gap-1.5">
                            <span className="text-xs font-medium text-blue-900">服务空间</span>
                            <select
                                value={createSpaceId}
                                onChange={(event) => setCreateSpaceId(event.target.value)}
                                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
                            >
                                {creatingSpaces.map((space) => (
                                    <option
                                        key={space.id}
                                        value={space.id}
                                        disabled={
                                            !space.available ||
                                            (creatingTokenLimit > 0 &&
                                                countTokensInSpace(
                                                    creatingTokens,
                                                    creatingSpaces,
                                                    space.id,
                                                ) >= creatingTokenLimit)
                                        }
                                    >
                                        {space.label} · {!space.available
                                            ? "当前不可用"
                                            : creatingTokenLimit > 0 &&
                                                countTokensInSpace(
                                                    creatingTokens,
                                                    creatingSpaces,
                                                    space.id,
                                                ) >= creatingTokenLimit
                                              ? `${creatingTokenLimit}/${creatingTokenLimit} 个 Key，额度已满`
                                              : `${countTokensInSpace(creatingTokens, creatingSpaces, space.id)}/${creatingTokenLimit || "-"} 个 Key，${space.modelCount} 个模型可用`}
                                    </option>
                                ))}
                            </select>
                            {selectedCreatingSpace ? (
                                <span className="text-xs text-blue-700">
                                    Key 将绑定到该 Space；接入位置由平台自动管理。
                                </span>
                            ) : null}
                        </label> : null}
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
                                disabled={
                                    isCreateLoading ||
                                    !createSpaceId ||
                                    selectedCreatingSpaceLimitReached
                                }
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
                            tokenCountLabel={`共 ${userTokenCount} 个 · 每个 Space 最多 ${userTokenLimit || "-"}`}
                            createLabel={
                                createTokenLoading.user
                                    ? "创建中..."
                                    : !hasSpaceWithRemainingQuota(
                                          personalTokens,
                                          apiKeyUser.spaces ?? [],
                                          userTokenLimit,
                                      )
                                      ? (apiKeyUser.spaces ?? []).some((space) => space.available)
                                          ? "各 Space 额度已满"
                                          : "暂无可用 Space"
                                      : "创建 Token"
                            }
                            createDisabled={Boolean(
                                createTokenLoading.user ||
                                !hasSpaceWithRemainingQuota(
                                    personalTokens,
                                    apiKeyUser.spaces ?? [],
                                    userTokenLimit,
                                ),
                            )}
                            onCreate={() =>
                                startCreateToken(
                                    "user",
                                    apiKeyUser.spaces ?? [],
                                    personalTokens,
                                    userTokenLimit,
                                )
                            }
                            spaces={apiKeyUser.spaces ?? []}
                            tokens={personalTokens}
                            tokenLimit={userTokenLimit}
                            tableProps={tablePropsBase}
                        />

                        {visibleProjectSections.map((project) => {
                            const projectHasRemainingQuota = hasSpaceWithRemainingQuota(
                                project.tokens,
                                project.spaces ?? [],
                                projectTokenLimit,
                            );
                            return (
                                <TokenSection
                                    key={project.id}
                                    title={`${project.name} API Keys`}
                                    subtitle={project.department ?? "未填写部门"}
                                    tokenCountLabel={`共 ${project.tokens.length} 个 · 每个 Space 最多 ${projectTokenLimit || "-"}`}
                                    createLabel={
                                        createTokenLoading[`project:${project.id}`]
                                            ? "创建中..."
                                            : !projectHasRemainingQuota
                                              ? (project.spaces ?? []).some((space) => space.available)
                                                  ? "各 Space 额度已满"
                                                  : "暂无可用 Space"
                                              : "创建 Token"
                                    }
                                    createDisabled={Boolean(
                                        createTokenLoading[`project:${project.id}`] ||
                                        !projectHasRemainingQuota,
                                    )}
                                    onCreate={() =>
                                        startCreateToken(
                                            "project",
                                            project.spaces ?? [],
                                            project.tokens,
                                            projectTokenLimit,
                                            project.id,
                                        )
                                    }
                                    spaces={project.spaces ?? []}
                                    tokens={project.tokens}
                                    tokenLimit={projectTokenLimit}
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
