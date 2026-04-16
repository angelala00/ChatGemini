import { CapabilityBadge, StatusBadge } from "./badges";
import { UserVisibilityResponse, VisibleModelGroup } from "./types";

interface ModelMarketPageProps {
    modelsLoading: boolean;
    modelsError: string | null;
    visibleModels: UserVisibilityResponse | null;
    groupedVisibleModels: VisibleModelGroup[];
}

const ModelMarketPage = ({
    modelsLoading,
    modelsError,
    visibleModels,
    groupedVisibleModels,
}: ModelMarketPageProps) => (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold">模型广场</h2>
            <p className="mt-3 text-sm text-slate-600">
                查看你的可见模型清单。
            </p>
            <div className="mt-6 flex flex-col gap-4">
                {modelsLoading && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        正在加载模型...
                    </div>
                )}
                {modelsError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                        {modelsError}
                    </div>
                )}
                {!modelsLoading && visibleModels && (
                    <div className="space-y-6">
                        {groupedVisibleModels.map((group) => (
                            <div key={group.type}>
                                <div className="text-xs uppercase tracking-widest text-slate-400">
                                    {group.type}
                                </div>
                                <div className="mt-3 grid gap-4 md:grid-cols-2">
                                    {group.models.map((model) => {
                                        const capabilityEntries = [
                                            {
                                                label: "图片输入",
                                                value: model.supports_image_input,
                                            },
                                            {
                                                label: "思考开关",
                                                value: model.supports_reasoning,
                                            },
                                            {
                                                label: "工具调用",
                                                value: model.supports_tool_calling,
                                            },
                                        ].filter(
                                            (
                                                item,
                                            ): item is {
                                                label: string;
                                                value: boolean;
                                            } => typeof item.value === "boolean",
                                        );
                                        const thinkingFormatLabel =
                                            model.thinking_format?.trim() || "";

                                        return (
                                            <div
                                                key={model.name}
                                                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                            >
                                                <div className="text-sm font-semibold text-slate-800">
                                                    {model.name}
                                                </div>
                                                {(model.is_new || model.sunset_soon) && (
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {model.is_new && (
                                                            <StatusBadge tone="accent">
                                                                新上
                                                            </StatusBadge>
                                                        )}
                                                        {model.sunset_soon && (
                                                            <StatusBadge tone="warning">
                                                                即将下线
                                                            </StatusBadge>
                                                        )}
                                                    </div>
                                                )}
                                                {capabilityEntries.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                        {capabilityEntries.map((item) => (
                                                            <CapabilityBadge
                                                                key={`${model.name}-${item.label}`}
                                                                supported={item.value}
                                                            >
                                                                {item.label}
                                                            </CapabilityBadge>
                                                        ))}
                                                    </div>
                                                )}
                                                {thinkingFormatLabel && (
                                                    <div className="mt-3">
                                                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                                            思考格式 · {thinkingFormatLabel}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {!modelsLoading && visibleModels && visibleModels.models.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        暂无可用模型
                    </div>
                )}
            </div>
        </div>
    </div>
);

export default ModelMarketPage;
