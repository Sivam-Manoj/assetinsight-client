"use client";

import {
  useEffect,
  useRef,
  useState,
  Fragment,
  useImperativeHandle,
  forwardRef,
} from "react";
import dynamic from "next/dynamic";
import {
  AssetService,
  type AssetCreateDetails,
  type AssetGroupingMode,
} from "@/services/asset";
import {
  SavedInputService,
  type SavedInput,
  type AssetFormData,
  type DraftImageData,
} from "@/services/savedInputs";
import { Check, Save } from "lucide-react";
import { toast } from "react-toastify";
import { useAuthContext } from "@/context/AuthContext";
import { SERVER_BASE } from "@/lib/config";
import {
  CURRENT_BROWSER_LOCATION_LABEL,
  isValidBrowserCoordinates,
} from "@/lib/browserLocation";
import ActiveReportConflictDialog from "./ActiveReportConflictDialog";

// // Code-split the CatalogueSection for camera-based lot capture (disabled for Mixed-only)
// const CatalogueSection = dynamic(() => import("./catalogue/CatalogueSection"), {
//   ssr: false,
// });
// const CombinedCamera = dynamic(() => import("./capture/CombinedCamera"), {
//   ssr: false,
// });
const MixedSection = dynamic(() => import("./mixed/MixedSection"), {
  ssr: false,
});

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
};

export type AssetFormHandle = {
  loadSavedInput: (savedInput: SavedInput) => void;
};

const isoDate = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// Hybrid draft storage: localStorage (fast) + server (cross-device)
const DRAFT_KEY = "cv_asset_draft";
const DRAFT_IMAGES_KEY = "cv_asset_draft_images";
const DEVICE_ID_KEY = "cv_device_id";
const MAX_ASSET_LOT_PHOTOS = 200;

const getAssetFileKey = (file: File) =>
  `${file.name}|${file.size}|${(file as any).lastModified || 0}`;

// Get or create device ID for same-device detection
const getDeviceId = (): string => {
  if (typeof window === "undefined") return "";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

// Type for serialized lot data (without File objects)
type SerializedLot = {
  id: string;
  coverIndex: number;
  mode?: "single_lot" | "per_item" | "per_photo";
  fileCount: number;
  extraFileCount: number;
  videoFileCount: number;
};

// Type for localStorage image data (base64)
type LocalDraftImage = {
  lotId: string;
  type: "main" | "extra" | "video";
  name: string;
  dataUrl: string;
  mimeType: string;
};

// DraftImageData is imported from savedInputs service (URL-based for server)

// const GROUPING_OPTIONS: {
//   value: AssetGroupingMode;
//   label: string;
//   desc: string;
// }[] = [
//   {
//     value: "mixed" as any,
//     label: "Mixed Mode",
//     desc: "Create multiple lots; pick mode per lot (Bundle, Per Item, Per Photo). 20 images max per lot.",
//   },
// ];

const AssetForm = forwardRef<AssetFormHandle, Props>(function AssetForm(
  { onSuccess, onCancel },
  ref
) {
  const { user } = useAuthContext();
  const [grouping, setGrouping] = useState<AssetGroupingMode>("mixed" as any);
  const [images, setImages] = useState<File[]>([]);
  // Combined mode selected sections
  const [combinedModes, setCombinedModes] = useState<
    Array<"single_lot" | "per_item" | "per_photo">
  >(["single_lot", "per_item", "per_photo"]);
  // Catalogue mode state
  const [catalogueLots, setCatalogueLots] = useState<
    { id: string; files: File[]; coverIndex: number }[]
  >([]);
  // Mixed mode state
  const [mixedLots, setMixedLots] = useState<
    {
      id: string;
      files: File[];
      extraFiles: File[];
      videoFiles?: File[];
      coverIndex: number;
      mode?: "single_lot" | "per_item" | "per_photo";
      annotations?: Record<string, Array<{ id: string; x: number; y: number; w: number; h: number }>>;
    }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Report metadata fields
  const [clientName, setClientName] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(isoDate(new Date())); // YYYY-MM-DD
  const [appraisalPurpose, setAppraisalPurpose] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [appraiser, setAppraiser] = useState(
    (user as any)?.username || (user as any)?.name || ""
  );
  const [appraisalCompany, setAppraisalCompany] = useState(
    (user as any)?.companyName || ""
  );
  const [industry, setIndustry] = useState("");
  const [inspectionDate, setInspectionDate] = useState(isoDate(new Date())); // YYYY-MM-DD
  const [location, setLocation] = useState<string>(CURRENT_BROWSER_LOCATION_LABEL);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState("Detecting current location...");
  const [contractNo, setContractNo] = useState("");
  const [language, setLanguage] = useState<"en" | "fr" | "es">("en");
  const [currency, setCurrency] = useState<string>("");
  const [currencyTouched, setCurrencyTouched] = useState<boolean>(false);
  const [currencyLoading, setCurrencyLoading] = useState<boolean>(false);
  const currencyPromptedRef = useRef(false);
  const [preparedFor, setPreparedFor] = useState("");
  const [factorsAgeCondition, setFactorsAgeCondition] = useState("");
  const [factorsQuality, setFactorsQuality] = useState("");
  const [factorsAnalysis, setFactorsAnalysis] = useState("");
  const [includeDamageAnalysis, setIncludeDamageAnalysis] = useState(true);
  const [bankPhotosEnabled, setBankPhotosEnabled] = useState(false);

  // Draft state
  const [hasDraft, setHasDraft] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearError = (k: string) =>
    setErrors((prev) => {
      const { [k]: _, ...rest } = prev;
      return rest;
    });
  function validateForm(): boolean {
    const e: Record<string, string> = {};
    if (!clientName.trim()) e.clientName = "Required";
    if (!effectiveDate) e.effectiveDate = "Required";
    if (!appraisalPurpose.trim()) e.appraisalPurpose = "Required";
    if (!appraiser.trim()) e.appraiser = "Required";
    if (!currency || !/^[A-Z]{3}$/.test(currency))
      e.currency = "Use 3-letter code (e.g., CAD)";
    if (includeValuationTable && selectedValuationMethods.length === 0)
      e.valuation_methods = "Select at least one method";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      try {
        toast.error("Please fix required fields");
      } catch {}
      return false;
    }
    return true;
  }

  // Valuation methods selection (multiple methods)
  const [includeValuationTable, setIncludeValuationTable] =
    useState<boolean>(false);
  const [selectedValuationMethods, setSelectedValuationMethods] = useState<
    Array<"FML" | "TKV" | "OLV" | "FLV">
  >(["FML"]);

  // Progress UI state
  const PROG_WEIGHTS = {
    client_upload: 0.25,
    r2_upload: 0.15,
    ai_analysis: 0.35,
    generate_docx: 0.2,
    finalize: 0.05,
  } as const;
  const STEPS = [
    { key: "client_upload", label: "Uploading images" },
    { key: "r2_upload", label: "Storing images" },
    { key: "ai_analysis", label: "Analyzing images" },
    { key: "generate_docx", label: "Generating DOCX" },
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
  const pollStartedRef = useRef(false);
  const jobIdRef = useRef<string | null>(null);
  const forceNewSubmissionRef = useRef(false);
  const [activeReportConflict, setActiveReportConflict] = useState(false);
  
  // Upload stats for progress modal
  const [uploadStats, setUploadStats] = useState<{
    totalFiles: number;
    totalSize: number;
    uploadedBytes: number;
    startTime: number;
  } | null>(null);

  // Helper to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Calculate estimated time remaining
  const getTimeRemaining = (): string => {
    if (!uploadStats || uploadStats.uploadedBytes === 0) return "Calculating...";
    const elapsed = (Date.now() - uploadStats.startTime) / 1000;
    const speed = uploadStats.uploadedBytes / elapsed; // bytes per second
    const remaining = uploadStats.totalSize - uploadStats.uploadedBytes;
    const secondsLeft = Math.ceil(remaining / speed);
    if (secondsLeft < 60) return `~${secondsLeft}s remaining`;
    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    return `~${minutes}m ${secs}s remaining`;
  };

  // Threshold-based step state updates driven by progressPercent
  useEffect(() => {
    if (progressPhase === "idle") return;
    setStepStates((prev) => {
      const next = { ...prev } as Record<string, "pending" | "active" | "done">;
      // Reset all to pending first
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
        next.generate_docx = "active";
      } else if (p < 100) {
        next.client_upload = "done";
        next.r2_upload = "done";
        next.ai_analysis = "done";
        next.generate_docx = "done";
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
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, []);

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

  // Fetch file from URL and convert to File object (for server)
  const urlToFile = async (url: string, name: string, mimeType: string): Promise<File> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], name, { type: mimeType || blob.type });
  };

  // Hybrid auto-save: localStorage (instant) + server (cross-device)
  const autoSaveDraft = async () => {
    if (submitting || mixedLots.length === 0) return;
    
    // Check if any lot has images
    const hasImages = mixedLots.some(lot => lot.files.length > 0 || (lot.extraFiles?.length || 0) > 0);
    if (!hasImages) return;
    
    try {
      setDraftSaving(true);
      jobIdRef.current ||= `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const deviceId = getDeviceId();
      
      // Prepare form data
      const formData = {
        clientSubmissionId: jobIdRef.current,
        clientName,
        effectiveDate,
        appraisalPurpose,
        ownerName,
        appraiser,
        appraisalCompany,
        industry,
        inspectionDate,
        location,
        latitude,
        longitude,
        contractNo,
        language,
        currency,
        includeValuationTable,
        selectedValuationMethods,
        includeDamageAnalysis,
        bankPhotosEnabled,
        preparedFor,
        factorsAgeCondition,
        factorsQuality,
        factorsAnalysis,
        deviceId,
        savedAt: new Date().toISOString(),
        lots: mixedLots.map(lot => ({
          id: lot.id,
          coverIndex: lot.coverIndex,
          mode: lot.mode,
          fileCount: lot.files.length,
          extraFileCount: (lot.extraFiles || []).length,
          videoFileCount: (lot.videoFiles || []).length,
        })),
      };
      
      // === 1. Save to localStorage (fast, for same device) ===
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
        
        // Convert images to base64 for localStorage
        const localImages: LocalDraftImage[] = [];
        for (const lot of mixedLots) {
          for (const file of lot.files) {
            try {
              const dataUrl = await fileToDataUrl(file);
              localImages.push({
                lotId: lot.id,
                type: "main",
                name: file.name,
                dataUrl,
                mimeType: file.type,
              });
            } catch (e) {
              console.warn("Failed to convert image:", file.name);
            }
          }
          for (const file of lot.extraFiles || []) {
            try {
              const dataUrl = await fileToDataUrl(file);
              localImages.push({
                lotId: lot.id,
                type: "extra",
                name: file.name,
                dataUrl,
                mimeType: file.type,
              });
            } catch (e) {
              console.warn("Failed to convert extra image:", file.name);
            }
          }
        }
        localStorage.setItem(DRAFT_IMAGES_KEY, JSON.stringify(localImages));
        console.log(`[Draft] Saved ${localImages.length} images to localStorage`);
      } catch (e) {
        console.warn("[Draft] localStorage save failed:", e);
      }
      
      // === 2. Upload to server (for cross-device sync) ===
      try {
        const allDraftImages: DraftImageData[] = [];
        
        for (const lot of mixedLots) {
          if (lot.files.length > 0) {
            const uploaded = await SavedInputService.uploadDraftImages(lot.files, lot.id, "main");
            allDraftImages.push(...uploaded);
          }
          if (lot.extraFiles && lot.extraFiles.length > 0) {
            const uploaded = await SavedInputService.uploadDraftImages(lot.extraFiles, lot.id, "extra");
            allDraftImages.push(...uploaded);
          }
        }
        
        await SavedInputService.saveDraft({
          formType: "asset",
          formData,
          draftImages: allDraftImages,
        });
        console.log(`[Draft] Synced ${allDraftImages.length} images to server`);
      } catch (e) {
        console.warn("[Draft] Server sync failed (localStorage still saved):", e);
      }
      
      setHasDraft(true);
      setLastAutoSave(new Date());
    } catch (e) {
      console.error("[Draft] Auto-save failed:", e);
    } finally {
      setDraftSaving(false);
    }
  };

  // Debounced auto-save trigger
  const triggerAutoSave = () => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveDraft();
    }, 2000); // 2 second debounce
  };

  // Restore form fields helper
  const restoreFormFields = (formData: any) => {
    if (formData.clientSubmissionId) jobIdRef.current = String(formData.clientSubmissionId);
    if (formData.clientName) setClientName(formData.clientName);
    if (formData.effectiveDate) setEffectiveDate(formData.effectiveDate);
    if (formData.appraisalPurpose) setAppraisalPurpose(formData.appraisalPurpose);
    if (formData.ownerName) setOwnerName(formData.ownerName);
    if (formData.appraiser) setAppraiser(formData.appraiser);
    if (formData.appraisalCompany) setAppraisalCompany(formData.appraisalCompany);
    if (formData.industry) setIndustry(formData.industry);
    if (formData.inspectionDate) setInspectionDate(formData.inspectionDate);
    if (formData.location) setLocation(formData.location);
    if (isValidBrowserCoordinates(formData.latitude, formData.longitude)) {
      setLatitude(Number(formData.latitude));
      setLongitude(Number(formData.longitude));
      setLocationStatus("Current location detected");
    }
    if (formData.contractNo) setContractNo(formData.contractNo);
    if (formData.language) setLanguage(formData.language);
    if (formData.currency) setCurrency(formData.currency);
    if (typeof formData.includeValuationTable === "boolean") setIncludeValuationTable(formData.includeValuationTable);
    if (formData.selectedValuationMethods) setSelectedValuationMethods(formData.selectedValuationMethods);
    if (typeof formData.includeDamageAnalysis === "boolean")
      setIncludeDamageAnalysis(formData.includeDamageAnalysis);
    if (typeof formData.bankPhotosEnabled === "boolean")
      setBankPhotosEnabled(formData.bankPhotosEnabled);
    if (formData.preparedFor) setPreparedFor(formData.preparedFor);
    if (formData.factorsAgeCondition) setFactorsAgeCondition(formData.factorsAgeCondition);
    if (formData.factorsQuality) setFactorsQuality(formData.factorsQuality);
    if (formData.factorsAnalysis) setFactorsAnalysis(formData.factorsAnalysis);
  };

  // Restore from localStorage (fast, same device)
  const restoreFromLocalStorage = async (): Promise<boolean> => {
    try {
      const savedData = localStorage.getItem(DRAFT_KEY);
      const savedImages = localStorage.getItem(DRAFT_IMAGES_KEY);
      
      if (!savedData || !savedImages) return false;
      
      const formData = JSON.parse(savedData);
      const imageData: LocalDraftImage[] = JSON.parse(savedImages);
      
      if (imageData.length === 0) return false;
      
      // Restore form fields
      restoreFormFields(formData);
      
      // Restore lots with images
      const lotsData = formData.lots || [];
      const restoredLots: typeof mixedLots = [];
      
      for (const lotMeta of lotsData) {
        const lotImages = imageData.filter(img => img.lotId === lotMeta.id);
        const mainFiles: File[] = [];
        const extraFiles: File[] = [];
        
        for (const img of lotImages) {
          try {
            const file = await dataUrlToFile(img.dataUrl, img.name, img.mimeType);
            if (img.type === "main") {
              mainFiles.push(file);
            } else if (img.type === "extra") {
              extraFiles.push(file);
            }
          } catch (e) {
            console.warn("Failed to restore image from localStorage:", img.name);
          }
        }
        
        if (mainFiles.length > 0 || extraFiles.length > 0) {
          restoredLots.push({
            id: lotMeta.id,
            files: mainFiles,
            extraFiles,
            videoFiles: [],
            coverIndex: lotMeta.coverIndex || 0,
            mode: lotMeta.mode,
          });
        }
      }
      
      if (restoredLots.length > 0) {
        setMixedLots(restoredLots);
        return true;
      }
      
      return false;
    } catch (e) {
      console.error("[Draft] localStorage restore failed:", e);
      return false;
    }
  };

  // Restore from server (cross-device)
  const restoreFromServer = async (): Promise<boolean> => {
    try {
      const draft = await SavedInputService.getDraft("asset");
      
      if (!draft) return false;
      
      const formData = draft.formData as any;
      const imageData: DraftImageData[] = draft.draftImages || [];
      
      if (imageData.length === 0) return false;
      
      // Restore form fields
      restoreFormFields(formData);
      
      // Restore lots with images
      const lotsData = formData.lots || [];
      const restoredLots: typeof mixedLots = [];
      
      for (const lotMeta of lotsData) {
        const lotImages = imageData.filter(img => img.lotId === lotMeta.id);
        const mainFiles: File[] = [];
        const extraFiles: File[] = [];
        
        for (const img of lotImages) {
          try {
            // Handle URL - could be relative, old localhost URL, or proper absolute URL
            let fullUrl = img.url;
            if (fullUrl.startsWith("/")) {
              // Relative URL - prepend SERVER_BASE
              fullUrl = `${SERVER_BASE}${fullUrl}`;
            } else if (fullUrl.includes("localhost:4000") || fullUrl.includes("localhost:5000")) {
              // Old localhost URL - replace with SERVER_BASE
              fullUrl = fullUrl.replace(/http:\/\/localhost:\d+/, SERVER_BASE);
            }
            const file = await urlToFile(fullUrl, img.name, img.mimeType);
            if (img.type === "main") {
              mainFiles.push(file);
            } else if (img.type === "extra") {
              extraFiles.push(file);
            }
          } catch (e) {
            console.warn("Failed to restore image from server:", img.name);
          }
        }
        
        if (mainFiles.length > 0 || extraFiles.length > 0) {
          restoredLots.push({
            id: lotMeta.id,
            files: mainFiles,
            extraFiles,
            videoFiles: [],
            coverIndex: lotMeta.coverIndex || 0,
            mode: lotMeta.mode,
          });
        }
      }
      
      if (restoredLots.length > 0) {
        setMixedLots(restoredLots);
        return true;
      }
      
      return false;
    } catch (e) {
      console.error("[Draft] Server restore failed:", e);
      return false;
    }
  };

  // Hybrid restore: localStorage first (fast), fallback to server (cross-device)
  const restoreDraft = async () => {
    try {
      const currentDeviceId = getDeviceId();
      
      // Check localStorage first
      const savedData = localStorage.getItem(DRAFT_KEY);
      if (savedData) {
        const formData = JSON.parse(savedData);
        const savedDeviceId = formData.deviceId;
        
        // Same device - use localStorage (instant)
        if (savedDeviceId === currentDeviceId) {
          console.log("[Draft] Same device detected, restoring from localStorage");
          const restored = await restoreFromLocalStorage();
          if (restored) {
            setHasDraft(true);
            const imageCount = JSON.parse(localStorage.getItem(DRAFT_IMAGES_KEY) || "[]").length;
            toast.info(`Draft restored: ${imageCount} images (from this device)`);
            return true;
          }
        }
      }
      
      // Different device or localStorage empty - use server
      console.log("[Draft] Restoring from server (cross-device)");
      const restored = await restoreFromServer();
      if (restored) {
        setHasDraft(true);
        toast.info("Draft restored from server (synced from another device)");
        return true;
      }
      
      return false;
    } catch (e) {
      console.error("[Draft] Restore failed:", e);
      return false;
    }
  };

  // Clear draft from both localStorage and server
  const clearDraft = async () => {
    try {
      // Clear localStorage
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_IMAGES_KEY);
      
      // Clear server
      try {
        await SavedInputService.deleteDraftImages();
        await SavedInputService.deleteDraft("asset");
      } catch (e) {
        console.warn("[Draft] Server clear failed:", e);
      }
      
      setHasDraft(false);
      setLastAutoSave(null);
    } catch (e) {
      console.error("[Draft] Clear failed:", e);
    }
  };

  // Check for existing draft on mount (localStorage or server)
  useEffect(() => {
    const checkDraft = async () => {
      try {
        // Check localStorage first
        const localData = localStorage.getItem(DRAFT_KEY);
        const localImages = localStorage.getItem(DRAFT_IMAGES_KEY);
        if (localData && localImages) {
          const images = JSON.parse(localImages);
          if (images.length > 0) {
            setHasDraft(true);
            return;
          }
        }
        
        // Check server
        const draft = await SavedInputService.getDraft("asset");
        if (draft && draft.draftImages && draft.draftImages.length > 0) {
          setHasDraft(true);
        }
      } catch (e) {}
    };
    checkDraft();
  }, []);

  // Mixed-only: no direct single-bucket images picker/preview

  // Backfill fields once user loads, without overwriting user edits
  useEffect(() => {
    if (!appraiser && user) {
      setAppraiser((user as any)?.username || (user as any)?.name || "");
    }
    if (!appraisalCompany && (user as any)?.companyName) {
      setAppraisalCompany((user as any)?.companyName || "");
    }
  }, [user]);

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function clearForm() {
    try {
      setGrouping("mixed" as any);
      setImages([]);
      setCatalogueLots([]);
      setMixedLots([]);
      setCombinedModes(["single_lot", "per_item", "per_photo"]);
      setError(null);
      setClientName("");
      setEffectiveDate(isoDate(new Date()));
      setAppraisalPurpose("");
      setOwnerName("");
      setAppraiser("");
      setAppraisalCompany("");
      setIndustry("");
      setInspectionDate(isoDate(new Date()));
      setLocation(CURRENT_BROWSER_LOCATION_LABEL);
      setContractNo("");
      setLanguage("en");
      setCurrency("");
      setCurrencyTouched(false);
      setCurrencyLoading(false);
      setIncludeDamageAnalysis(true);
      setBankPhotosEnabled(false);
      currencyPromptedRef.current = false;
      setIncludeValuationTable(false);
      setSelectedValuationMethods(["FML"]);
      setPreparedFor("");
      setFactorsAgeCondition("");
      setFactorsQuality("");
      setFactorsAnalysis("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.info("Form cleared.");
    } catch {}
  }

  // Reset all fields after successful submission (keeps form open)
  function clearFieldsAfterSubmit() {
    try {
      setGrouping("mixed" as any);
      setImages([]);
      setCatalogueLots([]);
      setMixedLots([]);
      setCombinedModes(["single_lot", "per_item", "per_photo"]);
      setError(null);
      setClientName("");
      setEffectiveDate(isoDate(new Date()));
      setAppraisalPurpose("");
      setOwnerName("");
      setAppraiser("");
      setAppraisalCompany("");
      setIndustry("");
      setInspectionDate(isoDate(new Date()));
      setLocation(CURRENT_BROWSER_LOCATION_LABEL);
      setContractNo("");
      setLanguage("en");
      setCurrency("");
      setCurrencyTouched(false);
      setCurrencyLoading(false);
      currencyPromptedRef.current = false;
      setIncludeValuationTable(false);
      setSelectedValuationMethods(["FML"]);
      setPreparedFor("");
      setFactorsAgeCondition("");
      setFactorsQuality("");
      setFactorsAnalysis("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Reset progress UI state
      setProgressPhase("idle");
      setProgressPercent(0);
      setStepStates(
        () => Object.fromEntries(STEPS.map((s) => [s.key, "pending"])) as any
      );
      setUploadStats(null);
      jobIdRef.current = null;
      pollStartedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    } catch {}
  }

  async function saveInputs() {
    try {
      // Auto-generate name based on client name and date
      const baseName = clientName.trim() || "Unnamed";
      const dateStr = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const autoName = `${baseName} - ${dateStr}`;

      const formData = {
        clientName,
        effectiveDate,
        appraisalPurpose,
        ownerName,
        appraiser,
        appraisalCompany,
        industry,
        inspectionDate,
        location,
        latitude,
        longitude,
        contractNo,
        language,
        currency,
        includeValuationTable,
        selectedValuationMethods,
        includeDamageAnalysis,
        bankPhotosEnabled,
        groupingMode: grouping,
        combinedModes,
        preparedFor,
        factorsAgeCondition,
        factorsQuality,
        factorsAnalysis,
      };

      await SavedInputService.create({
        name: autoName,
        formType: "asset",
        formData,
      });

      toast.success("Inputs saved successfully!");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to save inputs");
    }
  }

  // Load saved input from history
  function loadSavedInput(savedInput: SavedInput) {
    try {
      const fd = savedInput.formData as AssetFormData;
      if (!fd) return;

      // For Mixed-only mode, ignore any saved grouping and force 'mixed'
      setGrouping("mixed" as any);
      if (typeof fd.clientName === "string") setClientName(fd.clientName);
      if (typeof fd.effectiveDate === "string")
        setEffectiveDate(fd.effectiveDate);
      if (typeof fd.appraisalPurpose === "string")
        setAppraisalPurpose(fd.appraisalPurpose);
      if (typeof fd.ownerName === "string") setOwnerName(fd.ownerName);
      if (typeof fd.appraiser === "string") setAppraiser(fd.appraiser);
      if (typeof fd.appraisalCompany === "string")
        setAppraisalCompany(fd.appraisalCompany);
      if (typeof fd.industry === "string") setIndustry(fd.industry);
      if (typeof fd.inspectionDate === "string")
        setInspectionDate(fd.inspectionDate);
      if (typeof fd.location === "string" && fd.location.trim())
        setLocation(fd.location);
      if (isValidBrowserCoordinates(fd.latitude, fd.longitude)) {
        setLatitude(Number(fd.latitude));
        setLongitude(Number(fd.longitude));
        setLocationStatus("Current location detected");
      }
      if (typeof fd.contractNo === "string") setContractNo(fd.contractNo);
      if (fd.language === "en" || fd.language === "fr" || fd.language === "es")
        setLanguage(fd.language);
      if (typeof fd.currency === "string" && fd.currency.trim())
        setCurrency(fd.currency.trim());
      if (typeof fd.includeValuationTable === "boolean")
        setIncludeValuationTable(fd.includeValuationTable);
      if (Array.isArray(fd.selectedValuationMethods))
        setSelectedValuationMethods(fd.selectedValuationMethods as any);
      if (typeof fd.includeDamageAnalysis === "boolean")
        setIncludeDamageAnalysis(fd.includeDamageAnalysis);
      if (typeof (fd as any).bankPhotosEnabled === "boolean")
        setBankPhotosEnabled((fd as any).bankPhotosEnabled);
      if (Array.isArray(fd.combinedModes))
        setCombinedModes(fd.combinedModes as any);
      if (typeof fd.preparedFor === "string") setPreparedFor(fd.preparedFor);
      if (typeof fd.factorsAgeCondition === "string")
        setFactorsAgeCondition(fd.factorsAgeCondition);
      if (typeof fd.factorsQuality === "string")
        setFactorsQuality(fd.factorsQuality);
      if (typeof fd.factorsAnalysis === "string")
        setFactorsAnalysis(fd.factorsAnalysis);

      toast.success(`Loaded: ${savedInput.name}`);
    } catch (error) {
      toast.error("Failed to load saved input");
    }
  }

  // Expose loadSavedInput method to parent via ref
  useImperativeHandle(ref, () => ({
    loadSavedInput,
  }));

  // Listen for global event to load saved input (from Navbar)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const savedInput = e.detail;
      if (savedInput) {
        loadSavedInput(savedInput);
      }
    };
    window.addEventListener("load-saved-input" as any, handler as any);
    return () => {
      window.removeEventListener("load-saved-input" as any, handler as any);
    };
  }, []);
  // Fallback helper: detect currency from browser locale
  const applyLocaleFallbackCurrency = () => {
    try {
      const lang =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "en-CA";
      const region = (lang.split("-")[1] || "").toUpperCase();
      const byRegion: Record<string, string> = {
        US: "USD",
        CA: "CAD",
        GB: "GBP",
        AU: "AUD",
        NZ: "NZD",
        IN: "INR",
        LK: "LKR",
        JP: "JPY",
        CN: "CNY",
        SG: "SGD",
        AE: "AED",
        SA: "SAR",
        PK: "PKR",
        BD: "BDT",
        ZA: "ZAR",
        NG: "NGN",
        PH: "PHP",
        MY: "MYR",
        TH: "THB",
        ID: "IDR",
        KR: "KRW",
        HK: "HKD",
        TW: "TWD",
        AR: "ARS",
        CL: "CLP",
        CO: "COP",
        PE: "PEN",
        VE: "VES",
        TR: "TRY",
        EG: "EGP",
        KE: "KES",
        GH: "GHS",
        VN: "VND",
        FR: "EUR",
        DE: "EUR",
        ES: "EUR",
        IT: "EUR",
        NL: "EUR",
        IE: "EUR",
        PT: "EUR",
        BE: "EUR",
      };
      const detected = byRegion[region] || "CAD";
      console.log("[CurrencyDetect] Locale fallback", {
        acceptLanguage: lang,
        region,
        detected,
      });
      if (!currencyTouched) setCurrency((prev) => prev || detected);
    } catch {}
  };

  const applyCurrentPosition = (pos: GeolocationPosition) => {
    const { latitude, longitude } = pos.coords || ({} as any);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setLocationStatus("Latitude/Longitude not detected");
      return null;
    }

    setLatitude(latitude);
    setLongitude(longitude);
    setLocation(CURRENT_BROWSER_LOCATION_LABEL);
    setLocationStatus("Current location detected");
    return { latitude, longitude };
  };

  const requestCurrentLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("Browser location access is unavailable");
      return;
    }

    setLocationStatus("Detecting current location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyCurrentPosition(pos);
      },
      () => {
        setLocationStatus("Browser location access denied or unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  // On first open, use browser geolocation to detect currency
  useEffect(() => {
    if (currencyPromptedRef.current) return;
    currencyPromptedRef.current = true;
    if (currencyTouched) return;
    setCurrencyLoading(true);
    try {
      console.log("[CurrencyDetect] Starting geolocation-based detection");
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        console.warn("[CurrencyDetect] Geolocation API not available");
        applyLocaleFallbackCurrency();
        setCurrencyLoading(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const coords = applyCurrentPosition(pos);
            if (!coords) {
              console.warn(
                "[CurrencyDetect] Invalid coordinates from geolocation",
                pos.coords
              );
              setCurrencyLoading(false);
              return;
            }
            const { latitude, longitude } = coords;
            console.log("[CurrencyDetect] Geolocation success", {
              latitude,
              longitude,
            });
            const res = await fetch("/api/ai/currency", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat: latitude, lng: longitude }),
            });
            console.log("[CurrencyDetect] Currency API status", res.status);
            if (!res.ok) {
              console.warn("[CurrencyDetect] Currency API returned non-OK");
              applyLocaleFallbackCurrency();
              return;
            }
            const data = await res.json();
            console.log("[CurrencyDetect] Currency API response", data);
            const cc = String(data?.currency || "").toUpperCase();
            if (!currencyTouched && /^[A-Z]{3}$/.test(cc)) {
              setCurrency(cc);
              console.log("[CurrencyDetect] Currency chosen", cc);
              toast.success(`Currency detected: ${cc}`);
            } else {
              console.warn(
                "[CurrencyDetect] Invalid or missing currency from API, applying locale fallback"
              );
              applyLocaleFallbackCurrency();
            }
          } catch {
          } finally {
            setCurrencyLoading(false);
          }
        },
        (error) => {
          // User denied or error; rely on locale fallback above
          setCurrencyLoading(false);
          console.warn("[CurrencyDetect] Geolocation error", error);
          setLocationStatus("Browser location access denied or unavailable");
          applyLocaleFallbackCurrency();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } catch {}
  }, [currencyTouched]);
  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();

    if (!validateForm()) {
      setError("Please fix required fields.");
      return;
    }

    // Prepare files + details depending on grouping
    let filesToSend: File[] = images;
    let videosToSend: File[] | undefined = undefined;
    let extraDetails: Partial<AssetCreateDetails> = {};
    if (grouping === "catalogue") {
      const total = catalogueLots.reduce((s, l) => s + l.files.length, 0);
      if (total === 0) {
        const msg = "Please add at least one image (Catalogue).";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (total > 100) {
        const msg = "Maximum 100 images allowed across all lots.";
        setError(msg);
        toast.error(msg);
        return;
      }
      const perLotOk = catalogueLots.every((l) => l.files.length <= 20);
      if (!perLotOk) {
        const msg = "Each lot can have up to 20 images.";
        setError(msg);
        toast.error(msg);
        return;
      }
      filesToSend = catalogueLots.flatMap((l) => l.files);
      extraDetails = {
        catalogue_lots: catalogueLots.map((l) => ({
          count: l.files.length,
          cover_index: Math.max(
            0,
            Math.min(l.files.length - 1, l.coverIndex || 0)
          ),
        })),
      } as Partial<AssetCreateDetails>;
    } else if (grouping === "combined") {
      // Combined: flat images only, max 20
      if (!combinedModes || combinedModes.length === 0) {
        const msg =
          "Please select at least one section (Single Lot, Per Item, Per Lot).";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (images.length === 0) {
        const msg = "Please add at least one image (Combined).";
        setError(msg);
        toast.error(msg);
        return;
      }
      if (images.length > 20) {
        const msg = "Maximum 20 images allowed in Combined mode.";
        setError(msg);
        toast.error(msg);
        return;
      }
      filesToSend = images;
      extraDetails = { combined_modes: combinedModes };
    } else if (grouping === "mixed") {
      // Mixed: multiple lots with per-lot mode; main and report-only images share the 200-photo lot cap.
      const total = mixedLots.reduce(
        (s, l) => s + l.files.length + (l.extraFiles || []).length,
        0
      );
      if (total === 0) {
        const msg = "Please add at least one image (Mixed).";
        setError(msg);
        toast.error(msg);
        return;
      }
      const perLotOk = mixedLots.every(
        (l) =>
          l.files.length > 0 &&
          l.files.length + (l.extraFiles || []).length <= MAX_ASSET_LOT_PHOTOS &&
          !!l.mode
      );
      if (!perLotOk) {
        const msg = `Each lot must have at least 1 main image, a selected mode, and no more than ${MAX_ASSET_LOT_PHOTOS} total photos including report-only photos.`;
        setError(msg);
        toast.error(msg);
        return;
      }
      filesToSend = mixedLots.flatMap((l) => [
        ...l.files,
        ...(l.extraFiles || []),
      ]);
      videosToSend = mixedLots.flatMap((l) => l.videoFiles || []);
      const focusBoxes: NonNullable<AssetCreateDetails["focus_boxes"]> = [];
      let globalImageIndex = 0;
      for (const lot of mixedLots) {
        for (const file of lot.files) {
          const boxes = lot.annotations?.[getAssetFileKey(file)] || [];
          boxes.forEach((box) => {
            if (
              Number.isFinite(box?.x) &&
              Number.isFinite(box?.y) &&
              Number.isFinite(box?.w) &&
              Number.isFinite(box?.h)
            ) {
              focusBoxes.push({
                imageIndex: globalImageIndex,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
              });
            }
          });
          globalImageIndex += 1;
        }
        globalImageIndex += (lot.extraFiles || []).length;
      }
      extraDetails = {
        mixed_lots: mixedLots.map((l) => ({
          count: l.files.length,
          extra_count: (l.extraFiles || []).length,
          cover_index: Math.max(
            0,
            Math.min(l.files.length - 1, l.coverIndex || 0)
          ),
          mode: l.mode!,
        })),
        ...(focusBoxes.length ? { focus_boxes: focusBoxes } : {}),
      } as Partial<AssetCreateDetails>;
    } else {
      if (images.length === 0) {
        const msg = "Please add at least one image.";
        setError(msg);
        toast.error(msg);
        return;
      }
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
        generate_docx: "pending",
        finalize: "pending",
      }));
      pollStartedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      
      // Calculate total size for upload stats
      const totalSize = filesToSend.reduce((s, f) => s + f.size, 0) + 
        (videosToSend?.reduce((s, f) => s + f.size, 0) || 0);
      setUploadStats({
        totalFiles: filesToSend.length + (videosToSend?.length || 0),
        totalSize,
        uploadedBytes: 0,
        startTime: Date.now(),
      });

      // Generate a job/progress id for server-side tracking
      const jobId =
        jobIdRef.current ||
        (typeof crypto !== "undefined" && (crypto as any)?.randomUUID
          ? (crypto as any).randomUUID()
          : `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
      jobIdRef.current = jobId;

      const payload: AssetCreateDetails = {
        grouping_mode: "mixed" as any,
        ...(clientName.trim() && { client_name: clientName.trim() }),
        ...(effectiveDate && { effective_date: effectiveDate }),
        ...(appraisalPurpose.trim() && {
          appraisal_purpose: appraisalPurpose.trim(),
        }),
        ...(ownerName.trim() && { owner_name: ownerName.trim() }),
        ...(appraiser.trim() && { appraiser: appraiser.trim() }),
        ...(appraisalCompany.trim() && {
          appraisal_company: appraisalCompany.trim(),
        }),
        ...(industry.trim() && { industry: industry.trim() }),
        ...(inspectionDate && { inspection_date: inspectionDate }),
        location: location.trim() || CURRENT_BROWSER_LOCATION_LABEL,
        ...(isValidBrowserCoordinates(latitude, longitude)
          ? {
              latitude: Number(latitude),
              longitude: Number(longitude),
            }
          : {}),
        ...(contractNo.trim() && { contract_no: contractNo.trim() }),
        language,
        ...(currency && { currency }),
        include_valuation_table: includeValuationTable,
        valuation_methods: includeValuationTable
          ? selectedValuationMethods
          : [],
        include_damage_analysis: includeDamageAnalysis,
        bank_photos_enabled: bankPhotosEnabled,
        progress_id: jobId,
        client_submission_id: jobId,
        force_new: forceNewSubmissionRef.current,
        ...(preparedFor.trim() && { prepared_for: preparedFor.trim() }),
        ...(factorsAgeCondition.trim() && {
          factors_age_condition: factorsAgeCondition.trim(),
        }),
        ...(factorsQuality.trim() && {
          factors_quality: factorsQuality.trim(),
        }),
        ...(factorsAnalysis.trim() && {
          factors_analysis: factorsAnalysis.trim(),
        }),
        ...(grouping === "catalogue" ||
        grouping === "combined" ||
        grouping === "mixed"
          ? extraDetails
          : {}),
      };

      const createResponse = await AssetService.create(
        payload,
        filesToSend,
        videosToSend,
        {
          onUploadProgress: (fraction: number) => {
            const pct = Math.max(0, Math.min(1, fraction));
            const weighted = pct * PROG_WEIGHTS.client_upload * 100;
            setProgressPhase("upload");
            setProgressPercent((prev) => (weighted > prev ? weighted : prev));
            // Update uploaded bytes for time estimation
            setUploadStats((prev) => prev ? {
              ...prev,
              uploadedBytes: Math.floor(pct * prev.totalSize),
            } : null);
          },
        }
      );

      const msg =
        createResponse?.message ||
        "Your report is being processed. You will receive an email when the preview is ready.";
      setProgressPercent(100);
      setProgressPhase("done");
      toast.info(msg);
      await clearDraft();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cv:report-created"));
      }
      clearFieldsAfterSubmit();
      forceNewSubmissionRef.current = false;
      setSubmitting(false);
      onSuccess?.(msg);
    } catch (err: any) {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      setProgressPhase("error");
      if (err?.response?.status === 409 && err?.response?.data?.code === "ACTIVE_REPORT_EXISTS") {
        setSubmitting(false);
        setActiveReportConflict(true);
        return;
      }
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create asset report";
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={onSubmit}>
      <div className="relative flex min-h-full flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-rose-100 bg-white/80 p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Asset Appraisal</h2>
            <p className="mt-1 text-sm text-gray-600">
              Enter report details, add lots and photos, then submit for preview generation.
            </p>
          </div>
        </div>

        {!submitting && error && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-3 text-sm text-red-700 shadow ring-1 ring-black/5 backdrop-blur">
            {error}
          </div>
        )}

        {/* Draft indicator and restore banner */}
        {!submitting && hasDraft && mixedLots.length === 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm font-medium text-amber-800">
                  Draft Available
                </span>
                <span className="text-xs text-amber-600">
                  You have unsaved images from a previous session
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={restoreDraft}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition"
                >
                  Restore Draft
                </button>
                <button
                  type="button"
                  onClick={clearDraft}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100 transition"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-save indicator when images exist */}
        {!submitting && mixedLots.some(l => l.files.length > 0) && (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
            {draftSaving ? (
              <>
                <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Saving draft...</span>
              </>
            ) : lastAutoSave ? (
              <>
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span>Draft saved at {lastAutoSave.toLocaleTimeString()}</span>
              </>
            ) : null}
          </div>
        )}

        {submitting && (
          <div className="mb-3">
            <div className="w-full max-w-xl mx-auto rounded-2xl border border-rose-100/70 bg-white/80 p-4 shadow-2xl ring-1 ring-black/5 backdrop-blur">
              <div className="mb-3 text-sm font-semibold text-gray-900">
                Creating report...
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
                            ? "border-rose-600 bg-rose-600 text-white shadow-[0_3px_0_0_rgba(190,18,60,0.5)]"
                            : isActive
                            ? "border-rose-600 text-rose-600 ring-2 ring-rose-300 animate-pulse"
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
                                ? "bg-gradient-to-r from-rose-500 to-rose-600"
                                : isActive
                                ? "bg-gradient-to-r from-rose-300 to-rose-400"
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
                    className="h-2 rounded bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-300 shadow-inner"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, progressPercent)
                      ).toFixed(0)}%`,
                    }}
                  ></div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {progressPhase === "upload"
                    ? "Uploading images..."
                    : progressPhase === "processing"
                    ? "Analyzing images and generating DOCX..."
                    : progressPhase === "done"
                    ? "Finalizing..."
                    : "Starting..."}
                </div>
                
                {/* Upload stats during upload phase */}
                {progressPhase === "upload" && uploadStats && (
                  <div className="mt-3 p-2 rounded-lg bg-gray-50 border border-gray-200">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Files:</span>{" "}
                        <span className="font-medium text-gray-900">{uploadStats.totalFiles}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Size:</span>{" "}
                        <span className="font-medium text-rose-600">{formatFileSize(uploadStats.totalSize)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Uploaded:</span>{" "}
                        <span className="font-medium text-green-600">{formatFileSize(uploadStats.uploadedBytes)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Time:</span>{" "}
                        <span className="font-medium text-amber-600">{getTimeRemaining()}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!submitting && (
          <Fragment>
            {/* Grouping selector removed: Mixed mode only */}

            {/* Report Details */}
            <section className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">
                Report Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Client Name</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      if (errors.clientName) clearError("clientName");
                    }}
                    placeholder="e.g., Acme Corp"
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.clientName
                        ? "border-red-300 focus:ring-red-300"
                        : ""
                    }`}
                  />
                  {errors.clientName && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.clientName}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => {
                      setEffectiveDate(e.target.value);
                      if (errors.effectiveDate) clearError("effectiveDate");
                    }}
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.effectiveDate
                        ? "border-red-300 focus:ring-red-300"
                        : ""
                    }`}
                  />
                  {errors.effectiveDate && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.effectiveDate}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Appraisal Purpose
                  </label>
                  <input
                    type="text"
                    value={appraisalPurpose}
                    onChange={(e) => {
                      setAppraisalPurpose(e.target.value);
                      if (errors.appraisalPurpose)
                        clearError("appraisalPurpose");
                    }}
                    placeholder="e.g., Insurance"
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.appraisalPurpose
                        ? "border-red-300 focus:ring-red-300"
                        : ""
                    }`}
                  />
                  {errors.appraisalPurpose && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.appraisalPurpose}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Owner Name</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g., John Doe"
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Prepared For</label>
                  <input
                    type="text"
                    value={preparedFor}
                    onChange={(e) => setPreparedFor(e.target.value)}
                    placeholder="e.g., Client Contact / Company"
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Appraiser</label>
                  <input
                    type="text"
                    value={appraiser}
                    onChange={(e) => {
                      setAppraiser(e.target.value);
                      if (errors.appraiser) clearError("appraiser");
                    }}
                    placeholder="e.g., Jane Smith"
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.appraiser
                        ? "border-red-300 focus:ring-red-300"
                        : ""
                    }`}
                  />
                  {errors.appraiser && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.appraiser}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Appraisal Company
                  </label>
                  <input
                    type="text"
                    value={appraisalCompany}
                    onChange={(e) => setAppraisalCompany(e.target.value)}
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Industry</label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g., Manufacturing"
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Inspection Date
                  </label>
                  <input
                    type="date"
                    value={inspectionDate}
                    onChange={(e) => setInspectionDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Contract No</label>
                  <input
                    type="text"
                    value={contractNo}
                    onChange={(e) => setContractNo(e.target.value)}
                    placeholder="e.g., CN-2025-001"
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Bank</label>
                  <button
                    type="button"
                    onClick={() => setBankPhotosEnabled((value) => !value)}
                    className={`flex w-full items-center justify-between rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition ${
                      bankPhotosEnabled
                        ? "border-rose-400 bg-rose-50 text-rose-700"
                        : "border-gray-300/80 bg-white text-gray-700 hover:border-gray-400"
                    }`}
                    aria-pressed={bankPhotosEnabled}
                  >
                    <span>Include all photos in CR</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs shadow-sm">
                      {bankPhotosEnabled ? "On" : "Off"}
                    </span>
                  </button>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as any)}
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all cursor-pointer hover:border-gray-400"
                  >
                    <option value="en">English (default)</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Currency (ISO code){" "}
                    {currencyLoading && (
                      <span className="ml-1 text-[11px] text-gray-500">
                        Detecting…
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => {
                      setCurrencyTouched(true);
                      setCurrency(e.target.value.toUpperCase().slice(0, 3));
                      if (errors.currency) clearError("currency");
                    }}
                    disabled={currencyLoading && !currencyTouched}
                    placeholder={
                      currencyLoading ? "Detecting…" : "e.g., CAD, USD, EUR"
                    }
                    className={`w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400 ${
                      errors.currency ? "border-red-300 focus:ring-red-300" : ""
                    }`}
                  />
                  {errors.currency && (
                    <p className="text-xs text-red-600 mt-1">
                      {errors.currency}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Factors Affecting Value */}
            <section className="space-y-3 rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50/50 to-indigo-50/30 p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900">
                Factors Affecting Value
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="space-y-2 lg:col-span-3 rounded-xl border border-amber-200 bg-white/80 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700">
                        Damage Analysis
                      </label>
                      <p className="mt-1 text-[11px] text-gray-600">
                        Applies only to lots 1000 and above. Lower lot numbers are excluded automatically.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setIncludeDamageAnalysis(!includeDamageAnalysis)
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        includeDamageAnalysis ? "bg-amber-500" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          includeDamageAnalysis
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">
                    Age & Condition
                  </label>
                  <textarea
                    value={factorsAgeCondition}
                    onChange={(e) => setFactorsAgeCondition(e.target.value)}
                    rows={3}
                    placeholder="Describe age and condition..."
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Quality</label>
                  <textarea
                    value={factorsQuality}
                    onChange={(e) => setFactorsQuality(e.target.value)}
                    rows={3}
                    placeholder="Describe quality..."
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600">Analysis</label>
                  <textarea
                    value={factorsAnalysis}
                    onChange={(e) => setFactorsAnalysis(e.target.value)}
                    rows={3}
                    placeholder="Provide overall analysis..."
                    className="w-full rounded-lg border-2 border-gray-300/80 bg-gradient-to-b from-gray-50 via-white to-gray-100 px-3 py-2.5 text-sm text-gray-900 shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_1px_3px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-rose-500/60 focus:border-rose-400 focus:shadow-[inset_0_3px_6px_rgba(0,0,0,0.1),inset_0_-2px_4px_rgba(255,255,255,0.9),0_0_0_4px_rgba(251,113,133,0.15)] transition-all placeholder:text-gray-400 hover:border-gray-400"
                  />
                </div>
              </div>
            </section>

            {/* Valuation Comparison Table */}
            <section className="space-y-3 rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50/50 to-blue-50/30 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    Quick Comparison Table
                  </h3>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Compare multiple valuation methods with software
                    explanations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setIncludeValuationTable(!includeValuationTable)
                  }
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    includeValuationTable ? "bg-sky-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      includeValuationTable ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {includeValuationTable && (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-gray-700 font-medium">
                    Select valuation methods to compare:
                  </p>
                  {errors.valuation_methods && (
                    <p className="text-xs text-red-600">
                      {errors.valuation_methods}
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {/* FML */}
                    <label className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-white/80 p-3 cursor-pointer hover:bg-emerald-50/50 transition">
                      <input
                        type="checkbox"
                        checked={selectedValuationMethods.includes("FML")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedValuationMethods([
                              ...selectedValuationMethods,
                              "FML",
                            ]);
                          } else {
                            // Prevent unchecking if it's the only selected method
                            if (selectedValuationMethods.length > 1) {
                              setSelectedValuationMethods(
                                selectedValuationMethods.filter(
                                  (m) => m !== "FML"
                                )
                              );
                            } else {
                              toast.warning(
                                "At least one valuation method must be selected"
                              );
                            }
                          }
                          if (errors.valuation_methods)
                            clearError("valuation_methods");
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          FML (Fair Market Value)
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Appraised retail value for insurance or estate
                          purposes
                        </div>
                      </div>
                    </label>

                    {/* TKV */}
                    <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white/80 p-3 cursor-pointer hover:bg-amber-50/50 transition">
                      <input
                        type="checkbox"
                        checked={selectedValuationMethods.includes("TKV")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedValuationMethods([
                              ...selectedValuationMethods,
                              "TKV",
                            ]);
                          } else {
                            // Prevent unchecking if it's the only selected method
                            if (selectedValuationMethods.length > 1) {
                              setSelectedValuationMethods(
                                selectedValuationMethods.filter(
                                  (m) => m !== "TKV"
                                )
                              );
                            } else {
                              toast.warning(
                                "At least one valuation method must be selected"
                              );
                            }
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          TKV (Trade Value)
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Dealer trade-in value for wholesale transactions
                        </div>
                      </div>
                    </label>

                    {/* OLV */}
                    <label className="flex items-start gap-2 rounded-lg border border-blue-200 bg-white/80 p-3 cursor-pointer hover:bg-blue-50/50 transition">
                      <input
                        type="checkbox"
                        checked={selectedValuationMethods.includes("OLV")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedValuationMethods([
                              ...selectedValuationMethods,
                              "OLV",
                            ]);
                          } else {
                            // Prevent unchecking if it's the only selected method
                            if (selectedValuationMethods.length > 1) {
                              setSelectedValuationMethods(
                                selectedValuationMethods.filter(
                                  (m) => m !== "OLV"
                                )
                              );
                            } else {
                              toast.warning(
                                "At least one valuation method must be selected"
                              );
                            }
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          OLV (Orderly Liquidation)
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Auction reserve value with reasonable marketing time
                        </div>
                      </div>
                    </label>

                    {/* FLV */}
                    <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-white/80 p-3 cursor-pointer hover:bg-rose-50/50 transition">
                      <input
                        type="checkbox"
                        checked={selectedValuationMethods.includes("FLV")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedValuationMethods([
                              ...selectedValuationMethods,
                              "FLV",
                            ]);
                          } else {
                            // Prevent unchecking if it's the only selected method
                            if (selectedValuationMethods.length > 1) {
                              setSelectedValuationMethods(
                                selectedValuationMethods.filter(
                                  (m) => m !== "FLV"
                                )
                              );
                            } else {
                              toast.warning(
                                "At least one valuation method must be selected"
                              );
                            }
                          }
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-gray-900">
                          FLV (Forced Liquidation)
                        </div>
                        <div className="text-[11px] text-gray-600 mt-0.5">
                          Quick sale value under immediate liquidation pressure
                        </div>
                      </div>
                    </label>
                  </div>
                  {selectedValuationMethods.length === 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ Select at least one valuation method
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Mixed mode only (contained) */}
            <section className="space-y-3 pb-6 sm:pb-8">
              <h3 className="text-sm font-medium text-gray-900">Mixed Lots</h3>
              <MixedSection
                value={mixedLots}
                onChange={setMixedLots}
                maxImagesPerLot={MAX_ASSET_LOT_PHOTOS}
                maxExtraImagesPerLot={MAX_ASSET_LOT_PHOTOS}
                maxTotalImages={MAX_ASSET_LOT_PHOTOS}
                downloadPrefix={(contractNo || "asset").replace(
                  /[^a-zA-Z0-9_-]/g,
                  "-"
                )}
                onImageCapture={triggerAutoSave}
                actionButtons={
                  <div className="grid w-full gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    <button
                      type="button"
                      className="w-full sm:w-auto inline-flex items-center gap-2 rounded-xl border cursor-pointer border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-700 shadow hover:bg-white transition active:translate-y-0.5"
                      onClick={saveInputs}
                    >
                      <Save className="h-4 w-4" />
                      Save Inputs
                    </button>
                    <button
                      type="button"
                      className="w-full sm:w-auto rounded-xl border cursor-pointer border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-700 shadow hover:bg-white transition active:translate-y-0.5"
                      onClick={clearForm}
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="w-full sm:w-auto inline-flex items-center gap-2 cursor-pointer rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 px-3 py-2 text-sm font-semibold text-white shadow-[0_6px_0_0_rgba(190,18,60,0.5)] hover:from-rose-400 hover:to-rose-600 transition active:translate-y-0.5 active:shadow-[0_2px_0_0_rgba(190,18,60,0.5)] disabled:opacity-50"
                      disabled={submitting}
                    >
                      {submitting ? "Creating..." : "Create Report"}
                    </button>
                  </div>
                }
              />
            </section>
          </Fragment>
        )}
      </div>
      <ActiveReportConflictDialog
        open={activeReportConflict}
        reportLabel="asset report"
        onCancel={() => setActiveReportConflict(false)}
        onResume={() => {
          setActiveReportConflict(false);
          window.dispatchEvent(new Event("cv:report-created"));
          toast.info("The existing report is still processing. Check My Reports for its status.");
          onSuccess?.("Existing report resumed. Open My Reports to follow its progress.");
        }}
        onCreateSeparate={() => {
          setActiveReportConflict(false);
          jobIdRef.current =
            typeof crypto !== "undefined" && (crypto as any)?.randomUUID
              ? (crypto as any).randomUUID()
              : `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          forceNewSubmissionRef.current = true;
          window.setTimeout(() => void onSubmit(), 0);
        }}
      />
    </form>
  );
});

export default AssetForm;
