export type WorkspaceMode = "native" | "external";

export interface ExternalAssistantMenuItem {
    readonly id: string;
    readonly label: string;
    readonly path: string;
    readonly url: string;
}

export interface ExternalAssistantBootstrap {
    readonly title: string;
    readonly iframeUrl: string;
    readonly menus: ExternalAssistantMenuItem[];
}

export type ExternalAssistantBootstrapStatus =
    | "idle"
    | "loading"
    | "ready"
    | "error";
