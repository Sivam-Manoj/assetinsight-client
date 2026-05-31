"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { toast } from "react-toastify";
import { Check, RotateCcw, Save, X } from "lucide-react";
import API from "@/lib/api";

const MixedSection = dynamic(() => import("./mixed/MixedSection"), {
  ssr: false,
});

type MixedLot = {
  id: string;
  files: File[];
  extraFiles: File[];
  videoFiles?: File[];
  coverIndex: number;
  mode?: "single_lot" | "per_item" | "per_photo";
};

type ValuationMethod = "FML" | "TKV" | "OLV" | "FLV";
const LOT_LISTING_VALUATION_METHODS: ValuationMethod[] = ["FML"];

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
};

const isoDate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// Auto-save draft storage keys
const DRAFT_KEY = "cv_lotlisting_draft";
const DRAFT_IMAGES_KEY = "cv_lotlisting_draft_images";

// Type for localStorage image data (base64)
type LocalDraftImage = {
  lotId: string;
  type: "main" | "extra";
  index: number;
  dataUrl: string;
  name: string;
  mimeType: string;
};

export default function LotListingForm({ onSuccess, onCancel }: Props) {
  const [mixedLots, setMixedLots] = useState<MixedLot[]>([]);
  const [contractNo, setContractNo] = useState("");
  const [salesDate, setSalesDate] = useState(isoDate(new Date()));
  const [location, setLocation] = useState("");
  const [language, setLanguage] = useState<"en" | "fr" | "es">("en");
  const [currency, setCurrency] = useState("CAD");
  const [currencyTouched, setCurrencyTouched] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Progress UI state
  const PROG_WEIGHTS = {
    client_upload: 0.25,
    r2_upload: 0.15,
    ai_analysis: 0.35,
    generate_files: 0.2,
    finalize: 0.05,
  } as const;
  const STEPS = [
    { key: "client_upload", label: "Uploading images" },
    { key: "r2_upload", label: "Storing images" },
    { key: "ai_analysis", label: "Analyzing images" },
    { key: "generate_files", label: "Generating files" },
    { key: "finalize", label: "Finalizing" },
  ] as const;
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressPhase, setProgressPhase] = useState<
    "idle" | "upload" | "processing" | "done" | "error"
  >("idle");
  const [stepStates, setStepStates] = useState<
    Record<string, "pending" | "active" | "done">
  >(() => Object.fromEntries(STEPS.map((s) => [s.key, "pending"])));
  const pollIntervalRef = useRef<any>(null);
  const jobIdRef = useRef<string | null>(null);

  const [uploadStats, setUploadStats] = useState<{
    totalFiles: number;
    totalSize: number;
    uploadedBytes: number;
    startTime: number;
  } | null>(null);

  // Draft auto-save state
  const [hasDraft, setHasDraft] = useState(false);
  const autoSaveTimeoutRef = useRef<any>(null);

  // Convert File to base64 data URL for localStorage
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Convert base64 data URL back to File
  const dataUrlToFile = async (dataUrl: string, name: string, mimeType: string): Promise<File> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], name, { type: mimeType || blob.type });
  };

  // Auto-save draft to localStorage
  const autoSaveDraft = useCallback(async () => {
    if (submitting || mixedLots.length === 0) return;

    try {
      // Save form data
      const formData = {
        contractNo,
        salesDate,
        location,
        language,
        currency,
        selectedValuationMethods: LOT_LISTING_VALUATION_METHODS,
        lots: mixedLots.map((lot) => ({
          id: lot.id,
          coverIndex: lot.coverIndex,
          mode: lot.mode,
          fileCount: lot.files.length,
          extraFileCount: lot.extraFiles.length,
        })),
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));

      // Convert images to base64 for localStorage
      const localImages: LocalDraftImage[] = [];
      for (const lot of mixedLots) {
        for (let i = 0; i < lot.files.length; i++) {
          const file = lot.files[i];
          try {
            const dataUrl = await fileToDataUrl(file);
            localImages.push({
              lotId: lot.id,
              type: "main",
              index: i,
              dataUrl,
              name: file.name,
              mimeType: file.type,
            });
          } catch (e) {
            console.warn("Failed to convert file to base64:", file.name);
          }
        }
        for (let i = 0; i < lot.extraFiles.length; i++) {
          const file = lot.extraFiles[i];
          try {
            const dataUrl = await fileToDataUrl(file);
            localImages.push({
              lotId: lot.id,
              type: "extra",
              index: i,
              dataUrl,
              name: file.name,
              mimeType: file.type,
            });
          } catch (e) {
            console.warn("Failed to convert extra file to base64:", file.name);
          }
        }
      }
      localStorage.setItem(DRAFT_IMAGES_KEY, JSON.stringify(localImages));
      setHasDraft(true);
      console.log(`[LotListing Draft] Saved ${localImages.length} images`);
    } catch (e) {
      console.warn("[LotListing Draft] Save failed:", e);
    }
  }, [submitting, mixedLots, contractNo, salesDate, location, language, currency]);

  // Restore draft from localStorage
  const restoreDraft = useCallback(async () => {
    try {
      const savedData = localStorage.getItem(DRAFT_KEY);
      const savedImages = localStorage.getItem(DRAFT_IMAGES_KEY);

      if (!savedData || !savedImages) return false;

      const formData = JSON.parse(savedData);
      const images: LocalDraftImage[] = JSON.parse(savedImages);

      if (images.length === 0) return false;

      // Restore form fields
      if (formData.contractNo) setContractNo(formData.contractNo);
      if (formData.salesDate) setSalesDate(formData.salesDate);
      if (formData.location) setLocation(formData.location);
      if (formData.language) setLanguage(formData.language);
      if (formData.currency) setCurrency(formData.currency);

      // Reconstruct lots with files
      const restoredLots: MixedLot[] = [];
      for (const lotData of formData.lots || []) {
        const mainFiles: File[] = [];
        const extraFiles: File[] = [];

        // Restore main files
        const mainImages = images.filter((img) => img.lotId === lotData.id && img.type === "main");
        for (const img of mainImages.sort((a, b) => a.index - b.index)) {
          try {
            const file = await dataUrlToFile(img.dataUrl, img.name, img.mimeType);
            mainFiles.push(file);
          } catch (e) {
            console.warn("Failed to restore image:", img.name);
          }
        }

        // Restore extra files
        const extraImages = images.filter((img) => img.lotId === lotData.id && img.type === "extra");
        for (const img of extraImages.sort((a, b) => a.index - b.index)) {
          try {
            const file = await dataUrlToFile(img.dataUrl, img.name, img.mimeType);
            extraFiles.push(file);
          } catch (e) {
            console.warn("Failed to restore extra image:", img.name);
          }
        }

        if (mainFiles.length > 0 || extraFiles.length > 0) {
          restoredLots.push({
            id: lotData.id,
            files: mainFiles,
            extraFiles,
            coverIndex: lotData.coverIndex || 0,
            mode: lotData.mode,
          });
        }
      }

      if (restoredLots.length > 0) {
        setMixedLots(restoredLots);
        setHasDraft(true);
        return true;
      }
      return false;
    } catch (e) {
      console.error("[LotListing Draft] Restore failed:", e);
      return false;
    }
  }, []);

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_IMAGES_KEY);
      setHasDraft(false);
      console.log("[LotListing Draft] Cleared");
    } catch (e) {
      console.warn("[LotListing Draft] Clear failed:", e);
    }
  }, []);

  // Check for existing draft on mount
  useEffect(() => {
    const checkDraft = async () => {
      try {
        const localData = localStorage.getItem(DRAFT_KEY);
        const localImages = localStorage.getItem(DRAFT_IMAGES_KEY);
        if (localData && localImages) {
          const images = JSON.parse(localImages);
          if (images.length > 0) {
            setHasDraft(true);
          }
        }
      } catch (e) {
        console.warn("[LotListing Draft] Check failed:", e);
      }
    };
    checkDraft();
  }, []);

  // Auto-save when lots or form data changes (debounced)
  useEffect(() => {
    if (mixedLots.length === 0) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveDraft();
    }, 2000);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [mixedLots, contractNo, salesDate, location, language, currency, autoSaveDraft]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getTimeRemaining = (): string => {
    if (!uploadStats || uploadStats.uploadedBytes === 0) return "Calculating...";
    const elapsed = (Date.now() - uploadStats.startTime) / 1000;
    const speed = uploadStats.uploadedBytes / elapsed;
    const remaining = uploadStats.totalSize - uploadStats.uploadedBytes;
    const secondsLeft = Math.ceil(remaining / speed);
    if (secondsLeft < 60) return `~${secondsLeft}s remaining`;
    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `~${minutes}m ${secs}s remaining`;
  };

  useEffect(() => {
    if (progressPhase === "idle") return;
    setStepStates((prev) => {
      const next = { ...prev } as Record<string, "pending" | "active" | "done">;
      for (const s of STEPS) next[s.key] = "pending";
      const p = progressPercent;
      if (p < 25) {
        next.client_upload = "active";
      } else if (p < 40) {
        next.client_upload = "done";
        next.r2_upload = "active";
      } else if (p < 75) {
        next.client_upload = "done";
        next.r2_upload = "done";
        next.ai_analysis = "active";
      } else if (p < 95) {
        next.client_upload = "done";
        next.r2_upload = "done";
        next.ai_analysis = "done";
        next.generate_files = "active";
      } else if (p < 100) {
        next.client_upload = "done";
        next.r2_upload = "done";
        next.ai_analysis = "done";
        next.generate_files = "done";
        next.finalize = "active";
      } else {
        for (const s of STEPS) next[s.key] = "done";
      }
      return next;
    });
  }, [progressPercent, progressPhase]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const clearError = (k: string) =>
    setErrors((prev) => {
      const { [k]: _, ...rest } = prev;
      return rest;
    });

  function validateForm(): boolean {
    const e: Record<string, string> = {};
    if (!contractNo.trim()) e.contractNo = "Required";
    if (!salesDate) e.salesDate = "Required";
    if (!currency || !/^[A-Z]{3}$/.test(currency))
      e.currency = "Use 3-letter code (e.g., CAD)";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error("Please fix required fields");
      return false;
    }
    return true;
  }

  function clearForm(showToast = true) {
    setMixedLots([]);
    setContractNo("");
    setSalesDate(isoDate(new Date()));
    setLocation("");
    setLanguage("en");
    setCurrency("CAD");
    setCurrencyTouched(false);
    setError(null);
    setProgressPhase("idle");
    setProgressPercent(0);
    setStepStates(() => Object.fromEntries(STEPS.map((s) => [s.key, "pending"])) as any);
    setUploadStats(null);
    jobIdRef.current = null;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    clearDraft();
    if (showToast) toast.info("Form cleared.");
  }

  // Handle restore draft button click
  const handleRestoreDraft = async () => {
    const restored = await restoreDraft();
    if (restored) {
      const savedData = localStorage.getItem(DRAFT_KEY);
      const savedImages = localStorage.getItem(DRAFT_IMAGES_KEY);
      const imageCount = savedImages ? JSON.parse(savedImages).length : 0;
      toast.success(`Draft restored: ${imageCount} images`);
    } else {
      toast.error("Failed to restore draft");
    }
  };

  const handleSaveDraft = async () => {
    const hasImages = mixedLots.some(
      (lot) => lot.files.length > 0 || lot.extraFiles.length > 0
    );
    if (!hasImages) {
      toast.info("Add at least one lot image before saving a draft.");
      return;
    }
    await autoSaveDraft();
    toast.success("Draft saved");
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      setError("Please fix required fields.");
      return;
    }

    const total = mixedLots.reduce((s, l) => s + l.files.length, 0);
    if (total === 0) {
      const msg = "Please add at least one image.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const perLotOk = mixedLots.every((l) => l.files.length > 0 && !!l.mode);
    if (!perLotOk) {
      const msg = "Each lot must have at least 1 image and a selected mode.";
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setProgressPhase("upload");
      setProgressPercent(0);
      setStepStates(() => ({
        client_upload: "active",
        r2_upload: "pending",
        ai_analysis: "pending",
        generate_files: "pending",
        finalize: "pending",
      }));

      const filesToSend = mixedLots.flatMap((l) => [...l.files, ...(l.extraFiles || [])]);
      const totalSize = filesToSend.reduce((s, f) => s + f.size, 0);
      setUploadStats({
        totalFiles: filesToSend.length,
        totalSize,
        uploadedBytes: 0,
        startTime: Date.now(),
      });

      const jobId =
        typeof crypto !== "undefined" && (crypto as any)?.randomUUID
          ? (crypto as any).randomUUID()
          : `ll-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      jobIdRef.current = jobId;

      const formData = new FormData();
      filesToSend.forEach((file) => {
        formData.append("images", file);
      });

      const details = {
        contract_no: contractNo.trim(),
        sales_date: salesDate,
        location: location.trim(),
        language,
        currency,
        valuation_methods: LOT_LISTING_VALUATION_METHODS,
        include_damage_analysis: true,
        progress_id: jobId,
        mixed_lots: mixedLots.map((l) => ({
          count: l.files.length,
          extra_count: (l.extraFiles || []).length,
          cover_index: Math.max(0, Math.min(l.files.length - 1, l.coverIndex || 0)),
          mode: l.mode!,
        })),
      };
      formData.append("details", JSON.stringify(details));

      const response = await API.post("/lot-listing", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent: any) => {
          const pct = progressEvent.total
            ? Math.max(0, Math.min(1, progressEvent.loaded / progressEvent.total))
            : 0;
          const weighted = pct * PROG_WEIGHTS.client_upload * 100;
          setProgressPhase("upload");
          setProgressPercent((prev) => (weighted > prev ? weighted : prev));
          setUploadStats((prev) =>
            prev ? { ...prev, uploadedBytes: Math.floor(pct * prev.totalSize) } : null
          );
        },
      });

      const msg =
        response?.data?.message ||
        "Your lot listing is being processed. You will receive an email when the preview is ready.";
      setProgressPercent(100);
      setProgressPhase("done");
      toast.info(msg);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cv:report-created"));
      }
      clearForm(false);
      setSubmitting(false);
      onSuccess?.(msg);
    } catch (err: any) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setProgressPhase("error");
      const msg =
        err?.response?.data?.message || err?.message || "Failed to create lot listing";
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={onSubmit}>
      <div className="relative flex min-h-full flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-purple-100 bg-white/80 p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Lot Listing</h2>
            <p className="mt-1 text-sm text-gray-600">
              Build an auction-ready lot listing with photos, values, Excel, and image downloads.
            </p>
          </div>
        </div>

        {!submitting && error && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-3 text-sm text-red-700 shadow ring-1 ring-black/5 backdrop-blur">
            {error}
          </div>
        )}

        {submitting && (
          <div className="mb-3">
            <div className="w-full max-w-xl mx-auto rounded-2xl border border-purple-100/70 bg-white/80 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur">
              <div className="mb-3 text-sm font-semibold text-gray-900">
                Creating lot listing...
              </div>
              <div className="mb-4 flex items-center justify-between">
                {STEPS.map((s, idx) => {
                  const state = stepStates[s.key];
                  const isDone = state === "done";
                  const isActive = state === "active";
                  return (
                    <div key={s.key} className="flex flex-1 items-center">
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold shadow ${
                          isDone
                            ? "border-purple-600 bg-purple-600 text-white shadow-[0_3px_0_0_rgba(126,34,206,0.5)]"
                            : isActive
                            ? "border-purple-600 text-purple-600 ring-2 ring-purple-300 animate-pulse"
                            : "border-gray-300 text-gray-400"
                        }`}
                        title={s.label}
                      >
                        {isDone ? <Check className="h-4 w-4" /> : idx + 1}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className="mx-2 h-0.5 flex-1 rounded bg-gradient-to-r from-gray-200 to-gray-100">
                          <div
                            className={`h-0.5 rounded ${
                              isDone
                                ? "bg-gradient-to-r from-purple-500 to-purple-600"
                                : isActive
                                ? "bg-gradient-to-r from-purple-300 to-purple-400"
                                : "bg-transparent"
                            }`}
                          ></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div>
                <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                  <div
                    className="h-2 rounded bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-300 shadow-inner"
                    style={{
                      width: `${Math.min(100, Math.max(0, progressPercent)).toFixed(0)}%`,
                    }}
                  ></div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {progressPhase === "upload"
                    ? "Uploading images..."
                    : progressPhase === "processing"
                    ? "Analyzing images and generating files..."
                    : progressPhase === "done"
                    ? "Finalizing..."
                    : "Starting..."}
                </div>

                {progressPhase === "upload" && uploadStats && (
                  <div className="mt-3 p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Files:</span>{" "}
                        <span className="font-medium text-gray-900">
                          {uploadStats.totalFiles}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Size:</span>{" "}
                        <span className="font-medium text-purple-600">
                          {formatFileSize(uploadStats.totalSize)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Uploaded:</span>{" "}
                        <span className="font-medium text-green-600">
                          {formatFileSize(uploadStats.uploadedBytes)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Time:</span>{" "}
                        <span className="font-medium text-amber-600">
                          {getTimeRemaining()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!submitting && (
          <>
            {/* Restore Draft Banner */}
            {hasDraft && mixedLots.length === 0 && (
              <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50/80 p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-purple-600" />
                    <span className="text-sm text-purple-800">
                      You have a saved draft with images
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRestoreDraft}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition shadow-sm"
                    >
                      Restore Draft
                    </button>
                    <button
                      type="button"
                      onClick={clearDraft}
                      className="px-3 py-1.5 text-xs font-medium text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg transition"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Listing Details */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Listing Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Contract Number *</label>
                  <input
                    type="text"
                    value={contractNo}
                    onChange={(e) => {
                      setContractNo(e.target.value);
                      if (errors.contractNo) clearError("contractNo");
                    }}
                    placeholder="e.g., CTR-2024-001"
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400 transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.contractNo ? "border-red-300 focus:ring-red-300" : ""
                    }`}
                  />
                  {errors.contractNo && (
                    <p className="text-xs text-red-500">{errors.contractNo}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Sales Date *</label>
                  <input
                    type="date"
                    value={salesDate}
                    onChange={(e) => {
                      setSalesDate(e.target.value);
                      if (errors.salesDate) clearError("salesDate");
                    }}
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400 transition-all hover:border-gray-400 ${
                      errors.salesDate ? "border-red-300 focus:ring-red-300" : ""
                    }`}
                  />
                  {errors.salesDate && (
                    <p className="text-xs text-red-500">{errors.salesDate}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Location</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g., Toronto, ON"
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400 transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "en" | "fr" | "es")}
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400 transition-all hover:border-gray-400"
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Currency *</label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value.toUpperCase());
                      setCurrencyTouched(true);
                      if (errors.currency) clearError("currency");
                    }}
                    placeholder="CAD"
                    maxLength={3}
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-400 transition-all placeholder:text-gray-400 hover:border-gray-400 uppercase ${
                      errors.currency ? "border-red-300 focus:ring-red-300" : ""
                    }`}
                  />
                  {errors.currency && (
                    <p className="text-xs text-red-500">{errors.currency}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Lots Section with Camera */}
            <section className="mt-4 space-y-3 pb-6 sm:pb-8">
              <h3 className="text-sm font-medium text-gray-900">
                Lots & Images
              </h3>
              <MixedSection
                value={mixedLots}
                onChange={setMixedLots}
                downloadPrefix={contractNo || "lot-listing"}
              />
            </section>

            {/* Action Buttons */}
            <div className="sticky bottom-0 z-10 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.35rem)]">
              <div className="flex flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white/95 p-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 active:translate-y-0.5"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => clearForm()}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:translate-y-0.5"
                >
                  Clear
                </button>
                {onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:translate-y-0.5"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-11 px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl shadow-lg shadow-purple-500/30 transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
              >
                {submitting ? "Creating..." : "Create Lot Listing"}
              </button>
              </div>
            </div>
          </>
        )}
      </div>
    </form>
  );
}
