import { useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { Session, SessionEditState, SessionRole } from "../components/Session";
import { useEffect, useState } from "react";
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
import { getAttachmentViewItems } from "../helpers/getAttachmentViewItems";
import { ImageView } from "../components/ImageView";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { RouterComponentProps, routerConfig } from "../config/router";
import type { PyodideInterface } from "../types/pyodide";
import { useTranslation } from "react-i18next";
import { exportMdAsDocx } from "../helpers/exportMdAsDocx";
import { useChatAutoScroll } from "../hooks/useChatAutoScroll";

const Chat = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const viewAttachment = t("views.Chat.view_attachment");
    const refreshPlaceholder = t("views.Chat.refresh_placeholder");
    const invalidPlaceholder = t("views.Chat.invalid_placeholder");

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

    const [chat, setChat] = useState<SessionHistory[]>([]);
    const [editState, setEditState] = useState<{
        index: number;
        state: SessionEditState;
    }>({ index: 0, state: SessionEditState.Cancel });
    const [pythonRuntime, setPythonRuntime] = useState<PyodideInterface | null>(
        null
    );

    const handlePythonRuntimeCreated = (pyodide: PyodideInterface) =>
        setPythonRuntime(pyodide);

    const scrollContainerRef = props.refs?.mainSectionRef ?? { current: null };
    const { scrollToBottom, resetAutoScroll } = useChatAutoScroll(
        scrollContainerRef,
    );

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
                    dispatch(updateAI({ ...mappings, id, convId}))
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
            let conversationId = id in sessions ? mappings[id] : "";
            const sessionExtension = sessionExtensions[id];
            let gid = "";
            if (sessionExtension && sessionExtension["gid"]) {
                gid = sessionExtension["gid"]
            }
            let selectedModel = "";
            if (sessionExtension && sessionExtension["selectedModel"]) {
                selectedModel = sessionExtension["selectedModel"]
            }
            const reasoningEnabled =
                typeof sessionExtension?.reasoningEnabled === "boolean"
                    ? sessionExtension.reasoningEnabled
                    : true;
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
                reasoningEnabled,
            );
            onAbortUpdate(abort)
            await start()
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

    useEffect(() => {
        if (id && id in sessions) {
            setChat(sessions[id]);
            let sessionTitle = sessions[id][0].title ?? sessions[id][0].parts;
            if (sessionTitle.length > 20) {
                sessionTitle = `${sessionTitle.substring(0, 20)} ...`;
            }
            document.title = `${sessionTitle} | ${siteTitle}`;
        } else {
            document.title = siteTitle;
            setChat([
                { role: "model", parts: invalidPlaceholder, timestamp: 0 },
            ]);
        }
    }, [t, siteTitle, id, sessions]);

    useEffect(() => {
        resetAutoScroll();
        const timer = window.setTimeout(() => scrollToBottom(true), 0);
        return () => window.clearTimeout(timer);
    }, [id, resetAutoScroll, scrollToBottom]);

    useEffect(() => {
        const timer = window.setTimeout(() => scrollToBottom(false), 0);
        return () => window.clearTimeout(timer);
    }, [
        chat.length,
        chat[chat.length - 1]?.timestamp,
        chat[chat.length - 1]?.parts,
        scrollToBottom,
    ]);

    return (
        <Container className="max-w-[1200px] w-full py-5 pl-3 mb-auto mx-auto px-4 md:px-16 lg:px32">
            <ImageView>
                {chat.map(({ role, parts, attachment }, index) => {
                    const { mimeType, data } = attachment ?? {
                        mimeType: "",
                        data: "",
                    };
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
                                    border-radius: 0.25rem;
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

                    const typingEffect = `<div class="inline px-1 bg-gray-900 animate-pulse animate-duration-700"></div>`;
                    if (
                        ai.busy &&
                        role === SessionRole.Model &&
                        index === chat.length - 1
                    ) {
                        parts += typingEffect;
                    }
                    return (
                        <Session
                            key={index}
                            index={index}
                            prompt={parts}
                            editState={editState}
                            role={role as SessionRole}
                            onRefresh={handleRefresh}
                            onDelete={handleDelete}
                            onEdit={handleEdit}
                            onExport={handleExport}
                            postscript={attachmentPostscriptHtml}
                        >
                            <Markdown
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
                            >{`${parts}${attachmentPostscriptHtml}`}</Markdown>
                        </Session>
                    );
                })}
            </ImageView>
        </Container>
    );
};

export default Chat;
