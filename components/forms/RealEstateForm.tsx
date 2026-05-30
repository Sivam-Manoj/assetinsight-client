"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import {
  RealEstateService,
  type RealEstateDetails,
} from "@/services/realEstate";
import { Check, Save } from "lucide-react";
import {
  SavedInputService,
  type SavedInput,
  type RealEstateFormData,
} from "@/services/savedInputs";
import { AIService, type RealEstateDetailsPatch } from "@/services/ai";
import { toast } from "react-toastify";

// Section Components
import {
  RealEstateSection,
  PropertyDetailsSection,
  BuildingDetailsSection,
  FarmlandDetailsSection,
  MapUploadSection,
  AIAssistSection,
  type RealEstateProperty,
} from "./real-estate";

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const PROG_WEIGHTS = {
  client_upload: 0.25,
  r2_upload: 0.18,
  ai_analysis: 0.2,
  find_comparables: 0.12,
  valuation: 0.08,
  market_trend: 0.05,
  generate_outputs: 0.07,
  finalize: 0.05,
} as const;

const STEPS = [
  { key: "client_upload", label: "Uploading images" },
  { key: "r2_upload", label: "Storing images" },
  { key: "ai_analysis", label: "Analyzing images" },
  { key: "find_comparables", label: "Finding comparables" },
  { key: "valuation", label: "Calculating valuation" },
  { key: "market_trend", label: "Fetching market trends" },
  { key: "generate_outputs", label: "Generating files" },
  { key: "finalize", label: "Finalizing" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const makeInitialStepStates = (): Record<
  StepKey,
  "pending" | "active" | "done"
> => {
  return STEPS.reduce((acc, step) => {
    acc[step.key] = "pending";
    return acc;
  }, {} as Record<StepKey, "pending" | "active" | "done">);
};

const deriveStepStates = (
  percent: number
): Record<StepKey, "pending" | "active" | "done"> => {
  const states = makeInitialStepStates();
  let previousBoundary = 0;
  STEPS.forEach((step) => {
    const weight = PROG_WEIGHTS[step.key];
    const boundary = previousBoundary + weight * 100;
    if (percent >= boundary - 0.1) {
      states[step.key] = "done";
    } else if (percent >= previousBoundary) {
      states[step.key] = "active";
    }
    previousBoundary = boundary;
  });
  return states;
};

export type RealEstateFormHandle = {
  loadSavedInput: (savedInput: SavedInput) => void;
};

export default function RealEstateForm({ onSuccess, onCancel }: Props) {
  const { user } = useAuthContext();
  const [details, setDetails] = useState<RealEstateDetails>({
    language: "en",
    property_type: "residential",
    property_details: {
      owner_name: "",
      address: "",
      land_description: "",
      municipality: "",
      title_number: "",
      parcel_number: "",
      land_area_acres: "",
      source_quarter_section: "",
    },
    report_dates: {
      report_date: isoDate(new Date()),
      effective_date: isoDate(new Date()),
      inspection_date: isoDate(new Date()),
    },
    house_details: {
      year_built: "",
      square_footage: "",
      lot_size_sqft: "",
      number_of_rooms: "",
      number_of_full_bathrooms: "",
      number_of_half_bathrooms: "",
      known_issues: [],
    },
    farmland_details: {
      total_title_acres: undefined,
      cultivated_acres: undefined,
      rm_area: "",
      soil_class: "",
      crop_type: "",
      is_rented: false,
      annual_rent_per_acre: undefined,
      irrigation: false,
      access_quality: "good",
      distance_to_city_km: undefined,
      // Direct Comparable Approach fields
      use_direct_comparable: false,
      subject_name: "",
      valuation_date: isoDate(new Date()),
      notes: "",
      // Income Capitalization Approach fields
      use_income_approach: false,
      market_rent_per_acre: undefined,
      vacancy_loss_percent: 2,
      operating_expense_ratio: 20,
      cap_rate: 5,
      // Cost Approach (AI-calculated)
      use_cost_approach: false,
    },
    inspector_info: {
      inspector_name: "",
      company_name: "",
      contact_email: "",
      contact_phone: "",
      credentials: "",
    },
  });

  const [property, setProperty] = useState<RealEstateProperty | null>(null);
  const [mapImage, setMapImage] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [specFiles, setSpecFiles] = useState<File[]>([]);
  const [notesText, setNotesText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressPhase, setProgressPhase] = useState<
    "idle" | "upload" | "processing" | "done" | "error"
  >("idle");
  const [stepStates, setStepStates] = useState<
    Record<StepKey, "pending" | "active" | "done">
  >(makeInitialStepStates);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const pollStartedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (progressPhase === "idle") return;
    setStepStates(deriveStepStates(progressPercent));
  }, [progressPercent, progressPhase]);

  // Sync property type from RealEstateSection to details
  useEffect(() => {
    if (property?.propertyType && property.propertyType !== details.property_type) {
      setDetails((prev) => ({
        ...prev,
        property_type: property.propertyType as "agricultural" | "commercial" | "residential",
        property_details: {
          ...prev.property_details,
          property_type: property.propertyType,
        },
      }));
    }
  }, [property?.propertyType]);

  function handleChange<
    K1 extends keyof RealEstateDetails,
    K2 extends keyof RealEstateDetails[K1] & string
  >(section: K1, field: K2, value: string) {
    setDetails((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as any),
        [field]: value,
      } as any,
    }));
  }

  function handleKnownIssuesChange(value: string) {
    const issues = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setDetails((prev) => ({
      ...prev,
      house_details: {
        ...prev.house_details,
        known_issues: issues,
      },
    }));
  }

  function handleFarmlandChange<
    K extends keyof NonNullable<RealEstateDetails["farmland_details"]>
  >(field: K, value: NonNullable<RealEstateDetails["farmland_details"]>[K]) {
    setDetails((prev) => ({
      ...prev,
      farmland_details: {
        ...prev.farmland_details,
        [field]: value,
      },
    }));
  }

  function handlePropertyTypeChange(
    type: "agricultural" | "commercial" | "residential"
  ) {
    setDetails((prev) => ({
      ...prev,
      property_type: type,
      property_details: {
        ...prev.property_details,
        property_type: type,
      },
    }));
  }

  function handleMapImageChange(files: FileList | null) {
    if (!files || files.length === 0) {
      setMapImage(null);
      return;
    }
    setMapImage(files[0]);
  }

  function removeMapImage() {
    setMapImage(null);
  }

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  function mergeNonEmpty<T extends Record<string, any>>(
    prev: T,
    patch?: Partial<T>
  ): T {
    if (!patch) return prev;
    const out: T = { ...prev };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        if (value.length > 0) (out as any)[key] = value;
        continue;
      }
      if (typeof value === "string") {
        if (value.trim() !== "") (out as any)[key] = value;
        continue;
      }
      (out as any)[key] = value;
    }
    return out;
  }

  function applyPatch(patch: RealEstateDetailsPatch) {
    setDetails((prev) => {
      // Normalize known_issues if it accidentally comes as a string
      let housePatch = patch.house_details;
      const ki: any = (housePatch as any)?.known_issues;
      if (typeof ki === "string") {
        const arr = ki
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        housePatch = { ...housePatch, known_issues: arr } as any;
      }

      const merged: RealEstateDetails = {
        ...prev,
        property_details: mergeNonEmpty(
          prev.property_details,
          patch.property_details
        ),
        report_dates: mergeNonEmpty(prev.report_dates, patch.report_dates),
        house_details: mergeNonEmpty(prev.house_details, housePatch),
        inspector_info: mergeNonEmpty(
          prev.inspector_info,
          patch.inspector_info
        ),
      };

      return merged;
    });
  }

  function handleSpecChange(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    // Append new files, limit to 5 total
    setSpecFiles((prev) => {
      const combined = [...prev, ...Array.from(files)];
      return combined.slice(0, 5);
    });
  }

  function removeSpecFile(index: number) {
    setSpecFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function analyzeSpec() {
    if (specFiles.length === 0) return;
    try {
      setAiLoading(true);
      const patch = await AIService.fillFromSpecSheet(specFiles);
      applyPatch(patch);
    } catch (e: any) {
      setError(e?.message || "Failed to analyze spec sheet");
    } finally {
      setAiLoading(false);
    }
  }

  async function fillFromText() {
    const text = notesText.trim();
    if (!text) return;
    try {
      setAiLoading(true);
      const patch = await AIService.fillFromText(text);
      applyPatch(patch);
    } catch (e: any) {
      setError(e?.message || "Failed to process text");
    } finally {
      setAiLoading(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        chunksRef.current = [];
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setError(null);
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setIsRecording(true);
    } catch (e: any) {
      setError(e?.message || "Unable to access microphone");
    }
  }

  function stopRecording() {
    const mr = mediaRecorderRef.current;
    if (mr && (mr.state === "recording" || mr.state === "paused")) {
      mr.stop();
    }
    setIsRecording(false);
  }

  function clearRecording() {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
  }

  async function useRecording() {
    if (!audioBlob) return;
    try {
      setAiLoading(true);
      const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
      const patch = await AIService.fillFromAudio(file);
      applyPatch(patch);
    } catch (e: any) {
      setError(e?.message || "Failed to process audio");
    } finally {
      setAiLoading(false);
    }
  }

  // Save inputs to database
  async function saveInputs() {
    try {
      const baseName =
        details.property_details?.address?.trim() ||
        details.property_details?.owner_name?.trim() ||
        "Unnamed Property";
      const dateStr = new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const autoName = `${baseName} - ${dateStr}`;

      const formData: RealEstateFormData = {
        language: details.language,
        property_type: details.property_type,
        property_details: details.property_details,
        report_dates: details.report_dates,
        house_details: details.house_details,
        farmland_details: details.farmland_details,
      };

      await SavedInputService.create({
        name: autoName,
        formType: "realEstate",
        formData,
      });

      toast.success("Draft saved successfully!");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to save draft");
    }
  }

  // Load saved input from history
  function loadSavedInput(savedInput: SavedInput) {
    try {
      const fd = savedInput.formData as RealEstateFormData;
      if (!fd) return;

      setDetails((prev) => ({
        ...prev,
        language: fd.language || prev.language,
        property_type: fd.property_type || prev.property_type,
        property_details: {
          ...prev.property_details,
          ...fd.property_details,
        },
        report_dates: {
          ...prev.report_dates,
          ...fd.report_dates,
        },
        house_details: {
          ...prev.house_details,
          ...fd.house_details,
        },
        farmland_details: {
          ...prev.farmland_details,
          ...fd.farmland_details,
        },
      }));

      toast.success(`Loaded: ${savedInput.name}`);
    } catch (error) {
      toast.error("Failed to load saved draft");
    }
  }

  // Listen for global event to load saved input (from Navbar)
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const savedInput = e.detail;
      if (savedInput && savedInput.formType === "realEstate") {
        loadSavedInput(savedInput);
      }
    };
    window.addEventListener("load-realestate-input" as any, handler as any);
    return () => {
      window.removeEventListener(
        "load-realestate-input" as any,
        handler as any
      );
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!details.property_details.address) {
      setError("Address is required.");
      toast.error("Address is required.");
      return;
    }

    if (!property || !property.propertyType) {
      setError("Please select a property type.");
      toast.error("Please select a property type.");
      return;
    }

    try {
      if (property.mainImages.length === 0) {
        const msg = "Please add at least one property image.";
        setError(msg);
        toast.error(msg);
        return;
      }

      setSubmitting(true);
      setError(null);
      setProgressPhase("upload");
      setProgressPercent(0);
      setStepStates(() => {
        const initial = makeInitialStepStates();
        initial.client_upload = "active";
        return initial;
      });
      pollStartedRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      const jobId =
        typeof crypto !== "undefined" && (crypto as any)?.randomUUID
          ? (crypto as any).randomUUID()
          : `cv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      jobIdRef.current = jobId;

      const inspector = {
        inspector_name: (user as any)?.username || (user as any)?.name || "",
        company_name: (user as any)?.companyName || "",
        contact_email: (user as any)?.contactEmail || user?.email || "",
        contact_phone: (user as any)?.contactPhone || "",
        credentials: "",
      };
      const payload: RealEstateDetails = {
        ...details,
        property_type: property.propertyType,
        report_dates: {
          report_date: details.report_dates.report_date,
          effective_date: details.report_dates.effective_date,
          inspection_date: details.report_dates.inspection_date,
        },
        inspector_info: inspector,
      };
      payload.progress_id = jobId;

      // Separate main images (for AI) and extra images (for report only)
      const mainImages: File[] = [...property.mainImages];
      const extraImages: File[] = [...property.extraImages];
      // Add map image to extra images if available
      if (mapImage) {
        extraImages.push(mapImage);
      }
      // Videos from property (if RealEstateSection supports videos)
      const videos: File[] = (property as any).videos || [];

      const startPolling = () => {
        if (!jobIdRef.current || pollStartedRef.current) return;
        pollStartedRef.current = true;
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = setInterval(async () => {
          try {
            const rec = await RealEstateService.progress(jobIdRef.current!);
            const clientWeight = PROG_WEIGHTS.client_upload;
            const server01 = Math.max(
              0,
              Math.min(1, rec?.serverProgress01 ?? 0)
            );
            const overall =
              (clientWeight + server01 * (1 - clientWeight)) * 100;
            setProgressPhase(
              rec.phase === "error"
                ? "error"
                : rec.phase === "done"
                ? "done"
                : "processing"
            );
            setProgressPercent((prev) => (overall > prev ? overall : prev));
            if (rec.message) setError(rec.message);
            if (rec.phase === "done" || rec.phase === "error") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
            }
          } catch (err) {
            // Ignore early 404/network hiccups
          }
        }, 800);
      };

      const res = await RealEstateService.create(
        payload,
        mainImages,
        extraImages,
        videos,
        {
          onUploadProgress: (fraction: number) => {
            const pct = Math.max(0, Math.min(1, fraction));
            const weighted = pct * PROG_WEIGHTS.client_upload * 100;
            setProgressPhase("upload");
            setProgressPercent((prev) => (weighted > prev ? weighted : prev));
            if (weighted >= PROG_WEIGHTS.client_upload * 100 - 0.5) {
              setStepStates((prev) => ({
                ...prev,
                client_upload: "done",
                r2_upload:
                  prev.r2_upload === "pending" ? "active" : prev.r2_upload,
              }));
              startPolling();
            }
          },
        }
      );

      startPolling();

      const successMsg =
        res?.message ||
        "Your report is being processed. You will receive an email when it's ready.";
      toast.info(successMsg);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("cv:report-created"));
      }
      onSuccess?.(res?.message);
      setProgressPhase("done");
      setProgressPercent((prev) => (prev < 100 ? 100 : prev));
    } catch (err: any) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setProgressPhase("error");
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create report";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={onSubmit}>
      <div className="relative flex min-h-full flex-col gap-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="mb-2 flex items-start justify-between gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Real Estate Appraisal</h2>
            <p className="mt-1 text-sm text-gray-600">
              Capture property details, supporting files, photos, and valuation notes.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Row 1: Property Type & Images + AI Assist */}
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-lg border border-rose-100 bg-gradient-to-br from-white via-rose-50/30 to-white p-3 shadow-sm">
            <RealEstateSection
              value={property}
              onChange={setProperty}
              maxImages={50}
              downloadPrefix={(details?.property_details?.address || "real-estate").replace(/[^a-zA-Z0-9_-]/g, "-")}
            />
          </div>
          <AIAssistSection
            specFiles={specFiles}
            onSpecChange={handleSpecChange}
            onRemoveSpecFile={removeSpecFile}
            onAnalyzeSpec={analyzeSpec}
            notesText={notesText}
            onNotesChange={setNotesText}
            onFillFromText={fillFromText}
            audioBlob={audioBlob}
            audioUrl={audioUrl}
            isRecording={isRecording}
            onStartRecording={startRecording}
            onStopRecording={stopRecording}
            onUseRecording={useRecording}
            onClearRecording={clearRecording}
            aiLoading={aiLoading}
          />
        </div>

        {/* Row 2: Property Details + Building Details */}
        <div className="grid gap-2 lg:grid-cols-2">
          <PropertyDetailsSection
            details={details}
            onChange={handleChange}
            onLanguageChange={(lang) => setDetails((prev) => ({ ...prev, language: lang }))}
          />
          <BuildingDetailsSection
            details={details}
            onChange={handleChange}
            onKnownIssuesChange={handleKnownIssuesChange}
          />
        </div>

        {/* Row 3: Farmland (if agricultural) + Map */}
        <div className="grid gap-2 lg:grid-cols-2">
          {details.property_type === "agricultural" ? (
            <FarmlandDetailsSection details={details} onChange={handleFarmlandChange} />
          ) : (
            <div className="hidden lg:block" />
          )}
          <MapUploadSection
            mapImage={mapImage}
            onMapImageChange={handleMapImageChange}
            onRemoveMapImage={removeMapImage}
          />
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-2 border-t border-gray-200/80 bg-white/85 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur sm:flex-row sm:items-center">
          <button type="button" className="rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:bg-gray-50" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100" onClick={saveInputs} disabled={submitting}>
            <Save className="h-3 w-3" />Save
          </button>
          <button type="submit" className="inline-flex items-center justify-center gap-1 rounded bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 sm:ml-auto" disabled={submitting}>
            {submitting ? "..." : "Create"}{!submitting && <Check className="h-3 w-3" />}
          </button>
        </div>

        {/* Progress */}
        {submitting && (
          <div className="rounded-lg border border-rose-100 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-1 mb-2">
              {STEPS.map((s, idx) => {
                const state = stepStates[s.key];
                const isDone = state === "done";
                const isActive = state === "active";
                return (
                  <div key={s.key} className="flex flex-1 items-center">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${isDone ? "border-rose-600 bg-rose-600 text-white" : isActive ? "border-rose-600 text-rose-600 animate-pulse" : "border-gray-300 text-gray-400"}`} title={s.label}>
                      {isDone ? <Check className="h-2.5 w-2.5" /> : idx + 1}
                    </div>
                    {idx < STEPS.length - 1 && <div className="mx-0.5 h-0.5 flex-1 rounded bg-gray-200"><div className={`h-0.5 rounded ${isDone ? "bg-rose-500" : isActive ? "bg-rose-300" : ""}`} /></div>}
                  </div>
                );
              })}
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div className="h-1 rounded-full bg-rose-500 transition-all" style={{ width: `${Math.min(100, Math.max(0, progressPercent)).toFixed(0)}%` }} />
            </div>
            <div className="mt-1 text-[10px] text-gray-500">{progressPhase === "upload" ? "Uploading..." : progressPhase === "processing" ? "Processing..." : progressPhase === "done" ? "Done!" : progressPhase === "error" ? "Error" : "Starting..."}</div>
          </div>
        )}
      </div>
    </form>
  );
}
