interface GptEntryTarget {
    readonly gid: string;
    readonly assistant_kind?: string;
    readonly redirect_path?: string;
}

const SAFE_REDIRECT_PATH = /^[A-Za-z0-9][A-Za-z0-9._~-]*(\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;

export const normalizeGptRedirectPath = (value?: string) => {
    const normalized = value?.trim().replace(/^\/+|\/+$/g, "") ?? "";
    if (
        !SAFE_REDIRECT_PATH.test(normalized) ||
        normalized.split("/").some((segment) => segment === "." || segment === "..")
    ) {
        return "";
    }
    return normalized;
};

export const openGptEntry = (
    target: GptEntryTarget,
    navigate: (path: string) => void,
) => {
    const redirectPath = normalizeGptRedirectPath(target.redirect_path);
    if (
        target.assistant_kind === "path_redirect" &&
        redirectPath
    ) {
        window.location.assign(`${window.location.origin}/${redirectPath}`);
        return;
    }
    navigate(`/g/${target.gid}`);
};
