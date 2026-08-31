import { describe, expect, it } from "vitest";
import {
  FRESH_HIGH_ACCURACY_POSITION_OPTIONS,
  formatBrowserAccuracyStatus,
  formatBrowserCoordinates,
  hasUsableReportLocation,
  isValidBrowserCoordinates,
} from "./browserLocation";

describe("browser location helpers", () => {
  it.each([
    [null, null],
    [undefined, undefined],
    ["", ""],
    ["   ", "   "],
    [Number.NaN, 0],
    [0, Number.POSITIVE_INFINITY],
    [91, 0],
    [-91, 0],
    [0, 181],
    [0, -181],
  ])("rejects invalid coordinates %p, %p", (latitude, longitude) => {
    expect(isValidBrowserCoordinates(latitude, longitude)).toBe(false);
  });

  it("accepts zero and valid numeric strings without coercing blank values", () => {
    expect(isValidBrowserCoordinates(0, 0)).toBe(true);
    expect(isValidBrowserCoordinates("0", "0")).toBe(true);
    expect(isValidBrowserCoordinates("51.507351", "-0.127758")).toBe(true);
  });

  it("formats coordinates to six decimal places", () => {
    expect(formatBrowserCoordinates(51.5073509, -0.1277584)).toBe(
      "Lat 51.507351 / Long -0.127758"
    );
    expect(formatBrowserCoordinates(null, null)).toBe(
      "Latitude/Longitude not detected"
    );
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "Current Browser Location",
    " current browser location ",
    "CURRENT BROWSER LOCATION",
  ])("rejects unusable report location %p", (location) => {
    expect(hasUsableReportLocation(location)).toBe(false);
  });

  it("accepts detected coordinates and manually entered report locations", () => {
    expect(
      hasUsableReportLocation("Lat 51.507351 / Long -0.127758")
    ).toBe(true);
    expect(hasUsableReportLocation("10 Downing Street, London")).toBe(true);
  });

  it("provides an honest accuracy status", () => {
    expect(formatBrowserAccuracyStatus(7.6)).toBe(
      "Accurate to within approximately 8 m"
    );
    expect(formatBrowserAccuracyStatus(0)).toBe(
      "Accurate to within approximately 1 m"
    );
    expect(formatBrowserAccuracyStatus(null)).toBe(
      "Location accuracy unavailable"
    );
  });

  it("requires a fresh high-accuracy browser position", () => {
    expect(FRESH_HIGH_ACCURACY_POSITION_OPTIONS).toEqual({
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    });
    expect(Object.isFrozen(FRESH_HIGH_ACCURACY_POSITION_OPTIONS)).toBe(true);
  });
});
