import { AttachmentViewItem } from "./getAttachmentViewItems";

const escapeHtml = (value: string) =>
    value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

export const buildAttachmentPostscriptHtml = (
    items: AttachmentViewItem[],
    mimeType: string,
) => {
    if (!items.length) {
        return "";
    }

    const isImageAttachment = mimeType.startsWith("image/");

    if (isImageAttachment) {
        return `

<div class="not-prose mt-2 inline-flex flex-wrap gap-3">
${items
    .map(
        ({ href }, index) =>
            `<a data-image-view="gallery" href="${href}" class="block overflow-hidden rounded-2xl border border-stone-200 bg-stone-100/80 no-underline shadow-sm" style="display:block;line-height:0;"><img src="${href}" style="display:block;max-width:11rem;max-height:11rem;object-fit:cover;margin:0;" alt="附件图片 ${index + 1}" /></a>`,
    )
    .join("")}
</div>
`;
    }

    return `

<div class="not-prose mt-2 flex flex-col gap-2">
${items
    .map(
        ({ href, filename }, index) =>
            `<a href="${href}" target="_blank" rel="noreferrer" title="${escapeHtml(filename || `文件附件 ${index + 1}`)}" class="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700 no-underline shadow-sm hover:bg-stone-100"><span aria-hidden="true" style="font-size:1rem;line-height:1;">📎</span><span style="display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:13rem;">${escapeHtml(filename || `文件附件 ${index + 1}`)}</span></a>`,
    )
    .join("")}
</div>
`;
};
