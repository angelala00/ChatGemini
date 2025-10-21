import { useParams } from "react-router-dom";
import { Markdown } from "../components/Markdown";
import { Session, SessionEditState, SessionRole } from "../components/Session";
import { useCallback, useEffect, useState } from "react";
import { SessionHistory, Sessions } from "../store/sessions";
import { useDispatch, useSelector } from "react-redux";
import { ReduxStoreProps } from "../config/store";
import { onUpdate as updateAI } from "../store/ai";
import { onUpdate as updateSessions } from "../store/sessions";
import mappings, { onUpdate as updateMappings } from "../store/mappings";
import { chatWithAI } from "../helpers/chatWithAI";
import { globalConfig } from "../config/global";
import { Container } from "../components/Container";
import { GenerativeContentBlob } from "@google/generative-ai";
import { getBase64BlobUrl } from "../helpers/getBase64BlobUrl";
import { ImageView } from "../components/ImageView";
import { sendUserConfirm } from "../helpers/sendUserConfirm";
import { sendUserAlert } from "../helpers/sendUserAlert";
import { RouterComponentProps, routerConfig } from "../config/router";
import { PyodideInterface } from "pyodide";
import { useTranslation } from "react-i18next";
import { stat } from "node:fs/promises";
import { exportMdAsDocx } from "../helpers/exportMdAsDocx";

const Chat = (props: RouterComponentProps) => {
    const { t } = useTranslation();
    const viewAttachment = t("views.Chat.view_attachment");
    const refreshPlaceholder = t("views.Chat.refresh_placeholder");
    const invalidPlaceholder = t("views.Chat.invalid_placeholder");

    const mainSectionRef = props.refs?.mainSectionRef.current ?? null;
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
    const [attachmentsURL, setAttachmentsURL] = useState<
        Record<number, string>
    >({});
    const [pythonRuntime, setPythonRuntime] = useState<PyodideInterface | null>(
        null
    );

    const handlePythonRuntimeCreated = (pyodide: PyodideInterface) =>
        setPythonRuntime(pyodide);

    const [autoScroll, setAutoScroll] = useState(true)
    

    useEffect(() => {
        if (mainSectionRef) {
            const bottomThreshold = 4;
            let userInteracting = false;
            let userHasLeftBottom = false;
            let interactionTimeout: ReturnType<typeof setTimeout> | undefined;
            let settleTimeout: ReturnType<typeof setTimeout> | undefined;

            const computeIsAtBottom = () =>
                mainSectionRef.scrollHeight -
                    mainSectionRef.scrollTop -
                    mainSectionRef.clientHeight <=
                bottomThreshold;

            const scheduleInteractionSettle = () => {
                if (interactionTimeout) {
                    clearTimeout(interactionTimeout);
                }
                interactionTimeout = setTimeout(() => {
                    userInteracting = false;
                    if (!userHasLeftBottom && computeIsAtBottom()) {
                        setAutoScroll(true);
                    }
                }, 300);
            };

            const handleUserInteraction = () => {
                userInteracting = true;
                userHasLeftBottom = false;
                setAutoScroll(false);
                scheduleInteractionSettle();
            };

            const handleScroll = () => {
                if (settleTimeout) {
                    clearTimeout(settleTimeout);
                }
                settleTimeout = setTimeout(() => {
                    const isAtBottom = computeIsAtBottom();
                    if (userInteracting) {
                        if (isAtBottom) {
                            if (userHasLeftBottom) {
                                userInteracting = false;
                                userHasLeftBottom = false;
                                setAutoScroll(true);
                            } else {
                                scheduleInteractionSettle();
                            }
                        } else {
                            userHasLeftBottom = true;
                            scheduleInteractionSettle();
                        }
                        return;
                    }
                    setAutoScroll(isAtBottom);
                }, 50);
            };

            mainSectionRef.addEventListener("wheel", handleUserInteraction, {
                passive: true,
            });
            mainSectionRef.addEventListener("touchstart", handleUserInteraction, {
                passive: true,
            });
            mainSectionRef.addEventListener("pointerdown", handleUserInteraction);
            mainSectionRef.addEventListener("scroll", handleScroll, {
                passive: true,
            });
            return () => {
                if (interactionTimeout) {
                    clearTimeout(interactionTimeout);
                }
                if (settleTimeout) {
                    clearTimeout(settleTimeout);
                }
                mainSectionRef.removeEventListener("wheel", handleUserInteraction);
                mainSectionRef.removeEventListener(
                    "touchstart",
                    handleUserInteraction,
                );
                mainSectionRef.removeEventListener(
                    "pointerdown",
                    handleUserInteraction,
                );
                mainSectionRef.removeEventListener("scroll", handleScroll);
            };
        }
    }, [mainSectionRef]);


    const scrollToBottom = useCallback(
        (force: boolean = false) =>
            (ai.busy || force) && autoScroll &&
            mainSectionRef?.scrollTo({
                top: mainSectionRef.scrollHeight,
                behavior: "auto",
            }),
        [ai, mainSectionRef, autoScroll]
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
        // scrollToBottom(true)
        setTimeout(() => scrollToBottom(true), 300);
    }, [t, siteTitle, id, sessions, mainSectionRef, scrollToBottom]);

    return (
        <Container className="max-w-[1200px] w-full py-5 pl-3 mb-auto mx-auto px-4 md:px-16 lg:px32">
            <ImageView>
                {chat.map(({ role, parts, attachment, timestamp }, index) => {
                    const { mimeType, data } = attachment ?? {
                        mimeType: "",
                        data: "",
                    };
                    let base64BlobURL = "";
                    if (!!data.length && timestamp in attachmentsURL) {
                        base64BlobURL = attachmentsURL[timestamp];
                    } else if (!!data.length) {
                        base64BlobURL = getBase64BlobUrl(
                            `data:${mimeType};base64,${data}`
                        );
                        setAttachmentsURL((prev) => ({
                            ...prev,
                            [timestamp]: base64BlobURL,
                        }));
                    }

                    const attachmentPostscriptHtml = `\n\n---\n\n<div class="inline-block text-center overflow-hidden">
                        <a data-image-view="gallery" href="${base64BlobURL}">
                            <img src="${base64BlobURL}" style="
                                max-width: 10rem;
                                margin-top: 0;
                                margin-bottom: 0.2rem;
                                border-radius: 0.25rem;
                            " alt="" />
                        </a>
                        <span class="text-xs text-gray-400">
                            ${viewAttachment}
                        </span>
                    </div>`;

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
                            postscript={
                                !!data.length ? attachmentPostscriptHtml : ""
                            }
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
                            >{`${parts}${
                                !!data.length ? attachmentPostscriptHtml : ""
                            }`}</Markdown>
                        </Session>
                    );
                })}
            </ImageView>
        </Container>
    );
};

export default Chat;
