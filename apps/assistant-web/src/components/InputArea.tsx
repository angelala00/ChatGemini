import submitIcon from "../assets/icons/paper-plane-solid.svg";
import clearInputIcon from "../assets/icons/circle-xmark-solid.svg";
import ejectionIcon from "../assets/icons/eject-solid.svg";
import attachmentIcon from "../assets/icons/paperclip-solid.svg";
import disabledIcon from "../assets/icons/comment-dots-regular.svg";
import abortIcon from "../assets/icons/stop.svg";
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
    readonly onSubmit: (prompt: string) => void;
    readonly onUpload: (file: File | null) => void;
    readonly onAbort: () => void;
    readonly allowedFileTypes?: UploadCategory[];
}

export const InputArea = forwardRef(
    (props: InputAreaProps, ref: ForwardedRef<HTMLTextAreaElement>) => {
        const { busy, fileUploadEnabled, minHeight, maxHeight, onSubmit, onUpload, onAbort, allowedFileTypes } = props;
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
            <div className="sticky bottom-0 flex flex-col p-4 bg-white space-y-2 max-h-48 max-w-full">
                <div className="input-area-border relative w-full max-w-[1000px] mx-auto flex flex-col border-2 border-gray-300 rounded-lg p-2 space-y-2 min-h-20 max-h-48 bg-gray-100">
                    {!!attachmentName.length && (
                        <div className="text-gray-500 text-xs truncate">
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
                        className="p-0 border-none text-sm lg:text-base resize-none w-full outline-none max-h-32 overflow-y-auto bg-gray-100"
                        onInput={({ currentTarget }) => setTextAreaHeight(currentTarget, minHeight, maxHeight)}
                        onKeyDown={handleKeyDown}
                    />

                    {/* 按钮区域 - 适配小屏幕 */}
                    <div className="flex justify-end items-center space-x-2 h-[30px] mt-1">
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
                                    <button className="w-8 h-8 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center p-1.5"
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
                        <button className="w-8 h-8 bg-sky-100 hover:bg-sky-200 rounded-lg flex items-center justify-center p-1.5 disabled:cursor-not-allowed"
                            onClick={() => {
                                if (busy) {
                                    onAbort();
                                } else {
                                    handleSubmit();
                                    setAttachmentName("");
                                }
                            }}>
                            <img className={busy ? "hidden" : "size-4"} src={submitIcon} alt="" />
                            <img className={busy ? "size-4 animate-pulse animate-infinite animate-duration-1000" : "hidden"} src={abortIcon} alt="" />
                        </button>
                    </div>
                </div>
            </div>

        );
    }
);
