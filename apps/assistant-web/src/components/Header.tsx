import { HeaderDropdown } from "./Dropdown";
import { ModelOption } from "../types/models";
import { Bars3Icon } from "@heroicons/react/24/outline";

interface HeaderProps {
    readonly sidebarExpand: boolean;
    readonly title?: string;
    readonly models?: ModelOption[];
    readonly defaultModel?: string;
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
        onToggleSidebar,
        onModelChange,
    } = props;
    return (
        <header className="sticky top-0 z-10 flex min-h-[62px] items-center justify-between gap-4 border-b border-[#e7edf2]/90 bg-white/80 px-[26px] text-[#2f3a46] backdrop-blur supports-[backdrop-filter]:bg-white/75 max-[900px]:px-4">
            <div className="flex min-w-0 items-center gap-2.5">
                <button
                    className={`grid size-8 place-items-center rounded-[9px] border border-[#e9edf1]/90 bg-white/70 text-[#66717d] transition-colors hover:bg-white hover:text-[#2f3a46] ${
                        sidebarExpand ? "hidden max-[900px]:inline-grid" : "inline-grid"
                    }`}
                    aria-label="打开历史会话"
                    onClick={onToggleSidebar}
                >
                    <Bars3Icon className="size-5" strokeWidth={1.8} />
                </button>
                <div
                    className={`${
                        sidebarExpand ? "hidden md:block" : ""
                    }`}
                >
                    <HeaderDropdown
                        title={title}
                        models={models}
                        defaultModel={defaultModel}
                        onModelChange={onModelChange}
                    />
                </div>
            </div>
            {/* <h1 className="font-semibold text-lg">GPT助手</h1> */}
            <div />
        </header>
    );
};
