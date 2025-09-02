import { useEffect, useState } from "react";
import { Container } from "../components/Container";
import { globalConfig } from "../config/global";

interface GptsCard {
    readonly icon: string;
    readonly title: string;
    readonly desc: string;
    readonly from: string;
}

const Section = ({
    title,
    items,
}: {
    readonly title: string;
    readonly items: GptsCard[];
}) => (
    <section className="mb-16">
        <h2 className="mb-6 text-sm font-semibold text-gray-500 tracking-wide uppercase">
            {title}
        </h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
                <div
                    key={item.title}
                    className="flex items-start p-4 rounded-xl bg-gray-50 hover:bg-gray-100 border transition-colors"
                >
                    <div className="mr-4 flex h-14 w-14 items-center justify-center rounded-lg bg-gray-200 text-2xl">
                        {item.icon}
                    </div>
                    <div>
                        <h3 className="text-base font-medium text-gray-900">{item.title}</h3>
                        <p className="mt-1 mb-2 text-sm text-gray-600">
                            {item.desc}
                        </p>
                        <span className="text-xs text-gray-500">{item.from}</span>
                    </div>
                </div>
            ))}
        </div>
    </section>
);

const Gpts = () => {
    const [favorites, setFavorites] = useState<GptsCard[]>([]);
    const [recommended, setRecommended] = useState<GptsCard[]>([]);

    useEffect(() => {
        const base = globalConfig.api ?? "";
        fetch(`${base}/gpts/home`)
            .then((res) => res.json())
            .then((data) => {
                setFavorites(data.favorites ?? []);
                setRecommended(data.recommended ?? []);
            })
            .catch(() => {
                setFavorites([]);
                setRecommended([]);
            });
    }, []);

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-5xl mx-auto px-6 pb-16">
                <header className="py-10 text-3xl font-semibold">探索 Kimi+</header>
                <Section title="我的最爱" items={favorites} />
                <Section title="官方推荐" items={recommended} />
            </div>
        </Container>
    );
};

export default Gpts;

