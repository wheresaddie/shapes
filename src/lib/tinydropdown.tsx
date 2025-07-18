import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface TinyDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}

function TinyDropdown({ value, onChange, options }: TinyDropdownProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((option) => option.value === value);
  const longestOption = options.reduce((longest, option) =>
    option.label.length > longest.label.length ? option : longest
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Hidden element to establish width - not absolutely positioned */}
      <div className="invisible whitespace-nowrap px-1 py-0.5 pr-4 text-[9px] border border-transparent">
        {longestOption.label}
      </div>

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-0 left-0 w-full h-full px-1 py-0.5 pr-4 border border-gray-300 bg-white text-[9px] focus:outline-none text-left"
      >
        <span className="whitespace-nowrap">
          {selectedOption ? selectedOption.label : ""}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-1">
          <svg
            className={`w-2 h-2 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full top-full bg-white border border-gray-300">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-1 py-0.5 text-left hover:bg-gray-100 text-[9px] whitespace-nowrap ${
                option.value === value ? "bg-gray-50" : ""
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TinyDropdown;
