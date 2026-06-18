import { ReactNode } from "react";
import { Bars3Icon } from "@heroicons/react/24/outline";

interface TopbarProps {
    readonly title: ReactNode;
    readonly actions?: ReactNode;
    readonly onToggleSidebar?: () => void;
}

export const Topbar = ({ title, actions, onToggleSidebar }: TopbarProps) => {
    return (
        <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-[rgba(232,236,240,0.92)] bg-[rgba(255,255,255,0.78)] px-5 backdrop-blur-[10px] sm:px-[26px]">
            <div className="flex min-w-0 items-center gap-2">
                {onToggleSidebar && (
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-[rgba(233,237,241,0.92)] bg-[rgba(255,255,255,0.7)] text-[var(--assist-text-soft)] lg:hidden"
                        onClick={onToggleSidebar}
                    >
                        <Bars3Icon className="size-[18px]" />
                    </button>
                )}
                <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-normal text-[var(--assist-text)]">
                        {title}
                    </div>
                </div>
            </div>

            {actions && (
                <div className="flex shrink-0 items-center gap-2.5">
                    {actions}
                </div>
            )}
        </header>
    );
};
