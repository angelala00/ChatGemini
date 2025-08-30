import { Container } from "../components/Container";

interface GptsCard {
    readonly icon: string;
    readonly title: string;
    readonly desc: string;
    readonly from: string;
}

const favorites: GptsCard[] = [
    {
        icon: "🔍",
        title: "学术搜索",
        desc: "检索学术问题和参考文献",
        from: "来自 Kimi",
    },
    {
        icon: "📊",
        title: "PPT 助手",
        desc: "轻松制作演示文稿",
        from: "来自 Kimi",
    },
    {
        icon: "💼",
        title: "Kimi 专业版",
        desc: "更精准的搜索助手",
        from: "来自 Kimi",
    },
];

const recommended: GptsCard[] = [
    {
        icon: "💡",
        title: "AI 创意助手",
        desc: "激发灵感的创作工具",
        from: "来自 Kimi",
    },
    {
        icon: "📚",
        title: "知识问答",
        desc: "快速获取专业答案",
        from: "来自 Kimi",
    },
];

const Section = ({
    title,
    items,
}: {
    readonly title: string;
    readonly items: GptsCard[];
}) => (
    <section className="mb-12">
        <h2 className="mb-5 text-sm text-gray-400 tracking-widest">
            {title}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            {items.map((item) => (
                <div
                    key={item.title}
                    className="flex items-center p-4 rounded-2xl bg-neutral-900 hover:bg-neutral-800 transition-colors"
                >
                    <div className="mr-4 flex h-14 w-14 items-center justify-center rounded-xl bg-neutral-800 text-2xl">
                        {item.icon}
                    </div>
                    <div>
                        <h3 className="text-base font-medium">{item.title}</h3>
                        <p className="mt-1 mb-2 text-sm text-gray-400">
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
    return (
        <Container className="flex-1 w-full overflow-y-auto bg-neutral-950 text-gray-100">
            <header className="px-12 py-8 text-2xl font-medium">
                探索 Kimi+
            </header>
            <div className="px-12 pb-12">
                <Section title="我的最爱" items={favorites} />
                <Section title="官方推荐" items={recommended} />
            </div>
        </Container>
    );
};

export default Gpts;

