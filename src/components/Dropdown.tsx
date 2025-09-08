import { useEffect, useState } from "react";

// const options = ["deepseek-r1-distill-qwen-32b"];
//, "QwQ-32B", "Qwen3-30B-A3B"

interface HeaderDropdownProps {
  readonly title?: string;
  readonly models?: string[];
  readonly defaultModel?: string;
  readonly onModelChange?: (t: string) => void;
}

export const HeaderDropdown = (props: HeaderDropdownProps) => {
  const {
      title,
      models,
      defaultModel,
      onModelChange,
  } = props;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(defaultModel);

  const handleSelect = (value: string) => {
    setSelected(value);
    if (onModelChange) {
      onModelChange(value)
    }
    setOpen(false);
  };

  // console.log(defaultModel)

  useEffect(() => {
    setSelected(defaultModel)
    if (onModelChange && defaultModel) {
      onModelChange(defaultModel)
    }
  }, [defaultModel]);

  return (
    <div className="relative inline-block text-left">
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
            {title} <span className="font-medium text-blue-600">{selected}</span>
          </div>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      {defaultModel && open && models &&(
        <div className="absolute mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
          <ul className="py-1">
            {models.map((opt) => (
              <li key={opt}>
                <button
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                    opt === selected ? "font-semibold text-blue-600" : ""
                  }`}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
