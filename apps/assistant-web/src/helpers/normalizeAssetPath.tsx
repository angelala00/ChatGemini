import { getBasePath } from "./getBasePath";

export const normalizeAssetPath = (path?: string) => {
    if (!path) {
        return "";
    }

    if (
        path.startsWith("http://") ||
        path.startsWith("https://") ||
        path.startsWith("data:") ||
        path.startsWith("blob:")
    ) {
        return path;
    }

    const normalizedBase = getBasePath();
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;

    if (normalizedBase && normalizedPath.startsWith(`${normalizedBase}/`)) {
        return normalizedPath;
    }

    return normalizedBase ? `${normalizedBase}${normalizedPath}` : normalizedPath;
};
