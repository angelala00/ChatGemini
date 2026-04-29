import { useEffect, useMemo, useRef, useState } from "react";
import { ModelOption } from "../types/models";
import { ChevronDownIcon } from "@heroicons/react/24/outline";


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
                    className={`inline-flex h-10 items-center gap-2 rounded-[10px] px-3 text-sm font-semibold transition-colors hover:bg-[rgba(246,248,250,0.96)] ${
                        open ? "text-[#2f3a46]" : "text-[#2f3a46]"
                    }`}
                >
                    <div className="flex items-center gap-1">
                        {title}{" "}
                        <span className="font-semibold text-[#2f3a46]">
                            {selectedOption?.name ?? selected}
                        </span>
                    </div>
                    <ChevronDownIcon
                        className={`size-4 text-[rgba(128,138,148,0.9)] transition-transform ${
                            open ? "" : "-rotate-90"
                        }`}
                        strokeWidth={1.8}
                    />
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
                                            ? "bg-[#f4f7f9] font-semibold"
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
