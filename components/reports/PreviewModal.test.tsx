import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PreviewModal from "./PreviewModal";

const mocks = vi.hoisted(() => ({
  getAssetCategorySpecs: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
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

function makePreviewResponse() {
  return {
    data: {
      status: "preview",
      grouping_mode: "single_lot",
      image_count: 0,
      imageUrls: [],
      preview_data: {
        client_name: "Test Client",
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
});
