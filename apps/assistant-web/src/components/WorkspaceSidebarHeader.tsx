import { useTranslation } from "react-i18next";
import logoIcon from "../assets/logo.svg";
import { WorkspaceMode } from "../types/externalAssistant";

interface WorkspaceSidebarHeaderProps {
    readonly title: string;
    readonly externalAssistantAllowed: boolean;
    readonly workspaceMode: WorkspaceMode;
    readonly onToggleSidebar: () => void;
    readonly onWorkspaceModeChange: (mode: WorkspaceMode) => void;
}

export const WorkspaceSidebarHeader = ({
    title,
    externalAssistantAllowed,
    workspaceMode,
    onToggleSidebar,
    onWorkspaceModeChange,
}: WorkspaceSidebarHeaderProps) => {
    const { t } = useTranslation();
    return (
        <div className="grid shrink-0 gap-2.5">
            <div className="relative flex items-center justify-between pl-0 pr-0 text-[#2f3a46]">
                <div className="inline-flex min-w-0 items-center gap-2">
                    <span className="grid size-[32px] shrink-0 place-items-center">
                        <img src={logoIcon} className="size-[32px] object-contain" alt="" />
                    </span>
                    <span className="min-w-0 translate-y-px truncate text-[18px] font-semibold tracking-[0] text-[rgba(47,58,70,0.82)]">
                        {title}
                    </span>
                </div>
                <button
                    type="button"
                    className="mr-[-6px] grid size-[30px] place-items-center rounded-[9px] text-[#87919d] transition-colors hover:bg-white/90 hover:text-[#66717d]"
                    aria-label={t("components.Sidebar.collapse_sidebar")}
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
            {externalAssistantAllowed && (
                <div
                    className="grid grid-cols-2 gap-1 rounded-[13px] border border-[rgba(215,224,231,0.96)] bg-[rgba(232,237,241,0.72)] p-1"
                    role="tablist"
                    aria-label={t("components.Sidebar.workspace_switcher")}
                >
                    {(
                        [
                            {
                                mode: "native" as const,
                                label: t("components.Sidebar.workspace_native"),
                            },
                            {
                                mode: "external" as const,
                                label: t("components.Sidebar.workspace_external"),
                            },
                        ]
                    ).map(({ mode, label }) => {
                        const active = workspaceMode === mode;
                        return (
                            <button
                                key={mode}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                className={`min-w-0 truncate rounded-[9px] px-2 py-1.5 text-xs font-semibold transition-all ${
                                    active
                                        ? "bg-white text-[#2f3a46] shadow-[0_2px_8px_rgba(23,28,38,0.07)]"
                                        : "text-[#7b8792] hover:bg-white/60 hover:text-[#4f5b67]"
                                }`}
                                onClick={() => onWorkspaceModeChange(mode)}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
