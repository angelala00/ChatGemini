import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ArrowLeftIcon,
    CheckIcon,
    CpuChipIcon,
    DocumentTextIcon,
    LockClosedIcon,
    PlusIcon,
    SparklesIcon,
    TrashIcon,
    UsersIcon,
} from "@heroicons/react/24/outline";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";
import { handleRequest } from "../helpers/handleRequest";

interface KnowledgeFile {
    readonly file_id: string;
    readonly filename: string;
    readonly size_bytes?: number;
}

interface AvailableModel {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
}

const fieldClassName =
    "mt-2 w-full rounded-[14px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.88)] px-3.5 py-2.5 text-sm text-[var(--assist-text)] shadow-[var(--assist-shadow-sm)] outline-none transition placeholder:text-[var(--assist-text-faint)] focus:border-[var(--assist-accent)] focus:ring-2 focus:ring-[var(--assist-accent)]/15";

const formatFileSize = (size?: number) => {
    if (!size || size < 1) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const CreateGpt = () => {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [samples, setSamples] = useState<string[]>([""]);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [authType, setAuthType] = useState<"self" | "white" | "all">("all");
    const [authUsers, setAuthUsers] = useState("");
    const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
    const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
    const [preferredModel, setPreferredModel] = useState("");
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState("");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const gid = searchParams.get("gid");
    const { t } = useTranslation();
    const MAX_SAMPLES = 5;

    const handleSampleChange = (index: number, value: string) => {
        const previousValue = samples[index];
        const newSamples = [...samples];
        newSamples[index] = value;
        if (index === samples.length - 1 && value !== "" && samples.length < MAX_SAMPLES) {
            newSamples.push("");
        } else if (value === "" && previousValue !== "") {
            newSamples.splice(index, 1);
            setSamples(newSamples);
            setTimeout(() => inputRefs.current[Math.min(index, newSamples.length - 1)]?.focus(), 0);
            return;
        }
        setSamples(newSamples);
    };

    const handleRemoveSample = (index: number) => {
        const newSamples = samples.filter((_, currentIndex) => currentIndex !== index);
        if (
            newSamples.length === 0 ||
            (newSamples[newSamples.length - 1] !== "" && newSamples.length < MAX_SAMPLES)
        ) {
            newSamples.push("");
        }
        setSamples(newSamples);
        setTimeout(() => inputRefs.current[Math.min(index, newSamples.length - 1)]?.focus(), 0);
    };

    useEffect(() => {
        if (!gid) return;
        fetch(getFullPath(`/api/gpts/detail/${gid}`), {})
            .then((res) => res.json())
            .then((data) => {
                setName(data.name ?? "");
                setDesc(data.desc ?? "");
                setSystemPrompt(data.system_prompt ?? "");
                if (typeof data.default_model === "string" && data.default_model) {
                    setPreferredModel(data.default_model);
                }
                const sampleData = data.samples ?? [];
                setSamples(sampleData.length ? [...sampleData, ""] : [""]);
                if (data.auth) {
                    setAuthType(data.auth.type ?? "all");
                    if (data.auth.type === "white") {
                        setAuthUsers((data.auth.user || []).join(","));
                    }
                }
            })
            .catch(() => {});
        handleRequest("GET", getFullPath(`/api/gpts/${gid}/knowledge-files`))
            .then((data) => setKnowledgeFiles(Array.isArray(data) ? data : []))
            .catch(() => setKnowledgeFiles([]));
    }, [gid]);

    useEffect(() => {
        handleRequest("GET", getFullPath("/api/gpts/available-models"))
            .then((data) => {
                const nextModels = Array.isArray(data.models)
                    ? data.models.filter(
                          (item: unknown): item is AvailableModel =>
                              !!item &&
                              typeof item === "object" &&
                              typeof (item as AvailableModel).id === "string" &&
                              typeof (item as AvailableModel).name === "string",
                      )
                    : [];
                setAvailableModels(nextModels);
                setPreferredModel(
                    (current) => current || data.default_model || nextModels[0]?.id || "",
                );
            })
            .catch(() => setAvailableModels([]))
            .finally(() => setModelsLoaded(true));
    }, []);

    const handleKnowledgeUpload = async (file: File) => {
        if (!gid || isUploading) return;
        setIsUploading(true);
        setMessage("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("model_id", "auto");
            formData.append("gid", gid);
            formData.append("purpose", "assistant_knowledge");
            await handleRequest("POST", getFullPath("/api/upload"), formData);
            const items = await handleRequest("GET", getFullPath(`/api/gpts/${gid}/knowledge-files`));
            setKnowledgeFiles(Array.isArray(items) ? items : []);
        } catch {
            setMessage(t("views.CreateGpt.knowledge_upload_failed"));
        } finally {
            setIsUploading(false);
        }
    };

    const handleKnowledgeDelete = async (fileId: string) => {
        if (!gid) return;
        try {
            await handleRequest("DELETE", getFullPath(`/api/gpts/${gid}/knowledge-files/${fileId}`));
            setKnowledgeFiles((items) => items.filter((item) => item.file_id !== fileId));
        } catch {
            setMessage(t("views.CreateGpt.knowledge_delete_failed"));
        }
    };

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        const body: Record<string, any> = {
            name,
            desc,
            system_prompt: systemPrompt,
            default_model: preferredModel,
        };
        const sanitizedSamples = samples.map((sample) => sample.trim()).filter(Boolean);
        if (sanitizedSamples.length > 0) {
            body.samples = sanitizedSamples;
        }
        body.auth =
            authType === "white"
                ? {
                      type: "white",
                      user: authUsers
                          .split(",")
                          .map((user) => user.trim())
                          .filter(Boolean),
                  }
                : { type: authType };
        const method = gid ? "PUT" : "POST";
        const url = gid ? getFullPath(`/api/gpts/${gid}`) : getFullPath("/api/gpts");
        handleRequest(method, url, JSON.stringify(body), { "Content-Type": "application/json" })
            .then((data) => {
                if (gid) {
                    navigate("/my-gpts");
                } else {
                    navigate(`/gpts/create?gid=${data.gid}`, { replace: true });
                    setMessage(t("views.CreateGpt.created_upload_hint"));
                }
            })
            .catch(() => setMessage(t("views.CreateGpt.submit_failed")))
            .finally(() => setIsSubmitting(false));
    };

    const authOptions = [
        { value: "self" as const, label: t("views.CreateGpt.permission_self"), icon: LockClosedIcon },
        { value: "white" as const, label: t("views.CreateGpt.permission_white"), icon: UsersIcon },
        { value: "all" as const, label: t("views.CreateGpt.permission_all"), icon: SparklesIcon },
    ];
    const preferredModelOption = availableModels.find((item) => item.id === preferredModel);
    const preferredModelUnavailable =
        !!preferredModel && modelsLoaded && !preferredModelOption;

    return (
        <Container className="min-h-full w-full flex-1 overflow-y-auto bg-[var(--assist-bg)] text-[var(--assist-text)]">
            <main className="mx-auto w-full max-w-[1120px] px-5 pb-24 pt-8 sm:px-8 lg:px-10">
                <button
                    type="button"
                    onClick={() => navigate("/gpts")}
                    className="mb-6 inline-flex items-center gap-2 rounded-[12px] px-2 py-1.5 text-sm text-[var(--assist-text-faint)] transition hover:bg-white/70 hover:text-[var(--assist-text)]"
                >
                    <ArrowLeftIcon className="size-4" />
                    {t("views.CreateGpt.back")}
                </button>

                <header className="mb-9 max-w-2xl">
                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--assist-accent-strong)]">
                        <SparklesIcon className="size-4" />
                        {t("views.CreateGpt.workspace_label")}
                    </div>
                    <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-[38px] sm:leading-[1.15]">
                        {gid ? t("views.CreateGpt.edit_title") : t("views.CreateGpt.create_title")}
                    </h1>
                    <p className="mt-3 text-sm leading-7 text-[var(--assist-text-soft)] sm:text-[15px]">
                        {t("views.CreateGpt.page_subtitle")}
                    </p>
                </header>

                <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
                    <div className="space-y-6">
                        <section className="rounded-[24px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)] sm:p-6">
                            <div className="mb-6">
                                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
                                    {t("views.CreateGpt.identity_title")}
                                </h2>
                                <p className="mt-1 text-sm text-[var(--assist-text-faint)]">
                                    {t("views.CreateGpt.identity_description")}
                                </p>
                            </div>
                            <div className="grid gap-5">
                                <label className="text-sm font-medium text-[var(--assist-text-soft)]">
                                    {t("views.CreateGpt.name_label")}
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(event) => setName(event.target.value)}
                                        className={fieldClassName}
                                        placeholder={t("views.CreateGpt.name_placeholder")}
                                        required
                                    />
                                </label>
                                <label className="text-sm font-medium text-[var(--assist-text-soft)]">
                                    {t("views.CreateGpt.desc_label")}
                                    <input
                                        type="text"
                                        value={desc}
                                        onChange={(event) => setDesc(event.target.value)}
                                        className={fieldClassName}
                                        placeholder={t("views.CreateGpt.desc_placeholder")}
                                    />
                                </label>
                            </div>
                        </section>

                        <section className="rounded-[24px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)] sm:p-6">
                            <div className="mb-6">
                                <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
                                    {t("views.CreateGpt.behavior_title")}
                                </h2>
                                <p className="mt-1 text-sm text-[var(--assist-text-faint)]">
                                    {t("views.CreateGpt.behavior_description")}
                                </p>
                            </div>
                            <label className="text-sm font-medium text-[var(--assist-text-soft)]">
                                {t("views.CreateGpt.system_prompt_label")}
                                <textarea
                                    value={systemPrompt}
                                    onChange={(event) => setSystemPrompt(event.target.value)}
                                    className={`${fieldClassName} min-h-44 resize-y leading-6`}
                                    placeholder={t("views.CreateGpt.system_prompt_placeholder")}
                                    required
                                />
                            </label>
                            <div className="mt-6">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-sm font-medium text-[var(--assist-text-soft)]">
                                        {t("views.CreateGpt.samples_label")}
                                    </label>
                                    <span className="text-xs text-[var(--assist-text-faint)]">
                                        {samples.filter(Boolean).length}/{MAX_SAMPLES}
                                    </span>
                                </div>
                                <div className="mt-2 space-y-2">
                                    {samples.map((sample, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <input
                                                ref={(element) => {
                                                    inputRefs.current[index] = element;
                                                }}
                                                type="text"
                                                value={sample}
                                                onChange={(event) => handleSampleChange(index, event.target.value)}
                                                className={`${fieldClassName} mt-0 flex-1`}
                                                placeholder={t("views.CreateGpt.samples_placeholder")}
                                            />
                                            {(index !== samples.length - 1 || sample !== "") && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSample(index)}
                                                    className="grid size-10 shrink-0 place-items-center rounded-[12px] text-[var(--assist-text-faint)] transition hover:bg-red-50 hover:text-red-500"
                                                    aria-label={t("views.CreateGpt.remove_sample")}
                                                >
                                                    <TrashIcon className="size-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    <aside className="space-y-6 lg:sticky lg:top-8">
                        <section className="rounded-[24px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)]">
                            <div className="flex items-center gap-3">
                                <div className="grid size-10 place-items-center rounded-[13px] bg-[var(--assist-accent-soft)] text-[var(--assist-accent-strong)]">
                                    <CpuChipIcon className="size-5" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold">
                                        {t("views.CreateGpt.model_label")}
                                    </h2>
                                    <p className="mt-0.5 text-xs text-[var(--assist-text-faint)]">
                                        {t("views.CreateGpt.model_description")}
                                    </p>
                                </div>
                            </div>
                            <select
                                value={preferredModel}
                                onChange={(event) => setPreferredModel(event.target.value)}
                                className={fieldClassName}
                                required
                                disabled={!modelsLoaded || availableModels.length === 0}
                            >
                                {!preferredModel && (
                                    <option value="">
                                        {modelsLoaded
                                            ? t("views.CreateGpt.model_empty")
                                            : t("views.CreateGpt.model_loading")}
                                    </option>
                                )}
                                {preferredModelUnavailable && (
                                    <option value={preferredModel}>
                                        {t("views.CreateGpt.model_unavailable_option", {
                                            model: preferredModel,
                                        })}
                                    </option>
                                )}
                                {availableModels.map((model) => (
                                    <option key={model.id} value={model.id}>
                                        {model.name}
                                    </option>
                                ))}
                            </select>
                            {preferredModelUnavailable ? (
                                <p className="mt-3 rounded-[12px] border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                                    {t("views.CreateGpt.model_unavailable_hint")}
                                </p>
                            ) : (
                                preferredModelOption?.description && (
                                    <p className="mt-3 text-xs leading-5 text-[var(--assist-text-faint)]">
                                        {preferredModelOption.description}
                                    </p>
                                )
                            )}
                        </section>

                        <section className="rounded-[24px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)]">
                            <div className="flex items-center gap-3">
                                <div className="grid size-10 place-items-center rounded-[13px] bg-[var(--assist-accent-soft)] text-[var(--assist-accent-strong)]">
                                    <DocumentTextIcon className="size-5" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-semibold">{t("views.CreateGpt.upload_label")}</h2>
                                    <p className="mt-0.5 text-xs text-[var(--assist-text-faint)]">
                                        {t("views.CreateGpt.knowledge_description")}
                                    </p>
                                </div>
                            </div>

                            <label
                                className={`mt-5 flex min-h-24 flex-col items-center justify-center rounded-[16px] border border-dashed px-4 text-center transition ${
                                    gid && !isUploading
                                        ? "cursor-pointer border-[var(--assist-line-strong)] bg-[var(--assist-panel-soft)] hover:border-[var(--assist-accent)] hover:bg-[var(--assist-accent-soft)]"
                                        : "cursor-not-allowed border-[var(--assist-line)] bg-[var(--assist-panel-soft)] opacity-60"
                                }`}
                            >
                                <PlusIcon className="size-5 text-[var(--assist-accent-strong)]" />
                                <span className="mt-2 text-sm font-medium">
                                    {isUploading
                                        ? t("views.CreateGpt.knowledge_uploading")
                                        : t("views.CreateGpt.knowledge_upload_action")}
                                </span>
                                <span className="mt-1 text-[11px] text-[var(--assist-text-faint)]">
                                    TXT, MD, CSV, PDF, Office
                                </span>
                                <input
                                    type="file"
                                    accept=".txt,.md,.csv,.pdf,.doc,.docx,.xlsx,.pptx"
                                    disabled={!gid || isUploading}
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) void handleKnowledgeUpload(file);
                                        event.target.value = "";
                                    }}
                                    className="hidden"
                                />
                            </label>
                            {!gid && (
                                <p className="mt-3 text-xs leading-5 text-[var(--assist-text-faint)]">
                                    {t("views.CreateGpt.knowledge_create_first")}
                                </p>
                            )}
                            {knowledgeFiles.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {knowledgeFiles.map((item) => (
                                        <div
                                            key={item.file_id}
                                            className="flex items-center gap-3 rounded-[14px] border border-[var(--assist-line)] bg-white/70 px-3 py-2.5"
                                        >
                                            <DocumentTextIcon className="size-4 shrink-0 text-[var(--assist-accent-strong)]" />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-xs font-medium">{item.filename}</div>
                                                <div className="mt-0.5 text-[10px] text-[var(--assist-text-faint)]">
                                                    {formatFileSize(item.size_bytes)}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => void handleKnowledgeDelete(item.file_id)}
                                                className="grid size-7 place-items-center rounded-[9px] text-[var(--assist-text-faint)] transition hover:bg-red-50 hover:text-red-500"
                                                aria-label={t("views.CreateGpt.knowledge_delete")}
                                            >
                                                <TrashIcon className="size-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <section className="rounded-[24px] border border-[var(--assist-line)] bg-[rgba(252,253,254,0.92)] p-5 shadow-[var(--assist-shadow-sm)]">
                            <h2 className="text-sm font-semibold">{t("views.CreateGpt.permission_label")}</h2>
                            <div className="mt-4 space-y-2">
                                {authOptions.map((option) => {
                                    const Icon = option.icon;
                                    const active = authType === option.value;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setAuthType(option.value)}
                                            className={`flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left text-sm transition ${
                                                active
                                                    ? "border-[var(--assist-accent)] bg-[var(--assist-accent-soft)] text-[var(--assist-text)]"
                                                    : "border-[var(--assist-line)] bg-white/60 text-[var(--assist-text-soft)] hover:border-[var(--assist-line-strong)]"
                                            }`}
                                        >
                                            <Icon className="size-[18px] shrink-0" />
                                            <span className="flex-1">{option.label}</span>
                                            {active && <CheckIcon className="size-4 text-[var(--assist-accent-strong)]" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {authType === "white" && (
                                <input
                                    type="text"
                                    value={authUsers}
                                    onChange={(event) => setAuthUsers(event.target.value)}
                                    placeholder={t("views.CreateGpt.permission_users_placeholder")}
                                    className={fieldClassName}
                                />
                            )}
                        </section>

                        <button
                            type="submit"
                            disabled={isSubmitting || !preferredModel}
                            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--assist-accent-strong)] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(39,154,179,0.2)] transition hover:-translate-y-0.5 hover:bg-[var(--assist-accent)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? t("views.CreateGpt.submitting") : t("views.CreateGpt.submit")}
                        </button>
                        {message && (
                            <p className="rounded-[14px] border border-[var(--assist-line)] bg-white/70 px-3 py-2.5 text-xs leading-5 text-[var(--assist-text-soft)]">
                                {message}
                            </p>
                        )}
                    </aside>
                </form>
            </main>
        </Container>
    );
};

export default CreateGpt;
