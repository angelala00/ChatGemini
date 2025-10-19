const env = Object.keys(process.env)
    .filter((key) => key.startsWith("REACT_APP_"))
    .reduce((env: Record<string, string | null>, key) => {
        env[key] = process.env[key] ?? null;
        return env;
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

const keys = env["REACT_APP_GEMINI_API_KEY"]
    ?.split("|")
    .map((v) => v.trim()) ?? [""];
// const passcodes =
//     env["REACT_APP_PASSCODE_MD5"]
//         ?.split("|")
//         .filter((v) => !!v.length)
//         .map((v) => v.trim().toLocaleLowerCase()) ?? [];
const passcodes = ["1d5d4f89d5d40221c56fc8c93e68dc4c", "passcode1"];

export const globalConfig = {
    passcodes,
    keys,
    title: {
        site: !!env["REACT_APP_TITLE_SITE"]?.length
            ? env["REACT_APP_TITLE_SITE"]
            : "大模型AI助手",
        header: !!env["REACT_APP_TITLE_HEADER"]?.length
            ? env["REACT_APP_TITLE_HEADER"]
            : "Chat",
    },
    api: env["REACT_APP_GEMINI_API_URL"],
    sse: env["REACT_APP_GEMINI_API_SSE"] === "false" ? false : true,
    difyappid: env["REACT_APP_NEXT_PUBLIC_APP_ID"],
    difyappurl: env["REACT_APP_NEXT_PUBLIC_API_URL"],
    aichat_backend: env["REACT_APP_NEXT_AICHAT_BACKEND_API_URL"],
    supportContact: !!env["REACT_APP_SUPPORT_CONTACT"]?.length
        ? env["REACT_APP_SUPPORT_CONTACT"]
        : "abcc",
    // domain: domain,
    // path: path,
};
