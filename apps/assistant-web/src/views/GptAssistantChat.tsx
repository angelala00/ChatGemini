import { useCallback, useEffect, useState } from "react";
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
import { getAttachmentViewItems } from "../helpers/getAttachmentViewItems";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { exportMdAsDocx } from "../helpers/exportMdAsDocx";
import { onUpdate as updateAI } from "../store/ai";
import { onUpdate as updateSessions } from "../store/sessions";
import { onUpdate as updateMappings } from "../store/mappings";
import { chatWithAI } from "../helpers/chatWithAI";
import { globalConfig } from "../config/global";


const GptAssistantChat = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const viewAttachment = t("views.Chat.view_attachment");
    const refreshPlaceholder = t("views.Chat.refresh_placeholder");
    const invalidPlaceholder = t("views.Chat.invalid_placeholder");
    const mainSectionRef = props.refs?.mainSectionRef.current ?? null;
    const onAbortUpdate = props.onAbortUpdate;
    const dispatch = useDispatch();
    const sessions = useSelector((state: ReduxStoreProps) => state.sessions.sessions);
    const mappings = useSelector((state: ReduxStoreProps) => state.mappings.mappings);
    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions,
    );
    const ai = useSelector((state: ReduxStoreProps) => state.ai.ai);
    const { id } = useParams<{ id: keyof typeof sessions }>();
    const [chat, setChat] = useState<any[]>([]);
    const [pythonRuntime, setPythonRuntime] = useState<PyodideInterface | null>(null);
    const [editState, setEditState] = useState<{ index: number; state: SessionEditState }>({
        index: 0,
        state: SessionEditState.Cancel,
    });

    const handlePythonRuntimeCreated = (pyodide: PyodideInterface) => setPythonRuntime(pyodide);

    const scrollToBottom = useCallback(
        (force: boolean = false) =>
            (ai.busy || force) &&
            mainSectionRef?.scrollTo({
                top: mainSectionRef.scrollHeight,
                behavior: "auto",
            }),
        [ai.busy, mainSectionRef],
    );

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
        setTimeout(() => scrollToBottom(true), 300);
    }, [id, invalidPlaceholder, scrollToBottom, sessions]);

    return (
        <Container className="max-w-[1100px] w-full py-6 mb-auto mx-auto px-4 md:px-10">
            <ImageView>
                {chat.map(({ role, parts, attachment }, index) => {
                    const { mimeType, data } = attachment ?? { mimeType: "", data: "" };
                    const attachmentItems = getAttachmentViewItems(data);
                    const isSingleImageAttachment =
                        attachmentItems.length === 1 && mimeType.startsWith("image/");
                    const attachmentPostscriptHtml = attachmentItems.length
                        ? `\n\n---\n\n<div class="inline-block overflow-hidden">
                        ${
                            isSingleImageAttachment
                                ? `<div class="text-center">
                            <a data-image-view="gallery" href="${attachmentItems[0].href}">
                                <img src="${attachmentItems[0].href}" style="
                                    max-width: 10rem;
                                    margin-top: 0;
                                    margin-bottom: 0.2rem;
                                    border-radius: 0.75rem;
                                " alt="" />
                            </a>
                            <a class="block text-xs text-gray-400 hover:text-gray-600 no-underline" href="${attachmentItems[0].href}" target="_blank" rel="noreferrer">
                                ${viewAttachment}
                            </a>
                        </div>`
                                : `<div class="text-left">
                            ${attachmentItems
                                .map(
                                    ({ href }, attachmentIndex) =>
                                        `<a class="block text-sm text-blue-600 hover:text-blue-800 no-underline" href="${href}" target="_blank" rel="noreferrer">
                                    ${attachmentItems.length === 1 ? viewAttachment : `${viewAttachment} ${attachmentIndex + 1}`}
                                </a>`,
                                )
                                .join("")}
                        </div>`
                        }
                    </div>`
                        : "";

                    const typingEffect = `<div class="inline px-1 bg-stone-900 animate-pulse animate-duration-700"></div>`;
                    let nextParts = parts;
                    if (ai.busy && role === SessionRole.Model && index === chat.length - 1) {
                        nextParts += typingEffect;
                    }
                    return (
                        <div
                            key={index}
                            className={role === SessionRole.Model ? "rounded-3xl bg-stone-50/80" : "rounded-3xl bg-white"}
                        >
                            <Session
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
                                    className="prose-stone"
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
                        </div>
                    );
                })}
            </ImageView>
        </Container>
    );
};

export default GptAssistantChat;
