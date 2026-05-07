import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { globalConfig } from "./config/global";
import { Sidebar } from "./components/Sidebar";
import { Container } from "./components/Container";
import { Header } from "./components/Header";
import { InputArea } from "./components/InputArea";
import { routerConfig } from "./config/router";
import { RouterView } from "./components/RouterView";
import { Skeleton } from "./components/Skeleton";
import { useDispatch, useSelector } from "react-redux";
import { ReduxStoreProps } from "./config/store";
import { onUpdate as updateAI } from "./store/ai";
import { matchPath, useNavigate, useLocation } from "react-router-dom";
import { saveMdToHtml } from "./helpers/saveMdToHtml";
import { initialSessions, onUpdate as updateSessions } from "./store/sessions";
import { initialMappings, onUpdate as updateMappings } from "./store/mappings";
import { initialSessionExtensions, onUpdate as updateSessionExtensions } from "./store/sessionsExtension";
import { chatWithAI } from "./helpers/chatWithAI";
import { GenerativeContentBlob } from "@google/generative-ai";
import { handleRequest } from "./helpers/handleRequest";
import { sendUserAlert } from "./helpers/sendUserAlert";
import { sendUserConfirm } from "./helpers/sendUserConfirm";
import { LoginByOAuth } from "./components/LoginByOAuth";
import siteLogo from "./assets/logo.svg";
import i18n, { i18nConfig } from "./config/i18n";
import { setUserLocale } from "./helpers/setUserLocale";
import { useTranslation } from "react-i18next";
import { getCurrentLocale } from "./helpers/getCurrentLocale";
import { getFullPath } from "./helpers/getDomainAndPath";
import { ModelOption, UploadCategory } from "./types/models";
import { resolveAttachmentViewItems } from "./helpers/getAttachmentViewItems";
import { buildAttachmentPostscriptHtml } from "./helpers/buildAttachmentPostscriptHtml";

const PREFERRED_MODEL_COOKIE_KEY = "preferred_model";
const PREFERRED_REASONING_COOKIE_KEY = "preferred_reasoning_enabled";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

const readPreferredModel = () => {
    if (typeof document === "undefined") {
        return "";
    }
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${PREFERRED_MODEL_COOKIE_KEY}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]) : "";
};

const writePreferredModel = (modelId: string) => {
    if (typeof document === "undefined") {
        return;
    }
    const expires = new Date(Date.now() + COOKIE_MAX_AGE_MS).toUTCString();
    document.cookie = `${PREFERRED_MODEL_COOKIE_KEY}=${encodeURIComponent(
        modelId,
    )}; path=/; expires=${expires}`;
};

const readPreferredReasoningEnabled = () => {
    if (typeof document === "undefined") {
        return null;
    }
    const match = document.cookie.match(
        new RegExp(`(?:^|; )${PREFERRED_REASONING_COOKIE_KEY}=([^;]*)`),
    );
    if (!match) {
        return null;
    }
    const value = decodeURIComponent(match[1]);
    if (value === "true") {
        return true;
    }
    if (value === "false") {
        return false;
    }
    return null;
};

const writePreferredReasoningEnabled = (enabled: boolean) => {
    if (typeof document === "undefined") {
        return;
    }
    const expires = new Date(Date.now() + COOKIE_MAX_AGE_MS).toUTCString();
    document.cookie = `${PREFERRED_REASONING_COOKIE_KEY}=${encodeURIComponent(
        String(enabled),
    )}; path=/; expires=${expires}`;
};


const App = () => {
    const { t } = useTranslation();
    const { title, passcodes } = globalConfig;
    const { header, site } = title;
    const { routes } = routerConfig;
    const { fallback, resources } = i18nConfig;
    const locales = Object.entries(resources).reduce((acc, [key, value]) => {
        acc[key] = value.label;
        return acc;
    }, {} as Record<string, string>);

    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const sessions = useSelector(
        (state: ReduxStoreProps) => state.sessions.sessions
    );
    const mappings = useSelector(
        (state: ReduxStoreProps) => state.mappings.mappings
    )
    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions
    )
    const ai = useSelector((state: ReduxStoreProps) => state.ai.ai);
    const mainSectionRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);

    const [abortFn, setAbortFn] = useState<() => void>(() => () => {});
    const [currentLocale, setCurrentLocale] = useState(fallback);
    const [hasLogined, setHasLogined] = useState(false);
    const [userName, setUserName] = useState("");
    const [uploadInlineData, setUploadInlineData] =
        useState<GenerativeContentBlob>({ data: "", mimeType: "" });
    const [sidebarExpand, setSidebarExpand] = useState(window.innerWidth > 900);

    const setCurrentLocaleToState = async () =>
        setCurrentLocale(await getCurrentLocale(i18n));

    const handleSwitchLocale = (locale: string) => setUserLocale(i18n, locale);


    const [fileUploadEnabled, setFileUploadEnabled] = useState(false);
    const [models, setModels] = useState<ModelOption[] | undefined>(undefined);
    const [serverDefaultModel, setServerDefaultModel] = useState("");
    const [defaultModel, setDefaultModel] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [serverDefaultReasoning, setServerDefaultReasoning] = useState(true);
    const [selectedReasoningEnabled, setSelectedReasoningEnabled] = useState(true);
    const [pendingManualModel, setPendingManualModel] = useState<string | null>(
        null,
    );
    
    const [pageTitle, setPageTitle] = useState("");
    const [pageLogo, setPageLogo] = useState("");
    const [pageName, setPageName] = useState("");
    const [pageSubTitle, setPageSubTitle] = useState("");
    const [pageSamples, setPageSamples] = useState<string[]>([]);
    const [isNoAuthorized, setIsNoAuthorized] = useState(false);
    const [gptsFeatureAllowed, setGptsFeatureAllowed] = useState(false);
    const [gptsPermissionLoaded, setGptsPermissionLoaded] = useState(false);
    const [voiceLabAllowed, setVoiceLabAllowed] = useState(false);
    
    const pathParts = location.pathname.split("/")
    const mod = pathParts[1];
    let gid: string;
    let id: string;
    if (mod == 'g'){
        gid = pathParts[2] || "";
        id = pathParts[4] || "";
    } else {
        gid = "";
        id = pathParts[2] || "";
    }
    // console.log("====id:" + id + " ====gid:" + gid)
    let r_gid = gid?gid:"gptassistant"


    const handleExportSession = async (id: string) => {
        const session = sessions[id];
        if (session) {
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const sessionTime = new Date(parseInt(id)).toLocaleString();
            const exportTime = new Date().toLocaleString();
            let exportData = `# ${header}\n\n---\n\n- ${t(
                "App.handleExportSession.user_timezone"
            )} ${timezone}\n- ${t(
                "App.handleExportSession.session_time"
            )} ${sessionTime}\n- ${t(
                "App.handleExportSession.export_time"
            )} ${exportTime}\n\n---\n\n`;
            for (const { role, parts, timestamp, attachment } of session) {
                let renderedParts = parts;
                if (!!attachment?.data.length) {
                    const { data, mimeType } = attachment;
                    const attachmentItems = await resolveAttachmentViewItems(data);
                    renderedParts += buildAttachmentPostscriptHtml(attachmentItems, mimeType);
                }
                const timeString = new Date(timestamp).toLocaleString();
                exportData += `## ${
                    role === "user"
                        ? t("App.handleExportSession.role_user")
                        : t("App.handleExportSession.role_model")
                }@${timeString}\n\n${renderedParts}\n\n`;
            }
            saveMdToHtml(
                exportData,
                `${t("App.handleExportSession.filename_prefix")}_${site}_${id}`
            );
        } else {
            sendUserAlert(t("App.handleExportSession.export_failed"), true);
        }
    };

    const handleRenameSession = (id: string, newTitle: string) => {
        if (!ai.busy) {
            const _sessions = {
                ...sessions,
                [id]: [
                    { ...sessions[id][0], title: newTitle },
                    ...sessions[id].slice(1),
                ],
            };
            dispatch(updateSessions(_sessions));
        } else {
            sendUserAlert(t("App.handleRenameSession.not_available"), true);
        }
    };

    const handleDeleteSession = (id: string) => {
        if (!ai.busy) {
            sendUserConfirm(t("App.handleDeleteSession.confirm_message"), {
                title: t("App.handleDeleteSession.confirm_title"),
                confirmText: t("App.handleDeleteSession.confirm_button"),
                cancelText: t("App.handleDeleteSession.cancel_button"),
                onConfirmed: () => {
                    navigate(routes.index.prefix);
                    const _sessions = { ...sessions };
                    delete _sessions[id];
                    dispatch(updateSessions(_sessions));
                    const _mappings = { ...mappings };
                    delete _mappings[id];
                    dispatch(updateMappings(mappings));
                    dispatch(updateSessionExtensions(sessionExtensions));
                    sendUserAlert(t("App.handleDeleteSession.on_confirmed"));
                },
            });
        } else {
            sendUserAlert(t("App.handleDeleteSession.not_available"), true);
        }
    };

    const handlePurgeSessions = () => {
        sendUserConfirm(t("App.handlePurgeSessions.confirm_message"), {
            title: t("App.handlePurgeSessions.confirm_title"),
            confirmText: t("App.handlePurgeSessions.confirm_button"),
            cancelText: t("App.handlePurgeSessions.cancel_button"),
            onConfirmed: () => {
                navigate(routes.index.prefix);
                dispatch(updateSessions(initialSessions));
                dispatch(updateAI({ ...ai, busy: false }));
                dispatch(updateMappings(initialMappings));
                dispatch(updateSessionExtensions(initialSessionExtensions));
                sendUserAlert(t("App.handlePurgeSessions.on_confirmed"));
            },
        });
    };

    const handleLogout = async () => {
        const logoutResponseJson = await handleRequest('POST', getFullPath('/api/auth/logout'));
        if (logoutResponseJson.message) {
            setHasLogined(false);
        }

        // sendUserConfirm(t("App.handleLogout.confirm_message"), {
        //     title: t("App.handleLogout.confirm_title"),
        //     confirmText: t("App.handleLogout.confirm_button"),
        //     cancelText: t("App.handleLogout.cancel_button"),
        //     onConfirmed: () => {
        //         sendUserAlert(t("App.handleLogout.on_confirmed"));
        //         setHasLogined(false);
        //         setLocalStorage("passcode", "", false);
        //     },
        // });
    };

    const handleModelChange = useCallback(
        (value: string, options?: { manual?: boolean }) => {
            setSelectedModel(value);
            if (options?.manual) {
                setPendingManualModel(value);
            }
        },
        [setPendingManualModel],
    );

    const handleReasoningChange = useCallback(
        (enabled: boolean) => {
            setSelectedReasoningEnabled(enabled);
            writePreferredReasoningEnabled(enabled);

            if (!id || typeof sessionExtensions[id]?.reasoningEnabled !== "boolean") {
                return;
            }

            dispatch(
                updateSessionExtensions({
                    ...sessionExtensions,
                    [id]: {
                        ...sessionExtensions[id],
                        reasoningEnabled: enabled,
                    },
                }),
            );
        },
        [dispatch, id, sessionExtensions],
    );

    const resolveModelId = useCallback(() => {
        const ensureModelAvailable = (modelId: string) =>
            modelId && models?.some((item) => item.id === modelId) ? modelId : "";
        return (
            ensureModelAvailable(selectedModel) ||
            ensureModelAvailable(defaultModel) ||
            ensureModelAvailable(serverDefaultModel) ||
            (models && models.length > 0 ? models[0].id : "")
        );
    }, [defaultModel, models, selectedModel, serverDefaultModel]);

    const resolvedModelId = useMemo(() => resolveModelId(), [resolveModelId]);
    const resolvedModelOption = useMemo(
        () => models?.find((item) => item.id === resolvedModelId),
        [models, resolvedModelId],
    );
    const showReasoningToggle = r_gid === "gptassistant" && !!models?.length;
    const reasoningAvailable = !!resolvedModelOption?.supportsReasoning;
    //const reasoningAvailable = false
    const effectiveReasoningEnabled = reasoningAvailable && selectedReasoningEnabled;
    const resolvedUploadCategories = resolvedModelOption?.uploadFileTypes;
    function encodeBase64(text: string) {
        try {
            // return btoa(text);
            // return Buffer.from(text, 'utf-8').toString('base64');
            return btoa(unescape(encodeURIComponent(text)));
        } catch (error) {
            console.error('Base64 编码失败：', error);
            throw error;
        }
    }
    const onAbortUpdate = (abort:any) => {
        // console.log("更新abort方法："+abort)
        setAbortFn(() => abort);
    }
    const handleAbort = () => {
        // console.log("调用abort方法：" + abortFn)
        abortFn?.()
        dispatch(updateAI({ ...ai, busy: false }));
    };
    const handleUpload = async (file: File) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const targetModelId = resolveModelId() || 'auto';
            formData.append('model_id', targetModelId);
            const uploadResponseJson = await handleRequest('POST', getFullPath('/api/upload'), formData);
            console.log('上传成功:', uploadResponseJson);
            return {
                fileId: uploadResponseJson.file_id as string,
                mimeType: file.type,
            };
        } catch (error) {
            console.error('上传错误:', error);
            return null;
        }
    };

    const handleAttachmentsChange = (
        items: Array<{ readonly fileId: string; readonly mimeType: string }>
    ) => {
        setUploadInlineData({
            data: items.map(({ fileId }) => fileId).join(",") + (items.length > 0 ? "," : ""),
            mimeType: items.length > 0 ? items[items.length - 1].mimeType : "",
        });
    };

    const handleSubmit = async (prompt: string) => {
        if (!prompt.trim().length) {
            sendUserAlert(t("App.handleSubmit.invalid_message"), true);
            return;
        }
        id = id || Date.now().toString();
        // const { prefix, uri, suffix } = routes.chat;
        // const { hash, pathname } = window.location;
        // let { id } = (matchPath(
        //     { path: `${prefix}${uri}${suffix}` },
        //     hash.replace("#", "") || pathname
        // )?.params as { id: string }) ?? { id: Date.now().toString() };
        const sessionDate = new Date(parseInt(id));
        if (isNaN(sessionDate.getTime()) || sessionDate.getFullYear() < 2020) {
            sendUserAlert(t("App.handleSubmit.invalid_session"), true);
            return;
        }
        const modelPlaceholder = t("App.handleSubmit.model_placeholder");
        const currentSessionHistory = id in sessions ? sessions[id] : [];
        let conversationId = id in sessions ? mappings[id] : "";
        const selectedModelId = resolveModelId();

        const requiresExplicitModel = !gid;

        if (!selectedModelId && requiresExplicitModel) {
            sendUserAlert(t("App.handleSubmit.invalid_session"), true);
            return;
        }

        if (pendingManualModel && pendingManualModel === selectedModelId) {
            writePreferredModel(selectedModelId);
            setPendingManualModel(null);
        }
        const currentTimestamp = Date.now();
        let _sessions = {
            ...sessions,
            [id]: [
                ...(sessions[id] || []),
                {
                    role: "user",
                    parts: prompt,
                    timestamp: currentTimestamp,
                    attachment: uploadInlineData,
                },
                {
                    role: "model",
                    parts: modelPlaceholder,
                    timestamp: currentTimestamp,
                },
            ],
        };
        dispatch(updateAI({ ...ai, busy: true }));
        dispatch(updateSessions(_sessions));
        const previousExtension = sessionExtensions[id];
        const nextSessionExtensions = {
            ...sessionExtensions,
            [id]: {
                conversationId:
                    (previousExtension && previousExtension.conversationId) ||
                    conversationId ||
                    "",
                gid:
                    gid ||
                    (previousExtension && previousExtension.gid) ||
                    "",
                selectedModel: selectedModelId,
                reasoningEnabled: selectedReasoningEnabled,
            },
        };
        dispatch(updateSessionExtensions(nextSessionExtensions));
        let currentSessionExtensionsState = nextSessionExtensions;
        if(gid){
            navigate(`/g/${gid}/chat/${id}`);
        } else {
            navigate(`/chat/${id}`);
        }
        const handler = (message: string, end: boolean, convId : string) => {
	        // console.log("onChatMessage, message=" + message + ", end=" +  end + ", convId=" + convId + ", id=" + id + ", gid=" + gid);
            if (convId !== "") {
                dispatch(updateMappings({ ...mappings, [id]: convId}));
                currentSessionExtensionsState = {
                    ...currentSessionExtensionsState,
                    [id]: {
                        ...currentSessionExtensionsState[id],
                        conversationId: convId,
                        selectedModel: selectedModelId,
                        reasoningEnabled: selectedReasoningEnabled,
                    },
                };
                dispatch(updateSessionExtensions(currentSessionExtensionsState));
            }
            if (end) {
                dispatch(updateAI({ ...ai, busy: false }));
            }
            // console.log("====onmessage handler")
            let prevParts = _sessions[id][_sessions[id].length - 1].parts;
            if (prevParts === modelPlaceholder) {
                prevParts = "";
            }
            _sessions = {
                ..._sessions,
                [id]: [
                    ..._sessions[id].slice(0, -1),
                    {
                        role: "model",
                        parts: `${prevParts}${message}`,
                        timestamp: Date.now(),
                    },
                ],
            };
            dispatch(updateSessions(_sessions));
            if (!end) {
                dispatch(updateAI({ ...ai, busy: true }));
            }
        };
        // console.log("ddddd:" + selectedModel)
        const {start, abort} = chatWithAI(
            currentSessionHistory,
            prompt,
            uploadInlineData,
            globalConfig.sse,
            conversationId,
            gid,
            handler,
            selectedModelId,
            effectiveReasoningEnabled,
        );
        onAbortUpdate(abort)
        try {
            await start();
        } catch (err: any) {
            // console.log("errrrrrr")
            if (err.name !== "AbortError"){
                console.error(err)
            }
        }
        setUploadInlineData({ data: "", mimeType: "" });
    };

    const currentPath = location.pathname;
    const gptsRoutes: Array<keyof typeof routes> = [
        "gpts",
        "my_gpts",
        "gpts_create",
    ];
    const isGptsPage = gptsRoutes.some((key) =>
        matchPath(
            {
                path: `${routes[key].prefix}${routes[key].uri}${routes[key].suffix}`,
            },
            currentPath
        )
    );
    const isTracePage = !!matchPath(
        {
            path: `${routes.trace.prefix}${routes.trace.uri}${routes.trace.suffix}`,
        },
        currentPath,
    );
    const isVoiceLabPage = !!matchPath(
        {
            path: `${routes.voice_lab.prefix}${routes.voice_lab.uri}${routes.voice_lab.suffix}`,
        },
        currentPath,
    );
    const isNewSessionPage =
        currentPath === routes.index.prefix ||
        (!!gid && !id && currentPath === `/g/${gid}`);
    const isDefaultNewSessionPage = isNewSessionPage && !gid;

    useEffect(() => {
        if (!hasLogined) {
            setGptsFeatureAllowed(false);
            setGptsPermissionLoaded(false);
            setVoiceLabAllowed(false);
            return;
        }
        setGptsPermissionLoaded(false);
        handleRequest('GET', getFullPath('/api/gpts/permission'))
            .then((responseJson) => {
                setGptsFeatureAllowed(Boolean(responseJson.allowed));
            })
            .catch(() => {
                setGptsFeatureAllowed(false);
            })
            .finally(() => {
                setGptsPermissionLoaded(true);
            });
        handleRequest('GET', getFullPath('/api/voice-lab/permission'))
            .then((responseJson) => {
                setVoiceLabAllowed(Boolean(responseJson.allowed));
            })
            .catch(() => {
                setVoiceLabAllowed(false);
            });
    }, [hasLogined]);

    useEffect(() => {
        if (
            hasLogined &&
            gptsPermissionLoaded &&
            !gptsFeatureAllowed &&
            (isGptsPage || (!!gid && gid !== "gptassistant"))
        ) {
            navigate(routes.index.prefix, { replace: true });
        }
    }, [
        gid,
        gptsFeatureAllowed,
        gptsPermissionLoaded,
        hasLogined,
        isGptsPage,
        navigate,
        routes.index.prefix,
    ]);

    useEffect(() => {
        if (window.matchMedia("(max-width: 900px)").matches) {
            setSidebarExpand(false);
        }
    }, [location.pathname]);

    useEffect(() => {
        // console.log("gid change")
        if (hasLogined) {
            if (gid && gid !== "gptassistant" && !gptsPermissionLoaded) {
                return;
            }
            if (gid && gid !== "gptassistant" && !gptsFeatureAllowed) {
                return;
            }
            fetch(getFullPath('/api/gpts/detail/' + r_gid), {
                method: 'GET',
                credentials: 'include' // 确保带上 HttpOnly Cookie
            }).then(response => {
                if (response.ok) {
                    response.json().then(data => {
                        setFileUploadEnabled(data.file_upload_enabled)
                        setServerDefaultModel(
                            typeof data.default_model === "string"
                                ? data.default_model
                                : "",
                        )
                        setServerDefaultReasoning(
                            typeof data.default_reasoning === "boolean"
                                ? data.default_reasoning
                                : true,
                        )
                        const defaultUploadTypes: UploadCategory[] | undefined = Array.isArray(data.upload_file_types)
                            ? data.upload_file_types.filter((type: unknown): type is UploadCategory =>
                                type === "document" || type === "image",
                            )
                            : undefined
                        const normalizedModels: ModelOption[] | undefined = Array.isArray(data.models)
                            ? data.models.reduce(
                                (acc: ModelOption[], item: any) => {
                                    if (item && typeof item.id === "string" && typeof item.name === "string") {
                                        const uploadTypes: UploadCategory[] | undefined = Array.isArray(item.upload_file_types)
                                            ? item.upload_file_types.filter((type: unknown): type is UploadCategory =>
                                                type === "document" || type === "image",
                                            )
                                            : defaultUploadTypes
                                        acc.push({
                                            id: item.id,
                                            name: item.name,
                                            description: typeof item.description === "string" ? item.description : "",
                                            uploadFileTypes: uploadTypes,
                                            supportsReasoning: typeof item.supports_reasoning === "boolean"
                                                ? item.supports_reasoning
                                                : undefined,
                                        })
                                    }
                                    return acc
                                },
                                [],
                            )
                            : undefined
                        setModels(normalizedModels)
                        setPageSubTitle(data.desc)
                        setPageSamples(data.samples ?? [])
                        setPageLogo(data.logo)
                        setPageTitle(data.title)
                        setPageName(data.name)
                        // console.log("fileUploadEnabled:" + fileUploadEnabled)
                    })
                } else {
                    console.log("====")
                    window.location.href = '/';
                }
            });
        }
    }, [gptsFeatureAllowed, gptsPermissionLoaded, hasLogined, gid]);

    useEffect(() => {
        if (!models || models.length === 0) {
            if (defaultModel) {
                setDefaultModel("");
            }
            return;
        }

        const availableModelIds = new Set(models.map((item) => item.id));
        const ensureModelAvailable = (modelId: string) =>
            modelId && availableModelIds.has(modelId) ? modelId : "";

        const sessionId = id;
        let targetModel = "";

        if (sessionId && sessionExtensions[sessionId]?.selectedModel) {
            targetModel = ensureModelAvailable(
                sessionExtensions[sessionId].selectedModel,
            );
        }

        if (!targetModel) {
            targetModel = ensureModelAvailable(readPreferredModel());
        }

        if (!targetModel) {
            targetModel = ensureModelAvailable(serverDefaultModel);
        }

        if (!targetModel && models.length > 0) {
            targetModel = models[0].id;
        }

        if (targetModel !== defaultModel) {
            setDefaultModel(targetModel);
        }
    }, [defaultModel, id, models, serverDefaultModel, sessionExtensions]);

    useEffect(() => {
        const sessionId = id;

        if (
            sessionId &&
            typeof sessionExtensions[sessionId]?.reasoningEnabled === "boolean"
        ) {
            setSelectedReasoningEnabled(
                !!sessionExtensions[sessionId].reasoningEnabled,
            );
            return;
        }

        const preferredReasoningEnabled = readPreferredReasoningEnabled();
        if (typeof preferredReasoningEnabled === "boolean") {
            setSelectedReasoningEnabled(preferredReasoningEnabled);
            return;
        }

        setSelectedReasoningEnabled(serverDefaultReasoning);
    }, [id, serverDefaultReasoning, sessionExtensions]);

    useEffect(() => {
        // console.log("====="+hasLogined)
        document.querySelector(".loading")?.remove();
        if (!hasLogined && !!passcodes.length) {
            document.title = site;
        }
        setCurrentLocaleToState();
    }, [t, hasLogined, passcodes, site]);

    useEffect(() => {
        if (hasLogined) {
            document.title = site;
            // window.location.href = '/';
            // if (!gid) {
            //     handleRequest('GET', getFullPath('/api/gpts')).then(response_json => {
            //         response_json.map((gpt_desc:{gid:string, name:string, index:number},_index:number)=>{
            //             // console.log("====" + gpt_desc.name + ":::" + gpt_desc.index)
            //             if (gpt_desc.index === 0 && gpt_desc.gid !== "gptassistant") {
            //                 // window.location.href = "#/g/" + gpt_desc.gid;
            //                 window.location.href =  location.pathname + "/#/g/" + gpt_desc.gid;  
            //             }
            //         })
            //     });
            // }
        }
    }, [hasLogined]);

    // console.log("=====22222"+hasLogined)
    return (
        hasLogined && (isTracePage || isVoiceLabPage) ? (
            <div className={`min-h-screen w-full ${isTracePage ? "bg-slate-950 text-slate-100" : "bg-white text-[#2f3a46]"}`}>
                <RouterView
                    routes={routes}
                    suspense={<Skeleton />}
                    routerProps={{
                        refs: { mainSectionRef, textAreaRef },
                        onAbortUpdate: onAbortUpdate,
                        gid: gid,
                        title: pageTitle,
                        logo: pageLogo,
                        subTitle: pageSubTitle,
                        samples: pageSamples,
                        userName: userName,
                    }}
                />
            </div>
        ) : (
            <Container
                className={
                    !hasLogined
                        ? "flex flex-col items-center justify-center min-h-screen p-10"
                        : "h-screen w-full"
                }
                toaster={true}
            >
                {hasLogined ? (
                    <div
                        className={`grid h-screen min-w-full overflow-hidden bg-white/95 transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                            sidebarExpand
                                ? "grid-cols-[272px_minmax(0,1fr)] max-[1120px]:grid-cols-[248px_minmax(0,1fr)] max-[900px]:grid-cols-[1fr]"
                                : "grid-cols-[0_minmax(0,1fr)]"
                        } max-[900px]:grid-cols-[1fr]`}
                    >
                        <Sidebar
                            title={header}
                            userName={userName}
                            locales={locales}
                            sessions={sessions}
                            expand={sidebarExpand}
                            gptsFeatureAllowed={gptsFeatureAllowed}
                            voiceLabAllowed={voiceLabAllowed}
                            currentLocale={currentLocale}
                            onSwitchLocale={handleSwitchLocale}
                            onDeleteSession={handleDeleteSession}
                            onRenameSession={handleRenameSession}
                            onToggleSidebar={() =>
                                setSidebarExpand((state) => !state)
                            }
                        />
                        <Container
                            className="col-start-2 flex h-screen min-w-0 flex-col bg-white/95 max-[900px]:col-start-1"
                        >
                            {!isGptsPage && (
                                <Header
                                    sidebarExpand={sidebarExpand}
                                    title={pageName}
                                    models={models}
                                    defaultModel={defaultModel}
                                    onToggleSidebar={() =>
                                        setSidebarExpand((state) => !state)
                                    }
                                    onModelChange={handleModelChange}
                                />
                            )}
                            <div
                                className={
                                    isNewSessionPage && !isGptsPage
                                        ? `flex min-h-0 flex-1 flex-col justify-center gap-3 pb-2 md:gap-4 md:pb-0 ${
                                            isDefaultNewSessionPage
                                                ? "relative -top-10 md:-top-12"
                                                : ""
                                        }`
                                        : "contents"
                                }
                            >
                                <div
                                    ref={mainSectionRef}
                                    className={`relative min-h-0 overflow-y-auto overflow-x-hidden ${
                                        isGptsPage
                                            ? "h-screen flex-1"
                                            : isNewSessionPage
                                                ? "flex-none overflow-visible"
                                                : "flex-1"
                                    }`}
                                >
                                    <RouterView
                                        routes={routes}
                                        suspense={<Skeleton />}
                                        routerProps={{
                                            refs: { mainSectionRef, textAreaRef },
                                            onAbortUpdate: onAbortUpdate,
                                            gid: gid,
                                            title: pageTitle,
                                            logo: pageLogo,
                                            subTitle: pageSubTitle,
                                            samples: pageSamples,
                                            userName: userName,
                                        }}
                                    />
                                </div>
                                {!isGptsPage && (
                                    <InputArea
                                        minHeight={45}
                                        ref={textAreaRef}
                                        busy={ai.busy}
                                        fileUploadEnabled={fileUploadEnabled}
                                        showReasoningToggle={showReasoningToggle}
                                        reasoningEnabled={effectiveReasoningEnabled}
                                        reasoningAvailable={reasoningAvailable}
                                        isNewSessionPage={isNewSessionPage}
                                        allowedFileTypes={resolvedUploadCategories}
                                        key={location.pathname}
                                        onSubmit={handleSubmit}
                                        onUpload={handleUpload}
                                        onAttachmentsChange={handleAttachmentsChange}
                                        onAbort={handleAbort}
                                        onReasoningChange={handleReasoningChange}
                                    />
                                )}
                            </div>
                        </Container>
                        <button
                            type="button"
                            aria-label="关闭历史会话"
                            className={`fixed inset-0 z-20 hidden bg-[rgba(18,24,32,0.16)] transition-opacity duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-[900px]:block ${
                                sidebarExpand
                                    ? "opacity-100"
                                    : "pointer-events-none opacity-0"
                            }`}
                            onClick={() => setSidebarExpand(false)}
                        />
                    </div>
                ) : (
                    <LoginByOAuth
                        title={header}
                        logo={siteLogo}
                        isNoAuthorized={isNoAuthorized}
                        onLogined={(uname) => {setHasLogined(true);setUserName(uname)}}
                    />
                )}
            </Container>
        )
    );
};

export default App;
