import { useEffect, useState } from "react";
import { Container } from "../components/Container";
import { globalConfig } from "../config/global";

interface GptsItem {
    readonly id: string;
    readonly name: string;
    readonly is_pinned: boolean;
}

interface SectionProps {
    readonly title: string;
    readonly items: GptsItem[];
    readonly onToggle: (id: string, is_pinned: boolean) => void;
}

const Section = ({ title, items, onToggle }: SectionProps) => (
    <section className="mb-16">
        <h2 className="mb-6 text-sm font-semibold text-gray-500 tracking-wide uppercase">
            {title}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
                <div
                    key={item.id}
                    className="relative flex items-start p-4 rounded-xl bg-gray-50 hover:bg-gray-100 border transition-colors"
                >
                    <div className="mr-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 text-xl">
                        {item.name.slice(0, 1)}
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-medium text-gray-900">{item.name}</h3>
                    </div>
                    <button
                        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200"
                        onClick={() => onToggle(item.id, item.is_pinned)}
                        aria-label={item.is_pinned ? "取消置顶" : "置顶"}
                    >
                        <span className="text-lg">
                            {item.is_pinned ? "📌" : "📍"}
                        </span>
                    </button>
                </div>
            ))}
        </div>
    </section>
);

const Gpts = () => {
    const [items, setItems] = useState<GptsItem[]>([]);

    useEffect(() => {
        const base = globalConfig.api ?? "";
        fetch(`${base}/gpts`, {
            headers: { "X-User-ID": "1" },
        })
            .then((res) => res.json())
            .then((data) => {
                setItems(data.items ?? []);
            })
            .catch(() => {
                setItems([]);
            });
    }, []);

    const handleToggle = (id: string, is_pinned: boolean) => {
        const base = globalConfig.api ?? "";
        fetch(`${base}/gpts/${id}/pin`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-User-ID": "1",
            },
            body: JSON.stringify({ is_pinned: !is_pinned }),
        })
            .then((res) => res.json())
            .then((data) => {
                setItems((prev) =>
                    prev.map((item) =>
                        item.id === id
                            ? { ...item, is_pinned: data.is_pinned }
                            : item
                    )
                );
            })
            .catch(() => {});
    };

    const pinned = items.filter((i) => i.is_pinned);
    const others = items.filter((i) => !i.is_pinned);

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-5xl mx-auto px-6 pb-16">
                <header className="py-10 text-3xl font-semibold">探索 GPTs</header>
                <Section title="置顶" items={pinned} onToggle={handleToggle} />
                <Section title="全部" items={others} onToggle={handleToggle} />
            </div>
        </Container>
    );
};

export default Gpts;

