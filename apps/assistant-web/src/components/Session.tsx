import aiIcon from "../assets/icons/wand-magic-sparkles-solid.svg";
import userIcon from "../assets/icons/user-regular.svg";
import deleteIcon from "../assets/icons/trash-solid.svg";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import {
    ReactElement,
    ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
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
    const userActionsTimerRef = useRef<number | null>(null);
    const [showUserActions, setShowUserActions] = useState(false);

    const cancelUserActionsTimer = () => {
        if (userActionsTimerRef.current !== null) {
            window.clearTimeout(userActionsTimerRef.current);
            userActionsTimerRef.current = null;
        }
    };

    const handleUserActionsEnter = () => {
        cancelUserActionsTimer();
        userActionsTimerRef.current = window.setTimeout(() => {
            setShowUserActions(true);
            userActionsTimerRef.current = null;
        }, 300);
    };

    const handleUserActionsLeave = () => {
        cancelUserActionsTimer();
        setShowUserActions(false);
    };

    useEffect(() => {
        return () => cancelUserActionsTimer();
    }, []);

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
            onMouseEnter={isModel ? undefined : handleUserActionsEnter}
            onMouseLeave={isModel ? undefined : handleUserActionsLeave}
        >
            <div
                className={`flex items-center ${
                    isModel ? "" : "w-full justify-end"
                }`}
            >
                <div
                    className={`flex size-6 items-center justify-center rounded-full ${
                        isModel ? "bg-[#2f3a46]" : "bg-[#279ab3]"
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
                <span className="ml-2 text-[14px] font-semibold leading-none text-[#2f3a46]">
                    {isModel
                        ? t("components.Session.role_model")
                        : t("components.Session.role_user")}
                </span>
            </div>
            <div
                className={`${
                    isModel
                        ? "min-w-0 w-full overflow-hidden rounded-[1.75rem] border border-[#e2e8ee]/90 bg-white px-7 py-6 shadow-[0_12px_30px_rgba(23,28,38,0.05)]"
                        : "inline-flex min-w-0 w-fit max-w-[38rem] overflow-hidden rounded-[1.35rem] border border-[#d4dde5]/90 bg-[#eef9fb] px-5 py-4 text-[#2f3a46] shadow-[0_6px_18px_rgba(23,28,38,0.05)]"
                }`}
            >
                {editState.state === SessionEditState.Edit &&
                index === editState.index ? (
                    <div className="flex flex-col space-y-2 text-[15px] leading-[1.7]">
                        <textarea
                            className="bg-transparent text-[#2f3a46] rounded-lg p-2 overflow-y-scroll resize-none !outline-none"
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
                className={`flex gap-1 ${
                    isModel
                        ? "ml-1"
                        : `mt-1 h-8 items-center justify-end self-end transition-opacity duration-300 ease-out ${
                              showUserActions
                                  ? "opacity-100 pointer-events-auto"
                                  : "opacity-0 pointer-events-none"
                          }`
                }`}
            >
                <button
                    className="flex size-7 items-center justify-center rounded-xl text-[#87919d] transition-colors hover:bg-[#edf2f6]"
                    onClick={handleCopy}
                >
                    <DocumentDuplicateIcon
                        className="size-[18px]"
                        strokeWidth={2}
                        color="#737373"
                    />
                </button>
                {role === SessionRole.User &&
                    editState.state !== SessionEditState.Edit && (
                        <button
                            className="flex size-7 items-center justify-center rounded-xl text-[#87919d] transition-colors hover:bg-[#edf2f6]"
                            onClick={() =>
                                onEdit(index, SessionEditState.Edit, "")
                            }
                        >
                            <PencilSquareIcon
                                className="size-[18px]"
                                strokeWidth={2}
                                color="#737373"
                            />
                        </button>
                    )}
                {role === SessionRole.Model && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-[#87919d] transition-colors hover:bg-[#edf2f6]"
                        onClick={() => onRefresh(index)}
                    >
                        <ArrowPathIcon
                            className="size-[18px]"
                            strokeWidth={2}
                            color="#737373"
                        />
                    </button>
                )}
                {role === SessionRole.Model && index !== 1 && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-[#87919d] transition-colors hover:bg-[#edf2f6]"
                        onClick={() => onDelete(index)}
                    >
                        <img src={deleteIcon} className="size-4" alt="" />
                    </button>
                )}
                {/* 导出按钮 */}
                {role === SessionRole.Model && (
                    <button
                        className="flex size-7 items-center justify-center rounded-xl text-[#87919d] transition-colors hover:bg-[#edf2f6]"
                        onClick={() => onExport(index)}
                    >
                        <ArrowRightStartOnRectangleIcon
                            className="size-[18px]"
                            strokeWidth={2}
                            color="#737373"
                        />
                    </button>
                )}
            </div>
        </div>
    );
};
