import exportIcon from "../assets/icons/file-export-solid-white.svg";
import deleteIcon from "../assets/icons/trash-can-solid.svg";
import renameIcon from "../assets/icons/file-pen-solid.svg";
import submitIcon from "../assets/icons/circle-check-solid.svg";
import emptyIcon from "../assets/icons/folder-open-solid.svg";
import moreIcon from "../assets/icons/ellipsis-solid.svg";
import closeIcon from "../assets/icons/xmark-solid.svg";
import regulationIcon from "../assets/icons/zhidu_logo.svg";
import wandIcon from "../assets/icons/ds-logo.svg";
import logoIcon from "../assets/logo.svg";
import editIcon from "../assets/icons/pen-to-square-solid.svg";
import appsIcon from "../assets/icons/apps.svg";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Sessions } from "../store/sessions";
import { useTranslation } from "react-i18next";
import { ReduxStoreProps } from "../config/store";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { handleRequest } from "../helpers/handleRequest";
import { getFullPath } from "../helpers/getDomainAndPath";
import { globalConfig } from "../config/global";
import { normalizeAssetPath } from "../helpers/normalizeAssetPath";

interface SidebarProps {
    readonly title: string;
    readonly expand: boolean;
    readonly gptsFeatureAllowed: boolean;
    readonly limitation?: number;
    readonly sessions: Sessions;
    readonly locales: Record<string, string>;
    readonly currentLocale: string;
    readonly onDeleteSession: (id: string) => void;
    readonly onExportSession: (id: string) => void;
    readonly onSwitchLocale: (locale: string) => void;
    readonly onRenameSession: (id: string, newTitle: string) => void;
}

const APP_VERSION = "v1.0.1";

const releaseHistory = [
    {
        version: "v1.0.1",
        date: "2026.04",
        type: "patch",
        zhTitle: "版本入口与变更记录",
        zhChanges: [
            "侧边栏 Logo 区增加版本号入口。",
            "点击版本号可查看完整功能变更记录，弹窗支持滚动和关闭。",
        ],
        enTitle: "Version Entry And Release Notes",
        enChanges: [
            "Added a version badge to the sidebar logo area.",
            "Clicking the version opens scrollable release notes with close controls.",
        ],
    },
    {
        version: "2026.04",
        date: "2026.04",
        type: "minor",
        zhTitle: "诊断与链路优化",
        zhChanges: [
            "引入链路诊断工具、Trace 查看器及模型原始输入日志。",
            "GPT 助手 chat-v2 流程重构，统一采用 tool-first 附件链路。",
            "支持通过环境变量动态配置模型 ID，增加 GPTS 访问白名单机制。",
            "提高文件上传大小限制，增加工具调用进度和附件预处理状态展示。",
        ],
        enTitle: "Diagnostics And Flow Improvements",
        enChanges: [
            "Added trace diagnostics, Trace Inspector, and raw model input logs.",
            "Refactored the GPT assistant chat-v2 flow around a tool-first attachment pipeline.",
            "Added environment-driven model IDs and GPTS access whitelist support.",
            "Raised upload limits and added live tool progress plus attachment preprocessing status.",
        ],
    },
    {
        version: "2026.03",
        date: "2026.03",
        type: "minor",
        zhTitle: "架构重构与交互升级",
        zhChanges: [
            "引入 llm kernel 基础架构，解耦模型处理逻辑。",
            "上线 gptassistant v2 附件处理流程，优化文档工具响应速度。",
            "重构聊天窗口滚动容器，解决流式输出时的阅读干扰问题。",
            "美化附件展示样式和侧边栏交互，优化 Thinking 兼容输出。",
        ],
        enTitle: "Architecture Refactor And Interaction Upgrade",
        enChanges: [
            "Introduced the llm kernel foundation to decouple model handling.",
            "Released the gptassistant v2 attachment flow for faster document tooling.",
            "Refactored chat scrolling to reduce reading disruption during streaming output.",
            "Improved attachment display, sidebar interactions, and Thinking compatibility.",
        ],
    },
    {
        version: "2026.02",
        date: "2026.02",
        type: "minor",
        zhTitle: "扩展与统计",
        zhChanges: [
            "增加 Claude 模型接入文档，更新 model_tool 功能。",
            "上线项目维度用量统计，支持多模型占比分析。",
        ],
        enTitle: "Extensions And Usage Analytics",
        enChanges: [
            "Added Claude integration documentation and updated model_tool.",
            "Added project-level usage analytics with multi-model share analysis.",
        ],
    },
    {
        version: "2026.01",
        date: "2026.01",
        type: "minor",
        zhTitle: "LLM Platform 上线",
        zhChanges: [
            "新增 platform 页面，支持管理 API Key 和 Token 消耗监控。",
            "增加一键部署脚本及构建流程优化。",
            "敏感配置在前端进行掩码处理。",
        ],
        enTitle: "LLM Platform Launch",
        enChanges: [
            "Added the platform page for API key management and token usage monitoring.",
            "Added one-click deployment scripts and build flow improvements.",
            "Masked sensitive configuration values in the frontend.",
        ],
    },
    {
        version: "2025.12",
        date: "2025.12",
        type: "patch",
        zhTitle: "细节打磨",
        zhChanges: [
            "前端项目全面迁移至 Vite，提升开发和编译速度。",
            "修复思考模式标签在部分流式场景下的闭合问题。",
        ],
        enTitle: "Polish",
        enChanges: [
            "Migrated frontend projects to Vite for faster development and builds.",
            "Fixed Thinking tag closing behavior in some streaming scenarios.",
        ],
    },
    {
        version: "2025.11",
        date: "2025.11",
        type: "patch",
        zhTitle: "功能完善",
        zhChanges: [
            "引入待办事项等辅助开发功能。",
            "修复数据大屏时间筛选器在特定时区下失效的问题。",
        ],
        enTitle: "Feature Completion",
        enChanges: [
            "Added TODO helpers for development workflows.",
            "Fixed dashboard time filters in specific time zones.",
        ],
    },
    {
        version: "2025.10",
        date: "2025.10",
        type: "major",
        zhTitle: "架构重构与数据大屏",
        zhChanges: [
            "项目拆分为 assistant-web、assistant-dashboard 和 assistant-metrics-api。",
            "上线 GPT 助手核心指标总览页面。",
            "实现会话级模型偏好记忆和模型相关上传文件类型限制。",
            "优化 WebSocket 稳定性，修复 VPN 环境下跨服务响应问题。",
        ],
        enTitle: "Architecture Refactor And Metrics Dashboard",
        enChanges: [
            "Split the project into assistant-web, assistant-dashboard, and assistant-metrics-api.",
            "Added the GPT assistant metrics overview dashboard.",
            "Added per-session model preference memory and model-specific upload restrictions.",
            "Improved WebSocket stability and cross-service responses in VPN environments.",
        ],
    },
    {
        version: "2025.09",
        date: "2025.09",
        type: "minor",
        zhTitle: "GPTs 平台化",
        zhChanges: [
            "上线 GPTs 创建与管理 API，支持自定义系统提示词和示例问题。",
            "增加 GPTS 访问白名单，非授权用户隐藏管理入口。",
            "完成 GPTs 相关页面中英文国际化适配。",
            "后端存储迁移至 SQLite 数据库。",
        ],
        enTitle: "GPTs Platformization",
        enChanges: [
            "Added GPTs creation and management APIs with custom prompts and examples.",
            "Added a GPTS access whitelist and hid management entry points for unauthorized users.",
            "Localized GPTs pages in Chinese and English.",
            "Moved backend persistence to SQLite.",
        ],
    },
    {
        version: "2025.08",
        date: "2025.08",
        type: "minor",
        zhTitle: "可视化增强",
        zhChanges: [
            "引入 Markdown 中的 ECharts 渲染支持。",
            "新增 GPTs 独立视图和侧边栏固定/取消固定功能。",
        ],
        enTitle: "Visualization Improvements",
        enChanges: [
            "Added ECharts rendering inside Markdown.",
            "Added a standalone GPTs view and sidebar pin/unpin support.",
        ],
    },
    {
        version: "早期记录",
        date: "2024.06 - 2025.07",
        type: "major",
        zhTitle: "早期记录",
        zhChanges: [
            "GPT 助手 1.0 版本正式上线。",
            "接入 DeepSeek 模型，实现思考模式展示。",
            "制度问答助手上线，支持多轮思考和工具调用。",
            "核心接口由 Dify 迁移至自研后端服务。",
            "接入 SSO 单点登录，支持三端同步展示。",
            "非现场问答助手优化，支持中止回答、代码精简和登录 Session 修复。",
            "上线多个纪委智能助手和模型切换功能。",
        ],
        enTitle: "Early Records",
        enChanges: [
            "Released GPT assistant 1.0.",
            "Integrated DeepSeek with Thinking display support.",
            "Launched the regulation Q&A assistant with multi-turn thinking and tool calls.",
            "Migrated core APIs from Dify to an in-house backend service.",
            "Added SSO login and synchronized display across three clients.",
            "Improved the off-site Q&A assistant with stop-answer support, code cleanup, and session fixes.",
            "Launched multiple discipline inspection assistants and model switching.",
        ],
    },
];

export const Sidebar = (props: SidebarProps) => {
    const { t } = useTranslation();
    const {
        title,
        expand,
        gptsFeatureAllowed,
        limitation,
        sessions,
        locales,
        currentLocale,
        onDeleteSession,
        onExportSession,
        onSwitchLocale,
        onRenameSession,
    } = props;
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const pinnedGpts = useSelector(
        (state: ReduxStoreProps) => state.gpts.pinned
    );
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);

    const [renamingChatTitle, setRenamingChatTitle] = useState<{
        id: string;
        title: string;
    }>({ id: "", title: "" });
    const [sessionsLimitation, setSessionsLimitation] = useState(
        limitation ?? 15
    );
    const [sessionsCategory, setSessionsCategory] = useState<{
        [id: string]: {
            label?: string;
            sessions?: Sessions;
        };
    }>({});

    // const [pinnedGpts, setPinnedGpts] = useState([]);
    const getCategorizedSessions = (
        sessions: Sessions,
        filter: (value: number, index: number, array: number[]) => boolean
    ) =>
        Object.keys(sessions)
            .sort((a, b) => {
                const a_ts = sessions[a][sessions[a].length - 1].timestamp;
                const b_ts = sessions[b][sessions[b].length - 1].timestamp;
                return b_ts - a_ts;
            })
            .map((key) => parseInt(key))
            .filter(filter)
            .map((key) => {
                return { [key.toString()]: sessions[key] };
            })
            .reduce((prev, curr) => {
                return { ...prev, ...curr };
            }, {});

    const isTimestampToday = (ts: number) =>
        new Date(ts).toLocaleDateString() === new Date().toLocaleDateString();

    const isTimestampYesterday = (ts: number) =>
        new Date(ts).toLocaleDateString() ===
        new Date(
            new Date().setDate(new Date().getDate() - 1)
        ).toLocaleDateString();

    const isTimestampEarlier = (ts: number) =>
        new Date(ts).toLocaleDateString() !== new Date().toLocaleDateString() &&
        new Date(ts).toLocaleDateString() !==
            new Date(
                new Date().setDate(new Date().getDate() - 1)
            ).toLocaleDateString();

    useEffect(() => {
        if (!gptsFeatureAllowed) {
            dispatch(updatePinnedGpts([]));
            return;
        }
        handleRequest('GET', getFullPath('/api/gpts/pined') ).then(response_json => {
            // console.log("1111:"+response_json)
            // setPinnedGpts(response_json)
            dispatch(updatePinnedGpts(response_json ?? []));
        }).catch(() => dispatch(updatePinnedGpts([])));
    }, [dispatch, gptsFeatureAllowed]);
        
    useEffect(() => {
        const today = getCategorizedSessions(sessions, isTimestampToday);
        const yesterday = getCategorizedSessions(
            sessions,
            isTimestampYesterday
        );
        const earlier = getCategorizedSessions(sessions, isTimestampEarlier);
        setSessionsCategory({
            today: {
                sessions: today,
                label: t("components.Sidebar.today_label"),
            },
            yesterday: {
                sessions: yesterday,
                label: t("components.Sidebar.yesterday_label"),
            },
            earlier: {
                sessions: earlier,
                label: t("components.Sidebar.earlier_label"),
            },
        });
    }, [t, sessions]);

    useEffect(() => {
        if (!isVersionHistoryOpen) {
            return;
        }

        const handleKeyDown = ({ key }: KeyboardEvent) => {
            if (key === "Escape") {
                setIsVersionHistoryOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isVersionHistoryOpen]);

    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions
    )
    const isChineseLocale = currentLocale.toLowerCase().startsWith("zh");

    return (
        <nav
            className={`bg-slate-900 flex flex-col h-screen overflow-hidden ${
                expand ? "block" : "hidden"
            }`}
        >
            <div className="sticky top-0 bg-slate-900">
                <div className="relative py-4 flex justify-center items-center font-semibold text-gray-100 border-b border-gray-400">
                    <img src={logoIcon} className="w-8 h-8 object-contain"/>
                    <button
                        type="button"
                        className="group absolute bottom-1 right-2 rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] leading-none text-slate-200 transition-all hover:bg-slate-600 hover:text-white"
                        title={t("components.Sidebar.version_tooltip")}
                        aria-label={t("components.Sidebar.version_tooltip")}
                        onClick={() => setIsVersionHistoryOpen(true)}
                    >
                        {APP_VERSION}
                        <span className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-max max-w-[160px] rounded bg-slate-950 px-2 py-1 text-[11px] font-normal leading-4 text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            {t("components.Sidebar.version_tooltip")}
                        </span>
                    </button>
                </div>
                <div
                    className="p-2 mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                    onClick={() => {
                        navigate("/")
                    }}
                >
                    <img src={editIcon} className="w-8 h-8 object-contain"/>
                    {t("components.Sidebar.new_chat")}
                </div>
                {gptsFeatureAllowed && (
                    <div
                        className="p-1 mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                        onClick={() => {
                            navigate("/gpts/")
                        }}
                    >
                        <img src={appsIcon} className="w-8 h-8 object-contain"/>
                        {t("components.Sidebar.gpts")}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-auto min-h-0">
            {gptsFeatureAllowed && pinnedGpts.map(({ gid, name, logo }, index) => {
                console.log
                if (gid === "gptassistant") {
                    return
                }
                return (
                    <div
                        key={gid}
                        className="mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                        onClick={() => {
                            navigate("/g/"+gid)
                        }}
                    >
                        <img
                            src={logo ? normalizeAssetPath(logo) : regulationIcon}
                            className="w-9 h-9 object-contain"
                        />
                        {name}
                    </div>
                )
            })}
            <div className="flex flex-col space-y-2 p-2 mb-auto">
                {Object.keys(sessionsCategory).map((key, index, arr) => {
                    const currentLabel = sessionsCategory[key].label;
                    const currentSessions =
                        sessionsCategory[key].sessions ?? {};
                    const currentSessionsKeys = Object.keys(currentSessions);
                    const isEnablePagination = index === arr.length - 1;
                    const isEmpty = !currentSessionsKeys.length;

                    return (
                        !isEmpty && (
                            <div key={index}>
                                <h3 className="text-gray-500 text-xs py-1">
                                    {currentLabel}
                                </h3>
                                {currentSessionsKeys
                                    .slice(
                                        0,
                                        isEnablePagination
                                            ? sessionsLimitation
                                            : currentSessionsKeys.length
                                    )
                                    .map((id, _index) => {
                                        const currentSession =
                                            currentSessions[id][0];
                                        const currentSessionTitle =
                                            !!currentSession?.title?.length
                                                ? currentSession.title
                                                : currentSession.parts;
                                        let path;
                                        const sessionExtension = sessionExtensions[id];
                                        if (sessionExtension && sessionExtension["gid"]) {
                                            path = `/g/${sessionExtension["gid"]}/chat/${id}`
                                        } else {
                                            path = `/chat/${id}`
                                        }
                                        return (
                                            <div
                                                key={_index}
                                                className="group relative flex rounded-lg items-center justify-between p-2 text-gray-200 hover:bg-slate-600 transition-all space-x-2"
                                                onMouseLeave={() =>
                                                    setActiveMenu(null)
                                                }
                                            >
                                                <Link
                                                    className={`flex-1 text-sm text-left truncate ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? "hidden"
                                                            : ""
                                                    }`}
                                                    to={`${path}`}
                                                >
                                                    {currentSessionTitle}
                                                </Link>
                                                <input
                                                    defaultValue={
                                                        currentSessionTitle
                                                    }
                                                    className={`flex-1 w-full bg-transparent text-sm ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? ""
                                                            : "hidden"
                                                    }`}
                                                    onChange={({ target }) =>
                                                        setRenamingChatTitle(
                                                            (prev) => ({
                                                                ...prev,
                                                                title: target.value,
                                                            })
                                                        )
                                                    }
                                                />
                                                {renamingChatTitle.id !== id && (
                                                    <>
                                                        <div
                                                            className={`space-x-2 ${
                                                                activeMenu === id
                                                                    ? "flex"
                                                                    : "hidden"
                                                            }`}
                                                        >
                                                            <img
                                                                className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                                src={renameIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setRenamingChatTitle({
                                                                        id,
                                                                        title: currentSessionTitle,
                                                                    });
                                                                    setActiveMenu(null);
                                                                }}
                                                            />
                                                            <img
                                                                className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                                src={exportIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setActiveMenu(null);
                                                                    onExportSession(id);
                                                                }}
                                                            />
                                                            <img
                                                                className="cursor-pointer size-3 hover:scale-125 transition-all"
                                                                src={deleteIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setActiveMenu(null);
                                                                    onDeleteSession(id);
                                                                }}
                                                            />
                                                        </div>
                                                        <img
                                                            className={`cursor-pointer size-3 hover:scale-125 transition-all invisible group-hover:visible ${
                                                                activeMenu === id
                                                                    ? "hidden"
                                                                    : ""
                                                            }`}
                                                            src={moreIcon}
                                                            alt=""
                                                            onClick={() =>
                                                                setActiveMenu(id)
                                                            }
                                                        />
                                                    </>
                                                )}
                                                {renamingChatTitle.id === id && (
                                                    <img
                                                        className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                        src={submitIcon}
                                                        alt=""
                                                        onClick={() => {
                                                            const { title } =
                                                                renamingChatTitle;
                                                            if (
                                                                !!title.length &&
                                                                renamingChatTitle.title !==
                                                                    currentSessionTitle
                                                            ) {
                                                                onRenameSession(
                                                                    id,
                                                                    title
                                                                );
                                                            }
                                                            setRenamingChatTitle({
                                                                id: "",
                                                                title: "",
                                                            });
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                {isEnablePagination &&
                                    currentSessionsKeys.length >
                                        sessionsLimitation && (
                                        <div className="text-center m-2">
                                            <button
                                                className="font-semibold text-gray-400 hover:text-gray-200 text-sm transition-all"
                                                onClick={() =>
                                                    setSessionsLimitation(
                                                        (state) => state + 5
                                                    )
                                                }
                                            >
                                                {t(
                                                    "components.Sidebar.load_more"
                                                )}
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )
                    );
                })}
            </div>
            {Object.values(sessionsCategory)
                .map(({ sessions }) => sessions ?? {})
                .every((sessions) => !Object.keys(sessions).length) && (
                <div className="p-2 text-center text-gray-300/50 mb-[calc(50vh-4rem)] flex flex-col gap-4">
                    <img src={emptyIcon} alt="" className="mx-auto size-10" />
                    {t("components.Sidebar.no_history_chat")}
                </div>
            )}
            </div>
            <div className="sticky bottom-0 border-t border-slate-700/80 bg-slate-900/98 px-4 py-3 text-center text-xs">
                <span className="text-slate-400">技术支持</span>
                <span className="mx-1.5 text-slate-500">@</span>
                <span className="font-medium text-slate-100">{globalConfig.supportContact}</span>
            </div>
            {isVersionHistoryOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="release-history-title"
                    onClick={() => setIsVersionHistoryOpen(false)}
                >
                    <div
                        className="flex max-h-[78vh] w-full max-w-[560px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h2
                                    id="release-history-title"
                                    className="text-base font-semibold text-slate-900"
                                >
                                    {t("components.Sidebar.release_history_title")}
                                </h2>
                                <p className="mt-1 text-xs font-normal text-slate-500">
                                    {t("components.Sidebar.release_history_subtitle", {
                                        version: APP_VERSION,
                                    })}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="rounded-md p-2 transition-colors hover:bg-slate-100"
                                aria-label={t("components.Sidebar.close_release_history")}
                                onClick={() => setIsVersionHistoryOpen(false)}
                            >
                                <img src={closeIcon} alt="" className="size-4" />
                            </button>
                        </div>
                        <div className="min-h-0 overflow-y-auto px-5 py-4">
                            <div className="space-y-4">
                                {releaseHistory.map((release) => {
                                    const title = isChineseLocale
                                        ? release.zhTitle
                                        : release.enTitle;
                                    const changes = isChineseLocale
                                        ? release.zhChanges
                                        : release.enChanges;

                                    return (
                                        <section
                                            key={`${release.version}-${release.date}`}
                                            className="border-l-2 border-slate-200 pl-4"
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold text-slate-900">
                                                    {release.version}
                                                </span>
                                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-500">
                                                    {release.type}
                                                </span>
                                                <span className="text-xs text-slate-500">
                                                    {release.date}
                                                </span>
                                            </div>
                                            <h3 className="mt-1 text-sm font-medium text-slate-800">
                                                {title}
                                            </h3>
                                            <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                                                {changes.map((change) => (
                                                    <li key={change}>- {change}</li>
                                                ))}
                                            </ul>
                                        </section>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </nav>
    );
};
