import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctioneerWorkItemSetup } from "@/services/auctioneer";
import ReportFormPage from "./ReportFormPage";

const mocks = vi.hoisted(() => ({
  dynamicIndex: 0,
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const kind = mocks.dynamicIndex++ === 0 ? "asset" : "lot-listing";
    function DeferredReportForm({
      auctioneer,
    }: {
      auctioneer?: AuctioneerWorkItemSetup;
    }) {
      return (
        <div data-testid={`${kind}-handoff`}>
          {auctioneer?.contract.contractNo || "No imported contract"}
        </div>
      );
    }
    return DeferredReportForm;
  },
}));

describe("ReportFormPage handoff", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    mocks.routerPush.mockReset();
  });

  it("preserves a single-use incoming handoff when Strict Mode replays effects", async () => {
    window.sessionStorage.setItem(
      "cv:report-form-handoff:v1",
      JSON.stringify({
        version: 1,
        kind: "asset",
        returnTo: "/incoming",
        auctioneer: {
          workItemId: "work-100",
          cycleKey: "cycle-100",
          kind: "scheduleA",
          reportType: "asset",
          contract: {
            id: "contract-100",
            contractNo: "CV-E2E-100",
            customerName: "Northfield Plant Ltd",
            eventId: "event-100",
            eventTitle: "Fleet dispersal",
            eventDate: "2026-08-12T10:00:00.000Z",
            location: "Leeds",
          },
          lots: [],
        },
      })
    );

    render(
      <StrictMode>
        <ReportFormPage kind="asset" />
      </StrictMode>
    );

    expect(await screen.findByTestId("asset-handoff")).toHaveTextContent(
      "CV-E2E-100"
    );
    expect(
      window.sessionStorage.getItem("cv:report-form-handoff:v1")
    ).toBeNull();
  });
});
