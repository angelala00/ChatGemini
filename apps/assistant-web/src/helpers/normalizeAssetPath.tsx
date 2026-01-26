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

    return path.startsWith("/") ? path : `/${path}`;
};
