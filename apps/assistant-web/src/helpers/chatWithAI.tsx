// import { routes } from "../utils/common"
import { BaseParams, GenerativeContentBlob, GenerativeModel } from "@google/generative-ai";
import { ifError } from "assert";
import { SessionHistory } from "../store/sessions";
import { asyncSleep } from "./asyncSleep";
import { getDecodeBase64 } from "./getDecodeBase64";
import { handleStreamingRequest } from "./handleRequest";
import { getFullPath } from "../helpers/getDomainAndPath";
import { globalConfig } from "../config/global";


const unicodeToChar = (text: string) => {
    return text.replace(/\\u[0-9a-f]{4}/g, (_match, p1) => {
      return String.fromCharCode(parseInt(p1, 16))
    })
}

const isGptAssistant = (gid: string) => !gid || gid === "gptassistant";
const useGptAssistantV2 = () => globalConfig.gptassistantChatApiVersion !== "v1";
const showGptAssistantThinking = () => globalConfig.gptassistantShowThinking !== false;
const showGptAssistantDebugEvents = () => globalConfig.gptassistantDebugEvents === true;

const CHAT_V2_ERROR_MESSAGES: Record<string, string> = {
    CONTEXT_TOO_LONG: "当前输入内容过长，请减少文件内容、缩短问题，或开启新会话后重试。",
    FILE_CONTENT_TOO_LONG: "附件文本内容过长，请减少文件内容、拆分提问，或更换更精简的文件后重试。",
    TOO_MANY_FILES: "本次上传的文件总内容过长，请减少文件数量或拆分提问后重试。",
    FILE_PARSE_FAILED: "附件内容处理失败，请检查文件是否损坏，或更换文件后重试。",
    ATTACHMENT_TOOLS_UNSUPPORTED: "当前模型不支持读取附件，请切换到支持工具调用的模型后重试。",
    MODEL_REQUEST_FAILED: "本次请求处理失败，请稍后重试。",
};

const getChatV2ErrorMessage = (event: any) => {
    if (typeof event.error_message === "string" && event.error_message.trim()) {
        return event.error_message;
    }
    if (typeof event.error_code === "string" && CHAT_V2_ERROR_MESSAGES[event.error_code]) {
        return CHAT_V2_ERROR_MESSAGES[event.error_code];
    }
    return "请求失败";
};

const handleLegacyEvent = (
    event: any,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void,
) => {
    if (event.event === "message_end") {
        onChatMessage("", true, event.conversation_id ?? "");
        return;
    }
    if (event.event !== "message") {
        return;
    }
    onChatMessage(unicodeToChar(event.answer ?? ""), false, event.conversation_id ?? "");
};

const FRIENDLY_ATTACHMENT_LIST_TOOLS = new Set([
    "document_list",
    "resource_list",
    "attachment_list",
]);

const FRIENDLY_ATTACHMENT_TEXT_TOOLS = new Set([
    "document_read_text",
    "resource_read_text",
    "attachment_extract_text",
]);

const FRIENDLY_ATTACHMENT_IMAGE_TOOLS = new Set([
    "document_load_images",
    "resource_load_images",
    "attachment_load_images",
]);

const renderFriendlyToolCallMessage = (toolCall: any) => {
    const toolName = toolCall?.name ?? "";
    if (FRIENDLY_ATTACHMENT_LIST_TOOLS.has(toolName)) {
        return "正在检查当前会话中的附件列表。";
    }
    if (FRIENDLY_ATTACHMENT_TEXT_TOOLS.has(toolName)) {
        const mode = toolCall?.arguments?.mode;
        if (mode === "images") {
            return "正在提取图片中的文字内容。";
        }
        if (mode === "documents") {
            return "正在读取附件文档内容。";
        }
        return "正在提取附件中的可用文本内容。";
    }
    if (FRIENDLY_ATTACHMENT_IMAGE_TOOLS.has(toolName)) {
        return "正在加载图片附件，准备继续分析。";
    }
    return `正在调用工具 ${toolName || "unknown_tool"}。`;
};

const renderFriendlyToolResultMessage = (event: any) => {
    const toolName = event.tool_name ?? "";
    if (event.is_error) {
        return `工具调用失败：${toolName || "unknown_tool"}。`;
    }
    if (FRIENDLY_ATTACHMENT_LIST_TOOLS.has(toolName)) {
        return "已获取附件列表，正在继续分析。";
    }
    if (FRIENDLY_ATTACHMENT_TEXT_TOOLS.has(toolName)) {
        return "已完成附件文本提取。";
    }
    if (FRIENDLY_ATTACHMENT_IMAGE_TOOLS.has(toolName)) {
        return "已完成图片附件加载。";
    }
    return `工具调用完成：${toolName || "unknown_tool"}。`;
};

const renderFriendlyPreprocessMessage = (event: any) => {
    const message = typeof event.message === "string" ? event.message.trim() : "";
    if (message.length) {
        return message;
    }
    if (event.event === "preprocess_error") {
        return "附件预处理失败。";
    }
    if (event.event === "preprocess_complete") {
        return "附件预处理完成。";
    }
    return "正在预处理附件内容。";
};

const handleKernelEvent = (
    event: any,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void,
    state: { toolStepOpen: boolean },
) => {
    const conversationId = event.conversation_id ?? "";
    if (event.event === "thinking_start") {
        if (!showGptAssistantThinking()) {
            return;
        }
        onChatMessage("<think>\n", false, conversationId);
        return;
    }
    if (event.event === "thinking_delta") {
        if (!showGptAssistantThinking()) {
            return;
        }
        onChatMessage(event.delta ?? "", false, conversationId);
        return;
    }
    if (event.event === "thinking_end") {
        if (!showGptAssistantThinking()) {
            return;
        }
        onChatMessage("\n</think>\n\n", false, conversationId);
        return;
    }
    if (event.event === "preprocess_start") {
        if (!showGptAssistantDebugEvents()) {
            if (!state.toolStepOpen) {
                state.toolStepOpen = true;
                onChatMessage("\n<think>\n", false, conversationId);
            }
            onChatMessage(
                `<step><summary>附件处理中</summary>${renderFriendlyPreprocessMessage(event)}</step>\n`,
                false,
                conversationId,
            );
            return;
        }
        onChatMessage(`\n<think>\n${event.message ?? "正在预处理附件内容"}\n`, false, conversationId);
        return;
    }
    if (event.event === "preprocess_complete") {
        if (!showGptAssistantDebugEvents()) {
            if (!state.toolStepOpen) {
                state.toolStepOpen = true;
                onChatMessage("\n<think>\n", false, conversationId);
            }
            onChatMessage(
                `<step><summary>附件处理结果</summary>${renderFriendlyPreprocessMessage(event)}</step>\n</think>\n\n`,
                false,
                conversationId,
            );
            state.toolStepOpen = false;
            return;
        }
        onChatMessage("\n</think>\n\n", false, conversationId);
        return;
    }
    if (event.event === "preprocess_error") {
        if (!showGptAssistantDebugEvents()) {
            if (!state.toolStepOpen) {
                state.toolStepOpen = true;
                onChatMessage("\n<think>\n", false, conversationId);
            }
            onChatMessage(
                `<step><summary>附件处理结果</summary>${renderFriendlyPreprocessMessage(event)}</step>\n</think>\n\n`,
                false,
                conversationId,
            );
            state.toolStepOpen = false;
            return;
        }
        onChatMessage(`\n${event.message ?? "附件预处理失败"}\n</think>\n\n`, false, conversationId);
        return;
    }
    if (event.event === "toolcall_start") {
        if (!showGptAssistantDebugEvents()) {
            return;
        }
        onChatMessage(`\n<think>\n正在准备调用附件工具...\n`, false, conversationId);
        return;
    }
    if (event.event === "toolcall_end") {
        if (!showGptAssistantDebugEvents()) {
            if (!state.toolStepOpen) {
                state.toolStepOpen = true;
                onChatMessage("\n<think>\n", false, conversationId);
            }
            onChatMessage(
                `<step><summary>工具调用中</summary>${renderFriendlyToolCallMessage(event.tool_call)}</step>\n`,
                false,
                conversationId,
            );
            return;
        }
        const toolName = event.tool_call?.name ?? "unknown_tool";
        const toolArgs = event.tool_call?.arguments
            ? JSON.stringify(event.tool_call.arguments, null, 2)
            : "{}";
        onChatMessage(`调用工具：${toolName}\n参数：\n\`\`\`json\n${toolArgs}\n\`\`\`\n`, false, conversationId);
        return;
    }
    if (event.event === "tool_result") {
        if (!showGptAssistantDebugEvents()) {
            if (!state.toolStepOpen) {
                state.toolStepOpen = true;
                onChatMessage("\n<think>\n", false, conversationId);
            }
            onChatMessage(
                `<step><summary>工具调用结果</summary>${renderFriendlyToolResultMessage(event)}</step>\n</think>\n\n`,
                false,
                conversationId,
            );
            state.toolStepOpen = false;
            return;
        }
        const toolName = event.tool_name ?? "unknown_tool";
        const isError = !!event.is_error;
        const statusLabel = isError ? "工具调用失败" : "工具调用完成";
        const renderedDetails = event.details
            ? JSON.stringify(event.details, null, 2)
            : "{}";
        onChatMessage(`${statusLabel}：${toolName}\n结果详情：\n\`\`\`json\n${renderedDetails}\n\`\`\`\n</think>\n\n`, false, conversationId);
        return;
    }
    if (event.event === "text_delta") {
        if (state.toolStepOpen) {
            onChatMessage("</think>\n\n", false, conversationId);
            state.toolStepOpen = false;
        }
        onChatMessage(event.delta ?? "", false, conversationId);
        return;
    }
    if (event.event === "response_complete") {
        if (state.toolStepOpen) {
            onChatMessage("</think>\n\n", false, conversationId);
            state.toolStepOpen = false;
        }
        onChatMessage("", true, conversationId);
        return;
    }
    if (event.event === "error") {
        if (state.toolStepOpen) {
            onChatMessage("</think>\n\n", false, conversationId);
            state.toolStepOpen = false;
        }
        onChatMessage(getChatV2ErrorMessage(event), true, conversationId);
    }
};

const read = async (
    reader: any,
    decoder: TextDecoder,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void,
    useKernelProtocol: boolean,
) => {
    let buffer = "";
    const kernelState = { toolStepOpen: false };
    try {
        while (true) {
            const result = await reader?.read();
            if (!result || result.done) {
                if (useKernelProtocol && kernelState.toolStepOpen) {
                    onChatMessage("</think>\n\n", false, "");
                    kernelState.toolStepOpen = false;
                }
                onChatMessage("", true, "");
                return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: ")) {
                    continue;
                }
                let payload: any;
                try {
                    payload = JSON.parse(line.substring(6));
                } catch (_error) {
                    continue;
                }
                if (useKernelProtocol) {
                    handleKernelEvent(payload, onChatMessage, kernelState);
                } else {
                    handleLegacyEvent(payload, onChatMessage);
                }
            }
        }
    } catch (err: any) {
        if (err.name === "AbortError") {
            console.log("user aborted");
            return;
        }
        throw err;
    }
};
export const chatWithAI = (
    history: SessionHistory[],
    prompts: string,
    inlineData: GenerativeContentBlob,
    stream: boolean,
    conversationId: string,
    gid: string,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void,
    selectedModel: string,
    reasoningEnabled: boolean,
) => {
    const controller = new AbortController();
    const TypeWriterEffectThreshold = 30;
    const start = async() => {
        try {
            const payload = history.map((item) => {
                const { timestamp, attachment, ...rest } = item;
                return rest;
            });
            // if (inlineData?.data.length) {
            //     // console.log("有上传文件")
            //     prompts += "\n[上传文件内容]\n" + getDecodeBase64(inlineData.data)
            // } else {
            //     // console.log("没有上传文件")
            // }
            const data = {
                inputs: {},
                file_ids: inlineData?.data,
                query: prompts,
                user: "user-abc-0987654321",
                response_mode: "streaming",
                conversation_id: conversationId,
                base_model: selectedModel,
                reasoning_enabled: reasoningEnabled,
            };

            const isCustomGpt = Boolean(gid && gid !== "gptassistant");
            const useKernelProtocol = isCustomGpt || (isGptAssistant(gid) && useGptAssistantV2());
            let streamCb = function(chatResponse: any) {
                const reader = chatResponse.body?.getReader();
                const decoder = new TextDecoder("utf-8");
                read(reader, decoder, onChatMessage, useKernelProtocol);
            }
            // console.log("gid:"+gid)
            let path = useGptAssistantV2() ? "/api/chat-v2" : "/api/chat"
            if (gid && gid !== "gptassistant") {
                path = "/api/" + gid + "/chat-messages"
            }
            let chatResponse;
            try {
                chatResponse = await handleStreamingRequest('POST', getFullPath(path), JSON.stringify(data), {
                    'Content-Type': 'application/json'
                },streamCb, controller.signal);
                // 处理响应数据
                // console.log('请求成功:', chatResponse);
            } catch (error) {
                // 处理其他错误
                console.error('请求失败:', error);
                throw new Error(`请求失败：error`);
            }
            // const reader = chatResponse.body?.getReader();
            // const decoder = new TextDecoder('utf-8');
            // let buffer = ''
            // let bufferObj: any
            // let isFirstMessage = true
            // read(reader, decoder, buffer, bufferObj, isFirstMessage, onChatMessage);
        } catch (e) {
            // console.log("errr")
            const err = e as any;
            onChatMessage(err.message, true, "");
        }
    };
    return {
        start,
        abort:() => controller.abort()
    }
};
