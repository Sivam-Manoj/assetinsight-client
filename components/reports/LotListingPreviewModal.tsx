"use client";

import React, { useState, useEffect } from "react";
import { Save, Send, AlertCircle, Image, ChevronLeft, ChevronRight, X, RefreshCw } from "lucide-react";
import { toast } from "react-toastify";
import {
  getLotListingPreview,
  getLotListingSubmittedPreview,
  updateLotListingPreview,
  submitLotListingForApproval,
  resubmitLotListing,
  type LotListing,
  type LotListingLot,
} from "@/services/lotListing";
import BottomDrawer from "@/components/BottomDrawer";

interface LotListingPreviewModalProps {
  reportId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isResubmitMode?: boolean;
}

type ConditionSelectionKey = "condition" | "completeness" | "legal";

const conditionSelectionGroups: Array<{
  key: ConditionSelectionKey;
  label: string;
  options: string[];
}> = [
  {
    key: "condition",
    label: "Condition",
    options: [
      "Unknown Working Condition",
      "Starts and Runs",
      "Untested",
      "Non-Operational",
      "N/A",
    ],
  },
  {
    key: "completeness",
    label: "Completeness",
    options: ["Has Keys", "Missing Parts", "Incomplete Unit", "N/A"],
  },
  {
    key: "legal",
    label: "Legal",
    options: ["Salvage", "No Title", "N/A"],
  },
];

const normalizeConditionSelection = (value: any) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^na$/, "n/a")
    .replace(/^not applicable$/, "n/a");

const getLotDisplayNumber = (lot: any, index: number) => {
  const candidates = [lot?.lot_number, lot?.lot_id, lot?.lot, lot?.id];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (text) return text;
  }
  return String(index + 1);
};

const getMissingConditionSelectionMessage = (lots: any[] | undefined | null) => {
  if (!Array.isArray(lots) || lots.length === 0) return null;

  const missingKeys = new Set<ConditionSelectionKey>();
  const invalidLots: string[] = [];

  lots.forEach((lot, index) => {
    const selections = lot?.condition_report_selections || {};
    const lotMissing = conditionSelectionGroups.filter((group) => {
      const selected = normalizeConditionSelection(selections[group.key]);
      return !group.options.some(
        (option) => normalizeConditionSelection(option) === selected
      );
    });

    if (lotMissing.length > 0) {
      invalidLots.push(getLotDisplayNumber(lot, index));
      lotMissing.forEach((group) => missingKeys.add(group.key));
    }
  });

  if (invalidLots.length === 0) return null;

  const missingLabels = conditionSelectionGroups
    .filter((group) => missingKeys.has(group.key))
    .map((group) => group.label)
    .join(", ");

  return `Please select ${missingLabels} for Lot ${invalidLots.join(", ")}`;
};

const parseEstimatedValue = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateTotalValue = (lots: any[] | undefined | null) =>
  (Array.isArray(lots) ? lots : []).reduce(
    (sum, lot) => sum + parseEstimatedValue(lot?.estimated_value),
    0
  );

export default function LotListingPreviewModal({
  reportId,
  isOpen,
  onClose,
  onSuccess,
  isResubmitMode = false,
}: LotListingPreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [declineReason, setDeclineReason] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [galleryLotImages, setGalleryLotImages] = useState<{ urls: string[]; currentIdx: number } | null>(null);

  useEffect(() => {
    if (isOpen && reportId) {
      loadPreviewData();
    }
  }, [isOpen, reportId]);

  const loadPreviewData = async () => {
    try {
      setLoading(true);
      const response = isResubmitMode
        ? await getLotListingSubmittedPreview(reportId)
        : await getLotListingPreview(reportId);
      const data = (response as any).data || response;
      setStatus(data.status);
      setDeclineReason(data.decline_reason || "");
      setPreviewData(data.preview_data || {
        contract_no: data.contract_no,
        sales_date: data.sales_date,
        location: data.location,
        lots: data.lots || [],
      });
      setImageUrls(data.imageUrls || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load preview data");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      await updateLotListingPreview(reportId, { preview_data: previewData });
      setHasChanges(false);
      toast.success("Changes saved successfully!");
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!previewData) {
      toast.error("No preview data available");
      return;
    }

    const conditionSelectionMessage = getMissingConditionSelectionMessage(previewData?.lots);
    if (conditionSelectionMessage) {
      toast.error(conditionSelectionMessage);
      return;
    }

    try {
      setSubmitting(true);

      if (isResubmitMode) {
        await resubmitLotListing(reportId, { preview_data: previewData });
        setHasChanges(false);
        toast.success("Lot listing approved files are being regenerated.");
      } else {
        if (hasChanges) {
          toast.warning("Please save your changes before generating approved files");
          setSubmitting(false);
          return;
        }
        await submitLotListingForApproval(reportId);
        toast.success("Lot listing approved files are being generated.");
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to submit for approval");
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setPreviewData((prev: any) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const updateLot = (index: number, field: string, value: any) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      newLots[index] = { ...newLots[index], [field]: value };
      return {
        ...prev,
        lots: newLots,
        total_value:
          field === "estimated_value"
            ? calculateTotalValue(newLots)
            : prev.total_value,
      };
    });
    setHasChanges(true);
  };

  const updateLotConditionSelection = (
    index: number,
    key: ConditionSelectionKey,
    value: string
  ) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      const lot = { ...(newLots[index] || {}) };
      lot.condition_report_selections = {
        ...(lot.condition_report_selections || {}),
        [key]: value,
      };
      newLots[index] = lot;
      return { ...prev, lots: newLots };
    });
    setHasChanges(true);
  };

  const deleteLot = (index: number) => {
    setPreviewData((prev: any) => {
      const lots = Array.isArray(prev?.lots) ? [...prev.lots] : [];
      lots.splice(index, 1);
      return { ...prev, lots, total_value: calculateTotalValue(lots) };
    });
    setHasChanges(true);
  };

  const lotsArray: LotListingLot[] = Array.isArray(previewData?.lots) ? previewData.lots : [];
  const displayedTotalValue = calculateTotalValue(lotsArray);

  const renderConditionSelections = (lot: any, idx: number) => {
    const selections = lot?.condition_report_selections || {};

    return (
      <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Required selections
          </p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
            N/A allowed
          </span>
        </div>
        <div className="space-y-3">
          {conditionSelectionGroups.map((group) => {
            const selectedValue = String(selections[group.key] || "");
            const hasSelection = group.options.some(
              (option) =>
                normalizeConditionSelection(option) ===
                normalizeConditionSelection(selectedValue)
            );

            return (
              <div
                key={group.key}
                role="radiogroup"
                aria-label={`${group.label} for lot ${idx + 1}`}
              >
                <div className="mb-1 text-[11px] font-semibold text-gray-700">
                  {group.label}
                </div>
                <div
                  className={`flex flex-wrap gap-1.5 rounded-md ${
                    hasSelection ? "" : "ring-1 ring-amber-300"
                  }`}
                >
                  {group.options.map((option) => {
                    const checked =
                      normalizeConditionSelection(selectedValue) ===
                      normalizeConditionSelection(option);
                    return (
                      <label
                        key={option}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                          checked
                            ? "border-amber-500 bg-white text-amber-950 shadow-sm"
                            : "border-gray-200 bg-white/70 text-gray-700 hover:border-amber-300 hover:bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`lot-listing-${idx}-${group.key}`}
                          checked={checked}
                          onChange={() =>
                            updateLotConditionSelection(idx, group.key, option)
                          }
                          className="h-3.5 w-3.5 accent-amber-600"
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <BottomDrawer open={isOpen} onClose={onClose} title="Lot Listing Preview">
      {status === "declined" && declineReason && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Lot Listing Declined</p>
            <p className="text-sm text-red-700 mt-1">{declineReason}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          {/* Listing Details */}
          <div className="space-y-6 max-w-5xl mx-auto pb-28">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-purple-600">📋</span>
                Listing Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Contract Number *
                  </label>
                  <input
                    type="text"
                    value={previewData?.contract_no || ""}
                    onChange={(e) => updateField("contract_no", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="e.g., CTR-2024-001"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Sales Date
                  </label>
                  <input
                    type="date"
                    value={previewData?.sales_date?.split("T")[0] || ""}
                    onChange={(e) => updateField("sales_date", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Location
                  </label>
                  <input
                    type="text"
                    value={previewData?.location || ""}
                    onChange={(e) => updateField("location", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="e.g., Toronto, ON"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Currency
                  </label>
                  <select
                    value={previewData?.currency || "CAD"}
                    onChange={(e) => updateField("currency", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-gray-900 mb-3">📊 Listing Statistics</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{lotsArray.length}</div>
                  <div className="text-xs text-gray-600">Total Lots</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{previewData?.currency || "CAD"}</div>
                  <div className="text-xs text-gray-600">Currency</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{imageUrls.length}</div>
                  <div className="text-xs text-gray-600">Images</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {displayedTotalValue
                      ? `${previewData.currency || "CAD"} ${displayedTotalValue.toLocaleString()}`
                      : "-"}
                  </div>
                  <div className="text-xs text-gray-600">Total Value</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lot-Specific Photo Gallery Modal */}
          {galleryLotImages !== null && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setGalleryLotImages(null)}>
              <div className="flex items-center justify-between p-4 bg-black/50">
                <div className="text-white text-sm font-medium">
                  Photo {galleryLotImages.currentIdx + 1} of {galleryLotImages.urls.length}
                </div>
                <button
                  onClick={() => setGalleryLotImages(null)}
                  className="text-white hover:text-gray-300 transition-colors p-2"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 relative" onClick={(e) => e.stopPropagation()}>
                {galleryLotImages.currentIdx > 0 && (
                  <button
                    onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: prev.currentIdx - 1 } : null)}
                    className="absolute left-4 text-white hover:text-gray-300 transition-colors bg-black/30 rounded-full p-2"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                )}
                {galleryLotImages.currentIdx < galleryLotImages.urls.length - 1 && (
                  <button
                    onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: prev.currentIdx + 1 } : null)}
                    className="absolute right-4 text-white hover:text-gray-300 transition-colors bg-black/30 rounded-full p-2"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={galleryLotImages.urls[galleryLotImages.currentIdx]}
                  alt={`Photo ${galleryLotImages.currentIdx + 1}`}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl"
                />
              </div>
              <div className="bg-black/70 p-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
                  {galleryLotImages.urls.map((url, i) => (
                    <div
                      key={i}
                      onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: i } : null)}
                      className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden cursor-pointer transition-all ${
                        i === galleryLotImages.currentIdx
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Lots Section */}
          <div className="mt-6 space-y-4 max-w-5xl mx-auto">
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Lots ({lotsArray.length})</h3>
            {lotsArray.length > 0 ? (
              <div className="space-y-4">
                {lotsArray.map((lot, idx) => {
                  const lotImageIndexes: number[] = Array.isArray(lot.image_indexes) ? lot.image_indexes : [];
                  const lotImages = lotImageIndexes.map(i => imageUrls[i]).filter(Boolean);
                  const openLotGallery = (startIdx: number) => {
                    setGalleryLotImages({ urls: lotImages, currentIdx: startIdx });
                  };

                  return (
                    <div key={idx} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-sm font-semibold text-gray-900">
                          Lot #{lot.lot_number || idx + 1}
                        </div>
                        <button
                          onClick={() => deleteLot(idx)}
                          className="px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-xs"
                        >
                          Delete
                        </button>
                      </div>

                      {/* Lot Images */}
                      {lotImages.length > 0 && (
                        <div className="mb-3">
                          <label className="flex items-center gap-2 text-xs text-gray-600 mb-1.5">
                            <Image className="h-3.5 w-3.5" />
                            Photos ({lotImages.length})
                          </label>
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {lotImages.slice(0, 10).map((url, imgIdx) => (
                              <div
                                key={imgIdx}
                                className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-purple-500 transition-all"
                                onClick={() => openLotGallery(imgIdx)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`Photo ${imgIdx + 1}`} className="w-full h-full object-cover" />
                              </div>
                            ))}
                            {lotImages.length > 10 && (
                              <div
                                className="flex-shrink-0 w-16 h-16 rounded-lg bg-gray-100 border-2 border-gray-300 cursor-pointer hover:bg-gray-200 flex items-center justify-center"
                                onClick={() => openLotGallery(10)}
                              >
                                <span className="text-xs font-semibold text-gray-600">+{lotImages.length - 10}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Lot Fields */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Title</label>
                          <input
                            type="text"
                            value={lot.title || ""}
                            onChange={(e) => updateLot(idx, "title", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Lot title"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Est. Value</label>
                          <input
                            type="text"
                            value={lot.estimated_value || ""}
                            onChange={(e) => updateLot(idx, "estimated_value", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-gray-600 mb-1">Description</label>
                          <textarea
                            value={lot.description || ""}
                            onChange={(e) => updateLot(idx, "description", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-y min-h-[80px]"
                            placeholder="Description"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Category</label>
                          <input
                            type="text"
                            value={lot.categories || ""}
                            onChange={(e) => updateLot(idx, "categories", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Category"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Item Condition</label>
                          <input
                            type="text"
                            value={lot.item_condition || ""}
                            onChange={(e) => updateLot(idx, "item_condition", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Excel item condition"
                          />
                        </div>
                        {renderConditionSelections(lot, idx)}
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Serial Number</label>
                          <input
                            type="text"
                            value={lot.serial_number || ""}
                            onChange={(e) => updateLot(idx, "serial_number", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Serial/VIN"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Quantity</label>
                          <input
                            type="number"
                            value={lot.quantity || 1}
                            onChange={(e) => updateLot(idx, "quantity", parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            min={1}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No lots in this listing yet.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-0 z-10 mt-6 flex max-w-5xl mx-auto flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-panel)] pt-4 pb-1 backdrop-blur">
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-xs text-amber-600">⚠️ Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveChanges}
                disabled={saving || !hasChanges}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={handleSubmitForApproval}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30 transition-all"
              >
                {submitting ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isResubmitMode ? "Regenerate Approved Files" : "Generate Approved Files"}
              </button>
            </div>
          </div>
        </>
      )}
    </BottomDrawer>
  );
}
