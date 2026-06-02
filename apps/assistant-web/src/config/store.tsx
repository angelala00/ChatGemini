import { configureStore } from "@reduxjs/toolkit";
import { combineReducers } from "redux";
import { persistReducer, persistStore } from "redux-persist";
import sessions, { Sessions } from "../store/sessions";
import ai, { AI } from "../store/ai";
import mappings, { Mappings } from "../store/mappings";
import sessionExtensions, { SessionExtensions } from "../store/sessionsExtension";
import gpts, { PinnedGpts } from "../store/gpts";
import localForage from "localforage";

const mappingsPersistConfig = persistReducer(
    { storage: localForage, key: "mappings", whitelist: ["mappings"]},
    mappings
)

const sessionExtensionsPersistConfig = persistReducer(
    { storage: localForage, key: "sessionExtensions", whitelist: ["sessionExtensions"]},
    sessionExtensions
)

const reducer = combineReducers({
    ai,
    sessions,
    mappings: mappingsPersistConfig,
    sessionExtensions: sessionExtensionsPersistConfig,
    gpts,
});

const REDUX_STORE = configureStore({
    reducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }),
});

export const REDUX_PRESIST = persistStore(REDUX_STORE);
export type ReduxStore = ReturnType<typeof reducer>;
export interface ReduxStoreProps {
    readonly ai: ReturnType<typeof ai>;
    readonly sessions: ReturnType<typeof sessions>;
    readonly mappings: ReturnType<typeof mappings>;
    readonly sessionExtensions: ReturnType<typeof sessionExtensions>;
    readonly gpts: ReturnType<typeof gpts>;

    readonly updateAI: (ai: AI) => void;
    readonly updateSessions: (sessions: Sessions) => void;
    readonly updateMappings: (mappings: Mappings) => void;
    readonly updateSessionExtensions: (sessionExtensions: SessionExtensions) => void;
    readonly updateGpts?: (gpts: PinnedGpts) => void;
}
export default REDUX_STORE;
