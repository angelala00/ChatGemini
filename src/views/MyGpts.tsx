import { useEffect, useState } from "react";
import { Container } from "../components/Container";
import { getFullPath } from "../helpers/getDomainAndPath";
import editIcon from "../assets/icons/pen-to-square-solid.svg";
import deleteIcon from "../assets/icons/trash-solid.svg";

interface GptsItem {
    readonly gid: string;
    readonly name: string;
    readonly logo?: string;
}

const MyGpts = () => {
    const [items, setItems] = useState<GptsItem[]>([]);

    useEffect(() => {
        fetch(getFullPath('/api/gpts/created'), {})
            .then((res) => res.json())
            .then((data) => setItems(data ?? []))
            .catch(() => setItems([]));
    }, []);

    return (
        <Container className="flex-1 w-full overflow-y-auto bg-white text-gray-900">
            <div className="max-w-5xl mx-auto px-6 pb-16">
                <header className="py-10 text-3xl font-semibold">我的 GPTs</header>
                <div className="space-y-4">
                    {items.length === 0 ? (
                        <p className="text-gray-500">暂无 GPTs</p>
                    ) : (
                        items.map((item) => (
                            <div
                                key={item.gid}
                                className="flex items-center justify-between p-6 rounded-xl bg-gray-50"
                            >
                                <div className="flex items-center">
                                    <div className="mr-4 flex h-16 w-16 items-center justify-center rounded-lg bg-gray-200 text-2xl overflow-hidden">
                                        {item.logo ? (
                                            <img src={item.logo} alt="" className="h-12 w-12" />
                                        ) : (
                                            item.name.slice(0, 1)
                                        )}
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900">{item.name}</h3>
                                </div>
                                <div className="flex gap-2">
                                    <button className="size-8 rounded-lg hover:bg-gray-200 flex items-center justify-center">
                                        <img src={editIcon} className="size-4" alt="编辑" />
                                    </button>
                                    <button className="size-8 rounded-lg hover:bg-gray-200 flex items-center justify-center">
                                        <img src={deleteIcon} className="size-4" alt="删除" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Container>
    );
};

export default MyGpts;
