import exportIcon from "../assets/icons/file-export-solid-white.svg"
import deleteIcon from "../assets/icons/trash-can-solid.svg";
import renameIcon from "../assets/icons/file-pen-solid.svg";
import submitIcon from "../assets/icons/circle-check-solid.svg";
import emptyIcon from "../assets/icons/folder-open-solid.svg";
import moreIcon from "../assets/icons/ellipsis-solid.svg";
import regulationIcon from "../assets/icons/zhidu_logo.svg";
import wandIcon from "../assets/icons/ds-logo.svg";
import logoIcon from "../assets/logo.svg";
import editIcon from "../assets/icons/pen-to-square-solid.svg";
import appsIcon from "../assets/icons/apps.svg";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { Sessions } from "../store/sessions";
import { useTranslation } from "react-i18next";
import { ReduxStoreProps } from "../config/store";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { handleRequest } from "../helpers/handleRequest";
import { getFullPath } from "../helpers/getDomainAndPath";
import { globalConfig } from "../config/global";

interface SidebarProps {
    readonly title: string;
    readonly expand: boolean;
    readonly limitation?: number;
    readonly sessions: Sessions;
    readonly locales: Record<string, string>;
    readonly currentLocale: string;
    readonly onDeleteSession: (id: string) => void;
    readonly onExportSession: (id: string) => void;
    readonly onSwitchLocale: (locale: string) => void;
    readonly onRenameSession: (id: string, newTitle: string) => void;
}

export const Sidebar = (props: SidebarProps) => {
    const { t } = useTranslation();
    const {
        title,
        expand,
        limitation,
        sessions,
        locales,
        currentLocale,
        onDeleteSession,
        onExportSession,
        onSwitchLocale,
        onRenameSession,
    } = props;
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const pinnedGpts = useSelector(
        (state: ReduxStoreProps) => state.gpts.pinned
    );
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    const [renamingChatTitle, setRenamingChatTitle] = useState<{
        id: string;
        title: string;
    }>({ id: "", title: "" });
    const [sessionsLimitation, setSessionsLimitation] = useState(
        limitation ?? 15
    );
    const [sessionsCategory, setSessionsCategory] = useState<{
        [id: string]: {
            label?: string;
            sessions?: Sessions;
        };
    }>({});

    // const [pinnedGpts, setPinnedGpts] = useState([]);
    const getCategorizedSessions = (
        sessions: Sessions,
        filter: (value: number, index: number, array: number[]) => boolean
    ) =>
        Object.keys(sessions)
            .sort((a, b) => {
                const a_ts = sessions[a][sessions[a].length - 1].timestamp;
                const b_ts = sessions[b][sessions[b].length - 1].timestamp;
                return b_ts - a_ts;
            })
            .map((key) => parseInt(key))
            .filter(filter)
            .map((key) => {
                return { [key.toString()]: sessions[key] };
            })
            .reduce((prev, curr) => {
                return { ...prev, ...curr };
            }, {});

    const isTimestampToday = (ts: number) =>
        new Date(ts).toLocaleDateString() === new Date().toLocaleDateString();

    const isTimestampYesterday = (ts: number) =>
        new Date(ts).toLocaleDateString() ===
        new Date(
            new Date().setDate(new Date().getDate() - 1)
        ).toLocaleDateString();

    const isTimestampEarlier = (ts: number) =>
        new Date(ts).toLocaleDateString() !== new Date().toLocaleDateString() &&
        new Date(ts).toLocaleDateString() !==
            new Date(
                new Date().setDate(new Date().getDate() - 1)
            ).toLocaleDateString();

    useEffect(() => {
        handleRequest('GET', getFullPath('/api/gpts/pined') ).then(response_json => {
            // console.log("1111:"+response_json)
            // setPinnedGpts(response_json)
            dispatch(updatePinnedGpts(response_json ?? []));
        });
    }, [dispatch]);
        
    useEffect(() => {
        const today = getCategorizedSessions(sessions, isTimestampToday);
        const yesterday = getCategorizedSessions(
            sessions,
            isTimestampYesterday
        );
        const earlier = getCategorizedSessions(sessions, isTimestampEarlier);
        setSessionsCategory({
            today: {
                sessions: today,
                label: t("components.Sidebar.today_label"),
            },
            yesterday: {
                sessions: yesterday,
                label: t("components.Sidebar.yesterday_label"),
            },
            earlier: {
                sessions: earlier,
                label: t("components.Sidebar.earlier_label"),
            },
        });
    }, [t, sessions]);

    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions
    )
    return (
        <nav
            className={`bg-slate-900 flex flex-col h-screen overflow-hidden ${
                expand ? "block" : "hidden"
            }`}
        >
            <div className="sticky top-0 bg-slate-900">
                <div className="py-4 flex justify-center items-center font-semibold text-gray-100 border-b border-gray-400">
                    <img src={logoIcon} className="w-8 h-8 object-contain"/>
                </div>
                <div
                    className="p-2 mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                    onClick={() => {
                        navigate("/")
                    }}
                >
                    <img src={editIcon} className="w-8 h-8 object-contain"/>
                    {t("components.Sidebar.new_chat")}
                </div>
                <div
                    className="p-1 mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                    onClick={() => {
                        navigate("/gpts")
                    }}
                >
                    <img src={appsIcon} className="w-8 h-8 object-contain"/>
                    {t("components.Sidebar.gpts")}
                </div>
            </div>
            <div className="flex-1 overflow-auto min-h-0">
            {pinnedGpts.map(({ gid, name, logo }, index) => {
                console.log
                if (gid === "gptassistant") {
                    return
                }
                return (
                    <div
                        key={gid}
                        className="mx-3 my-1 py-1 text-sm text-center text-gray-200 hover:bg-slate-600 transition-all rounded-lg cursor-pointer flex items-center justify-start gap-2"
                        onClick={() => {
                            navigate("/g/"+gid)
                        }}
                    >
                        <img src={logo ? logo : regulationIcon} className="w-9 h-9 object-contain"/>
                        {name}
                    </div>
                )
            })}
            <div className="flex flex-col space-y-2 p-2 mb-auto">
                {Object.keys(sessionsCategory).map((key, index, arr) => {
                    const currentLabel = sessionsCategory[key].label;
                    const currentSessions =
                        sessionsCategory[key].sessions ?? {};
                    const currentSessionsKeys = Object.keys(currentSessions);
                    const isEnablePagination = index === arr.length - 1;
                    const isEmpty = !currentSessionsKeys.length;

                    return (
                        !isEmpty && (
                            <div key={index}>
                                <h3 className="text-gray-500 text-xs py-1">
                                    {currentLabel}
                                </h3>
                                {currentSessionsKeys
                                    .slice(
                                        0,
                                        isEnablePagination
                                            ? sessionsLimitation
                                            : currentSessionsKeys.length
                                    )
                                    .map((id, _index) => {
                                        const currentSession =
                                            currentSessions[id][0];
                                        const currentSessionTitle =
                                            !!currentSession?.title?.length
                                                ? currentSession.title
                                                : currentSession.parts;
                                        let path;
                                        const sessionExtension = sessionExtensions[id];
                                        if (sessionExtension && sessionExtension["gid"]) {
                                            path = `/g/${sessionExtension["gid"]}/chat/${id}`
                                        } else {
                                            path = `/chat/${id}`
                                        }
                                        return (
                                            <div
                                                key={_index}
                                                className="group relative flex rounded-lg items-center justify-between p-2 text-gray-200 hover:bg-slate-600 transition-all space-x-2"
                                                onMouseLeave={() =>
                                                    setActiveMenu(null)
                                                }
                                            >
                                                <Link
                                                    className={`flex-1 text-sm text-left truncate ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? "hidden"
                                                            : ""
                                                    }`}
                                                    to={`${path}`}
                                                >
                                                    {currentSessionTitle}
                                                </Link>
                                                <input
                                                    defaultValue={
                                                        currentSessionTitle
                                                    }
                                                    className={`flex-1 w-full bg-transparent text-sm ${
                                                        renamingChatTitle.id ===
                                                        id
                                                            ? ""
                                                            : "hidden"
                                                    }`}
                                                    onChange={({ target }) =>
                                                        setRenamingChatTitle(
                                                            (prev) => ({
                                                                ...prev,
                                                                title: target.value,
                                                            })
                                                        )
                                                    }
                                                />
                                                {renamingChatTitle.id !== id && (
                                                    <>
                                                        <div
                                                            className={`space-x-2 ${
                                                                activeMenu === id
                                                                    ? "flex"
                                                                    : "hidden"
                                                            }`}
                                                        >
                                                            <img
                                                                className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                                src={renameIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setRenamingChatTitle({
                                                                        id,
                                                                        title: currentSessionTitle,
                                                                    });
                                                                    setActiveMenu(null);
                                                                }}
                                                            />
                                                            <img
                                                                className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                                src={exportIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setActiveMenu(null);
                                                                    onExportSession(id);
                                                                }}
                                                            />
                                                            <img
                                                                className="cursor-pointer size-3 hover:scale-125 transition-all"
                                                                src={deleteIcon}
                                                                alt=""
                                                                onClick={() => {
                                                                    setActiveMenu(null);
                                                                    onDeleteSession(id);
                                                                }}
                                                            />
                                                        </div>
                                                        <img
                                                            className={`cursor-pointer size-3 hover:scale-125 transition-all invisible group-hover:visible ${
                                                                activeMenu === id
                                                                    ? "hidden"
                                                                    : ""
                                                            }`}
                                                            src={moreIcon}
                                                            alt=""
                                                            onClick={() =>
                                                                setActiveMenu(id)
                                                            }
                                                        />
                                                    </>
                                                )}
                                                {renamingChatTitle.id === id && (
                                                    <img
                                                        className="cursor-pointer text-xs size-3 hover:scale-125 transition-all"
                                                        src={submitIcon}
                                                        alt=""
                                                        onClick={() => {
                                                            const { title } =
                                                                renamingChatTitle;
                                                            if (
                                                                !!title.length &&
                                                                renamingChatTitle.title !==
                                                                    currentSessionTitle
                                                            ) {
                                                                onRenameSession(
                                                                    id,
                                                                    title
                                                                );
                                                            }
                                                            setRenamingChatTitle({
                                                                id: "",
                                                                title: "",
                                                            });
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                {isEnablePagination &&
                                    currentSessionsKeys.length >
                                        sessionsLimitation && (
                                        <div className="text-center m-2">
                                            <button
                                                className="font-semibold text-gray-400 hover:text-gray-200 text-sm transition-all"
                                                onClick={() =>
                                                    setSessionsLimitation(
                                                        (state) => state + 5
                                                    )
                                                }
                                            >
                                                {t(
                                                    "components.Sidebar.load_more"
                                                )}
                                            </button>
                                        </div>
                                    )}
                            </div>
                        )
                    );
                })}
            </div>
            {Object.values(sessionsCategory)
                .map(({ sessions }) => sessions ?? {})
                .every((sessions) => !Object.keys(sessions).length) && (
                <div className="p-2 text-center text-gray-300/50 mb-[calc(50vh-4rem)] flex flex-col gap-4">
                    <img src={emptyIcon} alt="" className="mx-auto size-10" />
                    {t("components.Sidebar.no_history_chat")}
                </div>
            )}
            </div>
            <div className="sticky bottom-0 bg-slate-900 py-1 flex justify-center items-center text-xs text-gray-100 border-gray-400 border-t">
                技术支持@{globalConfig.supportContact}
            </div>
        </nav>
    );
};
