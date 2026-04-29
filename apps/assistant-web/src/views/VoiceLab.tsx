import { useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowPathIcon,
    CheckCircleIcon,
    MicrophoneIcon,
    PauseCircleIcon,
    PlayCircleIcon,
    SpeakerWaveIcon,
    StopCircleIcon,
    XCircleIcon,
} from "@heroicons/react/24/outline";
import { getFullPath } from "../helpers/getDomainAndPath";

type PermissionState = "loading" | "allowed" | "denied" | "error";
type RecorderState = "idle" | "recording" | "ready" | "error";

const supportLabel = (supported: boolean) => (supported ? "支持" : "不支持");

const VoiceLab = () => {
    const [permissionState, setPermissionState] = useState<PermissionState>("loading");
    const [permissionMessage, setPermissionMessage] = useState("");
    const [recorderState, setRecorderState] = useState<RecorderState>("idle");
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [audioUrl, setAudioUrl] = useState("");
    const [recordingError, setRecordingError] = useState("");
    const [speechText, setSpeechText] = useState("这是一段语音输出测试。");
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const timerRef = useRef<number | null>(null);
    const audioUrlRef = useRef("");

    const support = useMemo(() => {
        const hasMediaDevices = typeof navigator !== "undefined" && !!navigator.mediaDevices;
        return {
            secureContext: typeof window !== "undefined" && window.isSecureContext,
            mediaDevices: hasMediaDevices,
            getUserMedia: hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === "function",
            mediaRecorder: typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined",
            speechSynthesis: typeof window !== "undefined" && "speechSynthesis" in window,
        };
    }, []);

    const stopTimer = () => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    useEffect(() => {
        let cancelled = false;
        fetch(getFullPath("/api/voice-lab/status"), {
            method: "GET",
            credentials: "include",
        })
            .then((response) => {
                if (cancelled) {
                    return;
                }
                if (response.ok) {
                    setPermissionState("allowed");
                    setPermissionMessage("当前账号已开启语音实验室。");
                    return;
                }
                if (response.status === 403) {
                    setPermissionState("denied");
                    setPermissionMessage("当前账号没有语音实验室权限。");
                    return;
                }
                setPermissionState("error");
                setPermissionMessage(`权限检查失败：${response.status}`);
            })
            .catch((error) => {
                if (cancelled) {
                    return;
                }
                setPermissionState("error");
                setPermissionMessage(error instanceof Error ? error.message : "权限检查失败");
            });
        return () => {
            cancelled = true;
            stopTimer();
            stopStream();
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = "";
            }
        };
    }, []);

    const startRecording = async () => {
        setRecordingError("");
        if (!support.getUserMedia || !support.mediaRecorder) {
            setRecorderState("error");
            setRecordingError("当前环境不支持浏览器录音能力。");
            return;
        }
        try {
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = "";
                setAudioUrl("");
            }
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            chunksRef.current = [];
            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                });
                const nextAudioUrl = URL.createObjectURL(blob);
                audioUrlRef.current = nextAudioUrl;
                setAudioUrl(nextAudioUrl);
                setRecorderState("ready");
                stopTimer();
                stopStream();
            };
            recorder.start();
            setRecordingSeconds(0);
            setRecorderState("recording");
            timerRef.current = window.setInterval(() => {
                setRecordingSeconds((value) => value + 1);
            }, 1000);
        } catch (error) {
            setRecorderState("error");
            setRecordingError(error instanceof Error ? error.message : "麦克风授权或录音启动失败");
            stopTimer();
            stopStream();
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    };

    const speak = () => {
        if (!support.speechSynthesis) {
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(speechText || "语音输出测试");
        utterance.lang = "zh-CN";
        window.speechSynthesis.speak(utterance);
    };

    const stopSpeak = () => {
        if (support.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    };

    const statusItems = [
        ["安全上下文", support.secureContext],
        ["mediaDevices", support.mediaDevices],
        ["getUserMedia", support.getUserMedia],
        ["MediaRecorder", support.mediaRecorder],
        ["speechSynthesis", support.speechSynthesis],
    ] as const;

    return (
        <main className="min-h-screen bg-[linear-gradient(180deg,rgba(247,250,252,0.98),rgba(243,247,250,0.98))] px-5 py-8 text-[#2f3a46]">
            <div className="mx-auto flex max-w-[920px] flex-col gap-5">
                <header>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#87919d]">
                        Voice Lab
                    </p>
                    <h1 className="mt-2 text-2xl font-semibold tracking-[0] text-[#2f3a46]">
                        语音能力测试
                    </h1>
                    <p className="mt-2 max-w-[680px] text-sm leading-6 text-[#66717d]">
                        用于验证当前浏览器或企微内嵌环境是否支持麦克风录音、录音回放和浏览器语音输出。
                    </p>
                </header>

                <section className="rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        {permissionState === "allowed" ? (
                            <CheckCircleIcon className="size-5 text-[#279ab3]" />
                        ) : permissionState === "loading" ? (
                            <ArrowPathIcon className="size-5 animate-spin text-[#87919d]" />
                        ) : (
                            <XCircleIcon className="size-5 text-red-600" />
                        )}
                        <span>{permissionMessage || "正在检查语音实验室权限..."}</span>
                    </div>
                </section>

                {permissionState === "allowed" && (
                    <>
                        <section className="grid gap-3 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                            <h2 className="text-base font-semibold">环境能力</h2>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {statusItems.map(([label, supported]) => (
                                    <div
                                        key={label}
                                        className="flex items-center justify-between rounded-xl bg-[#f6f8fa] px-3 py-2 text-sm"
                                    >
                                        <span className="text-[#66717d]">{label}</span>
                                        <span className={supported ? "font-semibold text-[#2f3a46]" : "font-semibold text-red-700"}>
                                            {supportLabel(supported)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="grid gap-4 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                            <div className="flex items-center gap-2">
                                <MicrophoneIcon className="size-5 text-[#66717d]" />
                                <h2 className="text-base font-semibold">语音输入探测</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {recorderState !== "recording" ? (
                                    <button
                                        type="button"
                                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2f3a46] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#202936]"
                                        onClick={startRecording}
                                    >
                                        <MicrophoneIcon className="size-4" />
                                        开始录音
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                                        onClick={stopRecording}
                                    >
                                        <StopCircleIcon className="size-4" />
                                        停止录音
                                    </button>
                                )}
                                <span className="text-sm text-[#66717d]">
                                    状态：{recorderState === "recording" ? `录音中 ${recordingSeconds}s` : recorderState === "ready" ? "已生成录音" : recorderState === "error" ? "异常" : "待测试"}
                                </span>
                            </div>
                            {recordingError && (
                                <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                                    {recordingError}
                                </div>
                            )}
                            {audioUrl && (
                                <audio className="w-full" controls src={audioUrl}>
                                    <track kind="captions" />
                                </audio>
                            )}
                        </section>

                        <section className="grid gap-4 rounded-[18px] border border-[#e7edf2] bg-white/95 p-5 shadow-[0_18px_38px_rgba(23,28,38,0.06)]">
                            <div className="flex items-center gap-2">
                                <SpeakerWaveIcon className="size-5 text-[#66717d]" />
                                <h2 className="text-base font-semibold">语音输出探测</h2>
                            </div>
                            <textarea
                                className="min-h-24 resize-none rounded-xl border border-[#d4dde5] bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#bddfe6] focus:ring-4 focus:ring-[#47b9d2]/10"
                                value={speechText}
                                onChange={(event) => setSpeechText(event.target.value)}
                            />
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2f3a46] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#202936] disabled:cursor-not-allowed disabled:bg-[#c3ccd4]"
                                    disabled={!support.speechSynthesis}
                                    onClick={speak}
                                >
                                    <PlayCircleIcon className="size-4" />
                                    播放测试
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d4dde5] px-4 text-sm font-semibold text-[#2f3a46] transition-colors hover:bg-[#f6f8fa] disabled:cursor-not-allowed disabled:text-[#a0a9b2]"
                                    disabled={!support.speechSynthesis}
                                    onClick={stopSpeak}
                                >
                                    <PauseCircleIcon className="size-4" />
                                    停止播放
                                </button>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
};

export default VoiceLab;
