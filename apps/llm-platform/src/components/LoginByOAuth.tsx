import { useCallback, useEffect } from "react";
import { getFullPath } from "../helpers/getDomainAndPath";

interface LoginByOAuthProps {
    readonly logo: string;
    readonly title: string;
    readonly isNoAuthorized: boolean;
    readonly onLogined: (uname: string) => void;
}

export const LoginByOAuth = (props: LoginByOAuthProps) => {
    const { logo, title, isNoAuthorized, onLogined } = props;
    const checkHasLoggedIn = useCallback(async () => {
        const resp = await fetch(
            getFullPath(`/api/auth/status?w=${window.innerWidth}&h=${window.innerHeight}`),
            {
                method: "GET",
                credentials: "include",
            },
        );
        if (resp.ok) {
            const user = await resp.json();
            return user.name;
        }

        await fetch(getFullPath("/api/auth/get-provider"), {
            method: "GET",
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Network response was not ok");
                }
                return response.json();
            })
            .then((data) => {
                window.location.href = getFullPath(
                    "/api/auth/oauth-login/" + data.provider.param,
                );
            })
            .catch((error) => {
                console.error("请求失败:", error);
            });
        return false;
    }, []);

    useEffect(() => {
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
                    {isNoAuthorized ? "无权限" : "正在登录..."}
                </div>
            </div>
        </>
    );
};
