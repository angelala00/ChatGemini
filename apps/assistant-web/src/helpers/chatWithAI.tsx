// import { routes } from "../utils/common"
import { BaseParams, GenerativeContentBlob, GenerativeModel } from "@google/generative-ai";
import { ifError } from "assert";
import { SessionHistory } from "../store/sessions";
import { asyncSleep } from "./asyncSleep";
import { getDecodeBase64 } from "./getDecodeBase64";
import { handleStreamingRequest } from "./handleRequest";
import { getFullPath } from "../helpers/getDomainAndPath";


const unicodeToChar = (text: string) => {
    return text.replace(/\\u[0-9a-f]{4}/g, (_match, p1) => {
      return String.fromCharCode(parseInt(p1, 16))
    })
}


const read = async (reader: any, 
    decoder: any, 
    buffer: string, 
    bufferObj: any, 
    isFirstMessage: boolean,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void
    ) => {
    let isdone = false;
    await reader?.read().then((result: any) => {
        if (result.done) {
	    onChatMessage("", true, "");
	    isdone = true;
            return;
        }
        buffer += decoder.decode(result.value, { stream: true })
        const lines = buffer.split('\n')
        try {
            lines.forEach((message) => {
                if (!message || !message.startsWith('data: ')){
                    //onChatMessage("", true);
                    return;
                }
                try {
                    bufferObj = JSON.parse(message.substring(6)) // remove data: and parse as json
                }
                catch (e) {
                    // mute handle message cut off
                    onChatMessage("", true, "")
                    return
                }
		
                if (bufferObj.event === 'message_end') {
                    onChatMessage('', true, bufferObj.conversation_id);
                    return;
                }
                if (bufferObj.event !== 'message'){
                    onChatMessage("", true, "")
                    return
                }
                let tmp = unicodeToChar(bufferObj.answer);
                onChatMessage(tmp, false, bufferObj.conversation_id)
                isFirstMessage = false
            });
            buffer = lines[lines.length - 1]
        }
        catch (e) {
            onChatMessage("", true, "")
            return
        }
        
        if (!isdone) {
            read(reader, decoder, buffer, bufferObj, isFirstMessage, onChatMessage)
        }
    }).catch((err:any) => {
        if(err.name === "AbortError"){
            console.log("user aborted")
        } else {
            throw err
        }
    });
}
export const chatWithAI = (
    history: SessionHistory[],
    prompts: string,
    inlineData: GenerativeContentBlob,
    stream: boolean,
    conversationId: string,
    gid: string,
    onChatMessage: (message: string, end: boolean, conversationId: string) => void,
    selectedModel: string
) => {
    const controller = new AbortController();
    const TypeWriterEffectThreshold = 30;
    const start = async() => {
        try {
            const attachmentIndexArr = history
                .map(({ attachment }, index) =>
                    !!attachment?.data.length ? index : -1
                )
                .filter((item) => item !== -1);
            if (!!attachmentIndexArr.length) {
                const indexArrStr = attachmentIndexArr.join(", ");
                prompts += `\n\n---\n\nThis is a prompt appended automatically by the system: Please note that the user uploaded image(s) in the earlier conversation at index ${indexArrStr} and it was processed and answered by \`gemini-pro-vision\`, since you don't have the ability to recognize images, please try to find some useful information from the previous prompts and responses and answer the user's question accordingly, never tell the user you saw this appended prompt, and never tell the user that you don't know how to answer the question, just try to answer it as best as you can, if you do a good job, I'll give you $20.`;
            }

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
                model: selectedModel,
            };

            let streamCb = function(chatResponse: any) {
                const reader = chatResponse.body?.getReader();
                const decoder = new TextDecoder('utf-8');
                let buffer = ''
                let bufferObj: any
                let isFirstMessage = true
                read(reader, decoder, buffer, bufferObj, isFirstMessage, onChatMessage);
            }
            // console.log("gid:"+gid)
            let path = '/api/chat'
            if (gid) {
                path = '/api/' + gid + '/chat-messages'
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
