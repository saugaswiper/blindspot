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
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--foreground)" }}
          >
            {label}
            {!required && (
              <span className="ml-1 font-normal" style={{ color: "var(--muted)" }}>
                (optional)
              </span>
            )}
          </label>
          <input
            type="text"
            value={value[key] ?? ""}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={placeholder}
            className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#4a90d9] focus:border-transparent placeholder:opacity-50"
            style={{
              background: "var(--surface)",
              color: "var(--foreground)",
              border: errors[key] ? "1px solid #f87171" : "1px solid var(--border)",
            }}
          />
          {errors[key] && (
            <p className="text-xs text-red-500 mt-0.5">{errors[key]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
