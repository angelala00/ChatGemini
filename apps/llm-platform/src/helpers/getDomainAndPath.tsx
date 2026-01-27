import { getBasePath } from "./getBasePath";

export const getDomainAndPath = () => {
    return location.origin + getBasePath();
};

export const getFullPath = (path: string) => {
    const apiOrigin = import.meta.env.VITE_API_ORIGIN as string | undefined;
    if (apiOrigin) {
        return apiOrigin.replace(/\/$/, "") + path;
    }
    return location.origin + joinPath(getBasePath(), path);
};

function joinPath(basePath: string, path: string) {
    if (!basePath) {
        return path.startsWith("/") ? path : `/${path}`;
    }
    if (basePath.endsWith("/") && path.startsWith("/")) {
        return basePath + path.slice(1);
    }
    if (!basePath.endsWith("/") && !path.startsWith("/")) {
        return `${basePath}/${path}`;
    }
    return basePath + path;
}
