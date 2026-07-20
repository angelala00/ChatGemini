import { apiDocs, groupedApiDocs } from "./apiDocs";
import { globalConfig } from "../../config/global";
import { ConsoleSideMenu, DocsPage } from "./types";
import { Link } from "react-router-dom";

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

const aicodePlaceholder = globalConfig.aicode.placeholder;

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
                    { key: "aicode-cli", label: "AICode CLI 接入" },
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
            {activeDocsPage === "aicode-cli" && (
                <div className="flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-semibold">AICode-CLI 安装使用指引</h2>
                        <p className="mt-3 text-sm text-slate-600">
                            AICode-CLI 是平台内部迭代的编码智能体，提供面向日常研发活动的模型交互、MCP、SubAgent、
                            安全护栏、Plan、Goal 和 Skill 市场等能力。
                        </p>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-slate-200">
                        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">特点</th>
                                    <th className="px-4 py-3">说明</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-slate-600">
                                <tr><td className="px-4 py-3 font-medium text-slate-800">自主可控</td><td className="px-4 py-3">支持内网系统定制集成开发，可按企业需求灵活扩展。</td></tr>
                                <tr><td className="px-4 py-3 font-medium text-slate-800">精简高效</td><td className="px-4 py-3">默认系统提示词仅占 Claude Code 的约 1/30，适配内网算力环境。</td></tr>
                                <tr><td className="px-4 py-3 font-medium text-slate-800">输出质量</td><td className="px-4 py-3">模型输出效果可满足日常研发活动需求。</td></tr>
                                <tr><td className="px-4 py-3 font-medium text-slate-800">高级功能</td><td className="px-4 py-3">支持 MCP、SubAgent、安全护栏、Plan、Goal 和 Skill 市场等高级功能。</td></tr>
                                <tr><td className="px-4 py-3 font-medium text-slate-800">数据合规与深度集成</td><td className="px-4 py-3">数据不出内网，已集成 Sonar 检测、缺陷系统、工单和企微等能力。</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-800">步骤一：安装并验证</div>
                        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{`npm cache clean --force

npm i -g @ia-ccun/code-agent-cli --registry=http://nexus.${aicodePlaceholder}.com/repository/npm-org

aicode -v
# 或
aicode-cli -v`}</pre>
                        <p className="mt-3 text-sm text-slate-600">安装完成后，可通过 <code>aicode</code> 或 <code>aicode-cli</code> 全局调用；看到版本号即表示安装成功。</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-800">步骤二：配置模型</div>
                        <p className="mt-2 text-sm text-slate-600">Linux 配置文件路径为 <code>~/.aicode-cli/agent/models.json</code>。请先在 API Keys 页面申请 API Key，再将其填入以下配置。</p>
                        <button type="button" onClick={openApiKeysPage} className="mt-3 text-sm text-blue-700 underline hover:text-blue-800">前往申请 API Key</button>
                        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{`{
  "providers": {
    "aicode": {
      "name": "aicode-llm",
      "baseUrl": "https://ai-llm.${aicodePlaceholder}.com/v1",
      "api": "openai-completions",
      "apiKey": "填写你的 API Key",
      "headers": { "User-Agent": "\${VERSION}" },
      "models": [
        { "id": "glm-5", "name": "glm-5", "reasoning": true, "input": ["text"] },
        {
          "id": "qwen3.6-35b-a3b", "name": "Qwen 3.6", "contextWindow": 120000,
          "maxTokens": 100000, "reasoning": true,
          "thinkingLevelMap": {
            "off": "false", "minimal": true, "low": true, "medium": true,
            "high": "true", "xhigh": "true"
          },
          "compat": {
            "thinkingFormat": "qwen-chat-template", "requiresThinkingAsText": true,
            "supportsDeveloperRole": false, "supportsReasoningEffort": false
          },
          "input": ["text", "image"],
          "cost": { "input": 5, "output": 5, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}`}</pre>
                        <Link to="/market" className="mt-3 inline-block text-sm text-blue-700 underline hover:text-blue-800">查看可用模型清单</Link>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-800">步骤三：开始使用</div>
                        <p className="mt-2 text-sm text-slate-600">安装并配置完成后，在终端执行以下命令进入交互界面；使用 <code>/model</code> 可切换已配置的模型。</p>
                        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">{`aicode

/model`}</pre>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-800">常见问题</div>
                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                            <p><span className="font-medium text-slate-800">命令找不到：</span>确认 npm 全局路径已加入 PATH（<code>echo $PATH</code>）。</p>
                            <p><span className="font-medium text-slate-800">安装失败：</span>请确认 Node.js 版本大于 20，并尝试更换镜像源。</p>
                            <p><span className="font-medium text-slate-800">模型连接失败：</span>检查 API Key 是否正确，以及 baseUrl 是否可达。</p>
                            <p><span className="font-medium text-slate-800">配置不生效：</span>检查 <code>models.json</code> 路径与 JSON 格式。</p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="text-sm font-semibold text-slate-800">更多资料与支持</div>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-blue-700">
                            <li><a href={`https://uni.${aicodePlaceholder}.com/unidoc/#/space/${aicodePlaceholder}/29/page/50290`} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">AICode Agent CLI 编码智能体使用手册</a></li>
                            <li><a href={`https://uni.${aicodePlaceholder}.com/unidoc/#/space/${aicodePlaceholder}/29/page/46884`} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">IDEA 插件 - AICode 帮助手册</a></li>
                            <li><a href={`https://uni.${aicodePlaceholder}.com/unidoc/#/space/${aicodePlaceholder}/29/page/51494`} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">aicode-skill 技能一键安装 CLI 帮助手册</a></li>
                            <li><a href={`https://uni.${aicodePlaceholder}.com/unidoc/#/space/${aicodePlaceholder}/29/page/50881`} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">aicode 集成缺陷系统帮助手册</a></li>
                            <li><a href={`https://uni.${aicodePlaceholder}.com/api/unidoc/v1/resources/2/1782704631072003169_0072a13d.jpg`} target="_blank" rel="noreferrer" className="underline hover:text-blue-800">aicode 集成 Sonar Check 本地检查使用手册</a></li>
                        </ul>
                        <p className="mt-4 text-sm text-slate-600">其他使用问题或需求，请联系平台部：xujianjiang@{aicodePlaceholder}.com。</p>
                    </div>
                </div>
            )}
        </main>
    </div>
);

export default ApiDocsPage;
