import { apiDocs, groupedApiDocs } from "./apiDocs";
import { ConsoleSideMenu, DocsPage } from "./types";

interface ApiDocsPageProps {
    activeDocsPage: DocsPage;
    activeSideMenu: ConsoleSideMenu;
    gatewayBaseUrl: string;
    adminContact: string;
    expandedApiDoc: string;
    claudeSettingsExample: string;
    claudeOnboardingExample: string;
    setActiveDocsPage: (docsPage: DocsPage) => void;
    setExpandedApiDoc: (updater: string | ((current: string) => string)) => void;
    syncPath: (topMenu: "docs", sideMenu: ConsoleSideMenu, docsPage: DocsPage) => void;
    openApiKeysPage: () => void;
}

const ApiDocsPage = ({
    activeDocsPage,
    activeSideMenu,
    gatewayBaseUrl,
    adminContact,
    expandedApiDoc,
    claudeSettingsExample,
    claudeOnboardingExample,
    setActiveDocsPage,
    setExpandedApiDoc,
    syncPath,
    openApiKeysPage,
}: ApiDocsPageProps) => (
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
                                onClick={openApiKeysPage}
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
);

export default ApiDocsPage;
