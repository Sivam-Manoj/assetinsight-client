"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Save, Send, AlertCircle, Image, ChevronLeft, ChevronRight, X, RefreshCw, Download, Printer, Upload } from "lucide-react";
import { toast } from "react-toastify";
import {
  getPreviewData, 
  updatePreviewData, 
  submitForApproval,
  getSubmittedPreviewData,
  resubmitReport,
  getAssetCategorySpecs,
  refreshAssetSpecPdf,
  uploadPreviewLotImages,
  type AssetCategorySpec,
} from "@/services/assets";
import BottomDrawer from "@/components/BottomDrawer";
import AuctioneerSpecsEditor from "@/components/reports/AuctioneerSpecsEditor";
import {
  CURRENT_BROWSER_LOCATION_LABEL,
} from "@/lib/browserLocation";
import { ReportsService } from "@/services/reports";

interface PreviewModalProps {
  reportId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  isResubmitMode?: boolean; // If true, this is for editing/resubmitting an already submitted report
  loadPreviewDataOverride?: (reportId: string) => Promise<any>;
  updatePreviewDataOverride?: (
    reportId: string,
    previewData: any
  ) => Promise<{ message: string; data: any; files_regeneration_queued?: boolean }>;
  resubmitReportOverride?: (
    reportId: string,
    previewData?: any
  ) => Promise<{ message: string; data: any }>;
  uploadPreviewLotImagesOverride?: (
    reportId: string,
    lotKey: string | number,
    files: File[],
    previewData?: any,
    onProgress?: (progress: number) => void
  ) => Promise<any>;
  refreshAssetSpecPdfOverride?: (reportId: string) => Promise<{
    message: string;
    data: {
      spec_pdf: string;
      cr_docx?: string;
      preview_files?: Record<string, string>;
      preview_data?: any;
    };
  }>;
  isAssignedApprovalMode?: boolean;
}

type FocusableFormElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement;

type ConditionSelectionKey = "condition" | "completeness" | "legal";
type ExpandableLotTextField =
  | "lot_number"
  | "title"
  | "categories"
  | "description"
  | "details"
  | "estimated_value";

type ExpandedLotTextEditor = {
  lotIndex: number;
  field: ExpandableLotTextField;
  variant: "mobile" | "desktop";
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

type SignaturePadProps = {
  value?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

const SIGNATURE_CANVAS_WIDTH = 900;
const SIGNATURE_CANVAS_HEIGHT = 260;

function AppraiserSignaturePad({ value, disabled, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const clearCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    clearCanvas();
    hasInkRef.current = false;

    if (!value) return;

    const image = new window.Image();
    image.onload = () => {
      clearCanvas();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      hasInkRef.current = true;
    };
    image.src = value;
  }, [clearCanvas, value]);

  const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    if (!canvas || !ctx || !point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    hasInkRef.current = true;
    lastPointRef.current = point;

    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const point = getCanvasPoint(event);
    const lastPoint = lastPointRef.current;
    if (!canvas || !ctx || !point || !lastPoint) return;

    event.preventDefault();
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const finishDrawing = () => {
    const canvas = canvasRef.current;
    if (!drawingRef.current || !canvas) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (hasInkRef.current) {
      onChange(canvas.toDataURL("image/png"));
    }
  };

  const handleClear = () => {
    if (disabled) return;
    clearCanvas();
    hasInkRef.current = false;
    drawingRef.current = false;
    lastPointRef.current = null;
    onChange(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-gray-800">
            Appraiser Signature
          </label>
          <p className="mt-0.5 text-xs text-gray-500">
            This signature is added to the DOCX appraisal signature areas.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled || !value}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={SIGNATURE_CANVAS_WIDTH}
        height={SIGNATURE_CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        onPointerLeave={finishDrawing}
        className={`h-40 w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 touch-none ${
          disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"
        }`}
        aria-label="Draw appraiser signature"
      />
      <p className="mt-2 text-xs text-gray-500">
        {value ? "Saved signature ready for DOCX generation." : "Draw inside the box, then save changes."}
      </p>
    </div>
  );
}

export default function PreviewModal({
  reportId,
  isOpen,
  onClose,
  onSuccess,
  isResubmitMode = false,
  loadPreviewDataOverride,
  updatePreviewDataOverride,
  resubmitReportOverride,
  uploadPreviewLotImagesOverride,
  refreshAssetSpecPdfOverride,
  isAssignedApprovalMode = false,
}: PreviewModalProps) {
  // Single-page layout (tabs removed)
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [declineReason, setDeclineReason] = useState<string>("");
  const [filesGenerating, setFilesGenerating] = useState(false);
  const [filesRegenerating, setFilesRegenerating] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [groupingMode, setGroupingMode] = useState<string | undefined>(undefined);
  const [imageCount, setImageCount] = useState<number | undefined>(undefined);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingLotKey, setUploadingLotKey] = useState<string | null>(null);
  const [previewFiles, setPreviewFiles] = useState<any>(null);
  const [categorySpecs, setCategorySpecs] = useState<AssetCategorySpec[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [expandedLotTextEditor, setExpandedLotTextEditor] = useState<ExpandedLotTextEditor | null>(null);
  // For lot-specific gallery view
  const [galleryLotImages, setGalleryLotImages] = useState<{ urls: string[]; currentIdx: number } | null>(null);
  const focusStateRef = useRef<{
    fieldId: string | null;
    selectionStart: number | null;
    selectionEnd: number | null;
  }>({
    fieldId: null,
    selectionStart: null,
    selectionEnd: null,
  });

  useEffect(() => {
    if (isOpen && reportId) {
      loadPreviewData();
    }
  }, [isOpen, reportId, isResubmitMode]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    const { fieldId, selectionStart, selectionEnd } = focusStateRef.current;
    if (!fieldId || typeof document === "undefined") return;

    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.dataset.focusId === fieldId) return;

    const target = document.querySelector<FocusableFormElement>(
      `[data-focus-id="${fieldId}"]`
    );
    if (!target) return;

    target.focus({ preventScroll: true });

    if (
      typeof selectionStart === "number" &&
      typeof selectionEnd === "number" &&
      "setSelectionRange" in target
    ) {
      try {
        target.setSelectionRange(selectionStart, selectionEnd);
      } catch {
        // Ignore inputs that don't support text selection.
      }
    }
  }, [isOpen, previewData]);

  useEffect(() => {
    if (!expandedLotTextEditor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeExpandedLotTextEditor();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedLotTextEditor]);

  const rememberFocusState = (element: FocusableFormElement) => {
    const fieldId = element.dataset.focusId;
    if (!fieldId) return;

    focusStateRef.current = {
      fieldId,
      selectionStart:
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.selectionStart
          : null,
      selectionEnd:
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.selectionEnd
          : null,
    };
  };

  const getFocusTrackingProps = (fieldId: string) => ({
    "data-focus-id": fieldId,
    onFocusCapture: (event: React.SyntheticEvent<FocusableFormElement>) =>
      rememberFocusState(event.currentTarget),
    onChangeCapture: (event: React.SyntheticEvent<FocusableFormElement>) =>
      rememberFocusState(event.currentTarget),
    onSelectCapture: (event: React.SyntheticEvent<FocusableFormElement>) =>
      rememberFocusState(event.currentTarget),
    onClickCapture: (event: React.SyntheticEvent<FocusableFormElement>) =>
      rememberFocusState(event.currentTarget),
    onKeyUpCapture: (event: React.SyntheticEvent<FocusableFormElement>) =>
      rememberFocusState(event.currentTarget),
  });

  function closeExpandedLotTextEditor() {
    if (focusStateRef.current.fieldId?.startsWith("expanded-lot-")) {
      focusStateRef.current = {
        fieldId: null,
        selectionStart: null,
        selectionEnd: null,
      };
    }
    setExpandedLotTextEditor(null);
  }

  const loadPreviewData = async () => {
    try {
      setLoading(true);
      setFilesGenerating(false);
      setFilesRegenerating(false);
      // Use different endpoint based on mode
      const [response, categorySpecResponse] = await Promise.all([
        loadPreviewDataOverride
          ? loadPreviewDataOverride(reportId)
          : isResubmitMode
            ? getSubmittedPreviewData(reportId)
            : getPreviewData(reportId),
        getAssetCategorySpecs().catch(() => ({ categories: [], specs: [] })),
      ]);
      setCategorySpecs(categorySpecResponse.specs || []);
      setStatus(response.data.status);
      setFilesGenerating(Boolean((response.data as any).files_generating));
      setFilesRegenerating(Boolean((response.data as any).files_regenerating));
      setDeclineReason((response.data as any).decline_reason || "");
      const nextPreviewData = response.data.preview_data || {};
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
      });
      setPreviewFiles((response.data as any).preview_files || null);
      setGroupingMode(response.data.grouping_mode);
      setImageCount(response.data.image_count);
      setImageUrls(response.data.imageUrls || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to load preview data");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (filesGenerating || filesRegenerating) {
      toast.info("This report has already been submitted and is still generating files.");
      return;
    }

    try {
      setSaving(true);
      const savePreview = updatePreviewDataOverride || updatePreviewData;
      const saved = await savePreview(reportId, previewData);
      if (saved?.data) setPreviewData(saved.data);
      if (saved?.files_regeneration_queued) {
        setHasChanges(false);
        toast.success("Changes saved. Files are being regenerated with the updated report data.");
        return;
      }
      let pdfRefreshed = false;
      const refreshSpecPdf = refreshAssetSpecPdfOverride || (!updatePreviewDataOverride ? refreshAssetSpecPdf : null);
      try {
        if (refreshSpecPdf) {
          const pdf = await refreshSpecPdf(reportId);
          setPreviewFiles((prev: any) => ({
            ...(prev || {}),
            ...(pdf.data?.preview_files || {}),
            spec_pdf: pdf.data?.spec_pdf || pdf.data?.preview_files?.spec_pdf || prev?.spec_pdf,
            cr_docx: pdf.data?.cr_docx || pdf.data?.preview_files?.cr_docx || prev?.cr_docx,
          }));
          if (pdf.data?.preview_data) setPreviewData(pdf.data.preview_data);
          pdfRefreshed = true;
        }
      } catch (pdfError: any) {
        toast.error(pdfError.response?.data?.message || "Changes saved, but CR could not be refreshed.");
      }
      setHasChanges(false);
      toast.success(
        pdfRefreshed
          ? "Changes saved and CR refreshed."
          : isAssignedApprovalMode
            ? "Changes saved. Submit to regenerate and approve the report."
            : "Changes saved successfully."
      );
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

    if (filesGenerating || filesRegenerating) {
      toast.info("This report has already been submitted and is still generating files.");
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
        // For resubmit mode: save changes and resubmit in one call
        const submitUpdatedReport = resubmitReportOverride || resubmitReport;
        await submitUpdatedReport(reportId, hasChanges ? previewData : undefined);
        toast.success(
          isAssignedApprovalMode
            ? "Files are regenerating. The report will approve after generation succeeds."
            : "Report resubmitted! Files are being regenerated."
        );
      } else {
        if (hasChanges) {
          await updatePreviewData(reportId, previewData);
          setHasChanges(false);
        }
        await submitForApproval(reportId);
        toast.success("Report submitted for approval successfully!");
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

  const updateAppraiserSignature = (dataUrl: string | null) => {
    setPreviewData((prev: any) => {
      const next = { ...(prev || {}) };
      if (dataUrl) {
        next.appraiser_signature_data_url = dataUrl;
        next.appraiser_signature_updated_at = new Date().toISOString();
      } else {
        delete next.appraiser_signature_data_url;
        delete next.appraiser_signature_updated_at;
      }
      return next;
    });
    setHasChanges(true);
  };

  // Normalize currency prefixes in display value strings without converting amounts
  const handleCurrencyChange = (newCurrency: string) => {
    const normalize = (val: any) => {
      const s = String(val || "");
      if (!s) return s;
      // keep numeric part, dots and commas
      const num = s.replace(/[^0-9.,-]/g, "").replace(/^,+/, "");
      return num ? `${newCurrency} ${num}` : s;
    };

    setPreviewData((prev: any) => {
      const next: any = { ...prev, currency: newCurrency };
      if (next.total_appraised_value != null) {
        next.total_appraised_value = normalize(next.total_appraised_value);
      }
      if (Array.isArray(next.lots)) {
        next.lots = next.lots.map((lot: any) => ({
          ...lot,
          estimated_value: normalize(lot.estimated_value),
        }));
      }
      // Leave valuation_data numeric fields untouched; UI shows currency label separately
      return next;
    });
    setHasChanges(true);
  };

  // Valuation editors (nested)
  const updateValuationBase = (base: number) => {
    setPreviewData((prev: any) => {
      const vd = { ...(prev?.valuation_data || {}) };
      vd.baseFMV = isNaN(base as any) ? vd.baseFMV : base;
      // Optionally sync percentages when base changes (keep values as-is)
      return { ...prev, valuation_data: vd };
    });
    setHasChanges(true);
  };

  const updateValuationMethod = (
    index: number,
    field: "fullName" | "description" | "value" | "saleConditions" | "timeline" | "useCase",
    value: any
  ) => {
    setPreviewData((prev: any) => {
      const vd = { ...(prev?.valuation_data || {}) } as any;
      const methods = Array.isArray(vd.methods) ? [...vd.methods] : [];
      const m = { ...(methods[index] || {}) } as any;
      m[field] = value;
      if (field === "value") {
        const base = Number(vd.baseFMV) || 0;
        const numVal = Number(value);
        if (base > 0 && isFinite(numVal)) {
          m.percentage = Math.round((numVal / base) * 100);
        }
      }
      methods[index] = m;
      return { ...prev, valuation_data: { ...vd, methods } };
    });
    setHasChanges(true);
  };

  const updateLot = (index: number, field: string, value: any) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      newLots[index] = { ...newLots[index], [field]: value };
      return { ...prev, lots: newLots };
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
      return { ...prev, lots: newLots };
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
      return { ...prev, lots: newLots };
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
      return { ...prev, lots: newLots };
    });
    setHasChanges(true);
  };

  const deleteLotImage = (lotIndex: number, globalImageIndex: number) => {
    if (!window.confirm("Remove this image from this lot and regenerated files?")) return;
    setPreviewData((prev: any) => {
      const newLots = [...(prev?.lots || [])];
      const lot = { ...(newLots[lotIndex] || {}) };
      const removeIndex = (values: any) =>
        Array.isArray(values)
          ? values.filter((value) => Number(value) !== globalImageIndex)
          : values;
      lot.image_indexes = removeIndex(lot.image_indexes);
      lot.extra_image_indexes = removeIndex(lot.extra_image_indexes);
      if (Number(lot.image_index) === globalImageIndex) delete lot.image_index;
      if (Number(lot.cover_index) === globalImageIndex) delete lot.cover_index;
      const imageUrl = imageUrls[globalImageIndex];
      if (imageUrl) {
        lot.image_urls = Array.isArray(lot.image_urls)
          ? lot.image_urls.filter((url: string) => url !== imageUrl)
          : lot.image_urls;
        lot.extra_image_urls = Array.isArray(lot.extra_image_urls)
          ? lot.extra_image_urls.filter((url: string) => url !== imageUrl)
          : lot.extra_image_urls;
        if (lot.image_url === imageUrl) delete lot.image_url;
      }
      newLots[lotIndex] = lot;
      const stillReferenced = newLots.some((candidate: any) => {
        const refs = [
          ...(Array.isArray(candidate?.image_indexes) ? candidate.image_indexes : []),
          ...(Array.isArray(candidate?.extra_image_indexes) ? candidate.extra_image_indexes : []),
          ...(typeof candidate?.image_index === "number" ? [candidate.image_index] : []),
        ];
        return refs.some((value) => Number(value) === globalImageIndex);
      });
      const deleted = Array.isArray(prev?.deleted_image_indexes)
        ? prev.deleted_image_indexes.map((value: any) => Number(value)).filter((value: number) => Number.isInteger(value))
        : [];
      const nextDeleted = stillReferenced || deleted.includes(globalImageIndex)
        ? deleted
        : [...deleted, globalImageIndex];
      return { ...prev, lots: newLots, deleted_image_indexes: nextDeleted };
    });
    setHasChanges(true);
  };

  const getLotUploadKey = (lot: any, index: number) =>
    String(lot?.lot_id || lot?.id || lot?.lot_number || index);

  const getLotPhotoEntries = (lot: any) => {
    const indexes = [
      ...(Array.isArray(lot?.image_indexes) ? lot.image_indexes : (typeof lot?.image_index === "number" ? [lot.image_index] : [])),
      ...(Array.isArray(lot?.extra_image_indexes) ? lot.extra_image_indexes : []),
    ]
      .map((value) => Number(value))
      .filter((value, index, arr) => Number.isInteger(value) && value >= 0 && arr.indexOf(value) === index);
    return indexes.flatMap((globalIndex) => {
      const url = imageUrls[globalIndex];
      return url ? [{ globalIndex, url }] : [];
    });
  };

  const handleUploadLotImages = async (lot: any, index: number, fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    const lotKey = getLotUploadKey(lot, index);
    setUploadingLotKey(lotKey);
    try {
      const uploadLotImages = uploadPreviewLotImagesOverride || uploadPreviewLotImages;
      const response = await uploadLotImages(reportId, lotKey, files, previewData);
      if (response.data?.preview_data) {
        setPreviewData(response.data.preview_data);
      }
      if (Array.isArray(response.data?.imageUrls)) {
        setImageUrls(response.data.imageUrls);
        setImageCount(response.data.imageUrls.length);
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

  const lotTextFieldMeta: Record<ExpandableLotTextField, { label: string; placeholder: string }> = {
    lot_number: {
      label: "Lot #",
      placeholder: "Lot number",
    },
    title: {
      label: "Title",
      placeholder: "Asset title",
    },
    categories: {
      label: "Category",
      placeholder: "Auctioneer Import category",
    },
    description: {
      label: "Description",
      placeholder: "Short description",
    },
    details: {
      label: "Specs",
      placeholder: "Specs / notes / attributes",
    },
    estimated_value: {
      label: "Estimated Value",
      placeholder: "e.g., $25,000",
    },
  };

  const openLotFieldEditor = (
    lotIndex: number,
    field: ExpandableLotTextField,
    variant: "mobile" | "desktop"
  ) => {
    setExpandedLotTextEditor({ lotIndex, field, variant });
  };

  const renderFieldEditorButton = (
    lotIndex: number,
    field: ExpandableLotTextField,
    variant: "mobile" | "desktop"
  ) => (
    <button
      type="button"
      onClick={() => openLotFieldEditor(lotIndex, field, variant)}
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-700"
      aria-label={`Open ${lotTextFieldMeta[field].label} editor`}
    >
      Edit
    </button>
  );

  const renderExpandableLotTextarea = (
    lot: any,
    idx: number,
    field: ExpandableLotTextField,
    variant: "mobile" | "desktop"
  ) => {
    const meta = lotTextFieldMeta[field];
    const isDesktop = variant === "desktop";

    return (
      <textarea
        {...getFocusTrackingProps(`lot-${idx}-${field}-${variant}`)}
        value={lot[field] || ""}
        readOnly
        onFocus={() => setExpandedLotTextEditor({ lotIndex: idx, field, variant })}
        onClick={() => setExpandedLotTextEditor({ lotIndex: idx, field, variant })}
        className={`w-full cursor-text border border-gray-300 bg-white px-3 py-2 text-sm leading-5 text-gray-900 transition-all placeholder:text-gray-400 hover:border-rose-300 focus:border-transparent focus:ring-2 focus:ring-rose-500 ${
          isDesktop
            ? "min-h-[104px] min-w-0 rounded-md resize-none"
            : "min-h-[120px] rounded-lg resize-y"
        }`}
        placeholder={meta.placeholder}
        rows={isDesktop ? 4 : 5}
        aria-label={`${meta.label} for lot ${getLotDisplayNumber(lot, idx)}`}
      />
    );
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
      return { ...prev, lots: newLots };
    });
    setHasChanges(true);
    toast.success(`Running Condition applied to all lots: ${value}`);
  };

  const deleteLot = (index: number) => {
    setPreviewData((prev: any) => {
      const lots = Array.isArray(prev?.lots) ? [...prev.lots] : [];
      lots.splice(index, 1);
      return { ...prev, lots };
    });
    setHasChanges(true);
  };

  const addLot = () => {
    setPreviewData((prev: any) => {
      const lots = Array.isArray(prev?.lots) ? [...prev.lots] : [];
      const usedNumbers = new Set(
        lots
          .map((lot: any) => Number.parseInt(String(lot?.lot_number || ""), 10))
          .filter((value: number) => Number.isFinite(value) && value > 0)
      );
      let nextLotNumber = lots.length + 1;
      while (usedNumbers.has(nextLotNumber)) nextLotNumber += 1;
      const previousLot = lots[lots.length - 1] || {};
      lots.push({
        lot_id: `lot-${Date.now()}`,
        lot_number: String(nextLotNumber),
        title: "",
        categories: "",
        description: "",
        details: "",
        estimated_value: "",
        image_indexes: [],
        image_urls: [],
        extra_image_indexes: [],
        extra_image_urls: [],
        mixed_group_index: Number(previousLot?.mixed_group_index) || 1,
        sub_mode: previousLot?.sub_mode || "single_lot",
        condition_report_specs: {},
        condition_report_selections: {
          condition: "N/A",
          completeness: "N/A",
          legal: "N/A",
        },
      });
      return { ...(prev || {}), lots };
    });
    setHasChanges(true);
    toast.success("New lot added. Fill in the details before resubmitting.");
  };

  const updateLotItem = (
    lotIndex: number,
    itemIndex: number,
    field: string,
    value: any
  ) => {
    setPreviewData((prev: any) => {
      const newLots = [...(prev.lots || [])];
      const lot = { ...(newLots[lotIndex] || {}) } as any;
      const items = Array.isArray(lot.items) ? [...lot.items] : [];
      items[itemIndex] = { ...(items[itemIndex] || {}), [field]: value };
      lot.items = items;
      newLots[lotIndex] = lot;
      return { ...prev, lots: newLots };
    });
    setHasChanges(true);
  };

  // Group lots by mixed_group_index and determine sub-mode label
  const lotsArray: any[] = Array.isArray(previewData?.lots) ? previewData.lots : [];
  const includeDamageAnalysis = previewData?.include_damage_analysis !== false;
  const groupMap = new Map<number, { idx: number; lot: any }[]>();
  for (let i = 0; i < lotsArray.length; i++) {
    const lot = lotsArray[i];
    const gi = Number(lot?.mixed_group_index) || 0;
    if (!groupMap.has(gi)) groupMap.set(gi, []);
    groupMap.get(gi)!.push({ idx: i, lot });
  }
  const groupIds = Array.from(groupMap.keys()).sort((a, b) => a - b);
  const labelForSubMode = (m?: string) => {
    const sm = String(m || "").trim();
    if (sm === "per_item") return "Per Item";
    if (sm === "per_photo") return "Per Photo";
    if (sm === "single_lot") return "Bundle";
    // fallback to groupingMode string
    const gm = String(groupingMode || previewData?.grouping_mode || "mixed");
    if (gm === "per_item") return "Per Item";
    if (gm === "per_photo") return "Per Photo";
    if (gm === "single_lot") return "Bundle";
    return "Assets";
  };
  const groupedLots = groupIds.map((gid) => {
    const items = groupMap.get(gid) || [];
    const first = items[0]?.lot || {};
    const inferredMode =
      first?.sub_mode ||
      ((first?.tags || []).find?.((t: string) => typeof t === "string" && t.startsWith("mode:"))?.split?.(":")?.[1] || undefined);
    return { gid, subMode: inferredMode, items };
  });

  const renderConditionSelections = (
    lot: any,
    idx: number,
    variant: "mobile" | "desktop"
  ) => {
    const selections = lot?.condition_report_selections || {};
    const compact = variant === "desktop";

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Required selections
          </p>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
            N/A allowed
          </span>
        </div>
        <div className={compact ? "space-y-2" : "space-y-3"}>
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
                          name={`lot-${idx}-${variant}-${group.key}`}
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
              Optional shortcut for large reports. Individual lots can still be changed after this.
            </p>
          </div>
          <span className="self-start rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
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
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  selected
                    ? "border-amber-500 bg-white text-amber-950 shadow-sm"
                    : "border-amber-200 bg-white/80 text-amber-900 hover:border-amber-400 hover:bg-white"
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

  const workflowLocked = filesGenerating || filesRegenerating;
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
      anchor.download = filename || `asset-cr-${reportId}.pdf`;
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
      anchor.download = filename || `asset-cr-${reportId}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 500);
      toast.success(`Download started: ${anchor.download}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.message || "Unable to download CR DOCX.");
    }
  };

  return (
    <BottomDrawer open={isOpen} onClose={onClose} title="Preview & Edit Report" fullscreen>
      {status === "declined" && declineReason && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Report Declined</p>
            <p className="text-sm text-red-700 mt-1">{declineReason}</p>
          </div>
        </div>
      )}

      {workflowLocked && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900">
              {filesRegenerating ? "Files are being regenerated" : "Already submitted for approval"}
            </p>
            <p className="text-sm text-blue-700 mt-1">
              {filesRegenerating
                ? "This report is already in the submitted queue while the new files are being regenerated."
                : "Your preview has already been submitted. It will appear in Submitted Previews while DOCX, Excel, and Images files are generated."}
            </p>
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
          <button
            type="button"
            onClick={() => void handleDownloadSpecPdf()}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
          >
            <Download className="h-4 w-4" />
            Download CR
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadCrDocx()}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            title={crDocxUrl ? "Download editable CR Word file" : "Generate and download editable CR Word file"}
          >
            <Download className="h-4 w-4" />
            CR DOCX
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-4 border-rose-600 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <>
          <datalist id="asset-auctioneer-categories">
            {categorySpecs.map((spec) => (
              <option key={spec.childCategory} value={spec.childCategory} />
            ))}
          </datalist>
          {/* Report Details */}
          <div className="space-y-6 max-w-none pb-28">
            {/* Basic Information Section */}
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-blue-600">👤</span>
                Basic Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Client Name *
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("client_name")}
                    value={previewData?.client_name || ""}
                    onChange={(e) => updateField("client_name", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., ABC Corporation"
                  />
                  {!previewData?.client_name && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ Required field</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Owner Name
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("owner_name")}
                    value={previewData?.owner_name || ""}
                    onChange={(e) => updateField("owner_name", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Contract Number
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("contract_no")}
                    value={previewData?.contract_no || ""}
                    onChange={(e) => updateField("contract_no", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., C-2024-001"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Bank
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateField("bank_photos_enabled", !previewData?.bank_photos_enabled)
                    }
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      previewData?.bank_photos_enabled
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                    aria-pressed={!!previewData?.bank_photos_enabled}
                  >
                    <span>Include all photos in CR</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs shadow-sm">
                      {previewData?.bank_photos_enabled ? "On" : "Off"}
                    </span>
                  </button>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Industry
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("industry")}
                    value={previewData?.industry || ""}
                    onChange={(e) => updateField("industry", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., Construction, Manufacturing"
                  />
                </div>
              </div>
            </div>

            {/* Dates & Financial Section */}
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-green-600">📅</span>
                Dates & Financial
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    {...getFocusTrackingProps("effective_date")}
                    value={previewData?.effective_date?.split("T")[0] || ""}
                    onChange={(e) => updateField("effective_date", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Inspection Date
                  </label>
                  <input
                    type="date"
                    {...getFocusTrackingProps("inspection_date")}
                    value={previewData?.inspection_date?.split("T")[0] || ""}
                    onChange={(e) => updateField("inspection_date", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Currency
                  </label>
                  <select
                    {...getFocusTrackingProps("currency")}
                    value={previewData?.currency || "CAD"}
                    onChange={(e) => handleCurrencyChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                  >
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="INR">INR - Indian Rupee</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Total Appraised Value
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("total_appraised_value")}
                    value={previewData?.total_appraised_value || previewData?.total_value || ""}
                    onChange={(e) => updateField("total_appraised_value", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., $100,000 or CAD 100,000"
                  />
                </div>
              </div>
            </div>

            {/* Appraisal Details Section */}
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-purple-600">📋</span>
                Appraisal Details
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Appraisal Purpose
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("appraisal_purpose")}
                    value={previewData?.appraisal_purpose || ""}
                    onChange={(e) => updateField("appraisal_purpose", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., Insurance, Sale, Financing, Internal Review"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      Appraiser Name
                    </label>
                    <input
                      type="text"
                      {...getFocusTrackingProps("appraiser")}
                      value={previewData?.appraiser || ""}
                      onChange={(e) => updateField("appraiser", e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                      placeholder="e.g., John Appraiser, CPA"
                    />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                      Appraisal Company
                    </label>
                    <input
                      type="text"
                      {...getFocusTrackingProps("appraisal_company")}
                      value={previewData?.appraisal_company || ""}
                      onChange={(e) => updateField("appraisal_company", e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                      placeholder="e.g., Asset Insight Appraisals"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <AppraiserSignaturePad
                      value={previewData?.appraiser_signature_data_url || ""}
                      disabled={workflowLocked}
                      onChange={updateAppraiserSignature}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Additional Report Details */}
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-4 shadow-[var(--app-shadow-card)] backdrop-blur sm:p-6">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-amber-600">📝</span>
                Additional Details
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Prepared For
                  </label>
                  <input
                    type="text"
                    {...getFocusTrackingProps("prepared_for")}
                    value={previewData?.prepared_for || ""}
                    onChange={(e) => updateField("prepared_for", e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="e.g., Client Contact / Company"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Factors Affecting Value - Age & Condition
                  </label>
                  <textarea
                    {...getFocusTrackingProps("factors_age_condition")}
                    value={previewData?.factors_age_condition || ""}
                    onChange={(e) => updateField("factors_age_condition", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="Describe age and condition..."
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Factors Affecting Value - Quality
                  </label>
                  <textarea
                    {...getFocusTrackingProps("factors_quality")}
                    value={previewData?.factors_quality || ""}
                    onChange={(e) => updateField("factors_quality", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="Describe quality..."
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5">
                    Factors Affecting Value - Analysis
                  </label>
                  <textarea
                    {...getFocusTrackingProps("factors_analysis")}
                    value={previewData?.factors_analysis || ""}
                    onChange={(e) => updateField("factors_analysis", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                    placeholder="Provide overall analysis..."
                  />
                </div>
              </div>
            </div>

            {/* Software narrative fields removed to match DOCX inputs */}

            {/* Quick Stats */}
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-gray-900 mb-3">📊 Report Statistics</h4>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{previewData?.lots?.length || 0}</div>
                  <div className="text-xs text-gray-600">Total Lots</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{previewData?.currency || "CAD"}</div>
                  <div className="text-xs text-gray-600">Currency</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{previewData?.language?.toUpperCase() || "EN"}</div>
                  <div className="text-xs text-gray-600">Language</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-600">{previewData?.total_appraised_value ? "✓" : "-"}</div>
                  <div className="text-xs text-gray-600">Value Set</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-blue-700">{(groupingMode || previewData?.grouping_mode || "mixed").toString()}</div>
                  <div className="text-xs text-gray-600">Grouping</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-600">{imageCount ?? "-"}</div>
                  <div className="text-xs text-gray-600">Images</div>
                </div>
              </div>
            </div>

            {renderBulkRunningConditionControl()}

          </div>

          {/* Lot-Specific Photo Gallery Modal */}
          {galleryLotImages !== null && (
            <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setGalleryLotImages(null)}>
              {/* Header */}
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

              {/* Main Image */}
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

              {/* Thumbnail Strip */}
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

          {/* Assets/Lots */}
          <div className="mt-6 space-y-4 max-w-none">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base sm:text-lg font-bold text-gray-900">Assets / Lots</h3>
              <button
                type="button"
                onClick={addLot}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
              >
                Add Lot
              </button>
            </div>
            {groupedLots.length ? (
              <>
                {/* Mobile: card list grouped by sub-mode */}
                <div className="md:hidden space-y-5">
                  {groupedLots.map((group) => (
                    <div key={group.gid}>
                      <div className="mb-2 text-sm font-semibold text-gray-900">
                        Group {group.gid || 1} — {labelForSubMode(group.subMode)} ({group.items.length})
                      </div>
                      <div className="space-y-3">
                        {group.items.map(({ lot, idx }) => (
                          <div key={idx} className="rounded-[1.25rem] border border-[var(--app-border)] bg-[var(--app-panel-soft)] p-3 shadow-[var(--app-shadow-card)]">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-semibold text-gray-900">Lot {getLotDisplayNumber(lot, idx)}</div>
                              <button
                                onClick={() => deleteLot(idx)}
                                aria-label={`Delete lot ${idx + 1}`}
                                className="px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-xs"
                              >
                                Delete
                              </button>
                            </div>
                            {/* Lot Images */}
                            {(() => {
                              const lotImages = getLotPhotoEntries(lot);
                              const lotUploadKey = getLotUploadKey(lot, idx);
                              const uploadInputId = `asset-preview-upload-${idx}-mobile`;
                              const openLotGallery = (startIdx: number) => {
                                setGalleryLotImages({ urls: lotImages.map((entry) => entry.url), currentIdx: startIdx });
                              };
                              return (
                                <div className="mb-3">
                                  <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 text-xs text-gray-600">
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
                                      className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                                    >
                                      <Upload className="h-3 w-3" />
                                      {uploadingLotKey === lotUploadKey ? "Uploading" : "Upload images"}
                                    </button>
                                  </div>
                                  {lotImages.length > 0 && (
                                  <div className="relative">
                                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                                      {lotImages.slice(0, 20).map(({ url, globalIndex }, imgIdx) => (
                                        <div
                                          key={imgIdx}
                                          className="group relative flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all"
                                          onClick={() => openLotGallery(imgIdx)}
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={url} alt={`Photo ${imgIdx + 1}`} className="w-full h-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              deleteLotImage(idx, globalIndex);
                                            }}
                                            className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-xs font-black text-white opacity-95 shadow"
                                            aria-label={`Remove photo ${imgIdx + 1}`}
                                          >
                                            x
                                          </button>
                                        </div>
                                      ))}
                                      {lotImages.length > 20 && (
                                        <div
                                          className="flex-shrink-0 w-20 h-20 rounded-lg bg-gray-100 border-2 border-gray-300 cursor-pointer hover:bg-gray-200 transition-all flex items-center justify-center"
                                          onClick={() => openLotGallery(20)}
                                        >
                                          <span className="text-sm font-semibold text-gray-600">+{lotImages.length - 20}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="space-y-2">
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <label className="block text-xs text-gray-600">Lot #</label>
                                  {renderFieldEditorButton(idx, "lot_number", "mobile")}
                                </div>
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-lot-number-mobile`)}
                                  value={String(lot.lot_number ?? getLotDisplayNumber(lot, idx))}
                                  onChange={(e) => updateLot(idx, "lot_number", e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder={String(idx + 1)}
                                />
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <label className="block text-xs text-gray-600">Title</label>
                                  {renderFieldEditorButton(idx, "title", "mobile")}
                                </div>
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-title-mobile`)}
                                  value={lot.title || ""}
                                  onChange={(e) => updateLot(idx, "title", e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Title"
                                />
                              </div>
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <label className="block text-xs text-gray-600">Category</label>
                                  {renderFieldEditorButton(idx, "categories", "mobile")}
                                </div>
                                <input
                                  type="text"
                                  list="asset-auctioneer-categories"
                                  {...getFocusTrackingProps(`lot-${idx}-category-mobile`)}
                                  value={lot.categories || ""}
                                  onChange={(e) => updateLot(idx, "categories", e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Auctioneer Import category"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Description</label>
                                {renderExpandableLotTextarea(lot, idx, "description", "mobile")}
                              </div>
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">Specs</label>
                                {renderExpandableLotTextarea(lot, idx, "details", "mobile")}
                              </div>
                              {renderConditionSelections(lot, idx, "mobile")}
                              <AuctioneerSpecsEditor
                                lot={lot}
                                lotIndex={idx}
                                specsByCategory={specsByCategory}
                                onChange={updateLotSpec}
                                onAdd={addLotSpec}
                                onDelete={deleteLotSpec}
                                includeDamageAnalysis={includeDamageAnalysis}
                                damageAnalysis={lot.damage_analysis}
                                onDamageAnalysisChange={(lotIndex, value) =>
                                  updateLot(lotIndex, "damage_analysis", value)
                                }
                                accent="rose"
                              />
                              <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <label className="block text-xs text-gray-600">Value</label>
                                  {renderFieldEditorButton(idx, "estimated_value", "mobile")}
                                </div>
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-estimated_value-mobile`)}
                                  value={lot.estimated_value || ""}
                                  onChange={(e) => updateLot(idx, "estimated_value", e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="e.g., $25,000"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: table per group */}
                <div className="hidden md:block space-y-6">
                  {groupedLots.map((group) => (
                    <div key={group.gid} className="overflow-hidden">
                      <div className="mb-2 text-sm font-semibold text-gray-900">
                        Group {group.gid || 1} — {labelForSubMode(group.subMode)} ({group.items.length})
                      </div>
                      <table className="w-full table-fixed text-sm border border-gray-200 rounded-lg overflow-hidden">
                        <thead className="bg-gray-50 text-gray-700">
                          <tr>
                            <th className="w-[7%] px-2 py-2 text-left">Lot #</th>
                            <th className="w-[13%] px-2 py-2 text-left">Photos</th>
                            <th className="w-[12%] px-2 py-2 text-left">Title</th>
                            <th className="w-[13%] px-2 py-2 text-left">Category</th>
                            <th className="w-[16%] px-2 py-2 text-left">Description</th>
                            <th className="w-[15%] px-2 py-2 text-left">Specs</th>
                            <th className="w-[13%] px-2 py-2 text-left">Selections</th>
                            <th className="w-[7%] px-2 py-2 text-left">Value</th>
                            <th className="w-[4%] px-2 py-2 text-left">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.map(({ lot, idx }, i) => {
                            const lotImages = getLotPhotoEntries(lot);
                            const lotUploadKey = getLotUploadKey(lot, idx);
                            const uploadInputId = `asset-preview-upload-${idx}-desktop`;
                            const openLotGallery = (startIdx: number) => {
                              setGalleryLotImages({ urls: lotImages.map((entry) => entry.url), currentIdx: startIdx });
                            };
                            return (
                            <React.Fragment key={idx}>
                            <tr className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="px-2 py-2 text-gray-800 font-medium align-top">
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-lot-number-desktop`)}
                                  value={String(lot.lot_number ?? getLotDisplayNumber(lot, idx))}
                                  onChange={(e) => updateLot(idx, "lot_number", e.target.value)}
                                  className="w-full min-w-0 px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm font-semibold"
                                  placeholder={String(idx + 1)}
                                />
                                <div className="mt-1">{renderFieldEditorButton(idx, "lot_number", "desktop")}</div>
                              </td>
                              <td className="px-2 py-2 align-top">
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
                                {lotImages.length > 0 ? (
                                  <div className="space-y-1">
                                    <div className="flex gap-1.5 flex-wrap">
                                      {lotImages.slice(0, 6).map(({ url, globalIndex }, imgI) => (
                                        <div
                                          key={imgI}
                                          className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-gray-200 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex-shrink-0"
                                          onClick={() => openLotGallery(imgI)}
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img src={url} alt={`Photo ${imgI + 1}`} className="w-full h-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              deleteLotImage(idx, globalIndex);
                                            }}
                                            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-[10px] font-black text-white shadow"
                                            aria-label={`Remove photo ${imgI + 1}`}
                                          >
                                            x
                                          </button>
                                        </div>
                                      ))}
                                      {lotImages.length > 6 && (
                                        <div
                                          className="w-14 h-14 rounded-lg bg-gray-100 border-2 border-gray-300 cursor-pointer hover:bg-gray-200 transition-all flex items-center justify-center"
                                          onClick={() => openLotGallery(6)}
                                        >
                                          <span className="text-xs font-bold text-gray-600">+{lotImages.length - 6}</span>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[10px] text-gray-500">{lotImages.length} photo{lotImages.length !== 1 ? 's' : ''}</span>
                                      <button
                                        type="button"
                                        disabled={uploadingLotKey === lotUploadKey}
                                        onClick={() => document.getElementById(uploadInputId)?.click()}
                                        className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-white px-2 py-1 text-[10px] font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                                      >
                                        <Upload className="h-3 w-3" />
                                        {uploadingLotKey === lotUploadKey ? "Uploading" : "Upload"}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={uploadingLotKey === lotUploadKey}
                                    onClick={() => document.getElementById(uploadInputId)?.click()}
                                    className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                                  >
                                    <Upload className="h-3.5 w-3.5" />
                                    {uploadingLotKey === lotUploadKey ? "Uploading" : "Upload images"}
                                  </button>
                                )}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-title-desktop`)}
                                  value={lot.title || ""}
                                  onChange={(e) => updateLot(idx, "title", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Title"
                                />
                                <div className="mt-1">{renderFieldEditorButton(idx, "title", "desktop")}</div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="text"
                                  list="asset-auctioneer-categories"
                                  {...getFocusTrackingProps(`lot-${idx}-category-desktop`)}
                                  value={lot.categories || ""}
                                  onChange={(e) => updateLot(idx, "categories", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Category"
                                />
                                <div className="mt-1">{renderFieldEditorButton(idx, "categories", "desktop")}</div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                {renderExpandableLotTextarea(lot, idx, "description", "desktop")}
                              </td>
                              <td className="px-2 py-2 align-top">
                                {renderExpandableLotTextarea(lot, idx, "details", "desktop")}
                              </td>
                              <td className="px-2 py-2 align-top">
                                {renderConditionSelections(lot, idx, "desktop")}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`lot-${idx}-estimated_value-desktop`)}
                                  value={lot.estimated_value || ""}
                                  onChange={(e) => updateLot(idx, "estimated_value", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="e.g., $25,000"
                                />
                                <div className="mt-1">{renderFieldEditorButton(idx, "estimated_value", "desktop")}</div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <button
                                  onClick={() => deleteLot(idx)}
                                  aria-label={`Delete lot ${idx + 1}`}
                                  className="px-2.5 py-1.5 rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 text-xs"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                            <tr className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td colSpan={9} className="px-3 pb-4">
                                <AuctioneerSpecsEditor
                                  lot={lot}
                                  lotIndex={idx}
                                  specsByCategory={specsByCategory}
                                  onChange={updateLotSpec}
                                  onAdd={addLotSpec}
                                  onDelete={deleteLotSpec}
                                  includeDamageAnalysis={includeDamageAnalysis}
                                  damageAnalysis={lot.damage_analysis}
                                  onDamageAnalysisChange={(lotIndex, value) =>
                                    updateLot(lotIndex, "damage_analysis", value)
                                  }
                                  accent="rose"
                                />
                              </td>
                            </tr>
                            </React.Fragment>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                <div className="text-6xl mb-4">📦</div>
                <p className="text-gray-600 font-medium">No lots data available</p>
                <p className="text-sm text-gray-500 mt-1">Software analysis didn't extract any lot information</p>
              </div>
            )}
          </div>

          {/* Valuation */}
          <div className="mt-6 space-y-4 max-w-none">
            <h3 className="text-base sm:text-lg font-bold text-gray-900">Valuation</h3>
            <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50">
              <input
                id="include-valuation"
                type="checkbox"
                checked={!!previewData?.include_valuation_table}
                onChange={(e) => updateField("include_valuation_table", e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="include-valuation" className="text-sm text-gray-800">Include Valuation Comparison Table</label>
            </div>
            {previewData?.include_valuation_table ? (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">
                    Valuation Methods Selected
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {previewData?.valuation_methods?.map((method: string) => (
                      <span
                        key={method}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                      >
                        {method}
                      </span>
                    ))}
                  </div>
                </div>
                {previewData?.valuation_data && (
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-2">
                      Base Fair Market Value
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{previewData?.currency || "CAD"}</span>
                      <input
                        type="number"
                        min={0}
                        {...getFocusTrackingProps("valuation-baseFMV")}
                        value={Number(previewData.valuation_data.baseFMV || 0)}
                        onChange={(e) => updateValuationBase(Number(e.target.value))}
                        className="w-56 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all tabular-nums"
                      />
                    </div>
                  </div>
                )}
                {Array.isArray(previewData?.valuation_data?.methods) && previewData.valuation_data.methods.length > 0 && (
                  <div className="p-4 border border-gray-200 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3">Comparison Table</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-fixed text-sm border border-gray-200 rounded-md overflow-hidden">
                        <thead className="bg-gray-50 text-gray-700">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium w-[26%]">Method</th>
                            <th className="px-3 py-2 text-left font-medium w-[16%]">Value</th>
                            <th className="px-3 py-2 text-left font-medium w-[24%]">Conditions</th>
                            <th className="px-3 py-2 text-left font-medium w-[18%]">Timeline</th>
                            <th className="px-3 py-2 text-left font-medium w-[16%]">Use Case</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.valuation_data.methods.map((m: any, i: number) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="px-3 py-2 align-top">
                                <div className="mb-1">
                                  <input
                                    type="text"
                                    {...getFocusTrackingProps(`valuation-${i}-fullName`)}
                                    value={m.fullName || ""}
                                    onChange={(e) => updateValuationMethod(i, "fullName", e.target.value)}
                                    className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                    placeholder="Full method name"
                                  />
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="inline-flex items-center rounded-md bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold">{m.method || "—"}</span>
                                  <span className="text-[11px] text-gray-500">Code</span>
                                </div>
                                <textarea
                                  {...getFocusTrackingProps(`valuation-${i}-description`)}
                                  value={m.description || ""}
                                  onChange={(e) => updateValuationMethod(i, "description", e.target.value)}
                                  className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-xs leading-5 resize-none min-h-[56px]"
                                  placeholder="Short description"
                                  rows={2}
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-600">{previewData?.currency || 'CAD'}</span>
                                  <input
                                    type="number"
                                    min={0}
                                    {...getFocusTrackingProps(`valuation-${i}-value`)}
                                    value={Number(m.value || 0)}
                                    onChange={(e) => updateValuationMethod(i, "value", Number(e.target.value))}
                                    className="w-44 px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm tabular-nums"
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <textarea
                                  {...getFocusTrackingProps(`valuation-${i}-saleConditions`)}
                                  value={m.saleConditions || ""}
                                  onChange={(e) => updateValuationMethod(i, "saleConditions", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-xs leading-5 resize-none min-h-[56px]"
                                  placeholder="Conditions"
                                  rows={2}
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`valuation-${i}-timeline`)}
                                  value={m.timeline || ""}
                                  onChange={(e) => updateValuationMethod(i, "timeline", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Timeline"
                                />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <input
                                  type="text"
                                  {...getFocusTrackingProps(`valuation-${i}-useCase`)}
                                  value={m.useCase || ""}
                                  onChange={(e) => updateValuationMethod(i, "useCase", e.target.value)}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm"
                                  placeholder="Use Case"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                No valuation data selected for this report
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="mt-6 space-y-6 max-w-none">
            <div className="rounded-xl border border-[var(--app-border)] bg-[linear-gradient(135deg,rgba(225,29,72,0.10),rgba(37,99,235,0.06))] p-6 shadow-[var(--app-shadow-card)]">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Report Summary
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Client</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.client_name || "Not specified"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Owner</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.owner_name || "Not specified"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Effective Date</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.effective_date?.split("T")[0] || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Inspection Date</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.inspection_date?.split("T")[0] || "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Industry</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.industry || "Not specified"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Lots</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.lots?.length || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Currency</p>
                  <p className="font-semibold text-gray-900">
                    {previewData?.currency || "CAD"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-[var(--app-border)] bg-[rgba(148,163,184,0.08)] p-4">
              <h4 className="font-semibold text-gray-900 mb-2">Next Steps</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                <li>Review the data</li>
                <li>Make any necessary edits</li>
                <li>Save your changes</li>
                <li>Submit for admin approval</li>
              </ol>
            </div>
          </div>

          {expandedLotTextEditor && (() => {
            const { lotIndex, field } = expandedLotTextEditor;
            const lot = previewData?.lots?.[lotIndex];
            if (!lot) return null;

            const meta = lotTextFieldMeta[field];
            const lotNumber = getLotDisplayNumber(lot, lotIndex);

            return (
              <div
                className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/45 px-3 py-6 backdrop-blur-sm sm:px-6"
                onMouseDown={closeExpandedLotTextEditor}
              >
                <div
                  className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Lot {lotNumber}
                      </p>
                      <h4 className="mt-0.5 text-lg font-bold text-gray-950">
                        {meta.label}
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={closeExpandedLotTextEditor}
                      aria-label="Close editor"
                      className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-4 sm:p-5">
                    <textarea
                      {...getFocusTrackingProps(`expanded-lot-${lotIndex}-${field}`)}
                      autoFocus
                      value={lot[field] || ""}
                      onChange={(event) => updateLot(lotIndex, field, event.target.value)}
                      className="h-[52vh] min-h-[280px] w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-3 text-base leading-7 text-gray-950 shadow-inner outline-none transition-all placeholder:text-gray-400 focus:border-transparent focus:ring-2 focus:ring-rose-500"
                      placeholder={meta.placeholder}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Actions */}
          <div className="sticky bottom-0 z-10 mt-6 flex flex-col gap-3 border-t border-[var(--app-border)] bg-[var(--app-panel)] px-1 pt-4 pb-1 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={onClose}
              className="order-2 sm:order-1 px-4 py-2.5 text-gray-700 hover:text-gray-900 font-medium transition-colors hover:bg-white rounded-lg"
            >
              Cancel
            </button>
            <div className="order-1 sm:order-2 flex flex-col sm:flex-row gap-2 sm:gap-3">
              {hasChanges && (
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Unsaved changes
                </div>
              )}
              <button
                onClick={handleSaveChanges}
                disabled={!hasChanges || saving || workflowLocked}
                aria-label="Save changes"
                className="flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-md hover:shadow-lg text-sm sm:text-base"
              >
                <Save className="h-4 w-4" />
                <span className="hidden sm:inline">{saving ? "Saving..." : "Save Changes"}</span>
                <span className="sm:hidden">{saving ? "Save..." : "Save"}</span>
              </button>
              <button
                onClick={handleSubmitForApproval}
                disabled={(!isResubmitMode && hasChanges) || submitting || loading || workflowLocked}
                aria-label={
                  isAssignedApprovalMode
                    ? "Submit and approve after regeneration"
                    : isResubmitMode
                      ? "Resubmit report"
                      : "Submit for approval"
                }
                className={`flex items-center justify-center gap-2 px-4 sm:px-5 py-2.5 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg transition-all hover:shadow-xl text-sm sm:text-base ${
                  isResubmitMode 
                    ? "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 shadow-indigo-500/30"
                    : "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-rose-500/30"
                }`}
              >
                {isResubmitMode ? <RefreshCw className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                <span className="hidden sm:inline">
                  {submitting 
                    ? (isAssignedApprovalMode ? "Submitting..." : isResubmitMode ? "Resubmitting..." : "Submitting...") 
                    : workflowLocked
                    ? (filesRegenerating ? "Regenerating Files..." : "Already Submitted")
                    : isAssignedApprovalMode
                      ? "Submit & Approve"
                      : (isResubmitMode ? "Save & Resubmit" : "Submit for Approval")}
                </span>
                <span className="sm:hidden">
                  {submitting 
                    ? (isAssignedApprovalMode ? "Submit..." : isResubmitMode ? "Resubmit..." : "Submit...") 
                    : workflowLocked
                    ? (filesRegenerating ? "Generating..." : "Submitted")
                    : isAssignedApprovalMode
                      ? "Approve"
                      : (isResubmitMode ? "Resubmit" : "Submit")}
                </span>
              </button>
            </div>
          </div>
        </>
      )}
    </BottomDrawer>
  );
}
