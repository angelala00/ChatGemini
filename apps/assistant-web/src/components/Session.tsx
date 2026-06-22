import aiIcon from "../assets/icons/wand-magic-sparkles-solid.svg";
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
    readonly previousRole?: SessionRole;
    readonly nextRole?: SessionRole;
    readonly header?: ReactNode;
    readonly footer?: ReactNode;
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
        previousRole,
        nextRole,
        header,
        footer,
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
    const isEditing =
        editState.state === SessionEditState.Edit && index === editState.index;
    const pairedWithNextModel =
        role === SessionRole.User && nextRole === SessionRole.Model;
    const pairedWithPreviousUser =
        role === SessionRole.Model && previousRole === SessionRole.User;
    const actionButtonClass =
        "flex size-7 items-center justify-center rounded-[7px] text-[rgba(118,129,141,0.58)] transition-colors hover:bg-[rgba(246,248,250,0.96)] hover:text-[rgba(47,58,70,0.98)]";
    const actionsContent = (
        <>
            <button
                className={actionButtonClass}
                onClick={handleCopy}
            >
                <DocumentDuplicateIcon
                    className="size-[18px]"
                    strokeWidth={2}
                />
            </button>
            {role === SessionRole.User &&
                editState.state !== SessionEditState.Edit && (
                    <button
                        className={actionButtonClass}
                        onClick={() =>
                            onEdit(index, SessionEditState.Edit, "")
                        }
                    >
                        <PencilSquareIcon
                            className="size-[18px]"
                            strokeWidth={2}
                        />
                    </button>
                )}
            {role === SessionRole.Model && (
                <button
                    className={actionButtonClass}
                    onClick={() => onRefresh(index)}
                >
                    <ArrowPathIcon
                        className="size-[18px]"
                        strokeWidth={2}
                    />
                </button>
            )}
            {role === SessionRole.Model && index !== 1 && (
                <button
                    className={actionButtonClass}
                    onClick={() => onDelete(index)}
                >
                    <img src={deleteIcon} className="size-4 opacity-70" alt="" />
                </button>
            )}
            {role === SessionRole.Model && (
                <button
                    className={actionButtonClass}
                    onClick={() => onExport(index)}
                >
                    <ArrowRightStartOnRectangleIcon
                        className="size-[18px]"
                        strokeWidth={2}
                    />
                </button>
            )}
        </>
    );
    const contentNode = (
        <div
            className={`${
                isModel
                    ? "min-w-0 w-full overflow-hidden py-1"
                    : isEditing
                      ? "w-full max-w-[calc(100%-42px)] overflow-hidden rounded-[22px] border border-[rgba(211,221,228,0.96)] bg-white px-[14px] py-3 text-[#2f3a46] shadow-[0_18px_36px_rgba(23,28,38,0.06),inset_0_1px_0_rgba(255,255,255,0.92)]"
                      : "inline-flex min-w-0 w-fit max-w-[680px] overflow-hidden rounded-2xl border border-[rgba(233,237,241,0.98)] bg-[linear-gradient(180deg,rgba(246,248,250,0.98),rgba(241,244,247,0.98))] px-4 py-2.5 text-[#2f3a46] leading-[1.75] shadow-[0_4px_12px_rgba(23,28,38,0.02)] md:max-w-[min(72%,680px)]"
            }`}
        >
            <div className="min-w-0 w-full">
                {isEditing ? (
                    <div className="flex flex-col gap-3 text-[15px] leading-[1.7]">
                        <textarea
                            className="min-h-[86px] bg-transparent text-[#2f3a46] overflow-y-auto resize-none rounded-[16px] border-none px-1 py-1 text-[15px] leading-[1.75] !outline-none placeholder:text-[rgba(118,129,141,0.9)]"
                            placeholder="..."
                            defaultValue={prompt}
                            ref={textAreaRef}
                            onInput={({ currentTarget }) =>
                                setTextAreaHeight(currentTarget, 86, 220)
                            }
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                className="inline-flex h-10 items-center justify-center rounded-[14px] border border-[rgba(214,221,228,0.96)] bg-white px-4 text-[14px] font-medium text-[#66717d] transition-colors hover:bg-[rgba(246,248,250,0.96)] hover:text-[#2f3a46]"
                                onClick={() =>
                                    onEdit(index, SessionEditState.Cancel, "")
                                }
                            >
                                {t("components.Session.cancel_button")}
                            </button>
                            <button
                                className="inline-flex h-10 items-center justify-center rounded-[14px] bg-[linear-gradient(180deg,rgba(109,207,228,0.98),rgba(71,185,210,0.98))] px-4 text-[14px] font-semibold text-white shadow-[0_8px_20px_rgba(71,185,210,0.22)] transition-opacity hover:opacity-95"
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
                        </div>
                    </div>
                ) : (
                    <>{children}</>
                )}
                {isModel && footer}
                {isModel && (
                    <div className="-ml-1 mt-1.5 flex h-8 items-center gap-1">
                        {actionsContent}
                    </div>
                )}
            </div>
        </div>
    );
    const actionsNode = (
        <div
            className={`flex gap-1 ${
                isModel
                    ? "hidden"
                    : `${isEditing ? "hidden" : "mt-1.5 h-8 items-center justify-end self-end transition-opacity duration-300 ease-out"} ${
                          showUserActions
                              ? "opacity-100 pointer-events-auto"
                              : "opacity-0 pointer-events-none"
                      }`
            }`}
        >
            {actionsContent}
        </div>
    );

    return (
        <div
            className={`space-y-2.5 ${
                isModel
                    ? pairedWithPreviousUser
                        ? "mb-[30px]"
                        : "mb-[36px]"
                    : pairedWithNextModel
                      ? "mb-[10px]"
                      : "mb-[24px]"
            } ${
                isModel ? "" : "flex flex-col items-end"
            }`}
            onMouseEnter={isModel ? undefined : handleUserActionsEnter}
            onMouseLeave={isModel ? undefined : handleUserActionsLeave}
        >
            {header}
            {isModel ? (
                <div className="flex items-start gap-3">
                    <div className="mt-1 flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[#54BED5] shadow-[0_6px_14px_rgba(84,190,213,0.16)]">
                        <img className="size-3.5" src={aiIcon} alt="" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-0.5 pl-[2px]" />
                        {contentNode}
                        {actionsNode}
                    </div>
                </div>
            ) : (
                <>
                    {contentNode}
                    {actionsNode}
                </>
            )}
        </div>
    );
};
