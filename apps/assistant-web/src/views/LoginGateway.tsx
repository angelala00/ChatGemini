import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import siteLogo from "../assets/logo.svg";
import { globalConfig } from "../config/global";
import { getFullPath } from "../helpers/getDomainAndPath";

// Same-site relative paths only (client-side open-redirect guard); the
// backend re-validates with _safe_return_to before its own redirects.
const isSafeReturnTo = (value: string): boolean =>
    value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");

// Fallback used ONLY when the returnTo param is absent; a present but invalid
// value still degrades to "/" without rescue. Same-origin referrers only -
// cross-origin ones lose the path anyway under the default
// strict-origin-when-cross-origin policy - and the referrer's own page (a
// self-referential /login) is skipped to avoid feeding the login round-trip
// its own URL. The origin is stripped and the remainder must pass the same
// isSafeReturnTo guard before it can be used as a target.
const referrerReturnTo = (): string => {
    if (!document.referrer) {
        return "";
    }
    try {
        const ref = new URL(document.referrer);
        if (ref.origin !== window.location.origin || ref.pathname === window.location.pathname) {
            return "";
        }
        const rel = ref.pathname + ref.search + ref.hash;
        return isSafeReturnTo(rel) ? rel : "";
    } catch {
        return "";
    }
};

// Single login entry shared by all same-domain sub-apps: sub-apps redirect to
// `/login?returnTo=<their current path>`; this page resolves the provider via
// get-provider and forwards the (validated) returnTo to oauth-login. It never
// touches the sso.loginRetry loop-guard flag - that flag belongs to whichever
// sub-app initiated the login round-trip.
export const LoginGateway = () => {
    const { t } = useTranslation();
    const [failed, setFailed] = useState(false);
    const [loggedOut] = useState(
        () => new URLSearchParams(window.location.search).get("loggedOut") === "1",
    );

    const startLogin = useCallback(async (target: string) => {
        setFailed(false);
        try {
            const providerResp = await fetch(getFullPath("/api/auth/get-provider"), {
                method: "GET",
            });
            if (!providerResp.ok) {
                throw new Error("Network response was not ok");
            }
            const data = await providerResp.json();
            window.location.href =
                getFullPath(`/api/auth/oauth-login/${data.provider.param}`) +
                `?returnTo=${encodeURIComponent(target)}`;
        } catch (error) {
            console.error("请求失败:", error);
            setFailed(true);
        }
    }, []);

    useEffect(() => {
        const rawReturnTo = new URLSearchParams(window.location.search).get("returnTo") || "";
        // Absent returnTo: fall back to a validated same-origin referrer path;
        // present but invalid: degrade to "/" with no rescue.
        let target: string;
        if (rawReturnTo) {
            target = isSafeReturnTo(rawReturnTo) ? rawReturnTo : "/";
        } else {
            target = referrerReturnTo() || "/";
        }

        const proceed = async () => {
            if (loggedOut) {
                return;
            }
            try {
                const resp = await fetch(getFullPath("/api/auth/status"), {
                    method: "GET",
                    credentials: "include",
                });
                if (resp.ok) {
                    // Already logged in: go straight back; replace keeps /login
                    // out of the browser history.
                    window.location.replace(target);
                    return;
                }
                await startLogin(target);
            } catch (error) {
                console.error("请求失败:", error);
                setFailed(true);
            }
        };
        proceed();
    }, [loggedOut, startLogin]);

    return (
        <div className="w-full max-w-lg rounded-lg bg-gray-50 p-8 text-center shadow-xl">
            {loggedOut ? (
                <div className="space-y-6">
                    <div className="flex items-center justify-center">
                        <img className="mr-2 size-10" src={siteLogo} alt="" />
                        <span className="text-3xl font-semibold text-gray-900">
                            {globalConfig.title.header}
                        </span>
                    </div>
                    {failed && (
                        <p className="text-gray-700">
                            {t("components.LoginForm.login_failed")}
                        </p>
                    )}
                    <button
                        type="button"
                        className="rounded-lg bg-[#279ab3] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#21879d]"
                        onClick={() => startLogin("/")}
                    >
                        {t("components.LoginForm.login_again")}
                    </button>
                </div>
            ) : failed ? (
                t("components.LoginForm.no_authorized")
            ) : (
                t("components.LoginForm.logining")
            )}
        </div>
    );
};

export default LoginGateway;
