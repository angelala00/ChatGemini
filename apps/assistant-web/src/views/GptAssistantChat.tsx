import { RefObject, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { GenerativeContentBlob } from "@google/generative-ai";
import type { PyodideInterface } from "../types/pyodide";
import { ReduxStoreProps } from "../config/store";
import { RouterComponentProps, routerConfig } from "../config/router";
import { Session, SessionEditState, SessionRole } from "../components/Session";
import { Markdown } from "../components/Markdown";
import { Container } from "../components/Container";
import { ImageView } from "../components/ImageView";
import {
    AttachmentViewItem,
    getAttachmentViewItems,
    resolveAttachmentViewItems,
} from "../helpers/getAttachmentViewItems";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { exportMdAsDocx } from "../helpers/exportMdAsDocx";
import { onUpdate as updateAI } from "../store/ai";
import { onUpdate as updateSessions } from "../store/sessions";
import { onUpdate as updateMappings } from "../store/mappings";
import { chatWithAI } from "../helpers/chatWithAI";
import { globalConfig } from "../config/global";
import { useChatReadingScroll } from "../hooks/useChatReadingScroll";
import { ArrowDownIcon } from "@heroicons/react/24/solid";
import { buildAttachmentPostscriptHtml } from "../helpers/buildAttachmentPostscriptHtml";


const GptAssistantChat = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const refreshPlaceholder = t("views.Chat.refresh_placeholder");
    const invalidPlaceholder = t("views.Chat.invalid_placeholder");
    const onAbortUpdate = props.onAbortUpdate;
    const dispatch = useDispatch();
    const sessions = useSelector((state: ReduxStoreProps) => state.sessions.sessions);
    const mappings = useSelector((state: ReduxStoreProps) => state.mappings.mappings);
    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions,
    );
    const ai = useSelector((state: ReduxStoreProps) => state.ai.ai);
    const { id } = useParams<{ id: keyof typeof sessions }>();
    const mainSectionRef = props.refs?.mainSectionRef as
        | RefObject<HTMLDivElement>
        | undefined;
    const [chat, setChat] = useState<any[]>([]);
    const [attachmentItemsByData, setAttachmentItemsByData] = useState<
        Record<string, AttachmentViewItem[]>
    >({});
    const [pythonRuntime, setPythonRuntime] = useState<PyodideInterface | null>(null);
    const [editState, setEditState] = useState<{ index: number; state: SessionEditState }>({
        index: 0,
        state: SessionEditState.Cancel,
    });
    const { showJumpToLatest, jumpToLatest } = useChatReadingScroll({
        containerRef: mainSectionRef,
        sessionKey: id ?? "",
        updateKey: `${chat.length}:${chat[chat.length - 1]?.parts.length ?? 0}:${ai.busy}`,
    });

    const handlePythonRuntimeCreated = (pyodide: PyodideInterface) => setPythonRuntime(pyodide);

    const handleRefresh = async (index: number, customSessions?: any) => {
        const finalSessions = customSessions ?? sessions;
        if (!ai.busy && id && id in finalSessions) {
            let nextSessions = {
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
            dispatch(updateSessions(nextSessions));
            const handler = (message: string, end: boolean, convId: string) => {
                if (convId !== "") {
                    dispatch(updateMappings({ ...mappings, [id]: convId }));
                }
                if (end) {
                    dispatch(updateAI({ ...ai, busy: false }));
                }
                const prevParts =
                    nextSessions[id][index].parts !== refreshPlaceholder
                        ? nextSessions[id][index].parts
                        : "";
                nextSessions = {
                    ...nextSessions,
                    [id]: [
                        ...nextSessions[id].slice(0, index),
                        {
                            role: "model",
                            parts: `${prevParts}${message}`,
                            timestamp: Date.now(),
                        },
                    ],
                };
                setChat(nextSessions[id]);
                dispatch(updateSessions(nextSessions));
            };
            const sessionExtension = sessionExtensions[id];
            const conversationId = id in mappings ? mappings[id] : "";
            const selectedModel = sessionExtension?.selectedModel ?? "";
            const reasoningEnabled =
                typeof sessionExtension?.reasoningEnabled === "boolean"
                    ? sessionExtension.reasoningEnabled
                    : true;
            const { start, abort } = chatWithAI(
                nextSessions[id].slice(0, index - 1),
                nextSessions[id][index - 1].parts,
                nextSessions[id][index - 1].attachment as GenerativeContentBlob,
                globalConfig.sse,
                conversationId,
                "gptassistant",
                handler,
                selectedModel,
                reasoningEnabled,
            );
            onAbortUpdate?.(abort);
            await start();
        } else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleRefresh.not_available"), true);
        }
    };

    const handleEdit = (index: number, state: SessionEditState, prompt: string) => {
        if (!ai.busy) {
            setEditState({ index, state });
        }
        if (!ai.busy && id && id in sessions && !!prompt.length && state === SessionEditState.Done) {
            const nextSessions = {
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
            setChat(nextSessions[id]);
            handleRefresh(index + 1, nextSessions);
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
                    const nextSessions = {
                        ...sessions,
                        [id]: [
                            ...sessions[id].slice(0, index - 1),
                            ...sessions[id].slice(index + 1),
                        ],
                    };
                    dispatch(updateSessions(nextSessions));
                    setChat(nextSessions[id]);
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
            content = content.replace(/<think>(.*?)<\/think>/gs, "").trim();
            exportMdAsDocx(
                content,
                `对话导出 - ${title} - ${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "_")}.docx`,
            );
        } else if (ai.busy) {
            sendUserAlert(t("views.Chat.handleExport.not_available"), true);
        }
    };

    useEffect(() => {
        if (id && id in sessions) {
            setChat(sessions[id]);
        } else {
            setChat([{ role: "model", parts: invalidPlaceholder, timestamp: 0 }]);
        }
    }, [id, invalidPlaceholder, sessions]);

    useEffect(() => {
        let cancelled = false;
        const attachmentDataValues = Array.from(
            new Set(
                chat
                    .map((item) => item.attachment?.data)
                    .filter((value): value is string => typeof value === "string" && !!value.length),
            ),
        );

        const missingValues = attachmentDataValues.filter((value) => !(value in attachmentItemsByData));
        if (!missingValues.length) {
            return;
        }

        Promise.all(
            missingValues.map(async (value) => ({
                key: value,
                items: await resolveAttachmentViewItems(value),
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

    return (
        <Container className="relative mx-auto w-full max-w-[940px] px-4 py-8 md:px-8">
            <ImageView>
                {chat.map(({ role, parts, attachment }, index) => {
                    const { mimeType, data } = attachment ?? { mimeType: "", data: "" };
                    const attachmentItems =
                        attachmentItemsByData[data] ?? getAttachmentViewItems(data);
                    const attachmentPostscriptHtml = buildAttachmentPostscriptHtml(
                        attachmentItems,
                        mimeType,
                    );

                    const typingEffect = `<div class="inline px-1 bg-stone-900 animate-pulse animate-duration-700"></div>`;
                    let nextParts = parts;
                    if (ai.busy && role === SessionRole.Model && index === chat.length - 1) {
                        nextParts += typingEffect;
                    }
                    return (
                        <Session
                            key={index}
                            index={index}
                            prompt={nextParts}
                            editState={editState}
                            role={role as SessionRole}
                            onRefresh={handleRefresh}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onExport={handleExport}
                            postscript={attachmentPostscriptHtml}
                        >
                            <Markdown
                                className={
                                    role === SessionRole.Model
                                        ? "prose-stone"
                                        : "prose-stone prose-headings:text-stone-900 prose-strong:text-stone-900 prose-p:text-stone-900"
                                }
                                typingEffect={typingEffect}
                                pythonRuntime={pythonRuntime}
                                onPythonRuntimeCreated={handlePythonRuntimeCreated}
                                pythonRepoUrl={`${
                                    routerConfig.mode === "hash"
                                        ? window.location.pathname
                                        : routerConfig.basename
                                }pyodide`}
                            >{`${nextParts}${attachmentPostscriptHtml}`}</Markdown>
                        </Session>
                    );
                })}
                <div className="h-2.5" />
            </ImageView>
            {showJumpToLatest && (
                <div className="sticky bottom-5 z-10 flex justify-end">
                    <button
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-300/80 bg-white/95 px-3.5 py-2 text-sm font-medium leading-none text-stone-700 shadow-[0_10px_24px_rgba(0,0,0,0.08)] backdrop-blur hover:bg-stone-50"
                        onClick={() => jumpToLatest()}
                    >
                        <ArrowDownIcon className="size-3.5 text-stone-500" />
                        <span>{t("views.Chat.jump_to_latest", "回到最新")}</span>
                    </button>
                </div>
            )}
        </Container>
    );
};

export default GptAssistantChat;
