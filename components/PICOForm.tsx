"use client";

import type { PICOInput } from "@/types";

interface PICOFormProps {
  value: PICOInput;
  onChange: (value: PICOInput) => void;
  errors: Partial<Record<keyof PICOInput | "root", string>>;
}

const fields: {
  key: keyof PICOInput;
  label: string;
  placeholder: string;
  required: boolean;
}[] = [
  {
    key: "population",
    label: "Population",
    placeholder: "Who is being studied? e.g. elderly patients over 65",
    required: true,
  },
  {
    key: "intervention",
    label: "Intervention",
    placeholder: "What treatment or exposure? e.g. cognitive behavioral therapy",
    required: true,
  },
  {
    key: "comparison",
    label: "Comparison",
    placeholder: "Compared to what? e.g. pharmacological treatment (optional)",
    required: false,
  },
  {
    key: "outcome",
    label: "Outcome",
    placeholder: "What result? e.g. sleep quality, insomnia severity",
    required: true,
  },
];

export function PICOForm({ value, onChange, errors }: PICOFormProps) {
  function handleChange(key: keyof PICOInput, text: string) {
    onChange({ ...value, [key]: text });
  }

  return (
    <div className="space-y-3">
      {fields.map(({ key, label, placeholder, required }) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
            {!required && (
              <span className="ml-1 text-gray-600 dark:text-gray-400 font-normal">(optional)</span>
            )}
          </label>
          <input
            type="text"
            value={value[key] ?? ""}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={placeholder}
            className={`w-full px-3 py-2 border rounded-md text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 placeholder:text-gray-600 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent ${
              errors[key] ? "border-red-400" : "border-gray-300 dark:border-gray-600"
            }`}
          />
          {errors[key] && (
            <p className="text-xs text-red-600 mt-0.5">{errors[key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
