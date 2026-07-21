"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import {
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  MoreHorizontal,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "react-toastify";
import API from "@/lib/api";
import {
  CURRENT_BROWSER_LOCATION_LABEL,
  isValidBrowserCoordinates,
} from "@/lib/browserLocation";
import { useAuthContext } from "@/context/AuthContext";
import {
  uploadReportFilesDirectToR2,
  type DirectUploadFile,
} from "@/services/directUpload";
import ActiveReportConflictDialog from "./ActiveReportConflictDialog";
import type { MixedLot } from "./mixed/types";
import { buildMixedFocusBoxes } from "./mixed/focusBoxes";
import {
  DraftEnvelopeError,
  DraftPersistenceError,
  FORM_DRAFT_VERSION,
  deleteScopedDraft,
  getScopedDraftKey,
  hasScopedDraft,
  loadScopedDraft,
  parseScopedDraftEnvelope,
  requestDurableDraftStorage,
  saveScopedDraft,
} from "./drafts/storage";
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
  iconButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
  type DraftStatus,
} from "./ui/FormUI";

const MixedSection = dynamic(() => import("./mixed/MixedSection"), {
  ssr: false,
});

type ValuationMethod = "FML" | "TKV" | "OLV" | "FLV";
const LOT_LISTING_VALUATION_METHODS: ValuationMethod[] = ["FML"];

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
  onDraftStatusChange?: (status: DraftStatus, label?: string) => void;
};

type DraftSnapshot = {
  contractNo: string;
  salesDate: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  language: "en" | "fr" | "es";
  currency: string;
  bankPhotosEnabled: boolean;
  clientSubmissionId: string | null;
  lots: MixedLot[];
};

type SerializedDraftImage = {
  lotId: string;
  role: "main" | "extra";
  index: number;
  dataUrl: string;
  name: string;
  mimeType: string;
  size: number;
  lastModified: number;
};

type SerializedDraftLot = {
  id: string;
  coverIndex: number;
  mode?: MixedLot["mode"];
  annotations?: MixedLot["annotations"];
  mainCount: number;
  extraCount: number;
};

type LegacyLotListingDraftEnvelope = {
  version: 2;
  kind: "lot-listing";
  userId: string;
  revision: number;
  savedAt: string;
  data: Omit<DraftSnapshot, "lots"> & {
    lots: SerializedDraftLot[];
  };
  media: SerializedDraftImage[];
};

type LotListingDraftEnvelope = {
  version: typeof FORM_DRAFT_VERSION;
  kind: "lot-listing";
  userId: string;
  revision: number;
  savedAt: string;
  data: DraftSnapshot;
};

type DraftIssue = {
  tone: "warning" | "error";
  title: string;
  message: string;
};

const isoDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

async function dataUrlToFile(image: SerializedDraftImage): Promise<File> {
  const response = await fetch(image.dataUrl);
  if (!response.ok) throw new Error("Draft media could not be restored.");
  const blob = await response.blob();
  return new File([blob], image.name, {
    type: image.mimeType || blob.type,
    lastModified: image.lastModified,
  });
}

async function hydrateLegacyDraft(envelope: LegacyLotListingDraftEnvelope) {
  let missingMediaCount = 0;
  const lots: MixedLot[] = [];

  for (const lotData of envelope.data.lots) {
    const restoreRole = async (role: "main" | "extra") => {
      const files: File[] = [];
      const entries = envelope.media
        .filter((item) => item.lotId === lotData.id && item.role === role)
        .sort((left, right) => left.index - right.index);

      for (const entry of entries) {
        try {
          files.push(await dataUrlToFile(entry));
        } catch {
          missingMediaCount += 1;
        }
      }
      return files;
    };

    const files = await restoreRole("main");
    lots.push({
      id: lotData.id,
      files,
      extraFiles: await restoreRole("extra"),
      coverIndex: Math.max(
        0,
        Math.min(files.length - 1, Number(lotData.coverIndex) || 0)
      ),
      mode: lotData.mode,
      annotations: lotData.annotations || {},
    });
  }

  return {
    data: { ...envelope.data, lots } as DraftSnapshot,
    missingMediaCount,
  };
}

function draftFailureGuidance(error: unknown): DraftIssue {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "")
      : "";

  if (name === "QuotaExceededError") {
    return {
      tone: "error",
      title: "Draft storage is full",
      message:
        "Your previous draft is still intact. Remove unneeded browser data or reduce the media in this listing, then save again.",
    };
  }

  if (name === "SecurityError") {
    return {
      tone: "error",
      title: "Draft storage is unavailable",
      message:
        "This browser is blocking local storage. Allow site storage or use a regular browsing window before closing this form.",
    };
  }

  if (error instanceof DraftPersistenceError) {
    return {
      tone: "error",
      title: "Draft media was not saved",
      message: error.message,
    };
  }

  return {
    tone: "warning",
    title: "Draft media was not fully saved",
    message:
        "Your previous valid draft was preserved. Keep this form open and try Save draft again.",
  };
}

export default function LotListingForm({
  onSuccess,
  onCancel: _onCancel,
  onDraftStatusChange,
}: Props) {
  const { user } = useAuthContext();
  const userId = user?._id || null;
  const draftKey = useMemo(
    () => getScopedDraftKey(userId, "lot-listing"),
    [userId]
  );

  const [mixedLots, setMixedLots] = useState<MixedLot[]>([]);
  const [contractNo, setContractNo] = useState("");
  const [salesDate, setSalesDate] = useState(isoDate(new Date()));
  const [location, setLocation] = useState(CURRENT_BROWSER_LOCATION_LABEL);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState(
    "Detecting current location..."
  );
  const [language, setLanguage] = useState<"en" | "fr" | "es">("en");
  const [currency, setCurrency] = useState("CAD");
  const [bankPhotosEnabled, setBankPhotosEnabled] = useState(false);

  const [openSections, setOpenSections] = useState({
    details: true,
    media: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadStats, setUploadStats] = useState<{
    totalFiles: number;
    totalSize: number;
    uploadedBytes: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeReportConflict, setActiveReportConflict] = useState(false);

  const [hasDraft, setHasDraft] = useState(false);
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [draftIssue, setDraftIssue] = useState<DraftIssue | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "clear" | "discard" | null
  >(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);

  const jobIdRef = useRef<string | null>(null);
  const forceNewSubmissionRef = useRef(false);
  const submitLockRef = useRef(false);
  const reportEventSentRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveBlockedRef = useRef(false);
  const requestedRevisionRef = useRef(0);
  const committedRevisionRef = useRef(0);
  const saveFlightRef = useRef<Promise<boolean> | null>(null);
  const snapshotRef = useRef<DraftSnapshot | null>(null);
  const statusCallbackRef = useRef(onDraftStatusChange);

  useEffect(() => {
    statusCallbackRef.current = onDraftStatusChange;
  }, [onDraftStatusChange]);

  const reportDraftStatus = useCallback(
    (status: DraftStatus, label?: string) => {
      statusCallbackRef.current?.(status, label);
    },
    []
  );

  snapshotRef.current = {
    contractNo,
    salesDate,
    location,
    latitude,
    longitude,
    language,
    currency,
    bankPhotosEnabled,
    clientSubmissionId: jobIdRef.current,
    lots: mixedLots,
  };

  const requestCurrentLocation = useCallback(() => {
    setLatitude(null);
    setLongitude(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationStatus("Browser location access is unavailable");
      return;
    }

    setLocationStatus("Detecting current location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords?.latitude;
        const nextLongitude = position.coords?.longitude;
        if (
          !Number.isFinite(nextLatitude) ||
          !Number.isFinite(nextLongitude)
        ) {
          setLocationStatus("Latitude/Longitude not detected");
          return;
        }
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setLocation(CURRENT_BROWSER_LOCATION_LABEL);
        setLocationStatus("Current location detected");
      },
      () => {
        setLocationStatus("Browser location access denied or unavailable");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  const buildDraftEnvelope = useCallback(
    async (
      snapshot: DraftSnapshot,
      revision: number
    ): Promise<LotListingDraftEnvelope> => {
      if (!userId) throw new DOMException("No authenticated user", "SecurityError");

      return {
        version: FORM_DRAFT_VERSION,
        kind: "lot-listing",
        userId,
        revision,
        savedAt: new Date().toISOString(),
        data: {
          ...snapshot,
          lots: snapshot.lots.map((lot) => ({
            ...lot,
            files: [...lot.files],
            extraFiles: [...lot.extraFiles],
            videoFiles: [...(lot.videoFiles || [])],
            annotations: lot.annotations ? { ...lot.annotations } : undefined,
          })),
        },
      };
    },
    [userId]
  );

  const flushDraft = useCallback(async (): Promise<boolean> => {
    if (!draftKey || !userId || autosaveBlockedRef.current) return false;
    if (saveFlightRef.current) return saveFlightRef.current;

    let task: Promise<boolean>;
    task = (async () => {
      let committed = false;

      while (
        !autosaveBlockedRef.current &&
        committedRevisionRef.current < requestedRevisionRef.current
      ) {
        const revision = requestedRevisionRef.current;
        const snapshot = snapshotRef.current;
        if (!snapshot) break;

        reportDraftStatus("saving", "Saving draft...");
        try {
          const envelope = await buildDraftEnvelope(snapshot, revision);
          if (autosaveBlockedRef.current) break;
          await saveScopedDraft(envelope);
          committedRevisionRef.current = revision;
          committed = true;
          setHasDraft(true);
          setShowDraftBanner(false);
          setDraftIssue(null);

          if (revision === requestedRevisionRef.current) {
            reportDraftStatus(
              "saved",
              "Saved " +
                new Intl.DateTimeFormat(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date())
            );
          }
        } catch (saveError) {
          const issue = draftFailureGuidance(saveError);
          setDraftIssue(issue);
          reportDraftStatus(
            issue.tone === "warning" ? "partial" : "error",
            issue.title
          );
          break;
        }
      }

      return committed;
    })();

    saveFlightRef.current = task;
    try {
      return await task;
    } finally {
      if (saveFlightRef.current === task) saveFlightRef.current = null;
    }
  }, [buildDraftEnvelope, draftKey, reportDraftStatus, userId]);

  const markDirty = useCallback(() => {
    if (autosaveBlockedRef.current) return;
    requestedRevisionRef.current += 1;
    reportDraftStatus("dirty");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushDraft();
    }, 2000);
  }, [flushDraft, reportDraftStatus]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    []
  );

  const applyRestoredDraft = useCallback(
    (data: DraftSnapshot, revision: number, missingMediaCount: number) => {
      setContractNo(data.contractNo || "");
      setSalesDate(data.salesDate || isoDate(new Date()));
      setLocation(data.location || CURRENT_BROWSER_LOCATION_LABEL);
      if (isValidBrowserCoordinates(data.latitude, data.longitude)) {
        setLatitude(Number(data.latitude));
        setLongitude(Number(data.longitude));
        setLocationStatus("Current location restored from draft");
      } else {
        setLatitude(null);
        setLongitude(null);
        requestCurrentLocation();
      }
      setLanguage(data.language || "en");
      setCurrency(data.currency || "CAD");
      setBankPhotosEnabled(Boolean(data.bankPhotosEnabled));
      setMixedLots(Array.isArray(data.lots) ? data.lots : []);
      jobIdRef.current = data.clientSubmissionId || null;
      requestedRevisionRef.current = revision;
      committedRevisionRef.current = revision;
      setShowDraftBanner(false);
      setHasDraft(true);

      if (missingMediaCount > 0) {
        setDraftIssue({
          tone: "warning",
          title: "Some draft media could not be restored",
          message: `${missingMediaCount} file${
            missingMediaCount === 1 ? " was" : "s were"
          } skipped. Review each lot before submitting.`,
        });
        reportDraftStatus("partial", "Draft restored with missing media");
      } else {
        setDraftIssue(null);
        reportDraftStatus("saved", "Draft restored");
      }
    },
    [reportDraftStatus, requestCurrentLocation]
  );

  useEffect(() => {
    if (!draftKey || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        await requestDurableDraftStorage();
        const durableDraftExists = await hasScopedDraft(userId, "lot-listing");
        const legacyRaw = localStorage.getItem(draftKey);
        if (!durableDraftExists && !legacyRaw) return;

        let revision = 0;
        if (legacyRaw && !durableDraftExists) {
          const legacy = parseScopedDraftEnvelope<LegacyLotListingDraftEnvelope>(
            legacyRaw,
            { userId, kind: "lot-listing" }
          );
          revision = Number(legacy.revision) || 0;
        }
        if (cancelled) return;
        setHasDraft(true);
        setShowDraftBanner(true);
        requestedRevisionRef.current = revision;
        committedRevisionRef.current = revision;
        reportDraftStatus("saved", "Saved draft available");
      } catch (checkError) {
        if (cancelled) return;
        const unsupported =
          checkError instanceof DraftEnvelopeError &&
          checkError.code === "unsupported-version";
        setHasDraft(true);
        setShowDraftBanner(false);
        setDraftIssue({
          tone: unsupported ? "warning" : "error",
          title: unsupported
            ? "This draft cannot be restored"
            : "Draft storage is unavailable",
          message: unsupported
            ? "It was created by an unsupported form version. Discard it when you are ready to start a new draft."
            : checkError instanceof Error
              ? checkError.message
              : "The browser could not read durable draft storage.",
        });
        reportDraftStatus("error", "Draft needs attention");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draftKey, reportDraftStatus, userId]);

  const clearFieldError = (field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleLotsChange = useCallback(
    (lots: MixedLot[]) => {
      setMixedLots(lots);
      clearFieldError("media");
      markDirty();
    },
    [markDirty]
  );

  const restoreDraft = useCallback(async () => {
    if (!draftKey || !userId) return;
    setRestoringDraft(true);
    setDraftIssue(null);

    try {
      const durable = await loadScopedDraft<LotListingDraftEnvelope>(
        userId,
        "lot-listing"
      );
      if (durable) {
        applyRestoredDraft(
          durable.envelope.data,
          Number(durable.envelope.revision) || 0,
          durable.missingMediaCount
        );
      } else {
        const raw = localStorage.getItem(draftKey);
        if (!raw) throw new Error("The saved draft is no longer available.");
        const legacy = parseScopedDraftEnvelope<LegacyLotListingDraftEnvelope>(
          raw,
          { userId, kind: "lot-listing" }
        );
        const migrated = await hydrateLegacyDraft(legacy);

        // Remove v2 only after a complete v3 write/read verification. If a
        // Data URL is damaged, the legacy revision remains available to retry.
        if (migrated.missingMediaCount === 0) {
          const nextEnvelope = await buildDraftEnvelope(
            migrated.data,
            Number(legacy.revision) || 0
          );
          await saveScopedDraft(nextEnvelope);
          const verified = await loadScopedDraft<LotListingDraftEnvelope>(
            userId,
            "lot-listing"
          );
          if (!verified || verified.missingMediaCount > 0) {
            throw new Error("The migrated draft could not be verified.");
          }
          localStorage.removeItem(draftKey);
        }
        applyRestoredDraft(
          migrated.data,
          Number(legacy.revision) || 0,
          migrated.missingMediaCount
        );
      }
      toast.success("Draft restored");
    } catch (restoreError) {
      const message =
        restoreError instanceof Error
          ? restoreError.message
          : "The saved draft could not be restored.";
      setDraftIssue({
        tone: "error",
        title: "Draft restore failed",
        message,
      });
      reportDraftStatus("error", "Draft restore failed");
      toast.error(message);
    } finally {
      setRestoringDraft(false);
    }
  }, [
    applyRestoredDraft,
    buildDraftEnvelope,
    draftKey,
    reportDraftStatus,
    userId,
  ]);

  const deleteDraftStorage = useCallback(async () => {
    let durableDeleteError: unknown;
    try {
      if (userId) await deleteScopedDraft(userId, "lot-listing");
    } catch (deleteError) {
      durableDeleteError = deleteError;
    }
    if (draftKey) localStorage.removeItem(draftKey);
    if (durableDeleteError) throw durableDeleteError;
  }, [draftKey, userId]);

  const deleteStoredDraft = useCallback(async () => {
    autosaveBlockedRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    await saveFlightRef.current;
    await deleteDraftStorage();
    requestedRevisionRef.current = 0;
    committedRevisionRef.current = 0;
    setHasDraft(false);
    setShowDraftBanner(false);
    setDraftIssue(null);
  }, [deleteDraftStorage]);

  const resetFormState = useCallback(() => {
    setMixedLots([]);
    setContractNo("");
    setSalesDate(isoDate(new Date()));
    setLocation(CURRENT_BROWSER_LOCATION_LABEL);
    setLatitude(null);
    setLongitude(null);
    setLocationStatus("Detecting current location...");
    setLanguage("en");
    setCurrency("CAD");
    setBankPhotosEnabled(false);
    setError(null);
    setErrors({});
    setUploadPercent(0);
    setUploadStats(null);
    setOpenSections({ details: true, media: true });
    jobIdRef.current = null;
    forceNewSubmissionRef.current = false;
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  const handleConfirmedAction = useCallback(async () => {
    const action = confirmAction;
    setConfirmAction(null);
    try {
      await deleteStoredDraft();
      if (action === "clear") {
        resetFormState();
        reportDraftStatus("dirty", "No draft saved");
        toast.info("Lot listing cleared.");
      } else {
        reportDraftStatus("dirty", "Draft discarded");
        toast.info("Saved draft discarded.");
      }
    } catch (deleteError) {
      const issue = draftFailureGuidance(deleteError);
      setDraftIssue(issue);
      reportDraftStatus("error", "Draft could not be removed");
    } finally {
      autosaveBlockedRef.current = false;
    }
  }, [
    confirmAction,
    deleteStoredDraft,
    reportDraftStatus,
    resetFormState,
  ]);

  const handleSaveDraft = useCallback(async () => {
    requestedRevisionRef.current += 1;
    const committed = await flushDraft();
    if (committed) toast.success("Draft saved");
  }, [flushDraft]);

  const validateForm = useCallback(() => {
    const nextErrors: Record<string, string> = {};
    if (!contractNo.trim()) {
      nextErrors.contractNo = "Enter a contract number.";
    }
    if (!/^[A-Z]{3}$/.test(currency.trim().toUpperCase())) {
      nextErrors.currency = "Use a three-letter currency code such as CAD.";
    }

    const hasMainImages = mixedLots.some((lot) => lot.files.length > 0);
    const everyLotReady =
      mixedLots.length > 0 &&
      mixedLots.every((lot) => lot.files.length > 0 && Boolean(lot.mode));
    if (!hasMainImages) {
      nextErrors.media = "Add at least one main photo.";
    } else if (!everyLotReady) {
      nextErrors.media =
        "Every lot needs a main photo and a Bundle, Per Item, or Per Photo mode.";
    }

    setErrors(nextErrors);
    if (nextErrors.contractNo || nextErrors.currency) {
      setOpenSections((current) => ({ ...current, details: true }));
    }
    if (nextErrors.media) {
      setOpenSections((current) => ({ ...current, media: true }));
    }

    return Object.keys(nextErrors).length === 0;
  }, [contractNo, currency, mixedLots]);

  const resumeDraftAfterFailure = useCallback(async () => {
    autosaveBlockedRef.current = false;
    requestedRevisionRef.current += 1;
    await flushDraft();
  }, [flushDraft]);

  const clearAcceptedDraft = useCallback(async (): Promise<unknown | null> => {
    autosaveBlockedRef.current = true;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    let cleanupError: unknown | null = null;
    try {
      await saveFlightRef.current;
      await deleteDraftStorage();
    } catch (draftError) {
      // The server has already accepted the report at this point. Local cleanup
      // must never turn that successful submission into a retryable upload error.
      cleanupError = draftError;
    }

    requestedRevisionRef.current = 0;
    committedRevisionRef.current = 0;
    setHasDraft(false);
    setShowDraftBanner(false);
    setDraftIssue(null);
    resetFormState();
    autosaveBlockedRef.current = false;
    return cleanupError;
  }, [deleteDraftStorage, resetFormState]);

  const dispatchReportCreated = useCallback(() => {
    if (reportEventSentRef.current || typeof window === "undefined") return;
    reportEventSentRef.current = true;
    window.dispatchEvent(new Event("cv:report-created"));
  }, []);

  const onSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      if (submitLockRef.current) return;
      setError(null);

      if (!validateForm()) {
        const message = "Review the highlighted fields before submitting.";
        setError(message);
        toast.error(message);
        return;
      }

      submitLockRef.current = true;
      reportEventSentRef.current = false;
      autosaveBlockedRef.current = true;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      const lotsForSubmission = mixedLots;
      const filesToSend = lotsForSubmission.flatMap((lot) => [
        ...lot.files,
        ...lot.extraFiles,
      ]);
      const totalSize = filesToSend.reduce((sum, file) => sum + file.size, 0);

      setSubmitting(true);
      setUploadPercent(0);
      setUploadStats({
        totalFiles: filesToSend.length,
        totalSize,
        uploadedBytes: 0,
      });

      const jobId =
        jobIdRef.current ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "ll-" +
            Date.now() +
            "-" +
            Math.random().toString(36).slice(2, 9));
      jobIdRef.current = jobId;

      const focusBoxes = buildMixedFocusBoxes(lotsForSubmission);

      const details = {
        contract_no: contractNo.trim(),
        sales_date: salesDate,
        location: location.trim() || CURRENT_BROWSER_LOCATION_LABEL,
        ...(isValidBrowserCoordinates(latitude, longitude)
          ? {
              latitude: Number(latitude),
              longitude: Number(longitude),
            }
          : {}),
        language,
        currency: currency.trim().toUpperCase(),
        valuation_methods: LOT_LISTING_VALUATION_METHODS,
        include_damage_analysis: true,
        bank_photos_enabled: bankPhotosEnabled,
        progress_id: jobId,
        client_submission_id: jobId,
        force_new: forceNewSubmissionRef.current,
        mixed_lots: lotsForSubmission.map((lot) => ({
          count: lot.files.length,
          extra_count: lot.extraFiles.length,
          cover_index: Math.max(
            0,
            Math.min(lot.files.length - 1, lot.coverIndex || 0)
          ),
          mode: lot.mode,
        })),
        ...(focusBoxes.length > 0 ? { focus_boxes: focusBoxes } : {}),
      };

      const updateUploadProgress = (fraction: number) => {
        const clamped = Math.max(0, Math.min(1, fraction));
        setUploadPercent((current) =>
          Math.max(current, Math.round(clamped * 100))
        );
        setUploadStats((current) =>
          current
            ? {
                ...current,
                uploadedBytes: Math.floor(clamped * current.totalSize),
              }
            : current
        );
      };

      try {
        let responseData: Record<string, unknown>;
        try {
          const directFiles: DirectUploadFile[] = [];
          lotsForSubmission.forEach((lot, lotIndex) => {
            lot.files.forEach((file, imageIndex) => {
              directFiles.push({
                file,
                fieldname: "images",
                lotIndex,
                imageIndex,
                role: "main",
              });
            });
            lot.extraFiles.forEach((file, imageIndex) => {
              directFiles.push({
                file,
                fieldname: "images",
                lotIndex,
                imageIndex,
                role: "extra",
              });
            });
          });

          responseData = await uploadReportFilesDirectToR2({
            endpoint: "/lot-listing",
            details,
            files: directFiles,
            onUploadProgress: updateUploadProgress,
          });
        } catch (directError: any) {
          const status = Number(directError?.response?.status || 0);
          if (![404, 405, 501].includes(status)) throw directError;

          const formData = new FormData();
          filesToSend.forEach((file) => formData.append("images", file));
          formData.append("details", JSON.stringify(details));
          const response = await API.post("/lot-listing", formData, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (progressEvent: {
              loaded: number;
              total?: number;
            }) => {
              updateUploadProgress(
                progressEvent.total
                  ? progressEvent.loaded / progressEvent.total
                  : 0
              );
            },
          });
          responseData = response.data;
        }

        updateUploadProgress(1);
        const acceptedMessage =
          "Submission accepted — processing continues in My Reports.";
        const cleanupError = await clearAcceptedDraft();
        forceNewSubmissionRef.current = false;
        dispatchReportCreated();
        toast.success(acceptedMessage);
        if (cleanupError) {
          toast.warning(
            "Report submitted, but its local draft could not be removed. You can discard the old local copy later."
          );
        }
        onSuccess?.(acceptedMessage);
        void responseData;
      } catch (submitError: any) {
        const isConflict =
          submitError?.response?.status === 409 &&
          submitError?.response?.data?.code === "ACTIVE_REPORT_EXISTS";
        setSubmitting(false);
        submitLockRef.current = false;
        await resumeDraftAfterFailure();

        if (isConflict) {
          setActiveReportConflict(true);
          return;
        }

        const message =
          submitError?.response?.data?.message ||
          submitError?.message ||
          "Failed to create lot listing.";
        setError(message);
        toast.error(message);
        return;
      }

      setSubmitting(false);
      submitLockRef.current = false;
    },
    [
      bankPhotosEnabled,
      clearAcceptedDraft,
      contractNo,
      currency,
      dispatchReportCreated,
      language,
      latitude,
      location,
      longitude,
      mixedLots,
      onSuccess,
      resumeDraftAfterFailure,
      salesDate,
      validateForm,
    ]
  );

  const totalMainPhotos = mixedLots.reduce(
    (sum, lot) => sum + lot.files.length,
    0
  );
  const totalExtraPhotos = mixedLots.reduce(
    (sum, lot) => sum + lot.extraFiles.length,
    0
  );
  const mediaSummary =
    mixedLots.length === 0
      ? "No lots added"
      : mixedLots.length +
        " " +
        (mixedLots.length === 1 ? "lot" : "lots") +
        " · " +
        (totalMainPhotos + totalExtraPhotos) +
        " photos";
  const detailsComplete =
    Boolean(contractNo.trim()) && /^[A-Z]{3}$/.test(currency.trim());
  const mediaComplete =
    mixedLots.length > 0 &&
    mixedLots.every((lot) => lot.files.length > 0 && Boolean(lot.mode));
  const fieldErrorCount = [errors.contractNo, errors.currency].filter(
    Boolean
  ).length;

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--app-panel-alt)]"
      onSubmit={onSubmit}
      aria-busy={submitting}
      noValidate
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto grid w-full max-w-[920px] gap-4 sm:gap-5">
          {error ? (
            <FormAlert tone="error" title="The listing needs attention">
              {error}
            </FormAlert>
          ) : null}

          {submitting && uploadStats ? (
            <FormAlert tone="info" title="Uploading listing media">
              <div className="mt-2 grid gap-2">
                <div
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={uploadPercent}
                  className="h-2 overflow-hidden rounded-full bg-[var(--app-control-border)]"
                >
                  <div
                    className="h-full rounded-full bg-[var(--app-accent)] transition-[width] duration-200"
                    style={{ width: uploadPercent + "%" }}
                  />
                </div>
                <p className="flex flex-wrap justify-between gap-2 text-xs">
                  <span>
                    {uploadPercent}% · {uploadStats.totalFiles} files
                  </span>
                  <span>
                    {formatFileSize(uploadStats.uploadedBytes)} of{" "}
                    {formatFileSize(uploadStats.totalSize)}
                  </span>
                </p>
              </div>
            </FormAlert>
          ) : null}

          {draftIssue ? (
            <FormAlert
              tone={draftIssue.tone}
              title={draftIssue.title}
              onDismiss={() => setDraftIssue(null)}
            >
              {draftIssue.message}
            </FormAlert>
          ) : null}

          {hasDraft && showDraftBanner ? (
            <FormAlert tone="info" title="Continue your saved draft">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Restore the fields, lot modes, cover choices, annotations,
                  and locally stored photos from this account&apos;s draft.
                </span>
                <span className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void restoreDraft()}
                    disabled={restoringDraft}
                    className={secondaryButtonClass}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {restoringDraft ? "Restoring..." : "Restore"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("discard")}
                    className={secondaryButtonClass}
                  >
                    Discard
                  </button>
                </span>
              </div>
            </FormAlert>
          ) : null}

          <FormSection
            id="lot-listing-details"
            sectionNumber={1}
            title="Listing Details"
            description="Core settings used to identify and format the listing. Sales date and current location are captured automatically."
            open={openSections.details}
            onOpenChange={(open) =>
              setOpenSections((current) => ({ ...current, details: open }))
            }
            status={
              fieldErrorCount > 0
                ? "error"
                : detailsComplete
                  ? "complete"
                  : "incomplete"
            }
            summary={
              detailsComplete
                ? contractNo.trim() + " · " + currency.trim().toUpperCase()
                : "Contract, language, and currency"
            }
            errorSummary={
              fieldErrorCount > 0
                ? fieldErrorCount +
                  " " +
                  (fieldErrorCount === 1 ? "field needs" : "fields need") +
                  " attention"
                : undefined
            }
          >
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <FormField
                id="lot-contract-number"
                label="Contract Number"
                required
                error={errors.contractNo}
              >
                <input
                  type="text"
                  value={contractNo}
                  onChange={(event) => {
                    setContractNo(event.target.value);
                    clearFieldError("contractNo");
                    markDirty();
                  }}
                  placeholder="e.g., CTR-2026-001"
                  autoComplete="off"
                  disabled={submitting}
                  className={formControlClass}
                />
              </FormField>

              <FormField id="lot-language" label="Language">
                <select
                  value={language}
                  onChange={(event) => {
                    setLanguage(
                      event.target.value as "en" | "fr" | "es"
                    );
                    markDirty();
                  }}
                  disabled={submitting}
                  className={formSelectClass}
                >
                  <option value="en">English</option>
                  <option value="fr">French</option>
                  <option value="es">Spanish</option>
                </select>
              </FormField>

              <FormField
                id="lot-currency"
                label="Currency"
                required
                hint="Use the three-letter ISO code."
                error={errors.currency}
              >
                <input
                  type="text"
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value.toUpperCase());
                    clearFieldError("currency");
                    markDirty();
                  }}
                  placeholder="CAD"
                  maxLength={3}
                  autoComplete="off"
                  disabled={submitting}
                  className={formClassNames(
                    formControlClass,
                    "uppercase"
                  )}
                />
              </FormField>

              <div className="rounded-lg border border-[var(--app-control-border)] bg-[var(--app-panel-alt)] px-4 py-3">
                <FormSwitch
                  id="lot-bank-photos"
                  label="Include all photos in CR"
                  description="Include report-only photos in the condition report."
                  checked={bankPhotosEnabled}
                  onChange={(event) => {
                    setBankPhotosEnabled(event.target.checked);
                    markDirty();
                  }}
                  disabled={submitting}
                />
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {locationStatus}
            </p>
          </FormSection>

          <FormSection
            id="lot-listing-media"
            sectionNumber={2}
            title="Lots & Media"
            description="Create each lot, choose how its photos should be interpreted, and then add main or report-only images."
            open={openSections.media}
            onOpenChange={(open) =>
              setOpenSections((current) => ({ ...current, media: open }))
            }
            status={
              errors.media ? "error" : mediaComplete ? "complete" : "incomplete"
            }
            summary={mediaSummary}
            errorSummary={errors.media}
          >
            <div
              id="lot-media-workspace"
              tabIndex={errors.media ? -1 : undefined}
              data-invalid={errors.media ? "true" : undefined}
              aria-describedby={
                errors.media ? "lot-media-workspace-error" : undefined
              }
              className={formClassNames(
                submitting ? "pointer-events-none opacity-70" : undefined
              )}
            >
              {errors.media ? (
                <p
                  id="lot-media-workspace-error"
                  className="border-b border-[var(--app-danger-border)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm font-medium text-[var(--app-danger)] sm:px-5"
                  role="alert"
                >
                  {errors.media}
                </p>
              ) : null}
              <MixedSection
                value={mixedLots}
                onChange={handleLotsChange}
                downloadPrefix={contractNo || "lot-listing"}
                allowVideo={false}
                analysisImageLimit={50}
              />
            </div>
          </FormSection>
        </div>
      </div>

      <FormActionBar className="static">
        <div className="hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={submitting || restoringDraft}
            className={secondaryButtonClass}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Save Draft
          </button>
          <button
            type="button"
            onClick={() => setConfirmAction("clear")}
            disabled={submitting}
            className={secondaryButtonClass}
          >
            Clear
          </button>
        </div>

        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_44px_minmax(0,1.25fr)] gap-2 sm:hidden">
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={submitting || restoringDraft}
            className={formClassNames(secondaryButtonClass, "min-w-0 px-2")}
          >
            <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Save Draft</span>
          </button>
          <button
            type="button"
            aria-label="More form actions"
            aria-haspopup="menu"
            aria-expanded={Boolean(moreAnchor)}
            onClick={(event) => setMoreAnchor(event.currentTarget)}
            disabled={submitting}
            className={iconButtonClass}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={formClassNames(primaryButtonClass, "min-w-0 px-2")}
          >
            <span className="truncate">
              {submitting ? "Uploading..." : "Create Listing"}
            </span>
          </button>
        </div>

        <span className="hidden sm:inline">
          <button
            type="submit"
            disabled={submitting}
            className={primaryButtonClass}
          >
            {submitting ? "Uploading..." : "Create Lot Listing"}
          </button>
        </span>
      </FormActionBar>

      <Menu
        anchorEl={moreAnchor}
        open={Boolean(moreAnchor)}
        onClose={() => setMoreAnchor(null)}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              minWidth: 200,
              border: "1px solid var(--app-border)",
              borderRadius: "10px",
              bgcolor: "var(--app-panel)",
              color: "var(--app-text)",
              backgroundImage: "none",
              boxShadow: "var(--app-shadow-modal)",
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setMoreAnchor(null);
            setConfirmAction("clear");
          }}
          sx={{ minHeight: 44 }}
        >
          <ListItemIcon>
            <Trash2 className="h-4 w-4 text-[var(--app-danger)]" />
          </ListItemIcon>
          <ListItemText>Clear form</ListItemText>
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirmAction === "clear"}
        title="Clear this lot listing?"
        description="All fields, lots, photos, modes, covers, and annotations in this form will be removed. The saved draft will also be deleted."
        confirmLabel="Clear listing"
        tone="danger"
        onConfirm={() => void handleConfirmedAction()}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "discard"}
        title="Discard the saved draft?"
        description="The saved fields and locally stored media for this account will be removed. Legacy drafts are not changed."
        confirmLabel="Discard draft"
        tone="danger"
        onConfirm={() => void handleConfirmedAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <ActiveReportConflictDialog
        open={activeReportConflict}
        reportLabel="lot listing"
        onCancel={() => setActiveReportConflict(false)}
        onResume={() => {
          setActiveReportConflict(false);
          toast.info(
            "The existing report is still processing. Check My Reports for its status."
          );
          onSuccess?.(
            "Existing report resumed. Open My Reports to follow its progress."
          );
        }}
        onCreateSeparate={() => {
          setActiveReportConflict(false);
          jobIdRef.current =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : "ll-" +
                Date.now() +
                "-" +
                Math.random().toString(36).slice(2, 9);
          forceNewSubmissionRef.current = true;
          window.setTimeout(() => void onSubmit(), 0);
        }}
      />
    </form>
  );
}
