import API from "@/lib/api";
import type { AxiosProgressEvent } from "axios";

// Matches the shared web/mobile backend multipart limit.
export const SALVAGE_MAX_IMAGES = 30;

export type SalvageDetails = {
  report_date: string; // ISO date string (yyyy-mm-dd)
  file_number: string;
  date_received: string; // ISO date string
  claim_number: string;
  policy_number: string;
  appraiser_name: string;
  appraiser_phone: string;
  appraiser_email: string;
  adjuster_name: string;
  insured_name: string;
  company_name: string;
  company_address: string;
  appraiser_comments: string;
  next_report_due: string; // ISO date string
  language?: 'en' | 'fr' | 'es';
  currency?: string; // ISO code, e.g., CAD, USD, EUR
  // Background progress id (optional, server will use it if provided)
  progress_id?: string;
};

export type SalvageCreateResponse = {
  message: string;
  // Background job ack
  jobId?: string;
  phase?: "upload" | "processing" | "done" | "error";
  // Legacy immediate response fields (if any)
  filePath?: string;
  pdfPath?: string;
  docxPath?: string;
  xlsxPath?: string;
};

export type CreateOptions = {
  onUploadProgress?: (fraction: number) => void;
};

export const SalvageService = {
  async create(details: SalvageDetails, images: File[], options?: CreateOptions): Promise<SalvageCreateResponse> {
    if (images.length > SALVAGE_MAX_IMAGES) {
      throw new Error(`Salvage reports support up to ${SALVAGE_MAX_IMAGES} images. Remove extra images before submitting.`);
    }
    const fd = new FormData();
    fd.append("details", JSON.stringify(details));
    images.forEach((file) => fd.append("images", file));

    const { data } = await API.post<SalvageCreateResponse>("/salvage", fd, {
      onUploadProgress: (e: AxiosProgressEvent) => {
        if (!options?.onUploadProgress) return;
        let fraction = typeof e.progress === "number" ? e.progress : 0;
        if (!fraction && typeof e.loaded === "number" && typeof e.total === "number" && e.total > 0) {
          fraction = e.loaded / e.total;
        }
        options.onUploadProgress(Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0);
      },
    });
    return data;
  },
  async progress(id: string) {
    const { data } = await API.get(`/salvage/progress/${id}`);
    return data as {
      id: string;
      phase: "upload" | "processing" | "done" | "error";
      serverProgress01: number;
      steps: Array<{ key: string; label: string; startedAt?: string; endedAt?: string; durationMs?: number }>;
      message?: string;
    };
  },
};
