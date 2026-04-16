export const StatusBadge = ({
    children,
    tone,
}: {
    children: string;
    tone: "accent" | "warning";
}) => {
    const toneClasses =
        tone === "accent"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-slate-300 bg-slate-100 text-slate-600";
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClasses}`}
        >
            {children}
        </span>
    );
};

export const CapabilityBadge = ({
    children,
    supported,
}: {
    children: string;
    supported: boolean;
}) => (
    <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            supported
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-slate-100 text-slate-500"
        }`}
    >
        {children} · {supported ? "支持" : "不支持"}
    </span>
);
