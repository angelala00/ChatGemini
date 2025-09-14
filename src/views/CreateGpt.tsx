import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";

const CreateGpt = () => {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [systemPrompt, setSystemPrompt] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        const body: Record<string, any> = {
            name,
            desc,
            system_prompt: systemPrompt,
        };
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
