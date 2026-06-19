import { getBasePath } from "./getBasePath";

export const getDomainAndPath = () => {
    return location.origin + getBasePath();
};

export const getFullPath = (path: string) => {
    if (location.port === "3000" || location.port === "3001" || location.port === "5173") {
        return `http://${location.hostname}:5008` + path;
    } else {
        return location.origin + joinPath(getBasePath(), path);
    }
};

function joinPath(basePath: string, path: string){
    if (!basePath) {
        return path.startsWith("/") ? path : `/${path}`;
    }
    if(basePath.endsWith('/') && path.startsWith('/')) {
        return basePath + path.slice(1);
    }
    if(!basePath.endsWith('/') && !path.startsWith('/')) {
        return `${basePath}/${path}`;
    }
    return basePath + path;
}
