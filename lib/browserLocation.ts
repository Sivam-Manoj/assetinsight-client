export type BrowserCoordinates = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export const CURRENT_BROWSER_LOCATION_LABEL = "Current Browser Location";

const NON_LOCATION_LABELS = new Set([
  CURRENT_BROWSER_LOCATION_LABEL.toLowerCase(),
  "latitude/longitude not detected",
  "detecting browser location",
  "detecting current location",
]);

export const FRESH_HIGH_ACCURACY_POSITION_OPTIONS: Readonly<PositionOptions> =
  Object.freeze({
    enableHighAccuracy: true,
    timeout: 20_000,
    maximumAge: 0,
  });

function finiteCoordinate(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidBrowserCoordinates(
  latitude: unknown,
  longitude: unknown
): boolean {
  const parsedLatitude = finiteCoordinate(latitude);
  const parsedLongitude = finiteCoordinate(longitude);
  return (
    parsedLatitude !== null &&
    parsedLongitude !== null &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180
  );
}

export function hasUsableReportLocation(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    !NON_LOCATION_LABELS.has(normalized.replace(/…|\.\.\.$/g, "").toLowerCase())
  );
}

export function formatBrowserCoordinates(
  latitude: unknown,
  longitude: unknown
): string {
  if (!isValidBrowserCoordinates(latitude, longitude)) {
    return "Latitude/Longitude not detected";
  }

  return `Lat ${Number(latitude).toFixed(6)} / Long ${Number(longitude).toFixed(6)}`;
}

export function formatBrowserAccuracyStatus(accuracy: unknown): string {
  const parsedAccuracy = finiteCoordinate(accuracy);
  if (parsedAccuracy === null || parsedAccuracy < 0) {
    return "Location accuracy unavailable";
  }

  return `Accurate to within approximately ${Math.max(
    1,
    Math.round(parsedAccuracy)
  )} m`;
}
