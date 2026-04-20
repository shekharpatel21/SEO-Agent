// Minimal ISO country → DataForSEO numeric location_code mapping.
// Extend as needed; falls back to US (2840) when unmapped.
const ISO_TO_DFS: Record<string, number> = {
  us: 2840,
  uk: 2826,
  gb: 2826,
  ca: 2124,
  au: 2036,
  in: 2356,
  de: 2276,
  fr: 2250,
  es: 2724,
  it: 2380,
  nl: 2528,
  br: 2076,
  mx: 2484,
  jp: 2392,
  sg: 2702,
  ae: 2784,
};

export function toDataForSEOLocationCode(location?: string, fallback = 2840): number {
  if (!location) return fallback;
  return ISO_TO_DFS[location.toLowerCase()] ?? fallback;
}

export function toSemrushDb(location?: string, fallback = "us"): string {
  if (!location) return fallback;
  return location.toLowerCase();
}

export function toAhrefsCountry(location?: string, fallback = "us"): string {
  if (!location) return fallback;
  return location.toLowerCase();
}
