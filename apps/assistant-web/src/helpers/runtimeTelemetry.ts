import { getFullPath } from "./getDomainAndPath";

const RUNTIME_EVENT_ENDPOINT = "/api/client-runtime/event";
const HEARTBEAT_INTERVAL_MS = 30_000;
const STORAGE_KEY = "assistant-web:runtime:last-state:v1";
const CRASH_DETECTION_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

type NavigationType = PerformanceNavigationTiming["type"] | null;

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonObject
    | JsonValue[];

interface JsonObject {
    [key: string]: JsonValue;
}

export interface RuntimeTelemetryContext extends JsonObject {
    readonly route?: string;
    readonly page?: string;
    readonly gid?: string;
    readonly chatSessionId?: string;
    readonly conversationId?: string;
    readonly messageCount?: number;
    readonly lastResponseLength?: number;
    readonly attachmentCount?: number;
    readonly busy?: boolean;
    readonly selectedModel?: string;
}

interface StoredRuntimeState extends RuntimeTelemetryContext {
    readonly runtimeSessionId: string;
    readonly startedAt: string;
    readonly lastSeenAt: string;
    readonly closedAt?: string;
}

let initialized = false;
let runtimeSessionId = "";
let currentContext: RuntimeTelemetryContext = {};
let heartbeatTimer: number | null = null;

const nowIso = () => new Date().toISOString();

const createRuntimeSessionId = () => {
    try {
        return crypto.randomUUID();
    } catch (_error) {
        return `runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
};

const ensureRuntimeSessionId = () => {
    if (!runtimeSessionId) {
        runtimeSessionId = createRuntimeSessionId();
    }
    return runtimeSessionId;
};

const detectWeCom = () => /wxwork|wecom/i.test(navigator.userAgent);

const getMemorySnapshot = (): JsonObject => {
    const memory = (performance as Performance & {
        memory?: {
            readonly usedJSHeapSize?: number;
            readonly totalJSHeapSize?: number;
            readonly jsHeapSizeLimit?: number;
        };
    }).memory;
    if (!memory) {
        return {};
    }
    return {
        usedJSHeapSize: memory.usedJSHeapSize ?? null,
        totalJSHeapSize: memory.totalJSHeapSize ?? null,
        jsHeapSizeLimit: memory.jsHeapSizeLimit ?? null,
    };
};

const buildBasePayload = () => ({
    runtimeSessionId: ensureRuntimeSessionId(),
    occurredAt: nowIso(),
    route: currentContext.route ?? window.location.pathname,
    page: currentContext.page ?? window.location.pathname,
    gid: currentContext.gid ?? "",
    chatSessionId: currentContext.chatSessionId ?? "",
    conversationId: currentContext.conversationId ?? "",
    visibilityState: document.visibilityState,
    userAgent: navigator.userAgent,
    isWeCom: detectWeCom(),
    url: window.location.href,
    referrer: document.referrer || "",
    ...getMemorySnapshot(),
    ...currentContext,
});

const sanitizeValue = (value: unknown, depth = 0): JsonValue => {
    if (depth >= 5) {
        return String(value);
    }
    if (
        value == null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value as JsonValue;
    }
    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1));
    }
    if (typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 50)
                .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]),
        );
    }
    return String(value);
};

const persistState = (overrides: Partial<StoredRuntimeState> = {}) => {
    const payload: StoredRuntimeState = {
        runtimeSessionId,
        startedAt: overrides.startedAt ?? readStoredState()?.startedAt ?? nowIso(),
        lastSeenAt: nowIso(),
        ...currentContext,
        ...overrides,
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
        // Ignore storage failures in telemetry.
    }
};

const readStoredState = (): StoredRuntimeState | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as StoredRuntimeState;
        if (!parsed || typeof parsed !== "object") {
            return null;
        }
        return parsed;
    } catch (_error) {
        return null;
    }
};

const getNavigationType = (): NavigationType => {
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
    return navigationEntry?.type ?? null;
};

const wasDocumentDiscarded = () =>
    Boolean((document as Document & { readonly wasDiscarded?: boolean }).wasDiscarded);

const buildPreviousStatePayload = (
    previousState: StoredRuntimeState,
    inactivityMs: number,
) => ({
    previousRuntimeSessionId: previousState.runtimeSessionId,
    previousStartedAt: previousState.startedAt,
    previousLastSeenAt: previousState.lastSeenAt,
    previousRoute: previousState.route ?? "",
    previousPage: previousState.page ?? "",
    previousGid: previousState.gid ?? "",
    previousChatSessionId: previousState.chatSessionId ?? "",
    previousConversationId: previousState.conversationId ?? "",
    previousBusy: previousState.busy ?? null,
    previousMessageCount: previousState.messageCount ?? null,
    previousLastResponseLength: previousState.lastResponseLength ?? null,
    previousAttachmentCount: previousState.attachmentCount ?? null,
    inactivityMs,
});

const postRuntimePayload = (payload: JsonObject) => {
    const body = JSON.stringify(payload);
    const url = getFullPath(RUNTIME_EVENT_ENDPOINT);

    try {
        if (navigator.sendBeacon) {
            const sent = navigator.sendBeacon(
                url,
                new Blob([body], { type: "application/json" }),
            );
            if (sent) {
                return;
            }
        }
    } catch (_error) {
        // Ignore and fall through to fetch.
    }

    void fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body,
        credentials: "include",
        keepalive: true,
    }).catch(() => {
        // Ignore network failures in telemetry.
    });
};

export const reportRuntimeEvent = (
    event: string,
    payload: Record<string, unknown> = {},
) => {
    if (typeof window === "undefined" || !event.trim().length) {
        return;
    }
    const eventPayload = sanitizeValue({
        event,
        ...buildBasePayload(),
        ...payload,
    }) as JsonObject;
    postRuntimePayload(eventPayload);
};

const handleWindowError = (event: ErrorEvent) => {
    reportRuntimeEvent("js_error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error
            ? {
                  name: event.error.name,
                  message: event.error.message,
                  stack: event.error.stack,
              }
            : null,
    });
};

const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    reportRuntimeEvent("unhandled_rejection", {
        reason:
            reason instanceof Error
                ? {
                      name: reason.name,
                      message: reason.message,
                      stack: reason.stack,
                  }
                : reason,
    });
};

const handlePageHide = (event: PageTransitionEvent) => {
    persistState({ closedAt: nowIso() });
    reportRuntimeEvent("page_hide", { persisted: event.persisted });
};

const handleVisibilityChange = () => {
    persistState(document.visibilityState === "hidden" ? {} : { closedAt: undefined });
};

const sendHeartbeat = () => {
    persistState({ closedAt: undefined });
    reportRuntimeEvent("heartbeat");
};

const reportSuspectedCrashIfNeeded = (
    navigationType: NavigationType,
    documentWasDiscarded: boolean,
) => {
    const previousState = readStoredState();
    if (!previousState || previousState.closedAt) {
        return;
    }
    const lastSeenAt = Date.parse(previousState.lastSeenAt);
    if (!Number.isFinite(lastSeenAt)) {
        return;
    }
    const ageMs = Date.now() - lastSeenAt;
    if (ageMs <= 0 || ageMs > CRASH_DETECTION_WINDOW_MS) {
        return;
    }
    const previousStatePayload = buildPreviousStatePayload(previousState, ageMs);
    if (documentWasDiscarded || navigationType === "reload") {
        reportRuntimeEvent("runtime_resume", {
            ...previousStatePayload,
            resumeReason: documentWasDiscarded ? "tab_discarded" : "reload",
            navigationType,
            documentWasDiscarded,
        });
        return;
    }
    reportRuntimeEvent("suspected_crash", previousStatePayload);
};

export const initRuntimeTelemetry = (
    initialContext: RuntimeTelemetryContext = {},
) => {
    if (typeof window === "undefined" || initialized) {
        return;
    }
    initialized = true;
    runtimeSessionId = createRuntimeSessionId();
    currentContext = { ...initialContext };
    const navigationType = getNavigationType();
    const documentWasDiscarded = wasDocumentDiscarded();

    reportSuspectedCrashIfNeeded(navigationType, documentWasDiscarded);
    persistState({ startedAt: nowIso(), closedAt: undefined });
    reportRuntimeEvent("page_open", {
        navigationType,
        documentWasDiscarded,
    });

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    heartbeatTimer = window.setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
};

export const updateRuntimeTelemetryContext = (
    partialContext: RuntimeTelemetryContext,
) => {
    currentContext = {
        ...currentContext,
        ...partialContext,
    };
    if (initialized) {
        persistState({ closedAt: undefined });
    }
};
