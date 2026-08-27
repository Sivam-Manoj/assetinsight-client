import { beforeEach, describe, expect, it, vi } from "vitest";
import API from "@/lib/api";
import { AuctioneerService } from "./auctioneer";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe("AuctioneerService incoming", () => {
  beforeEach(() => {
    vi.mocked(API.get).mockReset();
    vi.mocked(API.post).mockReset();
  });

  it("keeps every normalized proposal row from the backend items contract", async () => {
    vi.mocked(API.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          items: [
            {
              cycleKey: "proposal:825291",
              contractId: "contract-825291",
              contractNo: 825291,
              customerName: "Proposal customer one",
              eventTitle: "ProposalInAssetInsight",
              location: "London",
              kind: "unknown",
              lotCount: 0,
              status: "available",
            },
            {
              cycleKey: "proposal:825295",
              contractId: "contract-825295",
              contractNo: 825295,
              customerName: "Proposal customer two",
              eventTitle: "ProposalInAssetInsight",
              location: "Manchester",
              kind: "scheduleA",
              lotCount: 3,
              status: "available",
            },
          ],
        },
      },
    });

    const items = await AuctioneerService.getIncoming();

    expect(items.map((item) => item.contractNo)).toEqual([
      "825291",
      "825295",
    ]);
    expect(items.map((item) => item.kind)).toEqual(["unknown", "scheduleA"]);
    expect(API.get).toHaveBeenCalledWith("/auctioneer/incoming", {});
    expect(vi.mocked(API.get).mock.calls[0]?.[1]).not.toHaveProperty(
      "params.userId"
    );
  });
});
