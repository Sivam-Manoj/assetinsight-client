import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LotListingPreviewModal from "./LotListingPreviewModal";

const mocks = vi.hoisted(() => ({
  getAssetCategorySpecs: vi.fn(),
  reverseGeocode: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  promoteDraftPreview: vi.fn(),
}));

vi.mock("@/services/lotListing", () => ({
  getLotListingPreview: vi.fn(),
  getLotListingSubmittedPreview: vi.fn(),
  updateLotListingPreview: vi.fn(),
  uploadLotListingPreviewLotImages: vi.fn(),
  refreshLotListingSpecPdf: vi.fn(),
  submitLotListingForApproval: vi.fn(),
  resubmitLotListing: vi.fn(),
}));

vi.mock("@/services/assets", () => ({
  getAssetCategorySpecs: mocks.getAssetCategorySpecs,
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: {
    reverseGeocode: mocks.reverseGeocode,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    promotePreview: mocks.promoteDraftPreview,
  },
}));

function makeListingPreview() {
  return {
    data: {
      status: "preview",
      imageUrls: [],
      preview_data: {
        contract_no: "LOT-LOCATION-1",
        currency: "CAD",
        location: "Old Inspection Yard",
        latitude: 50.1,
        longitude: -104.2,
        lots: [
          {
            lot_id: "lot-1",
            lot_number: "1",
            title: "Test lot",
            description: "Test description",
            estimated_value: "1000",
            image_indices: [],
            location: "Old Inspection Yard",
            latitude: 50.1,
            longitude: -104.2,
            condition_report_selections: {
              condition: "N/A",
              completeness: "N/A",
              legal: "N/A",
            },
          },
        ],
      },
    },
  };
}

describe("LotListingPreviewModal inspection location", () => {
  beforeEach(() => {
    mocks.getAssetCategorySpecs.mockReset();
    mocks.getAssetCategorySpecs.mockResolvedValue({ categories: [], specs: [] });
    mocks.reverseGeocode.mockReset();
    mocks.reverseGeocode.mockResolvedValue({
      location: "10 Downing Street, London, United Kingdom",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    });
    mocks.promoteDraftPreview.mockReset().mockResolvedValue({
      reportId: "promoted-lot-report",
      reportType: "lotListing",
      status: "approved",
      files_generating: true,
    });
  });

  it("resolves a coordinate-only legacy preview without exposing a placeholder", async () => {
    const response = makeListingPreview();
    response.data.preview_data.location = "Current Browser Location";
    response.data.preview_data.lots[0].location = "Current Browser Location";

    render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    await waitFor(() => {
      expect(location).toHaveValue(
        "10 Downing Street, London, United Kingdom"
      );
    });
    expect(screen.queryByDisplayValue("Current Browser Location")).toBeNull();
  });

  it("sends null coordinate markers when the location name is manually changed", async () => {
    const response = makeListingPreview();
    const updatePreview = vi.fn().mockResolvedValue({
      data: { preview_data: response.data.preview_data, imageUrls: [] },
    });

    render(
      <LotListingPreviewModal
        isOpen
        reportId="listing-manual-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshSpecPdfOverride={vi.fn().mockResolvedValue({
          data: { spec_pdf: "https://example.test/cr.pdf" },
        })}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    fireEvent.change(location, { target: { value: "New Inspection Yard" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalled());
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(savedPreview).toMatchObject({
      location: "New Inspection Yard",
      latitude: null,
      longitude: null,
    });
    expect(savedPreview.lots[0]).toMatchObject({
      location: "New Inspection Yard",
      latitude: null,
      longitude: null,
    });
  });

  it("promotes and submits the exact edited Lot Listing draft preview", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(
      <LotListingPreviewModal
        isOpen
        reportId="hidden-lot-report"
        draftPreviewId="lot-draft-1"
        onClose={onClose}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makeListingPreview())}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-EDITED-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & Submit" }));

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "lot-draft-1",
        expect.objectContaining({
          submit: true,
          preview_data: expect.objectContaining({
            contract_no: "LOT-EDITED-1",
          }),
        })
      )
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "promoted-lot-report",
        reportId: "promoted-lot-report",
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves Lot Listing draft edits without generating partial hidden CR files", async () => {
    const response = makeListingPreview();
    const updatePreview = vi.fn().mockResolvedValue({
      data: { preview_data: response.data.preview_data, imageUrls: [] },
    });
    const refreshSpecPdf = vi.fn();

    render(
      <LotListingPreviewModal
        isOpen
        reportId="hidden-lot-save-only"
        draftPreviewId="lot-draft-save-only"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshSpecPdfOverride={refreshSpecPdf}
      />
    );

    const contract = await screen.findByDisplayValue("LOT-LOCATION-1");
    fireEvent.change(contract, { target: { value: "LOT-SAVED-ONLY" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(mocks.promoteDraftPreview).not.toHaveBeenCalled();
  });
});
