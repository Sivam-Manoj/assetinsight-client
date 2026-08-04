import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetReport } from "@/services/assets";
import type { LotListing } from "@/services/lotListing";
import ReportsPage from "./page";

const mocks = vi.hoisted(() => ({
  getMyReports: vi.fn(),
  getAssetReports: vi.fn(),
  getRealEstateReports: vi.fn(),
  getLotListings: vi.fn(),
  getDeliveries: vi.fn(),
  deleteReport: vi.fn(),
  downloadReport: vi.fn(),
  downloadCr: vi.fn(),
  downloadCrDocx: vi.fn(),
  deleteAssetReport: vi.fn(),
  resubmitReport: vi.fn(),
  deleteLotListing: vi.fn(),
  resubmitLotListing: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.routerPush,
  }),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    function DeferredDialog() {
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

vi.mock("@/services/reports", () => ({
  ReportsService: {
    getMyReports: mocks.getMyReports,
    deleteReport: mocks.deleteReport,
    downloadReport: mocks.downloadReport,
    downloadCr: mocks.downloadCr,
    downloadCrDocx: mocks.downloadCrDocx,
  },
}));

vi.mock("@/services/assets", () => ({
  getAssetReports: mocks.getAssetReports,
  deleteAssetReport: mocks.deleteAssetReport,
  resubmitReport: mocks.resubmitReport,
}));

vi.mock("@/services/realEstate", () => ({
  RealEstateService: {
    getReports: mocks.getRealEstateReports,
    deleteReport: vi.fn(),
  },
}));

vi.mock("@/services/lotListing", () => ({
  getLotListings: mocks.getLotListings,
  deleteLotListing: mocks.deleteLotListing,
  resubmitLotListing: mocks.resubmitLotListing,
}));

vi.mock("@/services/auctioneer", () => ({
  default: {
    getDeliveries: mocks.getDeliveries,
  },
}));

const thumbnailUrl =
  "https://cdn.example.test/reports/cv-thumb-100.webp";

const reportWithThumbnail: AssetReport = {
  _id: "asset-thumbnail",
  user: "user-1",
  grouping_mode: "lot",
  imageUrls: [],
  status: "approved",
  lots: [
    {
      lot_number: "7",
      image_urls: [thumbnailUrl],
      estimated_value: "25000",
    },
  ],
  client_name: "Northfield Plant Ltd",
  contract_no: "CV-THUMB-100",
  preview_files: {
    pdf: "/files/cv-thumb-100.pdf",
  },
  createdAt: "2026-08-02T09:00:00.000Z",
  updatedAt: "2026-08-02T09:30:00.000Z",
};

const reportWithoutThumbnail: AssetReport = {
  ...reportWithThumbnail,
  _id: "asset-no-thumbnail",
  imageUrls: [],
  lots: [{ lot_number: "8", estimated_value: "9000" }],
  client_name: "No Image Client",
  contract_no: "CV-NO-IMAGE",
  preview_files: {
    pdf: "/files/cv-no-image.pdf",
  },
};

const previewReadyAsset: AssetReport = {
  ...reportWithThumbnail,
  _id: "asset-preview-ready",
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "queued",
  files_generating: false,
  client_name: "Preview Asset Client",
  contract_no: "CV-ASSET-PREVIEW",
  preview_files: undefined,
};

const previewReadyLotListing: LotListing = {
  _id: "lot-preview-ready",
  user: "user-1",
  status: "processing",
  workflow_stage: "preview_ready",
  generation_state: "processing",
  files_generating: false,
  details: {
    contract_no: "CV-LOT-PREVIEW",
    currency: "GBP",
  },
  lots: [
    {
      lot_id: "lot-1",
      lot_number: "1",
      image_indexes: [],
      estimated_value: "18000",
    },
  ],
  imageUrls: [],
  createdAt: "2026-08-02T10:00:00.000Z",
  updatedAt: "2026-08-02T10:30:00.000Z",
};

class ImmediatelyIntersectingObserver {
  readonly root = null;
  readonly rootMargin = "320px 0px";
  readonly thresholds = [0.01];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe = (target: Element) => {
    this.callback(
      [
        {
          isIntersecting: true,
          target,
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  };

  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}

describe("My Reports thumbnails", () => {
  beforeEach(() => {
    mocks.getMyReports.mockReset().mockResolvedValue([]);
    mocks.getAssetReports
      .mockReset()
      .mockResolvedValue({
        message: "ok",
        data: [reportWithThumbnail, reportWithoutThumbnail],
      });
    mocks.getRealEstateReports.mockReset().mockResolvedValue({ data: [] });
    mocks.getLotListings.mockReset().mockResolvedValue({ data: [] });
    mocks.getDeliveries.mockReset().mockResolvedValue([]);
    mocks.routerPush.mockReset();
    vi.stubGlobal("IntersectionObserver", ImmediatelyIntersectingObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires a source thumbnail into both responsive report presentations", async () => {
    render(<ReportsPage />);

    expect(
      await screen.findByRole("heading", { name: "My reports" })
    ).toBeInTheDocument();
    await waitFor(() => expect(mocks.getAssetReports).toHaveBeenCalledTimes(1));

    const accessibleName = /Preview image for Asset.*CV-THUMB-100/i;
    const mobileList = screen.getByRole("list");
    const desktopTable = screen.getByRole("table", {
      name: "Generated reports",
    });

    expect(
      await within(mobileList).findByRole("img", { name: accessibleName })
    ).toBeInTheDocument();
    expect(
      await within(desktopTable).findByRole("img", {
        name: accessibleName,
      })
    ).toBeInTheDocument();
  });

  it("keeps every rendered thumbnail lazy, asynchronously decoded, and low priority", async () => {
    render(<ReportsPage />);

    const thumbnails = await screen.findAllByRole("img", {
      name: /Preview image for Asset.*CV-THUMB-100/i,
    });

    expect(thumbnails.length).toBeGreaterThan(0);
    for (const thumbnail of thumbnails) {
      expect(thumbnail).toHaveAttribute("src", thumbnailUrl);
      expect(thumbnail).toHaveAttribute("loading", "lazy");
      expect(thumbnail).toHaveAttribute("decoding", "async");
      expect(thumbnail).toHaveAttribute("fetchpriority", "low");
    }
  });

  it("uses a non-network placeholder when a report has no image source", async () => {
    render(<ReportsPage />);

    expect(
      (
        await screen.findAllByLabelText(
          /No preview image available for Asset.*CV-NO-IMAGE/i
        )
      ).length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("img", {
        name: /Preview image for Asset.*CV-NO-IMAGE/i,
      })
    ).not.toBeInTheDocument();
  });

  it("offers direct, report-specific preview actions for Asset and Lot Listing", async () => {
    mocks.getAssetReports.mockResolvedValue({
      message: "ok",
      data: [previewReadyAsset],
    });
    mocks.getLotListings.mockResolvedValue({
      data: [previewReadyLotListing],
    });
    render(<ReportsPage />);

    const assetActions = await screen.findAllByRole("button", {
      name: "Preview Asset report: Asset · CV-ASSET-PREVIEW",
    });
    const lotActions = await screen.findAllByRole("button", {
      name: "Preview Lot Listing report: Lot Listing · CV-LOT-PREVIEW",
    });
    expect(assetActions.length).toBeGreaterThan(0);
    expect(lotActions.length).toBeGreaterThan(0);

    fireEvent.click(assetActions[0]);
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/previews?reportId=asset-preview-ready&reportType=asset"
    );

    fireEvent.click(lotActions[0]);
    expect(mocks.routerPush).toHaveBeenLastCalledWith(
      "/previews?reportId=lot-preview-ready&reportType=lotListing"
    );
  });
});
