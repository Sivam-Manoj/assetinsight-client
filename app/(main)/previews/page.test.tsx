import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetReport } from "@/services/assets";
import type { LotListing } from "@/services/lotListing";
import PreviewsPage from "./page";

const mocks = vi.hoisted(() => ({
  dynamicIndex: 0,
  getAssetReports: vi.fn(),
  getSubmittedReports: vi.fn(),
  getLotListings: vi.fn(),
  getSubmittedLotListings: vi.fn(),
  getRealEstateReports: vi.fn(),
  deleteAssetReport: vi.fn(),
  deleteLotListing: vi.fn(),
  resubmitReport: vi.fn(),
  resubmitLotListing: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const componentIndex = mocks.dynamicIndex++;
    function DeferredDialog({
      isOpen,
      reportId,
      isResubmitMode,
    }: {
      isOpen?: boolean;
      reportId?: string;
      isResubmitMode?: boolean;
    }) {
      if (!isOpen) return null;
      if (componentIndex === 1) {
        return (
          <div
            role="dialog"
            aria-label={`Asset preview editor: ${reportId}`}
            data-resubmit={isResubmitMode}
          />
        );
      }
      if (componentIndex === 2) {
        return (
          <div
            role="dialog"
            aria-label={`Real Estate preview editor: ${reportId}`}
          />
        );
      }
      if (componentIndex === 3) {
        return (
          <div
            role="dialog"
            aria-label={`Lot Listing preview editor: ${reportId}`}
            data-resubmit={isResubmitMode}
          />
        );
      }
      return null;
    }
    return DeferredDialog;
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/services/assets", () => ({
  getAssetReports: mocks.getAssetReports,
  getSubmittedReports: mocks.getSubmittedReports,
  deleteAssetReport: mocks.deleteAssetReport,
  resubmitReport: mocks.resubmitReport,
}));

vi.mock("@/services/lotListing", () => ({
  getLotListings: mocks.getLotListings,
  getSubmittedLotListings: mocks.getSubmittedLotListings,
  deleteLotListing: mocks.deleteLotListing,
  resubmitLotListing: mocks.resubmitLotListing,
}));

vi.mock("@/services/realEstate", () => ({
  RealEstateService: {
    getReports: mocks.getRealEstateReports,
    deleteReport: vi.fn(),
  },
}));

const assetPreview: AssetReport = {
  _id: "asset-preview-action",
  user: "user-1",
  grouping_mode: "lot",
  imageUrls: [],
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "queued",
  job_status: "processing",
  files_generating: false,
  lots: [{ lot_number: "1" }],
  client_name: "Asset Preview Client",
  contract_no: "CV-ASSET-ACTION",
  createdAt: "2026-08-03T08:00:00.000Z",
  updatedAt: "2026-08-03T08:30:00.000Z",
};

const lotListingPreview: LotListing = {
  _id: "lot-preview-action",
  user: "user-1",
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "processing",
  job_status: "queued",
  files_generating: false,
  details: {
    contract_no: "CV-LOT-ACTION",
    currency: "GBP",
  },
  lots: [
    {
      lot_id: "lot-1",
      lot_number: "1",
      image_indexes: [],
    },
  ],
  imageUrls: [],
  createdAt: "2026-08-03T09:00:00.000Z",
  updatedAt: "2026-08-03T09:30:00.000Z",
};

describe("Preview queue affordances", () => {
  beforeEach(() => {
    mocks.getAssetReports.mockReset().mockResolvedValue({
      data: [assetPreview],
    });
    mocks.getSubmittedReports.mockReset().mockResolvedValue({ data: [] });
    mocks.getLotListings.mockReset().mockResolvedValue({
      data: [lotListingPreview],
    });
    mocks.getSubmittedLotListings.mockReset().mockResolvedValue({ data: [] });
    mocks.getRealEstateReports.mockReset().mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("keeps an Asset preview action visible and opens the exact lazy editor", async () => {
    render(<PreviewsPage />);

    const action = await screen.findByRole("button", {
      name: "Preview Asset report: Asset Preview Client",
    });
    expect(action).toBeVisible();
    fireEvent.click(action);

    expect(
      screen.getByRole("dialog", {
        name: "Asset preview editor: asset-preview-action",
      })
    ).toHaveAttribute("data-resubmit", "false");
    expect(
      screen.queryByRole("dialog", {
        name: /Lot Listing preview editor/,
      })
    ).not.toBeInTheDocument();
  });

  it("keeps a Lot Listing preview action visible and opens the exact lazy editor", async () => {
    render(<PreviewsPage />);

    const action = await screen.findByRole("button", {
      name: "Preview Lot Listing report: CV-LOT-ACTION",
    });
    expect(action).toBeVisible();
    fireEvent.click(action);

    expect(
      screen.getByRole("dialog", {
        name: "Lot Listing preview editor: lot-preview-action",
      })
    ).toHaveAttribute("data-resubmit", "false");
    expect(
      screen.queryByRole("dialog", {
        name: /Asset preview editor/,
      })
    ).not.toBeInTheDocument();
  });

  it("opens the exact Lot Listing editor from a preview deep link", async () => {
    window.history.replaceState(
      {},
      "",
      "/previews?reportId=lot-preview-action&reportType=lotListing"
    );

    render(<PreviewsPage />);

    expect(
      await screen.findByRole("dialog", {
        name: "Lot Listing preview editor: lot-preview-action",
      })
    ).toHaveAttribute("data-resubmit", "false");
    expect(
      screen.queryByRole("dialog", {
        name: /Asset preview editor/,
      })
    ).not.toBeInTheDocument();
  });
});
