import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getFullPath } from "../helpers/getDomainAndPath";
import { handleRequest } from "../helpers/handleRequest";
import {
    ExternalAssistantBootstrap,
    ExternalAssistantBootstrapStatus,
    ExternalAssistantMenuItem,
    WorkspaceMode,
} from "../types/externalAssistant";

const WORKSPACE_QUERY_KEY = "workspace";
const EXTERNAL_PAGE_QUERY_KEY = "externalPage";
const EXTERNAL_WORKSPACE_QUERY_VALUE = "external";
const EXTERNAL_WORKSPACE_PATH = "/chat/deer";

const getExternalMenuPathFromPath = (pathname: string): string | null => {
    const match = pathname.match(/^\/chat\/deer(?:\/(.*))?\/?$/);
    if (!match) {
        return null;
    }
    try {
        return match[1] ? decodeURIComponent(match[1]).replace(/\/$/, "") : "";
    } catch {
        return "";
    }
};

const getExternalWorkspacePath = (menuPath = ""): string =>
    menuPath
        ? `${EXTERNAL_WORKSPACE_PATH}/${menuPath
              .split("/")
              .map((segment) => encodeURIComponent(segment))
              .join("/")}`
        : EXTERNAL_WORKSPACE_PATH;

interface UseExternalAssistantWorkspaceOptions {
    readonly hasLogined: boolean;
    readonly workspaceAvailable: boolean;
}

const normalizeBootstrap = (payload: any): ExternalAssistantBootstrap => {
    const menus = Array.isArray(payload?.menus)
        ? payload.menus.reduce(
              (items: ExternalAssistantMenuItem[], item: any) => {
                  const id = typeof item?.id === "string" ? item.id.trim() : "";
                  const label =
                      typeof item?.label === "string" ? item.label.trim() : "";
                  const path = typeof item?.path === "string" ? item.path.trim() : "";
                  const url = typeof item?.url === "string" ? item.url.trim() : "";
                  if (id && label && url) {
                      items.push({ id, label, path, url });
                  }
                  return items;
              },
              [],
          )
        : [];
    return {
        title:
            typeof payload?.title === "string" && payload.title.trim()
                ? payload.title.trim()
                : "",
        iframeUrl:
            typeof payload?.iframe_url === "string"
                ? payload.iframe_url.trim()
                : "",
        menus,
    };
};

export const useExternalAssistantWorkspace = ({
    hasLogined,
    workspaceAvailable,
}: UseExternalAssistantWorkspaceOptions) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [permissionLoaded, setPermissionLoaded] = useState(false);
    const [allowed, setAllowed] = useState(false);
    const [bootstrap, setBootstrap] = useState<ExternalAssistantBootstrap | null>(
        null,
    );
    const [bootstrapStatus, setBootstrapStatus] =
        useState<ExternalAssistantBootstrapStatus>("idle");
    const [hasOpened, setHasOpened] = useState(false);

    const searchParams = useMemo(
        () => new URLSearchParams(location.search),
        [location.search],
    );
    const externalMenuPathFromPath = getExternalMenuPathFromPath(location.pathname);
    const externalWorkspaceRequestedByQuery =
        searchParams.get(WORKSPACE_QUERY_KEY) ===
        EXTERNAL_WORKSPACE_QUERY_VALUE;
    const externalWorkspaceRequested =
        externalMenuPathFromPath !== null || externalWorkspaceRequestedByQuery;
    const requestedExternalPage =
        externalMenuPathFromPath ??
        searchParams.get(EXTERNAL_PAGE_QUERY_KEY)?.trim() ??
        "";
    const workspaceMode: WorkspaceMode =
        workspaceAvailable &&
        permissionLoaded &&
        allowed &&
        externalWorkspaceRequested
            ? "external"
            : "native";

    const navigateWithParams = useCallback(
        (
            params: URLSearchParams,
            replace = false,
            pathname = location.pathname,
        ) => {
            const search = params.toString();
            navigate(
                {
                    pathname,
                    search: search ? `?${search}` : "",
                    hash: location.hash,
                },
                { replace },
            );
        },
        [location.hash, location.pathname, navigate],
    );

    useEffect(() => {
        if (!hasLogined) {
            setPermissionLoaded(false);
            setAllowed(false);
            setBootstrap(null);
            setBootstrapStatus("idle");
            setHasOpened(false);
            return;
        }

        let active = true;
        setPermissionLoaded(false);
        handleRequest(
            "GET",
            getFullPath("/api/external-assistant/permission"),
        )
            .then((payload) => {
                if (active) {
                    setAllowed(Boolean(payload?.allowed));
                }
            })
            .catch(() => {
                if (active) {
                    setAllowed(false);
                }
            })
            .finally(() => {
                if (active) {
                    setPermissionLoaded(true);
                }
            });

        return () => {
            active = false;
        };
    }, [hasLogined]);

    useEffect(() => {
        if (
            !permissionLoaded ||
            allowed ||
            !externalWorkspaceRequested
        ) {
            return;
        }
        const params = new URLSearchParams(location.search);
        params.delete(WORKSPACE_QUERY_KEY);
        params.delete(EXTERNAL_PAGE_QUERY_KEY);
        navigateWithParams(
            params,
            true,
            externalMenuPathFromPath !== null ? "/" : location.pathname,
        );
    }, [
        allowed,
        externalMenuPathFromPath,
        externalWorkspaceRequested,
        location.search,
        navigateWithParams,
        permissionLoaded,
    ]);

    useEffect(() => {
        if (
            !allowed ||
            !externalWorkspaceRequestedByQuery ||
            externalMenuPathFromPath !== null ||
            !bootstrap
        ) {
            return;
        }
        const params = new URLSearchParams(location.search);
        params.delete(WORKSPACE_QUERY_KEY);
        params.delete(EXTERNAL_PAGE_QUERY_KEY);
        const menu = bootstrap.menus.find(({ id }) => id === requestedExternalPage);
        navigateWithParams(params, true, getExternalWorkspacePath(menu?.path));
    }, [
        allowed,
        bootstrap,
        externalMenuPathFromPath,
        externalWorkspaceRequestedByQuery,
        location.search,
        navigateWithParams,
        requestedExternalPage,
    ]);

    const loadBootstrap = useCallback(() => {
        if (!allowed) {
            return Promise.resolve();
        }
        setBootstrapStatus("loading");
        return handleRequest(
            "GET",
            getFullPath("/api/external-assistant/bootstrap"),
        )
            .then((payload) => {
                if (!payload?.allowed) {
                    throw new Error("External assistant workspace not allowed");
                }
                setBootstrap(normalizeBootstrap(payload));
                setBootstrapStatus("ready");
            })
            .catch(() => {
                setBootstrap(null);
                setBootstrapStatus("error");
            });
    }, [allowed]);

    useEffect(() => {
        if (workspaceMode !== "external") {
            return;
        }
        setHasOpened(true);
        if (bootstrapStatus === "idle") {
            void loadBootstrap();
        }
    }, [bootstrapStatus, loadBootstrap, workspaceMode]);

    useEffect(() => {
        if (
            workspaceMode !== "external" ||
            externalMenuPathFromPath !== "" ||
            !bootstrap?.menus[0]
        ) {
            return;
        }
        navigateWithParams(
            new URLSearchParams(location.search),
            true,
            getExternalWorkspacePath(bootstrap.menus[0].path),
        );
    }, [
        bootstrap,
        externalMenuPathFromPath,
        location.search,
        navigateWithParams,
        workspaceMode,
    ]);

    const setWorkspaceMode = useCallback(
        (nextMode: WorkspaceMode) => {
            if (nextMode === "external" && !allowed) {
                return;
            }
            const params = new URLSearchParams(location.search);
            if (nextMode === "external") {
                params.delete(WORKSPACE_QUERY_KEY);
                params.delete(EXTERNAL_PAGE_QUERY_KEY);
                navigateWithParams(params, false, getExternalWorkspacePath());
            } else {
                params.delete(WORKSPACE_QUERY_KEY);
                params.delete(EXTERNAL_PAGE_QUERY_KEY);
                navigateWithParams(
                    params,
                    false,
                    externalMenuPathFromPath !== null ? "/" : location.pathname,
                );
            }
        },
        [
            allowed,
            externalMenuPathFromPath,
            location.pathname,
            location.search,
            navigateWithParams,
        ],
    );

    const selectMenu = useCallback(
        (menuId: string) => {
            if (!allowed || !menuId) {
                return;
            }
            const params = new URLSearchParams(location.search);
            params.delete(WORKSPACE_QUERY_KEY);
            params.delete(EXTERNAL_PAGE_QUERY_KEY);
            const menu = bootstrap?.menus.find(({ id }) => id === menuId);
            if (!menu) {
                return;
            }
            navigateWithParams(params, false, getExternalWorkspacePath(menu.path));
        },
        [allowed, bootstrap, location.search, navigateWithParams],
    );

    const selectedMenu =
        bootstrap?.menus.find(({ path }) => path === requestedExternalPage) ??
        bootstrap?.menus[0];
    const selectedMenuId = selectedMenu?.id ?? "";
    const iframeUrl = selectedMenu?.url || bootstrap?.iframeUrl || "";

    return {
        allowed,
        bootstrap,
        bootstrapStatus,
        iframeUrl,
        loadBootstrap,
        permissionLoaded,
        selectedMenuId,
        selectMenu,
        setWorkspaceMode,
        shouldMountExternalWorkspace:
            allowed && (hasOpened || workspaceMode === "external"),
        workspaceMode,
    };
};
