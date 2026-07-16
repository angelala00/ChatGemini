import {
    ArrowPathIcon,
    Bars3Icon,
    LinkIcon,
    WindowIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalAssistantBootstrapStatus } from "../types/externalAssistant";

interface ExternalAssistantWorkspaceProps {
    readonly title: string;
    readonly iframeUrl: string;
    readonly bootstrapStatus: ExternalAssistantBootstrapStatus;
    readonly sidebarExpand: boolean;
    readonly onRetryBootstrap: () => void;
    readonly onToggleSidebar: () => void;
}

export const ExternalAssistantWorkspace = ({
    title,
    iframeUrl,
    bootstrapStatus,
    sidebarExpand,
    onRetryBootstrap,
    onToggleSidebar,
}: ExternalAssistantWorkspaceProps) => {
    const { t } = useTranslation();
    const [iframeLoading, setIframeLoading] = useState(Boolean(iframeUrl));

    useEffect(() => {
        setIframeLoading(Boolean(iframeUrl));
    }, [iframeUrl]);

    return (
        <section className="col-start-2 flex h-screen min-w-0 flex-col bg-[#f8fafb] max-[900px]:col-start-1">
            <header className="z-10 flex h-[62px] shrink-0 items-center border-b border-[rgba(226,232,238,0.95)] bg-white/85 px-[26px] backdrop-blur-[10px] max-[900px]:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <button
                        type="button"
                        className={`grid size-8 shrink-0 place-items-center rounded-[9px] border border-[rgba(233,237,241,0.92)] bg-white/70 text-[#66717d] ${
                            sidebarExpand ? "hidden max-[900px]:grid" : "grid"
                        }`}
                        aria-label={t("components.ExternalAssistant.open_sidebar")}
                        onClick={onToggleSidebar}
                    >
                        <Bars3Icon className="size-[18px]" />
                    </button>
                    <h1 className="truncate text-sm font-semibold text-[#2f3a46]">
                        {title || t("components.Sidebar.workspace_external")}
                    </h1>
                </div>
            </header>

            <div className="relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,#f8fafb,#f3f7f9)]">
                {bootstrapStatus === "loading" && (
                    <div className="grid h-full place-items-center px-6">
                        <div className="w-full max-w-md animate-pulse space-y-4 rounded-[24px] border border-[#e1e8ed] bg-white/90 p-6 shadow-[0_18px_45px_rgba(23,28,38,0.055)]">
                            <div className="h-10 w-10 rounded-xl bg-[#eaf0f3]" />
                            <div className="h-4 w-1/2 rounded bg-[#eaf0f3]" />
                            <div className="h-3 w-full rounded bg-[#eff3f5]" />
                            <div className="h-3 w-4/5 rounded bg-[#eff3f5]" />
                        </div>
                    </div>
                )}

                {bootstrapStatus === "error" && (
                    <div className="grid h-full place-items-center px-6">
                        <div className="w-full max-w-md rounded-[24px] border border-[#e1e8ed] bg-white/95 p-7 text-center shadow-[0_18px_45px_rgba(23,28,38,0.055)]">
                            <LinkIcon className="mx-auto size-9 text-[#a2acb5]" strokeWidth={1.5} />
                            <h2 className="mt-4 text-base font-semibold text-[#34414d]">
                                {t("components.ExternalAssistant.load_failed")}
                            </h2>
                            <p className="mt-2 text-sm leading-6 text-[#7b8792]">
                                {t("components.ExternalAssistant.load_failed_hint")}
                            </p>
                            <button
                                type="button"
                                className="mt-5 inline-flex h-9 items-center justify-center rounded-xl bg-[#279ab3] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#20869c]"
                                onClick={onRetryBootstrap}
                            >
                                {t("components.ExternalAssistant.retry")}
                            </button>
                        </div>
                    </div>
                )}

                {bootstrapStatus === "ready" && !iframeUrl && (
                    <div className="grid h-full place-items-center px-6">
                        <div className="w-full max-w-lg rounded-[26px] border border-[#dde6eb] bg-white/95 p-8 text-center shadow-[0_20px_55px_rgba(23,28,38,0.06)]">
                            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[linear-gradient(145deg,#eef9fb,#e5f2f5)] text-[#279ab3] shadow-[inset_0_0_0_1px_rgba(111,188,205,0.16)]">
                                <WindowIcon className="size-7" strokeWidth={1.6} />
                            </span>
                            <h2 className="mt-5 text-lg font-semibold text-[#33404c]">
                                {t("components.ExternalAssistant.placeholder_title")}
                            </h2>
                            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#788590]">
                                {t("components.ExternalAssistant.placeholder_hint")}
                            </p>
                            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-[#d7e5e9] bg-[#f2f8f9] px-3 py-1.5 text-xs font-medium text-[#5f7981]">
                                <span className="size-1.5 rounded-full bg-[#64b6c8]" />
                                {t("components.ExternalAssistant.placeholder_status")}
                            </div>
                        </div>
                    </div>
                )}

                {bootstrapStatus === "ready" && iframeUrl && (
                    <>
                        {iframeLoading && (
                            <div className="absolute inset-0 z-10 grid place-items-center bg-[#f7fafb]">
                                <div className="inline-flex items-center gap-2 rounded-full border border-[#dfe7ec] bg-white px-4 py-2 text-sm text-[#6f7c87] shadow-sm">
                                    <ArrowPathIcon className="size-4 animate-spin" />
                                    {t("components.ExternalAssistant.iframe_loading")}
                                </div>
                            </div>
                        )}
                        <iframe
                            key={iframeUrl}
                            src={iframeUrl}
                            title={title || t("components.Sidebar.workspace_external")}
                            className="h-full w-full border-0 bg-white"
                            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                            allow="clipboard-read; clipboard-write; fullscreen"
                            referrerPolicy="strict-origin-when-cross-origin"
                            onLoad={() => setIframeLoading(false)}
                            onError={() => setIframeLoading(false)}
                        />
                    </>
                )}
            </div>
        </section>
    );
};
