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
  onDelete: (lotIndex: number, fieldName: string) => void;
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
    !/^(n\/a|na|none|null|unknown|not visible|not found|tbd|no|false|not available|not applicable)$/i.test(text) &&
    !/title clearance clarification fee|applied to your invoice|over and above the purchase price|applicable taxes|following the close of the sale/i.test(text)
  );
};

const getSpecRecord = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (Array.isArray(value)) {
    value.forEach((entry: any) => {
      const field = String(entry?.field ?? "").trim();
      const rawText = String(entry?.value ?? "");
      const text = rawText.trim();
      if (field && (entry?.value === "" || (typeof entry?.value === "string" && !text) || isUsefulValue(rawText))) {
        out[field] = rawText;
      }
    });
    return out;
  }
  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([field, raw]) => {
      const rawText = String(raw ?? "");
      const text = rawText.trim();
      if (field && (raw === "" || (typeof raw === "string" && !text) || isUsefulValue(rawText))) {
        out[field] = rawText;
      }
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

const hasValueForField = (record: Record<string, string>, fieldName: string) => {
  if (record[fieldName] !== undefined) return true;
  const fieldKey = normalizeKey(fieldName);
  return Object.keys(record).some((key) => normalizeKey(key) === fieldKey);
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
  onDelete,
  accent = "rose",
}: Props) {
  const [expandedEditor, setExpandedEditor] = React.useState<{
    fieldName: string;
    value: string;
  } | null>(null);
  const categoryKey = normalizeKey(lot?.categories);
  const categorySpec = specsByCategory.get(categoryKey);
  const specRecord = getSpecRecord(lot?.condition_report_specs);
  const fields = categorySpec?.fields?.filter((field) => !isDamageField(field)) || [];
  const extraFields = Object.keys(specRecord).filter((field) => {
    if (isDamageField(field)) return false;
    return !fields.some((knownField) => normalizeKey(knownField) === normalizeKey(field));
  });
  const visibleFields = [
    ...fields.filter((field) => hasValueForField(specRecord, field)),
    ...extraFields,
  ];
  const accentClasses =
    accent === "purple"
      ? "border-purple-200 bg-purple-50/50 text-purple-900"
      : "border-rose-200 bg-rose-50/50 text-rose-900";
  const focusClass =
    accent === "purple"
      ? "focus:ring-purple-500"
      : "focus:ring-rose-500";

  const categoryChipText = categorySpec
    ? `${categorySpec.childCategory} - ${fields.length} fields`
    : "Category not matched";
  const lotLabel = String(
    lot?.lot_number || lot?.lot_id || (Number.isFinite(lotIndex) ? lotIndex + 1 : "")
  ).trim();
  const lotTitle = String(lot?.title || lot?.description || "").trim();
  const accentButtonClass =
    accent === "purple"
      ? "bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
      : "bg-rose-600 hover:bg-rose-700 focus:ring-rose-500";

  const openExpandedEditor = (fieldName: string) => {
    setExpandedEditor({
      fieldName,
      value: getValueForField(specRecord, fieldName),
    });
  };

  const closeExpandedEditor = () => {
    setExpandedEditor(null);
  };

  const saveExpandedEditor = () => {
    if (!expandedEditor) return;
    onChange(lotIndex, expandedEditor.fieldName, expandedEditor.value);
    closeExpandedEditor();
  };

  const deleteExpandedField = () => {
    if (!expandedEditor) return;
    onDelete(lotIndex, expandedEditor.fieldName);
    closeExpandedEditor();
  };

  return (
    <>
      <div className={`rounded-lg border p-3 ${accentClasses}`}>
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide">
              CONDITION REPORT
            </p>
            <p className="mt-0.5 text-[11px] text-gray-600">
              {categorySpec
                ? `Found values for ${categorySpec.childCategory}`
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
                <div key={fieldName} className="block">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-gray-700">
                    <span className="min-w-0 break-words">{fieldName}</span>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onDelete(lotIndex, fieldName);
                      }}
                      className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border border-red-200 bg-red-50 text-sm font-bold leading-none text-red-600 transition hover:bg-red-100"
                      aria-label={`Remove ${fieldName}`}
                    >
                      x
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => openExpandedEditor(fieldName)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openExpandedEditor(fieldName);
                      }
                    }}
                    className={`min-h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-left text-xs text-gray-900 outline-none transition hover:border-gray-400 hover:bg-gray-50 focus:border-transparent focus:ring-2 ${focusClass}`}
                    title="Click to open large editor"
                  >
                    <span className="block truncate">
                      {getValueForField(specRecord, fieldName) || "\u00a0"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-gray-300 bg-white/70 px-3 py-4 text-xs text-gray-600">
            No spec values were found from the uploaded images yet.
          </div>
        )}
      </div>

      {expandedEditor && (
        <div
          className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auctioneer-spec-expanded-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExpandedEditor();
          }}
        >
          <div className="flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4">
              <div className="min-w-0">
                <p
                  id="auctioneer-spec-expanded-title"
                  className="text-sm font-black uppercase tracking-wide text-gray-950"
                >
                  {expandedEditor.fieldName}
                </p>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {[
                    lotLabel ? `Lot ${lotLabel}` : "",
                    lotTitle,
                  ].filter(Boolean).join(" - ") || "Condition report field"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeExpandedEditor}
                className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-lg font-bold leading-none text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="Close editor"
              >
                x
              </button>
            </div>
            <div className="min-h-0 flex-1 px-5 py-4">
              <textarea
                value={expandedEditor.value}
                onChange={(event) =>
                  setExpandedEditor((prev) =>
                    prev ? { ...prev, value: event.target.value } : prev
                  )
                }
                className={`max-h-[44vh] min-h-[180px] w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm leading-6 text-gray-900 outline-none transition focus:border-transparent focus:ring-2 ${focusClass}`}
                placeholder="Edit the full field value"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2 border-t border-gray-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={deleteExpandedField}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
              >
                Delete field
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={closeExpandedEditor}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveExpandedEditor}
                  className={`rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 ${accentButtonClass}`}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
