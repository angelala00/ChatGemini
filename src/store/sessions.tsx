import { createSlice } from "@reduxjs/toolkit";

export interface Attachment {
    readonly data: string;
    readonly mimeType: string;
}

export interface SessionHistory {
    readonly role: string;
    readonly parts: string;
    readonly timestamp: number;
    readonly attachment?: Attachment;
    readonly title?: string;
}
export type Sessions = Record<string, SessionHistory[]>;
export const initialSessions: Sessions = {};

const slice = createSlice({
    name: "sessions",
    initialState: { sessions: initialSessions },
    reducers: {
        onUpdate: (state, action) => {
            const { payload } = action;
            state.sessions = payload;
        },
    },
});

export default slice.reducer;
export const { onUpdate } = slice.actions;
