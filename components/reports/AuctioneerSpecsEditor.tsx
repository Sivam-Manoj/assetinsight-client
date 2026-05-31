"use client";

import React from "react";

export interface AssetCategorySpec {
  parentCategory: string;
  childCategory: string;
  fields: string[];
}

type Props = {
  lot: any;
  lotIndex: number;
  specsByCategory: Map<string, AssetCategorySpec>;
  onChange: (lotIndex: number, fieldName: string, value: string) => void;
  accent?: "rose" | "purple";
};

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const isUsefulValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return (
    !!text &&
    !/^(n\/a|na|none|null|unknown|not visible|tbd)$/i.test(text) &&
    !/title clearance clarification fee|applied to your invoice|over and above the purchase price|applicable taxes|following the close of the sale/i.test(text)
  );
};

const getSpecRecord = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    value.forEach((entry: any) => {
      const field = String(entry?.field ?? "").trim();
      const text = String(entry?.value ?? "").trim();
      if (field && isUsefulValue(text)) out[field] = text;
    });
    return out;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([field, raw]) => {
      const text = String(raw ?? "").trim();
      if (field && isUsefulValue(text)) out[field] = text;
    });
  }
  return out;
};

const getValueForField = (record: Record<string, string>, fieldName: string) => {
  if (record[fieldName] !== undefined) return record[fieldName];
  const fieldKey = normalizeKey(fieldName);
  const matchingKey = Object.keys(record).find((key) => normalizeKey(key) === fieldKey);
  return matchingKey ? record[matchingKey] : "Not Found";
};

const isDamageField = (fieldName: string) => {
  const key = normalizeKey(fieldName);
  return key === "damage" || key === "damages" || key === "damageanalysis";
};

export default function AuctioneerSpecsEditor({
  lot,
  lotIndex,
  specsByCategory,
  onChange,
  accent = "rose",
}: Props) {
  const categoryKey = normalizeKey(lot?.categories);
  const categorySpec = specsByCategory.get(categoryKey);
  const specRecord = getSpecRecord(lot?.condition_report_specs);
  const fields = categorySpec?.fields?.filter((field) => !isDamageField(field)) || [];
  const extraFields = Object.keys(specRecord).filter((field) => {
    if (isDamageField(field)) return false;
    return !fields.some((knownField) => normalizeKey(knownField) === normalizeKey(field));
  });
  const visibleFields = [...fields, ...extraFields];
  const accentClasses =
    accent === "purple"
      ? "border-purple-200 bg-purple-50/50 text-purple-900"
      : "border-rose-200 bg-rose-50/50 text-rose-900";
  const focusClass =
    accent === "purple"
      ? "focus:ring-purple-500"
      : "focus:ring-rose-500";

  const categoryChipText = categorySpec
    ? `${categorySpec.childCategory} • ${fields.length} fields`
    : "Category not matched";

  return (
    <div className={`rounded-lg border p-3 ${accentClasses}`}>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide">
            Auctioneer Import specs
          </p>
          <p className="mt-0.5 text-[11px] text-gray-600">
            {categorySpec
              ? `${categorySpec.childCategory} field names`
              : lot?.categories
                ? "No matching category field list found"
              : "Select a category to show field names"}
          </p>
        </div>
        <span
          className={`w-fit rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold ring-1 ${
            categorySpec
              ? "text-gray-800 ring-black/10"
              : "text-amber-800 ring-amber-200"
          }`}
        >
          {categoryChipText}
        </span>
      </div>

      {visibleFields.length > 0 ? (
        <div className="max-h-[360px] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleFields.map((fieldName) => (
              <label key={fieldName} className="block">
                <span className="mb-1 block text-[11px] font-medium text-gray-700">
                  {fieldName}
                </span>
                <input
                  type="text"
                  value={getValueForField(specRecord, fieldName)}
                  onChange={(event) => onChange(lotIndex, fieldName, event.target.value)}
                  className={`w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 outline-none transition focus:border-transparent focus:ring-2 ${focusClass}`}
                  placeholder="Not Found"
                />
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-gray-300 bg-white/70 px-3 py-4 text-xs text-gray-600">
          Enter an exact Auctioneer Import category to edit its field names.
        </div>
      )}
    </div>
  );
}
