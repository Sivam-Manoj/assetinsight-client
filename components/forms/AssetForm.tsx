"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { Menu, MenuItem } from "@/components/ui/legacy";
import { MoreHorizontal, Save, ScanLine } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  AssetService,
  type AssetCreateDetails,
} from "@/services/asset";
import {
  SavedInputService,
  type AssetFormData,
  type DraftFileMetadata,
  type SavedInput,
  getDraftFileMetadata,
} from "@/services/savedInputs";
import {
  ReportDraftService,
  buildReportDraftMediaManifest,
  createReportDraftClientId,
  getReportDraftDeviceId,
  serializeReportDraftLots,
  type ReportDraftRecord,
} from "@/services/reportDrafts";
import { useAuthContext } from "@/context/AuthContext";
import {
  CURRENT_BROWSER_LOCATION_LABEL,
  isValidBrowserCoordinates,
} from "@/lib/browserLocation";
import ActiveReportConflictDialog from "./ActiveReportConflictDialog";
import {
  auctioneerDateOnly,
  auctioneerDraftScope,
  auctioneerIndustry,
  buildAuctioneerSeedLots,
  type AuctioneerFormIntegration,
} from "./auctioneerSeed";
import {
  getMixedFileKey,
  type MixedLot,
} from "./mixed/types";
import { buildMixedFocusBoxes } from "./mixed/focusBoxes";
import {
  DraftPersistenceError,
  FORM_DRAFT_VERSION,
  deleteScopedDraft,
  getScopedDraftKey,
  loadScopedDraft,
  parseScopedDraftEnvelope,
  requestDurableDraftStorage,
  saveScopedDraft,
} from "./drafts/storage";
import { deleteSmartUploadDraft } from "./smartUpload/storage";
import {
  ConfirmDialog,
  FormActionBar,
  FormAlert,
  FormField,
  FormSection,
  FormSwitch,
  formClassNames,
  formControlClass,
  formSelectClass,
  formTextareaClass,
  iconButtonClass,
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
  type DraftStatus,
} from "./ui/FormUI";

const MixedSection = dynamic(() => import("./mixed/MixedSection"), {
  ssr: false,
});
const SmartUploadWorkspace = dynamic(
  () => import("./smartUpload/SmartUploadWorkspace"),
  { ssr: false }
);

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
  onDraftStatusChange?: (status: DraftStatus, label?: string) => void;
  auctioneer?: AuctioneerFormIntegration;
  resumeDraft?: ReportDraftRecord | null;
  restoreDraftOnMount?: boolean;
  resumeLocalDraftScopeId?: string;
};

export type AssetFormHandle = {
  loadSavedInput: (savedInput: SavedInput) => void;
};

type SectionId = "report" | "factors" | "comparison" | "media";
type ValuationMethod = "FML" | "TKV" | "OLV" | "FLV";

type FileDescriptor = {
  clientFileId?: string;
  name: string;
  size: number;
  mimeType: string;
  lastModified: number;
};

type DraftMediaType = "main" | "extra" | "video";

type DraftMediaLocation = DraftFileMetadata & {
  lotId: string;
  type: DraftMediaType;
  index: number;
};

type SerializedLot = {
  id: string;
  coverIndex: number;
  mode?: "single_lot" | "per_item" | "per_photo";
  mainFiles: FileDescriptor[];
  extraFiles: FileDescriptor[];
  videoFiles: FileDescriptor[];
  annotations?: MixedLot["annotations"];
};

type LocalDraftMedia = FileDescriptor & {
  lotId: string;
  type: "main" | "extra" | "video";
  dataUrl: string;
};

type AssetDraftFormData = {
  clientSubmissionId: string;
  clientName: string;
  effectiveDate: string;
  appraisalPurpose: string;
  ownerName: string;
  appraiser: string;
  appraisalCompany: string;
  industry: string;
  inspectionDate: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  contractNo: string;
  language: "en" | "fr" | "es";
  currency: string;
  includeValuationTable: boolean;
  selectedValuationMethods: ValuationMethod[];
  includeDamageAnalysis: boolean;
  bankPhotosEnabled: boolean;
  preparedFor: string;
  factorsAgeCondition: string;
  factorsQuality: string;
  factorsAnalysis: string;
};

type LegacyAssetDraftEnvelope = {
  version: 2;
  kind: "asset";
  userId: string;
  revision: number;
  savedAt: string;
  deviceId: string;
  formData: AssetDraftFormData;
  lots: SerializedLot[];
  media: LocalDraftMedia[];
};

type AssetDraftEnvelope = {
  version: typeof FORM_DRAFT_VERSION;
  kind: "asset";
  userId: string;
  revision: number;
  savedAt: string;
  deviceId: string;
  formData: AssetDraftFormData;
  lots: MixedLot[];
  mediaMetadata?: DraftMediaLocation[];
};

type DraftSnapshot = {
  revision: number;
  formData: AssetDraftFormData;
  lots: MixedLot[];
  serializedLots: SerializedLot[];
};

const MAX_ASSET_LOT_PHOTOS = 200;
const DEVICE_ID_KEY = "cv_device_id";

const isoDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const describeFile = (file: File): FileDescriptor => ({
  ...getDraftFileMetadata(file),
  name: file.name,
  size: file.size,
  mimeType: file.type,
  lastModified: file.lastModified || 0,
});

const getLotFileBucket = (lot: MixedLot, type: DraftMediaType) => {
  if (type === "main") return lot.files;
  if (type === "extra") return lot.extraFiles;
  return lot.videoFiles || [];
};

const listDraftMediaLocations = (
  lots: MixedLot[]
): DraftMediaLocation[] =>
  lots.flatMap((lot) =>
    (["main", "extra", "video"] as const).flatMap((type) =>
      getLotFileBucket(lot, type).map((file, index) => ({
        ...getDraftFileMetadata(file),
        lotId: lot.id,
        type,
        index,
      }))
    )
  );

const applyDraftMediaLocations = (
  lots: MixedLot[],
  locations: DraftMediaLocation[] = []
) => {
  const byLocation = new Map(
    locations.map((item) => [
      JSON.stringify([item.lotId, item.type, item.index]),
      item,
    ])
  );
  for (const lot of lots) {
    for (const type of ["main", "extra", "video"] as const) {
      getLotFileBucket(lot, type).forEach((file, index) => {
        const persisted = byLocation.get(
          JSON.stringify([lot.id, type, index])
        );
        if (persisted) getDraftFileMetadata(file, persisted);
      });
    }
  }
};

const getDeviceId = () => {
  if (typeof window === "undefined") return "";
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

const dataUrlToFile = async (media: LocalDraftMedia) => {
  const response = await fetch(media.dataUrl);
  const blob = await response.blob();
  return new File([blob], media.name, {
    type: media.mimeType || blob.type,
    lastModified: media.lastModified,
  });
};

const storageErrorMessage = (error: unknown) => {
  if (error instanceof DraftPersistenceError) return error.message;
  const name = String((error as { name?: string })?.name || "");
  if (name === "QuotaExceededError") {
    return "Browser storage is full. The previous local draft was preserved; remove large media or free browser storage.";
  }
  if (name === "SecurityError") {
    return "This browser blocked local draft storage. Keep this tab open or allow site storage before continuing.";
  }
  return "The draft could not be stored in this browser. Your previous valid draft was preserved.";
};

const valuationOptions: Array<{
  value: ValuationMethod;
  label: string;
  description: string;
}> = [
  {
    value: "FML",
    label: "FML · Fair Market Value",
    description: "Retail value for insurance or estate purposes.",
  },
  {
    value: "TKV",
    label: "TKV · Trade Value",
    description: "Dealer trade-in value for wholesale transactions.",
  },
  {
    value: "OLV",
    label: "OLV · Orderly Liquidation",
    description: "Auction value with reasonable marketing time.",
  },
  {
    value: "FLV",
    label: "FLV · Forced Liquidation",
    description: "Quick-sale value under immediate liquidation pressure.",
  },
];

const AssetForm = forwardRef<AssetFormHandle, Props>(function AssetForm(
  {
    onSuccess,
    onCancel,
    onDraftStatusChange,
    auctioneer,
    resumeDraft = null,
    restoreDraftOnMount = false,
    resumeLocalDraftScopeId,
  },
  ref
) {
  const { user } = useAuthContext();
  const userId = user?._id || "";
  const draftClientIdRef = useRef(
    resumeDraft?.clientDraftId ||
      resumeLocalDraftScopeId ||
      (restoreDraftOnMount ? auctioneerDraftScope(auctioneer) : "") ||
      auctioneer?.clientSubmissionId ||
      (auctioneer
        ? `auctioneer-${auctioneer.workItemId}`
        : createReportDraftClientId("asset"))
  );
  const draftScopeId = draftClientIdRef.current;
  const draftStorageKey =
    getScopedDraftKey(userId, "asset", draftScopeId) || "";
  const importedEventDate =
    auctioneerDateOnly(auctioneer?.contract.eventDate) || isoDate(new Date());
  const importedLocation =
    auctioneer?.contract.location || CURRENT_BROWSER_LOCATION_LABEL;

  const [clientName, setClientName] = useState(
    () => auctioneer?.contract.customerName || ""
  );
  const [effectiveDate, setEffectiveDate] = useState(importedEventDate);
  const [appraisalPurpose, setAppraisalPurpose] = useState(
    () => (auctioneer ? "Auction listing and condition report" : "")
  );
  const [ownerName, setOwnerName] = useState(
    () => auctioneer?.contract.customerName || ""
  );
  const [preparedFor, setPreparedFor] = useState(
    () => auctioneer?.contract.customerName || ""
  );
  const [appraiser, setAppraiser] = useState(user?.username || "");
  const [appraisalCompany, setAppraisalCompany] = useState(
    user?.companyName || ""
  );
  const [industry, setIndustry] = useState(() => auctioneerIndustry(auctioneer));
  const [inspectionDate, setInspectionDate] = useState(isoDate(new Date()));
  const [location, setLocation] = useState(importedLocation);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState(
    auctioneer ? "Imported from Auctioneer" : "Detecting current location…"
  );
  const [contractNo, setContractNo] = useState(
    () => auctioneer?.contract.contractNo || ""
  );
  const [language, setLanguage] = useState<"en" | "fr" | "es">("en");
  const [currency, setCurrency] = useState(() => (auctioneer ? "CAD" : ""));
  const [currencyTouched, setCurrencyTouched] = useState(Boolean(auctioneer));
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [includeDamageAnalysis, setIncludeDamageAnalysis] = useState(true);
  const [bankPhotosEnabled, setBankPhotosEnabled] = useState(false);
  const [factorsAgeCondition, setFactorsAgeCondition] = useState("");
  const [factorsQuality, setFactorsQuality] = useState("");
  const [factorsAnalysis, setFactorsAnalysis] = useState("");
  const [includeValuationTable, setIncludeValuationTable] = useState(false);
  const [selectedValuationMethods, setSelectedValuationMethods] = useState<
    ValuationMethod[]
  >(["FML"]);
  const [mixedLots, setMixedLots] = useState<MixedLot[]>(() =>
    buildAuctioneerSeedLots(auctioneer)
  );

  const [openSections, setOpenSections] = useState<Set<SectionId>>(
    () => new Set(["report", "media"])
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [draftGuidance, setDraftGuidance] = useState<{
    tone: "warning" | "error";
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStats, setUploadStats] = useState<{
    totalFiles: number;
    totalSize: number;
    uploadedBytes: number;
    startTime: number;
  } | null>(null);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [activeReportConflict, setActiveReportConflict] = useState(false);
  const [smartUploadOpen, setSmartUploadOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);

  const currencyPromptedRef = useRef(false);
  const jobIdRef = useRef<string | null>(
    draftClientIdRef.current
  );
  const forceNewSubmissionRef = useRef(false);
  const createdEventDispatchedRef = useRef(false);
  const autoSaveBlockedRef = useRef(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRevisionRef = useRef(0);
  const committedRevisionRef = useRef(0);
  const queuedRevisionRef = useRef(0);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const lastFingerprintRef = useRef<string | null>(null);
  const accountSyncPendingRef = useRef(false);
  const retryAccountSyncRef = useRef<() => void>(() => undefined);
  const draftStatusCallbackRef = useRef(onDraftStatusChange);
  const mountRestoreStartedRef = useRef(false);

  useEffect(() => {
    draftStatusCallbackRef.current = onDraftStatusChange;
  }, [onDraftStatusChange]);

  const publishDraftStatus = (status: DraftStatus, label?: string) => {
    draftStatusCallbackRef.current?.(status, label);
  };

  const clearFieldError = (key: string) => {
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const toggleSection = (section: SectionId, open: boolean) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (open) next.add(section);
      else next.delete(section);
      return next;
    });
  };

  const ensureJobId = () => {
    if (!jobIdRef.current) {
      jobIdRef.current =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return jobIdRef.current;
  };

  const currentFormData: AssetDraftFormData = {
    clientSubmissionId: jobIdRef.current || "",
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
  };

  const formStateRef = useRef<{ formData: AssetDraftFormData; lots: MixedLot[] }>({
    formData: currentFormData,
    lots: mixedLots,
  });
  formStateRef.current = { formData: currentFormData, lots: mixedLots };

  const draftFingerprint = useMemo(
    () =>
      JSON.stringify({
        ...currentFormData,
        lots: mixedLots.map((lot) => ({
          id: lot.id,
          mode: lot.mode,
          coverIndex: lot.coverIndex,
          files: lot.files.map(getMixedFileKey),
          extraFiles: lot.extraFiles.map(getMixedFileKey),
          videoFiles: (lot.videoFiles || []).map(getMixedFileKey),
          annotations: lot.annotations || {},
        })),
      }),
    [
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
      mixedLots,
    ]
  );

  const makeSnapshot = (revision: number): DraftSnapshot => {
    const state = formStateRef.current;
    const lots = state.lots.map((lot) => ({
      ...lot,
      files: [...lot.files],
      extraFiles: [...lot.extraFiles],
      videoFiles: [...(lot.videoFiles || [])],
      annotations: lot.annotations ? { ...lot.annotations } : undefined,
    }));
    return {
      revision,
      formData: {
        ...state.formData,
        clientSubmissionId:
          state.formData.clientSubmissionId || ensureJobId(),
        selectedValuationMethods: [...state.formData.selectedValuationMethods],
      },
      lots,
      serializedLots: lots.map((lot) => ({
        id: lot.id,
        coverIndex: lot.coverIndex,
        mode: lot.mode,
        mainFiles: lot.files.map(describeFile),
        extraFiles: lot.extraFiles.map(describeFile),
        videoFiles: (lot.videoFiles || []).map(describeFile),
        annotations: lot.annotations ? { ...lot.annotations } : undefined,
      })),
    };
  };

  const saveLocalTier = async (snapshot: DraftSnapshot) => {
    if (!draftStorageKey) throw new Error("Authenticated user is unavailable");
    const envelope: AssetDraftEnvelope = {
      version: FORM_DRAFT_VERSION,
      kind: "asset",
      userId,
      revision: snapshot.revision,
      savedAt: new Date().toISOString(),
      deviceId: getDeviceId(),
      formData: snapshot.formData,
      lots: snapshot.lots.map((lot) => ({
        ...lot,
        files: [...lot.files],
        extraFiles: [...lot.extraFiles],
        videoFiles: [...(lot.videoFiles || [])],
        annotations: lot.annotations ? { ...lot.annotations } : undefined,
      })),
      mediaMetadata: listDraftMediaLocations(snapshot.lots),
    };
    await saveScopedDraft(envelope, draftScopeId);
    return null;
  };

  const saveServerTier = async (snapshot: DraftSnapshot) => {
    // Mongo is the portable source of truth for text and lot structure. The
    // original, potentially very large media files stay in IndexedDB.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await ReportDraftService.upsert({
          clientDraftId: draftScopeId,
          kind: "asset",
          storageMode: "local_media",
          revision: snapshot.revision,
          deviceId: getReportDraftDeviceId(),
          contractNo: snapshot.formData.contractNo,
          title:
            snapshot.formData.clientName ||
            snapshot.formData.contractNo ||
            "Asset report draft",
          formData: snapshot.formData,
          lots: serializeReportDraftLots(snapshot.lots),
          media: buildReportDraftMediaManifest(snapshot.lots),
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  const saveRevision = async (revision: number) => {
    if (autoSaveBlockedRef.current || !userId) return;
    const snapshot = makeSnapshot(revision);
    publishDraftStatus("saving", "Saving draft…");
    const [localResult, serverResult] = await Promise.allSettled([
      saveLocalTier(snapshot),
      saveServerTier(snapshot),
    ]);
    const localSaved = localResult.status === "fulfilled";
    const serverSaved = serverResult.status === "fulfilled";
    accountSyncPendingRef.current = !serverSaved;
    const localWarning =
      localResult.status === "fulfilled" ? localResult.value : null;
    const failures = [localResult, serverResult]
      .filter((result) => result.status === "rejected")
      .map((result) =>
        result.status === "rejected"
          ? result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
          : ""
      );

    if (!localSaved && localResult.status === "rejected") {
      const storageFailure = storageErrorMessage(localResult.reason);
      if (!failures.some((message) => message === storageFailure)) {
        failures.unshift(storageFailure);
      }
    }

    if (localSaved || serverSaved) {
      committedRevisionRef.current = Math.max(
        committedRevisionRef.current,
        revision
      );
    }

    if (revision !== saveRevisionRef.current || autoSaveBlockedRef.current) {
      return;
    }

    if (localSaved && serverSaved && !localWarning) {
      setDraftGuidance(null);
      publishDraftStatus(
        "saved",
        "Draft saved - manual photos stored on this device"
      );
      return;
    }

    if (localSaved || serverSaved) {
      const message =
        localWarning ||
        failures.join(" ") ||
        (localSaved
          ? "Saved on this device, but cross-device sync is unavailable."
          : "Synced to your account, but browser storage is unavailable.");
      setDraftGuidance({ tone: "warning", message });
      publishDraftStatus("partial", "Draft partially saved");
      return;
    }

    const message =
      failures.join(" ") ||
      "The draft could not be saved. Keep this tab open and try Save Draft again.";
    setDraftGuidance({ tone: "error", message });
    publishDraftStatus("error", "Draft not saved");
  };

  const requestDraftSave = (revision: number) => {
    if (autoSaveBlockedRef.current || !userId) return Promise.resolve();
    if (saveInFlightRef.current) {
      queuedRevisionRef.current = Math.max(queuedRevisionRef.current, revision);
      return saveInFlightRef.current;
    }

    const run = async () => {
      let target = revision;
      while (target > 0 && !autoSaveBlockedRef.current) {
        queuedRevisionRef.current = 0;
        await saveRevision(target);
        const queued = queuedRevisionRef.current;
        if (!queued || queued <= target) break;
        target = queued;
      }
    };
    const promise = run().finally(() => {
      saveInFlightRef.current = null;
      const queued = queuedRevisionRef.current;
      if (
        queued > committedRevisionRef.current &&
        !autoSaveBlockedRef.current
      ) {
        void requestDraftSave(queued);
      }
    });
    saveInFlightRef.current = promise;
    return promise;
  };

  const scheduleDraftSave = (revision: number) => {
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      void requestDraftSave(revision);
    }, 2000);
  };

  const saveDraftNow = async () => {
    if (submitting || !userId) return;
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    const revision = Math.max(saveRevisionRef.current + 1, 1);
    saveRevisionRef.current = revision;
    publishDraftStatus("dirty", "Unsaved changes");
    await requestDraftSave(revision);
  };

  retryAccountSyncRef.current = () => {
    if (!accountSyncPendingRef.current || autoSaveBlockedRef.current || !userId) {
      return;
    }
    const revision = Math.max(saveRevisionRef.current + 1, 1);
    saveRevisionRef.current = revision;
    publishDraftStatus("saving", "Connection restored - syncing draft...");
    void requestDraftSave(revision);
  };

  useEffect(() => {
    const handleOnline = () => retryAccountSyncRef.current();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => {
    if (!draftHydrated || autoSaveBlockedRef.current || !userId) return;
    if (lastFingerprintRef.current === null) {
      lastFingerprintRef.current = draftFingerprint;
      return;
    }
    if (lastFingerprintRef.current === draftFingerprint) return;
    lastFingerprintRef.current = draftFingerprint;
    const revision = saveRevisionRef.current + 1;
    saveRevisionRef.current = revision;
    publishDraftStatus("dirty", "Unsaved changes");
    scheduleDraftSave(revision);
  }, [draftFingerprint, draftHydrated, userId]);

  useEffect(
    () => () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    },
    []
  );

  const restoreFormFields = (formData: Partial<AssetDraftFormData>) => {
    if (typeof formData.clientSubmissionId === "string" && formData.clientSubmissionId) {
      jobIdRef.current = formData.clientSubmissionId;
    }
    if (typeof formData.clientName === "string") setClientName(formData.clientName);
    if (typeof formData.effectiveDate === "string") setEffectiveDate(formData.effectiveDate);
    if (typeof formData.appraisalPurpose === "string") setAppraisalPurpose(formData.appraisalPurpose);
    if (typeof formData.ownerName === "string") setOwnerName(formData.ownerName);
    if (typeof formData.appraiser === "string") setAppraiser(formData.appraiser);
    if (typeof formData.appraisalCompany === "string") setAppraisalCompany(formData.appraisalCompany);
    if (typeof formData.industry === "string") setIndustry(formData.industry);
    if (typeof formData.inspectionDate === "string") setInspectionDate(formData.inspectionDate);
    if (typeof formData.location === "string") setLocation(formData.location);
    if (isValidBrowserCoordinates(formData.latitude, formData.longitude)) {
      setLatitude(Number(formData.latitude));
      setLongitude(Number(formData.longitude));
      setLocationStatus("Current location detected");
    } else {
      setLatitude(null);
      setLongitude(null);
    }
    if (typeof formData.contractNo === "string") setContractNo(formData.contractNo);
    if (formData.language === "en" || formData.language === "fr" || formData.language === "es") {
      setLanguage(formData.language);
    }
    if (typeof formData.currency === "string") setCurrency(formData.currency);
    if (typeof formData.includeValuationTable === "boolean") {
      setIncludeValuationTable(formData.includeValuationTable);
    }
    if (Array.isArray(formData.selectedValuationMethods)) {
      setSelectedValuationMethods(formData.selectedValuationMethods);
    }
    if (typeof formData.includeDamageAnalysis === "boolean") {
      setIncludeDamageAnalysis(formData.includeDamageAnalysis);
    }
    if (typeof formData.bankPhotosEnabled === "boolean") {
      setBankPhotosEnabled(formData.bankPhotosEnabled);
    }
    if (typeof formData.preparedFor === "string") setPreparedFor(formData.preparedFor);
    if (typeof formData.factorsAgeCondition === "string") setFactorsAgeCondition(formData.factorsAgeCondition);
    if (typeof formData.factorsQuality === "string") setFactorsQuality(formData.factorsQuality);
    if (typeof formData.factorsAnalysis === "string") setFactorsAnalysis(formData.factorsAnalysis);
  };

  const restoreLocalDraft = async (): Promise<boolean> => {
    if (!draftStorageKey) return false;
    await requestDurableDraftStorage();
    let envelope: AssetDraftEnvelope | null = null;
    let missingMediaCount = 0;
    const durable = await loadScopedDraft<AssetDraftEnvelope>(
      userId,
      "asset",
      draftScopeId
    );

    if (durable) {
      envelope = durable.envelope;
      missingMediaCount = durable.missingMediaCount;
    } else {
      const raw = localStorage.getItem(draftStorageKey);
      if (!raw) return false;
      let legacy: LegacyAssetDraftEnvelope;
      try {
        legacy = parseScopedDraftEnvelope<LegacyAssetDraftEnvelope>(raw, {
          userId,
          kind: "asset",
        });
      } catch {
        setDraftGuidance({
          tone: "error",
          message:
            "The local draft is corrupted and was not loaded. A server copy will be tried if available.",
        });
        publishDraftStatus("error", "Local draft is corrupted");
        return false;
      }

      const restoredLots: MixedLot[] = [];
      for (const lotMeta of legacy.lots || []) {
        const restoreBucket = async (type: LocalDraftMedia["type"]) => {
          const files: File[] = [];
          for (const media of (legacy.media || []).filter(
            (item) => item.lotId === lotMeta.id && item.type === type
          )) {
            try {
              files.push(await dataUrlToFile(media));
            } catch {
              missingMediaCount += 1;
            }
          }
          return files;
        };
        restoredLots.push({
          id: lotMeta.id,
          files: await restoreBucket("main"),
          extraFiles: await restoreBucket("extra"),
          videoFiles: await restoreBucket("video"),
          coverIndex: lotMeta.coverIndex || 0,
          mode: lotMeta.mode,
          annotations: lotMeta.annotations || {},
        });
      }

      envelope = {
        version: FORM_DRAFT_VERSION,
        kind: "asset",
        userId,
        revision: legacy.revision || 0,
        savedAt: legacy.savedAt || new Date().toISOString(),
        deviceId: legacy.deviceId || getDeviceId(),
        formData: legacy.formData,
        lots: restoredLots,
        mediaMetadata: listDraftMediaLocations(restoredLots),
      };

      // A complete v2 draft is removed only after v3 can be written and read
      // back with every media object intact.
      if (missingMediaCount === 0) {
        await saveScopedDraft(envelope, draftScopeId);
        const verified = await loadScopedDraft<AssetDraftEnvelope>(
          userId,
          "asset",
          draftScopeId
        );
        if (!verified || verified.missingMediaCount > 0) {
          throw new Error("The migrated asset draft could not be verified.");
        }
        envelope = verified.envelope;
        localStorage.removeItem(draftStorageKey);
      }
    }

    const restoredLots = Array.isArray(envelope.lots) ? envelope.lots : [];
    applyDraftMediaLocations(restoredLots, envelope.mediaMetadata);
    envelope.mediaMetadata = listDraftMediaLocations(restoredLots);
    restoreFormFields(envelope.formData || {});
    setMixedLots(restoredLots);
    saveRevisionRef.current = envelope.revision || 0;
    committedRevisionRef.current = envelope.revision || 0;
    if (missingMediaCount) {
      setDraftGuidance({
        tone: "warning",
        message: `${missingMediaCount} media file${
          missingMediaCount === 1 ? "" : "s"
        } could not be restored. All available fields and media were retained.`,
      });
      publishDraftStatus("partial", "Draft restored with missing media");
    } else {
      publishDraftStatus("saved", "Draft restored");
    }
    return true;
  };

  const restoreAccountDraft = async (): Promise<boolean> => {
    if (!resumeDraft || !userId) return false;

    // The same browser has the full original files in IndexedDB. Prefer that
    // exact revision before falling back to portable Mongo metadata.
    if (await restoreLocalDraft()) return true;

    const formData = resumeDraft.formData || {};
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = formData[key];
        if (candidate !== undefined && candidate !== null) return candidate;
      }
      return undefined;
    };
    const textValue = (...keys: string[]) => {
      const candidate = value(...keys);
      return typeof candidate === "string" ? candidate : undefined;
    };
    const booleanValue = (...keys: string[]) => {
      const candidate = value(...keys);
      return typeof candidate === "boolean" ? candidate : undefined;
    };
    const numberValue = (...keys: string[]) => {
      const candidate = value(...keys);
      return typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : null;
    };
    const selectedMethods = value(
      "selectedValuationMethods",
      "valuation_methods"
    );
    const normalizedMethods = Array.isArray(selectedMethods)
      ? selectedMethods.filter(
          (method): method is ValuationMethod =>
            method === "FML" ||
            method === "TKV" ||
            method === "OLV" ||
            method === "FLV"
        )
      : undefined;
    const languageValue = value("language");
    const normalizedLanguage =
      languageValue === "fr" || languageValue === "es"
        ? languageValue
        : "en";

    restoreFormFields({
      clientSubmissionId: resumeDraft.clientDraftId,
      clientName: textValue("clientName", "client_name"),
      effectiveDate: textValue("effectiveDate", "effective_date"),
      appraisalPurpose: textValue(
        "appraisalPurpose",
        "appraisal_purpose"
      ),
      ownerName: textValue("ownerName", "owner_name"),
      preparedFor: textValue("preparedFor", "prepared_for"),
      appraiser: textValue("appraiser"),
      appraisalCompany: textValue(
        "appraisalCompany",
        "appraisal_company"
      ),
      industry: textValue("industry"),
      inspectionDate: textValue("inspectionDate", "inspection_date"),
      location: textValue("location"),
      latitude: numberValue("latitude"),
      longitude: numberValue("longitude"),
      contractNo:
        textValue("contractNo", "contract_no") || resumeDraft.contractNo,
      language: normalizedLanguage,
      currency: textValue("currency"),
      includeValuationTable: booleanValue(
        "includeValuationTable",
        "include_valuation_table"
      ),
      selectedValuationMethods: normalizedMethods,
      includeDamageAnalysis: booleanValue(
        "includeDamageAnalysis",
        "include_damage_analysis"
      ),
      bankPhotosEnabled: booleanValue(
        "bankPhotosEnabled",
        "bank_photos_enabled"
      ),
      factorsAgeCondition: textValue(
        "factorsAgeCondition",
        "factors_age_condition"
      ),
      factorsQuality: textValue("factorsQuality", "factors_quality"),
      factorsAnalysis: textValue("factorsAnalysis", "factors_analysis"),
    });

    const restoredLots: MixedLot[] =
      resumeDraft.storageMode === "smart_upload"
        ? []
        : (resumeDraft.lots || []).map((entry, index) => {
            const lot = (entry || {}) as Partial<MixedLot>;
            return {
              ...lot,
              id: String(lot.id || `lot-${index + 1}`),
              files: [],
              extraFiles: [],
              videoFiles: [],
              coverIndex: Number(lot.coverIndex || 0),
              annotations: lot.annotations || {},
            } as MixedLot;
          });
    setMixedLots(restoredLots);
    jobIdRef.current = resumeDraft.clientDraftId;
    saveRevisionRef.current = resumeDraft.revision || 0;
    committedRevisionRef.current = resumeDraft.revision || 0;

    if (resumeDraft.storageMode === "smart_upload") {
      setDraftGuidance(null);
      setSmartUploadOpen(true);
      publishDraftStatus("saved", "Smart Upload restored");
    } else {
      const missingCount = Array.isArray(resumeDraft.media)
        ? resumeDraft.media.length
        : 0;
      setDraftGuidance({
        tone: "warning",
        message: missingCount
          ? `${missingCount} original file${missingCount === 1 ? " is" : "s are"} stored on the browser where this draft was created. The report details and lot structure were restored; use that browser to continue with all photos.`
          : "The report details and lot structure were restored. No local media was found for this browser.",
      });
      publishDraftStatus("partial", "Text restored - media unavailable here");
    }
    return true;
  };

  useEffect(() => {
    if (
      !userId ||
      !draftStorageKey ||
      mountRestoreStartedRef.current ||
      (!resumeDraft && !restoreDraftOnMount)
    ) {
      setDraftHydrated(true);
      return;
    }
    mountRestoreStartedRef.current = true;
    let cancelled = false;
    setDraftHydrated(false);
    lastFingerprintRef.current = null;
    void (async () => {
      let restored = false;
      try {
        restored = resumeDraft
          ? await restoreAccountDraft()
          : await restoreLocalDraft();
        if (restored && !cancelled) toast.info("Your asset draft was restored.");
      } catch (restoreError) {
        if (!cancelled) {
          setDraftGuidance({
            tone: "error",
            message:
              restoreError instanceof Error
                ? restoreError.message
                : "The draft could not be restored.",
          });
          publishDraftStatus("error", "Draft restore failed");
        }
      } finally {
        if (!cancelled) {
          setDraftHydrated(true);
          lastFingerprintRef.current = null;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftStorageKey, restoreDraftOnMount, resumeDraft, userId]);

  useEffect(() => {
    if (!appraiser && user?.username) setAppraiser(user.username);
    if (!appraisalCompany && user?.companyName) {
      setAppraisalCompany(user.companyName);
    }
  }, [user, appraiser, appraisalCompany]);

  const applyLocaleFallbackCurrency = () => {
    const languageTag = navigator.language || "en-CA";
    const region = (languageTag.split("-")[1] || "").toUpperCase();
    const currencies: Record<string, string> = {
      US: "USD", CA: "CAD", GB: "GBP", AU: "AUD", NZ: "NZD",
      IN: "INR", LK: "LKR", JP: "JPY", CN: "CNY", SG: "SGD",
      AE: "AED", SA: "SAR", ZA: "ZAR", NG: "NGN", PH: "PHP",
      MY: "MYR", TH: "THB", ID: "IDR", KR: "KRW", HK: "HKD",
      AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", TR: "TRY",
      EG: "EGP", KE: "KES", GH: "GHS", VN: "VND", FR: "EUR",
      DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", IE: "EUR",
      PT: "EUR", BE: "EUR",
    };
    if (!currencyTouched) setCurrency((current) => current || currencies[region] || "CAD");
  };

  const applyCurrentPosition = (position: GeolocationPosition) => {
    const nextLatitude = position.coords?.latitude;
    const nextLongitude = position.coords?.longitude;
    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setLocationStatus("Latitude and longitude could not be detected");
      return null;
    }
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setLocation(CURRENT_BROWSER_LOCATION_LABEL);
    setLocationStatus("Current location detected");
    return { latitude: nextLatitude, longitude: nextLongitude };
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Browser location access is unavailable");
      return;
    }
    setLocationStatus("Detecting current location…");
    navigator.geolocation.getCurrentPosition(
      applyCurrentPosition,
      () => setLocationStatus("Browser location access was denied or is unavailable"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  useEffect(() => {
    if (auctioneer) {
      setCurrencyLoading(false);
      return;
    }
    if (currencyPromptedRef.current || currencyTouched) return;
    currencyPromptedRef.current = true;
    setCurrencyLoading(true);
    if (!navigator.geolocation) {
      applyLocaleFallbackCurrency();
      setCurrencyLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const coordinates = applyCurrentPosition(position);
          if (!coordinates) return applyLocaleFallbackCurrency();
          const response = await fetch("/api/ai/currency", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: coordinates.latitude,
              lng: coordinates.longitude,
            }),
          });
          if (!response.ok) return applyLocaleFallbackCurrency();
          const data = await response.json();
          const detected = String(data?.currency || "").toUpperCase();
          if (!currencyTouched && /^[A-Z]{3}$/.test(detected)) {
            setCurrency(detected);
          } else {
            applyLocaleFallbackCurrency();
          }
        } catch {
          applyLocaleFallbackCurrency();
        } finally {
          setCurrencyLoading(false);
        }
      },
      () => {
        setLocationStatus("Browser location access was denied or is unavailable");
        applyLocaleFallbackCurrency();
        setCurrencyLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, [auctioneer, currencyTouched]);

  const resetForm = () => {
    setClientName(auctioneer?.contract.customerName || "");
    setEffectiveDate(importedEventDate);
    setAppraisalPurpose(
      auctioneer ? "Auction listing and condition report" : ""
    );
    setOwnerName(auctioneer?.contract.customerName || "");
    setPreparedFor(auctioneer?.contract.customerName || "");
    setAppraiser(user?.username || "");
    setAppraisalCompany(user?.companyName || "");
    setIndustry(auctioneerIndustry(auctioneer));
    setInspectionDate(isoDate(new Date()));
    setLocation(importedLocation);
    setLatitude(null);
    setLongitude(null);
    setLocationStatus(
      auctioneer ? "Imported from Auctioneer" : "Detecting current location…"
    );
    setContractNo(auctioneer?.contract.contractNo || "");
    setLanguage("en");
    setCurrency(auctioneer ? "CAD" : "");
    setCurrencyTouched(Boolean(auctioneer));
    setCurrencyLoading(false);
    currencyPromptedRef.current = false;
    setIncludeDamageAnalysis(true);
    setBankPhotosEnabled(false);
    setFactorsAgeCondition("");
    setFactorsQuality("");
    setFactorsAnalysis("");
    setIncludeValuationTable(false);
    setSelectedValuationMethods(["FML"]);
    setMixedLots(buildAuctioneerSeedLots(auctioneer));
    setErrors({});
    setError(null);
    setUploadProgress(0);
    setUploadStats(null);
    setOpenSections(new Set(["report", "media"]));
    jobIdRef.current =
      auctioneer?.clientSubmissionId ||
      (auctioneer ? `auctioneer-${auctioneer.workItemId}` : null);
    forceNewSubmissionRef.current = false;
  };

  const clearDraftStorage = async () => {
    let deleteError: unknown;
    const localResults = await Promise.allSettled([
      deleteScopedDraft(userId, "asset", draftScopeId),
      deleteSmartUploadDraft(userId, "asset", draftScopeId),
    ]);
    const localFailure = localResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (localFailure) deleteError = localFailure.reason;
    if (draftStorageKey) localStorage.removeItem(draftStorageKey);
    try {
      await ReportDraftService.deleteByClientId(draftScopeId, "asset");
      accountSyncPendingRef.current = false;
    } catch (serverDeleteError: any) {
      if (serverDeleteError?.response?.status !== 404) {
        deleteError ||= serverDeleteError;
      }
    }
    if (deleteError) throw deleteError;
  };

  const discardDraft = async () => {
    setDiscarding(true);
    autoSaveBlockedRef.current = true;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    if (saveInFlightRef.current) await saveInFlightRef.current;
    try {
      saveRevisionRef.current += 1;
      await clearDraftStorage();
      resetForm();
      setDraftGuidance(null);
      setDiscardOpen(false);
      publishDraftStatus("dirty", "No draft saved");
      toast.info("Draft discarded.");
      setDraftHydrated(false);
      lastFingerprintRef.current = null;
      window.setTimeout(() => {
        setDraftHydrated(true);
        lastFingerprintRef.current = null;
        autoSaveBlockedRef.current = false;
      }, 0);
    } catch (discardError) {
      autoSaveBlockedRef.current = false;
      setDraftGuidance({
        tone: "error",
        message:
          discardError instanceof Error
            ? discardError.message
            : "The draft could not be discarded.",
      });
      publishDraftStatus("error", "Draft was not discarded");
    } finally {
      setDiscarding(false);
    }
  };

  const saveInputs = async () => {
    setMoreAnchor(null);
    try {
      const baseName = clientName.trim() || "Unnamed";
      const dateLabel = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const formData: AssetFormData = {
        clientName,
        effectiveDate,
        appraisalPurpose,
        ownerName,
        appraiser,
        appraisalCompany,
        industry,
        inspectionDate,
        location,
        latitude: latitude ?? undefined,
        longitude: longitude ?? undefined,
        contractNo,
        language,
        currency,
        includeValuationTable,
        selectedValuationMethods,
        includeDamageAnalysis,
        bankPhotosEnabled,
        groupingMode: "mixed",
        preparedFor,
        factorsAgeCondition,
        factorsQuality,
        factorsAnalysis,
      };
      await SavedInputService.create({
        name: `${baseName} - ${dateLabel}`,
        formType: "asset",
        formData,
      });
      toast.success("Reusable input saved.");
    } catch (saveError: any) {
      toast.error(saveError?.response?.data?.message || "Failed to save reusable input");
    }
  };

  const loadSavedInput = (savedInput: SavedInput) => {
    try {
      const data = savedInput.formData as AssetFormData;
      if (!data) return;
      restoreFormFields({
        clientName: data.clientName,
        effectiveDate: data.effectiveDate,
        appraisalPurpose: data.appraisalPurpose,
        ownerName: data.ownerName,
        appraiser: data.appraiser,
        appraisalCompany: data.appraisalCompany,
        industry: data.industry,
        inspectionDate: data.inspectionDate,
        location: data.location,
        latitude: data.latitude,
        longitude: data.longitude,
        contractNo: data.contractNo,
        language: data.language,
        currency: data.currency,
        includeValuationTable: data.includeValuationTable,
        selectedValuationMethods: data.selectedValuationMethods,
        includeDamageAnalysis: data.includeDamageAnalysis,
        bankPhotosEnabled: data.bankPhotosEnabled,
        preparedFor: data.preparedFor,
        factorsAgeCondition: data.factorsAgeCondition,
        factorsQuality: data.factorsQuality,
        factorsAnalysis: data.factorsAnalysis,
      });
      setOpenSections((current) => new Set(current).add("report"));
      toast.success(`Loaded: ${savedInput.name}`);
    } catch {
      toast.error("Failed to load saved input");
    }
  };

  useImperativeHandle(ref, () => ({ loadSavedInput }));

  useEffect(() => {
    if (auctioneer) return;
    const handler = (event: Event) => {
      const savedInput = (event as CustomEvent<SavedInput>).detail;
      if (savedInput) loadSavedInput(savedInput);
    };
    window.addEventListener("load-saved-input", handler);
    return () => window.removeEventListener("load-saved-input", handler);
  }, [auctioneer]);

  const validateForm = ({
    requireMedia = true,
    actionLabel = "creating the report",
  }: {
    requireMedia?: boolean;
    actionLabel?: string;
  } = {}) => {
    const nextErrors: Record<string, string> = {};
    if (!clientName.trim()) nextErrors.clientName = "Client name is required.";
    if (!effectiveDate) nextErrors.effectiveDate = "Effective date is required.";
    if (!appraisalPurpose.trim()) nextErrors.appraisalPurpose = "Appraisal purpose is required.";
    if (!appraiser.trim()) nextErrors.appraiser = "Appraiser is required.";
    if (!/^[A-Z]{3}$/.test(currency)) nextErrors.currency = "Enter a three-letter ISO code, such as CAD.";
    if (includeValuationTable && selectedValuationMethods.length === 0) {
      nextErrors.valuationMethods = "Select at least one valuation method.";
    }
    if (requireMedia) {
      const photoCount = mixedLots.reduce(
        (total, lot) => total + lot.files.length + lot.extraFiles.length,
        0
      );
      if (!mixedLots.length || photoCount === 0) {
        nextErrors.media = "Add at least one lot with a main photo.";
      } else if (
        mixedLots.some(
          (lot) =>
            !lot.mode ||
            lot.files.length === 0 ||
            lot.files.length + lot.extraFiles.length > MAX_ASSET_LOT_PHOTOS
        )
      ) {
        nextErrors.media = `Every lot needs a mode and a main photo, with no more than ${MAX_ASSET_LOT_PHOTOS} main and report-only photos combined.`;
      }
    }
    setErrors(nextErrors);
    if (!Object.keys(nextErrors).length) return true;

    const firstKey = [
      "clientName",
      "effectiveDate",
      "appraisalPurpose",
      "appraiser",
      "currency",
      "valuationMethods",
      "media",
    ].find((key) => nextErrors[key]);
    const section: SectionId =
      firstKey === "valuationMethods"
        ? "comparison"
        : firstKey === "media"
          ? "media"
          : "report";
    setOpenSections((current) => new Set(current).add(section));
    setError(`Review the highlighted fields before ${actionLabel}.`);
    toast.error("Please fix the highlighted fields.");
    window.setTimeout(() => {
      const target =
        firstKey === "media"
          ? document.getElementById("asset-media-workspace")
          : document.getElementById(`asset-${firstKey}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return false;
  };

  const dispatchReportCreated = () => {
    if (createdEventDispatchedRef.current) return;
    createdEventDispatchedRef.current = true;
    window.dispatchEvent(new Event("cv:report-created"));
  };

  const smartUploadDetails = useMemo<Record<string, unknown>>(
    () => ({
      grouping_mode: "mixed",
      smart_upload: true,
      client_name: clientName.trim(),
      effective_date: effectiveDate,
      appraisal_purpose: appraisalPurpose.trim(),
      ...(ownerName.trim() && { owner_name: ownerName.trim() }),
      appraiser: appraiser.trim(),
      ...(appraisalCompany.trim() && {
        appraisal_company: appraisalCompany.trim(),
      }),
      ...(industry.trim() && { industry: industry.trim() }),
      ...(inspectionDate && { inspection_date: inspectionDate }),
      location: location.trim() || CURRENT_BROWSER_LOCATION_LABEL,
      ...(isValidBrowserCoordinates(latitude, longitude)
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : {}),
      ...(contractNo.trim() && { contract_no: contractNo.trim() }),
      language,
      currency,
      include_valuation_table: includeValuationTable,
      valuation_methods: includeValuationTable
        ? selectedValuationMethods
        : [],
      include_damage_analysis: includeDamageAnalysis,
      bank_photos_enabled: bankPhotosEnabled,
      force_new: forceNewSubmissionRef.current,
      ...(auctioneer && {
        auctioneer_work_item_id: auctioneer.workItemId,
      }),
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
    }),
    [
      appraisalCompany,
      appraisalPurpose,
      appraiser,
      auctioneer,
      bankPhotosEnabled,
      clientName,
      contractNo,
      currency,
      effectiveDate,
      factorsAgeCondition,
      factorsAnalysis,
      factorsQuality,
      includeDamageAnalysis,
      includeValuationTable,
      industry,
      inspectionDate,
      language,
      latitude,
      location,
      longitude,
      ownerName,
      preparedFor,
      selectedValuationMethods,
    ]
  );

  const openSmartUploadWorkspace = () => {
    if (mixedLots.length > 0) {
      toast.info(
        "Smart Upload starts with an empty media form. Clear the manually created lots first."
      );
      return;
    }
    if (
      !validateForm({
        requireMedia: false,
        actionLabel: "starting Smart Upload",
      })
    ) {
      return;
    }
    setError(null);
    setSmartUploadOpen(true);
  };

  const handleSmartUploadSubmitted = async () => {
    const accepted =
      "Smart Upload accepted - preview processing continues in My Reports.";
    setSmartUploadOpen(false);
    setAcceptedMessage(accepted);
    toast.success(accepted);
    autoSaveBlockedRef.current = true;
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    if (saveInFlightRef.current) await saveInFlightRef.current;
    saveRevisionRef.current += 1;
    const cleanupError = await clearDraftStorage()
      .then(() => null)
      .catch((draftError) => draftError);
    createdEventDispatchedRef.current = false;
    dispatchReportCreated();
    setDraftHydrated(false);
    resetForm();
    setAcceptedMessage(null);
    forceNewSubmissionRef.current = false;
    publishDraftStatus("saved", "Smart Upload accepted");
    if (cleanupError) {
      toast.warning(
        "The report was accepted, but its previous manual draft could not be removed."
      );
    }
    onSuccess?.(accepted);
    window.setTimeout(() => {
      lastFingerprintRef.current = null;
      createdEventDispatchedRef.current = false;
      autoSaveBlockedRef.current = false;
      setDraftHydrated(true);
    }, 0);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const uploadTimeRemaining = () => {
    if (!uploadStats?.uploadedBytes) return "Calculating…";
    const elapsedSeconds = Math.max(0.1, (Date.now() - uploadStats.startTime) / 1000);
    const bytesPerSecond = uploadStats.uploadedBytes / elapsedSeconds;
    const remainingSeconds = Math.ceil(
      (uploadStats.totalSize - uploadStats.uploadedBytes) / bytesPerSecond
    );
    if (remainingSeconds < 60) return `About ${remainingSeconds}s remaining`;
    return `About ${Math.ceil(remainingSeconds / 60)}m remaining`;
  };

  async function onSubmit(event?: React.FormEvent) {
    event?.preventDefault();
    if (submitting || !validateForm()) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
    autoSaveBlockedRef.current = true;
    if (saveInFlightRef.current) await saveInFlightRef.current;

    const filesToSend = mixedLots.flatMap((lot) => [
      ...lot.files,
      ...lot.extraFiles,
    ]);
    const videosToSend = mixedLots.flatMap((lot) => lot.videoFiles || []);
    const focusBoxes: NonNullable<AssetCreateDetails["focus_boxes"]> =
      buildMixedFocusBoxes(mixedLots);

    const jobId = ensureJobId();
    const payload = {
      grouping_mode: "mixed",
      client_name: clientName.trim(),
      effective_date: effectiveDate,
      appraisal_purpose: appraisalPurpose.trim(),
      ...(ownerName.trim() && { owner_name: ownerName.trim() }),
      appraiser: appraiser.trim(),
      ...(appraisalCompany.trim() && { appraisal_company: appraisalCompany.trim() }),
      ...(industry.trim() && { industry: industry.trim() }),
      ...(inspectionDate && { inspection_date: inspectionDate }),
      location: location.trim() || CURRENT_BROWSER_LOCATION_LABEL,
      ...(isValidBrowserCoordinates(latitude, longitude)
        ? { latitude: Number(latitude), longitude: Number(longitude) }
        : {}),
      ...(contractNo.trim() && { contract_no: contractNo.trim() }),
      language,
      currency,
      include_valuation_table: includeValuationTable,
      valuation_methods: includeValuationTable ? selectedValuationMethods : [],
      include_damage_analysis: includeDamageAnalysis,
      bank_photos_enabled: bankPhotosEnabled,
      progress_id: jobId,
      client_submission_id: jobId,
      force_new: forceNewSubmissionRef.current,
      ...(auctioneer && {
        auctioneer_work_item_id: auctioneer.workItemId,
      }),
      ...(preparedFor.trim() && { prepared_for: preparedFor.trim() }),
      ...(factorsAgeCondition.trim() && { factors_age_condition: factorsAgeCondition.trim() }),
      ...(factorsQuality.trim() && { factors_quality: factorsQuality.trim() }),
      ...(factorsAnalysis.trim() && { factors_analysis: factorsAnalysis.trim() }),
      mixed_lots: mixedLots.map((lot) => ({
        count: lot.files.length,
        extra_count: lot.extraFiles.length,
        cover_index: Math.max(0, Math.min(lot.files.length - 1, lot.coverIndex || 0)),
        mode: lot.mode!,
        ...(lot.source && {
          source_key: lot.source.key,
          source_lot_id: lot.source.lotId,
          source_submission_id: lot.source.submissionId,
        }),
      })),
      ...(focusBoxes.length ? { focus_boxes: focusBoxes } : {}),
    } as AssetCreateDetails & {
      client_submission_id: string;
      force_new: boolean;
      auctioneer_work_item_id?: string;
    };

    try {
      setSubmitting(true);
      setError(null);
      setAcceptedMessage(null);
      setUploadProgress(0);
      const totalSize = [...filesToSend, ...videosToSend].reduce(
        (sum, file) => sum + file.size,
        0
      );
      setUploadStats({
        totalFiles: filesToSend.length + videosToSend.length,
        totalSize,
        uploadedBytes: 0,
        startTime: Date.now(),
      });

      await AssetService.create(payload, filesToSend, videosToSend, {
        onUploadProgress: (fraction) => {
          const progress = Math.max(0, Math.min(1, fraction));
          setUploadProgress(progress * 100);
          setUploadStats((current) =>
            current
              ? { ...current, uploadedBytes: Math.round(progress * current.totalSize) }
              : current
          );
        },
      });

      setUploadProgress(100);
      const accepted =
        "Submission accepted — processing continues in My Reports.";
      setAcceptedMessage(accepted);
      toast.success(accepted);
      saveRevisionRef.current += 1;
      const cleanupError = await clearDraftStorage()
        .then(() => null)
        .catch((draftError) => draftError);
      dispatchReportCreated();
      setDraftHydrated(false);
      resetForm();
      setAcceptedMessage(null);
      forceNewSubmissionRef.current = false;
      setSubmitting(false);
      publishDraftStatus("saved", "Submission accepted");
      if (cleanupError) {
        toast.warning(
          "Report submitted, but its local draft could not be removed. You can discard the old local copy later."
        );
      }
      onSuccess?.(accepted);
      window.setTimeout(() => {
        lastFingerprintRef.current = null;
        createdEventDispatchedRef.current = false;
        autoSaveBlockedRef.current = false;
        setDraftHydrated(true);
      }, 0);
    } catch (submitError: any) {
      setSubmitting(false);
      autoSaveBlockedRef.current = false;
      if (
        submitError?.response?.status === 409 &&
        submitError?.response?.data?.code === "ACTIVE_REPORT_EXISTS"
      ) {
        setActiveReportConflict(true);
      } else {
        const message =
          submitError?.response?.data?.message ||
          submitError?.message ||
          "Failed to create asset report";
        setError(message);
        toast.error(message);
      }
      const revision = saveRevisionRef.current + 1;
      saveRevisionRef.current = revision;
      publishDraftStatus("dirty", "Submission failed · saving draft");
      await requestDraftSave(revision);
    }
  }

  const reportErrorCount = [
    "clientName",
    "effectiveDate",
    "appraisalPurpose",
    "appraiser",
    "currency",
  ].filter((key) => errors[key]).length;
  const requiredComplete = [
    clientName.trim(),
    effectiveDate,
    appraisalPurpose.trim(),
    appraiser.trim(),
    /^[A-Z]{3}$/.test(currency) ? currency : "",
  ].filter(Boolean).length;
  const mediaTotals = mixedLots.reduce(
    (totals, lot) => ({
      photos: totals.photos + lot.files.length + lot.extraFiles.length,
      videos: totals.videos + (lot.videoFiles || []).length,
    }),
    { photos: 0, videos: 0 }
  );

  return (
    <form
      className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)]"
      onSubmit={onSubmit}
      noValidate
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto grid w-full max-w-5xl gap-4">
          {error ? (
            <FormAlert tone="error" title="Report needs attention" onDismiss={() => setError(null)}>
              {error}
            </FormAlert>
          ) : null}

          {draftGuidance ? (
            <FormAlert
              tone={draftGuidance.tone}
              title={draftGuidance.tone === "error" ? "Draft needs attention" : "Draft saved with limitations"}
              onDismiss={() => setDraftGuidance(null)}
            >
              {draftGuidance.message}
            </FormAlert>
          ) : null}

          {acceptedMessage ? (
            <FormAlert tone="success" title="Submission accepted">
              {acceptedMessage}
            </FormAlert>
          ) : null}

          {submitting && uploadStats ? (
            <FormAlert tone="info" title={`Uploading ${uploadStats.totalFiles} file${uploadStats.totalFiles === 1 ? "" : "s"}`}>
              <div className="mt-2 grid gap-2">
                <div
                  className="h-2 overflow-hidden rounded-full bg-[var(--app-control-border)]"
                  role="progressbar"
                  aria-label="File upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(uploadProgress)}
                >
                  <div
                    className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p>
                  {Math.round(uploadProgress)}% · {formatFileSize(uploadStats.uploadedBytes)} of {formatFileSize(uploadStats.totalSize)} · {uploadTimeRemaining()}
                </p>
                <p>Only upload progress is shown here. Processing continues in My Reports after acceptance.</p>
              </div>
            </FormAlert>
          ) : null}

          {Object.keys(errors).length ? (
            <FormAlert tone="error" title="Review required information">
              {Object.values(errors)[0]}
            </FormAlert>
          ) : null}

          <fieldset disabled={submitting} className="contents">
            <FormSection
              id="asset-report-details"
              sectionNumber={1}
              title="Report Details"
              description="Core information used on the report cover and throughout the appraisal."
              summary={`${requiredComplete} of 5 required fields complete`}
              errorSummary={reportErrorCount ? `${reportErrorCount} field${reportErrorCount === 1 ? "" : "s"} need attention` : undefined}
              status={reportErrorCount ? "error" : requiredComplete === 5 ? "complete" : "incomplete"}
              open={openSections.has("report")}
              onOpenChange={(open) => toggleSection("report", open)}
            >
              <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                <FormField id="asset-clientName" label="Client name" required error={errors.clientName}>
                  <input
                    className={formControlClass}
                    value={clientName}
                    onChange={(event) => {
                      setClientName(event.target.value);
                      clearFieldError("clientName");
                    }}
                    placeholder="Acme Corporation"
                    autoComplete="organization"
                  />
                </FormField>
                <FormField id="asset-effectiveDate" label="Effective date" required error={errors.effectiveDate}>
                  <input
                    type="date"
                    className={formControlClass}
                    value={effectiveDate}
                    readOnly={Boolean(auctioneer)}
                    aria-readonly={Boolean(auctioneer)}
                    onChange={(event) => {
                      setEffectiveDate(event.target.value);
                      clearFieldError("effectiveDate");
                    }}
                  />
                </FormField>
                <FormField id="asset-appraisalPurpose" label="Appraisal purpose" required error={errors.appraisalPurpose}>
                  <input
                    className={formControlClass}
                    value={appraisalPurpose}
                    onChange={(event) => {
                      setAppraisalPurpose(event.target.value);
                      clearFieldError("appraisalPurpose");
                    }}
                    placeholder="Insurance, financing, estate…"
                  />
                </FormField>
                <FormField id="asset-ownerName" label="Owner name">
                  <input
                    className={formControlClass}
                    value={ownerName}
                    onChange={(event) => setOwnerName(event.target.value)}
                    placeholder="Registered owner"
                    autoComplete="name"
                  />
                </FormField>
                <FormField id="asset-preparedFor" label="Prepared for">
                  <input
                    className={formControlClass}
                    value={preparedFor}
                    onChange={(event) => setPreparedFor(event.target.value)}
                    placeholder="Contact or organization"
                  />
                </FormField>
                <FormField id="asset-appraiser" label="Appraiser" required error={errors.appraiser}>
                  <input
                    className={formControlClass}
                    value={appraiser}
                    onChange={(event) => {
                      setAppraiser(event.target.value);
                      clearFieldError("appraiser");
                    }}
                    placeholder="Appraiser name"
                    autoComplete="name"
                  />
                </FormField>
                <FormField id="asset-appraisalCompany" label="Appraisal company">
                  <input
                    className={formControlClass}
                    value={appraisalCompany}
                    onChange={(event) => setAppraisalCompany(event.target.value)}
                    placeholder="Company name"
                    autoComplete="organization"
                  />
                </FormField>
                <FormField id="asset-industry" label="Industry">
                  <input
                    className={formControlClass}
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    placeholder="Manufacturing"
                  />
                </FormField>
                <FormField id="asset-inspectionDate" label="Inspection date">
                  <input
                    type="date"
                    className={formControlClass}
                    value={inspectionDate}
                    onChange={(event) => setInspectionDate(event.target.value)}
                  />
                </FormField>
                <FormField id="asset-contractNo" label="Contract number">
                  <input
                    className={formControlClass}
                    value={contractNo}
                    readOnly={Boolean(auctioneer)}
                    aria-readonly={Boolean(auctioneer)}
                    onChange={(event) => setContractNo(event.target.value)}
                    placeholder="CN-2026-001"
                  />
                </FormField>
                <FormField id="asset-language" label="Report language">
                  <select
                    className={formSelectClass}
                    value={language}
                    onChange={(event) => setLanguage(event.target.value as "en" | "fr" | "es")}
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                    <option value="es">Español</option>
                  </select>
                </FormField>
                <FormField
                  id="asset-currency"
                  label="Currency"
                  required
                  hint="Three-letter ISO code"
                  error={errors.currency}
                  labelAction={currencyLoading ? "Detecting…" : undefined}
                >
                  <input
                    className={formControlClass}
                    value={currency}
                    onChange={(event) => {
                      setCurrencyTouched(true);
                      setCurrency(event.target.value.toUpperCase().slice(0, 3));
                      clearFieldError("currency");
                    }}
                    placeholder="CAD"
                    inputMode="text"
                    maxLength={3}
                  />
                </FormField>
                <FormField
                  id="asset-location"
                  label="Inspection location"
                  hint={locationStatus}
                  className="sm:col-span-2"
                  labelAction={
                    <button type="button" className="font-semibold text-[var(--app-accent)] hover:underline" onClick={requestCurrentLocation}>
                      Re-detect
                    </button>
                  }
                >
                  <input
                    className={formControlClass}
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  />
                </FormField>
                <div className="rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel-alt)] px-3.5 py-3">
                  <FormSwitch
                    id="asset-bankPhotos"
                    checked={bankPhotosEnabled}
                    onChange={(event) => setBankPhotosEnabled(event.target.checked)}
                    label="Bank package"
                    description="Include all photos in the client report."
                  />
                </div>
              </div>
            </FormSection>

            <FormSection
              id="asset-factors"
              sectionNumber={2}
              title="Factors Affecting Value"
              description="Optional context that helps explain condition, quality, and the overall valuation."
              summary={factorsAgeCondition || factorsQuality || factorsAnalysis ? "Additional context added" : "Optional"}
              status={factorsAgeCondition || factorsQuality || factorsAnalysis ? "complete" : "default"}
              open={openSections.has("factors")}
              onOpenChange={(open) => toggleSection("factors", open)}
            >
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel-alt)] px-4 py-3 lg:col-span-3">
                  <FormSwitch
                    id="asset-damage-analysis"
                    checked={includeDamageAnalysis}
                    onChange={(event) => setIncludeDamageAnalysis(event.target.checked)}
                    label="Damage analysis"
                    description="Analyze damage for lot numbers up to and including 1000. Higher lot numbers are excluded automatically."
                  />
                </div>
                <FormField id="asset-factors-age" label="Age and condition">
                  <textarea
                    className={formTextareaClass}
                    rows={4}
                    value={factorsAgeCondition}
                    onChange={(event) => setFactorsAgeCondition(event.target.value)}
                    placeholder="Describe age, wear, maintenance, and condition…"
                  />
                </FormField>
                <FormField id="asset-factors-quality" label="Quality">
                  <textarea
                    className={formTextareaClass}
                    rows={4}
                    value={factorsQuality}
                    onChange={(event) => setFactorsQuality(event.target.value)}
                    placeholder="Describe materials, workmanship, or build quality…"
                  />
                </FormField>
                <FormField id="asset-factors-analysis" label="Overall analysis">
                  <textarea
                    className={formTextareaClass}
                    rows={4}
                    value={factorsAnalysis}
                    onChange={(event) => setFactorsAnalysis(event.target.value)}
                    placeholder="Add relevant market or valuation context…"
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection
              id="asset-comparison"
              sectionNumber={3}
              title="Quick Comparison Table"
              description="Optionally add a comparison of supported valuation methods to the report."
              summary={includeValuationTable ? `${selectedValuationMethods.length} method${selectedValuationMethods.length === 1 ? "" : "s"} selected` : "Not included"}
              errorSummary={errors.valuationMethods}
              status={errors.valuationMethods ? "error" : includeValuationTable ? "complete" : "default"}
              open={openSections.has("comparison")}
              onOpenChange={(open) => toggleSection("comparison", open)}
            >
              <div className="grid gap-5">
                <div className="rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel-alt)] px-4 py-3">
                  <FormSwitch
                    id="asset-include-comparison"
                    checked={includeValuationTable}
                    onChange={(event) => {
                      setIncludeValuationTable(event.target.checked);
                      clearFieldError("valuationMethods");
                    }}
                    label="Include comparison table"
                    description="Show selected valuation methods with report-ready explanations."
                  />
                </div>
                {includeValuationTable ? (
                  <div
                    id="asset-valuationMethods"
                    tabIndex={-1}
                    aria-invalid={Boolean(errors.valuationMethods)}
                    aria-describedby={errors.valuationMethods ? "asset-valuationMethods-error" : undefined}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    {valuationOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex min-h-20 cursor-pointer items-start gap-3 rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel)] p-3.5 transition hover:bg-[var(--app-panel-alt)]"
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-5 w-5 rounded border-[var(--app-control-border)] text-[var(--app-accent)] focus:ring-[var(--app-accent-ring)]"
                          checked={selectedValuationMethods.includes(option.value)}
                          onChange={(event) => {
                            setSelectedValuationMethods((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, option.value]))
                                : current.filter((method) => method !== option.value)
                            );
                            clearFieldError("valuationMethods");
                          }}
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[var(--app-text)]">{option.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--app-text-muted)]">{option.description}</span>
                        </span>
                      </label>
                    ))}
                    {errors.valuationMethods ? (
                      <p id="asset-valuationMethods-error" className="text-xs font-medium text-[var(--app-danger)] sm:col-span-2" role="alert">
                        {errors.valuationMethods}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </FormSection>

            <FormSection
              id="asset-media"
              sectionNumber={4}
              title="Lots & Media"
              description={`Create lots, select a grouping mode, and add up to ${MAX_ASSET_LOT_PHOTOS} main and report-only photos per lot.`}
              summary={`${mixedLots.length} lot${mixedLots.length === 1 ? "" : "s"} · ${mediaTotals.photos} photo${mediaTotals.photos === 1 ? "" : "s"}${mediaTotals.videos ? ` · ${mediaTotals.videos} video${mediaTotals.videos === 1 ? "" : "s"}` : ""}`}
              errorSummary={errors.media}
              status={errors.media ? "error" : mediaTotals.photos > 0 ? "complete" : "incomplete"}
              open={openSections.has("media")}
              onOpenChange={(open) => toggleSection("media", open)}
            >
              <div
                id="asset-media-workspace"
                tabIndex={-1}
                data-invalid={errors.media ? "true" : undefined}
                aria-invalid={Boolean(errors.media)}
                className="outline-none"
              >
                <div className="mb-4 flex flex-col gap-3 rounded-md border border-[var(--app-control-border)] bg-[var(--app-panel-alt)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ScanLine
                        className="h-5 w-5 shrink-0 text-[var(--app-accent)]"
                        aria-hidden="true"
                      />
                      <p className="font-bold text-[var(--app-text)]">
                        Smart Upload
                      </p>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[var(--app-text-muted)]">
                      Upload images in one sequence. Black images become lot
                      dividers and are removed from the report.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openSmartUploadWorkspace}
                    disabled={submitting || mixedLots.length > 0}
                    className={formClassNames(
                      secondaryButtonClass,
                      "shrink-0 justify-center"
                    )}
                    title={
                      mixedLots.length
                        ? "Clear manually created lots before using Smart Upload"
                        : undefined
                    }
                  >
                    <ScanLine className="h-4 w-4" aria-hidden="true" />
                    Smart Upload
                  </button>
                </div>
                <MixedSection
                  value={mixedLots}
                  onChange={(lots) => {
                    setMixedLots(lots);
                    clearFieldError("media");
                  }}
                  allowVideo
                  maxImagesPerLot={MAX_ASSET_LOT_PHOTOS}
                  maxExtraImagesPerLot={MAX_ASSET_LOT_PHOTOS}
                  maxTotalImages={MAX_ASSET_LOT_PHOTOS}
                  lockLotStructure={auctioneer?.kind === "scheduleA"}
                  downloadPrefix={(contractNo || "asset").replace(/[^a-zA-Z0-9_-]/g, "-")}
                />
              </div>
            </FormSection>
          </fieldset>
        </div>
      </div>

      <FormActionBar className="flex-nowrap">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void saveDraftNow()}
            disabled={submitting || !userId}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            <span className="hidden min-[360px]:inline">Save draft</span>
            <span className="min-[360px]:hidden">Save</span>
          </button>
          <button
            type="button"
            className={iconButtonClass}
            aria-label="More asset form actions"
            aria-haspopup="menu"
            aria-expanded={Boolean(moreAnchor)}
            onClick={(event) => setMoreAnchor(event.currentTarget)}
            disabled={submitting}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden sm:inline">
            <button type="button" className={quietButtonClass} onClick={onCancel} disabled={submitting}>
              Cancel
            </button>
          </span>
          <button type="submit" className={primaryButtonClass} disabled={submitting}>
            {submitting ? "Uploading…" : "Create report"}
          </button>
        </div>
      </FormActionBar>

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: "top", horizontal: "left" }}
        transformOrigin={{ vertical: "bottom", horizontal: "left" }}
      >
        <MenuItem onClick={() => void saveInputs()}>Save as reusable input</MenuItem>
        <MenuItem
          className="sm:!hidden"
          onClick={() => {
            setMoreAnchor(null);
            onCancel?.();
          }}
        >
          Cancel
        </MenuItem>
        <MenuItem
          sx={{ color: "var(--app-danger)" }}
          onClick={() => {
            setMoreAnchor(null);
            setDiscardOpen(true);
          }}
        >
          Discard draft and clear form
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={discardOpen}
        title="Discard this asset draft?"
        description="All report details, lots, annotations, photos, and videos in this draft will be removed. This cannot be undone."
        confirmLabel="Discard draft"
        tone="danger"
        busy={discarding}
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => void discardDraft()}
      />

      <ActiveReportConflictDialog
        open={activeReportConflict}
        reportLabel="asset report"
        allowCreateSeparate={!auctioneer}
        onCancel={() => setActiveReportConflict(false)}
        onResume={() => {
          setActiveReportConflict(false);
          toast.info("The existing report is still processing. Check My Reports for its status.");
          onSuccess?.("Existing report resumed. Open My Reports to follow its progress.");
        }}
        onCreateSeparate={() => {
          setActiveReportConflict(false);
          jobIdRef.current =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          forceNewSubmissionRef.current = true;
          window.setTimeout(() => void onSubmit(), 0);
        }}
      />

      <SmartUploadWorkspace
        open={smartUploadOpen}
        kind="asset"
        userId={userId}
        scopeId={draftScopeId}
        clientSubmissionId={draftScopeId}
        resumeSessionId={resumeDraft?.smartUploadSession}
        details={smartUploadDetails}
        onClose={() => setSmartUploadOpen(false)}
        onSubmitted={() => handleSmartUploadSubmitted()}
      />
    </form>
  );
});

export default AssetForm;
