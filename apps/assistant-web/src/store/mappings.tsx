import { createSlice } from "@reduxjs/toolkit";

export type Mappings = Record<string, string>;
export const initialMappings: Mappings = {};

const slice = createSlice({
    name: "mappings",
    initialState: { mappings: initialMappings },
    reducers: {
        onUpdate: (state, action) => {
            const { payload } = action;
            state.mappings = payload;
        },
    },
});

export default slice.reducer;
export const { onUpdate } = slice.actions;
