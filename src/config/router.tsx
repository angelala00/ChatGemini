import { LazyExoticComponent, RefObject, lazy } from "react";
import { RouterMode } from "../components/RouterWrapper";
import { LandingSample } from "../components/Landing";

const Home = lazy(() => import("../views/Home"));
const HomeGPTsAssistant = lazy(() => import("../views/HomeGPTsAssistant"));
const Chat = lazy(() => import("../views/Chat"));
const Gpts = lazy(() => import("../views/Gpts"));
const NotFound = lazy(() => import("../views/NotFound"));

export type RouterProp<T> = Record<string, T>;

export interface RouterComponentProps {
    refs?: RouterProp<RefObject<HTMLElement>>;
    onAbortUpdate?: any;
    gid?: string;
    title?: string;
    logo?: string;
    subTitle?: string;
    samples?: LandingSample[];
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
    basename: "/",
    mode: "hash",
    routes: {
        index: { prefix: "/", uri: "", suffix: "", element: Home },
        chat: { prefix: "/chat", uri: "/:id", suffix: "", element: Chat },
        gpts: { prefix: "/gpts", uri: "", suffix: "", element: Gpts },
        g_index: { prefix: "/g/:gid", uri: "", suffix: "", element: HomeGPTsAssistant },
        g_chat: { prefix: "/g/:gid/chat", uri: "", suffix: "", element: Chat },
        default: { prefix: "*", uri: "", suffix: "", element: NotFound },
    },
};
