import API from "@/lib/api";

export type ReportStatus = 'draft' | 'processing' | 'preview' | 'pending_approval' | 'approved' | 'declined' | 'error';

export interface AssetReport {
  _id: string;
  user: string;
  grouping_mode: string;
  imageUrls: string[];
  status: ReportStatus;
  files_generating?: boolean;
  files_regenerating?: boolean;
  job_id?: string;
  job_status?: "queued" | "processing" | "done" | "error";
  job_error?: string;
  preview_data?: any;
  preview_files?: {
    pdf?: string;
    spec_pdf?: string;
    cr_docx?: string;
    docx?: string;
    excel?: string;
    images?: string;
  };
  preview_submitted_at?: string;
  approval_requested_at?: string;
  approval_processed_at?: string;
  decline_reason?: string;
  release_status?: "pending_release" | "released";
  release_assigned_to?: string | { _id?: string; email?: string; username?: string } | null;
  released_at?: string | null;
  downloadable?: boolean;
  lots: any[];
  client_name?: string;
  contract_no?: string;
  effective_date?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewDataResponse {
  message: string;
  data: {
    status: ReportStatus;
    files_generating?: boolean;
    files_regenerating?: boolean;
    preview_data: any;
    preview_files?: {
      pdf?: string;
      spec_pdf?: string;
      cr_docx?: string;
      docx?: string;
      excel?: string;
      images?: string;
    };
    grouping_mode?: string;
    image_count?: number;
    imageUrls?: string[];
    decline_reason?: string;
    release_status?: "pending_release" | "released";
    release_assigned_to?: string | { _id?: string; email?: string; username?: string } | null;
    released_at?: string | null;
    downloadable?: boolean;
    reportId: string;
  };
}

export interface AssetCategorySpec {
  parentCategory: string;
  childCategory: string;
  fields: string[];
}

export const getAssetCategorySpecs = async (): Promise<{
  categories: string[];
  specs: AssetCategorySpec[];
}> => {
  const { data } = await API.get<{
    message: string;
    data: { categories: string[]; specs: AssetCategorySpec[] };
  }>(`/asset/category-specs`);
  return data.data;
};

/**
 * Get preview data for editing
 */
export const getPreviewData = async (reportId: string): Promise<PreviewDataResponse> => {
  const { data } = await API.get<PreviewDataResponse>(`/asset/${reportId}/preview`);
  return data;
};

/**
 * Update preview data with user edits
 */
export const updatePreviewData = async (
  reportId: string,
  previewData: any
): Promise<{ message: string; data: any; files_regeneration_queued?: boolean }> => {
  const { data } = await API.put<{ message: string; data: any; files_regeneration_queued?: boolean }>(
    `/asset/${reportId}/preview`,
    { preview_data: previewData }
  );
  return data;
};

export const uploadPreviewLotImages = async (
  reportId: string,
  lotKey: string | number,
  files: File[],
  previewData?: any,
  onProgress?: (progress: number) => void
): Promise<{
  message: string;
  data: {
    preview_data: any;
    preview_files?: AssetReport["preview_files"];
    imageUrls?: string[];
    image_count?: number;
    added?: Array<{ index: number; url: string; name: string }>;
    lotIndex?: number;
    files_generating?: boolean;
    files_regenerating?: boolean;
  };
  files_regeneration_queued?: boolean;
}> => {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));
  if (previewData) {
    formData.append("preview_data", JSON.stringify(previewData));
  }

  const { data } = await API.post(
    `/asset/${reportId}/preview/lots/${encodeURIComponent(String(lotKey))}/images`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (!onProgress || !event.total) return;
        onProgress(Math.min(100, Math.round((event.loaded * 100) / event.total)));
      },
    }
  );
  return data;
};

export const refreshAssetSpecPdf = async (
  reportId: string
): Promise<{
  message: string;
  data: { spec_pdf: string; cr_docx?: string; preview_files?: AssetReport["preview_files"]; preview_data?: any };
}> => {
  const { data } = await API.post<{
    message: string;
    data: { spec_pdf: string; cr_docx?: string; preview_files?: AssetReport["preview_files"]; preview_data?: any };
  }>(`/asset/${reportId}/preview/spec-pdf`, {});
  return data;
};

/**
 * Submit report for admin approval
 */
export const submitForApproval = async (
  reportId: string
): Promise<{ message: string; data: any }> => {
  const { data } = await API.post<{ message: string; data: any }>(
    `/asset/${reportId}/submit-approval`,
    {}
  );
  return data;
};

/**
 * Approve report (Admin only)
 */
export const approveReport = async (
  reportId: string
): Promise<{ message: string; data: any }> => {
  const { data } = await API.post<{ message: string; data: any }>(
    `/asset/${reportId}/approve`,
    {}
  );
  return data;
};

/**
 * Decline report (Admin only)
 */
export const declineReport = async (
  reportId: string,
  reason: string
): Promise<{ message: string; data: any }> => {
  const { data } = await API.post<{ message: string; data: any }>(
    `/asset/${reportId}/decline`,
    { reason }
  );
  return data;
};

/**
 * Get all asset reports
 */
export const getAssetReports = async (): Promise<{ message: string; data: AssetReport[] }> => {
  const { data } = await API.get<{ message: string; data: AssetReport[] }>(`/asset`);
  return data;
};

/**
 * Get submitted reports (pending_approval and approved)
 */
export const getSubmittedReports = async (): Promise<{ message: string; data: AssetReport[] }> => {
  const { data } = await API.get<{ message: string; data: AssetReport[] }>(`/asset/submitted`);
  return data;
};

export interface SubmittedPreviewDataResponse {
  message: string;
  data: {
    status: ReportStatus;
    files_generating?: boolean;
    files_regenerating?: boolean;
    preview_data: any;
    preview_files?: {
      pdf?: string;
      spec_pdf?: string;
      docx?: string;
      excel?: string;
      images?: string;
    };
    grouping_mode?: string;
    image_count?: number;
    imageUrls?: string[];
    reportId: string;
    createdAt: string;
    preview_submitted_at?: string;
    approval_requested_at?: string;
  };
}

/**
 * Get preview data for submitted reports (pending/approved)
 */
export const getSubmittedPreviewData = async (reportId: string): Promise<SubmittedPreviewDataResponse> => {
  const { data } = await API.get<SubmittedPreviewDataResponse>(`/asset/${reportId}/submitted-preview`);
  return data;
};

/**
 * Resubmit report - edit and regenerate files for approved/pending reports
 */
export const resubmitReport = async (
  reportId: string,
  previewData?: any
): Promise<{ message: string; data: any }> => {
  const { data } = await API.post<{ message: string; data: any }>(
    `/asset/${reportId}/resubmit`,
    previewData ? { preview_data: previewData } : {}
  );
  return data;
};

/**
 * Delete an asset report
 */
export const deleteAssetReport = async (
  reportId: string
): Promise<{ message: string; data: { reportId: string } }> => {
  const { data } = await API.delete<{ message: string; data: { reportId: string } }>(
    `/asset/${reportId}`
  );
  return data;
};
