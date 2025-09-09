import menuIcon from "../assets/icons/bars-staggered-solid.svg";
import newChatIcon from "../assets/icons/square-plus-regular.svg";
import purgeIcon from "../assets/icons/broom-ball-solid.svg";
import LogoutIcon from "../assets/icons/right-from-bracket-solid.svg";
import { Link } from "react-router-dom";
import { HeaderDropdown } from "./Dropdown";

interface HeaderProps {
    readonly sidebarExpand: boolean;
    readonly title?: string;
    readonly models?: string[];
    readonly defaultModel?: string;
    readonly newChatUrl: string;
    readonly logoutIcon: boolean;
    readonly userName: string;
    readonly onLogout: () => void;
    readonly onToggleSidebar: () => void;
    readonly onPurgeSessions: () => void;
    readonly onModelChange?: (t: string) => void;
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
        <header className="z-10 sticky top-0 flex px-2 py-3 items-center justify-between border-b bg-white">
            <button
                className="hover:bg-gray-200 rounded-lg p-2"
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
            <div className="flex">
                <Link
                    className="hover:bg-gray-200 rounded-lg p-2"
                    to={newChatUrl}
                >
                    <img src={newChatIcon} className="size-4" alt="" />
                </Link>
                <button
                    className="hover:bg-gray-200 rounded-lg p-2"
                    onClick={onPurgeSessions}
                >
                    <img src={purgeIcon} className="size-4" alt="" />
                </button>
                {logoutIcon && (
                    <div>
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
