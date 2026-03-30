import menuIcon from "../assets/icons/bars-staggered-solid.svg";
import newChatIcon from "../assets/icons/square-plus-regular.svg";
import purgeIcon from "../assets/icons/broom-ball-solid.svg";
import LogoutIcon from "../assets/icons/right-from-bracket-solid.svg";
import { Link } from "react-router-dom";
import { HeaderDropdown } from "./Dropdown";
import { ModelOption } from "../types/models";

interface HeaderProps {
    readonly sidebarExpand: boolean;
    readonly title?: string;
    readonly models?: ModelOption[];
    readonly defaultModel?: string;
    readonly newChatUrl: string;
    readonly logoutIcon: boolean;
    readonly userName: string;
    readonly onLogout: () => void;
    readonly onToggleSidebar: () => void;
    readonly onPurgeSessions: () => void;
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
        newChatUrl,
        logoutIcon,
        userName,
        onLogout,
        onToggleSidebar,
        onPurgeSessions,
        onModelChange,
    } = props;
    return (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/80 bg-stone-100/92 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-stone-100/80">
            <button
                className="rounded-xl p-2 text-stone-700 transition-colors hover:bg-stone-200/80"
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
                <Link
                    className="rounded-xl p-2 text-stone-700 transition-colors hover:bg-stone-200/80"
                    to={newChatUrl}
                >
                    <img src={newChatIcon} className="size-4" alt="" />
                </Link>
                <button
                    className="rounded-xl p-2 text-stone-700 transition-colors hover:bg-stone-200/80"
                    onClick={onPurgeSessions}
                >
                    <img src={purgeIcon} className="size-4" alt="" />
                </button>
                {logoutIcon && (
                    <div className="ml-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 shadow-sm">
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
