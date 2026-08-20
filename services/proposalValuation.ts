import API from "@/lib/api";
import type {
  ProposalValuationPayload,
  ProposalValuationSheet,
} from "@/components/reports/proposal-valuation/types";

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as {
    response?: { data?: { message?: string } };
    message?: string;
  };
  return candidate?.response?.data?.message || candidate?.message || fallback;
}

export const ProposalValuationService = {
  async get(reportId: string, signal?: AbortSignal) {
    try {
      const { data } = await API.get<ProposalValuationPayload>(
        `/asset/${encodeURIComponent(reportId)}/proposal-valuation`,
        { signal }
      );
      return data;
    } catch (error) {
      throw new Error(errorMessage(error, "Unable to load Proposal Valuation."));
    }
  },

  async save(reportId: string, assetScheduleSheet: ProposalValuationSheet) {
    try {
      const { data } = await API.patch<ProposalValuationPayload>(
        `/asset/${encodeURIComponent(reportId)}/proposal-valuation`,
        { assetScheduleSheet }
      );
      return data;
    } catch (error) {
      throw new Error(errorMessage(error, "Unable to save Proposal Valuation."));
    }
  },
};
