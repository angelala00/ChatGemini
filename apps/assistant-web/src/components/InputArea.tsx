import {
    ForwardedRef,
    KeyboardEvent,
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import { setTextAreaHeight } from "../helpers/setTextAreaHeight";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { useTranslation } from "react-i18next";
import { isMobileDevice } from "../helpers/isMobileDevice";
import { UploadCategory } from "../types/models";

const CATEGORY_EXTENSION_MAP: Record<UploadCategory, string[]> = {
    document: ["txt", "md", "csv", "pdf", "doc", "docx", "xlsx", "pptx"],
    image: ["jpg", "jpeg", "png"],
};

const DEFAULT_UPLOAD_CATEGORIES: UploadCategory[] = ["document", "image"];

interface InputAreaProps {
    readonly busy: boolean;
    readonly fileUploadEnabled: boolean;
    readonly minHeight: number;
    readonly maxHeight?: number;
    readonly showReasoningToggle?: boolean;
    readonly reasoningEnabled?: boolean;
    readonly reasoningAvailable?: boolean;
    readonly isNewSessionPage?: boolean;
    readonly onSubmit: (prompt: string) => Promise<boolean> | boolean;
    readonly onUpload: (file: File) => Promise<{
        readonly fileId: string;
        readonly mimeType: string;
    } | null>;
    readonly onAttachmentsChange: (items: Array<{
        readonly fileId: string;
        readonly mimeType: string;
    }>) => void;
    readonly onAbort: () => void;
    readonly onReasoningChange?: (enabled: boolean) => void;
    readonly allowedFileTypes?: UploadCategory[];
}

interface AttachmentCardItem {
    readonly id: string;
    readonly fileId: string;
    readonly mimeType: string;
    readonly name: string;
    readonly previewUrl?: string;
    readonly sizeLabel: string;
    readonly kindLabel: string;
    readonly iconLabel: string;
    readonly iconClassName: string;
}

type AttachmentPresentation = Pick<
    AttachmentCardItem,
    "sizeLabel" | "kindLabel" | "iconLabel" | "iconClassName"
>;

const revokePreviewUrls = (items: AttachmentCardItem[]) => {
    items.forEach((item) => {
        if (item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
};

const formatAttachmentSize = (size: number) => {
    if (!Number.isFinite(size) || size <= 0) {
        return "";
    }
    if (size < 1024) {
        return `${size}B`;
    }
    if (size < 1024 * 1024) {
        return `${Math.max(1, Math.round(size / 1024))}KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
};

const resolveAttachmentPresentation = (file: File): AttachmentPresentation => {
    const extension = file.name.includes(".")
        ? file.name.split(".").pop()?.toLowerCase() ?? ""
        : "";

    if (["doc", "docx"].includes(extension)) {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "Word",
            iconLabel: "W",
            iconClassName:
                "border-[rgba(174,198,255,0.96)] bg-[linear-gradient(180deg,#5D8FFF,#2F6BE6)] shadow-[0_4px_10px_rgba(47,107,230,0.18)]",
        };
    }
    if (["xls", "xlsx", "csv"].includes(extension)) {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: extension === "csv" ? "CSV" : "Excel",
            iconLabel: extension === "csv" ? "C" : "X",
            iconClassName:
                "border-[rgba(174,223,191,0.96)] bg-[linear-gradient(180deg,#58B874,#23844A)] shadow-[0_4px_10px_rgba(35,132,74,0.18)]",
        };
    }
    if (extension === "pdf") {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "PDF",
            iconLabel: "P",
            iconClassName:
                "border-[rgba(248,186,186,0.96)] bg-[linear-gradient(180deg,#F27777,#D84545)] shadow-[0_4px_10px_rgba(216,69,69,0.18)]",
        };
    }
    if (["ppt", "pptx"].includes(extension)) {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "PPT",
            iconLabel: "P",
            iconClassName:
                "border-[rgba(248,205,173,0.96)] bg-[linear-gradient(180deg,#F4A261,#E26A2D)] shadow-[0_4px_10px_rgba(226,106,45,0.18)]",
        };
    }
    if (["md", "markdown"].includes(extension)) {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "Markdown",
            iconLabel: "M",
            iconClassName:
                "border-[rgba(203,210,222,0.96)] bg-[linear-gradient(180deg,#8D97A8,#667184)] shadow-[0_4px_10px_rgba(102,113,132,0.16)]",
        };
    }
    if (extension === "txt") {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "Text",
            iconLabel: "T",
            iconClassName:
                "border-[rgba(203,210,222,0.96)] bg-[linear-gradient(180deg,#8D97A8,#667184)] shadow-[0_4px_10px_rgba(102,113,132,0.16)]",
        };
    }
    if (["jpg", "jpeg", "png"].includes(extension)) {
        return {
            sizeLabel: formatAttachmentSize(file.size),
            kindLabel: "Image",
            iconLabel: "I",
            iconClassName:
                "border-[rgba(171,220,228,0.92)] bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] shadow-[0_4px_10px_rgba(63,170,194,0.1)]",
        };
    }
    return {
        sizeLabel: formatAttachmentSize(file.size),
        kindLabel: "File",
        iconLabel: "F",
        iconClassName:
            "border-[rgba(191,214,218,0.92)] bg-[linear-gradient(180deg,#75C8D2,#43A9C1)] shadow-[0_4px_10px_rgba(67,169,193,0.12)]",
    };
};

const attachmentIconBaseClassName =
    "grid size-8 shrink-0 place-items-center rounded-[10px] border text-[14px] font-semibold text-white";

const attachmentIconClassName = (toneClassName: string) =>
    `${attachmentIconBaseClassName} ${toneClassName}`;

export const InputArea = forwardRef(
    (props: InputAreaProps, ref: ForwardedRef<HTMLTextAreaElement>) => {
        const {
            busy,
            fileUploadEnabled,
            minHeight,
            maxHeight,
            showReasoningToggle,
            reasoningEnabled,
            reasoningAvailable,
            isNewSessionPage,
            onSubmit,
            onUpload,
            onAttachmentsChange,
            onAbort,
            onReasoningChange,
            allowedFileTypes,
        } = props;
        const { t, i18n } = useTranslation();

        const fileInputRef = useRef<HTMLInputElement>(null);
        const textAreaRef = useRef<HTMLTextAreaElement>(null);
        const attachmentItemsRef = useRef<AttachmentCardItem[]>([]);
        const [inputPlaceholder, setInputPlaceholder] = useState("");
        const [attachmentItems, setAttachmentItems] = useState<AttachmentCardItem[]>([]);
        const [promptValue, setPromptValue] = useState("");

        const activeUploadCategories = (allowedFileTypes && allowedFileTypes.length > 0
            ? Array.from(new Set(allowedFileTypes))
            : DEFAULT_UPLOAD_CATEGORIES);

        const allowedExtensions = activeUploadCategories.reduce((acc, category) => {
            const extensions = CATEGORY_EXTENSION_MAP[category];
            if (extensions) {
                extensions.forEach((item) => acc.add(item));
            }
            return acc;
        }, new Set<string>());

        if (allowedExtensions.size === 0) {
            DEFAULT_UPLOAD_CATEGORIES.forEach((category) => {
                CATEGORY_EXTENSION_MAP[category].forEach((item) => allowedExtensions.add(item));
            });
        }

        const fileInputAccept = Array.from(allowedExtensions)
            .map((ext) => `.${ext}`)
            .join(",");
        const canSubmit = !!promptValue.trim().length;

        const handleSubmit = async () => {
            const { current } = textAreaRef;
            if (!current) {
                return false;
            }
            const accepted = await onSubmit(current.value);
            if (!accepted) {
                return false;
            }
            current!.value = "";
            setPromptValue("");
            setTextAreaHeight(current, minHeight, maxHeight);
            updateAttachmentItems(() => []);
            return true;
        };

        const updateAttachmentItems = (
            updater: (prev: AttachmentCardItem[]) => AttachmentCardItem[]
        ) => {
            setAttachmentItems((prev) => {
                const next = updater(prev);
                const nextIds = new Set(next.map((item) => item.id));
                revokePreviewUrls(prev.filter((item) => item.previewUrl && !nextIds.has(item.id)));
                onAttachmentsChange(
                    next.map(({ fileId, mimeType }) => ({ fileId, mimeType }))
                );
                attachmentItemsRef.current = next;
                return next;
            });
        };

        const checkAttachment = (file: File) => {
            const sizeLimit = 20;
            if (!file) {
                return false;
            }
            if (file.size > sizeLimit * 1024 * 1024 - 100) {
                sendUserAlert(
                    t("components.InputArea.checkAttachment.size_exceed", {
                        size: sizeLimit,
                    }),
                    true
                );
                return false;
            }

            const extension = file.name.includes(".")
                ? file.name.split(".").pop()?.toLowerCase()
                : "";
            if (!extension || !allowedExtensions.has(extension)) {
                const typeLabels = activeUploadCategories.map((category) =>
                    t(`components.InputArea.checkAttachment.type_${category}`),
                );
                const joinLabels = (labels: string[]) => {
                    const filtered = labels.filter(Boolean);
                    if (filtered.length === 0) {
                        return "";
                    }
                    if (i18n.language.startsWith("zh")) {
                        return filtered.join("、");
                    }
                    if (filtered.length === 1) {
                        return filtered[0];
                    }
                    const head = filtered.slice(0, -1);
                    const tail = filtered[filtered.length - 1];
                    return `${head.join(", ")} and ${tail}`;
                };
                const allowedTypesText = joinLabels(typeLabels);
                sendUserAlert(
                    t("components.InputArea.checkAttachment.illegal_format", {
                        types: allowedTypesText,
                    }),
                    true
                );
                return false;
            }
            return true;
        };

        const setPlaceholderByWidth = () => {
            const { current } = textAreaRef;
            if (current) {
                const { clientWidth } = current;
                if (clientWidth > 512) {
                    setInputPlaceholder(
                        t(
                            "components.InputArea.setPlaceholderByWidth.placeholder_for_pc"
                        )
                    );
                } else {
                    setInputPlaceholder(
                        t(
                            "components.InputArea.setPlaceholderByWidth.placeholder_for_mobile"
                        )
                    );
                }
            }
        };

        const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
            const { shiftKey, key, currentTarget } = e;
            const { value } = currentTarget;
            if (
                !busy &&
                !shiftKey &&
                key === "Enter" &&
                !!value.trim().length &&
                !isMobileDevice()
            ) {
                e.preventDefault();
                void handleSubmit();
            }
        };

        useEffect(() => {
            if (textAreaRef.current) {
                setTextAreaHeight(textAreaRef.current, minHeight, maxHeight);
            }
            setPlaceholderByWidth();
            window.addEventListener("resize", setPlaceholderByWidth);
            return () =>
                window.removeEventListener("resize", setPlaceholderByWidth);
        }, [t]);

        useEffect(() => {
            attachmentItemsRef.current = attachmentItems;
        }, [attachmentItems]);

        useEffect(() => {
            return () => {
                revokePreviewUrls(attachmentItemsRef.current);
            };
        }, []);

        useImperativeHandle(ref, () => textAreaRef.current!);

        return (
            <div className={`bottom-0 z-20 bg-white/95 px-4 md:px-[26px] ${
                isNewSessionPage
                    ? "sticky pb-3 pt-1 md:static md:pb-0 md:pt-0"
                    : "sticky pb-5 pt-1"
            }`}>
                <div className={`input-area-border relative mx-auto flex w-full max-w-[848px] flex-col rounded-[22px] border border-[rgba(211,221,228,0.96)] bg-white px-[12px] shadow-[0_32px_62px_rgba(23,28,38,0.09),inset_0_1px_0_rgba(255,255,255,0.92)] transition-[border-color,box-shadow] duration-150 focus-within:border-[rgba(189,223,230,0.98)] focus-within:shadow-[0_36px_72px_rgba(23,28,38,0.1),0_0_0_4px_rgba(71,185,210,0.11)] ${
                    attachmentItems.length > 0
                        ? "min-h-[148px] max-h-[18rem] gap-3 pb-3 pt-[10px]"
                        : "min-h-[104px] max-h-48 gap-3 pb-3 pt-[18px]"
                }`}>
                    {attachmentItems.length > 0 && (
                        <div className="rounded-[14px] p-0.5">
                            <div className="overflow-x-auto overflow-y-hidden pb-0.5 scrollbar-hide">
                                <div className="flex min-w-max gap-2.5">
                                {attachmentItems.map((item) => (
                                    item.previewUrl ? (
                                        <div
                                            key={item.id}
                                            className="group relative h-[58px] w-[58px] flex-none overflow-hidden rounded-[13px] border border-[rgba(236,239,242,0.98)] bg-[rgba(247,249,251,0.98)] shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]"
                                        >
                                            <button
                                                type="button"
                                                className="absolute right-1 top-1 z-10 inline-flex size-5 items-center justify-center rounded-full bg-[rgba(20,24,30,0.82)] text-white opacity-0 transition-[opacity,background-color] group-hover:opacity-100 hover:bg-[rgba(20,24,30,0.94)] focus:opacity-100"
                                                aria-label={`删除附件 ${item.name}`}
                                                onClick={() =>
                                                    updateAttachmentItems((prev) =>
                                                        prev.filter((attachment) => attachment.id !== item.id)
                                                    )
                                                }
                                            >
                                                <svg
                                                    className="size-2.5"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M6 6 18 18" />
                                                    <path d="M18 6 6 18" />
                                                </svg>
                                            </button>
                                            <img
                                                src={item.previewUrl}
                                                alt={item.name}
                                                className="h-full w-full object-cover"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            key={item.id}
                                            className="group relative flex w-[260px] flex-none items-center gap-2.5 rounded-[13px] border border-[rgba(236,239,242,0.98)] bg-[rgba(247,249,251,0.98)] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.94)]"
                                        >
                                            <button
                                                type="button"
                                                className="pointer-events-none absolute right-0.5 top-0.5 inline-flex size-4.5 items-center justify-center rounded-full bg-[rgba(20,24,30,0.82)] text-white opacity-0 transition-[opacity,background-color] group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[rgba(20,24,30,0.94)] focus:pointer-events-auto focus:opacity-100"
                                                aria-label={`删除附件 ${item.name}`}
                                                onClick={() =>
                                                    updateAttachmentItems((prev) =>
                                                        prev.filter((attachment) => attachment.id !== item.id)
                                                    )
                                                }
                                            >
                                                <svg
                                                    className="size-2.5"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2.2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M6 6 18 18" />
                                                    <path d="M18 6 6 18" />
                                                </svg>
                                            </button>
                                            <div className={attachmentIconClassName(item.iconClassName)}>
                                                {item.iconLabel}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-semibold leading-5 text-[#2f3a46]">
                                                    {item.name}
                                                </div>
                                                <div className="truncate pt-0.5 text-[11px] leading-4 text-[#87919d]">
                                                    {item.kindLabel}{item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* 文本输入框 */}
                    <div className={`flex min-h-0 flex-1 flex-col ${attachmentItems.length > 0 ? "px-1 pt-1.5" : ""}`}>
                        <textarea
                            rows={2}
                            autoFocus={true}
                            ref={textAreaRef}
                            placeholder={busy ? "..." : inputPlaceholder}
                            className="min-h-9 max-h-32 w-full flex-1 resize-none overflow-y-auto border-none bg-transparent px-0 py-1.5 text-[15px] leading-[1.7] text-[#2f3a46] outline-none placeholder:text-[rgba(118,129,141,0.9)]"
                            onInput={({ currentTarget }) => {
                                setPromptValue(currentTarget.value);
                                setTextAreaHeight(currentTarget, minHeight, maxHeight);
                            }}
                            onKeyDown={handleKeyDown}
                        />
                    </div>

                    {/* 按钮区域 - 适配小屏幕 */}
                    <div className={`flex min-h-10 items-center justify-between gap-3 ${attachmentItems.length > 0 ? "pt-0.5" : ""}`}>
                        <div className="flex items-center">
                            {fileUploadEnabled && (
                                <div>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        accept={fileInputAccept}
                                        ref={fileInputRef}
                                        onChange={async ({ currentTarget }) => {
                                            const { files } = currentTarget;
                                            if (files && files.length > 0) {
                                                const nextItems: AttachmentCardItem[] = [];
                                                for (const file of Array.from(files)) {
                                                    if (checkAttachment(file)) {
                                                        const presentation = resolveAttachmentPresentation(file);
                                                        const uploaded = await onUpload(file);
                                                        if (uploaded) {
                                                            const previewUrl = uploaded.mimeType.startsWith("image/")
                                                                ? URL.createObjectURL(file)
                                                                : undefined;
                                                            sendUserAlert(
                                                                t("components.InputArea.checkAttachment.upload_success")
                                                            );
                                                            nextItems.push({
                                                                id: `${uploaded.fileId}-${file.name}-${file.lastModified}`,
                                                                fileId: uploaded.fileId,
                                                                mimeType: uploaded.mimeType,
                                                                name: file.name,
                                                                previewUrl,
                                                                ...presentation,
                                                            });
                                                        }
                                                    }
                                                }
                                                if (nextItems.length > 0) {
                                                    updateAttachmentItems((prev) => [...prev, ...nextItems]);
                                                }
                                                currentTarget.value = "";
                                            }
                                        }}
                                    />
                                    <div className="relative group inline-flex">
                                        <button
                                            type="button"
                                            className="inline-flex h-10 w-12 items-center justify-start bg-transparent pr-1 text-[#279ab3]"
                                            aria-label="添加附件"
                                            onClick={({ currentTarget }) => {
                                                currentTarget.blur();
                                                fileInputRef.current!.click();
                                            }}
                                        >
                                            <span
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color] hover:bg-[rgba(232,246,250,0.98)]"
                                            >
                                                <svg
                                                    className="size-6"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                >
                                                    <path d="M12 5v14" />
                                                    <path d="M5 12h14" />
                                                </svg>
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="-mr-0.5 flex items-center gap-2">
                            {showReasoningToggle && (
                                <button
                                    type="button"
                                    className={`inline-flex h-8 items-center gap-2 rounded-full px-2.5 text-[12px] font-medium leading-none transition-[background-color,color] ${
                                        reasoningAvailable
                                            ? reasoningEnabled
                                                ? "bg-[rgba(232,246,250,0.98)] text-[#279ab3] hover:bg-[rgba(224,242,247,0.98)]"
                                                : "bg-transparent text-[#5f6d7a] hover:bg-[rgba(246,248,250,0.96)] hover:text-[#2f3a46]"
                                            : "cursor-not-allowed bg-transparent text-[#a0a9b2]"
                                    }`}
                                    disabled={!reasoningAvailable}
                                    onClick={() => onReasoningChange?.(!(reasoningEnabled ?? false))}
                                >
                                    <span
                                        className={`inline-block size-2 rounded-full ${
                                            reasoningAvailable
                                                ? reasoningEnabled
                                                    ? "bg-[#48b6cd]"
                                                    : "bg-[#87919d]"
                                                : "bg-[#c3ccd4]"
                                        }`}
                                    />
                                    <span>{t("components.InputArea.reasoning_toggle.label")}</span>
                                </button>
                            )}
                            {/* 发送按钮 */}
                            <button
                                type="button"
                                className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-white transition-[transform,box-shadow,background-color] ${
                                    busy || canSubmit
                                        ? "bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] shadow-[0_10px_20px_rgba(63,170,194,0.24)] hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(63,170,194,0.3)] active:translate-y-0"
                                        : "cursor-not-allowed bg-[linear-gradient(180deg,#d4dde5,#b4c0cc)] shadow-none"
                                }`}
                                aria-label={busy ? "停止生成" : "发送"}
                                disabled={!busy && !canSubmit}
                                onClick={() => {
                                    if (busy) {
                                        onAbort();
                                    } else {
                                        void handleSubmit();
                                    }
                                }}
                            >
                                {busy ? (
                                    <svg
                                        className="size-4 animate-pulse animate-infinite animate-duration-1000"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        aria-hidden="true"
                                    >
                                        <path d="M6 6h12v12H6z" />
                                    </svg>
                                ) : (
                                    <svg
                                        className="size-5"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        aria-hidden="true"
                                    >
                                        <path d="M12 19V5" />
                                        <path d="m6 11 6-6 6 6" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        );
    }
);
