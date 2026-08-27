import {
    ArrowRightIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import {
    ExternalAssistantBootstrap,
    WorkspaceMode,
} from "../types/externalAssistant";
import { resolveMenuIcon } from "../helpers/menuIcon";
import { WorkspaceSidebarHeader } from "./WorkspaceSidebarHeader";

interface ExternalAssistantSidebarProps {
    readonly title: string;
    readonly bootstrap: ExternalAssistantBootstrap | null;
    readonly selectedMenuId: string;
    readonly userName: string;
    readonly expand: boolean;
    readonly workspaceMode: WorkspaceMode;
    readonly onSelectMenu: (menuId: string) => void;
    readonly onToggleSidebar: () => void;
    readonly onWorkspaceModeChange: (mode: WorkspaceMode) => void;
}

export const ExternalAssistantSidebar = ({
    title,
    bootstrap,
    selectedMenuId,
    userName,
    expand,
    workspaceMode,
    onSelectMenu,
    onToggleSidebar,
    onWorkspaceModeChange,
}: ExternalAssistantSidebarProps) => {
    const { t } = useTranslation();
    const displayUserName = userName || "User";
    const avatarText = displayUserName.trim().charAt(0).toUpperCase() || "U";
    const closeMobileSidebar = () => {
        if (expand && window.matchMedia("(max-width: 900px)").matches) {
            onToggleSidebar();
        }
    };

    return (
        <nav
            className={`flex h-screen w-[272px] min-w-0 flex-col gap-[14px] overflow-hidden border-r border-[#d8e0e6]/90 bg-[linear-gradient(180deg,rgba(246,248,250,0.98),rgba(241,244,247,0.98))] px-[14px] pb-3 pt-[14px] text-[#2f3a46] transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-[1120px]:w-[248px] max-[900px]:fixed max-[900px]:inset-y-0 max-[900px]:left-0 max-[900px]:z-30 max-[900px]:w-[min(82vw,320px)] max-[900px]:shadow-[0_18px_48px_rgba(23,28,38,0.16)] ${
                expand
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none -translate-x-6 opacity-0 max-[900px]:-translate-x-full"
            }`}
        >
            <WorkspaceSidebarHeader
                title={title}
                externalAssistantAllowed={true}
                workspaceMode={workspaceMode}
                onToggleSidebar={onToggleSidebar}
                onWorkspaceModeChange={onWorkspaceModeChange}
            />

            <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-2 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#8a95a0]">
                    <Squares2X2Icon className="size-4" strokeWidth={1.8} />
                    {t("components.ExternalAssistant.menu_title")}
                </div>
                <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
                    {(bootstrap?.menus ?? []).map((menu) => {
                        const active = selectedMenuId === menu.id;
                        const MenuIcon = resolveMenuIcon(menu.icon);
                        return (
                            <button
                                key={menu.id}
                                type="button"
                                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-[11px] px-2.5 text-left text-sm transition-colors ${
                                    active
                                        ? "bg-white text-[#2f3a46] shadow-[0_4px_12px_rgba(23,28,38,0.045)]"
                                        : "text-[#5f6c78] hover:bg-[rgba(229,234,239,0.82)]"
                                }`}
                                onClick={() => {
                                    onSelectMenu(menu.id);
                                    closeMobileSidebar();
                                }}
                            >
                                <span className="inline-flex min-w-0 items-center gap-2.5">
                                    <span
                                        className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                                            active
                                                ? "bg-[#e9f6f8] text-[#279ab3]"
                                                : "bg-white/70 text-[#87919d]"
                                        }`}
                                    >
                                        <MenuIcon className="size-4" strokeWidth={1.8} />
                                    </span>
                                    <span className="truncate">{menu.label}</span>
                                </span>
                                <ArrowRightIcon className="size-3.5 shrink-0 text-[#9aa4ae]" />
                            </button>
                        );
                    })}
                    {(bootstrap?.menus.length ?? 0) === 0 && (
                        <div className="rounded-[14px] border border-dashed border-[rgba(205,216,224,0.98)] bg-white/55 px-4 py-5 text-center">
                            <Squares2X2Icon className="mx-auto size-6 text-[#9ba6b0]" strokeWidth={1.6} />
                            <p className="mt-2 text-sm font-medium text-[#65727e]">
                                {t("components.ExternalAssistant.menu_empty")}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#909aa4]">
                                {t("components.ExternalAssistant.menu_empty_hint")}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <div className="-mx-[14px] shrink-0 border-t border-[#d8e0e6]/95 px-[18px] pt-2.5">
                <div className="flex min-h-11 items-center gap-[9px] px-1.5">
                    <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[linear-gradient(180deg,rgba(89,180,199,0.96),rgba(39,154,179,0.96))] text-xs font-semibold text-white">
                        {avatarText}
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-[rgba(47,58,70,0.98)]">
                            {displayUserName}
                        </span>
                    </span>
                </div>
            </div>
        </nav>
    );
};
