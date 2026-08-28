import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLocation } from "react-router-dom";
import { getFullPath } from "../helpers/getDomainAndPath";
import { getBasePath } from "../helpers/getBasePath";
import {
    buildReturnTo,
    clearLoginRetry,
    consumeLoginRetry,
    markLoginRetry,
} from "../helpers/loginRedirect";

interface LoginByOAuthProps {
    readonly logo: string;
    readonly title: string;
    readonly isNoAuthorized: boolean;
    readonly onLogined: (uname: string) => void;
    readonly onNoAuthorized?: () => void;
}

export const LoginByOAuth = (props: LoginByOAuthProps) => {
    const { logo, title, isNoAuthorized, onLogined, onNoAuthorized } = props;
    const { t } = useTranslation();

    const react_location = useLocation();

    const checkHasLoggedIn = useCallback(async () => {
        // console.log("w:" + window.innerWidth)
        // console.log("h:" + window.innerHeight)
        // const statusResponseJson = await handleRequest('GET', '/api/auth/status?w='+window.innerWidth+'&h='+window.innerHeight);
        // if (statusResponseJson.name) {
        //     return statusResponseJson.name;
        // }
        // console.log("====="+location.protocol + "//" + location.host + location.pathname + "#" + react_location.pathname)

        // const pathParts = location.pathname.split("/")
        // const mod = pathParts[1];

        const resp = await fetch(getFullPath('/api/auth/status?w='+window.innerWidth+'&h='+window.innerHeight), {
            method: 'GET',
            credentials: 'include' // 确保带上 HttpOnly Cookie
        });
        if (resp.ok) {
            const user = await resp.json();
            // console.log("user:"+user.name)
            clearLoginRetry();
            return user.name;
        }

        if (consumeLoginRetry()) {
            // A login redirect already happened and we are still unauthenticated:
            // stop redirecting (loop guard) and surface the no-authorized state.
            onNoAuthorized?.();
            return false;
        }

        // Login is hosted by this app's /login page (single entry for all sub-apps).
        markLoginRetry();
        window.location.href =
            `${getBasePath()}/login?returnTo=` + buildReturnTo();
        return false
    }, [onNoAuthorized]);

    // console.log("111111111")

    useEffect(() => {
        // console.log("222222")
        // onLogined("test");
        checkHasLoggedIn().then((uname) => {
            if (uname) {
                onLogined(uname);
            }
        });
    }, [checkHasLoggedIn, onLogined]);

    return (
        <>
            <div className="flex items-center mb-8">
                <img className="size-10 mr-2" src={logo} alt="" />
                <span className="text-3xl font-semibold text-gray-900">
                    {title}
                </span>
            </div>
            <div className="w-full bg-gray-50 rounded-lg shadow-xl max-w-lg hover:scale-105 transition-all duration-700">
                <div className="p-8 space-y-6 text-center">

                    {isNoAuthorized ? (
                        t("components.LoginForm.no_authorized")
                    ) : (
                        t("components.LoginForm.logining")
                    )}

                    {/* {t("components.LoginForm.logining")} */}
                
                    {/* <button
                        className="w-full text-white bg-blue-600 hover:bg-blue-700 font-medium rounded-lg text-sm px-5 py-2.5 text-center"
                        onClick={handleLogin}
                    >
                        {t("components.LoginForm.login_button") + " " + ssoProvider.name + " SSO"}
                    </button> */}
                </div>
            </div>
        </>
    );
};
