import { LazyExoticComponent, RefObject, lazy } from "react";
import { RouterMode } from "../components/RouterWrapper";
import { getBasePath } from "../helpers/getBasePath";

const Home = lazy(() => import("../views/Home"));
const HomeGPTsAssistant = lazy(() => import("../views/HomeGPTsAssistant"));
const Chat = lazy(() => import("../views/Chat"));
const GptAssistantChat = lazy(() => import("../views/GptAssistantChat"));
const TraceInspector = lazy(() => import("../views/TraceInspector"));
const VoiceLab = lazy(() => import("../views/VoiceLab"));
const AdminIndex = lazy(() => import("../views/AdminIndex"));
const AdminConfig = lazy(() => import("../views/AdminConfig"));
const Gpts = lazy(() => import("../views/Gpts"));
const MyGpts = lazy(() => import("../views/MyGpts"));
const CreateGpt = lazy(() => import("../views/CreateGpt"));
const Library = lazy(() => import("../views/Library"));
const LoginGateway = lazy(() => import("../views/LoginGateway"));
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
    onToggleSidebar?: () => void;
    sidebarExpand?: boolean;
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
        chat: { prefix: "/chat", uri: "/:id", suffix: "", element: GptAssistantChat },
        external_workspace: {
            prefix: "/deer",
            uri: "/*",
            suffix: "",
            element: Home,
        },
        trace: { prefix: "/trace", uri: "/:conversationId?", suffix: "", element: TraceInspector },
        voice_lab: { prefix: "/voice-lab", uri: "", suffix: "", element: VoiceLab },
        admin_index: { prefix: "/admin", uri: "", suffix: "", element: AdminIndex },
        admin: { prefix: "/admin/models", uri: "", suffix: "", element: AdminConfig },
        admin_gpts: { prefix: "/admin/gpts", uri: "", suffix: "", element: AdminConfig },
        admin_permissions: {
            prefix: "/admin/permissions",
            uri: "",
            suffix: "",
            element: AdminConfig,
        },
        admin_flags: { prefix: "/admin/flags", uri: "", suffix: "", element: AdminConfig },
        admin_audit: { prefix: "/admin/audit", uri: "", suffix: "", element: AdminConfig },
        gpts: { prefix: "/gpts", uri: "", suffix: "", element: Gpts },
        my_gpts: { prefix: "/my-gpts", uri: "", suffix: "", element: MyGpts },
        gpts_create: { prefix: "/gpts/create", uri: "", suffix: "", element: CreateGpt },
        library: { prefix: "/library", uri: "", suffix: "", element: Library },
        login: { prefix: "/login", uri: "", suffix: "", element: LoginGateway },
        g_index: { prefix: "/g/:gid", uri: "", suffix: "", element: HomeGPTsAssistant },
        g_chat: { prefix: "/g/:gid/chat", uri: "/:id", suffix: "", element: Chat },
        default: { prefix: "*", uri: "", suffix: "", element: NotFound },
    },
};
