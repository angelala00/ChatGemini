import { AttachmentViewItem } from "./getAttachmentViewItems";

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

const IMAGE_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "heic",
    "heif",
    "avif",
    "tif",
    "tiff",
]);

const isImageFilename = (filename?: string) => {
    if (!filename) {
        return false;
    }
    const extension = filename.split(".").pop()?.toLowerCase();
    return !!extension && IMAGE_EXTENSIONS.has(extension);
};

export const buildAttachmentPostscriptHtml = (
    items: AttachmentViewItem[],
    mimeType: string,
) => {
    if (!items.length) {
        return "";
    }

    const isImageItem = (filename?: string, totalCount = items.length) =>
        isImageFilename(filename) || (!filename && totalCount === 1 && mimeType.startsWith("image/"));

    const renderedItems = items
        .map(({ href, filename }, index) => {
            const resolvedFilename = filename || `文件附件 ${index + 1}`;
            if (isImageItem(filename)) {
                return `<a data-image-view="gallery" href="${href}" class="shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-100/80 no-underline shadow-sm" style="display:block;line-height:0;"><img src="${href}" style="display:block;max-width:5.4rem;max-height:5.4rem;object-fit:cover;margin:0;" alt="${escapeHtml(resolvedFilename)}" /></a>`;
            }
            return `<a href="${href}" target="_blank" rel="noreferrer" title="${escapeHtml(resolvedFilename)}" class="inline-flex shrink-0 self-end max-w-[13rem] items-start gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 no-underline shadow-sm hover:bg-stone-100"><span aria-hidden="true" class="inline-flex size-4 items-center justify-center text-[0.75rem] leading-none">📎</span><span style="display:block;min-width:0;max-width:10rem;overflow:hidden;text-overflow:ellipsis;white-space:normal;line-height:1.4;">${escapeHtml(resolvedFilename)}</span></a>`;
        })
        .join("");

    return `

<div class="not-prose mt-2 flex flex-wrap items-end gap-3">
${renderedItems}
</div>
`;
};
