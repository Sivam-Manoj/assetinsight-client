import API from "@/lib/api";
import type { SubmittedPreviewDataResponse } from "@/services/assets";

export type ReportStats = {
  totalReports: number;
  totalFairMarketValue: number;
  breakdown?: {
    counts: Record<string, number>;
    values: Record<string, number>;
  };
};

export type PdfReport = {
  _id: string;
  filename: string;
  address: string;
  fairMarketValue: string;
  createdAt: string; // ISO string
  report?: string; // underlying report id for grouping
  type?: string;
  fileType?: 'pdf' | 'spec_pdf' | 'cr_docx' | 'docx' | 'xlsx' | 'images';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalNote?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  contract_no?: string;
  url?: string;
  crReportId?: string;
  valuationMethods?: Array<{ method: string; value: number }>;
};

export type AssignedApproval = PdfReport & {
  reportType: "Asset" | "RealEstate" | "Salvage";
  user?: { _id?: string; email?: string; username?: string };
  isAssetReport?: boolean;
  isRealEstateReport?: boolean;
  preview_files?: Record<string, string>;
};

export const ReportsService = {
  async getReportStats(): Promise<ReportStats> {
    const { data } = await API.get<ReportStats>("/reports/stats");
    return data;
  },

  async getMyReports(): Promise<PdfReport[]> {
    const { data } = await API.get<PdfReport[]>("/reports/myreports");
    return data;
  },

  async downloadReport(id: string): Promise<{ blob: Blob; filename?: string }> {
    const response = await API.get<Blob>(`/reports/${id}/download`, {
      responseType: "blob" as const,
    });
    const disposition = (response.headers as any)["content-disposition"] as
      | string
      | undefined;
    let filename: string | undefined;
    if (disposition) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, "").trim();
      }
    }
    return { blob: response.data, filename };
  },

  async downloadCr(reportId: string): Promise<{ blob: Blob; filename?: string }> {
    const response = await API.get<Blob>(`/reports/${reportId}/cr/download`, {
      responseType: "blob" as const,
    });
    const disposition = (response.headers as any)["content-disposition"] as
      | string
      | undefined;
    let filename: string | undefined;
    if (disposition) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, "").trim();
      }
    }
    return { blob: response.data, filename };
  },

  async downloadCrDocx(reportId: string): Promise<{ blob: Blob; filename?: string }> {
    const response = await API.get<Blob>(`/reports/${reportId}/cr-docx`, {
      responseType: "blob" as const,
    });
    const disposition = (response.headers as any)["content-disposition"] as
      | string
      | undefined;
    let filename: string | undefined;
    if (disposition) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match && match[1]) {
        filename = match[1].replace(/['"]/g, "").trim();
      }
    }
    return { blob: response.data, filename };
  },

  async deleteReport(id: string): Promise<{ message: string }> {
    const { data } = await API.delete<{ message: string }>(`/reports/${id}`);
    return data;
  },

  async getAssignedApprovals(): Promise<{ items: AssignedApproval[]; total: number }> {
    const { data } = await API.get<{ items: AssignedApproval[]; total: number }>(
      "/reports/assigned-approvals"
    );
    return data;
  },

  async approveAssignedApproval(id: string): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>(
      `/reports/assigned-approvals/${id}/approve`
    );
    return data;
  },

  async rejectAssignedApproval(id: string, note: string): Promise<{ message: string }> {
    const { data } = await API.post<{ message: string }>(
      `/reports/assigned-approvals/${id}/reject`,
      { note }
    );
    return data;
  },

  async getAssignedAssetPreview(id: string): Promise<SubmittedPreviewDataResponse> {
    const { data } = await API.get<SubmittedPreviewDataResponse>(
      `/reports/assigned-approvals/${id}/asset-preview`
    );
    return data;
  },

  async updateAssignedAssetPreview(
    id: string,
    previewData: any
  ): Promise<{ message: string; data: any; files_regeneration_queued?: boolean }> {
    const { data } = await API.put<{ message: string; data: any; files_regeneration_queued?: boolean }>(
      `/reports/assigned-approvals/${id}/asset-preview`,
      { preview_data: previewData }
    );
    return data;
  },

  async resubmitAssignedAssetPreview(
    id: string,
    previewData?: any
  ): Promise<{ message: string; data: any }> {
    const { data } = await API.post<{ message: string; data: any }>(
      `/reports/assigned-approvals/${id}/resubmit`,
      previewData ? { preview_data: previewData } : {}
    );
    return data;
  },
};
