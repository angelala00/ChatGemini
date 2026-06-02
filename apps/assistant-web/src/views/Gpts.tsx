import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Container } from "../components/Container";
import pinnedIcon from "../assets/icons/thumbtack-solid.svg";
import unpinnedIcon from "../assets/icons/map-pin-solid.svg";
import { getFullPath } from "../helpers/getDomainAndPath";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
    readonly is_required_pinned?: boolean;
}

interface SectionProps {
    readonly title: string;
    readonly items: GptsItem[];
    readonly onToggle: (id: string, is_pinned: boolean) => void;
}

const Section = ({ title, items, onToggle }: SectionProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    return (
    <section className="mb-16">
        <h2 className="mb-6 text-sm font-semibold text-gray-500 tracking-wide uppercase">
            {title}
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <div
                    key={item.gid}
                    className="relative flex h-full flex-col rounded-xl border bg-gray-50 px-6 pt-6 pb-4 transition-colors hover:bg-gray-100 cursor-pointer"
                    onClick={() => {
                        navigate(`/g/${item.gid}`);
                    }}
                >
                    <div className="flex flex-1 gap-4">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-2xl overflow-hidden">
                            {item.logo ? (
                                <img src={normalizeAssetPath(item.logo)} alt="" className="h-12 w-12" />
                            ) : (
                                item.name.slice(0, 1)
                            )}
                        </div>
                        <div className="flex flex-1 flex-col">
                            <h3 className="text-lg font-medium text-gray-900">{item.name}</h3>
                            <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-400">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 whitespace-nowrap">
                            {item.owner
                                ? t("views.Gpts.owner_user", { owner: item.owner })
                                : t("views.Gpts.owner_official")}
                        </span>
                        <div className="flex items-center gap-3">
                            <span className="whitespace-nowrap">
                                {t("views.Gpts.usage_count", {
                                    count: item.usage_count ?? 0,
                                })}
                            </span>
                            <span className="whitespace-nowrap">
                                {t("views.Gpts.pinned_count", {
                                    count: item.pinned_user_count ?? 0,
                                })}
                            </span>
                        </div>
                    </div>
                    <button
                        className={`absolute top-2 right-2 p-1 rounded ${
                            item.is_required_pinned
                                ? "cursor-not-allowed opacity-60"
                                : "hover:bg-gray-200 cursor-pointer"
                        }`}
                        disabled={item.is_required_pinned}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (item.is_required_pinned) {
                                return;
                            }
                            onToggle(item.gid, item.is_pinned);
                        }}
                        aria-label={
                            item.is_pinned
                                ? t("views.Gpts.unpin")
                                : t("views.Gpts.pin")
                        }
                    >
                        <img
                            className="w-5 h-5"
                            src={item.is_pinned ? pinnedIcon : unpinnedIcon}
                            alt=""
                        />
                    </button>
                </div>
            ))}
        </div>
    </section>
    );
};

const Gpts = () => {
    const [items, setItems] = useState<GptsItem[]>([]);
    const [canManage, setCanManage] = useState(false);
    const dispatch = useDispatch();
    const { t } = useTranslation();

    const refreshSidebar = () => {
        // console.log("refreshSidebar:")
        fetch(getFullPath('/api/gpts/pined'), {})
            .then((res) => res.json())
            .then((data) => dispatch(updatePinnedGpts(data ?? [])))
            .catch(() => {});
    };

    useEffect(() => {
        fetch(getFullPath('/api/gpts'), {})
            .then((res) => res.json())
            .then((data) => {
                setItems(data ?? []);
                refreshSidebar();
            })
            .catch(() => {
                setItems([]);
            });
        fetch(getFullPath('/api/gpts/permission'), {})
            .then((res) => res.json())
            .then((data) => setCanManage(Boolean(data.manage_allowed)))
            .catch(() => setCanManage(false));
    }, []);

    const handleToggle = (id: string, is_pinned: boolean) => {
        fetch(getFullPath(`/api/gpts/${id}/pin`), {
            method: "PATCH",
            headers: {},
            body: JSON.stringify({ is_pinned: !is_pinned }),
        })
            .then((res) => res.json())
            .then((data) => {
                setItems((prev) =>
                    prev.map((item) =>
                        item.gid === id
                            ? { ...item, is_pinned: data.is_pinned }
                            : item
                    )
                );
                refreshSidebar();
            })
            .catch(() => {});
    };

    const pinned = items.filter((i) => i.is_pinned);
    const others = items.filter((i) => !i.is_pinned);

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-5xl mx-auto px-6 pb-16">
                <header className="py-10 flex items-center justify-between">
                    <div className="text-3xl font-semibold">{t("views.Gpts.page_title")}</div>
                    <div className="space-x-4 text-sm">
                        {canManage && (
                            <>
                                <Link to="/my-gpts" className="text-blue-600 hover:underline">
                                    {t("views.Gpts.link_my_gpts")}
                                </Link>
                                <Link to="/gpts/create" className="text-blue-600 hover:underline">
                                    {t("views.Gpts.link_create")}
                                </Link>
                            </>
                        )}
                    </div>
                </header>
                <Section
                    title={t("views.Gpts.section_pinned")}
                    items={pinned}
                    onToggle={handleToggle}
                />
                <Section
                    title={t("views.Gpts.section_all")}
                    items={others}
                    onToggle={handleToggle}
                />
            </div>
        </Container>
    );
};

export default Gpts;
