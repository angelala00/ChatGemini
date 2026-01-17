import { getFullPath } from "./getDomainAndPath";

const metricsBase = "/api/platform/metrics";
const gatewayBase = "/api/platform/gateway";
const userBase = "/api/platform/user";

interface RequestOptions {
    params?: Record<string, string | number | (string | number)[] | undefined | null>;
    headers?: Record<string, string>;
    method?: string;
    body?: BodyInit | null;
    json?: unknown;
}

const buildUrl = (base: string, path: string, params?: RequestOptions["params"]) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    let url = `${base}${normalizedPath}`;
    if (params) {
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            if (Array.isArray(value)) {
                for (const entry of value) {
                    if (entry === undefined || entry === null) continue;
                    searchParams.append(key, String(entry));
                }
                continue;
            }
            searchParams.append(key, String(value));
        }
        const query = searchParams.toString();
        if (query) {
            url += `?${query}`;
        }
    }
    return url;
};

const request = async <T>(base: string, path: string, options?: RequestOptions): Promise<T> => {
    const url = getFullPath(buildUrl(base, path, options?.params));
    const headers: Record<string, string> = {
        Accept: "application/json",
        ...(options?.headers ?? {}),
    };

    let body: BodyInit | null | undefined = options?.body;
    if (options?.json !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(options.json);
    }

    const response = await fetch(url, {
        method: options?.method ?? "GET",
        headers,
        body,
        credentials: "include",
    });

    if (!response.ok) {
        let message: string | null = null;
        try {
            const errorPayload = await response.json();
            if (typeof errorPayload === "object" && errorPayload && "detail" in errorPayload) {
                message = String((errorPayload as Record<string, unknown>).detail);
            } else if (typeof errorPayload === "string") {
                message = errorPayload;
            } else {
                message = JSON.stringify(errorPayload);
            }
        } catch {
            message = await response.text();
        }
        throw new Error(message || `请求失败：${response.status}`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return (await response.json()) as T;
    }
    return (await response.text()) as unknown as T;
};

export const platformGatewayGet = <T>(path: string, options?: RequestOptions) =>
    request<T>(gatewayBase, path, options);

export const platformMetricsGet = <T>(path: string, options?: RequestOptions) =>
    request<T>(metricsBase, path, options);

export const platformUserGet = <T>(path: string, options?: RequestOptions) =>
    request<T>(userBase, path, options);

export const platformUserPatch = <T>(path: string, options?: RequestOptions) =>
    request<T>(userBase, path, { ...options, method: "PATCH" });
