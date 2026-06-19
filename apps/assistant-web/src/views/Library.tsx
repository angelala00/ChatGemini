import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
    BookOpenIcon,
    MagnifyingGlassIcon,
    ArrowUpTrayIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    DocumentIcon,
    FolderIcon,
} from "@heroicons/react/24/outline";
import { Container } from "../components/Container";
import { Topbar } from "../components/Topbar";
import { getFullPath } from "../helpers/getDomainAndPath";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { sendUserAlert } from "../helpers/sendUserAlert";

interface FileItem {
    readonly file_id: string;
    readonly filename: string;
    readonly file_extension: string;
    readonly mime_type: string;
    readonly size_bytes: number;
    readonly upload_time: string;
    readonly purpose: string;
    readonly gid: string;
}

interface KnowledgeBaseItem {
    readonly name: string;
    readonly desc: string;
    readonly chunkCount: number;
    readonly sourceCount: number;
    readonly status: string;
}

interface LibraryProps {
    readonly onToggleSidebar?: () => void;
    readonly sidebarExpand?: boolean;
}

const mockKnowledgeBases: KnowledgeBaseItem[] = [
    {
        name: "合同审核知识库",
        desc: "把常见合同条款说明、风险口径和审核结论整理成可检索知识库，供后续问答引用。",
        chunkCount: 186,
        sourceCount: 12,
        status: "已完成索引",
    },
    {
        name: "报销制度问答库",
        desc: "聚合差旅、招待、采购付款等制度文件，适合后续挂到制度问答类助手下。",
        chunkCount: 264,
        sourceCount: 18,
        status: "持续更新",
    },
    {
        name: "项目交付经验库",
        desc: "沉淀项目复盘、交付模板和常见问题，便于在写方案或做交付总结时做 RAG 检索。",
        chunkCount: 132,
        sourceCount: 9,
        status: "待补充",
    },
];

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const formatUploadTime = (isoString?: string): string => {
    if (!isoString) return "";
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return isoString;
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return isoString;
    }
};

const Library = ({ onToggleSidebar, sidebarExpand }: LibraryProps) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<"files" | "knowledge">("files");

    // Files related states
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [debouncedKeyword, setDebouncedKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize] = useState(20);
    const [sortBy, setSortBy] = useState("upload_time_desc");
    const [total, setTotal] = useState(0);

    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Debounce keyword search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedKeyword(keyword);
        }, 300);
        return () => {
            clearTimeout(handler);
        };
    }, [keyword]);

    const fetchFiles = (currentKeyword: string, currentPage: number, currentSort: string) => {
        setLoading(true);
        const params = new URLSearchParams();
        if (currentKeyword) {
            params.append("keyword", currentKeyword);
        }
        params.append("page", String(currentPage));
        params.append("page_size", String(pageSize));
        params.append("sort_by", currentSort);

        fetch(getFullPath(`/api/library/files?${params.toString()}`), {})
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch");
                return res.json();
            })
            .then((data) => {
                setFiles(data.items ?? []);
                setTotal(data.total ?? 0);
            })
            .catch((err) => {
                console.error(err);
                setFiles([]);
                setTotal(0);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        if (activeTab === "files") {
            fetchFiles(debouncedKeyword, page, sortBy);
        }
    }, [debouncedKeyword, page, sortBy, activeTab]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setKeyword(e.target.value);
        setPage(1);
    };

    const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSortBy(e.target.value);
        setPage(1);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        fetch(getFullPath("/api/library/files:upload"), {
            method: "POST",
            body: formData,
        })
            .then(async (res) => {
                if (!res.ok) {
                    const text = await res.text();
                    throw new Error(text || "Upload failed");
                }
                return res.json();
            })
            .then(() => {
                sendUserAlert(t("views.Library.upload_success"));
                if (fileInputRef.current) fileInputRef.current.value = "";
                setKeyword("");
                setPage(1);
                setSortBy("upload_time_desc");
                fetchFiles("", 1, "upload_time_desc");
            })
            .catch((err) => {
                console.error(err);
                sendUserAlert(err.message || t("views.Library.upload_failed"));
            })
            .finally(() => {
                setUploading(false);
            });
    };

    const handleDownload = (fileId: string, filename: string) => {
        const downloadUrl = getFullPath(`/api/library/files/${fileId}/download`);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleDelete = (fileId: string) => {
        sendUserConfirm(t("views.Library.delete_confirm_text"), {
            title: t("views.Library.delete_confirm_title"),
            confirmText: t("views.Library.delete_confirm_button"),
            cancelText: t("views.Library.delete_cancel_button"),
            onConfirmed: () => {
                fetch(getFullPath(`/api/library/files/${fileId}`), {
                    method: "DELETE",
                })
                    .then((res) => {
                        if (res.ok) {
                            sendUserAlert(t("views.Library.delete_success"));
                            fetchFiles(debouncedKeyword, page, sortBy);
                        } else {
                            sendUserAlert(t("views.Library.delete_failed"));
                        }
                    })
                    .catch((err) => {
                        console.error(err);
                        sendUserAlert(t("views.Library.delete_failed"));
                    });
            },
        });
    };

    const getPurposeLabelAndStyle = (purpose: string) => {
        switch (purpose) {
            case "session_attachment":
                return {
                    label: t("views.Library.purpose_session_attachment"),
                    style: "bg-sky-50 text-sky-600 border-sky-100 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-900/50",
                };
            case "library_file":
                return {
                    label: t("views.Library.purpose_library_file"),
                    style: "bg-teal-50 text-teal-600 border-teal-100 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-900/50",
                };
            case "assistant_knowledge":
                return {
                    label: t("views.Library.purpose_assistant_knowledge"),
                    style: "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50",
                };
            default:
                return {
                    label: purpose || t("views.Library.purpose_unknown"),
                    style: "bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700/50",
                };
        }
    };

    const totalPages = Math.ceil(total / pageSize);

    const topbarActions = activeTab === "files" && (
        <button
            type="button"
            disabled={uploading}
            onClick={handleUploadClick}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-transparent bg-[var(--assist-accent-strong)] px-3.5 text-[13px] font-semibold text-white shadow-[0_6px_16px_rgba(39,154,179,0.16)] transition duration-160 ease-out hover:-translate-y-0.5 hover:bg-[var(--assist-accent)] hover:shadow-[0_8px_20px_rgba(39,154,179,0.22)] disabled:opacity-50 disabled:pointer-events-none"
        >
            <ArrowUpTrayIcon className="size-[18px]" />
            <span>{uploading ? t("views.Library.uploading") : t("views.Library.upload_button")}</span>
        </button>
    );

    return (
        <Container className="min-h-full w-full flex-1 overflow-y-auto bg-[var(--assist-bg)] text-[var(--assist-text)]">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
            />
            <Topbar
                title={t("views.Library.page_title")}
                actions={topbarActions}
                onToggleSidebar={onToggleSidebar}
                sidebarExpand={sidebarExpand}
            />

            <main className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-10 sm:px-8 lg:px-10">
                {/* Hero Section */}
                <section className="pb-8">
                    <div className="flex items-center gap-2.5 text-[var(--assist-accent-strong)]">
                        <BookOpenIcon className="size-5" />
                        <span className="text-[11px] font-bold uppercase tracking-[0.13em]">
                            {t("views.Library.page_title")}
                        </span>
                    </div>
                    <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[var(--assist-text)] sm:text-[32px]">
                        {t("views.Library.page_title")}
                    </h1>
                    <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-[var(--assist-text-soft)]">
                        {t("views.Library.page_subtitle")}
                    </p>
                </section>

                {/* Tabs selection */}
                <div className="mt-6 flex border-b border-[var(--assist-line)]">
                    <button
                        onClick={() => setActiveTab("files")}
                        className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-150 ${
                            activeTab === "files"
                                ? "border-[var(--assist-accent-strong)] text-[var(--assist-accent-strong)]"
                                : "border-transparent text-[var(--assist-text-soft)] hover:text-[var(--assist-text)]"
                        }`}
                    >
                        {t("views.Library.tab_files")}
                    </button>
                    <button
                        disabled
                        className="border-b-2 border-transparent px-4 py-3 text-sm font-semibold text-[var(--assist-text-faint)] cursor-not-allowed opacity-50"
                        title={t("views.Library.tab_knowledge_disabled") || "暂未开放"}
                    >
                        {t("views.Library.tab_knowledge")}
                    </button>
                </div>

                {/* Main Content Area */}
                <div className="mt-8">
                    {activeTab === "files" ? (
                        <div className="space-y-6">
                            {/* Search and Sort Filter Header */}
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="relative flex-1 max-w-md">
                                    <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[var(--assist-text-faint)]">
                                        <MagnifyingGlassIcon className="size-4" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder={t("views.Library.search_placeholder")}
                                        value={keyword}
                                        onChange={handleSearchChange}
                                        className="w-full h-9 pl-9 pr-4 text-sm rounded-[10px] border border-[var(--assist-line)] bg-white/70 text-[var(--assist-text)] placeholder-[var(--assist-text-faint)] focus:outline-none focus:ring-1 focus:ring-[var(--assist-accent-strong)] focus:border-[var(--assist-accent-strong)] dark:bg-slate-800 dark:border-slate-700"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--assist-text-soft)] shrink-0">
                                        {t("views.Library.sort_by")}:
                                    </span>
                                    <select
                                        value={sortBy}
                                        onChange={handleSortChange}
                                        className="h-9 px-3 text-xs rounded-[10px] border border-[var(--assist-line)] bg-white/70 text-[var(--assist-text-soft)] focus:outline-none focus:ring-1 focus:ring-[var(--assist-accent-strong)] dark:bg-slate-800 dark:border-slate-700"
                                    >
                                        <option value="upload_time_desc">
                                            {t("views.Library.sort_time_desc")}
                                        </option>
                                        <option value="upload_time_asc">
                                            {t("views.Library.sort_time_asc")}
                                        </option>
                                        <option value="name_asc">
                                            {t("views.Library.sort_name_asc")}
                                        </option>
                                        <option value="name_desc">
                                            {t("views.Library.sort_name_desc")}
                                        </option>
                                    </select>
                                </div>
                            </div>

                            {/* Files List / Loading / Empty */}
                            {loading ? (
                                <div className="flex min-h-[300px] items-center justify-center">
                                    <div className="size-8 animate-spin rounded-full border-[3px] border-[var(--assist-line-strong)] border-t-[var(--assist-accent-strong)]" />
                                </div>
                            ) : files.length === 0 ? (
                                <div className="flex flex-col items-center justify-center min-h-[300px] rounded-[24px] border border-dashed border-[var(--assist-line-strong)] bg-[rgba(252,253,254,0.65)] px-6 py-12 text-center dark:bg-slate-900/10">
                                    <FolderIcon className="size-12 text-[var(--assist-text-faint)] mb-4" />
                                    <p className="text-[15px] font-medium text-[var(--assist-text-soft)]">
                                        {t("views.Library.empty_files")}
                                    </p>
                                    {activeTab === "files" && (
                                        <button
                                            type="button"
                                            onClick={handleUploadClick}
                                            className="mt-4 inline-flex h-9 items-center gap-2 rounded-[10px] bg-[var(--assist-accent-strong)] px-4 text-xs font-semibold text-white transition hover:bg-[var(--assist-accent)]"
                                        >
                                            <ArrowUpTrayIcon className="size-[16px]" />
                                            <span>{t("views.Library.upload_button")}</span>
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {files.map((file) => {
                                        const { label: purposeLabel, style: purposeStyle } =
                                            getPurposeLabelAndStyle(file.purpose);
                                        return (
                                            <div
                                                key={file.file_id}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] shadow-[var(--assist-shadow-sm)] hover:shadow-[var(--assist-shadow-md)] transition duration-200 dark:bg-slate-900/50"
                                            >
                                                <div className="flex items-center min-w-0 gap-3">
                                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--assist-panel-soft)] text-[var(--assist-accent-strong)] dark:bg-slate-800">
                                                        <DocumentIcon className="size-[20px]" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h3
                                                            className="text-sm font-semibold truncate text-[var(--assist-text)] pr-2"
                                                            title={file.filename}
                                                        >
                                                            {file.filename}
                                                        </h3>
                                                        <p className="mt-1 text-xs text-[var(--assist-text-faint)] flex items-center gap-2">
                                                            <span>{formatFileSize(file.size_bytes)}</span>
                                                            <span>·</span>
                                                            <span>{formatUploadTime(file.upload_time)}</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${purposeStyle}`}
                                                    >
                                                        {purposeLabel}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() =>
                                                                handleDownload(file.file_id, file.filename)
                                                            }
                                                            className="grid size-8 place-items-center rounded-[9px] border border-[var(--assist-line)] bg-white/70 text-[var(--assist-text-soft)] transition hover:bg-white hover:text-[var(--assist-text)] dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
                                                            title={t("common.download") || "Download"}
                                                        >
                                                            <ArrowDownTrayIcon className="size-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(file.file_id)}
                                                            className="grid size-8 place-items-center rounded-[9px] border border-[var(--assist-line)] bg-white/70 text-red-500/70 transition hover:bg-red-50 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-950/30 dark:border-slate-700"
                                                            title={t("common.delete") || "Delete"}
                                                        >
                                                            <TrashIcon className="size-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="mt-6 flex items-center justify-between border-t border-[var(--assist-line)] pt-4">
                                    <button
                                        onClick={() => setPage((p) => Math.max(p - 1, 1))}
                                        disabled={page === 1}
                                        className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--assist-line)] bg-white px-3.5 text-xs font-semibold text-[var(--assist-text-soft)] hover:bg-[var(--assist-panel-soft)] disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {t("views.Library.page_prev")}
                                    </button>
                                    <span className="text-xs text-[var(--assist-text-faint)] font-medium">
                                        {t("views.Library.total_items", { count: total })} ( {page} / {totalPages} )
                                    </span>
                                    <button
                                        onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                                        disabled={page === totalPages}
                                        className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--assist-line)] bg-white px-3.5 text-xs font-semibold text-[var(--assist-text-soft)] hover:bg-[var(--assist-panel-soft)] disabled:opacity-50 disabled:pointer-events-none dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {t("views.Library.page_next")}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Knowledge Tab (Static mock RAG databases) */
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {mockKnowledgeBases.map((kb, idx) => (
                                <div
                                    key={idx}
                                    className="flex flex-col p-5 rounded-[22px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] shadow-[var(--shadow-sm)] transition hover:shadow-[var(--shadow-md)] dark:bg-slate-900/50"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-[15px] font-semibold text-[var(--assist-text)]">
                                                {kb.name}
                                            </h3>
                                            <p className="mt-1.5 text-sm text-[var(--assist-text-soft)] leading-relaxed line-clamp-3">
                                                {kb.desc}
                                            </p>
                                        </div>
                                        <span
                                            className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                kb.status === "已完成索引"
                                                    ? "bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400"
                                                    : kb.status === "持续更新"
                                                    ? "bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400"
                                                    : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
                                            }`}
                                        >
                                            {kb.status}
                                        </span>
                                    </div>
                                    <div className="mt-auto flex flex-wrap gap-2 pt-5">
                                        <span className="inline-flex items-center rounded-full bg-[var(--assist-panel-soft)] px-2.5 py-0.5 text-xs text-[var(--assist-text-soft)] dark:bg-slate-800">
                                            分块 {kb.chunkCount}
                                        </span>
                                        <span className="inline-flex items-center rounded-full bg-[var(--assist-panel-soft)] px-2.5 py-0.5 text-xs text-[var(--assist-text-soft)] dark:bg-slate-800">
                                            源文件 {kb.sourceCount}
                                        </span>
                                        <span className="inline-flex items-center rounded-full bg-[var(--assist-panel-soft)] px-2.5 py-0.5 text-xs text-[var(--assist-text-soft)] dark:bg-slate-800">
                                            RAG 检索
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </Container>
    );
};

export default Library;
