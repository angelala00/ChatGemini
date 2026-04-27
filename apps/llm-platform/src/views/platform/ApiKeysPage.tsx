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
    createToken: (ownerType: "user" | "project", projectId?: string) => void;
    updateTokenStatus: (token: string, enabled: boolean) => void;
    updateDiagnosticsState: (token: GatewayUserTokenInfo, activate: boolean) => void;
}

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
    updateDiagnosticsState,
}: ApiKeysPageProps) => (
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
                                            {token.diagnosticsAuthorized && token.tokenId && (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="rounded-full border border-blue-200 px-3 py-1 text-xs text-blue-700 transition hover:border-blue-300"
                                                        onClick={() =>
                                                            updateDiagnosticsState(
                                                                token,
                                                                !token.diagnosticsActive,
                                                            )
                                                        }
                                                        disabled={diagnosticsActionLoading[token.tokenId]}
                                                    >
                                                        {diagnosticsActionLoading[token.tokenId]
                                                            ? "处理中..."
                                                            : token.diagnosticsActive
                                                                ? "关闭调试"
                                                                : "开启调试"}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-slate-300"
                                                        onClick={() => openDiagnosticsPage(token.tokenId)}
                                                    >
                                                        查看日志
                                                    </button>
                                                </>
                                            )}
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
);

export default ApiKeysPage;
