import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuctioneerDeliverySummary } from "@/services/auctioneer";
import AuctioneerDeliveryDialog from "./AuctioneerDeliveryDialog";

const mocks = vi.hoisted(() => ({
  sendDelivery: vi.fn(),
  reconcileDelivery: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/services/auctioneer", () => ({
  default: {
    sendDelivery: mocks.sendDelivery,
    reconcileDelivery: mocks.reconcileDelivery,
  },
}));

vi.mock("@/components/ui/toast", () => ({
  toast: {
    success: mocks.toastSuccess,
  },
}));

const delivery: AuctioneerDeliverySummary = {
  workItemId: "work-100",
  contractNo: "CV-100",
  state: "ready",
  canSend: true,
};

describe("AuctioneerDeliveryDialog", () => {
  beforeEach(() => {
    mocks.sendDelivery.mockReset();
    mocks.reconcileDelivery.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.sendDelivery.mockResolvedValue({
      ...delivery,
      state: "queued",
    });
  });

  it("hides whole-contract completion and sends false for a split contract", async () => {
    const onClose = vi.fn();
    const onUpdated = vi.fn();

    render(
      <AuctioneerDeliveryDialog
        open
        delivery={{
          ...delivery,
          canCompleteContract: false,
          completeContract: true,
        }}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    );

    expect(
      await screen.findByText(
        /This delivery covers only your assigned lots/
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", {
        name: /Mark the contract task complete/,
      })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(mocks.sendDelivery).toHaveBeenCalledWith("work-100", {
        destination: "LottingBoard",
        completeContract: false,
      })
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ state: "queued" })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the legacy completion option when capability is unspecified", async () => {
    render(
      <AuctioneerDeliveryDialog
        open
        delivery={delivery}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
      />
    );

    const checkbox = await screen.findByRole("checkbox", {
      name: /Mark the contract task complete/,
    });
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(mocks.sendDelivery).toHaveBeenCalledWith("work-100", {
        destination: "LottingBoard",
        completeContract: true,
      })
    );
  });
});
