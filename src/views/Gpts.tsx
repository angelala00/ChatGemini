import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { Container } from "../components/Container";
import pinnedIcon from "../assets/icons/thumbtack-solid.svg";
import unpinnedIcon from "../assets/icons/map-pin-solid.svg";
import { getFullPath } from "../helpers/getDomainAndPath";
import { onUpdate as updatePinnedGpts } from "../store/gpts";
import { Link } from "react-router-dom";

interface GptsItem {
    readonly gid: string;
    readonly name: string;
    readonly desc: string;
    readonly is_pinned: boolean;
    readonly logo: string;
    readonly owner?: string;
    readonly usage_count?: number;
    readonly pinned_user_count?: number;
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
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
                <div
                    key={item.gid}
                    className="relative flex items-start p-6 rounded-xl bg-gray-50 hover:bg-gray-100 border transition-colors cursor-pointer"
                    onClick={() => {
                        window.location.href = "#/g/"+item.gid;
                    }}
                >
                    <div className="mr-4 flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-2xl overflow-hidden">
                        {item.logo ? (
                            <img src={item.logo} alt="" className="h-12 w-12" />
                        ) : (
                            item.name.slice(0, 1)
                        )}
                    </div>
                    <div className="flex-1 flex flex-col">
                        <h3 className="text-lg font-medium text-gray-900">{item.name}</h3>
                        <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
                        <div className="mt-4 flex items-center justify-between">
                            <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600">
                                {item.owner ? `来自 ${item.owner}` : "官方"}
                            </span>
                            <div className="flex gap-4 text-[11px] text-gray-400">
                                <span>使用 {item.usage_count ?? 0}</span>
                                <span>置顶 {item.pinned_user_count ?? 0}</span>
                            </div>
                        </div>
                    </div>
                    <button
                        className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200 cursor-pointer"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle(item.gid, item.is_pinned);
                        }}
                        aria-label={item.is_pinned ? "取消置顶" : "置顶"}
                    >
                        <img
                            className="w-5 h-5"
                            src={item.is_pinned ? pinnedIcon : unpinnedIcon}
                            alt=""
                        />
                    </button>
                </div>
            ))}
        </div>
    </section>
);

const Gpts = () => {
    const [items, setItems] = useState<GptsItem[]>([]);
    const [canManage, setCanManage] = useState(false);
    const dispatch = useDispatch();

    const refreshSidebar = () => {
        // console.log("refreshSidebar:")
        fetch(getFullPath('/api/gpts/pined'), {})
            .then((res) => res.json())
            .then((data) => dispatch(updatePinnedGpts(data ?? [])))
            .catch(() => {});
    };

    useEffect(() => {
        fetch(getFullPath('/api/gpts'), {})
            .then((res) => res.json())
            .then((data) => {
                setItems(data ?? []);
                refreshSidebar();
            })
            .catch(() => {
                setItems([]);
            });
        fetch(getFullPath('/api/gpts/permission'), {})
            .then((res) => res.json())
            .then((data) => setCanManage(Boolean(data.allowed)))
            .catch(() => setCanManage(false));
    }, []);

    const handleToggle = (id: string, is_pinned: boolean) => {
        fetch(getFullPath(`/api/gpts/${id}/pin`), {
            method: "PATCH",
            headers: {},
            body: JSON.stringify({ is_pinned: !is_pinned }),
        })
            .then((res) => res.json())
            .then((data) => {
                setItems((prev) =>
                    prev.map((item) =>
                        item.gid === id
                            ? { ...item, is_pinned: data.is_pinned }
                            : item
                    )
                );
                refreshSidebar();
            })
            .catch(() => {});
    };

    const pinned = items.filter((i) => i.is_pinned);
    const others = items.filter((i) => !i.is_pinned);

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-5xl mx-auto px-6 pb-16">
                <header className="py-10 flex items-center justify-between">
                    <div className="text-3xl font-semibold">探索 GPTs</div>
                    <div className="space-x-4 text-sm">
                        {canManage && (
                            <>
                                <Link to="/my-gpts" className="text-blue-600 hover:underline">
                                    我的GPTs
                                </Link>
                                <Link to="/gpts/create" className="text-blue-600 hover:underline">
                                    创建
                                </Link>
                            </>
                        )}
                    </div>
                </header>
                <Section title="置顶" items={pinned} onToggle={handleToggle} />
                <Section title="全部" items={others} onToggle={handleToggle} />
            </div>
        </Container>
    );
};

export default Gpts;

