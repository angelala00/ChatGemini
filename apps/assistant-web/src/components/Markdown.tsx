import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import { lazy, Suspense, useEffect, useState } from "react";
import { Prism } from "react-syntax-highlighter";
import { setClipboardText } from "../helpers/setClipboardText";
import { a11yDark as style } from "react-syntax-highlighter/dist/esm/styles/prism";
import userThrottle from "../helpers/userThrottle";
import userDebounce from "../helpers/userDebounce";
import type { Point } from "unist";
import { isObjectEqual } from "../helpers/isObjectEqual";
import { getPythonResult } from "../helpers/getPythonResult";
import type { PyodideInterface } from "../types/pyodide";
import { getPythonRuntime } from "../helpers/getPythonRuntime";
import { useTranslation } from "react-i18next";
import { getFullPath } from "../helpers/getDomainAndPath";
const LazyECharts = lazy(() =>
    import("./ECharts").then((module) => ({ default: module.ECharts }))
);
import "katex/dist/katex.min.css";

interface MarkdownProps {
    readonly className?: string;
    readonly typingEffect: string;
    readonly pythonRepoUrl: string;
    readonly pythonRuntime: PyodideInterface | null;
    readonly onPythonRuntimeCreated: (pyodide: PyodideInterface) => void;
    readonly children: string;
}

interface ThinkStep {
    readonly summary: string;
    readonly content: string;
}

interface ThinkingNode {
    readonly kind: "thought" | "tool";
    readonly summary: string;
    readonly content: string;
}

const TraceLog = "😈 [TRACE]";
const DebugLog = "🚀 [DEBUG]";
const ErrorLog = "🤬 [ERROR]";
const PythonScriptDisplayName = "script.py";
const RunnerResultPlaceholder = `\n${DebugLog} Running Python Script...`;
const TypingEffectPlaceholder = "❚";
const ShellPrompt = `[user@${Math.random().toString(16).slice(-12)} ~]$ `;

export const Markdown = (props: MarkdownProps) => {
    const { t } = useTranslation();
    const {
        className,
        typingEffect,
        pythonRepoUrl,
        pythonRuntime,
        onPythonRuntimeCreated,
        children,
    } = props;

    const [pythonResult, setPythonResult] = useState<{
        result: string;
        startPos: Point | null;
        endPos: Point | null;
    }>({ result: "", startPos: null, endPos: null });

    const handleCopyCode = userThrottle(
        async (code: string, currentTarget: EventTarget) => {
            const success = await setClipboardText(code);
            const innerText = (currentTarget as HTMLButtonElement).innerText;
            (currentTarget as HTMLButtonElement).innerText = success
                ? t("components.Markdown.handleCopyCode.copy_success")
                : t("components.Markdown.handleCopyCode.copy_failed");
            setTimeout(() => {
                (currentTarget as HTMLButtonElement).innerText = innerText;
            }, 1000);
        },
        1200
    );

    const handleRunnerResult = (x: string) =>
        setPythonResult((prev) => {
            let result = prev.result.replace(RunnerResultPlaceholder, "");
            if (result.includes(TraceLog)) {
                result = result
                    .split("\n")
                    .filter((x) => !x.includes(TraceLog))
                    .join("\n");
            }
            return { ...prev, result: `${result}\n${x}` };
        });

    const handleRunnerImporting = (x: string, err: boolean) =>
        setPythonResult((prev) => {
            let { result } = prev;
            if (err) {
                result += `\n${ErrorLog} ${x}`;
            } else {
                result += `\n${TraceLog} ${x}`;
            }
            return { ...prev, result };
        });

    const handleJobFinished = () =>
        setPythonResult((prev) => {
            let { result } = prev;
            result += `\n${ShellPrompt}${TypingEffectPlaceholder}`;
            return { ...prev, result };
        });

    const handleRunPython = userDebounce(
        async (
            startPos: Point | null,
            endPos: Point | null,
            code: string,
            currentTarget: EventTarget
        ) => {
            (currentTarget as HTMLButtonElement).disabled = true;
            setPythonResult({
                result: `${ShellPrompt}python3 ${PythonScriptDisplayName}${RunnerResultPlaceholder}`,
                startPos,
                endPos,
            });
            let runtime = pythonRuntime;
            if (!runtime) {
                runtime = await getPythonRuntime(pythonRepoUrl);
                onPythonRuntimeCreated(runtime);
            }
            await getPythonResult(
                runtime,
                code,
                handleRunnerResult,
                handleRunnerResult,
                handleRunnerImporting,
                handleRunnerResult,
                handleJobFinished
            );
            (currentTarget as HTMLButtonElement).disabled = false;
        },
        300
    );

    const [isThinkingExpanded, setIsThinkingExpanded] = useState(false);
    
    // 解析 Markdown 中的超链接
    // 如果为"/api/"开头，是在调用后端的 API 服务，则获取完整路径
    const resolveMdHref = (href?: string) => {
        if (!href) return href;
        console.log("调用中", href, href.startsWith("/api/"), getFullPath(href))
        if (href.startsWith("/api/")) return getFullPath(href);
        return href;
    }

    // const thinkRegex = /^<think>(.*?)<\/think>/s;
    // const match = children.match(thinkRegex);
    let markdownContent = children;
    const thinkRegex = /<think>(.*?)<\/think>/gs;
    const matches = Array.from(children.matchAll(thinkRegex));
    let thinkTexts: string[] = [];
    if (matches.length > 0) {
        // thinkText = match[1].trim(); // 获取 <think>...</think> 之间的文本
        thinkTexts = matches.map(m => m[1].trim()); // 获取 <think>...</think> 之间的文本
        markdownContent = children.replace(thinkRegex, "").trim(); // 去除 <think> 部分
    }
    // console.log("children:"+children)
    // console.log("matches.length" + matches.length)
    // console.log("thinkTexts.length" + thinkTexts.length)
    
    let isThinking = markdownContent.startsWith("<think>");
    if (isThinking) {
        thinkTexts.push(markdownContent.replace(/^<think>/, "").replace(typingEffect, "").trim());
        markdownContent = "";
    }
    function extractSteps(str: string){
        const regex = /<step>([\s\S]*?)(?=<\/step>|$)/g;
        let match;
        const steps = [];
        while ((match = regex.exec(str)) !== null){
            steps.push(match[1])
        }
        return steps;
    }
    function parseStep(raw: string): ThinkStep | null{
        const re = /^<summary>([\s\S]*?)<\/summary>([\s\S]*)$/;
        const m = re.exec(raw.trim());
        if (m) {
            return {"summary":m[1].trim(),"content":m[2].trim()}
        }
        return null
    }
    const mergeToolSteps = (steps: Array<ThinkStep | null>): ThinkStep[] => {
        const filtered = steps.filter((step): step is ThinkStep => step !== null);
        const merged: ThinkStep[] = [];
        for (let index = 0; index < filtered.length; index += 1) {
            const current = filtered[index];
            const next = filtered[index + 1];
            if (
                current &&
                next &&
                current.summary === "工具调用中" &&
                next.summary === "工具调用结果"
            ) {
                merged.push({
                    summary: "工具调用",
                    content: `${current.content} ${next.content}`.trim(),
                });
                index += 1;
                continue;
            }
            merged.push(current);
        }
        return merged;
    };
    const thinkingNodes: ThinkingNode[] = thinkTexts.flatMap((text) => {
        const parsedSteps = mergeToolSteps(extractSteps(text).map(parseStep));
        if (parsedSteps.length > 0) {
            return parsedSteps.map((step) => ({
                kind: step.summary === "工具调用" ? "tool" : "thought",
                summary: step.summary,
                content: step.content,
            }));
        }
        const trimmed = text.trim();
        if (!trimmed) {
            return [];
        }
        return [
            {
                kind: "thought",
                summary: "思考",
                content: trimmed,
            },
        ];
    });
    const thinkingCompleted = !isThinking && thinkingNodes.length > 0;
    const thinkingTitle = thinkingCompleted
        ? t("components.Markdown.thinking_title_done")
        : t("components.Markdown.thinking_title_pending");

    useEffect(() => {
        setPythonResult({ result: "", startPos: null, endPos: null });
    }, [t, children]);

    return (
        <div className={`relative ${className ?? ""}`}>
            {/* 如果有 <think> 标签，则显示思考内容 */}
            {thinkingNodes.length > 0 && (
                <div className="mb-4">
                    <button
                        type="button"
                        className="thought-toggle"
                        onClick={() => setIsThinkingExpanded(!isThinkingExpanded)}
                    >
                        <span className="thought-toggle-label">{thinkingTitle}</span>
                        <span className="thought-toggle-caret" aria-hidden="true">
                            {isThinkingExpanded ? "∨" : ">"}
                        </span>
                    </button>
                    {isThinkingExpanded ? (
                        <div className="thought-thread">
                            {thinkingNodes.map((node, index) => (
                                <div key={index} className={`thought-node ${node.kind}`}>
                                    <div className="thought-node-body">
                                        {node.content.replace(/\s*\n+\s*/g, " ").trim()}
                                    </div>
                                </div>
                            ))}
                            {thinkingCompleted && (
                                <div className="thought-node complete">
                                    <div className="thought-node-body">思考完成</div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            )}
        
            <ReactMarkdown
                className={`prose min-w-0 max-w-full break-words text-[15px] leading-[1.7] [overflow-wrap:anywhere] prose-p:leading-[1.7] ${
                    className ?? ""
                }`}
                children={markdownContent}
                components={{
                    // 对回复（Markdown）中的超链接进行处理：
                    // 如果是相对地址（`/api`开头），则为调用后端的 API 链接，故用 getFullPath 添加上后端的 API 域名
                    a: ({ node, ...props }) => (
                        <a
                            {...props}
                            href={resolveMdHref(props.href)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {props.children}
                        </a>
                    ),
                    pre: ({ node, ...props }) => (
                        <pre className="bg-transparent p-2" {...props} />
                    ),
                    code: ({ className, children, node }) => {
                        const match = /language-(\w+)/.exec(className ?? "");
                        const lang = match !== null ? match[1] : "";
                        const code = (
                            !!children ? String(children) : TypingEffectPlaceholder
                        ).replace(typingEffect, TypingEffectPlaceholder);
                        const startPos = node?.position?.start ?? null;
                        const endPos = node?.position?.end ?? null;
                        if (lang === "echarts") {
                            try {
                                const trimmed = code.replace(/\n$/, "");
                                // console.log('trimmed:' + trimmed)
                                let option;
                                try{
                                    option = JSON.parse(trimmed);
                                } catch {
                                    option = new Function(`return (${trimmed})`)();
                                }
                                return (
                                    <Suspense
                                        fallback={
                                            <span className="text-gray-500">
                                                {t(
                                                    "components.Markdown.echarts_rendering"
                                                )}
                                            </span>
                                        }
                                    >
                                        <LazyECharts option={option} />
                                    </Suspense>
                                );
                            } catch (e) {
                                console.log(code)
                                console.log(e)
                                const isIncomplete =
                                    code.includes(TypingEffectPlaceholder);
                                return (
                                    <code
                                        className={
                                            isIncomplete ? "text-gray-700" : "text-red-700"
                                        }
                                    >
                                        {isIncomplete
                                            ? t("components.Markdown.echarts_rendering")
                                            : t(
                                                  "components.Markdown.echarts_render_failed"
                                              )}
                                    </code>
                                );
                            }
                        }
                        return match ? (
                            <>
                                <Prism
                                    PreTag={"div"}
                                    style={style}
                                    language={lang}
                                    showLineNumbers={true}
                                    lineNumberStyle={{ opacity: 0.5 }}
                                    children={code.replace(/\n$/, "")}
                                />
                                <div className="flex gap-2">
                                    <button
                                        className="text-gray-700/100 text-xs hover:opacity-50"
                                        onClick={({ currentTarget }) =>
                                            handleCopyCode(code, currentTarget)
                                        }
                                    >
                                        {t("components.Markdown.copy_code")}
                                    </button>
                                    {!code.includes(TypingEffectPlaceholder) &&
                                        lang === "python" && (
                                            <button
                                                className="text-gray-700/100 text-xs hover:opacity-50"
                                                onClick={({ currentTarget }) =>
                                                    handleRunPython(
                                                        startPos,
                                                        endPos,
                                                        code,
                                                        currentTarget
                                                    )
                                                }
                                            >
                                                {t(
                                                    "components.Markdown.run_script"
                                                )}
                                            </button>
                                        )}
                                </div>
                                {isObjectEqual(
                                    pythonResult.startPos ?? {},
                                    startPos ?? {}
                                ) &&
                                    isObjectEqual(
                                        pythonResult.endPos ?? {},
                                        endPos ?? {}
                                    ) &&
                                    !!pythonResult.result.length && (
                                        <>
                                            <Prism
                                                language="shell"
                                                PreTag={"div"}
                                                style={style}
                                                children={pythonResult.result.replace(
                                                    /\n$/,
                                                    ""
                                                )}
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    className="text-gray-700/100 text-xs hover:opacity-50"
                                                    onClick={({ currentTarget }) =>
                                                        handleCopyCode(
                                                            pythonResult.result,
                                                            currentTarget
                                                        )
                                                    }
                                                >
                                                    {t(
                                                        "components.Markdown.copy_result"
                                                    )}
                                                </button>
                                                <button
                                                    className="text-gray-700/100 text-xs hover:opacity-50"
                                                    onClick={() =>
                                                        setPythonResult({
                                                            result: "",
                                                            startPos: null,
                                                            endPos: null,
                                                        })
                                                    }
                                                >
                                                    {t(
                                                        "components.Markdown.close_window"
                                                    )}
                                                </button>
                                            </div>
                                        </>
                                    )}
                            </>
                        ) : (
                            <code className="text-gray-700">
                                {code.replace(/\n$/, "")}
                            </code>
                        );
                    },
                    table: ({ node, ...props }) => (
                        <table
                            className="overflow-x-auto block whitespace-nowrap"
                            {...props}
                        />
                    ),
                }}
                urlTransform={(url) => url}
                rehypePlugins={[rehypeKatex, rehypeRaw]}
                remarkPlugins={[remarkGfm, remarkMath]}
            />
        </div>
    );
};
