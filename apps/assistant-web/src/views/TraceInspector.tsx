import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { getFullPath } from "../helpers/getDomainAndPath";
import { ReduxStoreProps } from "../config/store";

type TraceSummary = {
    id: string;
    conversation_id: string | null;
    user_id: string;
    user_email: string | null;
    gid: string | null;
    route: string | null;
    requested_model: string | null;
    selected_model: string | null;
    reasoning_enabled: boolean | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    duration_ms: number | null;
    query: string | null;
    file_ids: string | null;
    detail_count: number;
    response_preview: string | null;
};

type TraceEvent = {
    seq: number;
    event_type: string;
    occurred_at: string;
    payload: unknown;
};

type TraceTurnGroup = {
    key: string;
    label: string;
    turnNumber: number | null;
    isPrelude: boolean;
    summary: string;
    totalCount: number;
    rawEvents: TraceEvent[];
    items: TraceTurnItem[];
};

type DisplayedTurnGroup = TraceTurnGroup & {
    matchedCount: number;
};

type TraceTurnItem =
    | {
          key: string;
          kind: "event";
          event: TraceEvent;
          matchedCount: number;
      }
    | {
          key: string;
          kind: "generation";
          events: TraceEvent[];
          matchedCount: number;
          textBlocks: TraceStreamBlockItem[];
          otherEvents: TraceEvent[];
      };

type TraceStreamFamily = "text" | "thinking" | "toolcall";

type TraceStreamBlockItem = {
    key: string;
    kind: "stream";
    family: TraceStreamFamily;
    title: string;
    subtitle: string;
    events: TraceEvent[];
    mergedText: string;
    matchedCount: number;
    deltaBlock: TraceDeltaBlockItem | null;
};

type TraceDeltaBlockItem = {
    key: string;
    kind: "delta";
    family: TraceStreamFamily;
    title: string;
    subtitle: string;
    events: TraceEvent[];
    mergedText: string;
          matchedCount: number;
      };

type TraceListResponse = {
    enabled: boolean;
    items: TraceSummary[];
};

type TraceDetailResponse = {
    enabled: boolean;
    trace: TraceSummary & {
        system_prompt: string | null;
        request_json: unknown;
    };
    events: TraceEvent[];
};

const prettyJson = (value: unknown) => {
    if (value === undefined) {
        return "";
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch (_error) {
        return String(value);
    }
};

const EVENT_PAYLOAD_BOX_CLASS = "relative mt-3 rounded-xl border border-slate-800 bg-slate-950";
const EVENT_PAYLOAD_PRE_COLLAPSED_CLASS =
    "max-h-[12.5rem] overflow-y-auto whitespace-pre-wrap break-words p-3 pr-16 text-[12px] leading-6 text-slate-200";
const EVENT_PAYLOAD_PRE_EXPANDED_CLASS =
    "whitespace-pre-wrap break-words p-3 pr-16 text-[12px] leading-6 text-slate-200";

const stringifyForSearch = (value: unknown) => {
    if (value === undefined || value === null) {
        return "";
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch (_error) {
        return String(value);
    }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
};

const getEventTypeLabel = (eventType: string) => {
    const normalized = eventType.toLowerCase();
    const labelMap: Record<string, string> = {
        "request.received": "请求已接收",
        "request.prepared": "请求已准备",
        "model_input.prepared": "模型输入准备",
        "turn.start": "本轮开始",
        "start": "模型输出开始",
        "done": "模型输出结束",
        "response_complete": "本轮结束",
        "preprocess_start": "附件预处理开始",
        "preprocess_complete": "附件预处理完成",
        "text_start": "文本块开始",
        "text_delta": "文本增量",
        "text_end": "文本块完成",
        "thinking_start": "思考块开始",
        "thinking_delta": "思考增量",
        "thinking_end": "思考块完成",
        "toolcall_start": "模型开始输出工具调用",
        "toolcall_delta": "工具调用参数增量",
        "toolcall_end": "模型输出工具调用完成",
        "tool.call": "开始执行工具",
        "tool.result": "工具执行结果返回",
        "tool_result": "工具执行结果返回",
    };

    return labelMap[normalized] ?? eventType;
};

const getEventTurnNumber = (event: TraceEvent) => {
    const payload = toRecord(event.payload);
    if (!payload) {
        return null;
    }
    const rawTurn = payload.turn;
    if (typeof rawTurn === "number" && Number.isFinite(rawTurn)) {
        return rawTurn;
    }
    if (typeof rawTurn === "string") {
        const parsedTurn = Number(rawTurn);
        if (Number.isFinite(parsedTurn)) {
            return parsedTurn;
        }
    }
    return null;
};

const getTurnSummary = (payload: Record<string, unknown> | null) => {
    if (!payload) {
        return "";
    }
    const messages = Array.isArray(payload.messages) ? payload.messages.length : null;
    const tools = Array.isArray(payload.tools) ? payload.tools.length : null;
    const parts: string[] = [];
    if (messages !== null) {
        parts.push(`${messages} 条 messages`);
    }
    if (tools !== null) {
        parts.push(`${tools} 个 tools`);
    }
    return parts.join(" · ");
};

const getEventSearchText = (event: TraceEvent) => {
    return [
        event.event_type,
        getEventTypeLabel(event.event_type),
        event.occurred_at,
        String(event.seq),
        stringifyForSearch(event.payload),
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
};

const getStreamFamily = (eventType: string): TraceStreamFamily | null => {
    const normalized = eventType.toLowerCase();
    if (normalized.startsWith("text_")) {
        return "text";
    }
    if (normalized.startsWith("thinking_")) {
        return "thinking";
    }
    if (normalized.startsWith("toolcall_")) {
        return "toolcall";
    }
    return null;
};

const getStreamFamilyLabel = (family: TraceStreamFamily) => {
    switch (family) {
        case "text":
            return "文本输出";
        case "thinking":
            return "思考输出";
        case "toolcall":
            return "工具调用";
    }
};

const getStreamDeltaLabel = (family: TraceStreamFamily) => {
    switch (family) {
        case "text":
            return "文本增量";
        case "thinking":
            return "思考增量";
        case "toolcall":
            return "工具调用参数增量";
    }
};

const getGenerationEventText = (event: TraceEvent) => {
    const payload = toRecord(event.payload);
    const delta = payload?.delta;
    if (typeof delta === "string") {
        return delta;
    }
    const content = payload?.content;
    if (typeof content === "string") {
        return content;
    }
    const toolCall = payload?.tool_call;
    if (toolCall !== undefined) {
        return prettyJson(toolCall);
    }
    return stringifyForSearch(event.payload);
};

const getMergedBlockText = (events: TraceEvent[]) => {
    return events
        .map((event) => {
            const eventType = event.event_type.toLowerCase();
            if (
                eventType === "start" ||
                eventType === "done" ||
                eventType.endsWith("_start") ||
                eventType.endsWith("_end")
            ) {
                return "";
            }
            return getGenerationEventText(event);
        })
        .join("");
};

const buildStreamDeltaBlock = (family: TraceStreamFamily, events: TraceEvent[]): TraceDeltaBlockItem | null => {
    if (!events.length) {
        return null;
    }
    const startEvent = events[0];
    const endEvent = events[events.length - 1];
    return {
        key: `delta-${family}-${startEvent.seq}-${endEvent.seq}`,
        kind: "delta",
        family,
        title: getStreamDeltaLabel(family),
        subtitle: `${events.length} 条原始事件 · ${startEvent.seq} - ${endEvent.seq}`,
        events,
        mergedText: getMergedBlockText(events),
        matchedCount: events.length,
    };
};

const buildStreamBlock = (family: TraceStreamFamily, events: TraceEvent[]): TraceStreamBlockItem | null => {
    if (!events.length) {
        return null;
    }
    const startEvent = events[0];
    const endEvent = events[events.length - 1];
    const deltaEvents = events.filter((event) => event.event_type.toLowerCase() === `${family}_delta`);
    return {
        key: `stream-${family}-${startEvent.seq}-${endEvent.seq}`,
        kind: "stream",
        family,
        title: getStreamFamilyLabel(family),
        subtitle: `${getEventTypeLabel(startEvent.event_type)} → ${getEventTypeLabel(endEvent.event_type)} · ${startEvent.seq} - ${endEvent.seq}`,
        events,
        mergedText: getMergedBlockText(events),
        matchedCount: events.length,
        deltaBlock: buildStreamDeltaBlock(family, deltaEvents),
    };
};

const buildTurnItems = (events: TraceEvent[]): TraceTurnItem[] => {
    const items: TraceTurnItem[] = [];
    let index = 0;

    while (index < events.length) {
        const event = events[index];
        if (event.event_type === "start") {
            const run: TraceEvent[] = [event];
            let cursor = index + 1;
            while (cursor < events.length) {
                const current = events[cursor];
                run.push(current);
                if (current.event_type === "done") {
                    cursor += 1;
                    break;
                }
                cursor += 1;
            }
            const textBlocks: TraceStreamBlockItem[] = [];
            const otherEvents: TraceEvent[] = [];
            let innerIndex = 1;
            while (innerIndex < Math.max(run.length - 1, 1)) {
                const innerEvent = run[innerIndex];
                const family = getStreamFamily(innerEvent.event_type);
                if (family) {
                    const familyEvents: TraceEvent[] = [innerEvent];
                    let familyCursor = innerIndex + 1;
                    const familyEndType = `${family}_end`;
                    while (familyCursor < run.length) {
                        const familyEvent = run[familyCursor];
                        if (familyEvent.event_type === "done") {
                            break;
                        }
                        familyEvents.push(familyEvent);
                        if (familyEvent.event_type.toLowerCase() === familyEndType) {
                            familyCursor += 1;
                            break;
                        }
                        familyCursor += 1;
                    }
                    const streamBlock = buildStreamBlock(family, familyEvents);
                    if (streamBlock) {
                        textBlocks.push(streamBlock);
                    }
                    innerIndex = familyCursor;
                    continue;
                }
                if (innerEvent.event_type !== "done") {
                    otherEvents.push(innerEvent);
                }
                innerIndex += 1;
            }
            items.push({
                key: `generation-${run[0].seq}-${run[run.length - 1].seq}`,
                kind: "generation",
                events: run,
                matchedCount: run.length,
                textBlocks,
                otherEvents,
            });
            index = cursor;
            continue;
        }

        items.push({
            key: `event-${event.seq}-${event.event_type}`,
            kind: "event",
            event,
            matchedCount: 1,
        });
        index += 1;
    }

    return items;
};

const groupEventsByTurn = (events: TraceEvent[]): TraceTurnGroup[] => {
    const groups: TraceTurnGroup[] = [];
    let currentGroup: TraceTurnGroup | null = null;
    let fallbackTurnNumber = 0;

    const pushCurrentGroup = () => {
        if (currentGroup) {
            const rawEvents = currentGroup.rawEvents;
            groups.push(currentGroup);
            currentGroup.items = buildTurnItems(rawEvents);
            currentGroup = null;
        }
    };

    for (const event of events) {
        if (event.event_type === "turn.start") {
            pushCurrentGroup();
            fallbackTurnNumber += 1;
            const payload = toRecord(event.payload);
            const turnNumber = getEventTurnNumber(event) ?? fallbackTurnNumber;
            currentGroup = {
                key: `turn-${turnNumber}`,
                label: `第 ${turnNumber} 轮`,
                turnNumber,
                isPrelude: false,
                summary: getTurnSummary(payload),
                totalCount: 1,
                rawEvents: [event],
                items: [],
            };
            continue;
        }

        if (!currentGroup) {
            currentGroup = {
                key: "prelude",
                label: "准备阶段",
                turnNumber: null,
                isPrelude: true,
                summary: "",
                totalCount: 0,
                rawEvents: [],
                items: [],
            };
        }

        currentGroup.rawEvents.push(event);
        currentGroup.totalCount += 1;
    }

    pushCurrentGroup();

    if (!groups.length && events.length) {
        groups.push({
            key: "main",
            label: "主流程",
            turnNumber: null,
            isPrelude: true,
            summary: "",
            totalCount: events.length,
            rawEvents: events,
            items: buildTurnItems(events),
        });
    } else if (groups.length === 1 && groups[0].isPrelude) {
        groups[0] = {
            ...groups[0],
            label: "主流程",
        };
    }

    return groups;
};

const getTraceListUrl = (conversationId: string, limit: number) => {
    const url = new URL(getFullPath("/api/chat-traces"));
    if (conversationId) {
        url.searchParams.set("conversationId", conversationId);
    }
    url.searchParams.set("limit", String(limit));
    return url.toString();
};

const getTraceDetailUrl = (traceId: string) => getFullPath(`/api/chat-traces/${traceId}`);

const getTraceInspectorSearch = (traceId: string) => {
    const params = new URLSearchParams();
    if (traceId.trim()) {
        params.set("traceId", traceId.trim());
    }
    const query = params.toString();
    return query ? `?${query}` : "";
};

const resolveTraceConversationId = (
    input: string,
    mappings: Record<string, string>,
    sessionExtensions: Record<string, { conversationId: string }>,
) => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
        return {
            conversationId: "",
            source: "",
            isDirectInput: false,
        };
    }

    const mappedConversationId = mappings[trimmedInput]?.trim();
    if (mappedConversationId) {
        return {
            conversationId: mappedConversationId,
            source: "本地 mappings",
            isDirectInput: false,
        };
    }

    const extensionConversationId = sessionExtensions[trimmedInput]?.conversationId?.trim();
    if (extensionConversationId) {
        return {
            conversationId: extensionConversationId,
            source: "sessionExtensions",
            isDirectInput: false,
        };
    }

    return {
        conversationId: trimmedInput,
        source: "直接按输入值查询",
        isDirectInput: true,
    };
};

const TraceInspector = () => {
    const { conversationId: routeConversationId = "" } = useParams<{
        conversationId?: string;
    }>();
    const navigate = useNavigate();
    const location = useLocation();
    const mappings = useSelector((state: ReduxStoreProps) => state.mappings.mappings);
    const sessionExtensions = useSelector(
        (state: ReduxStoreProps) => state.sessionExtensions.sessionExtensions,
    );
    const traceIdFromUrl = useMemo(() => {
        const params = new URLSearchParams(location.search);
        return params.get("traceId")?.trim() ?? "";
    }, [location.search]);
    const [conversationId, setConversationId] = useState(routeConversationId ?? "");
    const [limit] = useState(50);
    const [enabled, setEnabled] = useState(true);
    const [traceItems, setTraceItems] = useState<TraceSummary[]>([]);
    const [selectedTraceId, setSelectedTraceId] = useState(traceIdFromUrl);
    const [traceDetail, setTraceDetail] = useState<TraceDetailResponse["trace"] | null>(null);
    const [events, setEvents] = useState<TraceEvent[]>([]);
    const [showStreamingEvents, setShowStreamingEvents] = useState(true);
    const [selectedEventType, setSelectedEventType] = useState("all");
    const [eventSearch, setEventSearch] = useState("");
    const [expandedTurnGroups, setExpandedTurnGroups] = useState<Record<string, boolean>>({});
    const [expandedBlocks, setExpandedBlocks] = useState<Record<string, boolean>>({});
    const [expandedPayloads, setExpandedPayloads] = useState<Record<string, boolean>>({});
    const [loadingList, setLoadingList] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        document.title = "Trace Inspector";
    }, []);

    useEffect(() => {
        setConversationId(routeConversationId ?? "");
    }, [routeConversationId]);

    useEffect(() => {
        if (traceIdFromUrl && traceIdFromUrl !== selectedTraceId) {
            setSelectedTraceId(traceIdFromUrl);
        }
    }, [selectedTraceId, traceIdFromUrl]);

    const syncTraceIdInUrl = (nextTraceId: string, replace: boolean) => {
        const search = getTraceInspectorSearch(nextTraceId);
        if (search === location.search) {
            return;
        }
        navigate(
            {
                pathname: location.pathname,
                search,
            },
            { replace },
        );
    };

    const selectTraceId = (nextTraceId: string, replace = false) => {
        setSelectedTraceId(nextTraceId);
        syncTraceIdInUrl(nextTraceId, replace);
    };

    const sortedItems = useMemo(() => traceItems, [traceItems]);
    const resolvedTraceConversation = useMemo(
        () => resolveTraceConversationId(conversationId, mappings, sessionExtensions),
        [conversationId, mappings, sessionExtensions],
    );
    const resolvedConversationId = resolvedTraceConversation.conversationId;

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!resolvedConversationId) {
                setTraceItems([]);
                setTraceDetail(null);
                setEvents([]);
                setError("");
                return;
            }
            setLoadingList(true);
            setError("");
            try {
                const response = await fetch(getTraceListUrl(resolvedConversationId, limit), {
                    credentials: "include",
                });
                if (!response.ok) {
                    throw new Error(`无法加载 trace 列表: ${response.status}`);
                }
                const data = (await response.json()) as TraceListResponse;
                if (cancelled) {
                    return;
                }
                setEnabled(data.enabled);
                setTraceItems(data.items ?? []);
            } catch (loadError: any) {
                if (!cancelled) {
                    setError(loadError?.message ?? "加载失败");
                    setTraceItems([]);
                    setTraceDetail(null);
                    setEvents([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingList(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [conversationId, limit, resolvedConversationId]);

    useEffect(() => {
        if (!traceItems.length) {
            if (traceIdFromUrl && traceIdFromUrl !== selectedTraceId) {
                setSelectedTraceId(traceIdFromUrl);
            }
            return;
        }

        const matchedTraceId =
            traceIdFromUrl && traceItems.some((item) => item.id === traceIdFromUrl)
                ? traceIdFromUrl
                : traceItems[0]?.id ?? "";
        if (!matchedTraceId) {
            return;
        }
        if (matchedTraceId !== selectedTraceId) {
            setSelectedTraceId(matchedTraceId);
        }
        if (matchedTraceId !== traceIdFromUrl) {
            syncTraceIdInUrl(matchedTraceId, true);
        }
    }, [selectedTraceId, traceIdFromUrl, traceItems]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            if (!selectedTraceId.trim()) {
                setTraceDetail(null);
                setEvents([]);
                return;
            }
            setLoadingDetail(true);
            try {
                const response = await fetch(getTraceDetailUrl(selectedTraceId), {
                    credentials: "include",
                });
                if (!response.ok) {
                    throw new Error(`无法加载 trace 明细: ${response.status}`);
                }
                const data = (await response.json()) as TraceDetailResponse;
                if (cancelled) {
                    return;
                }
                setEnabled(data.enabled);
                setTraceDetail(data.trace);
                setEvents(data.events ?? []);
                setShowStreamingEvents(true);
                setSelectedEventType("all");
                setEventSearch("");
                setExpandedTurnGroups({});
                setExpandedBlocks({});
                setExpandedPayloads({});
            } catch (loadError: any) {
                if (!cancelled) {
                    setError(loadError?.message ?? "加载失败");
                    setTraceDetail(null);
                    setEvents([]);
                    setExpandedTurnGroups({});
                    setExpandedBlocks({});
                    setExpandedPayloads({});
                }
            } finally {
                if (!cancelled) {
                    setLoadingDetail(false);
                }
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [selectedTraceId]);

    const traceMeta = traceDetail ?? sortedItems.find((item) => item.id === selectedTraceId) ?? null;
    const renderEventPayload = (payloadKey: string, payload: unknown) => {
        const isExpanded = expandedPayloads[payloadKey] ?? false;
        return (
            <div className={`${EVENT_PAYLOAD_BOX_CLASS} ${isExpanded ? "" : "max-h-[12.5rem] overflow-hidden"}`}>
                <button
                    className="absolute right-2 top-2 z-10 rounded-full border border-slate-700 bg-slate-900/95 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
                    onClick={() =>
                        setExpandedPayloads((current) => ({
                            ...current,
                            [payloadKey]: !isExpanded,
                        }))
                    }
                    type="button"
                >
                    {isExpanded ? "收起" : "展开"}
                </button>
                <pre
                    className={
                        isExpanded ? EVENT_PAYLOAD_PRE_EXPANDED_CLASS : EVENT_PAYLOAD_PRE_COLLAPSED_CLASS
                    }
                >
                    {prettyJson(payload)}
                </pre>
            </div>
        );
    };
    const visibleEvents = useMemo(() => events, [events]);
    const eventTypes = useMemo(() => {
        return Array.from(new Set(visibleEvents.map((event) => event.event_type))).sort();
    }, [visibleEvents]);
    const groupedEvents = useMemo(() => groupEventsByTurn(visibleEvents), [visibleEvents]);
    const displayedTurnGroups = useMemo<DisplayedTurnGroup[]>(() => {
        const keyword = eventSearch.trim().toLowerCase();
        const matchesType = (event: TraceEvent) =>
            selectedEventType === "all" || event.event_type === selectedEventType;
        const matchesKeyword = (text: string) => !keyword || text.includes(keyword);
        const eventMatches = (event: TraceEvent) =>
            matchesType(event) && matchesKeyword(getEventSearchText(event));
        const streamBlockMatches = (block: TraceStreamBlockItem) =>
            block.events.some(eventMatches) ||
            matchesKeyword(
                [
                    block.title,
                    block.subtitle,
                    block.mergedText,
                    ...block.events.map((event) => getEventSearchText(event)),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase(),
            );
        const deltaBlockMatches = (block: TraceDeltaBlockItem) =>
            block.events.some(eventMatches) ||
            matchesKeyword(
                [
                    block.title,
                    block.subtitle,
                    block.mergedText,
                    ...block.events.map((event) => getEventSearchText(event)),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase(),
            );
        const filterDeltaBlock = (block: TraceDeltaBlockItem): TraceDeltaBlockItem | null => {
            if (deltaBlockMatches(block)) {
                return block;
            }
            const filteredEvents = block.events.filter(eventMatches);
            if (!filteredEvents.length) {
                return null;
            }
            return {
                ...block,
                events: filteredEvents,
                mergedText: getMergedBlockText(filteredEvents),
                matchedCount: filteredEvents.length,
            };
        };
        const filterStreamBlock = (block: TraceStreamBlockItem): TraceStreamBlockItem | null => {
            const filteredDeltaBlock = block.deltaBlock ? filterDeltaBlock(block.deltaBlock) : null;
            if (streamBlockMatches(block)) {
                return block;
            }
            const filteredEvents = block.events.filter(eventMatches);
            if (!filteredEvents.length && !filteredDeltaBlock) {
                return null;
            }
            return {
                ...block,
                events: filteredEvents.length ? filteredEvents : block.events,
                matchedCount: filteredEvents.length ? filteredEvents.length : block.matchedCount,
                deltaBlock: filteredDeltaBlock,
                mergedText: filteredEvents.length ? getMergedBlockText(filteredEvents) : block.mergedText,
            };
        };
        const filterGenerationItem = (item: Extract<TraceTurnItem, { kind: "generation" }>): TraceTurnItem | null => {
            const filteredTextBlocks = item.textBlocks
                .map((block) => filterStreamBlock(block))
                .filter((block): block is TraceStreamBlockItem => block !== null);
            const filteredOtherEvents = item.otherEvents.filter(eventMatches);
            const generationMatches =
                matchesKeyword(
                    [
                        "模型输出",
                        getEventTypeLabel(item.events[0]?.event_type ?? "start"),
                        getEventTypeLabel(item.events[item.events.length - 1]?.event_type ?? "done"),
                        getMergedBlockText(item.events),
                        ...item.events.map((event) => getEventSearchText(event)),
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase(),
                ) || item.events.some(eventMatches);
            if (generationMatches) {
                return item;
            }
            if (!filteredTextBlocks.length && !filteredOtherEvents.length) {
                return null;
            }
            return {
                ...item,
                textBlocks: filteredTextBlocks,
                otherEvents: filteredOtherEvents,
                matchedCount:
                    filteredOtherEvents.length +
                    filteredTextBlocks.reduce((total, block) => total + block.matchedCount, 0),
            };
        };

        return groupedEvents
            .map((group) => {
                const itemsInGroup = group.items
                    .map((item) => {
                        if (item.kind === "event") {
                            if (selectedEventType !== "all" && item.event.event_type !== selectedEventType) {
                                return null;
                            }
                            if (keyword && !getEventSearchText(item.event).includes(keyword)) {
                                return null;
                            }
                            return item;
                        }

                        return filterGenerationItem(item);
                    })
                    .filter((item): item is TraceTurnItem => item !== null);

                return {
                    ...group,
                    matchedCount: itemsInGroup.reduce((total, item) => total + item.matchedCount, 0),
                    items: itemsInGroup,
                };
            })
            .filter((group) => group.items.length > 0);
    }, [eventSearch, groupedEvents, selectedEventType]);

    const displayedEventCount = useMemo(() => {
        return displayedTurnGroups.reduce((total, group) => total + group.matchedCount, 0);
    }, [displayedTurnGroups]);

    const displayedGenerationBlockKeys = useMemo(() => {
        const keys: string[] = [];
        const visitItems = (items: TraceTurnItem[]) => {
            for (const item of items) {
                if (item.kind === "event") {
                    continue;
                }
                keys.push(item.key);
                for (const textBlock of item.textBlocks) {
                    keys.push(textBlock.key);
                }
            }
        };
        for (const group of displayedTurnGroups) {
            visitItems(group.items);
        }
        return keys;
    }, [displayedTurnGroups]);

    const allGroupsExpanded = useMemo(() => {
        const turnExpanded =
            displayedTurnGroups.length > 0 && displayedTurnGroups.every((group) => expandedTurnGroups[group.key]);
        const generationExpanded =
            displayedGenerationBlockKeys.length === 0 ||
            displayedGenerationBlockKeys.every((key) => expandedBlocks[key]);
        return turnExpanded && generationExpanded;
    }, [displayedGenerationBlockKeys, expandedBlocks, displayedTurnGroups, expandedTurnGroups]);

    useEffect(() => {
        if (selectedEventType !== "all" && !eventTypes.includes(selectedEventType)) {
            setSelectedEventType("all");
        }
    }, [eventTypes, selectedEventType]);

    return (
        <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_38%),linear-gradient(135deg,_#020617_0%,_#0f172a_55%,_#111827_100%)] text-slate-100">
            <div className="mx-auto flex min-h-screen w-full max-w-none flex-col px-3 py-4 md:px-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-cyan-400/15 bg-slate-950/55 px-5 py-4 shadow-[0_25px_70px_-35px_rgba(8,145,178,0.55)] backdrop-blur">
                    <div>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/70">
                            Internal Trace View
                        </p>
                        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">
                            GPT Assistant Trace Inspector
                        </h1>
                        <p className="mt-1 text-sm text-slate-400">
                            按 conversation id 回放单次问答的模型输入、输出和工具调用。
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3">
                            <label className="block text-[11px] uppercase tracking-[0.28em] text-slate-500">
                                Conversation
                            </label>
                            <input
                                className="mt-2 w-[260px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-600 focus:border-cyan-400"
                                placeholder="输入会话 id 或 conversation id"
                                value={conversationId}
                                onChange={(event) => setConversationId(event.target.value)}
                            />
                        </div>
                        <button
                            className="rounded-2xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-3 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/20"
                            onClick={() => setConversationId((current) => current.trim())}
                        >
                            加载
                        </button>
                    </div>
                </div>

                {!enabled ? (
                    <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        trace 开关当前未开启，已连接页面但后端不会记录新的输入输出。
                    </div>
                ) : null}

                {error ? (
                    <div className="mb-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                        {error}
                    </div>
                ) : null}

                {conversationId.trim() ? (
                    <div className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
                        当前输入值: <span className="text-slate-100">{conversationId.trim()}</span>
                        {"  "}
                        解析后的 conversation id:{" "}
                        <span className="text-cyan-200">{resolvedConversationId || "未解析"}</span>
                        {"  "}
                        解析来源:{" "}
                        <span className="text-cyan-200">{resolvedTraceConversation.source || "无"}</span>
                    </div>
                ) : null}

                {conversationId.trim() && resolvedTraceConversation.isDirectInput ? (
                    <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        本地没有找到该会话的映射，页面会直接按你输入的值查询 trace。如果这是从
                        `/chat/:id` 复制过来的链接，说明当前浏览器里没有保存对应映射，或者后端
                        还没有返回并写入 `conversation_id`。
                    </div>
                ) : null}

                <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
                    <aside className="sticky top-4 flex min-h-0 self-start flex-col rounded-3xl border border-slate-800/80 bg-slate-950/70 p-4 shadow-[0_25px_70px_-35px_rgba(15,23,42,1)] backdrop-blur max-h-[calc(100vh-2rem)]">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-base font-semibold text-slate-100">Trace Sessions</h2>
                                <p className="text-xs text-slate-500">
                                    {loadingList ? "正在加载..." : `${sortedItems.length} 条记录`}
                                </p>
                            </div>
                            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                                limit {limit}
                            </span>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                            {sortedItems.length ? (
                                sortedItems.map((item) => {
                                    const active = item.id === selectedTraceId;
                                    return (
                                        <button
                                            key={item.id}
                                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                                active
                                                    ? "border-cyan-400/40 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(34,211,238,0.12)]"
                                                    : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                                            }`}
                                            onClick={() => selectTraceId(item.id)}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-100">
                                                        {item.requested_model ?? item.selected_model ?? "unknown model"}
                                                    </p>
                                                    <p className="mt-1 truncate text-xs text-slate-500">
                                                        {item.started_at}
                                                    </p>
                                                </div>
                                                <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] uppercase tracking-widest text-slate-400">
                                                    {item.status}
                                                </span>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                                                <span className="rounded-full bg-slate-950 px-2 py-1">
                                                    {item.gid ?? "gptassistant"}
                                                </span>
                                                <span className="rounded-full bg-slate-950 px-2 py-1">
                                                    {item.detail_count} events
                                                </span>
                                                {item.reasoning_enabled !== null ? (
                                                    <span className="rounded-full bg-slate-950 px-2 py-1">
                                                        reasoning {item.reasoning_enabled ? "on" : "off"}
                                                    </span>
                                                ) : null}
                                            </div>
                                            {item.query ? (
                                                <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-300">
                                                    {item.query}
                                                </p>
                                            ) : null}
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-5 text-sm text-slate-500">
                                    {conversationId.trim()
                                        ? "没有找到 trace 记录。"
                                        : "输入 conversation id 后加载 trace。"}
                                </div>
                            )}
                        </div>
                    </aside>

                    <main className="sticky top-4 self-start min-h-0 overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/70 shadow-[0_25px_70px_-35px_rgba(15,23,42,1)] backdrop-blur max-h-[calc(100vh-2rem)]">
                        {loadingDetail && !traceMeta ? (
                            <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">
                                正在加载 trace 明细...
                            </div>
                        ) : traceMeta ? (
                            <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-y-auto overflow-x-hidden p-4">
                                <div>
                                    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                                        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-[11px] uppercase tracking-[0.32em] text-cyan-300/60">
                                                        Trace Detail
                                                    </p>
                                                    <h2 className="mt-2 text-lg font-semibold text-slate-50">
                                                        {traceMeta.id}
                                                    </h2>
                                                </div>
                                                <div className="flex flex-wrap gap-2 text-xs text-slate-300">
                                                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1">
                                                        {traceMeta.status}
                                                    </span>
                                                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1">
                                                        {traceMeta.gid ?? "gptassistant"}
                                                    </span>
                                                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1">
                                                        {traceMeta.detail_count} events
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                                                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                        Conversation
                                                    </p>
                                                    <p className="mt-2 break-all text-slate-100">
                                                        {traceMeta.conversation_id ?? "unknown"}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                        Model
                                                    </p>
                                                    <p className="mt-2 break-all text-slate-100">
                                                        {traceMeta.selected_model ?? traceMeta.requested_model ?? "unknown"}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                        Started
                                                    </p>
                                                    <p className="mt-2 break-all text-slate-100">
                                                        {traceMeta.started_at}
                                                    </p>
                                                </div>
                                                <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                        Duration
                                                    </p>
                                                    <p className="mt-2 break-all text-slate-100">
                                                        {typeof traceMeta.duration_ms === "number"
                                                            ? `${traceMeta.duration_ms.toFixed(0)} ms`
                                                            : "running"}
                                                    </p>
                                                </div>
                                            </div>

                                            {traceMeta.error ? (
                                                <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100">
                                                    {traceMeta.error}
                                                </div>
                                            ) : null}

                                            {traceMeta.query ? (
                                                <div className="mt-4">
                                                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                                                        User Query
                                                    </p>
                                                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm leading-6 text-slate-200">
                                                        {traceMeta.query}
                                                    </pre>
                                                </div>
                                            ) : null}

                                            {traceMeta.system_prompt ? (
                                                <div className="mt-4">
                                                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                                                        System Prompt
                                                    </p>
                                                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-[13px] leading-6 text-slate-200">
                                                        {traceMeta.system_prompt}
                                                    </pre>
                                                </div>
                                            ) : null}

                                            {traceMeta.request_json ? (
                                                <div className="mt-4">
                                                    <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                                                        Request Payload
                                                    </p>
                                                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-[12px] leading-6 text-cyan-100">
                                                        {prettyJson(traceMeta.request_json)}
                                                    </pre>
                                                </div>
                                            ) : null}
                                        </section>

                                        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                                            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                                                Response Preview
                                            </p>
                                            <pre className="mt-2 whitespace-pre-wrap break-words rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm leading-6 text-slate-200">
                                                {traceMeta.response_preview ?? "暂无 response preview"}
                                            </pre>
                                            {traceMeta.file_ids ? (
                                                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                                                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                                                        File Ids
                                                    </p>
                                                    <pre className="mt-2 break-words text-sm text-slate-200">
                                                        {traceMeta.file_ids}
                                                    </pre>
                                                </div>
                                            ) : null}
                                        </section>
                                    </div>

                                    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                                                    Events
                                                </p>
                                                <h3 className="mt-2 text-base font-semibold text-slate-100">
                                                    {displayedTurnGroups.length} 组 · {displayedEventCount}/
                                                    {visibleEvents.length} steps shown
                                                </h3>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-400">
                                                    {loadingDetail ? "refreshing..." : "live snapshot"}
                                                </span>
                                                <button
                                                    className={`rounded-full border px-3 py-1 text-xs transition ${
                                                        showStreamingEvents
                                                            ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                                                            : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                                                    }`}
                                                    onClick={() => setShowStreamingEvents((current) => !current)}
                                                >
                                                                    {showStreamingEvents ? "隐藏流式事件" : "显示流式事件"}
                                                </button>
                                                {selectedEventType !== "all" ? (
                                                    <button
                                                        className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                                                        onClick={() => setSelectedEventType("all")}
                                                    >
                                                        清除类型过滤
                                                    </button>
                                                ) : null}
                                                <button
                                                    className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
                                                    onClick={() => {
                                                        if (allGroupsExpanded) {
                                                            setExpandedTurnGroups({});
                                                            setExpandedBlocks({});
                                                            return;
                                                        }
                                                        const nextState: Record<string, boolean> = {};
                                                        for (const group of displayedTurnGroups) {
                                                            nextState[group.key] = true;
                                                        }
                                                        setExpandedTurnGroups(nextState);
                                                        const nextGenerationState: Record<string, boolean> = {};
                                                        for (const key of displayedGenerationBlockKeys) {
                                                            nextGenerationState[key] = true;
                                                        }
                                                        setExpandedBlocks(nextGenerationState);
                                                    }}
                                                >
                                                    {allGroupsExpanded ? "全部收起" : "全部展开"}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                                            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                                                <label className="block text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                    Search
                                                </label>
                                                <input
                                                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-400"
                                                    placeholder="按事件名、序号、payload 内容搜索"
                                                    value={eventSearch}
                                                    onChange={(event) => setEventSearch(event.target.value)}
                                                />
                                            </div>

                                            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                                                <label className="block text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                                    事件类型
                                                </label>
                                                <select
                                                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                                                    value={selectedEventType}
                                                    onChange={(event) => setSelectedEventType(event.target.value)}
                                                >
                                                    <option value="all">全部事件</option>
                                                    {eventTypes.map((eventType) => (
                                                        <option key={eventType} value={eventType}>
                                                            {getEventTypeLabel(eventType)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {!showStreamingEvents ? (
                                            <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-3 text-xs text-cyan-100">
                                                当前是完整块视图，已隐藏原始流式事件。需要看原始 token 流时，打开“显示流式事件”。
                                            </div>
                                        ) : null}

                                        <div className="mt-4 space-y-3">
                                            {displayedTurnGroups.length ? (
                                                displayedTurnGroups.map((group) => {
                                                    const isExpanded = expandedTurnGroups[group.key] ?? false;

                                                    return (
                                                        <article
                                                            key={group.key}
                                                            className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4"
                                                        >
                                                            <button
                                                                className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                                                                onClick={() =>
                                                                    setExpandedTurnGroups((current) => ({
                                                                        ...current,
                                                                        [group.key]: !isExpanded,
                                                                    }))
                                                                }
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                        <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                            {group.label}
                                                                        </span>
                                                                        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
                                                                            {group.matchedCount}/{group.totalCount} steps
                                                                        </span>
                                                                    </div>
                                                                    {group.summary ? (
                                                                        <p className="mt-2 text-xs text-slate-500">
                                                                            {group.summary}
                                                                        </p>
                                                                    ) : null}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs text-slate-500">
                                                                        {isExpanded ? "点击收起" : "点击展开"}
                                                                    </span>
                                                                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
                                                                        {group.totalCount} 原始事件
                                                                    </span>
                                                                </div>
                                                            </button>

                                                            {isExpanded ? (
                                                                <div className="mt-4 space-y-3">
                                                                    {group.items.map((item) => {
                                                                        if (item.kind === "event") {
                                                                            return (
                                                                                <article
                                                                                    key={`${group.key}-${item.key}`}
                                                                                    className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4"
                                                                                >
                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                #{item.event.seq}
                                                                                            </span>
                                                                                            <h4 className="text-sm font-semibold text-slate-100">
                                                                                                {getEventTypeLabel(item.event.event_type)}
                                                                                            </h4>
                                                                                        </div>
                                                                                        <span className="text-xs text-slate-500">
                                                                                            {item.event.occurred_at}
                                                                                        </span>
                                                                                    </div>
                                                                                    {renderEventPayload(
                                                                                        `event-${item.event.seq}`,
                                                                                        item.event.payload,
                                                                                    )}
                                                                                </article>
                                                                            );
                                                                        }

                                                                        const generationExpanded = expandedBlocks[item.key] ?? false;
                                                                        const generationStart = item.events[0];
                                                                        const generationEnd = item.events[item.events.length - 1];

                                                                        return (
                                                                            <article
                                                                                key={`${group.key}-${item.key}`}
                                                                                className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-4"
                                                                            >
                                                                                <button
                                                                                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                                                                                    onClick={() =>
                                                                                        setExpandedBlocks((current) => ({
                                                                                            ...current,
                                                                                            [item.key]: !generationExpanded,
                                                                                        }))
                                                                                    }
                                                                                >
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                模型输出块
                                                                                            </span>
                                                                                            <span className="rounded-full border border-cyan-400/20 bg-slate-950 px-2.5 py-1 text-[11px] text-cyan-100">
                                                                                                {item.events.length} 条原始事件
                                                                                            </span>
                                                                                            <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
                                                                                                {item.textBlocks.length} 个输出块
                                                                                            </span>
                                                                                        </div>
                                                                                        <p className="mt-2 text-xs text-slate-500">
                                                                                            {getEventTypeLabel(generationStart.event_type)} → {getEventTypeLabel(generationEnd.event_type)} · {generationStart.seq} - {generationEnd.seq}
                                                                                        </p>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-xs text-slate-500">
                                                                                            {generationExpanded ? "点击收起" : "点击展开"}
                                                                                        </span>
                                                                                        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
                                                                                            已聚合
                                                                                        </span>
                                                                                    </div>
                                                                                </button>

                                                                                        {generationExpanded ? (
                                                                                            <div className="mt-4 space-y-3">
                                                                                                <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                                        <div className="flex items-center gap-2">
                                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                #{generationStart.seq}
                                                                                                            </span>
                                                                                                            <h4 className="text-sm font-semibold text-slate-100">
                                                                                                                模型输出开始
                                                                                                            </h4>
                                                                                                        </div>
                                                                                                        <span className="text-xs text-slate-500">
                                                                                                            {generationStart.occurred_at}
                                                                                                        </span>
                                                                                            </div>
                                                                                            {renderEventPayload(
                                                                                                `event-${generationStart.seq}`,
                                                                                                generationStart.payload,
                                                                                            )}
                                                                                        </article>

                                                                                        {item.textBlocks.length ? (
                                                                                            item.textBlocks.map((textBlock) => {
                                                                                                const textExpanded = expandedBlocks[textBlock.key] ?? false;
                                                                                                const textStart = textBlock.events[0];
                                                                                                const textEnd = textBlock.events[textBlock.events.length - 1];
                                                                                                return (
                                                                                                    <article
                                                                                                        key={`${group.key}-${item.key}-${textBlock.key}`}
                                                                                                        className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-4"
                                                                                                    >
                                                                                                        <button
                                                                                                            className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                                                                                                            onClick={() =>
                                                                                                                setExpandedBlocks((current) => ({
                                                                                                                    ...current,
                                                                                                                    [textBlock.key]: !textExpanded,
                                                                                                                }))
                                                                                                            }
                                                                                                        >
                                                                                                            <div className="min-w-0">
                                                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                                                    <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                        文本输出块
                                                                                                                    </span>
                                                                                                                    <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[11px] text-slate-400">
                                                                                                                        {textBlock.events.length} 条原始事件
                                                                                                                    </span>
                                                                                                                </div>
                                                                                                                <p className="mt-2 text-xs text-slate-500">
                                                                                                                    {getEventTypeLabel(textStart.event_type)} → {getEventTypeLabel(textEnd.event_type)} · {textStart.seq} - {textEnd.seq}
                                                                                                                </p>
                                                                                                            </div>
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                <span className="text-xs text-slate-500">
                                                                                                                    {textExpanded ? "点击收起" : "点击展开"}
                                                                                                                </span>
                                                                                                                <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
                                                                                                                    已聚合
                                                                                                                </span>
                                                                                                            </div>
                                                                                                        </button>

                                                                                                        {textExpanded ? (
                                                                                                            <div className="mt-4 space-y-3">
                                                                                                                <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                                                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                                                        <div className="flex items-center gap-2">
                                                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                                #{textStart.seq}
                                                                                                                            </span>
                                                                                                                            <h4 className="text-sm font-semibold text-slate-100">
                                                                                                                                {getEventTypeLabel(textStart.event_type)}
                                                                                                                            </h4>
                                                                                                                        </div>
                                                                                                                        <span className="text-xs text-slate-500">
                                                                                                                            {textStart.occurred_at}
                                                                                                                        </span>
                                                                                                                    </div>
                                                                                                                    {renderEventPayload(
                                                                                                                        `event-${textStart.seq}`,
                                                                                                                        textStart.payload,
                                                                                                                    )}
                                                                                                                </article>

                                                                                                                {textBlock.deltaBlock ? (
                                                                                                                    (() => {
                                                                                                                        const deltaExpanded =
                                                                                                                            expandedBlocks[textBlock.deltaBlock.key] ?? false;
                                                                                                                        const deltaStart =
                                                                                                                            textBlock.deltaBlock.events[0];
                                                                                                                        const deltaEnd =
                                                                                                                            textBlock.deltaBlock.events[
                                                                                                                                textBlock.deltaBlock.events.length - 1
                                                                                                                            ];

                                                                                                                        return (
                                                                                                                            <article className="rounded-2xl border border-cyan-400/20 bg-cyan-400/8 p-4">
                                                                                                                                <button
                                                                                                                                    className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                                                                                                                                    onClick={() =>
                                                                                                                                        setExpandedBlocks((current) => ({
                                                                                                                                            ...current,
                                                                                                                                            [textBlock.deltaBlock!.key]:
                                                                                                                                                !deltaExpanded,
                                                                                                                                        }))
                                                                                                                                    }
                                                                                                                                >
                                                                                                                                    <div className="min-w-0">
                                                                                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                                                文本增量块
                                                                                                                                            </span>
                                                                                                                                            <span className="rounded-full border border-cyan-400/20 bg-slate-950 px-2.5 py-1 text-[11px] text-cyan-100">
                                                                                                                                                {textBlock.deltaBlock.events.length} 条原始事件
                                                                                                                                            </span>
                                                                                                                                        </div>
                                                                                                                                        <p className="mt-2 text-xs text-slate-500">
                                                                                                                                            {getEventTypeLabel(deltaStart.event_type)} → {getEventTypeLabel(deltaEnd.event_type)} · {deltaStart.seq} - {deltaEnd.seq}
                                                                                                                                        </p>
                                                                                                                                    </div>
                                                                                                                                    <div className="flex items-center gap-2">
                                                                                                                                        <span className="text-xs text-slate-500">
                                                                                                                                            {deltaExpanded ? "点击收起" : "点击展开"}
                                                                                                                                        </span>
                                                                                                                                        <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-400">
                                                                                                                                            已聚合
                                                                                                                                        </span>
                                                                                                                                    </div>
                                                                                                                                </button>

                                                                                                                                {deltaExpanded && showStreamingEvents ? (
                                                                                                                                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                                                                                                                                        <div className="flex items-center justify-between gap-3">
                                                                                                                                            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                                                                                                                                                原始事件
                                                                                                                                            </p>
                                                                                                                                            <span className="text-xs text-slate-500">
                                                                                                                                                {textBlock.deltaBlock.events.length} 条
                                                                                                                                            </span>
                                                                                                                                        </div>
                                                                                                                                        <div className="mt-3 space-y-3">
                                                                                                                                            {textBlock.deltaBlock.events.map((rawEvent) => (
                                                                                                                                                <article
                                                                                                                                                    key={`${group.key}-${item.key}-${textBlock.key}-${textBlock.deltaBlock!.key}-${rawEvent.seq}-${rawEvent.event_type}`}
                                                                                                                                                    className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"
                                                                                                                                                >
                                                                                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                                                                                        <div className="flex items-center gap-2">
                                                                                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                                                                #{rawEvent.seq}
                                                                                                                                                            </span>
                                                                                                                                                            <h5 className="text-sm font-semibold text-slate-100">
                                                                                                                                                                {getEventTypeLabel(rawEvent.event_type)}
                                                                                                                                                            </h5>
                                                                                                                                                        </div>
                                                                                                                                                        <span className="text-xs text-slate-500">
                                                                                                                                                            {rawEvent.occurred_at}
                                                                                                                                                        </span>
                                                                                                                                                    </div>
                                                                                                                                                    {renderEventPayload(
                                                                                                                                                        `event-${rawEvent.seq}`,
                                                                                                                                                        rawEvent.payload,
                                                                                                                                                    )}
                                                                                                                                                </article>
                                                                                                                                            ))}
                                                                                                                                        </div>
                                                                                                                                    </div>
                                                                                                                                ) : null}
                                                                                                                            </article>
                                                                                                                        );
                                                                                                                    })()
                                                                                                                ) : null}

                                                                                                                <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                                                                                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                                                        <div className="flex items-center gap-2">
                                                                                                                            <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                                                #{textEnd.seq}
                                                                                                                            </span>
                                                                                                                            <h4 className="text-sm font-semibold text-slate-100">
                                                                                                                                {getEventTypeLabel(textEnd.event_type)}
                                                                                                                            </h4>
                                                                                                                        </div>
                                                                                                                        <span className="text-xs text-slate-500">
                                                                                                                            {textEnd.occurred_at}
                                                                                                                        </span>
                                                                                                                    </div>
                                                                                                                    {renderEventPayload(
                                                                                                                        `event-${textEnd.seq}`,
                                                                                                                        textEnd.payload,
                                                                                                                    )}
                                                                                                                </article>
                                                                                                            </div>
                                                                                                        ) : (
                                                                                                            <div className="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                                                                                                                已折叠，点击上方标题查看文本输出细节。
                                                                                                            </div>
                                                                                                        )}
                                                                                                    </article>
                                                                                                );
                                                                                            })
                                                                                        ) : null}

                                                                                        <article className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                                                                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                                                                <div className="flex items-center gap-2">
                                                                                                    <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
                                                                                                        #{generationEnd.seq}
                                                                                                    </span>
                                                                                                    <h4 className="text-sm font-semibold text-slate-100">
                                                                                                        模型输出结束
                                                                                                    </h4>
                                                                                                </div>
                                                                                                <span className="text-xs text-slate-500">
                                                                                                    {generationEnd.occurred_at}
                                                                                                </span>
                                                                                            </div>
                                                                                            {renderEventPayload(
                                                                                                `event-${generationEnd.seq}`,
                                                                                                generationEnd.payload,
                                                                                            )}
                                                                                        </article>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                                                                                        已折叠，点击上方标题查看模型输出块。
                                                                                    </div>
                                                                                )}
                                                                            </article>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-3 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                                                                    已折叠，点击上方标题展开查看该轮事件。
                                                                </div>
                                                            )}
                                                        </article>
                                                    );
                                                })
                                            ) : (
                                                <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 p-5 text-sm text-slate-500">
                                                    {events.length ? "没有符合过滤条件的事件。" : "暂无事件。"}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        ) : (
                            <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500">
                                选择一条 trace 以查看详情。
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default TraceInspector;
