import { useEffect, useRef, useState } from "react";
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
import { getBase64Img } from "./helpers/getBase64Img";
import { handleRequest } from "./helpers/handleRequest";
import { sendUserAlert } from "./helpers/sendUserAlert";
import { sendUserConfirm } from "./helpers/sendUserConfirm";
import { PageScroller } from "./components/PageScroller";
import { LoginForm } from "./components/LoginForm";
import { LoginByOAuth } from "./components/LoginByOAuth";
import siteLogo from "./assets/logo.svg";
import setLocalStorage from "./helpers/setLocalStorage";
import i18n, { i18nConfig } from "./config/i18n";
import { setUserLocale } from "./helpers/setUserLocale";
import { useTranslation } from "react-i18next";
import { getCurrentLocale } from "./helpers/getCurrentLocale";
import { getFullPath } from "./helpers/getDomainAndPath";


const App = () => {
    const { t } = useTranslation();
    const { sse, title, passcodes } = globalConfig;
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
    const [sidebarExpand, setSidebarExpand] = useState(window.innerWidth > 768);

    const setCurrentLocaleToState = async () =>
        setCurrentLocale(await getCurrentLocale(i18n));

    const handleSwitchLocale = (locale: string) => setUserLocale(i18n, locale);


    const [fileUploadEnabled, setFileUploadEnabled] = useState(false);
    const [models, setModels] = useState();
    const [defaultModel, setDefaultModel] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    
    const [pageTitle, setPageTitle] = useState("");
    const [pageLogo, setPageLogo] = useState("");
    const [pageName, setPageName] = useState("");
    const [pageSubTitle, setPageSubTitle] = useState("");
    const [pageSamples, setPageSamples] = useState<string[]>([]);
    const [isNoAuthorized, setIsNoAuthorized] = useState(false);
    
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


    const handleExportSession = (id: string) => {
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
            session.forEach(({ role, parts, timestamp, attachment }) => {
                if (!!attachment?.data.length) {
                    const { data, mimeType } = attachment;
                    const base64ImgData = `data:${mimeType};base64,${data}`;
                    parts += `\n\n<img alt="" src="${base64ImgData}" />`;
                }
                const timeString = new Date(timestamp).toLocaleString();
                exportData += `## ${
                    role === "user"
                        ? t("App.handleExportSession.role_user")
                        : t("App.handleExportSession.role_model")
                }@${timeString}\n\n${parts}\n\n`;
            });
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

    const handleModelChange = async (value: string) => {
        // console.log('setSelectedModel' + value)
        setSelectedModel(value);
    };
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
    const handleUpload = async (file: File | null) => {
        if (file) {
            try {
                const formData = new FormData();
                formData.append('file', file);
                const uploadResponseJson = await handleRequest('POST', getFullPath('/api/upload'), formData);
                // 处理响应数据
                console.log('上传成功:', uploadResponseJson);
                const fileId = uploadResponseJson.file_id;
                // const originalFilename = uploadResponseJson.original_filename;
                // const extractResponseJson = await handleRequest('GET', getFullPath('/api/extract_text_from_file/' + fileId));
                // 处理响应数据
                // console.log('提取成功:', extractResponseJson);
                // const extractedText = extractResponseJson.text;
                // setUploadInlineData({ data: encodeBase64(extractedText), mimeType: file.type });
                setUploadInlineData(prev => ({ data: prev.data + fileId + ",", mimeType: file.type }));
                // console.log("===" + uploadInlineData.data + fileId + ",")
            } catch (error) {
                console.error('上传错误:', error);
                // setUploadInlineData({ data: "", mimeType: "" });
            }
        } else {
            // 清空的时候走的这个逻辑
            setUploadInlineData({ data: "", mimeType: "" });
        }
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
        if(gid){
            navigate(`/g/${gid}/chat/${id}`);
        } else {
            navigate(`/chat/${id}`);
        }
        const handler = (message: string, end: boolean, convId : string) => {
	        // console.log("onChatMessage, message=" + message + ", end=" +  end + ", convId=" + convId + ", id=" + id + ", gid=" + gid);
            if (convId !== "") {
                dispatch(updateMappings({ ...mappings, [id]: convId}));
                dispatch(updateSessionExtensions({ ...sessionExtensions, [id]: {
                    conversationId: convId,
                    gid: gid,
                    selectedModel: selectedModel,
                }}));
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
            selectedModel,
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

    useEffect(() => {
        // console.log("gid change")
        if (hasLogined) {
            fetch(getFullPath('/api/gpts/detail/' + r_gid), {
                method: 'GET',
                credentials: 'include' // 确保带上 HttpOnly Cookie
            }).then(response => {
                if (response.ok) {
                    response.json().then(data => {
                        setFileUploadEnabled(data.file_upload_enabled)
                        setDefaultModel(data.default_model)
                        setModels(data.models)
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
    }, [hasLogined, gid]);

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
            location.hash.replace("#", "") || location.pathname
        )
    );
    return (
        <Container
            className={
                !hasLogined ? "flex flex-col items-center justify-center min-h-screen p-10"
                    : ""
            }
            toaster={true}
        >
            {hasLogined ? (
                <>
                    <Sidebar
                        title={header}
                        locales={locales}
                        sessions={sessions}
                        expand={sidebarExpand}
                        currentLocale={currentLocale}
                        onSwitchLocale={handleSwitchLocale}
                        onExportSession={handleExportSession}
                        onDeleteSession={handleDeleteSession}
                        onRenameSession={handleRenameSession}
                    />
                    <Container
                        ref={mainSectionRef}
                        className={`min-w-full overflow-y-auto overflow-x-hidden flex flex-col h-screen ${isGptsPage ? "" : "justify-between "}
                        ${
                            !sidebarExpand ? "col-span-2" : ""
                        }`}
                    >
                        {!isGptsPage && (
                            <Header
                                userName={userName}
                                logoutIcon={!!passcodes.length}
                                newChatUrl={routes.index.prefix}
                                sidebarExpand={sidebarExpand}
                                title={pageName}
                                models={models}
                                defaultModel={defaultModel}
                                onPurgeSessions={handlePurgeSessions}
                                onToggleSidebar={() =>
                                    setSidebarExpand((state) => !state)
                                }
                                onLogout={handleLogout}
                                onModelChange={handleModelChange}
                            />
                        )}
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
                            }}
                        />
                        {!isGptsPage && (
                            <>
                                <InputArea
                                    minHeight={45}
                                    ref={textAreaRef}
                                    busy={ai.busy}
                                    fileUploadEnabled={fileUploadEnabled}
                                    key={location.pathname}
                                    onSubmit={handleSubmit}
                                    onUpload={handleUpload}
                                    onAbort={handleAbort}
                                />
                                {!ai.busy && (
                                    <PageScroller
                                        thresholds={{
                                            top: 200,
                                            bottom: 200,
                                            debounce: 50,
                                        }}
                                        monitorRef={mainSectionRef}
                                    />
                                )}
                            </>
                        )}
                        
                    </Container>
                </>
            ) : (
                <LoginByOAuth
                    title={header}
                    logo={siteLogo}
                    isNoAuthorized={isNoAuthorized}
                    onLogined={(uname) => {setHasLogined(true);setUserName(uname)}}
                />
            )}
        </Container>
    );
};

export default App;
