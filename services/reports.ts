import API from "@/lib/api";

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
  fileType?: 'pdf' | 'spec_pdf' | 'docx' | 'xlsx' | 'images';
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvalNote?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  contract_no?: string;
  valuationMethods?: Array<{ method: string; value: number }>;
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

  async deleteReport(id: string): Promise<{ message: string }> {
    const { data } = await API.delete<{ message: string }>(`/reports/${id}`);
    return data;
  },
};
