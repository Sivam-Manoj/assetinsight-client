import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewModal from "./PreviewModal";

const mocks = vi.hoisted(() => ({
  getAssetCategorySpecs: vi.fn(),
  reverseGeocode: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  promoteDraftPreview: vi.fn(),
}));

vi.mock("@/services/assets", () => ({
  getPreviewData: vi.fn(),
  updatePreviewData: vi.fn(),
  submitForApproval: vi.fn(),
  getSubmittedPreviewData: vi.fn(),
  resubmitReport: vi.fn(),
  getAssetCategorySpecs: mocks.getAssetCategorySpecs,
  refreshAssetSpecPdf: vi.fn(),
  uploadPreviewLotImages: vi.fn(),
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    info: mocks.toastInfo,
    success: mocks.toastSuccess,
  },
}));

vi.mock("@/services/browserLocation", () => ({
  BrowserLocationService: {
    reverseGeocode: mocks.reverseGeocode,
  },
}));

vi.mock("@/services/reportDrafts", () => ({
  ReportDraftService: {
    promotePreview: mocks.promoteDraftPreview,
  },
}));

function makePreviewResponse() {
  return {
    data: {
      status: "preview",
      grouping_mode: "single_lot",
      image_count: 0,
      imageUrls: [],
      preview_data: {
        client_name: "Test Client",
        location: "Test Yard, London",
        currency: "USD",
        grouping_mode: "single_lot",
        valuation_methods: ["FML", "TKV", "OLV", "FLV"],
        valuation_data: {
          methods: [
            { method: "FML", fullName: "Fair Market Value", percentage: 100 },
            { method: "TKV", fullName: "Trade Value", percentage: 70 },
            {
              method: "OLV",
              fullName: "Orderly Liquidation Value",
              percentage: 77,
            },
            {
              method: "FLV",
              fullName: "Forced Liquidation Value",
              percentage: 52,
            },
          ],
        },
        lots: [
          {
            lot_number: "1",
            title: "Ford Super Duty",
            categories: "Emergency Vehicles",
            description: "Mobile treatment centre",
            details: "4WD with treatment equipment",
            estimated_value: "US$42,000",
            mixed_group_index: 1,
            sub_mode: "single_lot",
            image_indices: [],
            extra_image_urls: [],
            condition_report_specs: {},
          },
        ],
      },
    },
  };
}

describe("PreviewModal valuation methods", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    mocks.getAssetCategorySpecs.mockReset();
    mocks.getAssetCategorySpecs.mockResolvedValue({ categories: [], specs: [] });
    mocks.reverseGeocode.mockReset();
    mocks.reverseGeocode.mockResolvedValue({
      location: "10 Downing Street, London, United Kingdom",
      attribution: "© OpenStreetMap contributors",
      attributionUrl: "https://www.openstreetmap.org/copyright",
    });
    mocks.promoteDraftPreview.mockReset().mockResolvedValue({
      reportId: "promoted-report-1",
      reportType: "asset",
      status: "pending_approval",
      files_generating: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders every selected method and recalculates each lot value from the editable base", async () => {
    render(
      <PreviewModal
        isOpen
        reportId="report-1"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    expect(
      await screen.findByRole("heading", { name: "Assets / Lots" })
    ).toBeInTheDocument();

    const methodGroups = screen.getAllByLabelText(
      "Selected valuation methods for lot 1"
    );
    const valueGroups = screen.getAllByLabelText(
      "Valuation method values for lot 1"
    );
    expect(methodGroups).toHaveLength(2);
    expect(valueGroups).toHaveLength(2);

    for (const method of ["FML", "TKV", "OLV", "FLV"]) {
      expect(within(methodGroups[0]).getByText(method)).toBeInTheDocument();
    }
    for (const value of [
      "US$42,000",
      "US$29,400",
      "US$32,340",
      "US$21,840",
    ]) {
      expect(within(valueGroups[0]).getByText(value)).toBeInTheDocument();
    }

    const baseFields = screen.getAllByRole("textbox", {
      name: "Base market value for lot 1",
    });
    expect(baseFields).toHaveLength(2);
    fireEvent.change(baseFields[0], { target: { value: "US$50,000" } });

    await waitFor(() => {
      expect(within(valueGroups[0]).getByText("US$35,000")).toBeInTheDocument();
    });
  });

  it("resolves a legacy coordinate-only preview before showing a location", async () => {
    const response = makePreviewResponse();
    Object.assign(response.data.preview_data, {
      location: "Current Browser Location",
      latitude: 51.503407,
      longitude: -0.127592,
    });

    render(
      <PreviewModal
        isOpen
        reportId="report-location"
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
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(
      { latitude: 51.503407, longitude: -0.127592 },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("clears stale report and inherited lot coordinates after a manual location edit", async () => {
    const response = makePreviewResponse();
    Object.assign(response.data.preview_data, {
      location: "Old Inspection Yard",
      latitude: 50.1,
      longitude: -104.2,
    });
    Object.assign(response.data.preview_data.lots[0], {
      location: "Old Inspection Yard",
      latitude: 50.1,
      longitude: -104.2,
    });
    const updatePreview = vi.fn().mockResolvedValue({
      message: "Saved",
      data: response.data.preview_data,
    });

    render(
      <PreviewModal
        isOpen
        reportId="report-manual-location"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshAssetSpecPdfOverride={vi.fn().mockResolvedValue({
          message: "Refreshed",
          data: { spec_pdf: "https://example.test/cr.pdf" },
        })}
      />
    );

    const location = await screen.findByRole("textbox", {
      name: "Inspection Location *",
    });
    fireEvent.change(location, { target: { value: "New Inspection Yard" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

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

  it("promotes and submits a draft from the exact edited preview snapshot", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <PreviewModal
        isOpen
        reportId="hidden-report-1"
        draftPreviewId="draft-1"
        onClose={onClose}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Edited Draft Client" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft preview and submit report",
      })
    );

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "draft-1",
        expect.objectContaining({
          submit: true,
          preview_data: expect.objectContaining({
            client_name: "Edited Draft Client",
          }),
        })
      )
    );
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "promoted-report-1",
        reportId: "promoted-report-1",
      })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves draft edits without generating partial hidden CR files", async () => {
    const response = makePreviewResponse();
    const updatePreview = vi.fn().mockResolvedValue({
      message: "Saved",
      data: response.data.preview_data,
    });
    const refreshSpecPdf = vi.fn();

    render(
      <PreviewModal
        isOpen
        reportId="hidden-report-save-only"
        draftPreviewId="draft-save-only"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
        refreshAssetSpecPdfOverride={refreshSpecPdf}
      />
    );

    const clientName = (await screen.findAllByDisplayValue("Test Client"))[0];
    fireEvent.change(clientName, { target: { value: "Saved Draft Client" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(refreshSpecPdf).not.toHaveBeenCalled();
    expect(mocks.promoteDraftPreview).not.toHaveBeenCalled();
  });

  it("keeps an approved hidden draft on the promotion path when saving and resubmitting", async () => {
    const onSuccess = vi.fn();
    const approvedPreview = makePreviewResponse();
    approvedPreview.data.status = "approved";

    render(
      <PreviewModal
        isOpen
        reportId="hidden-approved-report"
        draftPreviewId="approved-draft"
        onClose={vi.fn()}
        onSuccess={onSuccess}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(approvedPreview)}
      />
    );

    await screen.findByRole("heading", { name: "Assets / Lots" });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Save draft preview and submit report",
      })
    );

    await waitFor(() =>
      expect(mocks.promoteDraftPreview).toHaveBeenCalledWith(
        "approved-draft",
        expect.objectContaining({ submit: true })
      )
    );
    expect(screen.getAllByText("Save & Resubmit")).toHaveLength(2);
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "promoted-report-1" })
    );
  });
});
