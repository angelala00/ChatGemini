import { useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { Session, SessionEditState, SessionRole } from "../components/Session";
import { RefObject, useEffect, useState } from "react";
import { SessionHistory, Sessions } from "../store/sessions";
import { useDispatch, useSelector } from "react-redux";
import { ReduxStoreProps } from "../config/store";
import { onUpdate as updateAI } from "../store/ai";
import { onUpdate as updateSessions } from "../store/sessions";
import { onUpdate as updateMappings } from "../store/mappings";
import { chatWithAI } from "../helpers/chatWithAI";
import { globalConfig } from "../config/global";
import { Container } from "../components/Container";
import { GenerativeContentBlob } from "@google/generative-ai";
import {
    AttachmentViewItem,
    getAttachmentViewItems,
    resolveAttachmentViewItems,
} from "../helpers/getAttachmentViewItems";
import { ImageView } from "../components/ImageView";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { RouterComponentProps, routerConfig } from "../config/router";
import type { PyodideInterface } from "../types/pyodide";
import { useTranslation } from "react-i18next";
import { exportMdAsDocx } from "../helpers/exportMdAsDocx";
import { useChatReadingScroll } from "../hooks/useChatReadingScroll";
import { ArrowDownIcon } from "@heroicons/react/24/solid";
import { buildAttachmentPostscriptHtml } from "../helpers/buildAttachmentPostscriptHtml";
import { HistoryAttachmentStrip } from "../components/HistoryAttachmentStrip";

const Chat = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const refreshPlaceholder = t("views.Chat.refresh_placeholder");
    const invalidPlaceholder = t("views.Chat.invalid_placeholder");
    const loadingPlaceholder = t("views.Chat.loading_placeholder");

    const onAbortUpdate = props.onAbortUpdate;
    const { site: siteTitle } = globalConfig.title;
    const { mode, basename } = routerConfig;

    const dispatch = useDispatch();
    const sessions = useSelector(
        (state: ReduxStoreProps) => state.sessions.sessions
    );

    const mappings = useSelector(
        (state: ReduxStoreProps) => state.mappings.mappings
    );

    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions
    )

    const ai = useSelector((state: ReduxStoreProps) => state.ai.ai);

    const { id } = useParams<{ id: keyof typeof sessions }>();
    const mainSectionRef = props.refs?.mainSectionRef as
        | RefObject<HTMLDivElement>
        | undefined;

    const [chat, setChat] = useState<SessionHistory[]>([]);
    const [attachmentItemsByData, setAttachmentItemsByData] = useState<
        Record<string, AttachmentViewItem[]>
    >({});
    const [editState, setEditState] = useState<{
        index: number;
        state: SessionEditState;
    }>({ index: 0, state: SessionEditState.Cancel });
    const [pythonRuntime, setPythonRuntime] = useState<PyodideInterface | null>(
        null
    );
    const { showJumpToLatest, jumpToLatest } = useChatReadingScroll({
        containerRef: mainSectionRef,
        sessionKey: id ?? "",
        updateKey: `${chat.length}:${chat[chat.length - 1]?.parts.length ?? 0}:${ai.busy}`,
        busy: ai.busy,
    });

    const handlePythonRuntimeCreated = (pyodide: PyodideInterface) =>
        setPythonRuntime(pyodide);

    const handleRefresh = async (index: number, customSessions?: Sessions) => {
        const finalSessions = customSessions ?? sessions;
        if (!ai.busy && id && id in finalSessions) {
            let _sessions = {
                ...finalSessions,
                [id]: [
                    ...finalSessions[id].slice(0, index),
                    {
                        role: "model",
                        parts: refreshPlaceholder,
                        timestamp: Date.now(),
                    },
                ],
            };
            dispatch(updateAI({ ...ai, busy: true }));
            dispatch(updateSessions(_sessions));
            const handler = (message: string, end: boolean, convId: string) => {
                if (convId !== "") {
                    dispatch(updateMappings({ ...mappings, [id]: convId }));
                }
                if (end) {
                    dispatch(updateAI({ ...ai, busy: false }));
                }
                const prevParts =
                    _sessions[id][index].parts !== refreshPlaceholder
                        ? _sessions[id][index].parts
                        : "";
                const updatedTimestamp = Date.now();
                _sessions = {
                    ..._sessions,
                    [id]: [
                        ..._sessions[id].slice(0, index),
                        {
                            role: "model",
                            parts: `${prevParts}${message}`,
                            timestamp: updatedTimestamp,
                        },
                    ],
                };
                setChat(_sessions[id]);
                dispatch(updateSessions(_sessions));
		        if (!end) {
                    dispatch(updateAI({ ...ai, busy: true }));
            	}
            };
            const sessionExtension = sessionExtensions[id];
            let conversationId =
                id in sessions
                    ? sessionExtension?.conversationId || mappings[id] || ""
                    : "";
            let gid = "";
            if (sessionExtension && sessionExtension["gid"]) {
                gid = sessionExtension["gid"]
            }
            let selectedModel = "";
            if (sessionExtension && sessionExtension["selectedModel"]) {
                selectedModel = sessionExtension["selectedModel"]
            }
            const {start, abort} = chatWithAI(
                _sessions[id].slice(0, index - 1),
                _sessions[id][index - 1].parts,
                _sessions[id][index - 1]
                    .attachment as GenerativeContentBlob,
                globalConfig.sse,
                conversationId,
                gid,
                handler,
                selectedModel,
                sessionExtension?.reasoningEnabled,
            );
            onAbortUpdate(abort)
            void start()
        } else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleRefresh.not_available"), true);
        }
    };

    const handleEdit = (
        index: number,
        state: SessionEditState,
        prompt: string
    ) => {
        if (!ai.busy) {
            setEditState({ index, state });
        }
        if (
            !ai.busy &&
            id &&
            id in sessions &&
            !!prompt.length &&
            state === SessionEditState.Done
        ) {
            const _sessions = {
                ...sessions,
                [id]: [
                    ...sessions[id].slice(0, index),
                    { ...sessions[id][index], parts: prompt },
                    {
                        role: "model",
                        parts: refreshPlaceholder,
                        timestamp: Date.now(),
                    },
                ],
            };
            setChat(_sessions[id]);
            handleRefresh(index + 1, _sessions);
        } else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleEdit.not_available"), true);
        }
    };

    const handleDelete = (index: number) => {
        if (!ai.busy && id && id in sessions) {
            sendUserConfirm(t("views.Chat.handleDelete.confirm_message"), {
                title: t("views.Chat.handleDelete.confirm_title"),
                confirmText: t("views.Chat.handleDelete.confirm_button"),
                cancelText: t("views.Chat.handleDelete.cancel_button"),
                onConfirmed: () => {
                    const _sessions = {
                        ...sessions,
                        [id]: [
                            ...sessions[id].slice(0, index - 1),
                            ...sessions[id].slice(index + 1),
                        ],
                    };
                    dispatch(updateSessions(_sessions));
                    setChat(_sessions[id]);
                },
            });
        } else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleDelete.not_available"), true);
        }
    };

    const handleExport = (index: number) => {
        if (!ai.busy && id && id in sessions) {
            const title = sessions[id][0].title ?? sessions[id][0].parts.slice(0, 10);
            let content = sessions[id][index].parts;
            // 删除思考部分
            const thinkRegex = /<think>(.*?)<\/think>/gs;
            content = content.replace(thinkRegex, "").trim(); // 去除 <think> 部分
            // 导出
            exportMdAsDocx(content, `对话导出 - ${title} - ${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "_")}.docx`);
        }
        else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleExport.not_available"), true);
        }
    };

    const normalizeChatHistory = (history: SessionHistory[]) =>
        history
            .filter(Boolean)
            .map((item) => ({
                ...item,
                parts:
                    typeof item.parts === "string"
                        ? item.parts
                        : item.parts == null
                          ? ""
                          : String(item.parts),
            }));

    useEffect(() => {
        if (id && id in sessions) {
            const nextChat = normalizeChatHistory(sessions[id]);
            setChat(
                nextChat.length
                    ? nextChat
                    : [{ role: "model", parts: invalidPlaceholder, timestamp: 0 }],
            );
            let sessionTitle = nextChat[0]?.title ?? nextChat[0]?.parts ?? "";
            if (sessionTitle.length > 20) {
                sessionTitle = `${sessionTitle.substring(0, 20)} ...`;
            }
            document.title = `${sessionTitle} | ${siteTitle}`;
        } else {
            document.title = siteTitle;
            setChat([
                { role: "model", parts: id ? loadingPlaceholder : invalidPlaceholder, timestamp: 0 },
            ]);
        }
    }, [t, siteTitle, id, invalidPlaceholder, loadingPlaceholder, sessions]);

    useEffect(() => {
        let cancelled = false;
        const attachmentDataValues = Array.from(
            chat
                .map((item) => item.attachment)
                .filter(
                    (value): value is { data: string; mimeType: string } =>
                        typeof value?.data === "string" && !!value.data.length,
                )
                .reduce(
                    (acc, item) => acc.set(item.data, item),
                    new Map<string, { data: string; mimeType: string }>(),
                )
                .values(),
        );

        const missingValues = attachmentDataValues.filter(({ data }) => !(data in attachmentItemsByData));
        if (!missingValues.length) {
            return;
        }

        Promise.all(
            missingValues.map(async ({ data, mimeType }) => ({
                key: data,
                items: await resolveAttachmentViewItems(data, mimeType),
            })),
        ).then((resolvedItems) => {
            if (cancelled) {
                return;
            }
            setAttachmentItemsByData((previous) => {
                const next = { ...previous };
                resolvedItems.forEach(({ key, items }) => {
                    next[key] = items;
                });
                return next;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [attachmentItemsByData, chat]);

    useEffect(() => {
        if (ai.busy) {
            jumpToLatest("auto");
        }
    }, [ai.busy, jumpToLatest]);

    return (
        <Container className="relative mx-auto w-full max-w-[882px] px-4 pb-2 pt-6 md:px-[26px] md:pb-1 md:pt-4">
            <ImageView>
                {chat.map(({ role, parts, attachment }, index) => {
                    const previousRole =
                        index > 0
                            ? (chat[index - 1].role as SessionRole)
                            : undefined;
                    const nextRole =
                        index < chat.length - 1
                            ? (chat[index + 1].role as SessionRole)
                            : undefined;
                    const { mimeType, data } = attachment ?? {
                        mimeType: "",
                        data: "",
                    };
                    const attachmentItems =
                        attachmentItemsByData[data] ?? getAttachmentViewItems(data, mimeType);
                    const attachmentPostscriptHtml = buildAttachmentPostscriptHtml(
                        attachmentItems,
                        mimeType,
                    );
                    const isUser = role === SessionRole.User;
                    const attachmentHeader =
                        isUser && attachmentItems.length > 0 ? (
                            <HistoryAttachmentStrip items={attachmentItems} />
                        ) : undefined;

                    const typingEffect = `<div class="inline px-1 bg-[#2f3a46] animate-pulse animate-duration-700"></div>`;
                    let nextParts =
                        typeof parts === "string"
                            ? parts
                            : parts == null
                              ? ""
                              : String(parts);
                    if (
                        ai.busy &&
                        role === SessionRole.Model &&
                        index === chat.length - 1
                    ) {
                        nextParts += typingEffect;
                    }
                    return (
                        <Session
                            key={index}
                            index={index}
                            prompt={nextParts}
                            editState={editState}
                            role={role as SessionRole}
                            previousRole={previousRole}
                            nextRole={nextRole}
                            onRefresh={handleRefresh}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onExport={handleExport}
                            postscript={isUser ? "" : attachmentPostscriptHtml}
                            header={attachmentHeader}
                        >
                            <Markdown
                                variant={
                                    role === SessionRole.Model ? "model" : "user"
                                }
                                className={
                                    role === SessionRole.Model
                                        ? ""
                                        : "prose-headings:text-[rgba(39,49,61,0.98)] prose-strong:text-[rgba(39,49,61,0.98)] prose-p:text-[rgba(39,49,61,0.98)]"
                                }
                                typingEffect={typingEffect}
                                pythonRuntime={pythonRuntime}
                                onPythonRuntimeCreated={
                                    handlePythonRuntimeCreated
                                }
                                pythonRepoUrl={`${
                                    mode === "hash"
                                        ? window.location.pathname
                                        : basename
                                }pyodide`}
                            >
                                {isUser
                                    ? nextParts
                                    : `${nextParts}${attachmentPostscriptHtml}`}
                            </Markdown>
                        </Session>
                    );
                })}
                <div className="h-0.5" />
            </ImageView>
            {showJumpToLatest && (
                <div className="sticky bottom-5 z-10 flex justify-end">
                    <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d4dde5]/90 bg-white/95 px-3.5 py-2 text-sm font-medium leading-none text-[#66717d] shadow-[0_10px_24px_rgba(23,28,38,0.08)] backdrop-blur hover:bg-[#f8fafb]"
                        onClick={() => jumpToLatest()}
                    >
                        <ArrowDownIcon className="size-3.5 text-[#87919d]" />
                        <span>{t("views.Chat.jump_to_latest", "回到最新")}</span>
                    </button>
                </div>
            )}
        </Container>
    );
};

export default Chat;
