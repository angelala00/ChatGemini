import ejectionIcon from "../assets/icons/eject-solid.svg";
import attachmentIcon from "../assets/icons/paperclip-solid.svg";
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
    document: ["txt", "pdf", "doc", "docx", "xlsx"],
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
    readonly onSubmit: (prompt: string) => void;
    readonly onUpload: (file: File | null) => void;
    readonly onAbort: () => void;
    readonly onReasoningChange?: (enabled: boolean) => void;
    readonly allowedFileTypes?: UploadCategory[];
}

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
            onAbort,
            onReasoningChange,
            allowedFileTypes,
        } = props;
        const { t, i18n } = useTranslation();

        const fileInputRef = useRef<HTMLInputElement>(null);
        const textAreaRef = useRef<HTMLTextAreaElement>(null);
        const [inputPlaceholder, setInputPlaceholder] = useState("");
        const [attachmentName, setAttachmentName] = useState("");

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

        const handleSubmit = () => {
            const { current } = textAreaRef;
            onSubmit(current!.value);
            current!.value = "";
            setTextAreaHeight(current, minHeight, maxHeight);
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
            sendUserAlert(
                t("components.InputArea.checkAttachment.upload_success")
            );
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
                handleSubmit();
                setAttachmentName("");
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

        useImperativeHandle(ref, () => textAreaRef.current!);

        return (
            <div className={`bottom-0 z-20 bg-gradient-to-t from-white via-white/92 to-transparent px-4 pb-3 pt-1 md:px-[26px] ${
                isNewSessionPage ? "sticky md:static md:pb-0 md:pt-0" : "sticky"
            }`}>
                <div className="input-area-border relative mx-auto flex min-h-[104px] w-full max-w-[882px] flex-col space-y-3 rounded-[22px] border border-[#d4dde5]/90 bg-white px-[18px] pb-3 pt-[18px] shadow-[0_18px_38px_rgba(23,28,38,0.07)] backdrop-blur max-h-48">
                    {!!attachmentName.length && (
                        <div className="truncate text-xs text-[#87919d]">
                            <img className="inline-block size-3 mr-0.5" src={attachmentIcon} alt="" />
                            {attachmentName}
                        </div>
                    )}
                    {/* 文本输入框 */}
                    <textarea
                        rows={2}
                        autoFocus={true}
                        ref={textAreaRef}
                        placeholder={busy ? "..." : inputPlaceholder}
                        className="max-h-32 w-full resize-none border-none bg-transparent px-0 py-1 text-[15px] leading-[1.7] outline-none overflow-y-auto"
                        onInput={({ currentTarget }) => setTextAreaHeight(currentTarget, minHeight, maxHeight)}
                        onKeyDown={handleKeyDown}
                    />

                    {/* 按钮区域 - 适配小屏幕 */}
                    <div className="flex min-h-10 items-center justify-between gap-3 border-t border-[#edf2f6] pt-2">
                        <div className="flex items-center">
                            {showReasoningToggle && (
                                <button
                                    type="button"
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold leading-none transition-colors ${
                                        reasoningAvailable
                                            ? reasoningEnabled
                                                ? "border-[#b8e3eb] bg-[#eef9fb] text-[#279ab3] shadow-sm hover:bg-[#e4f5f8]"
                                                : "border-[#d4dde5] bg-[#f8fafb] text-[#66717d] hover:bg-[#f4f7f9]"
                                            : "cursor-not-allowed border-[#e2e8ee] bg-[#f4f7f9] text-[#a0a9b2]"
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
                        </div>
                        <div className="flex items-center space-x-2">
                        {fileUploadEnabled && (
                            /* 上传按钮 */
                            <div>
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    accept={fileInputAccept}
                                    ref={fileInputRef}
                                    onChange={({ currentTarget }) => {
                                        const { files } = currentTarget;
                                        if (files && files.length > 0) {
                                            Array.from(files).forEach(file => {
                                                if (checkAttachment(file)) {
                                                setAttachmentName(prev => prev ? `${prev} ${file.name}` : file.name);
                                                onUpload(file);
                                                }
                                            })
                                        }
                                    }} />
                                <div className="relative group inline-flex">
                                    <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#e7edf2] bg-white/95 p-2 text-[#279ab3] transition-colors hover:bg-[#eef9fb]"
                                        onClick={({ currentTarget }) => {
                                            if (!!attachmentName.length) {
                                                setAttachmentName("");
                                                onUpload(null);
                                            } else {
                                                currentTarget.blur();
                                                fileInputRef.current!.click();
                                            }
                                        }}>
                                        <img className={!!attachmentName.length ? "size-4" : "hidden"} src={ejectionIcon} alt="" />
                                        <img className={!!attachmentName.length ? "hidden" : "size-4"} src={attachmentIcon} alt="" />
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* 发送按钮 */}
                        <button
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] text-white shadow-[0_8px_18px_rgba(63,170,194,0.24)] transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-[0_10px_22px_rgba(63,170,194,0.3)] active:translate-y-0"
                            aria-label={busy ? "停止生成" : "发送"}
                            onClick={() => {
                                if (busy) {
                                    onAbort();
                                } else {
                                    handleSubmit();
                                    setAttachmentName("");
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
