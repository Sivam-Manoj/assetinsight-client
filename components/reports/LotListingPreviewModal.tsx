"use client";

import React, { useState, useEffect } from "react";
import { Send, AlertCircle, Image, ChevronLeft, ChevronRight, X, RefreshCw, Download, Printer } from "lucide-react";
import { toast } from "react-toastify";
import {
  getLotListingPreview,
  getLotListingSubmittedPreview,
  updateLotListingPreview,
  refreshLotListingSpecPdf,
  submitLotListingForApproval,
  resubmitLotListing,
  type LotListing,
  type LotListingLot,
} from "@/services/lotListing";
import { getAssetCategorySpecs, type AssetCategorySpec } from "@/services/assets";
import BottomDrawer from "@/components/BottomDrawer";
import AuctioneerSpecsEditor from "@/components/reports/AuctioneerSpecsEditor";
import {
  CURRENT_BROWSER_LOCATION_LABEL,
} from "@/lib/browserLocation";

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

const normalizeSpecKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

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
  const [filesGenerating, setFilesGenerating] = useState(false);
  const [filesRegenerating, setFilesRegenerating] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [previewFiles, setPreviewFiles] = useState<any>(null);
  const [categorySpecs, setCategorySpecs] = useState<AssetCategorySpec[]>([]);
  const [galleryLotImages, setGalleryLotImages] = useState<{ urls: string[]; currentIdx: number } | null>(null);

  useEffect(() => {
    if (isOpen && reportId) {
      loadPreviewData();
    }
  }, [isOpen, reportId]);

  const applyLotListingState = (
    listing: any,
    options: { assumeFilesGenerating?: boolean; assumeFilesRegenerating?: boolean } = {}
  ) => {
    const data = (listing as any)?.data || listing || {};
    if (data.status) setStatus(data.status);
    setDeclineReason(data.decline_reason || "");
    setFilesGenerating(Boolean(data.files_generating ?? options.assumeFilesGenerating));
    setFilesRegenerating(Boolean(data.files_regenerating ?? options.assumeFilesRegenerating));

    const nextPreviewData = data.preview_data || {
      contract_no: data.contract_no,
      sales_date: data.sales_date,
      location: data.location,
      currency: data.currency,
      total_value: data.total_value,
      lots: data.lots || [],
    };
    const fallbackLocation =
      nextPreviewData.location ||
      (Array.isArray(nextPreviewData.lots)
        ? nextPreviewData.lots.find((lot: any) => lot?.location)?.location
        : "") ||
      CURRENT_BROWSER_LOCATION_LABEL;
    const fallbackCoordinates = Array.isArray(nextPreviewData.lots)
      ? nextPreviewData.lots.find((lot: any) =>
          Number.isFinite(Number(lot?.latitude)) &&
          Number.isFinite(Number(lot?.longitude))
        )
      : undefined;
    if (nextPreviewData) {
      setPreviewData({
        ...nextPreviewData,
        location: fallbackLocation,
        latitude: Number.isFinite(Number(nextPreviewData.latitude))
          ? Number(nextPreviewData.latitude)
          : Number.isFinite(Number(fallbackCoordinates?.latitude))
            ? Number(fallbackCoordinates.latitude)
            : nextPreviewData.latitude,
        longitude: Number.isFinite(Number(nextPreviewData.longitude))
          ? Number(nextPreviewData.longitude)
          : Number.isFinite(Number(fallbackCoordinates?.longitude))
            ? Number(fallbackCoordinates.longitude)
            : nextPreviewData.longitude,
        include_damage_analysis:
          nextPreviewData.include_damage_analysis ?? (data.include_damage_analysis !== false),
        valuation_methods:
          nextPreviewData.valuation_methods ||
          data.valuation_methods ||
          ["FML"],
      });
    }

    const nextPreviewFiles = data.preview_files || data.files;
    if (nextPreviewFiles) setPreviewFiles(nextPreviewFiles);
    setImageUrls(Array.isArray(data.imageUrls) ? data.imageUrls : []);
  };

  const loadPreviewData = async () => {
    try {
      setLoading(true);
      const [response, categorySpecResponse] = await Promise.all([
        isResubmitMode
          ? getLotListingSubmittedPreview(reportId)
          : getLotListingPreview(reportId),
        getAssetCategorySpecs().catch(() => ({ categories: [], specs: [] })),
      ]);
      setCategorySpecs(categorySpecResponse.specs || []);
      applyLotListingState(response);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load preview data");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (filesGenerating || filesRegenerating) {
      toast.info("This lot listing is already generating files.");
      return;
    }

    try {
      setSaving(true);
      const saved = await updateLotListingPreview(reportId, { preview_data: previewData });
      if ((saved as any)?.data) applyLotListingState((saved as any).data);
      if ((saved as any)?.files_regeneration_queued) {
        setHasChanges(false);
        applyLotListingState((saved as any).data, {
          assumeFilesGenerating: true,
          assumeFilesRegenerating: true,
        });
        toast.success("Changes saved. Files are being regenerated with the updated report data.");
        if (onSuccess) onSuccess();
        onClose();
        return;
      }
      let pdfRefreshed = false;
      try {
        const pdf = await refreshLotListingSpecPdf(reportId);
        setPreviewFiles((prev: any) => ({
          ...(prev || {}),
          ...(pdf.data?.preview_files || {}),
          spec_pdf: pdf.data?.spec_pdf || pdf.data?.preview_files?.spec_pdf || prev?.spec_pdf,
        }));
        if (pdf.data?.preview_data) setPreviewData(pdf.data.preview_data);
        pdfRefreshed = true;
      } catch (pdfError: any) {
        toast.error(pdfError.response?.data?.message || "Changes saved, but CR could not be refreshed.");
      }
      setHasChanges(false);
      toast.success(pdfRefreshed ? "Changes saved and CR refreshed." : "Changes saved successfully.");
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

    if (filesGenerating || filesRegenerating) {
      toast.info("This lot listing is already generating files.");
      return;
    }

    try {
      setSubmitting(true);

      if (isResubmitMode) {
        const updated = await resubmitLotListing(reportId, { preview_data: previewData });
        setHasChanges(false);
        applyLotListingState(updated, {
          assumeFilesGenerating: true,
          assumeFilesRegenerating: true,
        });
        toast.success("Lot listing approved files are being regenerated.");
      } else {
        await updateLotListingPreview(reportId, {
          preview_data: previewData,
          regenerate_files_on_lot_number_change: false,
        });
        setHasChanges(false);
        const submitted = await submitLotListingForApproval(reportId, { preview_data: previewData });
        applyLotListingState(submitted, {
          assumeFilesGenerating: true,
          assumeFilesRegenerating: false,
        });
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

  const requestCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.info("Browser location access is unavailable.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords || ({} as any);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          toast.error("Could not detect latitude and longitude.");
          return;
        }
        setPreviewData((prev: any) => ({
          ...prev,
          location: CURRENT_BROWSER_LOCATION_LABEL,
          latitude,
          longitude,
        }));
        setHasChanges(true);
        toast.success("Current location updated.");
      },
      () => {
        toast.error("Browser location access denied or unavailable.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  const updateLot = (index: number, field: string, value: any) => {
    const nextValue =
      field === "description" ? String(value || "").slice(0, 60) : value;
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      newLots[index] = { ...newLots[index], [field]: nextValue };
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

  const updateLotSpec = (index: number, fieldName: string, value: string) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev?.lots || [])];
      const lot = { ...(newLots[index] || {}) };
      const existingSpecs =
        lot.condition_report_specs && typeof lot.condition_report_specs === "object" && !Array.isArray(lot.condition_report_specs)
          ? { ...lot.condition_report_specs }
          : Array.isArray(lot.condition_report_specs)
            ? Object.fromEntries(
                lot.condition_report_specs
                  .map((entry: any) => [String(entry?.field || "").trim(), String(entry?.value || "").trim()])
                  .filter((entry: string[]) => entry[0])
              )
            : {};
      const deletedSpecs = Array.isArray(lot.condition_report_specs_deleted)
        ? lot.condition_report_specs_deleted
            .map((field: any) => String(field || "").trim())
            .filter(Boolean)
        : [];
      const fieldKey = normalizeSpecKey(fieldName);
      existingSpecs[fieldName] = value;
      lot.condition_report_specs_deleted = deletedSpecs.filter(
        (field: string) => normalizeSpecKey(field) !== fieldKey
      );
      lot.condition_report_specs = existingSpecs;
      newLots[index] = lot;
      return { ...prev, lots: newLots, total_value: calculateTotalValue(newLots) };
    });
    setHasChanges(true);
  };

  const deleteLotSpec = (index: number, fieldName: string) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev?.lots || [])];
      const lot = { ...(newLots[index] || {}) };
      const existingSpecs =
        lot.condition_report_specs && typeof lot.condition_report_specs === "object" && !Array.isArray(lot.condition_report_specs)
          ? { ...lot.condition_report_specs }
          : Array.isArray(lot.condition_report_specs)
            ? Object.fromEntries(
                lot.condition_report_specs
                  .map((entry: any) => [String(entry?.field || "").trim(), String(entry?.value || "").trim()])
                  .filter((entry: string[]) => entry[0])
              )
            : {};
      const deletedSpecs = Array.isArray(lot.condition_report_specs_deleted)
        ? lot.condition_report_specs_deleted
            .map((field: any) => String(field || "").trim())
            .filter(Boolean)
        : [];
      const fieldKey = normalizeSpecKey(fieldName);
      const existingKey = Object.keys(existingSpecs).find(
        (field) => normalizeSpecKey(field) === fieldKey
      );
      if (existingKey) delete existingSpecs[existingKey];
      if (!deletedSpecs.some((field: string) => normalizeSpecKey(field) === fieldKey)) {
        deletedSpecs.push(fieldName);
      }
      lot.condition_report_specs = existingSpecs;
      lot.condition_report_specs_deleted = deletedSpecs;
      newLots[index] = lot;
      return { ...prev, lots: newLots, total_value: calculateTotalValue(newLots) };
    });
    setHasChanges(true);
  };

  const specsByCategory = React.useMemo(
    () =>
      new Map(
        categorySpecs.map((spec) => [
          String(spec.childCategory || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ""),
          spec,
        ])
      ),
    [categorySpecs]
  );

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
  const includeDamageAnalysis = previewData?.include_damage_analysis !== false;
  const specPdfUrl = previewFiles?.spec_pdf;

  const handlePrintSpecPdf = () => {
    if (!specPdfUrl) return;
    const printWindow = window.open(specPdfUrl, "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.info("Open the CR download, then print from your browser.");
      return;
    }
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // Browser PDF viewers may block programmatic print for cross-origin files.
      }
    }, 1200);
  };

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

      {specPdfUrl && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-slate-900">CR</p>
          </div>
          <button
            type="button"
            onClick={handlePrintSpecPdf}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <a
            href={specPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500"
          >
            <Download className="h-4 w-4" />
            Download CR
          </a>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          <datalist id="lot-listing-auctioneer-categories">
            {categorySpecs.map((spec) => (
              <option key={spec.childCategory} value={spec.childCategory} />
            ))}
          </datalist>
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

            <div className="rounded-xl border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow-card)] sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Damage Analysis</h4>
                  <p className="mt-1 text-sm text-gray-600">
                    Include visible damage notes in the Excel Damage Analysis column.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateField("include_damage_analysis", !includeDamageAnalysis)
                  }
                  className={`inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    includeDamageAnalysis
                      ? "border-purple-500 bg-purple-50 text-purple-700"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {includeDamageAnalysis ? "Included" : "Excluded"}
                </button>
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
                    <div key={idx} className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] shadow-[var(--app-shadow-card)] backdrop-blur">
                      <div className="mb-3 flex items-center justify-between border-t-4 border-purple-500 bg-white px-4 py-4 shadow-sm">
                        <div className="text-sm font-semibold text-gray-900">
                          Lot #{getLotDisplayNumber(lot, idx)}
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
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Lot #</label>
                          <input
                            type="text"
                            value={String(lot.lot_number ?? getLotDisplayNumber(lot, idx))}
                            onChange={(e) => updateLot(idx, "lot_number", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder={String(idx + 1)}
                          />
                        </div>
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
                            maxLength={60}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-y min-h-[80px]"
                            placeholder="Description"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Category</label>
                          <input
                            type="text"
                            list="lot-listing-auctioneer-categories"
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
                        <div className="sm:col-span-2">
                          <AuctioneerSpecsEditor
                            lot={lot}
                            lotIndex={idx}
                            specsByCategory={specsByCategory}
                            onChange={updateLotSpec}
                            onDelete={deleteLotSpec}
                            accent="purple"
                          />
                        </div>
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
                <span className="text-xs text-amber-600">Changes will be saved when files generate</span>
              )}
              {false && hasChanges && (
                <span className="text-xs text-amber-600">⚠️ Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSubmitForApproval}
                disabled={submitting || saving || filesGenerating || filesRegenerating}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30 transition-all"
              >
                {submitting || saving ? (
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
