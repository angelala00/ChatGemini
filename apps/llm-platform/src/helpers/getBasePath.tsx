export const getBasePath = () => {
    const baseUrl = import.meta.env.BASE_URL ?? "/";

    if (baseUrl === "./" || baseUrl === "/") {
        return "";
    }

    return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};
