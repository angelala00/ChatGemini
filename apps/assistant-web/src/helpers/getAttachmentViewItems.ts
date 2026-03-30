import { getFullPath } from "./getDomainAndPath";

export interface AttachmentViewItem {
    readonly fileId: string;
    readonly href: string;
}

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
        }));
};
