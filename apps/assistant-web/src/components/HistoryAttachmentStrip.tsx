import { AttachmentViewItem } from "../helpers/getAttachmentViewItems";

interface HistoryAttachmentStripProps {
    readonly items: AttachmentViewItem[];
}

const resolveAttachmentPresentation = (filename?: string, mimeType?: string) => {
    const extension = filename?.includes(".")
        ? filename.split(".").pop()?.toLowerCase() ?? ""
        : "";
    const normalizedMimeType = mimeType?.toLowerCase() ?? "";

    if (["doc", "docx"].includes(extension)) {
        return {
            kindLabel: "Word",
            iconLabel: "W",
            iconClassName:
                "border-[rgba(174,198,255,0.96)] bg-[linear-gradient(180deg,#5D8FFF,#2F6BE6)] shadow-[0_4px_10px_rgba(47,107,230,0.18)]",
        };
    }
    if (["xls", "xlsx", "csv"].includes(extension)) {
        return {
            kindLabel: extension === "csv" ? "CSV" : "Excel",
            iconLabel: extension === "csv" ? "C" : "X",
            iconClassName:
                "border-[rgba(174,223,191,0.96)] bg-[linear-gradient(180deg,#58B874,#23844A)] shadow-[0_4px_10px_rgba(35,132,74,0.18)]",
        };
    }
    if (extension === "pdf") {
        return {
            kindLabel: "PDF",
            iconLabel: "P",
            iconClassName:
                "border-[rgba(248,186,186,0.96)] bg-[linear-gradient(180deg,#F27777,#D84545)] shadow-[0_4px_10px_rgba(216,69,69,0.18)]",
        };
    }
    if (extension === "py") {
        return {
            kindLabel: "Python",
            iconLabel: "P",
            iconClassName:
                "border-[rgba(189,207,247,0.96)] bg-[linear-gradient(180deg,#6D96F2,#3E6EDB)] shadow-[0_4px_10px_rgba(62,110,219,0.17)]",
        };
    }
    if (extension === "txt") {
        return {
            kindLabel: "Text",
            iconLabel: "T",
            iconClassName:
                "border-[rgba(203,210,222,0.96)] bg-[linear-gradient(180deg,#8D97A8,#667184)] shadow-[0_4px_10px_rgba(102,113,132,0.16)]",
        };
    }
    if (["md", "markdown"].includes(extension)) {
        return {
            kindLabel: "Markdown",
            iconLabel: "M",
            iconClassName:
                "border-[rgba(203,210,222,0.96)] bg-[linear-gradient(180deg,#8D97A8,#667184)] shadow-[0_4px_10px_rgba(102,113,132,0.16)]",
        };
    }
    if (["ppt", "pptx"].includes(extension)) {
        return {
            kindLabel: "PPT",
            iconLabel: "P",
            iconClassName:
                "border-[rgba(248,205,173,0.96)] bg-[linear-gradient(180deg,#F4A261,#E26A2D)] shadow-[0_4px_10px_rgba(226,106,45,0.18)]",
        };
    }
    if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension)) {
        return {
            kindLabel: "Image",
            iconLabel: "I",
            iconClassName:
                "border-[rgba(171,220,228,0.92)] bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] shadow-[0_4px_10px_rgba(63,170,194,0.1)]",
        };
    }
    if (normalizedMimeType.startsWith("image/")) {
        return {
            kindLabel: "Image",
            iconLabel: "I",
            iconClassName:
                "border-[rgba(171,220,228,0.92)] bg-[linear-gradient(180deg,oklch(71%_0.113_201),oklch(63%_0.121_209))] shadow-[0_4px_10px_rgba(63,170,194,0.1)]",
        };
    }
    return {
        kindLabel: "文件",
        iconLabel: "F",
        iconClassName:
            "border-[rgba(191,214,218,0.92)] bg-[linear-gradient(180deg,#75C8D2,#43A9C1)] shadow-[0_4px_10px_rgba(67,169,193,0.12)]",
    };
};

const attachmentIconBaseClassName =
    "grid size-8 shrink-0 place-items-center rounded-[10px] border text-[14px] font-semibold text-white";

const attachmentIconClassName = (toneClassName: string) =>
    `${attachmentIconBaseClassName} ${toneClassName}`;

const isImageAttachment = (filename?: string) => {
    const extension = filename?.includes(".")
        ? filename.split(".").pop()?.toLowerCase() ?? ""
        : "";
    return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(extension);
};

const shortFileId = (fileId: string) =>
    fileId.length > 12 ? `${fileId.slice(0, 8)}...${fileId.slice(-4)}` : fileId;

export const HistoryAttachmentStrip = (props: HistoryAttachmentStripProps) => {
    const { items } = props;

    if (!items.length) {
        return null;
    }

    return (
        <div className="ml-auto flex w-full max-w-[680px] flex-wrap justify-end gap-2.5 md:max-w-[min(72%,680px)]">
            {items.map((item) => {
                const isMissing = item.status === "missing";
                const filename = item.filename || (isMissing ? `历史附件 ${shortFileId(item.fileId)}` : "附件信息加载中");
                const { kindLabel, iconLabel, iconClassName } = resolveAttachmentPresentation(
                    item.filename,
                    item.mimeType,
                );
                const subtitle = isMissing ? "文件暂不可用" : kindLabel;

                if (isMissing) {
                    return (
                        <div
                            key={item.fileId}
                            title="历史附件文件暂不可用，可能尚未迁移旧文件存储"
                            className="group flex w-[288px] flex-none items-center gap-2.5 rounded-[13px] border border-dashed border-[rgba(214,220,226,0.98)] bg-[rgba(247,249,251,0.82)] px-3 py-2.5 text-left text-[#697480]"
                        >
                            <div className={attachmentIconClassName(iconClassName)}>
                                {iconLabel}
                            </div>
                            <div className="min-w-0">
                                <div className="truncate text-[13px] font-semibold leading-5 text-[#56616d]">
                                    {filename}
                                </div>
                                <div className="truncate pt-0.5 text-[11px] leading-4 text-[#9aa3ad]">
                                    {subtitle}
                                </div>
                            </div>
                        </div>
                    );
                }

                if (isImageAttachment(item.filename)) {
                    return (
                        <a
                            key={item.fileId}
                            data-image-view="gallery"
                            href={item.href}
                            title={filename}
                            className="group overflow-hidden rounded-[18px] border border-[rgba(236,239,242,0.98)] bg-[rgba(247,249,251,0.98)] shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] transition-transform hover:-translate-y-px"
                        >
                            <img
                                src={item.href}
                                alt={filename}
                                className="block h-[108px] w-[108px] object-cover"
                            />
                        </a>
                    );
                }

                return (
                    <a
                        key={item.fileId}
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        title={filename}
                        className="group flex w-[288px] flex-none items-center gap-2.5 rounded-[13px] border border-[rgba(236,239,242,0.98)] bg-[rgba(247,249,251,0.98)] px-3 py-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.94)] transition-colors hover:bg-[rgba(250,252,253,0.98)]"
                    >
                        <div className={attachmentIconClassName(iconClassName)}>
                            {iconLabel}
                        </div>
                        <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold leading-5 text-[#2f3a46]">
                                {filename}
                            </div>
                            <div className="truncate pt-0.5 text-[11px] leading-4 text-[#87919d]">
                                {subtitle}
                            </div>
                        </div>
                    </a>
                );
            })}
        </div>
    );
};
