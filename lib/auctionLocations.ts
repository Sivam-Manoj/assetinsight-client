export type AuctionLocationCoordinates = {
  latitude: number;
  longitude: number;
};

export const AUCTION_LOCATIONS = [
  "800 North Service Road, Emerald Park, SK",
  "203 60th Street East, Saskatoon, SK",
  "5221 Portage Ave, Headingley, MB",
  "8761 Wilkes Ave, Saint Eustache, MB",
  "601 17th Street East, Brandon, MB",
  "1209 - 8A Street, Nisku, AB",
  "6270 Dorman Rd, Mississauga, ON",
  "175 Chem. Du Grand-Pre, Saint-Jean-Sur-Richelieu, QC",
  "4728 I-35W, Alvarado, TX 76009",
] as const;

export const DEFAULT_AUCTION_LOCATION = AUCTION_LOCATIONS[0];

export const AUCTION_LOCATION_COORDINATES: Record<
  string,
  AuctionLocationCoordinates
> = {
  "800 North Service Road, Emerald Park, SK": {
    latitude: 50.44832,
    longitude: -104.39937,
  },
  "203 60th Street East, Saskatoon, SK": {
    latitude: 52.18733,
    longitude: -106.66773,
  },
  "5221 Portage Ave, Headingley, MB": {
    latitude: 49.87588,
    longitude: -97.39485,
  },
  "8761 Wilkes Ave, Saint Eustache, MB": {
    latitude: 49.83732,
    longitude: -97.37525,
  },
  "601 17th Street East, Brandon, MB": {
    latitude: 49.84017,
    longitude: -99.91557,
  },
  "1209 - 8A Street, Nisku, AB": {
    latitude: 53.31415,
    longitude: -113.51435,
  },
  "6270 Dorman Rd, Mississauga, ON": {
    latitude: 43.69555,
    longitude: -79.611889,
  },
  "175 Chem. Du Grand-Pre, Saint-Jean-Sur-Richelieu, QC": {
    latitude: 45.35048,
    longitude: -73.36109,
  },
  "4728 I-35W, Alvarado, TX 76009": {
    latitude: 32.43467,
    longitude: -97.2455,
  },
};

function normalizeLocationKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

const canonicalLocationByKey = new Map(
  AUCTION_LOCATIONS.map((location) => [
    normalizeLocationKey(location),
    location,
  ])
);

export function resolveAuctionLocation(value?: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return DEFAULT_AUCTION_LOCATION;
  return canonicalLocationByKey.get(normalizeLocationKey(text)) || text;
}

export function getAuctionLocationCoordinates(
  value?: unknown
): AuctionLocationCoordinates | undefined {
  const location = resolveAuctionLocation(value);
  const canonical = canonicalLocationByKey.get(normalizeLocationKey(location));
  return canonical ? AUCTION_LOCATION_COORDINATES[canonical] : undefined;
}

export function formatAuctionCoordinates(value?: unknown): string {
  const coords = getAuctionLocationCoordinates(value);
  if (!coords) return "Latitude/Longitude unavailable";
  return `Lat ${coords.latitude.toFixed(5)} / Long ${coords.longitude.toFixed(5)}`;
}
