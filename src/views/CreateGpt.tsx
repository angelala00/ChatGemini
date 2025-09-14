import { useState } from "react";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";

const CreateGpt = () => {
    const [gid, setGid] = useState("");
    const [name, setName] = useState("");
    const [subTitle, setSubTitle] = useState("");
    const [logo, setLogo] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const body: Record<string, any> = { gid, name, sub_title: subTitle };
        if (logo) {
            body.logo = logo;
        }
        fetch(getFullPath("/api/gpts"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        })
            .then((res) => res.json())
            .then(() => {
                setGid("");
                setName("");
                setSubTitle("");
                setLogo("");
            })
            .catch(() => {});
    };

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-3xl mx-auto px-6 pb-16">
                <header className="py-10 text-3xl font-semibold">创建 GPT</header>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">GID</label>
                        <input
                            type="text"
                            value={gid}
                            onChange={(e) => setGid(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                            required
                        />
                    </div>
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
                        <label className="block text-sm font-medium text-gray-700">副标题</label>
                        <input
                            type="text"
                            value={subTitle}
                            onChange={(e) => setSubTitle(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Logo URL</label>
                        <input
                            type="text"
                            value={logo}
                            onChange={(e) => setLogo(e.target.value)}
                            className="mt-1 w-full rounded-md border-gray-300 shadow-sm"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-md">
                        提交
                    </button>
                </form>
            </div>
        </Container>
    );
};

export default CreateGpt;
