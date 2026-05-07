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
        <div className="flex w-full max-w-[680px] flex-col gap-2.5 md:max-w-[min(72%,680px)]">
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
                        className="group flex items-center gap-3 rounded-[16px] border border-[rgba(231,236,240,0.98)] bg-white px-4 py-3 text-left shadow-[0_8px_20px_rgba(23,28,38,0.03)] transition-colors hover:bg-[rgba(250,252,253,0.98)]"
                    >
                        <div className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[rgba(243,246,248,0.98)] text-[14px] font-semibold text-[#66717d]">
                            {iconLabel}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-[14px] font-semibold leading-5 text-[#2f3a46]">
                                {filename}
                            </div>
                            <div className="pt-0.5 text-[12px] leading-4 text-[#87919d]">
                                {kindLabel}
                            </div>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
