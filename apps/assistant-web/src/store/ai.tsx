import { createSlice } from "@reduxjs/toolkit";

export interface AI {
    readonly busy: boolean;
}

export const initialAI: AI = { busy: false };

const slice = createSlice({
    name: "ai",
    initialState: { ai: initialAI },
    reducers: {
        onUpdate: (state, action) => {
            const { payload } = action;
            state.ai = payload;
        },
    },
});

export default slice.reducer;
export const { onUpdate } = slice.actions;
