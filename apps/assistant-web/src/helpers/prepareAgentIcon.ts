const ALLOWED_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export const MAX_AGENT_ICON_INPUT_BYTES = 2 * 1024 * 1024;
export const MAX_AGENT_ICON_OUTPUT_BYTES = 100 * 1024;
export const AGENT_ICON_SIZE = 128;

export type AgentIconErrorReason = "type" | "size" | "processing";

export class AgentIconError extends Error {
    readonly reason: AgentIconErrorReason;

    constructor(reason: AgentIconErrorReason) {
        super(reason);
        this.reason = reason;
    }
}

const loadImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new AgentIconError("processing"));
        };
        image.src = objectUrl;
    });

const decodedDataUrlBytes = (dataUrl: string) => {
    const encoded = dataUrl.split(",", 2)[1] ?? "";
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((encoded.length * 3) / 4) - padding);
};

export const prepareAgentIcon = async (file: File) => {
    if (!ALLOWED_ICON_TYPES.has(file.type)) {
        throw new AgentIconError("type");
    }
    if (file.size > MAX_AGENT_ICON_INPUT_BYTES) {
        throw new AgentIconError("size");
    }

    const image = await loadImage(file);
    if (!image.naturalWidth || !image.naturalHeight) {
        throw new AgentIconError("processing");
    }

    const canvas = document.createElement("canvas");
    canvas.width = AGENT_ICON_SIZE;
    canvas.height = AGENT_ICON_SIZE;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new AgentIconError("processing");
    }

    const scale = Math.min(
        AGENT_ICON_SIZE / image.naturalWidth,
        AGENT_ICON_SIZE / image.naturalHeight,
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.clearRect(0, 0, AGENT_ICON_SIZE, AGENT_ICON_SIZE);
    context.drawImage(
        image,
        (AGENT_ICON_SIZE - width) / 2,
        (AGENT_ICON_SIZE - height) / 2,
        width,
        height,
    );

    let dataUrl = canvas.toDataURL("image/webp", 0.86);
    if (!dataUrl.startsWith("data:image/webp;base64,")) {
        dataUrl = canvas.toDataURL("image/png");
    }
    if (
        !/^data:image\/(?:png|webp);base64,/.test(dataUrl) ||
        decodedDataUrlBytes(dataUrl) > MAX_AGENT_ICON_OUTPUT_BYTES
    ) {
        throw new AgentIconError("processing");
    }
    return dataUrl;
};
