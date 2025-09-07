import { asyncSleep } from "./asyncSleep";
import { chat, vision } from "./api";
import { Attachment, SessionHistory } from "../store/sessions";

export const getAiContent = async (
    history: SessionHistory[],
    prompts: string,
    inlineData: Attachment,
    stream: boolean,
    onMessage: (message: string, end: boolean) => void
) => {
    const TypeWriterEffectThreshold = 30;
    try {
        if (inlineData?.data.length) {
            if (stream) {
                await vision(
                    { prompt: prompts, image: inlineData },
                    true,
                    async (chunk, end) => {
                        if (end) return;
                        const chunkText = chunk;
                        if (chunkText.length > TypeWriterEffectThreshold) {
                            const chunkTextArr = chunkText.split("");
                            for (
                                let i = 0;
                                i < chunkTextArr.length;
                                i += TypeWriterEffectThreshold
                            ) {
                                onMessage(
                                    chunkTextArr
                                        .slice(i, i + TypeWriterEffectThreshold)
                                        .join(""),
                                    false
                                );
                                await asyncSleep(Math.random() * 600 + 300);
                            }
                        } else {
                            onMessage(chunkText, false);
                        }
                    }
                );
                onMessage("", true);
            } else {
                await vision(
                    { prompt: prompts, image: inlineData },
                    false,
                    async (text) => {
                        const chunkText = text;
                        if (chunkText.length > TypeWriterEffectThreshold) {
                            const textArr = chunkText.split("");
                            for (
                                let i = 0;
                                i < textArr.length;
                                i += TypeWriterEffectThreshold
                            ) {
                                onMessage(
                                    textArr
                                        .slice(i, i + TypeWriterEffectThreshold)
                                        .join(""),
                                    false
                                );
                                await asyncSleep(Math.random() * 600 + 300);
                            }
                        } else {
                            onMessage(chunkText, false);
                        }
                    }
                );
                onMessage("", true);
            }
        } else {
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

            if (stream) {
                await chat(
                    { history: payload, prompt: prompts },
                    true,
                    async (chunk, end) => {
                        if (end) return;
                        const chunkText = chunk;
                        if (chunkText.length > TypeWriterEffectThreshold) {
                            const chunkTextArr = chunkText.split("");
                            for (
                                let i = 0;
                                i < chunkTextArr.length;
                                i += TypeWriterEffectThreshold
                            ) {
                                onMessage(
                                    chunkTextArr
                                        .slice(i, i + TypeWriterEffectThreshold)
                                        .join(""),
                                    false
                                );
                                await asyncSleep(Math.random() * 600 + 300);
                            }
                        } else {
                            onMessage(chunkText, false);
                        }
                    }
                );
                onMessage("", true);
            } else {
                await chat(
                    { history: payload, prompt: prompts },
                    false,
                    async (text) => {
                        const chunkText = text;
                        if (chunkText.length > TypeWriterEffectThreshold) {
                            const textArr = chunkText.split("");
                            for (
                                let i = 0;
                                i < textArr.length;
                                i += TypeWriterEffectThreshold
                            ) {
                                onMessage(
                                    textArr
                                        .slice(i, i + TypeWriterEffectThreshold)
                                        .join(""),
                                    false
                                );
                                await asyncSleep(Math.random() * 600 + 300);
                            }
                        } else {
                            onMessage(chunkText, false);
                        }
                    }
                );
                onMessage("", true);
            }
        }
    } catch (e) {
        const err = e as any;
        onMessage(err.message, true);
    }
};
