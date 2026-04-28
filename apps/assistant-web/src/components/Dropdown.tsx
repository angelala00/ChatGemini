import { useEffect, useMemo, useRef, useState } from "react";
import { ModelOption } from "../types/models";


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
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#d4dde5] bg-white/95 px-4 py-2 text-[#2f3a46] shadow-[0_2px_8px_rgba(23,28,38,0.04)] hover:bg-[#f8fafb]"
                >
                    <div className="flex items-center gap-1 font-semibold text-sm">
                        {title}{" "}
                        <span className="font-medium text-[#279ab3]">
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
                <div className="absolute mt-2 w-80 rounded-md bg-white shadow-lg ring-1 ring-[#d4dde5] z-10">
                    <ul className="py-1">
                        {models.map((opt) => (
                            <li key={opt.id}>
                                <button
                                    onClick={() => handleSelect(opt.id)}
                                    className={`w-full text-left px-4 py-2 text-sm text-[#2f3a46] hover:bg-[#f4f7f9] ${
                                        opt.id === selected
                                            ? "font-semibold !text-[#279ab3]"
                                            : ""
                                    }`}
                                >
                                    <div>{opt.name}</div>
                                    <div className="text-xs text-[#87919d]">
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
