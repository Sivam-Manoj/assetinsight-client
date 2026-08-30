import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalValuationPayload } from "./proposal-valuation/types";
import ProposalValuationDialog from "./ProposalValuationDialog";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/services/proposalValuation", () => ({
  ProposalValuationService: {
    get: mocks.get,
    save: mocks.save,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

function makePayload(): ProposalValuationPayload {
  return {
    reportId: "report-1",
    title: "McDougall Auctioneering Inc.",
    currencyCode: "USD",
    assetScheduleSheet: {
      evaluator_columns: [
        { id: "riley", name: "Riley" },
        { id: "jay", name: "Jay" },
        { id: "chad", name: "Chad" },
        { id: "femi", name: "Femi" },
      ],
      rows: [
        {
          lot_id: "lot-13",
          asset_id: "13",
          asset_category: "Light Duty Pickup Truck",
          year: "2023",
          make: "Ford",
          model: "F-150",
          serial_number: "1FTFW1E57LKE217",
          cr_details: "SuperCrew pickup with 4WD",
          condition_score: "4",
          location: "Regina, SK",
          pictures: 30,
          picture_urls: [
            "https://example.test/asset.jpg",
            "https://example.test/asset-rear.jpg",
          ],
          market_check: {
            comparable_count: "Moderate",
            avg_retail_asking_price: "Moderate",
            market_saturation: "Low",
            market_velocity: "Normal",
            regional_demand: "Strong",
            notes: "Stable regional demand",
          },
          asset_insight: "US$42,000",
          evaluator_values: {
            riley: 40000,
            jay: 42000,
            chad: 41000,
            femi: 43000,
          },
          low_est_sale_value: 40000,
          high_est_sale_value: 43000,
          buyer_premium_percent: 15,
          buyer_premium_amount: 2000,
          total_expected_gross: 45000,
          allocated_value: 45000,
          notes: "Original note",
          cleaning: 430,
          lien_search: 50,
          video_cost: 100,
          lotting_fee: 430,
          advertising: 430,
        },
      ],
      file_summary: {
        buyers_premium_basis: "uncapped",
        total_risk_weighted_value: 38000,
        file_risk_multiplier: 0.9,
        commission_percent_no_guarantee: 12,
        offer2_nmg_percent: 0.785,
        capped_threshold_percent: 0.1,
      },
    },
  };
}

describe("ProposalValuationDialog", () => {
  beforeEach(() => {
    const payload = makePayload();
    mocks.get.mockReset();
    mocks.save.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.toastError.mockReset();
    mocks.get.mockResolvedValue(payload);
    mocks.save.mockImplementation(async (_reportId, sheet) => ({
      ...payload,
      assetScheduleSheet: structuredClone(sheet),
      files_regeneration_queued: true,
    }));
  });

  it("shows the complete Schedule A field set and every saved evaluator", async () => {
    render(
      <ProposalValuationDialog
        open
        reportId="report-1"
        onClose={vi.fn()}
      />
    );

    for (const header of [
      "Asset ID",
      "Asset Category",
      "Year",
      "Make",
      "Model",
      "Serial Number",
      "CR Details",
      "Condition (1-5)",
      "Location (City, State/Prov)",
      "Pictures",
      "Asset Insight",
      "Average",
      "Low Est. Sale Value ($)",
      "High Est. Sale Value ($)",
      "Buyer Premium %",
      "Buyer Premium ($)",
      "Total Expected Gross ($)",
      "Allocated Value ($)",
      "Notes",
      "Cleaning",
      "Lien Search",
      "Video Cost",
      "Lotting Fee",
      "Advertising",
    ]) {
      expect(await screen.findByRole("columnheader", { name: header })).toBeInTheDocument();
    }

    for (const evaluator of ["Riley", "Jay", "Chad", "Femi"]) {
      expect(screen.getByRole("columnheader", { name: evaluator })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "File summary" }));
    expect(screen.getByRole("spinbutton", { name: "Total risk-weighted value" })).toHaveValue(38000);
    expect(screen.getByRole("spinbutton", { name: "File risk multiplier" })).toHaveValue(0.9);
  });

  it("opens the user picture gallery from the shared Schedule A row", async () => {
    render(
      <ProposalValuationDialog
        open
        reportId="report-1"
        onClose={vi.fn()}
      />
    );

    const pictureButtons = await screen.findAllByRole("button", {
      name: "Open 2 pictures for 13",
    });
    pictureButtons[0].focus();
    fireEvent.click(pictureButtons[0]);

    expect(
      screen.getByRole("dialog", { name: "Pictures for 13" })
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "13 picture 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close picture gallery" })).toHaveFocus();

    const next = screen.getByRole("button", { name: "Next picture" });
    next.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close picture gallery" })).toHaveFocus();

    screen.getByRole("button", { name: "Close picture gallery" }).focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(next).toHaveFocus();

    fireEvent.click(next);
    expect(screen.getByRole("img", { name: "13 picture 2" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Pictures for 13" })
      ).not.toBeInTheDocument();
      expect(pictureButtons[0]).toHaveFocus();
    });
  });

  it("updates the range and projected costs while evaluator values change", async () => {
    render(
      <ProposalValuationDialog
        open
        reportId="report-1"
        onClose={vi.fn()}
      />
    );

    expect(
      (await screen.findAllByText("US$40,000 - US$43,000")).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("US$1,440").length).toBeGreaterThan(0);

    const femiFields = screen.getAllByLabelText("Femi valuation for 13");
    fireEvent.change(femiFields[0], { target: { value: "50000" } });

    await waitFor(() => {
      expect(screen.getAllByText("US$40,000 - US$50,000").length).toBeGreaterThan(0);
      expect(screen.getAllByText("US$1,650").length).toBeGreaterThan(0);
    });
  });

  it("saves edited user fields without dropping the shared Schedule A data", async () => {
    render(
      <ProposalValuationDialog
        open
        reportId="report-1"
        onClose={vi.fn()}
      />
    );

    const categoryFields = await screen.findAllByLabelText("Asset category for 13");
    const notesFields = screen.getAllByLabelText("Notes for 13");
    const lienFields = screen.getAllByLabelText("Lien search cost for 13");

    fireEvent.change(categoryFields[0], { target: { value: "Emergency Vehicles" } });
    fireEvent.change(notesFields[0], { target: { value: "User-reviewed note" } });
    fireEvent.change(lienFields[0], { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & update files" }));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const [reportId, savedSheet] = mocks.save.mock.calls[0];

    expect(reportId).toBe("report-1");
    expect(savedSheet.rows[0]).toMatchObject({
      asset_category: "Emergency Vehicles",
      notes: "User-reviewed note",
      lien_search: 75,
      serial_number: "1FTFW1E57LKE217",
      picture_urls: [
        "https://example.test/asset.jpg",
        "https://example.test/asset-rear.jpg",
      ],
      evaluator_values: {
        riley: 40000,
        jay: 42000,
        chad: 41000,
        femi: 43000,
      },
      market_check: {
        notes: "Stable regional demand",
      },
    });
    expect(savedSheet.evaluator_columns.map((column: { name: string }) => column.name)).toEqual([
      "Riley",
      "Jay",
      "Chad",
      "Femi",
    ]);
  });
});
