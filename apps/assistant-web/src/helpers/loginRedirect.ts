import { getFullPath } from "./getDomainAndPath";

// Shared SSO login-redirect convention (see servers/assistant-bff/app/AGENTS.md).
// Sub-apps redirect to `/api/auth/oauth-login/{provider}?returnTo=<relative path>`
// and the auth backend 302s back after login, so no post-login restore logic is
// needed on the frontend. Keep this file identical across sub-apps.

export const LOGIN_RETRY_KEY = "sso.loginRetry";

export const buildReturnTo = (): string =>
    encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);

export const clearLoginRetry = (): void => {
    try {
        window.sessionStorage.removeItem(LOGIN_RETRY_KEY);
    } catch {
        // sessionStorage unavailable (private mode) - degrade to no loop guard.
    }
};

export const markLoginRetry = (): void => {
    try {
        window.sessionStorage.setItem(LOGIN_RETRY_KEY, "1");
    } catch {
        // Ignore - degrade to no loop guard.
    }
};

// One-shot consume: returns true (and clears) when a login redirect already
// happened and still landed unauthenticated, so callers must not redirect again.
export const consumeLoginRetry = (): boolean => {
    try {
        const flagged = window.sessionStorage.getItem(LOGIN_RETRY_KEY) === "1";
        if (flagged) {
            window.sessionStorage.removeItem(LOGIN_RETRY_KEY);
        }
        return flagged;
    } catch {
        return false;
    }
};

// For 401 interceptors: redirect to SSO login carrying the current path as
// returnTo. Returns false without redirecting when a retry was already made.
export const redirectToLoginIfPossible = async (): Promise<boolean> => {
    if (consumeLoginRetry()) {
        return false;
    }
    markLoginRetry();
    try {
        const response = await fetch(getFullPath("/api/auth/get-provider"), { method: "GET" });
        const data = await response.json();
        window.location.href =
            getFullPath(`/api/auth/oauth-login/${data.provider.param}`) +
            `?returnTo=${buildReturnTo()}`;
        return true;
    } catch (error) {
        console.error("请求失败:", error);
        return false;
    }
};
