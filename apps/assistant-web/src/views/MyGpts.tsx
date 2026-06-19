import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Container } from "../components/Container";
import { Topbar } from "../components/Topbar";
import { getFullPath } from "../helpers/getDomainAndPath";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { normalizeAssetPath } from "../helpers/normalizeAssetPath";
import editIcon from "../assets/icons/pen-to-square-solid.svg";
import deleteIcon from "../assets/icons/trash-solid.svg";

interface GptsItem {
    readonly gid: string;
    readonly name: string;
    readonly logo?: string;
    readonly owner?: string;
    readonly can_edit?: boolean;
    readonly can_delete?: boolean;
}

interface MyGptsProps {
    readonly onToggleSidebar?: () => void;
    readonly sidebarExpand?: boolean;
}

const MyGpts = ({ onToggleSidebar, sidebarExpand }: MyGptsProps) => {
    const [items, setItems] = useState<GptsItem[]>([]);
    const navigate = useNavigate();
    const { t } = useTranslation();

    useEffect(() => {
        fetch(getFullPath('/api/gpts/created'), {})
            .then((res) => res.json())
            .then((data) => setItems(data ?? []))
            .catch(() => setItems([]));
    }, []);

    const handleEdit = (gid: string) => {
        navigate(`/gpts/create?gid=${gid}`);
    };

    const handleDelete = (gid: string) => {
        sendUserConfirm(t("views.MyGpts.delete_confirm"), {
            title: t("views.MyGpts.delete_title"),
            confirmText: t("views.MyGpts.delete_confirm_button"),
            cancelText: t("views.MyGpts.delete_cancel_button"),
            onConfirmed: () => {
                fetch(getFullPath(`/api/gpts/${gid}`), { method: "DELETE" })
                    .then((res) => {
                        if (res.ok) {
                            setItems((prev) => prev.filter((it) => it.gid !== gid));
                            sendUserAlert(t("views.MyGpts.delete_success"), { type: "success" });
                        }
                    })
                    .catch(() => {});
            },
        });
    };

    const topbarTitle = (
        <div className="flex items-center gap-2">
            <Link to="/gpts" className="hover:text-[var(--assist-accent-strong)] transition-colors">
                {t("views.Gpts.page_title")}
            </Link>
            <span className="text-[var(--assist-text-faint)]">/</span>
            <span className="font-medium">{t("views.Gpts.link_my_gpts")}</span>
        </div>
    );

    const topbarActions = (
        <Link
            to="/gpts/create"
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-transparent bg-[var(--assist-accent-strong)] px-3.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition duration-160 ease-out hover:-translate-y-0.5 hover:bg-[var(--assist-accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)]"
        >
            <PlusIcon className="size-[18px]" />
            <span>{t("views.Gpts.link_create")}</span>
        </Link>
    );

    return (
        <Container className="min-h-full w-full flex-1 overflow-y-auto bg-[var(--assist-bg)] text-[var(--assist-text)]">
            <Topbar
                title={topbarTitle}
                actions={topbarActions}
                onToggleSidebar={onToggleSidebar}
                sidebarExpand={sidebarExpand}
            />

            <main className="mx-auto w-full max-w-[840px] px-5 pb-20 pt-10 sm:px-8">
                <header className="mb-10">
                    <h1 className="text-[28px] font-semibold tracking-[-0.03em] sm:text-[32px]">
                        {t("views.Gpts.link_my_gpts")}
                    </h1>
                    <p className="mt-2 text-[15px] text-[var(--assist-text-soft)]">
                        {t("views.Gpts.my_gpts_subtitle") || "你作为 Owner 的智能体，拥有最高管理权限。"}
                    </p>
                </header>

                <div className="space-y-4">
                    {items.length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-[var(--assist-line-strong)] bg-[rgba(252,253,254,0.65)] py-16 text-center">
                            <p className="text-[var(--assist-text-faint)]">{t("views.MyGpts.empty") || "暂无智能体"}</p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.gid}
                                className="flex items-center justify-between p-5 rounded-[22px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] shadow-[var(--assist-shadow-sm)] transition hover:shadow-[var(--assist-shadow-md)]"
                            >
                                <div className="flex items-center min-w-0">
                                    <div className="mr-4 flex h-16 w-16 shrink-0 items-center justify-center rounded-[18px] border border-[var(--assist-line)] bg-[var(--assist-panel-soft)] text-2xl font-semibold text-[var(--assist-accent-strong)] overflow-hidden">
                                        {item.logo ? (
                                            <img src={normalizeAssetPath(item.logo)} alt="" className="size-12 object-contain" />
                                        ) : (
                                            item.name.slice(0, 1)
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-semibold truncate">{item.name}</h3>
                                        <p className="mt-1 text-xs text-[var(--assist-text-faint)] truncate">
                                            {item.owner
                                                ? t("views.MyGpts.owner_label", { owner: item.owner })
                                                : t("views.MyGpts.owner_official")}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2.5 ml-4">
                                    {item.can_edit !== false && (
                                        <button
                                            className="size-9 rounded-[10px] border border-[var(--assist-line)] bg-white/70 flex items-center justify-center text-[var(--assist-text-soft)] transition hover:bg-white hover:text-[var(--assist-text)] hover:border-[var(--assist-line-strong)]"
                                            onClick={() => handleEdit(item.gid)}
                                            title={t("common.edit")}
                                        >
                                            <img src={editIcon} className="size-4 opacity-70" alt="编辑" />
                                        </button>
                                    )}
                                    {item.can_delete !== false && (
                                        <button
                                            className="size-9 rounded-[10px] border border-[var(--assist-line)] bg-white/70 flex items-center justify-center text-[var(--assist-text-faint)] transition hover:bg-red-50 hover:text-red-500 hover:border-red-100"
                                            onClick={() => handleDelete(item.gid)}
                                            title={t("common.delete")}
                                        >
                                            <img src={deleteIcon} className="size-4 opacity-60" alt="删除" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>
        </Container>
    );
};

export default MyGpts;
