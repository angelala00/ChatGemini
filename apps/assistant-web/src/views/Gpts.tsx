import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ArrowRightIcon,
    Bars3Icon,
    PlusIcon,
    Squares2X2Icon,
    UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Container } from "../components/Container";
import { Topbar } from "../components/Topbar";
import pinnedIcon from "../assets/icons/thumbtack-solid.svg";
import unpinnedIcon from "../assets/icons/map-pin-solid.svg";
import { getFullPath } from "../helpers/getDomainAndPath";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { normalizeAssetPath } from "../helpers/normalizeAssetPath";

interface GptsItem {
    readonly gid: string;
    readonly name: string;
    readonly desc: string;
    readonly is_pinned: boolean;
    readonly logo: string;
    readonly owner?: string;
    readonly usage_count?: number;
    readonly pinned_user_count?: number;
}

interface SectionProps {
    readonly title: string;
    readonly description: string;
    readonly items: GptsItem[];
    readonly onToggle: (id: string, is_pinned: boolean) => void;
}

const Section = ({ title, description, items, onToggle }: SectionProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    if (!items.length) {
        return null;
    }

    return (
        <section className="space-y-5">
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[var(--assist-text)]">
                        {title}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--assist-text-faint)]">{description}</p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--assist-line)] bg-white/70 px-2.5 py-1 text-xs text-[var(--assist-text-faint)]">
                    {items.length}
                </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                    <article
                        key={item.gid}
                        role="button"
                        tabIndex={0}
                        className="group relative flex min-h-[208px] cursor-pointer flex-col overflow-hidden rounded-[22px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--assist-line-strong)] hover:shadow-[var(--assist-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--assist-accent)]/40"
                        onClick={() => navigate(`/g/${item.gid}`)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                navigate(`/g/${item.gid}`);
                            }
                        }}
                    >
                        <div className="flex items-start gap-4">
                            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[15px] border border-[rgba(212,221,229,0.9)] bg-[var(--assist-panel-soft)] text-lg font-semibold text-[var(--assist-accent-strong)]">
                                {item.logo ? (
                                    <img
                                        src={normalizeAssetPath(item.logo)}
                                        alt=""
                                        className="size-9 object-contain"
                                    />
                                ) : (
                                    item.name.slice(0, 1)
                                )}
                            </div>
                            <div className="min-w-0 flex-1 pr-8">
                                <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-[var(--assist-text)]">
                                    {item.name}
                                </h3>
                                <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--assist-text-soft)]">
                                    {item.desc}
                                </p>
                            </div>
                        </div>

                        <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                            <div className="min-w-0 space-y-2 text-xs text-[var(--assist-text-faint)]">
                                <div className="truncate">
                                    {item.owner
                                        ? t("views.Gpts.owner_user", { owner: item.owner })
                                        : t("views.Gpts.owner_official")}
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    <span>
                                        {t("views.Gpts.usage_count", {
                                            count: item.usage_count ?? 0,
                                        })}
                                    </span>
                                    <span>
                                        {t("views.Gpts.pinned_count", {
                                            count: item.pinned_user_count ?? 0,
                                        })}
                                    </span>
                                </div>
                            </div>
                            <ArrowRightIcon className="size-4 shrink-0 text-[var(--assist-text-faint)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--assist-accent-strong)]" />
                        </div>

                        <button
                            type="button"
                            className="absolute right-4 top-4 grid size-8 place-items-center rounded-[10px] border border-transparent transition hover:border-[var(--assist-line)] hover:bg-[var(--assist-panel-soft)]"
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggle(item.gid, item.is_pinned);
                            }}
                            aria-label={item.is_pinned ? t("views.Gpts.unpin") : t("views.Gpts.pin")}
                        >
                            <img
                                className="size-4 opacity-60"
                                src={item.is_pinned ? pinnedIcon : unpinnedIcon}
                                alt=""
                            />
                        </button>
                    </article>
                ))}
            </div>
        </section>
    );
};

interface GptsProps {
    readonly onToggleSidebar?: () => void;
    readonly sidebarExpand?: boolean;
}

const Gpts = ({ onToggleSidebar, sidebarExpand }: GptsProps) => {
    const [items, setItems] = useState<GptsItem[]>([]);
    const [canManage, setCanManage] = useState(false);
    const dispatch = useDispatch();
    const { t } = useTranslation();

    const refreshSidebar = () => {
        fetch(getFullPath("/api/gpts/pined"), {})
            .then((res) => res.json())
            .then((data) => dispatch(updatePinnedGpts(data ?? [])))
            .catch(() => dispatch(updatePinnedGpts([])));
    };

    useEffect(() => {
        fetch(getFullPath("/api/gpts"), {})
            .then((res) => res.json())
            .then((data) => {
                setItems(data ?? []);
                refreshSidebar();
            })
            .catch(() => setItems([]));
        fetch(getFullPath("/api/gpts/permission"), {})
            .then((res) => res.json())
            .then((data) => setCanManage(Boolean(data.manage_allowed)))
            .catch(() => setCanManage(false));
    }, []);

    const handleToggle = (id: string, isPinned: boolean) => {
        fetch(getFullPath(`/api/gpts/${id}/pin`), {
            method: "PATCH",
            headers: {},
            body: JSON.stringify({ is_pinned: !isPinned }),
        })
            .then((res) => res.json())
            .then((data) => {
                setItems((previous) =>
                    previous.map((item) =>
                        item.gid === id ? { ...item, is_pinned: data.is_pinned } : item,
                    ),
                );
                refreshSidebar();
            })
            .catch(() => {});
    };

    const pinned = items.filter((item) => item.is_pinned);
    const others = items.filter((item) => !item.is_pinned);

    const topbarActions = canManage && (
        <>
            <Link
                to="/my-gpts"
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[var(--assist-line)] bg-white/85 px-3.5 text-[13px] font-semibold text-[var(--assist-text-soft)] transition duration-160 ease-out hover:-translate-y-0.5 hover:bg-white hover:text-[var(--assist-text)]"
            >
                <UserCircleIcon className="size-[18px]" />
                <span className="hidden sm:inline">{t("views.Gpts.link_my_gpts")}</span>
            </Link>
            <Link
                to="/gpts/create"
                className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-transparent bg-[var(--assist-accent-strong)] px-3.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition duration-160 ease-out hover:-translate-y-0.5 hover:bg-[var(--assist-accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)]"
            >
                <PlusIcon className="size-[18px]" />
                <span>{t("views.Gpts.link_create")}</span>
            </Link>
        </>
    );

    return (
        <Container className="min-h-full w-full flex-1 overflow-y-auto bg-[var(--assist-bg)] text-[var(--assist-text)]">
            <Topbar
                title={t("views.Gpts.page_title")}
                actions={topbarActions}
                onToggleSidebar={onToggleSidebar}
                sidebarExpand={sidebarExpand}
            />

            <main className="mx-auto w-full max-w-[1180px] px-5 pb-20 sm:px-8 lg:px-10">
                <section className="pb-8 pt-10">
                    <div className="flex items-center gap-2.5 text-[var(--assist-accent-strong)]">
                        <Squares2X2Icon className="size-5" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.13em]">
                            {t("views.Gpts.workspace_label")}
                        </span>
                    </div>
                    <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--assist-text)] sm:text-[32px]">
                        {t("views.Gpts.page_title")}
                    </h1>
                    <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--assist-text-soft)]">
                        {t("views.Gpts.page_subtitle")}
                    </p>
                </section>

                <div className="mt-4 space-y-12">
                    {!items.length && (
                        <div className="grid min-h-64 place-items-center rounded-[24px] border border-dashed border-[var(--assist-line-strong)] bg-[rgba(252,253,254,0.65)] px-6 text-center">
                            <div className="max-w-sm">
                                <div className="mx-auto grid size-11 place-items-center rounded-[14px] bg-[var(--assist-accent-soft)] text-[var(--assist-accent-strong)]">
                                    <Squares2X2Icon className="size-5" />
                                </div>
                                <h2 className="mt-4 text-base font-semibold">{t("views.Gpts.empty_title")}</h2>
                                <p className="mt-2 text-sm leading-6 text-[var(--assist-text-faint)]">
                                    {t("views.Gpts.empty_description")}
                                </p>
                            </div>
                        </div>
                    )}
                    <Section
                        title={t("views.Gpts.section_pinned")}
                        description={t("views.Gpts.section_pinned_description")}
                        items={pinned}
                        onToggle={handleToggle}
                    />
                    <Section
                        title={t("views.Gpts.section_all")}
                        description={t("views.Gpts.section_all_description")}
                        items={others}
                        onToggle={handleToggle}
                    />
                </div>
            </main>
        </Container>
    );
};

export default Gpts;
