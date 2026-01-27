const metaEnv = import.meta.env as Record<string, string | undefined>;

const env = Object.keys(metaEnv)
    .filter((key) => key.startsWith("REACT_APP_"))
    .reduce((acc: Record<string, string | null>, key) => {
        acc[key] = metaEnv[key] ?? null;
        return acc;
    }, {});

if (!Object.keys(env).length) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/env.json", false);
    try {
        xhr.send();
        const data = JSON.parse(xhr.responseText);
        Object.assign(env, data);
    } catch (e) {
        Object.assign(env, {});
    }
}

export const globalConfig = {
    title: {
        site: !!env["REACT_APP_TITLE_SITE"]?.length
            ? env["REACT_APP_TITLE_SITE"]
            : "Platform",
        header: !!env["REACT_APP_TITLE_HEADER"]?.length
            ? env["REACT_APP_TITLE_HEADER"]
            : "Platform",
    },
};
