export interface SessionSummary {
    readonly conversation_id: string;
    readonly user_id: string;
    readonly user_email: string;
    readonly gid: string;
    readonly title: string;
    readonly created_at: string;
    readonly updated_at: string;
    readonly source?: "server" | "local_fallback";
}
