import { asyncSleep } from "./asyncSleep";
import { vision } from "./api";
import { Attachment } from "../store/sessions";

export const getAiContent = async (
    prompts: string,
    inlineData: Attachment,
    stream: boolean,
    onContentMessage: (message: string, end: boolean) => void
) => {
    const TypeWriterEffectThreshold = 30;
    try {
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
                            onContentMessage(
                                chunkTextArr
                                    .slice(i, i + TypeWriterEffectThreshold)
                                    .join(""),
                                false
                            );
                            await asyncSleep(Math.random() * 600 + 300);
                        }
                    } else {
                        onContentMessage(chunkText, false);
                    }
                }
            );
            onContentMessage("", true);
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
                            onContentMessage(
                                textArr
                                    .slice(i, i + TypeWriterEffectThreshold)
                                    .join(""),
                                false
                            );
                            await asyncSleep(Math.random() * 600 + 300);
                        }
                    } else {
                        onContentMessage(chunkText, false);
                    }
                }
            );
            onContentMessage("", true);
        }
    } catch (e) {
        const err = e as any;
        onContentMessage(err.message, true);
    }
};
