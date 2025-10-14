import { useEffect, useMemo, useRef, useState } from "react";
import { ModelOption } from "../types/models";

// const options = ["deepseek-r1-distill-qwen-32b"];
//, "QwQ-32B", "Qwen3-30B-A3B"

interface HeaderDropdownProps {
    readonly title?: string;
    readonly models?: ModelOption[];
    readonly defaultModel?: string;
    readonly onModelChange?: (
        value: string,
        options?: { readonly manual?: boolean },
    ) => void;
}

export const HeaderDropdown = (props: HeaderDropdownProps) => {
    const {
        title,
        models,
        defaultModel,
        onModelChange,
    } = props;
    const dropdownRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState(defaultModel);
    const selectedOption = useMemo(
        () => models?.find((opt) => opt.id === selected),
        [models, selected],
    );

    const handleSelect = (value: string) => {
        setSelected(value);
        if (onModelChange) {
            onModelChange(value, { manual: true });
        }
        setOpen(false);
    };

    useEffect(() => {
        setSelected(defaultModel);
        if (onModelChange && defaultModel) {
            onModelChange(defaultModel, { manual: false });
        }
    }, [defaultModel, onModelChange]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open]);

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            {!defaultModel && (
                <div className="flex items-center gap-1 font-semibold text-sm">
                    {title}
                </div>
            )}
            {defaultModel && (
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-300 bg-white px-4 py-2 shadow-sm hover:bg-gray-50"
                >
                    <div className="flex items-center gap-1 font-semibold text-sm">
                        {title}{" "}
                        <span className="font-medium text-blue-600">
                            {selectedOption?.name ?? selected}
                        </span>
                    </div>
                    <svg
                        className={`w-4 h-4 transition-transform duration-200 ${
                            open ? "rotate-180" : ""
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            )}
            {defaultModel && open && models && (
                <div className="absolute mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <ul className="py-1">
                        {models.map((opt) => (
                            <li key={opt.id}>
                                <button
                                    onClick={() => handleSelect(opt.id)}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                                        opt.id === selected
                                            ? "font-semibold text-blue-600"
                                            : ""
                                    }`}
                                >
                                    <div>{opt.name}</div>
                                    <div className="text-xs text-gray-500">
                                        {opt.description}
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
