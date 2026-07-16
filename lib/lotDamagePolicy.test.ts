import { describe, expect, it } from "vitest";

import {
  applyDamageAnalysisLotPolicy,
  isDamageAnalysisEligibleForLot,
  parseLotNumberNumericPortion,
} from "./lotDamagePolicy";

describe("lot damage analysis policy", () => {
  it.each([
    ["999", 999, false],
    ["0999", 999, false],
    ["Lot #999", 999, false],
    ["lot-001", 1, false],
    ["999A", 999, false],
    ["1000", 1000, true],
    ["1,000", 1000, true],
    ["1000A", 1000, true],
    [undefined, null, true],
    ["Warehouse A", null, true],
  ])("handles %p", (value, parsed, eligible) => {
    expect(parseLotNumberNumericPortion(value)).toBe(parsed);
    expect(isDamageAnalysisEligibleForLot(value)).toBe(eligible);
  });

  it("clears low-lot damage without mutating the input", () => {
    const input = {
      lots: [
        { lot_number: "0999", damage_analysis: "Old dent" },
        { lot_number: "1000", damage_analysis: "Scratch" },
      ],
    };

    const result = applyDamageAnalysisLotPolicy(input);

    expect(result).not.toBe(input);
    expect(result.lots[0].damage_analysis).toBe("");
    expect(result.lots[1].damage_analysis).toBe("Scratch");
    expect(input.lots[0].damage_analysis).toBe("Old dent");
  });
});
