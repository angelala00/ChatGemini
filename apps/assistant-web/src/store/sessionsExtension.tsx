import { createSlice } from "@reduxjs/toolkit";

export interface SessionExtension {
    readonly conversationId: string;
    readonly gid: string;
    readonly selectedModel: string;
    readonly reasoningEnabled?: boolean;
}
export type SessionExtensions = Record<string, SessionExtension>;
export const initialSessionExtensions: SessionExtensions = {};

const slice = createSlice({
    name: "SessionExtensions",
    initialState: { sessionExtensions: initialSessionExtensions },
    reducers: {
        onUpdate: (state, action) => {
            const { payload } = action;
            state.sessionExtensions = payload;
        },
    },
});

export default slice.reducer;
export const { onUpdate } = slice.actions;
