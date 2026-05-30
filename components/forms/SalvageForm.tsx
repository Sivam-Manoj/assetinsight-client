"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import { SalvageService, type SalvageDetails } from "@/services/salvage";
import { X, Upload, Camera, Download } from "lucide-react";
import { toast } from "react-toastify";
import Loading from "@/components/common/Loading";
import SalvageCamera from "./salvage/SalvageCamera";
import ImageAnnotatorModal from "./salvage/ImageAnnotatorModal";
import JSZip from "jszip";

type Props = {
  onSuccess?: (message?: string) => void;
  onCancel?: () => void;
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export default function SalvageForm({ onSuccess, onCancel }: Props) {
  const { user } = useAuthContext();

  const [details, setDetails] = useState<SalvageDetails>({
    report_date: isoDate(new Date()),
    file_number: "",
    date_received: isoDate(new Date()),
    claim_number: "",
    policy_number: "",
    appraiser_name: (user as any)?.username || (user as any)?.name || "",
    appraiser_phone: (user as any)?.contactPhone || "",
    appraiser_email: (user as any)?.contactEmail || (user as any)?.email || "",
    adjuster_name: "",
    insured_name: "",
    company_name: (user as any)?.companyName || "",
    company_address: (user as any)?.companyAddress || "",
    appraiser_comments: "",
    next_report_due: isoDate(new Date()),
    language: "en",
    currency: "",
  });

  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [annotOpen, setAnnotOpen] = useState(false);
  const [annotIndex, setAnnotIndex] = useState<number | null>(null);
  const [annotFile, setAnnotFile] = useState<File | null>(null);
  // Currency detection state
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const currencyPromptedRef = useRef(false);

  // No client-side polling/progress UI; background job emails on completion

  function handleChange<K extends keyof SalvageDetails>(key: K, value: string) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function handleImagesChange(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files);
    setImages((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > 30) {
        setError("You can upload up to 30 images. Extra files were ignored.");
      } else {
        setError(null);
      }
      return combined.slice(0, 30);
    });
  }

  function addCapturedImages(files: File[]) {
    if (!files || files.length === 0) return;
    setImages((prev) => {
      const combined = [...prev, ...files];
      if (combined.length > 30) {
        toast.warn(
          "Reached maximum of 30 images. Some captures were not added."
        );
      }
      return combined.slice(0, 30);
    });
  }

  useEffect(() => {
    const urls = images.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [images]);

  async function downloadAllImagesZip() {
    try {
      if (images.length === 0) return;
      const zip = new JSZip();
      for (const f of images) zip.file(f.name, f);
      const safePrefix = (
        details.file_number ||
        details.claim_number ||
        "salvage"
      ).replace(/[^a-zA-Z0-9_-]/g, "-");
      const blob = await zip.generateAsync({ type: "blob" });
      const zipName = `${safePrefix}-images-${Date.now()}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 2000);
    } catch {}
  }

  // Currency: locale fallback
  const applyLocaleFallbackCurrency = () => {
    try {
      const lang =
        typeof navigator !== "undefined" && (navigator as any).language
          ? (navigator as any).language
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
      if (!currencyTouched)
        setDetails((prev) => ({
          ...prev,
          currency: prev.currency || detected,
        }));
    } catch {}
  };

  // On first open, use browser geolocation to detect currency
  useEffect(() => {
    if (currencyPromptedRef.current) return;
    currencyPromptedRef.current = true;
    if (currencyTouched) return;
    setCurrencyLoading(true);
    try {
      if (typeof navigator === "undefined" || !(navigator as any).geolocation) {
        applyLocaleFallbackCurrency();
        setCurrencyLoading(false);
        return;
      }
      (navigator as any).geolocation.getCurrentPosition(
        async (pos: any) => {
          try {
            const { latitude, longitude } = pos.coords || ({} as any);
            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
              setCurrencyLoading(false);
              return;
            }
            const res = await fetch("/api/ai/currency", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat: latitude, lng: longitude }),
            });
            if (!res.ok) {
              applyLocaleFallbackCurrency();
              return;
            }
            const data = await res.json();
            const cc = String(data?.currency || "").toUpperCase();
            if (!currencyTouched && /^[A-Z]{3}$/.test(cc)) {
              setDetails((prev) => ({ ...prev, currency: cc }));
            } else {
              applyLocaleFallbackCurrency();
            }
          } catch {
          } finally {
            setCurrencyLoading(false);
          }
        },
        () => {
          setCurrencyLoading(false);
          applyLocaleFallbackCurrency();
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    } catch {
      setCurrencyLoading(false);
    }
  }, [currencyTouched]);

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function openAnnotator(index: number) {
    const f = images[index];
    if (!f) return;
    setAnnotIndex(index);
    setAnnotFile(f);
    setAnnotOpen(true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Basic required field checks mirroring backend required fields
    const required: (keyof SalvageDetails)[] = [
      "report_date",
      "file_number",
      "date_received",
      "claim_number",
      "policy_number",
      "appraiser_name",
      "appraiser_phone",
      "appraiser_email",
      "adjuster_name",
      "insured_name",
      "company_name",
      "company_address",
      "appraiser_comments",
      "next_report_due",
    ];

    const missing = required.filter((k) => !String(details[k] || "").trim());
    if (missing.length > 0) {
      const msg = `Please fill: ${missing.join(", ")}`;
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload: SalvageDetails = {
        ...details,
        report_date: details.report_date,
        date_received: details.date_received,
        next_report_due: details.next_report_due,
      };

      const res = await SalvageService.create(payload, images);
      const msg =
        res?.message ||
        "Your report is being processed. You will receive an email when it's ready.";
      toast.info(msg);
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("cv:report-created"));
        }
      } catch {}
      // Clear local form state and notify parent to close
      setImages([]);
      setPreviews([]);
      onSuccess?.(msg);
    } catch (err: any) {
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
      <div className="relative flex min-h-full flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-blue-100 bg-white/80 p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-gray-950">Salvage Appraisal</h2>
            <p className="mt-1 text-sm text-gray-600">
              Record claim details, vehicle information, damage notes, and photos.
            </p>
          </div>
        </div>

        {!submitting && error && (
          <div className="rounded-xl border border-red-200/70 bg-red-50/80 p-3 text-sm text-red-700 shadow ring-1 ring-black/5 backdrop-blur">
            {error}
          </div>
        )}

        {/* Report & File Info */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Report Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Report Date
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.report_date}
                onChange={(e) => handleChange("report_date", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Date Received
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.date_received}
                onChange={(e) => handleChange("date_received", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Next Report Due
              </label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.next_report_due}
                onChange={(e) =>
                  handleChange("next_report_due", e.target.value)
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                File Number
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.file_number}
                onChange={(e) => handleChange("file_number", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Claim Number
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.claim_number}
                onChange={(e) => handleChange("claim_number", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Policy Number
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.policy_number}
                onChange={(e) => handleChange("policy_number", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Language
              </label>
              <select
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.language || "en"}
                onChange={(e) =>
                  handleChange("language", e.target.value as any)
                }
              >
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Currency (ISO code){" "}
                {currencyLoading && (
                  <span className="ml-1 text-[11px] text-gray-500">
                    Detecting…
                  </span>
                )}
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.currency || ""}
                onChange={(e) => {
                  setCurrencyTouched(true);
                  handleChange(
                    "currency",
                    e.target.value.toUpperCase().slice(0, 3)
                  );
                }}
                disabled={currencyLoading && !currencyTouched}
                placeholder={
                  currencyLoading ? "Detecting…" : "e.g., CAD, USD, EUR"
                }
              />
            </div>
          </div>
        </section>

        {/* Parties & Contacts */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Contacts</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Appraiser Name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.appraiser_name}
                onChange={(e) => handleChange("appraiser_name", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Appraiser Phone
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.appraiser_phone}
                onChange={(e) =>
                  handleChange("appraiser_phone", e.target.value)
                }
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Appraiser Email
              </label>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.appraiser_email}
                onChange={(e) =>
                  handleChange("appraiser_email", e.target.value)
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Adjuster Name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.adjuster_name}
                onChange={(e) => handleChange("adjuster_name", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Insured Name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.insured_name}
                onChange={(e) => handleChange("insured_name", e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Company Name
              </label>
              <input
                className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
                value={details.company_name}
                onChange={(e) => handleChange("company_name", e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Company Address
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
              value={details.company_address}
              onChange={(e) => handleChange("company_address", e.target.value)}
            />
          </div>
        </section>

        {/* Comments */}
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-gray-900">Comments</h3>
          <div>
            <label className="block text-xs font-medium text-gray-700">
              Appraiser Comments
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-gray-200/70 bg-white/80 px-3 py-2 text-sm text-gray-900 shadow-inner ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-rose-300"
              rows={3}
              value={details.appraiser_comments}
              onChange={(e) =>
                handleChange("appraiser_comments", e.target.value)
              }
            />
          </div>
        </section>

        {/* Images */}
        <section className="space-y-3 pb-4 sm:pb-6">
          <h3 className="text-sm font-medium text-gray-900">Images (max 30)</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => {
              handleImagesChange(e.target.files);
              e.currentTarget.value = "";
            }}
            className="sr-only"
          />
          <div className="rounded-2xl border-2 border-dashed border-gray-300/70 bg-gradient-to-br from-white/70 to-gray-50/50 p-5 text-center backdrop-blur shadow-inner">
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <p className="mt-2 text-sm text-gray-700">Add images</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-gray-900 to-black px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_0_0_rgba(0,0,0,0.5)] transition active:translate-y-0.5 active:shadow-[0_2px_0_0_rgba(0,0,0,0.5)] focus:outline-none cursor-pointer"
              >
                <Upload className="h-4 w-4" />
                Select Images
              </button>
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_0_0_rgba(190,18,60,0.5)] transition active:translate-y-0.5 active:shadow-[0_2px_0_0_RGBA(190,18,60,0.5)] focus:outline-none cursor-pointer"
              >
                <Camera className="h-4 w-4" />
              Open Camera
            </button>
            <button
              type="button"
              onClick={downloadAllImagesZip}
              disabled={images.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 border border-gray-200 shadow disabled:opacity-50 cursor-pointer"
              title="Download images as ZIP"
            >
              <Download className="h-4 w-4" />
              Download ZIP
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">PNG, JPG. Up to 30 images.</p>
        </div>
        <p className="text-xs text-gray-500">Selected: {images.length} file(s)</p>
          {images.length > 0 && (
            <div className="rounded-2xl border border-gray-200/70 bg-white/70 p-2 shadow ring-1 ring-black/5 backdrop-blur">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {previews.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative group overflow-hidden rounded-xl shadow-md transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={images[idx]?.name || `image-${idx + 1}`}
                      className="h-28 w-full object-cover cursor-crosshair"
                      onClick={() => openAnnotator(idx)}
                    />
                    {/* Edit overlay button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAnnotator(idx);
                      }}
                      className="absolute left-1 bottom-1 rounded-full bg-black/70 px-2 py-1 text-[11px] text-white shadow-lg hover:bg-black/80 transition cursor-pointer"
                      aria-label="Edit image"
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(idx);
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1.5 text-white shadow-lg hover:bg-black/80 transition cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="sticky bottom-0 z-10 mt-auto flex flex-col gap-2 border-t border-gray-200/80 bg-white/85 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur sm:flex-row sm:items-center">
          <button
            type="button"
            className="rounded-xl border border-gray-200 bg-white/80 px-4 py-2.5 text-sm text-gray-700 shadow hover:bg-white transition active:translate-y-0.5 cursor-pointer"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-rose-500 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_0_0_rgba(190,18,60,0.5)] hover:from-rose-400 hover:to-rose-600 transition active:translate-y-0.5 active:shadow-[0_2px_0_0_rgba(190,18,60,0.5)] disabled:opacity-50 cursor-pointer sm:ml-auto"
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create Report"}
          </button>
        </div>
        {submitting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
            <Loading
              message="Creating your report..."
              height={220}
              width={220}
            />
          </div>
        )}
      </div>
      {/* Camera overlay for capture */}
      <SalvageCamera
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onAdd={(files) => addCapturedImages(files)}
        downloadPrefix={(
          details.file_number ||
          details.claim_number ||
          "salvage"
        ).replace(/[^a-zA-Z0-9_-]/g, "-")}
        maxCount={30}
      />
      {/* Annotator modal for drawing/text */}
      <ImageAnnotatorModal
        open={annotOpen}
        file={annotFile}
        onClose={() => setAnnotOpen(false)}
        onSave={(annotated) => {
          if (annotIndex == null) return;
          setImages((prev) =>
            prev.map((f, i) => (i === annotIndex ? annotated : f))
          );
          setAnnotOpen(false);
        }}
      />
    </form>
  );
}
