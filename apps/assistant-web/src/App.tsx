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
import {
    initRuntimeTelemetry,
    reportRuntimeEvent,
    updateRuntimeTelemetryContext,
} from "./helpers/runtimeTelemetry";
import { ModelOption, UploadCategory } from "./types/models";
import { resolveAttachmentViewItems } from "./helpers/getAttachmentViewItems";
import { buildAttachmentPostscriptHtml } from "./helpers/buildAttachmentPostscriptHtml";
import { SessionSummary } from "./types/sessionHistory";
import localForage from "localforage";

const PREFERRED_MODEL_COOKIE_KEY = "preferred_model";
const PREFERRED_REASONING_COOKIE_KEY = "preferred_reasoning_enabled";
const COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const LEGACY_PERSISTED_SESSIONS_KEY = "persist:sessions";
const LEGACY_PERSISTED_MAPPINGS_KEY = "persist:mappings";
const LEGACY_PERSISTED_SESSION_EXTENSIONS_KEY = "persist:sessionExtensions";
const LEGACY_SESSION_MIGRATION_STATE_KEY = "chatgemini:legacy-session-migration-state";
const LEGACY_SESSION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const LEGACY_SESSION_IMPORT_BATCH_SIZE = 10;
const LEGACY_SESSION_IMPORT_BATCH_DELAY_MS = 80;
const STREAM_SESSION_DISPATCH_INTERVAL_MS = 80;

interface LegacySessionMessage {
    readonly role: string;
    readonly parts: string;
    readonly timestamp: number;
    readonly title?: string;
    readonly attachment?: GenerativeContentBlob;
}

interface LegacySessionRecord {
    readonly conversationId: string;
    readonly gid: string;
    readonly history: LegacySessionMessage[];
    readonly summary: SessionSummary;
}

interface LegacySessionMigrationState {
    readonly importedAt: number;
    readonly expiresAt: number;
    readonly completedAt?: number;
    readonly status?: "pending" | "completed";
}

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

const parsePersistedReduxSlice = <T,>(rawValue: unknown, field: string): T | null => {
    if (!rawValue) {
        return null;
    }
    let payload: any = rawValue;
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        } catch (_error) {
            return null;
        }
    }
    const fieldValue = payload?.[field];
    if (fieldValue == null) {
        return null;
    }
    if (typeof fieldValue === "string") {
        try {
            return JSON.parse(fieldValue) as T;
        } catch (_error) {
            return null;
        }
    }
    return fieldValue as T;
};

const toIsoFromTimestamp = (timestamp: number) =>
    timestamp > 0 ? new Date(timestamp).toISOString() : new Date().toISOString();

const deriveLegacySessionTitle = (history: LegacySessionMessage[], fallbackId: string) => {
    for (const item of history) {
        if (typeof item.title === "string" && item.title.trim().length) {
            return item.title.trim();
        }
    }
    for (const item of history) {
        if (typeof item.parts === "string" && item.parts.trim().length) {
            const normalized = item.parts.trim().replace(/\s+/g, " ");
            return normalized.length <= 48
                ? normalized
                : `${normalized.slice(0, 48).trimEnd()}...`;
        }
    }
    return fallbackId;
};

const mergeSessionSummaries = (
    serverSummaries: SessionSummary[],
    legacyRecords: Record<string, LegacySessionRecord>,
) => {
    const merged = new Map<string, SessionSummary>();
    serverSummaries.forEach((item) => {
        merged.set(item.conversation_id, { ...item, source: "server" });
    });
    Object.values(legacyRecords).forEach((item) => {
        if (!merged.has(item.conversationId)) {
            merged.set(item.conversationId, item.summary);
        }
    });
    return [...merged.values()].sort((left, right) =>
        String(right.updated_at || "").localeCompare(String(left.updated_at || "")),
    );
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
    const pinnedGpts = useSelector(
        (state: ReduxStoreProps) => state.gpts.pinned
    );
    const mainSectionRef = useRef<HTMLDivElement>(null);
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const previousBusyRef = useRef<boolean | null>(null);

    const [abortFn, setAbortFn] = useState<() => void>(() => () => {});
    const [currentLocale, setCurrentLocale] = useState(fallback);
    const [hasLogined, setHasLogined] = useState(false);
    const [userName, setUserName] = useState("");
    const [theme, setTheme] = useState<"light" | "dark" | "system">("light");

    useEffect(() => {
        const root = window.document.documentElement;
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

        const applyTheme = () => {
            const isDark = theme === "dark" || (theme === "system" && mediaQuery.matches);
            if (isDark) {
                root.classList.add("dark");
            } else {
                root.classList.remove("dark");
            }
        };

        applyTheme();
        localStorage.setItem("theme", theme);

        if (theme === "system") {
            mediaQuery.addEventListener("change", applyTheme);
            return () => mediaQuery.removeEventListener("change", applyTheme);
        }
    }, [theme]);
    const [uploadInlineData, setUploadInlineData] =
        useState<GenerativeContentBlob>({ data: "", mimeType: "" });
    const [sidebarExpand, setSidebarExpand] = useState(window.innerWidth > 900);
    const [serverSessionSummaries, setServerSessionSummaries] = useState<SessionSummary[]>([]);
    const [legacySessionRecords, setLegacySessionRecords] = useState<
        Record<string, LegacySessionRecord>
    >({});
    const legacySessionRecordsRef = useRef<Record<string, LegacySessionRecord>>({});
    const legacySessionGraceExpiresAtRef = useRef<number | null>(null);
    const legacySessionImportPendingRef = useRef(false);
    const legacySessionImportStartedRef = useRef(false);
    const coverageReportedRef = useRef(false);
    const loadingSessionDetailsRef = useRef<Set<string>>(new Set());
    const loadedSessionDetailsRef = useRef<Record<string, string>>({});

    const setCurrentLocaleToState = async () =>
        setCurrentLocale(await getCurrentLocale(i18n));

    const handleSwitchLocale = (locale: string) =>
        setUserLocale(i18n, locale).then(() => setCurrentLocale(locale));


    const [fileUploadEnabled, setFileUploadEnabled] = useState(false);
    const [models, setModels] = useState<ModelOption[] | undefined>(undefined);
    const [serverDefaultModel, setServerDefaultModel] = useState("");
    const [defaultModel, setDefaultModel] = useState("");
    const [selectedModel, setSelectedModel] = useState("");
    const [serverDefaultReasoning, setServerDefaultReasoning] = useState<boolean | null>(null);
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
    const [gptsManageAllowed, setGptsManageAllowed] = useState(false);
    const [gptsPermissionLoaded, setGptsPermissionLoaded] = useState(false);
    const [voiceLabAllowed, setVoiceLabAllowed] = useState(false);
    const [adminAllowed, setAdminAllowed] = useState(false);
    const [adminPermissionLoaded, setAdminPermissionLoaded] = useState(false);
    const [libraryAllowed, setLibraryAllowed] = useState(false);
    const [libraryPermissionLoaded, setLibraryPermissionLoaded] = useState(false);
    
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
    const isRequiredPinnedGpt = pinnedGpts.some(
        (item) => item.gid === gid && item.is_required_pinned,
    );
    const isPinnedGpt = pinnedGpts.some((item) => item.gid === gid);
    const canOpenCurrentGpt =
        !gid ||
        gid === "gptassistant" ||
        gptsFeatureAllowed ||
        isRequiredPinnedGpt ||
        isPinnedGpt;
    const activeSessionHistory = id && id in sessions ? sessions[id] : [];
    const activeConversationId =
        (id && sessionExtensions[id]?.conversationId) ||
        (id && mappings[id]) ||
        "";
    const activeMessageCount = activeSessionHistory.length;
    const activeLastResponseLength = [...activeSessionHistory]
        .reverse()
        .find((item) => item?.role === "model")
        ?.parts?.length ?? 0;
    const activeAttachmentCount = activeSessionHistory.reduce((count, item) => {
        const rawIds = item?.attachment?.data;
        if (typeof rawIds !== "string" || !rawIds.trim().length) {
            return count;
        }
        return (
            count +
            rawIds
                .split(",")
                .map((value) => value.trim())
                .filter(Boolean).length
        );
    }, 0);
    const sessionSummaries = useMemo(
        () => mergeSessionSummaries(serverSessionSummaries, legacySessionRecords),
        [legacySessionRecords, serverSessionSummaries],
    );


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
                    const attachmentItems = await resolveAttachmentViewItems(data, mimeType);
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

    const handleRenameSession = async (id: string, newTitle: string) => {
        if (ai.busy) {
            sendUserAlert(t("App.handleRenameSession.not_available"), true);
            return;
        }
        const conversationId = sessionExtensions[id]?.conversationId || mappings[id] || id;
        try {
            const response = await handleRequest(
                "PATCH",
                getFullPath(`/api/sessions/${encodeURIComponent(conversationId)}/title`),
                JSON.stringify({ title: newTitle }),
                { "Content-Type": "application/json" },
            );
            if (sessions[id]?.length) {
                dispatch(
                    updateSessions({
                        ...sessions,
                        [id]: [
                            { ...sessions[id][0], title: newTitle },
                            ...sessions[id].slice(1),
                        ],
                    }),
                );
            }
            if (response.item) {
                setServerSessionSummaries((state) =>
                    state.map((item) =>
                        item.conversation_id === conversationId
                            ? { ...item, title: response.item.title || newTitle }
                            : item,
                    ),
                );
            } else {
                await loadSessionSummaries();
            }
        } catch (_error) {
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
                    const conversationId =
                        sessionExtensions[id]?.conversationId || mappings[id] || id;
                    handleRequest(
                        "DELETE",
                        getFullPath(`/api/sessions/${encodeURIComponent(conversationId)}`),
                    )
                        .then(() => {
                            navigate(routes.index.prefix);
                            const _sessions = { ...sessions };
                            delete _sessions[id];
                            dispatch(updateSessions(_sessions));
                            const _mappings = { ...mappings };
                            delete _mappings[id];
                            dispatch(updateMappings(_mappings));
                            const _sessionExtensions = { ...sessionExtensions };
                            delete _sessionExtensions[id];
                            dispatch(updateSessionExtensions(_sessionExtensions));
                            setServerSessionSummaries((state) =>
                                state.filter((item) => item.conversation_id !== conversationId),
                            );
                            sendUserAlert(t("App.handleDeleteSession.on_confirmed"));
                        })
                        .catch(() => {
                            sendUserAlert(t("App.handleDeleteSession.not_available"), true);
                        });
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
            formData.append('gid', gid || 'gptassistant');
            formData.append('purpose', 'session_attachment');
            if (id) {
                formData.append('conversation_id', id);
            }
            const uploadResponseJson = await handleRequest('POST', getFullPath('/api/upload'), formData);
            console.log('上传成功:', uploadResponseJson);
            return {
                fileId: uploadResponseJson.file_id as string,
                mimeType: file.type,
            };
        } catch (error) {
            console.error('上传错误:', error);
            const requestError = error as Error & { status?: number };
            if (requestError.status === 413) {
                sendUserAlert(
                    t("components.InputArea.checkAttachment.upload_too_large"),
                    true,
                    2200,
                );
            } else {
                sendUserAlert(
                    t("components.InputArea.checkAttachment.upload_failed"),
                    true,
                    2200,
                );
            }
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

    const loadSessionSummaries = useCallback(async () => {
        const response = await handleRequest("GET", getFullPath("/api/sessions?limit=100"));
        const items = Array.isArray(response.items) ? response.items : [];
        setServerSessionSummaries(items);
        return items;
    }, []);

    const importLegacySessionsInBackground = useCallback(
        (
            items: Array<{
                readonly session_id: string;
                readonly conversation_id: string;
                readonly gid: string;
                readonly history: LegacySessionMessage[];
            }>,
            importedAt: number,
            expiresAt: number,
        ) => {
            if (legacySessionImportStartedRef.current) {
                return;
            }
            legacySessionImportStartedRef.current = true;
            const waitForNextBatch = () =>
                new Promise((resolve) =>
                    window.setTimeout(resolve, LEGACY_SESSION_IMPORT_BATCH_DELAY_MS),
                );

            void (async () => {
                legacySessionImportPendingRef.current = true;
                await localForage.setItem(LEGACY_SESSION_MIGRATION_STATE_KEY, {
                    importedAt,
                    expiresAt,
                    status: "pending",
                } satisfies LegacySessionMigrationState);

                for (let index = 0; index < items.length; index += LEGACY_SESSION_IMPORT_BATCH_SIZE) {
                    const batch = items.slice(index, index + LEGACY_SESSION_IMPORT_BATCH_SIZE);
                    await handleRequest(
                        "POST",
                        getFullPath("/api/sessions/import-local"),
                        JSON.stringify({ items: batch }),
                        { "Content-Type": "application/json" },
                    );
                    await waitForNextBatch();
                }

                await localForage.setItem(LEGACY_SESSION_MIGRATION_STATE_KEY, {
                    importedAt,
                    expiresAt,
                    completedAt: Date.now(),
                    status: "completed",
                } satisfies LegacySessionMigrationState);
                legacySessionImportPendingRef.current = false;
            })().catch((error) => {
                legacySessionImportPendingRef.current = false;
                legacySessionImportStartedRef.current = false;
                console.warn("Legacy session import failed; will retry on next login.", error);
            });
        },
        [],
    );

    const migrateLegacyPersistedSessions = useCallback(async () => {
        const [rawSessions, rawMappings, rawSessionExtensions] = await Promise.all([
            localForage.getItem(LEGACY_PERSISTED_SESSIONS_KEY),
            localForage.getItem(LEGACY_PERSISTED_MAPPINGS_KEY),
            localForage.getItem(LEGACY_PERSISTED_SESSION_EXTENSIONS_KEY),
        ]);
        const persistedSessions = parsePersistedReduxSlice<Record<string, Array<any>>>(
            rawSessions,
            "sessions",
        );
        if (!persistedSessions || !Object.keys(persistedSessions).length) {
            setLegacySessionRecords({});
            legacySessionRecordsRef.current = {};
            legacySessionGraceExpiresAtRef.current = null;
            legacySessionImportPendingRef.current = false;
            legacySessionImportStartedRef.current = false;
            return false;
        }
        const persistedMappings =
            parsePersistedReduxSlice<Record<string, string>>(rawMappings, "mappings") || {};
        const persistedSessionExtensions =
            parsePersistedReduxSlice<
                Record<
                    string,
                    {
                        readonly conversationId?: string;
                        readonly gid?: string;
                    }
                >
            >(rawSessionExtensions, "sessionExtensions") || {};

        const items = Object.entries(persistedSessions)
            .map(([sessionId, history]) => {
                const sessionExtension = persistedSessionExtensions[sessionId];
                const conversationId =
                    sessionExtension?.conversationId ||
                    persistedMappings[sessionId] ||
                    sessionId;
                const gid = sessionExtension?.gid || "gptassistant";
                const normalizedHistory = Array.isArray(history)
                    ? history
                          .filter(Boolean)
                          .map((entry) => ({
                              role: entry.role,
                              parts:
                                  typeof entry.parts === "string"
                                      ? entry.parts
                                      : entry.parts == null
                                        ? ""
                                        : String(entry.parts),
                              timestamp:
                                  typeof entry.timestamp === "number" ? entry.timestamp : 0,
                              title:
                                  typeof entry.title === "string" ? entry.title : undefined,
                              attachment:
                                  entry.attachment &&
                                  typeof entry.attachment === "object" &&
                                  (typeof entry.attachment.data === "string" ||
                                      typeof entry.attachment.mimeType === "string")
                                      ? {
                                            data:
                                                typeof entry.attachment.data === "string"
                                                    ? entry.attachment.data
                                                    : "",
                                            mimeType:
                                                typeof entry.attachment.mimeType === "string"
                                                    ? entry.attachment.mimeType
                                                    : "",
                                        }
                                      : undefined,
                          }))
                    : [];
                return {
                    session_id: sessionId,
                    conversation_id: conversationId,
                    gid,
                    history: normalizedHistory,
                };
            })
            .filter((item) => item.history.length > 0);

        if (!items.length) {
            await Promise.all([
                localForage.removeItem(LEGACY_PERSISTED_SESSIONS_KEY),
                localForage.removeItem(LEGACY_PERSISTED_MAPPINGS_KEY),
                localForage.removeItem(LEGACY_PERSISTED_SESSION_EXTENSIONS_KEY),
                localForage.removeItem(LEGACY_SESSION_MIGRATION_STATE_KEY),
            ]);
            setLegacySessionRecords({});
            legacySessionRecordsRef.current = {};
            legacySessionGraceExpiresAtRef.current = null;
            legacySessionImportPendingRef.current = false;
            legacySessionImportStartedRef.current = false;
            return false;
        }

        const migrationState = (await localForage.getItem(
            LEGACY_SESSION_MIGRATION_STATE_KEY,
        )) as LegacySessionMigrationState | null;
        const now = Date.now();
        if (migrationState?.expiresAt && migrationState.expiresAt <= now) {
            await Promise.all([
                localForage.removeItem(LEGACY_PERSISTED_SESSIONS_KEY),
                localForage.removeItem(LEGACY_PERSISTED_MAPPINGS_KEY),
                localForage.removeItem(LEGACY_PERSISTED_SESSION_EXTENSIONS_KEY),
                localForage.removeItem(LEGACY_SESSION_MIGRATION_STATE_KEY),
            ]);
            setLegacySessionRecords({});
            legacySessionRecordsRef.current = {};
            legacySessionGraceExpiresAtRef.current = null;
            legacySessionImportPendingRef.current = false;
            legacySessionImportStartedRef.current = false;
            return false;
        }

        const nextLegacyRecords = items.reduce<Record<string, LegacySessionRecord>>((acc, item) => {
            const latestTimestamp = item.history.reduce(
                (max, entry) => Math.max(max, Number(entry.timestamp || 0)),
                0,
            );
            acc[item.conversation_id] = {
                conversationId: item.conversation_id,
                gid: item.gid,
                history: item.history,
                summary: {
                    conversation_id: item.conversation_id,
                    user_id: "",
                    user_email: "",
                    gid: item.gid,
                    title: deriveLegacySessionTitle(item.history, item.conversation_id),
                    created_at: toIsoFromTimestamp(latestTimestamp),
                    updated_at: toIsoFromTimestamp(latestTimestamp),
                    source: "local_fallback",
                },
            };
            return acc;
        }, {});
        setLegacySessionRecords(nextLegacyRecords);
        legacySessionRecordsRef.current = nextLegacyRecords;

        const migrationCompleted =
            migrationState?.status === "completed" ||
            Boolean(migrationState?.completedAt) ||
            (Boolean(migrationState?.expiresAt) && !migrationState?.status);
        if (migrationState?.expiresAt && migrationState.expiresAt > now && migrationCompleted) {
            legacySessionGraceExpiresAtRef.current = migrationState.expiresAt;
            legacySessionImportPendingRef.current = false;
            return true;
        }

        const importedAt = migrationState?.importedAt || now;
        const expiresAt = migrationState?.expiresAt || importedAt + LEGACY_SESSION_GRACE_MS;
        legacySessionGraceExpiresAtRef.current = expiresAt;
        importLegacySessionsInBackground(items, importedAt, expiresAt);
        return true;
    }, [importLegacySessionsInBackground]);

    const reportSessionCoverage = useCallback(
        async (serverItems: SessionSummary[]) => {
            if (coverageReportedRef.current) {
                return;
            }
            const legacyRecords = legacySessionRecordsRef.current;
            const serverIds = new Set(serverItems.map((item) => item.conversation_id));
            const localOnlyItems = Object.values(legacyRecords)
                .filter((item) => !serverIds.has(item.conversationId))
                .map((item) => ({
                    conversation_id: item.conversationId,
                    gid: item.gid,
                    source: "local_fallback",
                    reason: "missing_server_summary",
                }));
            await handleRequest(
                "POST",
                getFullPath("/api/sessions/coverage-report"),
                JSON.stringify({
                    phase: "startup",
                    grace_expires_at: legacySessionGraceExpiresAtRef.current
                        ? new Date(legacySessionGraceExpiresAtRef.current).toISOString()
                        : null,
                    local_total_count: Object.keys(legacyRecords).length,
                    server_count: serverItems.length,
                    local_only_count: localOnlyItems.length,
                    items: localOnlyItems,
                }),
                { "Content-Type": "application/json" },
            );
            coverageReportedRef.current = true;
        },
        [],
    );

    const loadSessionDetail = useCallback(
        async (sessionId: string, conversationId: string) => {
            const applyLegacySessionDetail = (fallbackRecord: LegacySessionRecord) => {
                dispatch(
                    updateSessions({
                        ...sessions,
                        [sessionId]: fallbackRecord.history,
                    }),
                );
                dispatch(
                    updateMappings({
                        ...mappings,
                        [sessionId]: conversationId,
                    }),
                );
                dispatch(
                    updateSessionExtensions({
                        ...sessionExtensions,
                        [sessionId]: {
                            ...(sessionExtensions[sessionId] || {}),
                            conversationId,
                            gid: fallbackRecord.gid || "",
                            selectedModel: sessionExtensions[sessionId]?.selectedModel || "",
                            reasoningEnabled: sessionExtensions[sessionId]?.reasoningEnabled,
                        },
                    }),
                );
                loadedSessionDetailsRef.current[sessionId] = conversationId;
            };
            const loadedConversationId = loadedSessionDetailsRef.current[sessionId];
            if (loadedConversationId === conversationId) {
                return;
            }
            if (loadingSessionDetailsRef.current.has(sessionId)) {
                return;
            }
            const localFallbackRecord = legacySessionRecordsRef.current[conversationId];
            if (legacySessionImportPendingRef.current && localFallbackRecord) {
                applyLegacySessionDetail(localFallbackRecord);
                return;
            }
            loadingSessionDetailsRef.current.add(sessionId);
            try {
                const response = await handleRequest(
                    "GET",
                    getFullPath(`/api/sessions/${encodeURIComponent(conversationId)}`),
                );
                const item = response.item;
                if (!item) {
                    loadedSessionDetailsRef.current[sessionId] = conversationId;
                    return;
                }
                const history = Array.isArray(item.history) ? item.history : [];
                dispatch(
                    updateSessions({
                        ...sessions,
                        [sessionId]: history,
                    }),
                );
                dispatch(
                    updateMappings({
                        ...mappings,
                        [sessionId]: conversationId,
                    }),
                );
                dispatch(
                    updateSessionExtensions({
                        ...sessionExtensions,
                        [sessionId]: {
                            ...(sessionExtensions[sessionId] || {}),
                            conversationId,
                            gid: item.gid || "",
                            selectedModel: sessionExtensions[sessionId]?.selectedModel || "",
                            reasoningEnabled: sessionExtensions[sessionId]?.reasoningEnabled,
                        },
                    }),
                );
                loadedSessionDetailsRef.current[sessionId] = conversationId;
                return;
            } catch (_error) {
                const fallbackRecord = legacySessionRecordsRef.current[conversationId];
                if (!fallbackRecord) {
                    loadedSessionDetailsRef.current[sessionId] = conversationId;
                    return;
                }
                applyLegacySessionDetail(fallbackRecord);
                handleRequest(
                    "POST",
                    getFullPath("/api/sessions/coverage-report"),
                    JSON.stringify({
                        phase: "detail_fallback",
                        grace_expires_at: legacySessionGraceExpiresAtRef.current
                            ? new Date(legacySessionGraceExpiresAtRef.current).toISOString()
                            : null,
                        local_total_count: Object.keys(legacySessionRecordsRef.current).length,
                        server_count: serverSessionSummaries.length,
                        local_only_count: 1,
                        items: [
                            {
                                conversation_id: conversationId,
                                gid: fallbackRecord.gid,
                                source: "local_fallback",
                                reason: "session_detail_missing_on_server",
                            },
                        ],
                    }),
                    { "Content-Type": "application/json" },
                ).catch(() => {});
            } finally {
                loadingSessionDetailsRef.current.delete(sessionId);
            }
        },
        [
            dispatch,
            mappings,
            serverSessionSummaries.length,
            sessionExtensions,
            sessions,
        ],
    );

    const handleSubmit = async (prompt: string) => {
        if (!prompt.trim().length) {
            sendUserAlert(t("App.handleSubmit.invalid_message"), true);
            return false;
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
            return false;
        }
        const modelPlaceholder = t("App.handleSubmit.model_placeholder");
        const currentSessionHistory = id in sessions ? sessions[id] : [];
        let conversationId =
            id in sessions
                ? sessionExtensions[id]?.conversationId || mappings[id] || ""
                : "";
        const selectedModelId = resolveModelId();

        const requiresExplicitModel = !gid;

        if (!selectedModelId && requiresExplicitModel) {
            sendUserAlert(t("App.handleSubmit.invalid_session"), true);
            return false;
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
        let pendingSessionDispatchTimer: number | undefined;
        let lastSessionDispatchAt = 0;
        const flushSessionDispatch = (nextSessions = _sessions) => {
            if (pendingSessionDispatchTimer !== undefined) {
                window.clearTimeout(pendingSessionDispatchTimer);
                pendingSessionDispatchTimer = undefined;
            }
            lastSessionDispatchAt = Date.now();
            dispatch(updateSessions(nextSessions));
        };
        const scheduleSessionDispatch = (nextSessions = _sessions) => {
            const now = Date.now();
            const elapsed = now - lastSessionDispatchAt;
            if (elapsed >= STREAM_SESSION_DISPATCH_INTERVAL_MS) {
                flushSessionDispatch(nextSessions);
                return;
            }
            if (pendingSessionDispatchTimer !== undefined) {
                return;
            }
            pendingSessionDispatchTimer = window.setTimeout(() => {
                pendingSessionDispatchTimer = undefined;
                flushSessionDispatch(_sessions);
            }, STREAM_SESSION_DISPATCH_INTERVAL_MS - elapsed);
        };
        dispatch(updateAI({ ...ai, busy: true }));
        flushSessionDispatch(_sessions);
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
                if (!mappings[id] && !sessionExtensions[id]?.conversationId) {
                    loadSessionSummaries().catch(() => {});
                }
                if (id !== convId) {
                    const previousId = id;
                    const nextSessions = { ..._sessions, [convId]: _sessions[previousId] };
                    delete nextSessions[previousId];
                    _sessions = nextSessions;
                    flushSessionDispatch(nextSessions);

                    const nextMappings = { ...mappings, [convId]: convId };
                    delete nextMappings[previousId];
                    dispatch(updateMappings(nextMappings));

                    currentSessionExtensionsState = {
                        ...currentSessionExtensionsState,
                        [convId]: {
                            ...(currentSessionExtensionsState[previousId] || {}),
                            conversationId: convId,
                            gid:
                                gid ||
                                currentSessionExtensionsState[previousId]?.gid ||
                                "",
                            selectedModel: selectedModelId,
                            reasoningEnabled: selectedReasoningEnabled,
                        },
                    };
                    delete currentSessionExtensionsState[previousId];
                    dispatch(updateSessionExtensions(currentSessionExtensionsState));
                    id = convId;
                    if (gid) {
                        navigate(`/g/${gid}/chat/${convId}`, { replace: true });
                    } else {
                        navigate(`/chat/${convId}`, { replace: true });
                    }
                } else {
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
            if (end) {
                flushSessionDispatch(_sessions);
            } else {
                scheduleSessionDispatch(_sessions);
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
        void start();
        setUploadInlineData({ data: "", mimeType: "" });
        return true;
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
    const isLibraryPage = !!matchPath(
        {
            path: `${routes.library.prefix}${routes.library.uri}${routes.library.suffix}`,
        },
        currentPath,
    );
    const isGptsManagePage =
        !!matchPath(
            {
                path: `${routes.my_gpts.prefix}${routes.my_gpts.uri}${routes.my_gpts.suffix}`,
            },
            currentPath,
        ) ||
        !!matchPath(
            {
                path: `${routes.gpts_create.prefix}${routes.gpts_create.uri}${routes.gpts_create.suffix}`,
            },
            currentPath,
        );
    const adminRoutes = [
        "admin_index",
        "admin",
        "admin_gpts",
        "admin_permissions",
        "admin_flags",
        "admin_audit",
    ] as const;
    const isAdminPage = adminRoutes.some((key) =>
        matchPath(
            {
                path: `${routes[key].prefix}${routes[key].uri}${routes[key].suffix}`,
            },
            currentPath,
        ),
    );
    const isNewSessionPage =
        currentPath === routes.index.prefix ||
        (!!gid && !id && currentPath === `/g/${gid}`);
    const isDefaultNewSessionPage = isNewSessionPage && !gid;

    useEffect(() => {
        if (!hasLogined) {
            setGptsFeatureAllowed(false);
            setGptsManageAllowed(false);
            setGptsPermissionLoaded(false);
            setVoiceLabAllowed(false);
            setAdminAllowed(false);
            setAdminPermissionLoaded(false);
            setLibraryAllowed(false);
            setLibraryPermissionLoaded(false);
            setServerSessionSummaries([]);
            setLegacySessionRecords({});
            legacySessionRecordsRef.current = {};
            legacySessionGraceExpiresAtRef.current = null;
            legacySessionImportStartedRef.current = false;
            coverageReportedRef.current = false;
            loadingSessionDetailsRef.current.clear();
            loadedSessionDetailsRef.current = {};
            return;
        }
        setGptsPermissionLoaded(false);
        setAdminPermissionLoaded(false);
        setLibraryPermissionLoaded(false);
        handleRequest('GET', getFullPath('/api/gpts/permission'))
            .then((responseJson) => {
                setGptsFeatureAllowed(Boolean(responseJson.allowed));
                setGptsManageAllowed(Boolean(responseJson.manage_allowed));
            })
            .catch(() => {
                setGptsFeatureAllowed(false);
                setGptsManageAllowed(false);
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
        handleRequest('GET', getFullPath('/api/admin/permission'))
            .then((responseJson) => {
                setAdminAllowed(Boolean(responseJson.allowed));
            })
            .catch(() => {
                setAdminAllowed(false);
            })
            .finally(() => {
                setAdminPermissionLoaded(true);
            });
        handleRequest('GET', getFullPath('/api/library/permission'))
            .then((responseJson) => {
                setLibraryAllowed(Boolean(responseJson.allowed));
            })
            .catch(() => {
                setLibraryAllowed(false);
            })
            .finally(() => {
                setLibraryPermissionLoaded(true);
            });
    }, [hasLogined]);

    useEffect(() => {
        if (!hasLogined) {
            return;
        }
        coverageReportedRef.current = false;
        migrateLegacyPersistedSessions()
            .catch(() => {})
            .finally(async () => {
                const items = await loadSessionSummaries().catch(() => []);
                reportSessionCoverage(Array.isArray(items) ? items : []).catch(() => {});
            });
    }, [hasLogined, loadSessionSummaries, migrateLegacyPersistedSessions, reportSessionCoverage]);

    useEffect(() => {
        if (
            !hasLogined ||
            !id ||
            isAdminPage ||
            isTracePage ||
            isVoiceLabPage ||
            !canOpenCurrentGpt
        ) {
            return;
        }
        if (sessions[id]?.length) {
            return;
        }
        const conversationId = activeConversationId || id;
        loadSessionDetail(id, conversationId).catch(() => {});
    }, [
        activeConversationId,
        canOpenCurrentGpt,
        hasLogined,
        id,
        isAdminPage,
        isTracePage,
        isVoiceLabPage,
        loadSessionDetail,
        sessions,
    ]);

    useEffect(() => {
        initRuntimeTelemetry({
            route: location.pathname,
            page: location.pathname,
            gid,
            chatSessionId: id || "",
            conversationId: activeConversationId,
            messageCount: activeMessageCount,
            lastResponseLength: activeLastResponseLength,
            attachmentCount: activeAttachmentCount,
            busy: ai.busy,
            selectedModel:
                selectedModel ||
                sessionExtensions[id || ""]?.selectedModel ||
                "",
        });
    }, []);

    useEffect(() => {
        updateRuntimeTelemetryContext({
            route: location.pathname,
            page: location.pathname,
            gid,
            chatSessionId: id || "",
            conversationId: activeConversationId,
            messageCount: activeMessageCount,
            lastResponseLength: activeLastResponseLength,
            attachmentCount: activeAttachmentCount,
            busy: ai.busy,
            selectedModel:
                selectedModel ||
                sessionExtensions[id || ""]?.selectedModel ||
                "",
        });
    }, [
        activeAttachmentCount,
        activeConversationId,
        activeLastResponseLength,
        activeMessageCount,
        ai.busy,
        gid,
        id,
        location.pathname,
        selectedModel,
        sessionExtensions,
    ]);

    useEffect(() => {
        if (previousBusyRef.current === null) {
            previousBusyRef.current = ai.busy;
            return;
        }
        if (previousBusyRef.current !== ai.busy) {
            reportRuntimeEvent(ai.busy ? "chat_stream_start" : "chat_stream_end", {
                gid,
                chatSessionId: id || "",
                conversationId: activeConversationId,
                messageCount: activeMessageCount,
                lastResponseLength: activeLastResponseLength,
                attachmentCount: activeAttachmentCount,
            });
            previousBusyRef.current = ai.busy;
        }
    }, [
        activeAttachmentCount,
        activeConversationId,
        activeLastResponseLength,
        activeMessageCount,
        ai.busy,
        gid,
        id,
    ]);

    useEffect(() => {
        if (
            hasLogined &&
            gptsPermissionLoaded &&
            !gptsFeatureAllowed &&
            isGptsPage
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
        if (
            hasLogined &&
            gptsPermissionLoaded &&
            !gptsManageAllowed &&
            isGptsManagePage
        ) {
            navigate(routes.gpts.prefix, { replace: true });
        }
    }, [
        gptsManageAllowed,
        gptsPermissionLoaded,
        hasLogined,
        isGptsManagePage,
        navigate,
        routes.gpts.prefix,
    ]);

    useEffect(() => {
        if (
            hasLogined &&
            adminPermissionLoaded &&
            !adminAllowed &&
            isAdminPage
        ) {
            navigate(routes.index.prefix, { replace: true });
        }
    }, [
        adminAllowed,
        adminPermissionLoaded,
        hasLogined,
        isAdminPage,
        navigate,
        routes.index.prefix,
    ]);

    useEffect(() => {
        if (
            hasLogined &&
            libraryPermissionLoaded &&
            !libraryAllowed &&
            isLibraryPage
        ) {
            navigate(routes.index.prefix, { replace: true });
        }
    }, [
        libraryAllowed,
        libraryPermissionLoaded,
        hasLogined,
        isLibraryPage,
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
            if (gid && gid !== "gptassistant" && !canOpenCurrentGpt && !gptsPermissionLoaded) {
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
                                : null,
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
                                            reasoningDefaultEnabled:
                                                typeof item.reasoning_default_enabled === "boolean"
                                                    ? item.reasoning_default_enabled
                                                    : undefined,
                                        })
                                    }
                                    return acc
                                },
                                [],
                            )
                            : undefined
                        setModels(normalizedModels)
                        setPageSubTitle(data.sub_title ?? data.desc ?? "")
                        setPageSamples(data.samples ?? [])
                        setPageLogo(data.logo)
                        setPageTitle(data.title ?? data.name ?? "")
                        setPageName(data.name ?? data.title ?? "")
                        // console.log("fileUploadEnabled:" + fileUploadEnabled)
                    })
                } else {
                    console.log("====")
                    window.location.href = '/';
                }
            });
        }
    }, [canOpenCurrentGpt, gptsPermissionLoaded, hasLogined, gid]);

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

        if (typeof serverDefaultReasoning === "boolean") {
            setSelectedReasoningEnabled(serverDefaultReasoning);
            return;
        }

        const resolvedReasoningDefault = resolvedModelOption?.reasoningDefaultEnabled;
        setSelectedReasoningEnabled(
            typeof resolvedReasoningDefault === "boolean"
                ? resolvedReasoningDefault
                : false,
        );
    }, [id, resolvedModelOption, serverDefaultReasoning, sessionExtensions]);

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
        ) : hasLogined && isAdminPage ? (
            <Container className="h-screen w-full" toaster={true}>
                <div className="flex h-screen min-w-full flex-col overflow-hidden bg-white/95">
                    <div className="border-b border-[rgba(223,231,236,0.96)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] px-4 py-3">
                        <div className="mx-auto flex w-full max-w-[1560px] items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7f8b96]">
                                    {t("views.Admin.page_title")}
                                </p>
                                <p className="mt-1 truncate text-sm text-[#66717d]">
                                    {t("views.Admin.page_subtitle")}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl border border-[rgba(214,223,229,0.98)] bg-white px-3.5 text-sm font-semibold text-[#2f3a46] transition-colors hover:bg-[rgba(245,248,250,0.96)]"
                                onClick={() => navigate(routes.index.prefix)}
                            >
                                {t("views.Admin.back_to_chat")}
                            </button>
                        </div>
                    </div>
                    <div
                        ref={mainSectionRef}
                        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
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
                                onToggleSidebar: () => setSidebarExpand((state) => !state),
                            }}
                        />
                    </div>
                </div>
            </Container>
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
                            sessionSummaries={sessionSummaries}
                            expand={sidebarExpand}
                            gptsFeatureAllowed={gptsFeatureAllowed}
                            voiceLabAllowed={voiceLabAllowed}
                            adminAllowed={adminAllowed}
                            libraryAllowed={libraryAllowed}
                            currentLocale={currentLocale}
                            onSwitchLocale={handleSwitchLocale}
                            onDeleteSession={handleDeleteSession}
                            onRenameSession={handleRenameSession}
                            onToggleSidebar={() =>
                                setSidebarExpand((state) => !state)
                            }
                            theme={theme}
                            onSwitchTheme={setTheme}
                        />
                        <Container
                            className="col-start-2 flex h-screen min-w-0 flex-col bg-white/95 max-[900px]:col-start-1"
                        >
                            {!isGptsPage && !isAdminPage && !isLibraryPage && (
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
                                        && !isAdminPage && !isLibraryPage
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
                                            || isAdminPage
                                            || isLibraryPage
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
                                            onToggleSidebar: () =>
                                                setSidebarExpand((state) => !state),
                                            sidebarExpand: sidebarExpand,
                                        }}
                                    />
                                </div>
                                {!isGptsPage && !isAdminPage && !isLibraryPage && (
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
