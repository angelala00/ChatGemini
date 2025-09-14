import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";

const CreateGpt = () => {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [samples, setSamples] = useState<string[]>([""]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const MAX_SAMPLES = 5;

    const handleAddSample = () => {
        if (samples.length >= MAX_SAMPLES) return;
        setSamples([...samples, ""]);
    };

    const handleSampleChange = (index: number, value: string) => {
        const newSamples = [...samples];
        newSamples[index] = value;
        setSamples(newSamples);
    };

    const handleRemoveSample = (index: number) => {
        setSamples(samples.filter((_, i) => i !== index));
    };

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
        fetch(getFullPath("/api/gpts"), {
            method: "POST",
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
                <header className="py-10 text-3xl font-semibold">创建 GPT</header>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">名称</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">描述</label>
                        <input
                            type="text"
                            value={desc}
                            onChange={(e) => setDesc(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">系统提示词</label>
                        <textarea
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">示例问题</label>
                        {samples.map((sample, index) => (
                            <div key={index} className="flex mt-1">
                                <input
                                    type="text"
                                    value={sample}
                                    onChange={(e) =>
                                        handleSampleChange(index, e.target.value)
                                    }
                                    className="flex-1 rounded-md border-gray-300 shadow-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleRemoveSample(index)}
                                    className="ml-2 px-2 py-1 text-sm text-white bg-red-500 rounded-md"
                                >
                                    删除
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={handleAddSample}
                            disabled={samples.length >= MAX_SAMPLES}
                            className="mt-2 px-2 py-1 text-sm text-white bg-green-500 rounded-md disabled:opacity-50"
                        >
                            添加示例
                        </button>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            上传文件（即将开放）
                        </label>
                        <input
                            type="file"
                            disabled
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                    >
                        {isSubmitting ? "提交中..." : "提交"}
                    </button>
                </form>
            </div>
        </Container>
    );
};

export default CreateGpt;
