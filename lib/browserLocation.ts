export type BrowserCoordinates = {
  latitude: number;
  longitude: number;
};

export const CURRENT_BROWSER_LOCATION_LABEL = "Current Browser Location";

export function isValidBrowserCoordinates(
  latitude: unknown,
  longitude: unknown
): boolean {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

export function formatBrowserCoordinates(
  latitude: unknown,
  longitude: unknown
): string {
  if (!isValidBrowserCoordinates(latitude, longitude)) {
    return "Latitude/Longitude not detected";
  }

  return `Lat ${Number(latitude).toFixed(5)} / Long ${Number(longitude).toFixed(5)}`;
}
