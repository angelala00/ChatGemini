import menuIcon from "../assets/icons/bars-staggered-solid.svg";
import LogoutIcon from "../assets/icons/right-from-bracket-solid.svg";
import { HeaderDropdown } from "./Dropdown";
import { ModelOption } from "../types/models";

interface HeaderProps {
    readonly sidebarExpand: boolean;
    readonly title?: string;
    readonly models?: ModelOption[];
    readonly defaultModel?: string;
    readonly logoutIcon: boolean;
    readonly userName: string;
    readonly onLogout: () => void;
    readonly onToggleSidebar: () => void;
    readonly onModelChange?: (
        value: string,
        options?: { readonly manual?: boolean },
    ) => void;
}

export const Header = (props: HeaderProps) => {
    const {
        sidebarExpand,
        title,
        models,
        defaultModel,
        logoutIcon,
        userName,
        onLogout,
        onToggleSidebar,
        onModelChange,
    } = props;
    return (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e7edf2]/90 bg-white/80 px-3 py-3 text-[#2f3a46] backdrop-blur supports-[backdrop-filter]:bg-white/75">
            <button
                className="rounded-xl p-2 text-[#66717d] transition-colors hover:bg-[#f4f7f9] hover:text-[#2f3a46]"
                onClick={onToggleSidebar}
            >
                <img src={menuIcon} className="size-4" alt="" />
            </button>
            <div className={
                `${
                    sidebarExpand ? "hidden md:block" : ""
                }`
            }><HeaderDropdown
                title={title}
                models={models}
                defaultModel={defaultModel}
                onModelChange={onModelChange}
                />
            </div>
            {/* <h1 className="font-semibold text-lg">GPT助手</h1> */}
            <div className="flex items-center gap-1">
                {logoutIcon && (
                    <div className="ml-2 rounded-full border border-[#e2e8ee] bg-white/95 px-3 py-1.5 text-sm font-medium text-[#66717d] shadow-[0_2px_8px_rgba(23,28,38,0.04)]">
                        <span>{userName}</span>
                        {/* <button
                            className="hover:bg-gray-200 rounded-lg p-2"
                            onClick={onLogout}
                        >
                            <img src={LogoutIcon} className="size-4" alt="" />
                        </button> */}
                    </div>
                )}
            </div>
        </header>
    );
};
