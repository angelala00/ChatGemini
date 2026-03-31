import { getFullPath } from "./getDomainAndPath";

export interface AttachmentViewItem {
    readonly fileId: string;
    readonly href: string;
    readonly filename?: string;
}

const filenameCache = new Map<string, Promise<string | undefined> | string | undefined>();

const loadFilename = (fileId: string): Promise<string | undefined> => {
    const existing = filenameCache.get(fileId);
    if (existing instanceof Promise) {
        return existing;
    }
    if (typeof existing === "string") {
        return Promise.resolve(existing);
    }

    const request = fetch(getFullPath(`/api/file_name/${fileId}`), {
        credentials: "include",
    })
        .then(async (response) => {
            if (!response.ok) {
                return undefined;
            }
            const data = await response.json();
            const filename =
                typeof data?.original_filename === "string" ? data.original_filename : undefined;
            filenameCache.set(fileId, filename);
            return filename;
        })
        .catch(() => {
            filenameCache.set(fileId, undefined);
            return undefined;
        });

    filenameCache.set(fileId, request);
    return request;
};

export const getAttachmentViewItems = (rawFileIds?: string): AttachmentViewItem[] => {
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
            filename:
                typeof filenameCache.get(fileId) === "string"
                    ? (filenameCache.get(fileId) as string)
                    : undefined,
        }));
};

export const resolveAttachmentViewItems = async (
    rawFileIds?: string,
): Promise<AttachmentViewItem[]> => {
    const items = getAttachmentViewItems(rawFileIds);
    if (!items.length) {
        return [];
    }

    return Promise.all(
        items.map(async (item) => ({
            ...item,
            filename: await loadFilename(item.fileId),
        })),
    );
};
