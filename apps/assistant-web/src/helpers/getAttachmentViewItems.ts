import { getFullPath } from "./getDomainAndPath";

export interface AttachmentViewItem {
    readonly fileId: string;
    readonly href: string;
    readonly filename?: string;
    readonly mimeType?: string;
    readonly status?: "loading" | "ready" | "missing";
}

const filenameCache = new Map<string, Promise<string | false> | string | false>();

const loadFilename = (fileId: string): Promise<string | false> => {
    const existing = filenameCache.get(fileId);
    if (existing instanceof Promise) {
        return existing;
    }
    if (typeof existing === "string") {
        return Promise.resolve(existing);
    }
    if (existing === false) {
        return Promise.resolve(false);
    }

    const request = fetch(getFullPath(`/api/file_name/${fileId}`), {
        credentials: "include",
    })
        .then(async (response) => {
            if (!response.ok) {
                filenameCache.set(fileId, false);
                return false;
            }
            const data = await response.json();
            const filename =
                typeof data?.original_filename === "string" && data.original_filename.trim()
                    ? data.original_filename
                    : false;
            filenameCache.set(fileId, filename);
            return filename;
        })
        .catch(() => {
            filenameCache.set(fileId, false);
            return false;
        });

    filenameCache.set(fileId, request);
    return request;
};

export const getAttachmentViewItems = (
    rawFileIds?: string,
    mimeType?: string,
): AttachmentViewItem[] => {
    if (!rawFileIds) {
        return [];
    }

    return rawFileIds
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((fileId) => ({
            fileId,
            href: getFullPath(`/api/file/${fileId}`),
            mimeType,
            filename:
                typeof filenameCache.get(fileId) === "string"
                    ? (filenameCache.get(fileId) as string)
                    : undefined,
            status:
                filenameCache.get(fileId) === false
                    ? "missing"
                    : typeof filenameCache.get(fileId) === "string"
                      ? "ready"
                      : "loading",
        }));
};

export const resolveAttachmentViewItems = async (
    rawFileIds?: string,
    mimeType?: string,
): Promise<AttachmentViewItem[]> => {
    const items = getAttachmentViewItems(rawFileIds, mimeType);
    if (!items.length) {
        return [];
    }

    return Promise.all(
        items.map(async (item) => {
            const filename = await loadFilename(item.fileId);
            return {
                ...item,
                filename: filename || undefined,
                status: filename ? "ready" : "missing",
            };
        }),
    );
};
