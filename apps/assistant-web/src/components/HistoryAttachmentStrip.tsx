import { AttachmentViewItem } from "../helpers/getAttachmentViewItems";

interface HistoryAttachmentStripProps {
    readonly items: AttachmentViewItem[];
}

const resolveAttachmentPresentation = (filename?: string) => {
    const extension = filename?.includes(".")
        ? filename.split(".").pop()?.toLowerCase() ?? ""
        : "";

    if (["doc", "docx"].includes(extension)) {
        return { kindLabel: "Word", iconLabel: "W" };
    }
    if (["xls", "xlsx"].includes(extension)) {
        return { kindLabel: "Excel", iconLabel: "X" };
    }
    if (extension === "pdf") {
        return { kindLabel: "PDF", iconLabel: "P" };
    }
    if (extension === "py") {
        return { kindLabel: "Python", iconLabel: "P" };
    }
    if (["md", "markdown"].includes(extension)) {
        return { kindLabel: "Markdown", iconLabel: "M" };
    }
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension)) {
        return { kindLabel: "Image", iconLabel: "I" };
    }
    return { kindLabel: "文件", iconLabel: "F" };
};

export const HistoryAttachmentStrip = (props: HistoryAttachmentStripProps) => {
    const { items } = props;

    if (!items.length) {
        return null;
    }

    return (
        <div className="ml-auto flex w-full max-w-[680px] flex-col items-end gap-2.5 md:max-w-[min(72%,680px)]">
            {items.map((item) => {
                const filename = item.filename || "未命名文件";
                const { kindLabel, iconLabel } = resolveAttachmentPresentation(
                    item.filename,
                );

                return (
                    <a
                        key={item.fileId}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        title={filename}
                        className="group flex w-[288px] flex-none items-center gap-2.5 rounded-[13px] border border-[rgba(236,239,242,0.98)] bg-[rgba(247,249,251,0.98)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] transition-colors hover:bg-[rgba(250,252,253,0.98)]"
                    >
                        <div className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-[rgba(171,220,228,0.92)] bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] text-[14px] font-semibold text-white shadow-[0_4px_10px_rgba(63,170,194,0.1)]">
                            {iconLabel}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold leading-5 text-[#2f3a46]">
                                {filename}
                            </div>
                            <div className="truncate pt-0.5 text-[11px] leading-4 text-[#87919d]">
                                {kindLabel}
                            </div>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
