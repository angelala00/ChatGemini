import { LazyExoticComponent, RefObject, lazy } from "react";
import { RouterMode } from "../components/RouterWrapper";
import { getBasePath } from "../helpers/getBasePath";

const Home = lazy(() => import("../views/Home"));
const HomeGPTsAssistant = lazy(() => import("../views/HomeGPTsAssistant"));
const Chat = lazy(() => import("../views/Chat"));
const Gpts = lazy(() => import("../views/Gpts"));
const MyGpts = lazy(() => import("../views/MyGpts"));
const CreateGpt = lazy(() => import("../views/CreateGpt"));
const NotFound = lazy(() => import("../views/NotFound"));

export type RouterProp<T> = Record<string, T>;

export interface RouterComponentProps {
    refs?: RouterProp<RefObject<HTMLElement>>;
    onAbortUpdate?: any;
    gid?: string;
    title?: string;
    logo?: string;
    subTitle?: string;
    samples?: string[];
    userName?: string;
}

export interface RouterConfigRoutes {
    readonly prefix: string;
    readonly uri: string;
    readonly suffix: string;
    readonly element: LazyExoticComponent<
        (props: RouterComponentProps) => JSX.Element
    >;
}

type RouterConfig = {
    readonly mode: RouterMode;
    readonly basename: string;
    readonly routes: Record<string, RouterConfigRoutes>;
};

export const routerConfig: RouterConfig = {
    basename: getBasePath() || "/",
    mode: "history",
    routes: {
        index: { prefix: "/", uri: "", suffix: "", element: Home },
        chat: { prefix: "/chat", uri: "/:id", suffix: "", element: Chat },
        gpts: { prefix: "/gpts", uri: "", suffix: "", element: Gpts },
        my_gpts: { prefix: "/my-gpts", uri: "", suffix: "", element: MyGpts },
        gpts_create: { prefix: "/gpts/create", uri: "", suffix: "", element: CreateGpt },
        g_index: { prefix: "/g/:gid", uri: "", suffix: "", element: HomeGPTsAssistant },
        g_chat: { prefix: "/g/:gid/chat", uri: "/:id", suffix: "", element: Chat },
        default: { prefix: "*", uri: "", suffix: "", element: NotFound },
    },
};
