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

// For 401 interceptors and login components: redirect to the single SSO login
// entry (the backend resolves the provider itself from request context).
// Returns false without redirecting when a retry was already made.
export const redirectToLoginIfPossible = (): boolean => {
    if (consumeLoginRetry()) {
        return false;
    }
    markLoginRetry();
    window.location.href =
        getFullPath("/api/auth/login") + `?returnTo=${buildReturnTo()}`;
    return true;
};
