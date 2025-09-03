import { createSlice } from "@reduxjs/toolkit";

export interface PinnedGpt {
    readonly id: string;
    readonly name: string;
}

export type PinnedGpts = PinnedGpt[];

export const initialPinnedGpts: PinnedGpts = [];

const slice = createSlice({
    name: "gpts",
    initialState: { pinned: initialPinnedGpts },
    reducers: {
        onUpdate: (state, action) => {
            state.pinned = action.payload;
        },
    },
});

export default slice.reducer;
export const { onUpdate } = slice.actions;
