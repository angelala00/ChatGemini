import ApiKeysPage from "./ApiKeysPage";
import UsagePage from "./UsagePage";
import {
    ConsoleSideMenu,
    DocsPage,
    GatewayUserSummary,
    GatewayUserTokenInfo,
    ProjectUsageSummary,
    RankingEntry,
    TopMenu,
    UserUsageResponse,
} from "./types";

interface UsageTotals {
    requests: number;
    tokens: number;
}

interface ConsolePageProps {
    activeSideMenu: ConsoleSideMenu;
    activeTopMenu: TopMenu;
    activeDocsPage: DocsPage;
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
    usageRange: string;
    usageError: string | null;
    usageLoading: boolean;
    usageData: UserUsageResponse | null;
    usageTotals: UsageTotals;
    usageRanking: RankingEntry[];
    projectUsage: ProjectUsageSummary[];
    setActiveSideMenu: (sideMenu: ConsoleSideMenu) => void;
    setUsageRange: (range: string) => void;
    syncPath: (topMenu: TopMenu, sideMenu: ConsoleSideMenu, docsPage: DocsPage) => void;
    openDiagnosticsPage: (tokenId?: string) => void;
    handleCopyToken: (token: string) => void;
    maskToken: (token: string, head?: number, tail?: number) => string;
    createToken: (ownerType: "user" | "project", projectId?: string) => void;
    updateTokenStatus: (token: string, enabled: boolean) => void;
    updateDiagnosticsState: (token: GatewayUserTokenInfo, activate: boolean) => void;
    getUsageTotals: (ranking?: RankingEntry[]) => UsageTotals;
}

const ConsolePage = ({
    activeSideMenu,
    activeTopMenu,
    activeDocsPage,
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
    usageRange,
    usageError,
    usageLoading,
    usageData,
    usageTotals,
    usageRanking,
    projectUsage,
    setActiveSideMenu,
    setUsageRange,
    syncPath,
    openDiagnosticsPage,
    handleCopyToken,
    maskToken,
    createToken,
    updateTokenStatus,
    updateDiagnosticsState,
    getUsageTotals,
}: ConsolePageProps) => (
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
                <ApiKeysPage
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
                    openDiagnosticsPage={openDiagnosticsPage}
                    handleCopyToken={handleCopyToken}
                    maskToken={maskToken}
                    createToken={createToken}
                    updateTokenStatus={updateTokenStatus}
                    updateDiagnosticsState={updateDiagnosticsState}
                />
            )}
            {activeSideMenu === "usage" && (
                <UsagePage
                    usageRange={usageRange}
                    usageError={usageError}
                    usageLoading={usageLoading}
                    usageData={usageData}
                    usageTotals={usageTotals}
                    usageRanking={usageRanking}
                    projectUsage={projectUsage}
                    setUsageRange={setUsageRange}
                    getUsageTotals={getUsageTotals}
                />
            )}
        </main>
    </div>
);

export default ConsolePage;
