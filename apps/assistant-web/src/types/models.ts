export type UploadCategory = "document" | "image";

export interface ModelOption {
    id: string;
    name: string;
    description: string;
    uploadFileTypes?: UploadCategory[];
    supportsReasoning?: boolean;
    reasoningDefaultEnabled?: boolean;
}
