"use client";

import React, { useState, useEffect } from "react";
import { Send, AlertCircle, Image, ChevronLeft, ChevronRight, X, RefreshCw, Download, Printer, Upload, Trash2, Save } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  getLotListingPreview,
  getLotListingSubmittedPreview,
  updateLotListingPreview,
  uploadLotListingPreviewLotImages,
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
import { ReportsService } from "@/services/reports";
import {
  applyDamageAnalysisLotPolicy,
  getLotNumberForDamagePolicy,
  isDamageAnalysisEligibleForLot,
} from "@/lib/lotDamagePolicy";
import {
  removeGalleryPhotoEntry,
  removeLotPhotoReference,
} from "@/lib/previewPhotoDeletion";

interface LotListingPreviewModalProps {
  reportId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (submittedReport?: any) => void;
  isResubmitMode?: boolean;
  isAssignedApprovalMode?: boolean;
  loadPreviewDataOverride?: (id: string) => Promise<any>;
  updatePreviewDataOverride?: (id: string, previewData: any) => Promise<any>;
  resubmitReportOverride?: (id: string, previewData?: any) => Promise<any>;
  uploadPreviewLotImagesOverride?: (
    id: string,
    lotKey: string | number,
    files: File[],
    previewData?: any,
    onProgress?: (progress: number) => void
  ) => Promise<any>;
  refreshSpecPdfOverride?: (id: string) => Promise<any>;
}

type ConditionSelectionKey = "condition" | "completeness" | "legal";

type LotGalleryEntry = {
  url: string;
  globalIndex: number | null;
  lotIndex: number;
};

type LotGalleryState = {
  entries: LotGalleryEntry[];
  currentIdx: number;
};

const conditionSelectionGroups: Array<{
  key: ConditionSelectionKey;
  label: string;
  options: string[];
}> = [
  {
    key: "condition",
    label: "Running Condition",
    options: [
      "Starts and Runs",
      "Does not Start or Run",
      "Starts and Runs with Boost",
      "Unverified Running Condition",
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

const runningConditionGroup = conditionSelectionGroups.find(
  (group) => group.key === "condition"
)!;

const normalizeConditionSelection = (value: any) => {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/^na$/, "n/a")
    .replace(/^not applicable$/, "n/a");
  if (
    normalized === "unknown working condition" ||
    normalized === "untested" ||
    normalized === "unverified working condition"
  ) {
    return "unverified running condition";
  }
  if (normalized === "non-operational" || normalized === "non operational") {
    return "does not start or run";
  }
  return normalized;
};

const normalizeSpecKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const specsToRecord = (value: any): Record<string, string> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? { ...value }
    : Array.isArray(value)
      ? Object.fromEntries(
          value
            .map((entry: any) => [String(entry?.field || "").trim(), String(entry?.value ?? "")])
            .filter((entry: string[]) => entry[0])
        )
      : {};

const applyRunningConditionSelectionToSpecs = (lot: any, value: string) => {
  const specs = specsToRecord(lot.condition_report_specs);
  const fieldKey = normalizeSpecKey("Running Condition");
  const existingKey = Object.keys(specs).find((field) => normalizeSpecKey(field) === fieldKey);
  if (normalizeConditionSelection(value) === "n/a") {
    if (existingKey) delete specs[existingKey];
  } else {
    specs[existingKey || "Running Condition"] = value;
  }
  const deletedSpecs = Array.isArray(lot.condition_report_specs_deleted)
    ? lot.condition_report_specs_deleted
        .map((field: any) => String(field || "").trim())
        .filter(Boolean)
        .filter((field: string) => normalizeSpecKey(field) !== fieldKey)
    : [];
  return {
    ...lot,
    condition_report_specs: specs,
    condition_report_specs_deleted: deletedSpecs,
  };
};

const getSharedRunningConditionSelection = (lots: any[] | undefined | null) => {
  if (!Array.isArray(lots) || lots.length === 0) return "";
  const first = normalizeConditionSelection(
    lots[0]?.condition_report_selections?.condition
  );
  if (
    !first ||
    !runningConditionGroup.options.some(
      (option) => normalizeConditionSelection(option) === first
    )
  ) {
    return "";
  }
  const allSame = lots.every(
    (lot) =>
      normalizeConditionSelection(lot?.condition_report_selections?.condition) ===
      first
  );
  return allSame ? first : "";
};

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
  isAssignedApprovalMode = false,
  loadPreviewDataOverride,
  updatePreviewDataOverride,
  resubmitReportOverride,
  uploadPreviewLotImagesOverride,
  refreshSpecPdfOverride,
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
  const [uploadingLotKey, setUploadingLotKey] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<any>(null);
  const [categorySpecs, setCategorySpecs] = useState<AssetCategorySpec[]>([]);
  const [galleryLotImages, setGalleryLotImages] = useState<LotGalleryState | null>(null);

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
      setPreviewData(applyDamageAnalysisLotPolicy({
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
      }));
    }

    const nextPreviewFiles = data.preview_files || data.files;
    if (nextPreviewFiles) setPreviewFiles(nextPreviewFiles);
    setImageUrls(Array.isArray(data.imageUrls) ? data.imageUrls : []);
  };

  const loadPreviewData = async () => {
    try {
      setLoading(true);
      const [response, categorySpecResponse] = await Promise.all([
        loadPreviewDataOverride
          ? loadPreviewDataOverride(reportId)
          : isResubmitMode
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
      const previewForRequest = applyDamageAnalysisLotPolicy(previewData);
      setPreviewData(previewForRequest);
      const saved = updatePreviewDataOverride
        ? await updatePreviewDataOverride(reportId, previewForRequest)
        : await updateLotListingPreview(reportId, { preview_data: previewForRequest });
      if ((saved as any)?.data) {
        applyLotListingState(
          updatePreviewDataOverride
            ? { preview_data: (saved as any).data }
            : (saved as any).data
        );
      }
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
        const pdf = refreshSpecPdfOverride
          ? await refreshSpecPdfOverride(reportId)
          : await refreshLotListingSpecPdf(reportId);
        setPreviewFiles((prev: any) => ({
          ...(prev || {}),
          ...(pdf.data?.preview_files || {}),
          spec_pdf: pdf.data?.spec_pdf || pdf.data?.preview_files?.spec_pdf || prev?.spec_pdf,
          cr_docx: pdf.data?.cr_docx || pdf.data?.preview_files?.cr_docx || prev?.cr_docx,
        }));
        if (pdf.data?.preview_data) {
          setPreviewData(applyDamageAnalysisLotPolicy(pdf.data.preview_data));
        }
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
      let submittedReport: LotListing | undefined;

      if (isResubmitMode) {
        const previewForRequest = applyDamageAnalysisLotPolicy(previewData);
        setPreviewData(previewForRequest);
        const updated = resubmitReportOverride
          ? await resubmitReportOverride(reportId, previewForRequest)
          : await resubmitLotListing(reportId, { preview_data: previewForRequest });
        submittedReport = updated;
        setHasChanges(false);
        applyLotListingState(updated, {
          assumeFilesGenerating: true,
          assumeFilesRegenerating: true,
        });
        toast.success(
          isAssignedApprovalMode
            ? "Lot listing files are being regenerated and will remain pending approval."
            : "Lot listing files are being regenerated and will remain automatically released."
        );
      } else {
        // Submit the edited snapshot once. Saving first and then submitting the
        // previous React state allowed the second request to restore stale text.
        const previewForRequest = applyDamageAnalysisLotPolicy(previewData);
        setPreviewData(previewForRequest);
        const submitted = await submitLotListingForApproval(reportId, { preview_data: previewForRequest });
        submittedReport = submitted;
        setHasChanges(false);
        applyLotListingState(submitted, {
          assumeFilesGenerating: true,
          assumeFilesRegenerating: false,
        });
        toast.success("Lot listing files are being generated and will be released automatically.");
      }

      if (onSuccess) onSuccess(submittedReport);
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to submit lot listing");
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
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      const nextLot = { ...newLots[index], [field]: value };
      if (
        field === "lot_number" &&
        !isDamageAnalysisEligibleForLot(getLotNumberForDamagePolicy(nextLot))
      ) {
        nextLot.damage_analysis = "";
      }
      newLots[index] = nextLot;
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

  const addLotSpec = (index: number, fieldName: string, value: string) => {
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
      const field = String(fieldName || "").trim();
      const fieldKey = normalizeSpecKey(field);
      const existingKey = Object.keys(existingSpecs).find(
        (candidate) => normalizeSpecKey(candidate) === fieldKey
      );
      existingSpecs[existingKey || field] = value;
      const deletedSpecs = Array.isArray(lot.condition_report_specs_deleted)
        ? lot.condition_report_specs_deleted
            .map((item: any) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const customOrder = Array.isArray(lot.condition_report_specs_custom_order)
        ? lot.condition_report_specs_custom_order
            .map((item: any) => String(item || "").trim())
            .filter(Boolean)
        : [];
      if (!customOrder.some((item: string) => normalizeSpecKey(item) === fieldKey)) {
        customOrder.push(existingKey || field);
      }
      lot.condition_report_specs = existingSpecs;
      lot.condition_report_specs_deleted = deletedSpecs.filter(
        (item: string) => normalizeSpecKey(item) !== fieldKey
      );
      lot.condition_report_specs_custom_order = customOrder;
      newLots[index] = lot;
      return { ...prev, lots: newLots, total_value: calculateTotalValue(newLots) };
    });
    setHasChanges(true);
  };

  const deleteLotImage = (
    lotIndex: number,
    entry: Pick<LotGalleryEntry, "globalIndex" | "url">
  ) => {
    if (
      !window.confirm(
        "Remove this photo from the lot? It will be permanently deleted from storage after you Save or Submit. Closing without saving leaves storage unchanged."
      )
    ) {
      return;
    }
    setPreviewData((prev: any) => {
      const next = removeLotPhotoReference(prev, lotIndex, entry) as any;
      return {
        ...next,
        total_value: calculateTotalValue(next?.lots || []),
      };
    });
    setGalleryLotImages((prev) => {
      if (!prev) return prev;
      const next = removeGalleryPhotoEntry(prev.entries, prev.currentIdx, {
        ...entry,
        lotIndex,
      });
      return next.entries.length ? next : null;
    });
    setHasChanges(true);
  };

  const getLotUploadKey = (lot: any, index: number) =>
    String(lot?.lot_id || lot?.id || lot?.lot_number || index);

  const getLotPhotoEntries = (lot: any) => {
    const indexes = [
      ...(Array.isArray(lot?.image_indexes) ? lot.image_indexes : []),
      ...(Array.isArray(lot?.extra_image_indexes) ? lot.extra_image_indexes : []),
    ]
      .map((value) => Number(value))
      .filter((value, index, arr) => Number.isInteger(value) && value >= 0 && arr.indexOf(value) === index);
    const entries: Array<{ globalIndex: number | null; url: string }> = indexes.flatMap((globalIndex) => {
      const url = imageUrls[globalIndex];
      return url ? [{ globalIndex, url }] : [];
    });
    const fallbackUrls = [
      ...(Array.isArray(lot?.image_urls) ? lot.image_urls : []),
      ...(Array.isArray(lot?.extra_image_urls) ? lot.extra_image_urls : []),
      lot?.image_url,
    ].filter((url): url is string => typeof url === "string" && Boolean(url));
    fallbackUrls.forEach((url) => {
      if (entries.some((entry) => entry.url === url)) return;
      const rootIndex = imageUrls.indexOf(url);
      entries.push({ globalIndex: rootIndex >= 0 ? rootIndex : null, url });
    });
    return entries;
  };

  const handleUploadLotImages = async (lot: any, index: number, fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    const lotKey = getLotUploadKey(lot, index);
    setUploadingLotKey(lotKey);
    try {
      const response = uploadPreviewLotImagesOverride
        ? await uploadPreviewLotImagesOverride(
            reportId,
            lotKey,
            files,
            previewData
          )
        : await uploadLotListingPreviewLotImages(
            reportId,
            lotKey,
            files,
            previewData
          );
      if (response.data?.preview_data) {
        setPreviewData(applyDamageAnalysisLotPolicy(response.data.preview_data));
      }
      if (Array.isArray(response.data?.imageUrls)) {
        setImageUrls(response.data.imageUrls);
      }
      if (response.data?.preview_files) {
        setPreviewFiles(response.data.preview_files);
      }
      setFilesGenerating(Boolean(response.data?.files_generating));
      setFilesRegenerating(Boolean(response.data?.files_regenerating));
      setHasChanges(false);
      toast.success(response.files_regeneration_queued ? "Images uploaded. Files are regenerating." : "Images uploaded.");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to upload images.");
    } finally {
      setUploadingLotKey(null);
    }
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
      newLots[index] =
        key === "condition" ? applyRunningConditionSelectionToSpecs(lot, value) : lot;
      return { ...prev, lots: newLots };
    });
    setHasChanges(true);
  };

  const applyRunningConditionToAllLots = (value: string) => {
    setPreviewData((prev: any) => {
      const lots = Array.isArray(prev?.lots) ? prev.lots : [];
      const newLots = lots.map((rawLot: any) => {
        const lot = {
          ...(rawLot || {}),
          condition_report_selections: {
            ...(rawLot?.condition_report_selections || {}),
            condition: value,
          },
        };
        return applyRunningConditionSelectionToSpecs(lot, value);
      });
      return {
        ...prev,
        lots: newLots,
        total_value: calculateTotalValue(newLots),
      };
    });
    setHasChanges(true);
    toast.success(`Running Condition applied to all lots: ${value}`);
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
  const crDocxUrl = previewFiles?.cr_docx;

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

  const handleDownloadSpecPdf = async () => {
    try {
      const { blob, filename } = await ReportsService.downloadCr(reportId);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename || `lot-listing-cr-${reportId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      toast.success(`Download started: ${anchor.download}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Unable to download CR.");
    }
  };

  const handleDownloadCrDocx = async () => {
    try {
      const { blob, filename } = await ReportsService.downloadCrDocx(reportId);
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename || `lot-listing-cr-${reportId}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      toast.success(`Download started: ${anchor.download}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Unable to download CR DOCX.");
    }
  };

  const renderConditionSelections = (lot: any, idx: number) => {
    const selections = lot?.condition_report_selections || {};

    return (
      <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Required selections
          </p>
          <span className="rounded-full bg-[var(--app-panel)] px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
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
                <div className="mb-1 text-[11px] font-semibold text-[var(--app-text-muted)]">
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
                            ? "border-amber-500 bg-[var(--app-panel)] text-amber-950 shadow-sm"
                            : "border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-text-muted)] hover:border-amber-300 hover:bg-[var(--app-panel)]"
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

  const renderBulkRunningConditionControl = () => {
    const lots = Array.isArray(previewData?.lots) ? previewData.lots : [];
    if (lots.length < 2) return null;
    const sharedSelection = getSharedRunningConditionSelection(lots);

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-amber-950">
              Set Running Condition for all lots
            </h4>
            <p className="text-xs text-amber-800">
              Optional shortcut for large listings. Individual lots can still be changed after this.
            </p>
          </div>
          <span className="self-start rounded-full bg-[var(--app-panel)] px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
            {lots.length} lots
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {runningConditionGroup.options.map((option) => {
            const selected =
              sharedSelection === normalizeConditionSelection(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => applyRunningConditionToAllLots(option)}
                className={`app-button !min-h-8 !px-3 !py-1.5 !text-xs ${
                  selected
                    ? "app-button--primary"
                    : "app-button--secondary"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const requestClose = () => {
    if (saving || submitting) return;
    if (
      hasChanges &&
      !window.confirm("You have unsaved preview changes. Close without saving them?")
    ) {
      return;
    }
    onClose();
  };

  return (
    <BottomDrawer
      open={isOpen}
      onClose={requestClose}
      title="Lot Listing Preview"
      description="Review the complete listing, save your progress, and return when you are ready to generate files."
      fullscreen
      dismissOnBackdrop={false}
    >
      <div className="preview-editor">
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
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-[var(--app-panel)] px-4 py-3 shadow-sm">
          <div className="mr-auto">
            <p className="text-sm font-semibold text-slate-900">CR</p>
          </div>
          <button
            type="button"
            onClick={handlePrintSpecPdf}
            className="app-button app-button--secondary"
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadSpecPdf()}
            className="app-button app-button--primary"
          >
            <Download className="h-4 w-4" />
            Download CR
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadCrDocx()}
            className="app-button app-button--secondary"
            title={crDocxUrl ? "Download editable CR Word file" : "Generate and download editable CR Word file"}
          >
            <Download className="h-4 w-4" />
            CR DOCX
          </button>
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
          <div className="mx-auto max-w-5xl space-y-4 pb-24">
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-sm  sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-[var(--app-text)] mb-4 flex items-center gap-2">
                <span className="text-purple-600">📋</span>
                Listing Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-[var(--app-text-muted)] mb-1.5">
                    Contract Number *
                  </label>
                  <input
                    type="text"
                    value={previewData?.contract_no || ""}
                    onChange={(e) => updateField("contract_no", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--app-border)] rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    placeholder="e.g., CTR-2024-001"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-[var(--app-text-muted)] mb-1.5">
                    Bank
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField("bank_photos_enabled", !previewData?.bank_photos_enabled)
                    }
                    className={`app-button w-full justify-between ${
                      previewData?.bank_photos_enabled
                        ? "app-button--primary"
                        : "app-button--secondary"
                    }`}
                    aria-pressed={!!previewData?.bank_photos_enabled}
                  >
                    <span>Include all photos in CR</span>
                    <span className="rounded-full bg-[var(--app-panel)] px-2 py-0.5 text-xs text-[var(--app-accent)] shadow-sm">
                      {previewData?.bank_photos_enabled ? "On" : "Off"}
                    </span>
                  </button>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-[var(--app-text-muted)] mb-1.5">
                    Currency
                  </label>
                  <select
                    value={previewData?.currency || "CAD"}
                    onChange={(e) => updateField("currency", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[var(--app-border)] rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  >
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[var(--app-text)]">Damages</h4>
                  <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                    Applies to lot numbers up to and including 1000. Lot numbers above 1000 never require Damage Analysis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateField("include_damage_analysis", !includeDamageAnalysis)
                  }
                  className={`app-button ${
                    includeDamageAnalysis
                      ? "app-button--primary"
                      : "app-button--secondary"
                  }`}
                >
                  {includeDamageAnalysis ? "Included" : "Excluded"}
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-[var(--app-panel)] from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-[var(--app-text)] mb-3">📊 Listing Statistics</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{lotsArray.length}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">Total Lots</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{previewData?.currency || "CAD"}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">Currency</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{imageUrls.length}</div>
                  <div className="text-xs text-[var(--app-text-muted)]">Images</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {displayedTotalValue
                      ? `${previewData.currency || "CAD"} ${displayedTotalValue.toLocaleString()}`
                      : "-"}
                  </div>
                  <div className="text-xs text-[var(--app-text-muted)]">Total Value</div>
                </div>
              </div>
            </div>

            {renderBulkRunningConditionControl()}
          </div>

          {/* Lot-Specific Photo Gallery Modal */}
          {galleryLotImages !== null && (
            <div
              className="fixed inset-0 z-50 flex flex-col bg-black/95"
              role="dialog"
              aria-modal="true"
              aria-label="Lot photo gallery"
              onClick={() => setGalleryLotImages(null)}
            >
              <div
                className="flex items-center justify-between gap-3 bg-black/50 p-4"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-white text-sm font-medium">
                  Photo {galleryLotImages.currentIdx + 1} of {galleryLotImages.entries.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const current = galleryLotImages.entries[galleryLotImages.currentIdx];
                      if (current) deleteLotImage(current.lotIndex, current);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white shadow transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                    aria-label={`Remove photo ${galleryLotImages.currentIdx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Remove photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryLotImages(null)}
                    className="p-2 text-white transition-colors hover:text-gray-300"
                    aria-label="Close photo gallery"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 relative" onClick={(e) => e.stopPropagation()}>
                {galleryLotImages.currentIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: prev.currentIdx - 1 } : null)}
                    className="absolute left-4 text-white hover:text-gray-300 transition-colors bg-black/30 rounded-full p-2"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                )}
                {galleryLotImages.currentIdx < galleryLotImages.entries.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: prev.currentIdx + 1 } : null)}
                    className="absolute right-4 text-white hover:text-gray-300 transition-colors bg-black/30 rounded-full p-2"
                    aria-label="Next photo"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                )}
                { }
                <img
                  src={galleryLotImages.entries[galleryLotImages.currentIdx]?.url}
                  alt={`Photo ${galleryLotImages.currentIdx + 1}`}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm"
                />
              </div>
              <div className="bg-black/70 p-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-2 overflow-x-auto pb-2 justify-center">
                  {galleryLotImages.entries.map((entry, i) => (
                    <button
                      type="button"
                      key={`${entry.globalIndex ?? "url"}-${entry.url}`}
                      onClick={() => setGalleryLotImages(prev => prev ? { ...prev, currentIdx: i } : null)}
                      className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden cursor-pointer transition-all ${
                        i === galleryLotImages.currentIdx
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-105'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                    >
                      { }
                      <img src={entry.url} alt={`Photo ${i + 1} thumbnail`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Lots Section */}
          <div className="mt-6 space-y-4 max-w-5xl mx-auto">
            <h3 className="text-base sm:text-lg font-bold text-[var(--app-text)]">Lots ({lotsArray.length})</h3>
            {lotsArray.length > 0 ? (
              <div className="space-y-4">
                {lotsArray.map((lot, idx) => {
                  const lotImages = getLotPhotoEntries(lot);
                  const lotUploadKey = getLotUploadKey(lot, idx);
                  const uploadInputId = `lot-listing-preview-upload-${idx}`;
                  const openLotGallery = (startIdx: number) => {
                    setGalleryLotImages({
                      entries: lotImages.map((entry) => ({ ...entry, lotIndex: idx })),
                      currentIdx: startIdx,
                    });
                  };

                  return (
                    <div key={idx} className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] shadow-sm ">
                      <div className="mb-3 flex items-center justify-between border-t-4 border-purple-500 bg-[var(--app-panel)] px-4 py-4 shadow-sm">
                        <div className="text-sm font-semibold text-[var(--app-text)]">
                          Lot #{getLotDisplayNumber(lot, idx)}
                        </div>
                        <button
                          onClick={() => deleteLot(idx)}
                          className="app-button app-button--danger !min-h-7 !rounded-md !px-2 !py-1 !text-xs"
                        >
                          Delete
                        </button>
                      </div>

                      {/* Lot Images */}
                      <div className="mb-3">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
                            <Image className="h-3.5 w-3.5" />
                            Photos ({lotImages.length})
                          </label>
                          <input
                            id={uploadInputId}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              handleUploadLotImages(lot, idx, event.target.files);
                              event.currentTarget.value = "";
                            }}
                          />
                          <button
                            type="button"
                            disabled={uploadingLotKey === lotUploadKey}
                            onClick={() => document.getElementById(uploadInputId)?.click()}
                            className="app-button app-button--secondary !min-h-7 !rounded-md !px-2.5 !py-1 !text-[11px]"
                          >
                            <Upload className="h-3 w-3" />
                            {uploadingLotKey === lotUploadKey ? "Uploading" : "Upload images"}
                          </button>
                        </div>
                        {lotImages.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {lotImages.slice(0, 10).map(({ url, globalIndex }, imgIdx) => (
                              <div
                                key={imgIdx}
                                className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-[var(--app-border)] cursor-pointer hover:border-purple-500 transition-all"
                                onClick={() => openLotGallery(imgIdx)}
                              >
                                { }
                                <img src={url} alt={`Photo ${imgIdx + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    deleteLotImage(idx, { globalIndex, url });
                                  }}
                                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-black text-white shadow"
                                  aria-label={`Remove photo ${imgIdx + 1}`}
                                >
                                  x
                                </button>
                              </div>
                            ))}
                            {lotImages.length > 10 && (
                              <button
                                type="button"
                                className="flex h-16 w-16 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-alt)] transition-colors hover:border-[var(--app-accent)] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent)]"
                                onClick={() => openLotGallery(10)}
                                aria-label={`Open ${lotImages.length - 10} more photos`}
                              >
                                <span className="text-xs font-semibold text-[var(--app-text-muted)]">+{lotImages.length - 10}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Lot Fields */}
                      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Lot #</label>
                          <input
                            type="text"
                            value={String(lot.lot_number ?? getLotDisplayNumber(lot, idx))}
                            onChange={(e) => updateLot(idx, "lot_number", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder={String(idx + 1)}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Title</label>
                          <input
                            type="text"
                            value={lot.title || ""}
                            onChange={(e) => updateLot(idx, "title", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Lot title"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Est. Value</label>
                          <input
                            type="text"
                            value={lot.estimated_value || ""}
                            onChange={(e) => updateLot(idx, "estimated_value", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Description</label>
                          <textarea
                            value={lot.description || ""}
                            onChange={(e) => updateLot(idx, "description", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-y min-h-[80px]"
                            placeholder="Description"
                            rows={3}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Category</label>
                          <input
                            type="text"
                            list="lot-listing-auctioneer-categories"
                            value={lot.categories || ""}
                            onChange={(e) => updateLot(idx, "categories", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Category"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Item Condition</label>
                          <input
                            type="text"
                            value={lot.item_condition || ""}
                            onChange={(e) => updateLot(idx, "item_condition", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
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
                            onAdd={addLotSpec}
                            onDelete={deleteLotSpec}
                            includeDamageAnalysis={includeDamageAnalysis}
                            damageEligible={isDamageAnalysisEligibleForLot(
                              getLotNumberForDamagePolicy(lot)
                            )}
                            damageAnalysis={lot.damage_analysis}
                            onDamageAnalysisChange={(lotIndex, value) =>
                              updateLot(lotIndex, "damage_analysis", value)
                            }
                            accent="purple"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Serial Number</label>
                          <input
                            type="text"
                            value={lot.serial_number || ""}
                            onChange={(e) => updateLot(idx, "serial_number", e.target.value)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            placeholder="Serial/VIN"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--app-text-muted)] mb-1">Quantity</label>
                          <input
                            type="number"
                            value={lot.quantity || 1}
                            onChange={(e) => updateLot(idx, "quantity", parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 border border-[var(--app-border)] rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                            min={1}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--app-text-muted)]">
                No lots in this listing yet.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="sticky bottom-0 z-10 mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-between gap-2.5 border-t border-[var(--app-border)] bg-[var(--app-panel)] pt-3 pb-1">
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={!hasChanges || saving || submitting || filesGenerating || filesRegenerating}
                className="app-button app-button--secondary"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={submitting || saving || filesGenerating || filesRegenerating}
                className="app-button app-button--primary"
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
      </div>
    </BottomDrawer>
  );
}
