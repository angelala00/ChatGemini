import { createParser, ParsedEvent, ReconnectInterval } from "eventsource-parser";
import { globalConfig } from "../config/global";

type OnMessage = (message: string, done: boolean) => void;

const baseURL = globalConfig.api ?? "";

async function request(
    path: string,
    payload: any,
    stream: boolean,
    onMessage: OnMessage
) {
    const response = await fetch(`${baseURL}${path}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(stream ? { Accept: "text/event-stream" } : {}),
        },
        body: JSON.stringify({ ...payload, stream }),
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    const isEventStream =
        response.headers.get("content-type")?.includes("text/event-stream") ??
        false;

    if (stream && isEventStream && response.body) {
        const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
            if ("data" in event) {
                const data = event.data;
                if (data === "[DONE]") {
                    onMessage("", true);
                } else {
                    try {
                        const json = JSON.parse(data);
                        onMessage(json.text ?? "", false);
                    } catch {
                        onMessage(data, false);
                    }
                }
            }
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            parser.feed(decoder.decode(value, { stream: true }));
        }
        onMessage("", true);
    } else {
        const text = await response.text();
        try {
            const json = JSON.parse(text);
            onMessage(json.text ?? "", true);
        } catch {
            onMessage(text, true);
        }
    }
}

export const chat = async (
    payload: any,
    stream: boolean,
    onMessage: OnMessage
) => {
    await request("/chat", payload, stream, onMessage);
};

export const vision = async (
    payload: any,
    stream: boolean,
    onMessage: OnMessage
) => {
    await request("/vision", payload, stream, onMessage);
};

export default { chat, vision };

