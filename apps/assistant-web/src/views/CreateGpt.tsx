import { useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";
import { useTranslation } from "react-i18next";

const CreateGpt = () => {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [samples, setSamples] = useState<string[]>([""]);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [authType, setAuthType] = useState<"self" | "white" | "all">("all");
    const [authUsers, setAuthUsers] = useState("");
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const gid = searchParams.get("gid");
    const { t } = useTranslation();

    const MAX_SAMPLES = 5;

    const handleSampleChange = (index: number, value: string) => {
        const prevValue = samples[index];
        const newSamples = [...samples];
        newSamples[index] = value;
        if (
            index === samples.length - 1 &&
            value !== "" &&
            samples.length < MAX_SAMPLES
        ) {
            newSamples.push("");
        } else if (value === "" && prevValue !== "") {
            newSamples.splice(index, 1);
            setSamples(newSamples);
            setTimeout(() => {
                const nextIndex = Math.min(index, newSamples.length - 1);
                inputRefs.current[nextIndex]?.focus();
            }, 0);
            return;
        }
        setSamples(newSamples);
    };

    const handleRemoveSample = (index: number) => {
        const newSamples = samples.filter((_, i) => i !== index);
        if (
            newSamples.length === 0 ||
            (newSamples[newSamples.length - 1] !== "" &&
                newSamples.length < MAX_SAMPLES)
        ) {
            newSamples.push("");
        }
        setSamples(newSamples);
        setTimeout(() => {
            const nextIndex = Math.min(index, newSamples.length - 1);
            inputRefs.current[nextIndex]?.focus();
        }, 0);
    };

    useEffect(() => {
        if (gid) {
            fetch(getFullPath(`/api/gpts/detail/${gid}`), {})
                .then((res) => res.json())
                .then((data) => {
                    setName(data.name ?? "");
                    setDesc(data.desc ?? "");
                    setSystemPrompt(data.system_prompt ?? "");
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
        }
    }, [gid]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        const body: Record<string, any> = {
            name,
            desc,
            system_prompt: systemPrompt,
        };
        const sanitizedSamples = samples.map((s) => s.trim()).filter(Boolean);
        if (sanitizedSamples.length > 0) {
            body.samples = sanitizedSamples;
        }
        let auth: Record<string, any> = { type: authType };
        if (authType === "white") {
            auth = {
                type: "white",
                user: authUsers
                    .split(",")
                    .map((u) => u.trim())
                    .filter(Boolean),
            };
        }
        body.auth = auth;
        const method = gid ? "PUT" : "POST";
        const url = gid
            ? getFullPath(`/api/gpts/${gid}`)
            : getFullPath("/api/gpts");
        fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then((res) => res.json())
            .then(() => {
                setName("");
                setDesc("");
                setSystemPrompt("");
                setSamples([""]);
                navigate("/my-gpts");
            })
            .catch(() => {})
            .finally(() => setIsSubmitting(false));
    };

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-3xl mx-auto px-6 pb-16">
                <header className="py-10 text-3xl font-semibold">
                    {gid
                        ? t("views.CreateGpt.edit_title")
                        : t("views.CreateGpt.create_title")}
                </header>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.name_label")}
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            placeholder={t("views.CreateGpt.name_placeholder")}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.desc_label")}
                        </label>
                        <input
                            type="text"
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            placeholder={t("views.CreateGpt.desc_placeholder")}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.system_prompt_label")}
                        </label>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            rows={6}
                            placeholder={t("views.CreateGpt.system_prompt_placeholder")}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.samples_label")}
                        </label>
                        {samples.map((sample, index) => (
                            <div key={index} className="flex items-center mt-1">
                                <input
                                    ref={(el) => {
                                        inputRefs.current[index] = el;
                                    }}
                                    type="text"
                                    value={sample}
                                    onChange={(e) =>
                                        handleSampleChange(index, e.target.value)
                                    }
                                    className="flex-1 rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    placeholder={t("views.CreateGpt.samples_placeholder")}
                                />
                                {(index !== samples.length - 1 || sample !== "") && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSample(index)}
                                        className="ml-2 text-xl leading-none text-gray-400 hover:text-red-500"
                                    >
                                        &times;
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.upload_label")}
                        </label>
                        <input
                            type="file"
                            disabled
                            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.tools_label")}
                        </label>
                        <input
                            type="text"
                            disabled
                            className="mt-1 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            placeholder={t("views.CreateGpt.tools_placeholder")}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            {t("views.CreateGpt.permission_label")}
                        </label>
                        <div className="mt-1 flex space-x-4">
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="self"
                                    checked={authType === "self"}
                                    onChange={() => setAuthType("self")}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-2">
                                    {t("views.CreateGpt.permission_self")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="white"
                                    checked={authType === "white"}
                                    onChange={() => setAuthType("white")}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-2">
                                    {t("views.CreateGpt.permission_white")}
                                </span>
                            </label>
                            <label className="flex items-center">
                                <input
                                    type="radio"
                                    value="all"
                                    checked={authType === "all"}
                                    onChange={() => setAuthType("all")}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="ml-2">
                                    {t("views.CreateGpt.permission_all")}
                                </span>
                            </label>
                        </div>
                        {authType === "white" && (
                            <input
                                type="text"
                                value={authUsers}
                                onChange={(e) => setAuthUsers(e.target.value)}
                                placeholder={t("views.CreateGpt.permission_users_placeholder")}
                                className="mt-2 w-full rounded-md border border-gray-300 bg-gray-50 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                    >
                        {isSubmitting
                            ? t("views.CreateGpt.submitting")
                            : t("views.CreateGpt.submit")}
                    </button>
                </form>
            </div>
        </Container>
    );
};

export default CreateGpt;
