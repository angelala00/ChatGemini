import aiIcon from "../assets/icons/wand-magic-sparkles-solid.svg";
import userIcon from "../assets/icons/user-regular.svg";
import editIcon from "../assets/icons/pen-to-square-solid.svg";
import deleteIcon from "../assets/icons/trash-solid.svg";
import refreshIcon from "../assets/icons/arrows-rotate-solid.svg";
import ExportIcon from "../assets/icons/file-export-solid.svg?react";
import clipboardIcon from "../assets/icons/clipboard-regular.svg";
import { ReactElement, ReactNode, useRef } from "react";
import { setClipboardText } from "../helpers/setClipboardText";
import { setTextAreaHeight } from "../helpers/setTextAreaHeight";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { useTranslation } from "react-i18next";

export enum SessionRole {
    Model = "model",
    User = "user",
}

export enum SessionEditState {
    Edit,
    Done,
    Cancel,
}

interface SessionProps {
    readonly index: number;
    readonly prompt: string;
    readonly postscript: string;
    readonly role: SessionRole;
    readonly children: ReactNode;
    readonly editState: { index: number; state: SessionEditState };
    readonly onDelete: (index: number) => void;
    readonly onRefresh: (index: number) => void;
    readonly onEdit: (
        index: number,
        state: SessionEditState,
        prompt: string
    ) => void;
    readonly onExport: (index: number) => void;
}

export const Session = (props: SessionProps) => {
    const { t } = useTranslation();
    const {
        index,
        prompt,
        postscript,
        editState,
        role,
        children,
        onEdit,
        onDelete,
        onRefresh,
        onExport,
    } = props;

    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const handleCopy = async () => {
        let text: string = (children as ReactElement).props.children;
        if (postscript) {
            text = text.replace(postscript, "");
        }
        const success = await setClipboardText(text);
        if (success) {
            sendUserAlert(t("components.Session.handleCopy.copy_success"));
        } else {
            sendUserAlert(t("components.Session.handleCopy.copy_failed"), true);
        }
    };

    const isModel = role === SessionRole.Model;

    return (
        <div
            className={`mb-6 space-y-3 ${
                isModel ? "" : "flex flex-col items-end"
            }`}
        >
            <div
                className={`flex items-center ${
                    isModel ? "" : "w-full justify-end"
                }`}
            >
                <div
                    className={`flex size-6 items-center justify-center rounded-full ${
                        isModel ? "bg-stone-800" : "bg-lime-700"
                    }`}
                >
                    <img
                        className={
                            role === SessionRole.Model ? "size-3" : "hidden"
                        }
                        src={aiIcon}
                        alt=""
                    />
                    <img
                        className={
                            role === SessionRole.User ? "size-3" : "hidden"
                        }
                        src={userIcon}
                        alt=""
                    />
                </div>
                <span className="ml-2 text-sm font-semibold text-stone-800">
                    {isModel
                        ? t("components.Session.role_model")
                        : t("components.Session.role_user")}
                </span>
            </div>
            <div
                className={`${
                    isModel
                        ? "w-full rounded-[1.75rem] border border-stone-200/80 bg-white px-7 py-6 shadow-[0_12px_32px_rgba(0,0,0,0.04)]"
                        : "inline-flex w-fit max-w-[38rem] rounded-[1.35rem] border border-stone-300/70 bg-stone-200/90 px-5 py-4 text-stone-900 shadow-[0_6px_18px_rgba(28,25,23,0.06)]"
                }`}
            >
                {editState.state === SessionEditState.Edit &&
                index === editState.index ? (
                    <div className="flex flex-col space-y-2 lg:text-base text-sm">
                        <textarea
                            className="bg-transparent text-gray-800 rounded-lg p-2 overflow-y-scroll resize-none !outline-none"
                            placeholder="..."
                            defaultValue={prompt}
                            ref={textAreaRef}
                            onInput={({ currentTarget }) =>
                                setTextAreaHeight(currentTarget, 60, 200)
                            }
                        />
                        <div className="flex gap-2 justify-center">
                            <button
                                className="px-3 py-2 border font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => {
                                    const { current } = textAreaRef;
                                    const { value } = current!;
                                    onEdit(
                                        index,
                                        SessionEditState.Done,
                                        value !== prompt ? value : ""
                                    );
                                }}
                            >
                                {t("components.Session.submit_button")}
                            </button>
                            <button
                                className="px-3 py-2 border font-medium rounded-lg hover:bg-gray-300"
                                onClick={() =>
                                    onEdit(index, SessionEditState.Cancel, "")
                                }
                            >
                                {t("components.Session.cancel_button")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>{children}</>
                )}
            </div>
            <div
                className={`flex gap-1 ${isModel ? "ml-1" : "mr-1 justify-end self-end"}`}
            >
                <button
                    className="flex size-7 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-200/70"
                    onClick={handleCopy}
                >
                    <img src={clipboardIcon} className="size-4" alt="" />
                </button>
                {role === SessionRole.User &&
                    editState.state !== SessionEditState.Edit && (
                        <button
                            className="flex size-7 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-200/70"
                            onClick={() =>
                                onEdit(index, SessionEditState.Edit, "")
                            }
                        >
                            <img src={editIcon} className="size-4" alt="" />
                        </button>
                    )}
                {role === SessionRole.Model && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-200/70"
                        onClick={() => onRefresh(index)}
                    >
                        <img src={refreshIcon} className="size-4" alt="" />
                    </button>
                )}
                {role === SessionRole.Model && index !== 1 && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-200/70"
                        onClick={() => onDelete(index)}
                    >
                        <img src={deleteIcon} className="size-4" alt="" />
                    </button>
                )}
                {/* 导出按钮 */}
                {role === SessionRole.Model && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-stone-500 transition-colors hover:bg-stone-200/70"
                        onClick={() => onExport(index)}
                    >
                        <ExportIcon className="size-4 text-gray-500" />
                    </button>
                )}
            </div>
        </div>
    );
};
