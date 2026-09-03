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
    expect(methodGroups).toHaveLength(1);
    expect(valueGroups).toHaveLength(1);

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
    expect(baseFields).toHaveLength(1);
    fireEvent.change(baseFields[0], { target: { value: "US$50,000" } });

    await waitFor(() => {
      expect(within(valueGroups[0]).getByText("US$35,000")).toBeInTheDocument();
    });
  });

  it("renders only the compact lot editor on mobile viewports", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(min-width: 768px)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    render(
      <PreviewModal
        isOpen
        reportId="report-mobile"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(makePreviewResponse())}
      />
    );

    expect(
      await screen.findByLabelText("Selected valuation methods for lot 1")
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Selected valuation methods for lot 1")
    ).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "Base market value for lot 1" })
    ).toBeInTheDocument();
  });

  it("applies Legal only to lots 4, 8, and 9 while preserving individual overrides", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 10 }, (_, index) => ({
      ...response.data.preview_data.lots[0],
      lot_number: String(index + 1),
      title: `Asset ${index + 1}`,
      condition_report_selections: { legal: "" },
    }));
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
    }));

    render(
      <PreviewModal
        isOpen
        reportId="report-selected-lots"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    await screen.findByDisplayValue("Asset 1");
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    const applyControl = screen.getByRole("group", {
      name: "Apply Legal value to selected lots",
    });
    expect(saveButton).toBeDisabled();
    expect(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 0 selected lots",
      })
    ).toBeDisabled();

    for (const lotNumber of [4, 8, 9]) {
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: `Select lot ${lotNumber}, row ${lotNumber}`,
        })
      );
    }

    expect(
      screen.getByText(
        "3 of 10 lots selected. Apply a value below or adjust any lot individually."
      )
    ).toBeInTheDocument();
    expect(saveButton).toBeDisabled();

    fireEvent.click(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 3 selected lots",
      })
    );
    expect(saveButton).toBeEnabled();

    const legalControls = screen.getAllByRole("group", { name: "Legal" });
    expect(
      within(legalControls[0]).getByRole("radio", { name: "N/A" })
    ).not.toBeChecked();
    for (const index of [3, 7, 8]) {
      expect(
        within(legalControls[index]).getByRole("radio", { name: "N/A" })
      ).toBeChecked();
    }

    fireEvent.click(
      within(legalControls[7]).getByRole("radio", { name: "No Title" })
    );
    fireEvent.click(saveButton);

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(
      savedPreview.lots.map(
        (lot: any) => lot.condition_report_selections?.legal || ""
      )
    ).toEqual(["", "", "", "N/A", "", "", "", "No Title", "N/A", ""]);
    await waitFor(() => {
      expect(
        screen.getByText("Select the lots that should receive the same Legal value.")
      ).toBeInTheDocument();
    });
    expect(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 0 selected lots",
      })
    ).toBeDisabled();
  });

  it("pages large reports, preserves focus, and selects every off-page lot", async () => {
    const response = makePreviewResponse();
    response.data.preview_data.lots = Array.from({ length: 205 }, (_, index) => ({
      ...response.data.preview_data.lots[0],
      lot_number: String(index + 1),
      title: `Asset ${index + 1}`,
      condition_report_selections: {
        legal: index === 0 ? "No Title" : "",
      },
    }));
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
    }));

    render(
      <PreviewModal
        isOpen
        reportId="report-large"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    const firstTitle = await screen.findByDisplayValue("Asset 1");
    expect(screen.queryByDisplayValue("Asset 21")).toBeNull();
    expect(screen.getByText("Showing 1–20 of 205 lots")).toBeInTheDocument();

    firstTitle.focus();
    fireEvent.change(firstTitle, { target: { value: "Focused asset" } });
    expect(firstTitle).toHaveFocus();

    const selectionControl = screen.getByRole("group", {
      name: "Select lots for bulk Legal assignment",
    });
    fireEvent.click(
      within(selectionControl).getByRole("button", {
        name: "Select all 205 lots",
      })
    );
    expect(
      screen.getByText(
        "205 of 205 lots selected. Apply a value below or adjust any lot individually."
      )
    ).toBeInTheDocument();

    const applyControl = screen.getByRole("group", {
      name: "Apply Legal value to selected lots",
    });
    fireEvent.click(
      within(applyControl).getByRole("button", {
        name: "Apply N/A to 205 selected lots",
      })
    );
    const firstLegalControl = screen.getAllByRole("group", { name: "Legal" })[0];
    expect(within(firstLegalControl).getByRole("radio", { name: "N/A" })).toBeChecked();

    fireEvent.click(within(firstLegalControl).getByRole("radio", { name: "No Title" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    const savedPreview = updatePreview.mock.calls[0][1];
    expect(savedPreview.lots[0].condition_report_selections.legal).toBe("No Title");
    expect(savedPreview.lots[204].condition_report_selections.legal).toBe("N/A");
    expect(
      screen.getByText("Select the lots that should receive the same Legal value.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next lots page" }));
    expect(await screen.findByDisplayValue("Asset 21")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Focused asset")).toBeNull();
  });

  it("saves the selected appraiser cover images in the chosen order", async () => {
    const response: any = makePreviewResponse();
    const coverImages = [
      "https://images.test/cover-one.jpg",
      "https://images.test/cover-two.jpg",
      "https://images.test/cover-three.jpg",
    ];
    response.data.imageUrls = coverImages;
    response.data.image_count = coverImages.length;
    Object.assign(response.data.preview_data.lots[0], {
      image_urls: coverImages.slice(0, 2),
      image_indexes: [0, 1],
    });
    const updatePreview = vi.fn().mockImplementation(async (_id, previewData) => ({
      message: "Saved",
      data: previewData,
      imageUrls: coverImages,
    }));

    render(
      <PreviewModal
        isOpen
        reportId="report-cover"
        onClose={vi.fn()}
        loadPreviewDataOverride={vi.fn().mockResolvedValue(response)}
        updatePreviewDataOverride={updatePreview}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Select cover images" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Select cover image 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Select cover image 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply cover images" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(updatePreview).toHaveBeenCalledTimes(1));
    expect(updatePreview.mock.calls[0][1].cover_image_urls).toEqual([
      coverImages[1],
      coverImages[0],
    ]);
    expect(screen.getByText("2 of 4 cover images selected.")).toBeInTheDocument();
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
