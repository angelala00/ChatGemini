import submitIcon from "../assets/icons/circle-check-solid.svg";
import emptyIcon from "../assets/icons/folder-open-solid.svg";
import closeIcon from "../assets/icons/xmark-solid.svg";
import regulationIcon from "../assets/icons/zhidu_logo.svg";
import wandIcon from "../assets/icons/ds-logo.svg";
import logoIcon from "../assets/logo.svg";
import appsIcon from "../assets/icons/apps.svg";
import {
    ShieldCheckIcon,
    ChevronDownIcon,
    EllipsisHorizontalIcon,
    ClockIcon,
    Cog6ToothIcon,
    MicrophoneIcon,
    PencilSquareIcon,
    PlusCircleIcon,
    TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Sessions } from "../store/sessions";
import { useTranslation } from "react-i18next";
import { ReduxStoreProps } from "../config/store";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { handleRequest } from "../helpers/handleRequest";
import { getFullPath } from "../helpers/getDomainAndPath";
import { globalConfig } from "../config/global";
import { normalizeAssetPath } from "../helpers/normalizeAssetPath";
import { SessionSummary } from "../types/sessionHistory";

interface SidebarProps {
    readonly title: string;
    readonly expand: boolean;
    readonly gptsFeatureAllowed: boolean;
    readonly voiceLabAllowed: boolean;
    readonly adminAllowed: boolean;
    readonly userName: string;
    readonly limitation?: number;
    readonly sessions: Sessions;
    readonly sessionSummaries: SessionSummary[];
    readonly locales: Record<string, string>;
    readonly currentLocale: string;
    readonly onDeleteSession: (id: string) => void;
    readonly onSwitchLocale: (locale: string) => void;
    readonly onRenameSession: (id: string, newTitle: string) => void;
    readonly onToggleSidebar: () => void;
}

const APP_VERSION = "v1.3.1";

const releaseHistory = [
    {
        version: "v1.3.1",
        date: "2026.06",
        type: "patch",
        zhTitle: "GPT 页面视觉统一",
        zhChanges: [
            "重新设计更多助手和创建 GPT 页面，使其与主聊天助手保持统一的视觉语言。",
            "优化助手探索卡片、配置表单、知识文件和权限区域的层级与交互。",
        ],
        enTitle: "Unified GPT Page Design",
        enChanges: [
            "Redesigned the Explore GPTs and Create GPT pages to match the main chat assistant.",
            "Refined assistant cards, configuration forms, knowledge files, and visibility controls.",
        ],
    },
    {
        version: "v1.3.0",
        date: "2026.06",
        type: "minor",
        zhTitle: "GPT 长期知识文件",
        zhChanges: [
            "创建和编辑 GPT 时支持维护助手全局长期知识文件。",
            "GPT 会在需要资料时通过文档工具按需读取知识文件，不会默认把全部正文放入上下文。",
        ],
        enTitle: "Long-term GPT Knowledge Files",
        enChanges: [
            "Added management of assistant-level long-term knowledge files when creating or editing GPTs.",
            "GPTs now read knowledge files on demand through document tools instead of injecting all file content by default.",
        ],
    },
    {
        version: "v1.2.1",
        date: "2026.06",
        type: "patch",
        zhTitle: "默认中文与语言切换",
        zhChanges: [
            "新用户默认进入中文界面。",
            "账号菜单新增系统设置入口，可在设置中切换界面语言。",
        ],
        enTitle: "Default Chinese and Language Switcher",
        enChanges: [
            "New users now enter the app in Simplified Chinese by default.",
            "Added System Settings to the account menu, with language switching available in the settings dialog.",
        ],
    },
    {
        version: "v1.2.0",
        date: "2026.06",
        type: "minor",
        zhTitle: "管理员配置页",
        zhChanges: [
            "增加管理后台能力，支持有权限的管理员统一维护模型、权限、功能开关等核心配置。",
            "聊天历史重构，由存浏览器改成存服务端，并且进行加密存储。",
        ],
        enTitle: "Admin Configuration Console",
        enChanges: [
            "Added admin console capabilities so authorized administrators can centrally maintain models, permissions, feature switches, and other core settings.",
            "Reworked chat history from browser storage to encrypted server-side storage.",
        ],
    },
    {
        version: "v1.1.2",
        date: "2026.05",
        type: "patch",
        zhTitle: "附件交互修复",
        zhChanges: [
            "修复未输入正文时误清空已上传附件的问题。",
            "优化发送前后的输入区状态，减少附件和文本被误清空的情况。",
            "上传图片和查看历史图片时，缩略图与预览体验更稳定。",
            "PPT、Word、Excel、PDF 等附件的类型展示更清晰。",
            "未填写正文时会禁用发送按钮，减少无效点击。",
            "点击预置问题后，输入框和发送按钮状态会正确同步。",
            "修复制度问答助手无法正常发起提问的问题，提升问答稳定性。",
        ],
        enTitle: "Attachment Interaction Fixes",
        enChanges: [
            "Fixed an issue where attachments could be cleared when no message text was entered.",
            "Improved composer state before and after sending to reduce accidental text or attachment clearing.",
            "Made image thumbnails and history image previews more reliable.",
            "Improved file type display for PPT, Word, Excel, PDF, and similar attachments.",
            "Disabled sending until message text is entered to reduce invalid clicks.",
            "Kept the composer and send button in sync after selecting preset prompts.",
            "Fixed an issue that could prevent the regulation assistant from starting a request successfully, improving answer stability.",
        ],
    },
    {
        version: "v1.1.1",
        date: "2026.05",
        type: "patch",
        zhTitle: "助手入口显示修复",
        zhChanges: [
            "修复部分用户侧边栏不显示制度问答助手入口的问题。",
        ],
        enTitle: "Assistant Entry Display Fix",
        enChanges: [
            "Fixed an issue where the regulation assistant entry was missing from the sidebar for some users.",
        ],
    },
    {
        version: "v1.1.0",
        date: "2026.05",
        type: "minor",
        zhTitle: "附件格式扩展",
        zhChanges: [
            "主 AI 助手新增 Markdown、CSV 和 PPTX 文件上传支持。",
            "上传后的 Markdown、CSV 和 PPTX 附件可参与文档文本提取和对话分析。",
        ],
        enTitle: "Attachment Format Expansion",
        enChanges: [
            "Added Markdown, CSV, and PPTX upload support to the main AI assistant.",
            "Markdown, CSV, and PPTX attachments can now be extracted as text for chat analysis.",
        ],
    },
    {
        version: "v1.0.3",
        date: "2026.04",
        type: "patch",
        zhTitle: "聊天界面交互细节优化",
        zhChanges: [
            "优化侧边栏会话、用户菜单、模型选择和新建会话页的交互细节。",
            "优化新建会话页展示，让默认助手和专属助手的欢迎信息更清晰。",
        ],
        enTitle: "Chat UI Interaction Polish",
        enChanges: [
            "Polished sidebar session items, profile menu, model selector, and new chat interactions.",
            "Improved the new chat welcome page so default and dedicated assistants are easier to distinguish.",
        ],
    },
    {
        version: "v1.0.2",
        date: "2026.04",
        type: "patch",
        zhTitle: "聊天界面视觉基线优化",
        zhChanges: [
            "统一聊天主页字体、字号和正文行高。",
            "调整侧边栏、顶部栏、消息卡片和输入区的浅色视觉层级。",
        ],
        enTitle: "Chat UI Visual Baseline",
        enChanges: [
            "Unified the chat home font stack, sizing, and body line height.",
            "Refined the light visual hierarchy for the sidebar, topbar, message cards, and composer.",
        ],
    },
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
        version: "v0.9.0",
        date: "2026.04",
        type: "minor",
        zhTitle: "诊断与链路优化",
        zhChanges: [
            "优化 GPT 助手的附件处理流程，提升文档分析稳定性。",
            "增加助手访问控制能力，未授权用户不会看到对应入口。",
            "提高文件上传上限，并展示附件处理和工具调用进度。",
        ],
        enTitle: "Diagnostics And Flow Improvements",
        enChanges: [
            "Added diagnostic tools to help troubleshoot complex chats and attachment processing.",
            "Improved GPT assistant attachment handling for more stable document analysis.",
            "Added assistant access controls so unauthorized users do not see restricted entries.",
            "Raised upload limits and added visible progress for attachment processing and tool calls.",
        ],
    },
    {
        version: "v0.8.0",
        date: "2026.03",
        type: "minor",
        zhTitle: "架构重构与交互升级",
        zhChanges: [
            "升级底层对话处理能力，让不同模型和助手接入更稳定。",
            "优化附件处理流程，提升文档读取和分析速度。",
            "重构聊天窗口滚动容器，解决流式输出时的阅读干扰问题。",
            "优化附件展示、侧边栏交互和思考内容显示效果。",
        ],
        enTitle: "Architecture Refactor And Interaction Upgrade",
        enChanges: [
            "Upgraded the underlying chat processing for more stable model and assistant integrations.",
            "Improved attachment handling for faster document reading and analysis.",
            "Refactored chat scrolling to reduce reading disruption during streaming output.",
            "Improved attachment display, sidebar interactions, and reasoning content rendering.",
        ],
    },
    {
        version: "v0.7.0",
        date: "2026.01",
        type: "minor",
        zhTitle: "模型服务管理上线",
        zhChanges: [
            "优化部署和构建流程，提升发布效率。",
            "敏感配置默认做隐藏展示，降低误泄露风险。",
        ],
        enTitle: "Model Service Management Launch",
        enChanges: [
            "Added a model service management page for API keys and usage monitoring.",
            "Improved deployment and build flows for more efficient releases.",
            "Masked sensitive configuration values by default to reduce leakage risk.",
        ],
    },
    {
        version: "v0.6.1",
        date: "2025.12",
        type: "patch",
        zhTitle: "细节打磨",
        zhChanges: [
            "优化页面构建和加载体验。",
            "修复部分流式回答中思考内容显示不完整的问题。",
        ],
        enTitle: "Polish",
        enChanges: [
            "Improved page build and loading experience.",
            "Fixed incomplete reasoning display in some streaming responses.",
        ],
    },
    {
        version: "v0.6.0",
        date: "2025.11",
        type: "minor",
        zhTitle: "功能完善",
        zhChanges: [
            "修复数据大屏在部分时区下时间筛选不准确的问题。",
        ],
        enTitle: "Feature Completion",
        enChanges: [
            "Added internal task management helpers.",
            "Fixed inaccurate dashboard time filtering in some time zones.",
        ],
    },
    {
        version: "v0.5.0",
        date: "2025.10",
        type: "minor",
        zhTitle: "架构重构与数据大屏",
        zhChanges: [
            "完成应用结构升级，为聊天、数据看板和统计服务分别优化。",
            "上线 GPT 助手核心指标总览页面。",
            "实现会话级模型偏好记忆和模型相关上传文件类型限制。",
        ],
        enTitle: "Architecture Refactor And Metrics Dashboard",
        enChanges: [
            "Upgraded the app structure to better support chat, dashboards, and metrics services.",
            "Added the GPT assistant metrics overview dashboard.",
            "Added per-session model preference memory and model-specific upload restrictions.",
            "Improved connection stability and response behavior in VPN environments.",
        ],
    },
    {
        version: "v0.4.0",
        date: "2025.09",
        type: "minor",
        zhTitle: "GPTs 平台化",
        zhChanges: [
            "上线 GPTs 创建与管理能力，支持自定义提示词和示例问题。",
            "增加 GPTS 访问控制，非授权用户不会看到管理入口。",
            "GPTs 相关页面支持中英文显示。",
            "优化后台数据存储方式，提升本地部署便利性。",
        ],
        enTitle: "GPTs Platformization",
        enChanges: [
            "Added GPTs creation and management with custom prompts and example questions.",
            "Added GPTS access control so unauthorized users do not see management entry points.",
            "Added Chinese and English display support for GPTs pages.",
            "Improved backend data storage for easier local deployment.",
        ],
    },
    {
        version: "v0.3.0",
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
        version: "v0.1.0",
        date: "2024.06 - 2025.07",
        type: "minor",
        zhTitle: "早期版本",
        zhChanges: [
            "GPT 助手 1.0 版本正式上线。",
            "接入 DeepSeek 模型，实现思考模式展示。",
            "制度问答助手上线，支持多轮思考和工具调用。",
            "核心接口由 Dify 迁移至自研后端服务。",
            "接入 SSO 单点登录，支持三端同步展示。",
            "非现场问答助手优化，支持中止回答、代码精简和登录 Session 修复。",
            "上线多个纪委智能助手和模型切换功能。",
        ],
        enTitle: "Early Releases",
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
        voiceLabAllowed,
        adminAllowed,
        userName,
        limitation,
        sessions,
        sessionSummaries,
        locales,
        currentLocale,
        onDeleteSession,
        onSwitchLocale,
        onRenameSession,
        onToggleSidebar,
    } = props;
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const pinnedGpts = useSelector(
        (state: ReduxStoreProps) => state.gpts.pinned
    );
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [activeMenuPosition, setActiveMenuPosition] = useState<{
        left: number;
        top: number;
    } | null>(null);
    const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
    const profileMenuRef = useRef<HTMLDivElement>(null);
    const historyLongPressTimerRef = useRef<number | null>(null);
    const historyLongPressTriggeredRef = useRef(false);

    const [renamingChatTitle, setRenamingChatTitle] = useState<{
        id: string;
        title: string;
    }>({ id: "", title: "" });
    const [sessionsLimitation, setSessionsLimitation] = useState(
        limitation ?? 15
    );
    const isNewChatActive = location.pathname === "/";
    const displayUserName = userName || "User";
    const avatarText = displayUserName.trim().charAt(0).toUpperCase() || "U";
    const visiblePinnedGpts = pinnedGpts.filter(({ gid }) => gid !== "gptassistant");
    const assistantSectionOffset = visiblePinnedGpts.length > 0
        ? "-mt-2"
        : gptsFeatureAllowed
          ? "-mt-2"
          : "";
    const historySectionSpacing =
        visiblePinnedGpts.length > 0
            ? "mt-2.5 pt-2.5"
            : gptsFeatureAllowed
              ? "mt-0.5 pt-2"
              : "mt-2 pt-2.5";

    const historySessionKeys = useMemo(
        () => sessionSummaries.map((item) => item.conversation_id),
        [sessionSummaries],
    );
    const sessionSummaryMap = useMemo(
        () =>
            sessionSummaries.reduce<Record<string, SessionSummary>>((acc, item) => {
                acc[item.conversation_id] = item;
                return acc;
            }, {}),
        [sessionSummaries],
    );

    useEffect(() => {
        return () => cancelHistoryLongPress();
    }, []);

    useEffect(() => {
        handleRequest('GET', getFullPath('/api/gpts/pined') ).then(response_json => {
            // console.log("1111:"+response_json)
            // setPinnedGpts(response_json)
            dispatch(updatePinnedGpts(response_json ?? []));
        }).catch(() => dispatch(updatePinnedGpts([])));
    }, [dispatch]);
        
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

    useEffect(() => {
        if (!isSettingsOpen) {
            return;
        }

        const handleKeyDown = ({ key }: KeyboardEvent) => {
            if (key === "Escape") {
                setIsSettingsOpen(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSettingsOpen]);

    useEffect(() => {
        if (!isProfileMenuOpen) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            if (profileMenuRef.current?.contains(event.target as Node)) {
                return;
            }
            setIsProfileMenuOpen(false);
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [isProfileMenuOpen]);

    useEffect(() => {
        if (!activeMenu) {
            return;
        }

        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest("[data-history-menu-root]")) {
                return;
            }
            setActiveMenu(null);
            setActiveMenuPosition(null);
        };

        window.addEventListener("mousedown", handlePointerDown);
        return () => window.removeEventListener("mousedown", handlePointerDown);
    }, [activeMenu]);

    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions
    )
    const isHistoryEmpty = historySessionKeys.length === 0;
    const isChineseLocale = currentLocale.toLowerCase().startsWith("zh");
    const closeMobileSidebar = () => {
        if (expand && window.matchMedia("(max-width: 900px)").matches) {
            onToggleSidebar();
        }
    };
    const cancelHistoryLongPress = () => {
        if (historyLongPressTimerRef.current !== null) {
            window.clearTimeout(historyLongPressTimerRef.current);
            historyLongPressTimerRef.current = null;
        }
    };
    const setHistoryMenuPositionFromRect = (
        rect: DOMRect,
        options?: { align?: "trigger" | "left" },
    ) => {
        const align = options?.align ?? "trigger";
        setActiveMenuPosition({
            left:
                align === "left"
                    ? Math.max(14, rect.left)
                    : Math.min(rect.left + rect.width - 42, window.innerWidth - 168),
            top: Math.min(rect.bottom + 4, window.innerHeight - 92),
        });
    };
    return (
        <nav
            className={`flex h-screen w-[272px] min-w-0 flex-col gap-[14px] overflow-hidden border-r border-[#d8e0e6]/90 bg-[linear-gradient(180deg,rgba(246,248,250,0.98),rgba(241,244,247,0.98))] px-[14px] pb-3 pt-[14px] text-[#2f3a46] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-[1120px]:w-[248px] max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[min(82vw,320px)] max-[900px]:shadow-[0_18px_48px_rgba(23,28,38,0.16)] ${
                expand
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none -translate-x-6 opacity-0 max-[900px]:-translate-x-full"
            }`}
        >
            <div className="relative flex shrink-0 items-center justify-between pl-0 pr-0 text-[#2f3a46]">
                <div className="inline-flex min-w-0 items-center gap-2">
                    <span className="grid size-[32px] shrink-0 place-items-center">
                        <img src={logoIcon} className="size-[32px] object-contain" />
                    </span>
                    <span className="min-w-0 translate-y-px truncate text-[18px] font-semibold tracking-[0] text-[rgba(47,58,70,0.82)]">
                        {title}
                    </span>
                </div>
                <button
                    type="button"
                    className="mr-[-6px] grid size-[30px] place-items-center rounded-[9px] text-[#87919d] transition-colors hover:bg-white/90 hover:text-[#66717d]"
                    aria-label="收起侧栏"
                    onClick={onToggleSidebar}
                >
                    <svg
                        className="size-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                    >
                        <rect x="4" y="5" width="16" height="14" rx="2" />
                        <path d="M10 5v14" />
                    </svg>
                </button>
            </div>
            <button
                type="button"
                className={`mt-1.5 flex min-h-10 w-full shrink-0 items-center justify-between gap-3 rounded-[14px] border pl-0 pr-[13px] text-[14px] font-normal text-[rgba(47,58,70,0.98)] transition-all hover:-translate-y-px hover:border-[rgba(194,208,216,0.98)] hover:shadow-[0_7px_16px_rgba(23,28,38,0.032),0_0_0_1px_rgba(133,210,226,0.028)] ${
                    isNewChatActive
                        ? "border-[rgba(198,211,221,0.98)] bg-[rgba(252,253,254,0.98)] shadow-[inset_0_0_0_1px_rgba(232,237,242,0.96),0_6px_14px_rgba(23,28,38,0.028)] hover:bg-[rgba(252,253,254,0.98)]"
                        : "border-[rgba(220,227,233,0.94)] bg-[rgba(251,252,253,0.92)] shadow-[0_5px_14px_rgba(23,28,38,0.025),0_0_0_1px_rgba(133,210,226,0.02)] hover:bg-[rgba(229,234,239,0.82)]"
                }`}
                onClick={() => {
                    navigate("/")
                    closeMobileSidebar();
                }}
            >
                <span className="inline-flex items-center gap-1">
                    <span className="grid size-8 shrink-0 place-items-center">
                        <PlusCircleIcon
                            className="size-5 text-[rgba(89,180,199,0.92)]"
                            strokeWidth={1.8}
                        />
                    </span>
                    <span>{t("components.Sidebar.new_chat")}</span>
                </span>
            </button>
            {gptsFeatureAllowed && (
                <div
                    className="-mt-2 flex min-h-[34px] shrink-0 cursor-pointer items-center justify-start rounded-[10px] px-0 py-0 text-left text-[14px] font-normal text-[#2f3a46] transition-all hover:bg-[rgba(229,234,239,0.82)]"
                    onClick={() => {
                        navigate("/gpts/")
                    }}
                >
                    <span className="inline-flex items-center gap-1">
                        <span className="grid size-8 shrink-0 place-items-center">
                            <img src={appsIcon} className="size-[22px] object-contain" />
                        </span>
                        {t("components.Sidebar.gpts")}
                    </span>
                </div>
            )}
            <div
                className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${assistantSectionOffset}`}
            >
            {visiblePinnedGpts.map(({ gid, name, logo }, index) => {
                return (
                    <div
                        key={gid}
                        className={`${index === 0 ? "mt-0 mb-0" : "my-0"} flex min-h-[34px] cursor-pointer items-center justify-start rounded-[10px] px-0 py-0 text-left text-[14px] font-normal text-[#2f3a46] transition-all hover:bg-[rgba(229,234,239,0.82)]`}
                        onClick={() => {
                            navigate("/g/"+gid)
                        }}
                    >
                        <span className="inline-flex items-center gap-1">
                            <span className="grid size-8 shrink-0 place-items-center">
                                <img
                                    src={logo ? normalizeAssetPath(logo) : regulationIcon}
                                    className="size-[22px] object-contain"
                                />
                            </span>
                            {name}
                        </span>
                    </div>
                )
            })}
            <div
                className={`mb-auto flex flex-col border-t border-[rgba(214,221,228,0.42)] ${historySectionSpacing}`}
            >
                {!isHistoryEmpty && (
                    <div>
                        <button
                            type="button"
                            className="flex min-h-9 w-full items-center justify-between rounded-[10px] px-0 py-0.5 text-left text-[14px] font-normal tracking-[0] text-[rgba(47,58,70,0.98)] transition-colors hover:bg-[rgba(229,234,239,0.82)]"
                            aria-expanded={!isHistoryCollapsed}
                            onClick={() => setIsHistoryCollapsed((state) => !state)}
                        >
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <span className="grid size-8 shrink-0 place-items-center">
                                    <ClockIcon
                                        className="size-5 text-[rgba(89,180,199,0.92)]"
                                        strokeWidth={1.8}
                                    />
                                </span>
                                <span>历史会话</span>
                            </span>
                            <ChevronDownIcon
                                className={`size-4 text-[rgba(128,138,148,0.9)] transition-transform ${
                                    isHistoryCollapsed ? "-rotate-90" : ""
                                }`}
                                strokeWidth={1.8}
                            />
                        </button>
                        {!isHistoryCollapsed && (
                            <div className="grid gap-[2px] pt-0.5">
                                {historySessionKeys
                                    .slice(0, sessionsLimitation)
                                    .map((id, _index) => {
                                        const currentSession = sessions[id]?.[0];
                                        const summary = sessionSummaryMap[id];
                                        const currentSessionTitle =
                                            summary?.title?.length
                                                ? summary.title
                                                : !!currentSession?.title?.length
                                                  ? currentSession.title
                                                  : currentSession?.parts || id;
                                        let path;
                                        const sessionExtension = sessionExtensions[id];
                                        const effectiveGid =
                                            sessionExtension?.["gid"] || summary?.gid || "";
                                        if (effectiveGid && effectiveGid !== "gptassistant") {
                                            path = `/g/${effectiveGid}/chat/${id}`
                                        } else {
                                            path = `/chat/${id}`
                                        }
                                        const isCurrentSessionActive = location.pathname === path;
                                        return (
                                            <div
                                                key={_index}
                                                data-history-menu-root
                                                role="link"
                                                tabIndex={renamingChatTitle.id === id ? -1 : 0}
                                                className={`group relative grid min-h-8 cursor-pointer grid-cols-[minmax(0,1fr)_24px] items-center gap-2 rounded-[10px] py-[3px] pl-[12px] pr-1.5 text-[13px] font-medium text-[rgba(72,84,96,0.98)] transition-all hover:text-[rgba(47,58,70,0.98)] ${
                                                    activeMenu === id || isCurrentSessionActive ? "bg-white/90 text-[rgba(47,58,70,0.98)] shadow-[inset_0_0_0_1px_rgba(207,217,226,0.92),0_1px_2px_rgba(23,28,38,0.025)] hover:bg-white/90" : "hover:bg-[rgba(229,234,239,0.82)]"
                                                }`}
                                                onClick={(event) => {
                                                    if (renamingChatTitle.id === id) {
                                                        return;
                                                    }
                                                    if (historyLongPressTriggeredRef.current) {
                                                        event.preventDefault();
                                                        historyLongPressTriggeredRef.current = false;
                                                        return;
                                                    }
                                                    navigate(path);
                                                    closeMobileSidebar();
                                                }}
                                                onKeyDown={(event) => {
                                                    if (renamingChatTitle.id === id) {
                                                        return;
                                                    }
                                                    if (event.key !== "Enter" && event.key !== " ") {
                                                        return;
                                                    }
                                                    event.preventDefault();
                                                    navigate(path);
                                                    closeMobileSidebar();
                                                }}
                                                onTouchStart={(event) => {
                                                    if (renamingChatTitle.id === id) {
                                                        return;
                                                    }
                                                    cancelHistoryLongPress();
                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                    historyLongPressTriggeredRef.current = false;
                                                    historyLongPressTimerRef.current = window.setTimeout(() => {
                                                        historyLongPressTriggeredRef.current = true;
                                                        setHistoryMenuPositionFromRect(rect, { align: "left" });
                                                        setActiveMenu(id);
                                                        historyLongPressTimerRef.current = null;
                                                    }, 480);
                                                }}
                                                onTouchMove={cancelHistoryLongPress}
                                                onTouchCancel={cancelHistoryLongPress}
                                                onTouchEnd={cancelHistoryLongPress}
                                            >
                                                <span
                                                    className={`min-w-0 truncate text-left ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? "hidden"
                                                            : ""
                                                    }`}
                                                >
                                                    {currentSessionTitle}
                                                </span>
                                                <input
                                                    defaultValue={
                                                        currentSessionTitle
                                                    }
                                                    className={`min-w-0 bg-transparent text-[13px] ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? ""
                                                            : "hidden"
                                                    }`}
                                                    onClick={(event) => event.stopPropagation()}
                                                    onKeyDown={(event) => event.stopPropagation()}
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
                                                        <button
                                                            type="button"
                                                            className={`grid size-6 shrink-0 place-items-center rounded-lg text-[rgba(118,129,141,0.88)] opacity-0 transition-colors hover:bg-white/90 hover:text-[rgba(72,84,96,0.94)] group-hover:opacity-100 max-[900px]:hidden ${
                                                                activeMenu === id ? "bg-white/90 text-[rgba(72,84,96,0.94)] opacity-100" : ""
                                                            }`}
                                                            aria-label="更多操作"
                                                            onClick={(event) => {
                                                                event.preventDefault();
                                                                event.stopPropagation();
                                                                const rect = event.currentTarget.getBoundingClientRect();
                                                                setActiveMenu((state) => {
                                                                    if (state === id) {
                                                                        setActiveMenuPosition(null);
                                                                        return null;
                                                                    }
                                                                    setHistoryMenuPositionFromRect(rect);
                                                                    return id;
                                                                });
                                                            }}
                                                        >
                                                            <EllipsisHorizontalIcon
                                                                className="size-4"
                                                                strokeWidth={2}
                                                            />
                                                        </button>
                                                        {activeMenu === id && activeMenuPosition && createPortal(
                                                            <div
                                                                data-history-menu-root
                                                                className="fixed z-[60] grid w-[156px] gap-px rounded-2xl border border-[rgba(232,236,240,0.98)] bg-[rgba(253,253,254,0.99)] p-1.5 shadow-[0_18px_36px_rgba(23,28,38,0.08),0_2px_8px_rgba(23,28,38,0.035)]"
                                                                style={{
                                                                    left: activeMenuPosition.left,
                                                                    top: activeMenuPosition.top,
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex min-h-9 items-center gap-2 rounded-[10px] px-2.5 text-left text-[14px] font-normal text-[rgba(56,67,79,0.96)] transition-colors hover:bg-[rgba(244,247,250,0.96)]"
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        setRenamingChatTitle({
                                                                            id,
                                                                            title: currentSessionTitle,
                                                                        });
                                                                        setActiveMenu(null);
                                                                        setActiveMenuPosition(null);
                                                                    }}
                                                                >
                                                                    <PencilSquareIcon
                                                                        className="size-4"
                                                                        strokeWidth={1.8}
                                                                    />
                                                                    <span>编辑标题</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex min-h-9 items-center gap-2 rounded-[10px] px-2.5 text-left text-[14px] font-normal text-[rgba(184,72,72,0.96)] transition-colors hover:bg-[rgba(244,247,250,0.96)]"
                                                                    onClick={(event) => {
                                                                        event.preventDefault();
                                                                        event.stopPropagation();
                                                                        setActiveMenu(null);
                                                                        setActiveMenuPosition(null);
                                                                        onDeleteSession(id);
                                                                    }}
                                                                >
                                                                    <TrashIcon
                                                                        className="size-4"
                                                                        strokeWidth={1.8}
                                                                    />
                                                                    <span>删除</span>
                                                                </button>
                                                            </div>,
                                                            document.body
                                                        )}
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
                                {historySessionKeys.length > sessionsLimitation && (
                                    <div className="m-2 text-center">
                                        <button
                                            className="text-sm font-semibold text-[#87919d] transition-all hover:text-[#279ab3]"
                                            onClick={() =>
                                                setSessionsLimitation(
                                                    (state) => state + 5
                                                )
                                            }
                                        >
                                            {t("components.Sidebar.load_more")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
            {isHistoryEmpty && (
                <div className="p-2 text-center text-[#87919d]/70 mb-[calc(50vh-4rem)] flex flex-col gap-4">
                    <img src={emptyIcon} alt="" className="mx-auto size-10" />
                    {t("components.Sidebar.no_history_chat")}
                </div>
            )}
            </div>
            <div
                ref={profileMenuRef}
                className="relative -mx-[14px] shrink-0 border-t border-[#d8e0e6]/95 px-[14px] pt-2.5"
            >
                {isProfileMenuOpen && (
                    <div className="absolute -left-[14px] -right-[14px] bottom-[calc(100%+6px)] grid gap-0.5 bg-[linear-gradient(180deg,rgba(246,248,250,0.98),rgba(241,244,247,0.98))] px-[14px] pb-2 pt-2">
                        <button
                            type="button"
                            className="inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-normal text-[rgba(56,67,79,0.96)] transition-colors hover:bg-[rgba(229,234,239,0.82)]"
                            onClick={() => {
                                setIsProfileMenuOpen(false);
                                setIsVersionHistoryOpen(true);
                            }}
                        >
                            <span className="text-[#87919d]">当前版本</span>
                            <span className="font-medium text-[#2f3a46]">{APP_VERSION}</span>
                        </button>
                        {adminAllowed && (
                            <button
                                type="button"
                                className="inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-normal text-[rgba(56,67,79,0.96)] transition-colors hover:bg-[rgba(229,234,239,0.82)]"
                                onClick={() => {
                                    setIsProfileMenuOpen(false);
                                    navigate("/admin/models");
                                    closeMobileSidebar();
                                }}
                            >
                                <span className="inline-flex items-center gap-2 text-[#2f3a46]">
                                    <ShieldCheckIcon className="size-4 text-[#87919d]" strokeWidth={1.8} />
                                    {t("components.Sidebar.admin")}
                                </span>
                                <span className="text-xs font-medium text-[#87919d]">
                                    {t("components.Sidebar.admin_badge")}
                                </span>
                            </button>
                        )}
                        {voiceLabAllowed && (
                            <button
                                type="button"
                                className="inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-normal text-[rgba(56,67,79,0.96)] transition-colors hover:bg-[rgba(229,234,239,0.82)]"
                                onClick={() => {
                                    setIsProfileMenuOpen(false);
                                    navigate("/voice-lab");
                                    closeMobileSidebar();
                                }}
                            >
                                <span className="inline-flex items-center gap-2 text-[#2f3a46]">
                                    <MicrophoneIcon className="size-4 text-[#87919d]" strokeWidth={1.8} />
                                    语音测试
                                </span>
                                <span className="text-xs font-medium text-[#87919d]">实验</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-normal text-[rgba(56,67,79,0.96)] transition-colors hover:bg-[rgba(229,234,239,0.82)]"
                            onClick={() => {
                                setIsProfileMenuOpen(false);
                                setIsSettingsOpen(true);
                            }}
                        >
                            <span className="inline-flex items-center gap-2 text-[#2f3a46]">
                                <Cog6ToothIcon className="size-4 text-[#87919d]" strokeWidth={1.8} />
                                {t("components.Sidebar.system_settings")}
                            </span>
                        </button>
                        <div className="inline-flex min-h-9 items-center justify-between gap-2 rounded-[10px] px-2.5 text-[13px] font-normal text-[rgba(56,67,79,0.96)]">
                            <span className="text-[#87919d]">技术支持</span>
                            <span className="min-w-0 truncate font-medium text-[#2f3a46]">
                                @{globalConfig.supportContact}
                            </span>
                        </div>
                    </div>
                )}
                <button
                    type="button"
                    className="mx-1 flex min-h-11 w-[calc(100%-8px)] cursor-pointer items-center justify-between gap-[11px] rounded-xl px-1.5 pl-2 text-left"
                    aria-expanded={isProfileMenuOpen}
                    aria-label="打开账号菜单"
                    onClick={() => setIsProfileMenuOpen((state) => !state)}
                >
                    <span className="flex min-w-0 items-center gap-[9px]">
                        <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(212,146,114,0.96),rgba(190,124,95,0.96))] text-xs font-semibold text-white">
                            {avatarText}
                        </span>
                        <span className="min-w-0 truncate text-[14px] font-normal text-[rgba(47,58,70,0.98)]">
                            {displayUserName}
                        </span>
                    </span>
                    <EllipsisHorizontalIcon
                        className="size-5 shrink-0 text-[#87919d]"
                        strokeWidth={2}
                    />
                </button>
            </div>
            {isVersionHistoryOpen && createPortal(
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
                </div>,
                document.body
            )}
            {isSettingsOpen && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="system-settings-title"
                    onClick={() => setIsSettingsOpen(false)}
                >
                    <div
                        className="w-full max-w-[520px] overflow-hidden rounded-2xl bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                            <div>
                                <h2
                                    id="system-settings-title"
                                    className="text-base font-semibold text-slate-900"
                                >
                                    {t("components.Sidebar.system_settings")}
                                </h2>
                                <p className="mt-1 text-xs font-normal text-slate-500">
                                    {t("components.Sidebar.system_settings_subtitle")}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="rounded-md p-2 transition-colors hover:bg-slate-100"
                                aria-label={t("components.Sidebar.close_system_settings")}
                                onClick={() => setIsSettingsOpen(false)}
                            >
                                <img src={closeIcon} alt="" className="size-4" />
                            </button>
                        </div>
                        <div className="grid gap-4 px-5 py-5">
                            <section className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-semibold text-slate-900">
                                        {t("components.Sidebar.language")}
                                    </h3>
                                    <p className="text-xs leading-5 text-slate-500">
                                        {t("components.Sidebar.language_hint")}
                                    </p>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {Object.entries(locales).map(([locale, label]) => {
                                        const isActive = currentLocale === locale;
                                        return (
                                            <button
                                                key={locale}
                                                type="button"
                                                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                    isActive
                                                        ? "border-[#7fb7c5] bg-[#e8f4f7] text-[#276675]"
                                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                                                }`}
                                                onClick={() => onSwitchLocale(locale)}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                            <section className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4">
                                <h3 className="text-sm font-semibold text-slate-900">
                                    {t("components.Sidebar.future_preferences")}
                                </h3>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                    {t("components.Sidebar.future_preferences_hint")}
                                </p>
                            </section>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </nav>
    );
};
