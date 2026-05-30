import type { PlaceCategory, PlaceDetail, PlaceSummary } from "../types";
import { findDistrictByName, getDistrictById } from "../data/bangkokDistricts";

export interface GooglePlaceLike {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string | number;
  types?: string[];
  primaryType?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: Array<{ name?: string; authorAttributions?: Array<{ displayName?: string; uri?: string }> }>;
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  editorialSummary?: { text?: string; languageCode?: string };
  attributions?: Array<{ provider?: string; providerUri?: string }>;
}

const GOOGLE_TYPE_TO_CATEGORY: Record<string, PlaceCategory> = {
  tourist_attraction: "tourist_attraction",
  temple: "temple",
  hindu_temple: "temple",
  buddhist_temple: "temple",
  museum: "museum",
  park: "park",
  shopping_mall: "shopping_mall",
  market: "market",
  night_market: "night_market",
  restaurant: "restaurant",
  cafe: "cafe",
  bakery: "bakery",
  dessert_shop: "dessert",
  ice_cream_shop: "dessert",
};

export function mapGoogleTypesToCategory(types: string[] = [], fallback: PlaceCategory = "tourist_attraction"): PlaceCategory {
  for (const type of types) {
    const category = GOOGLE_TYPE_TO_CATEGORY[type];
    if (category) return category;
  }
  if (types.includes("food")) return "restaurant";
  if (types.includes("store")) return "market";
  return fallback;
}

export function normalizePriceLevel(value: string | number | undefined): number | undefined {
  if (typeof value === "number") return value;
  if (!value) return undefined;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

export function slugifyPlaceId(name: string, googlePlaceId?: string): string {
  const source = googlePlaceId ? googlePlaceId.replace(/^places\//, "") : name;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function normalizeGooglePlaceSummary(
  raw: GooglePlaceLike,
  options: { districtId: string; fallbackCategory: PlaceCategory; lang: "th" | "en"; tags?: string[]; updatedAt?: string },
): PlaceSummary | undefined {
  const googlePlaceId = raw.id?.replace(/^places\//, "");
  const name = raw.displayName?.text;
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
  const district = getDistrictById(options.districtId);
  if (!googlePlaceId || !name || typeof lat !== "number" || typeof lng !== "number" || !district) {
    return undefined;
  }

  const category = mapGoogleTypesToCategory([raw.primaryType, ...(raw.types ?? [])].filter(Boolean) as string[], options.fallbackCategory);
  return {
    id: `google-${slugifyPlaceId(name, googlePlaceId)}`,
    source: "google",
    googlePlaceId,
    name,
    nameTh: options.lang === "th" ? name : "",
    nameEn: options.lang === "en" ? name : undefined,
    category,
    lat,
    lng,
    district: district.nameEn,
    districtId: district.id,
    districtName: district.nameEn,
    rating: raw.rating,
    userRatingCount: raw.userRatingCount,
    priceLevel: normalizePriceLevel(raw.priceLevel),
    googleMapsUri: raw.googleMapsUri,
    tags: Array.from(new Set([category, ...(options.tags ?? [])])),
    attributionRequired: true,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  };
}

export function mergeLocalizedPlaceName(summary: PlaceSummary, raw: GooglePlaceLike, lang: "th" | "en"): PlaceSummary {
  const text = raw.displayName?.text;
  if (!text) return summary;
  if (lang === "th") {
    return { ...summary, nameTh: text, name: text };
  }
  return { ...summary, nameEn: text, name: summary.nameTh || text };
}

export function normalizeGooglePlaceDetail(raw: GooglePlaceLike, cached: PlaceSummary, lang: "th" | "en"): PlaceDetail {
  const localized = mergeLocalizedPlaceName(cached, raw, lang);
  const attributions = [
    ...(raw.attributions ?? []).map((attribution) => ({
      provider: attribution.provider || "Google Maps",
      providerUri: attribution.providerUri,
    })),
    ...((raw.photos ?? []).flatMap((photo) =>
      (photo.authorAttributions ?? []).map((attribution) => ({
        provider: attribution.displayName || "Google Maps photo contributor",
        providerUri: attribution.uri,
      })),
    )),
  ];

  const district = findDistrictByName(cached.districtName) ?? getDistrictById(cached.districtId);
  return {
    ...localized,
    lat: raw.location?.latitude ?? cached.lat,
    lng: raw.location?.longitude ?? cached.lng,
    district: district?.nameEn ?? cached.district,
    districtName: district?.nameEn ?? cached.districtName,
    rating: raw.rating ?? cached.rating,
    userRatingCount: raw.userRatingCount ?? cached.userRatingCount,
    priceLevel: normalizePriceLevel(raw.priceLevel) ?? cached.priceLevel,
    addressTh: lang === "th" ? raw.formattedAddress : undefined,
    addressEn: lang === "en" ? raw.formattedAddress : undefined,
    phone: raw.nationalPhoneNumber ?? raw.internationalPhoneNumber,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions,
    photos: raw.photos?.flatMap((photo) => (photo.name ? [photo.name] : [])),
    websiteUri: raw.websiteUri,
    googleMapsUri: raw.googleMapsUri ?? cached.googleMapsUri,
    description: raw.editorialSummary?.text,
    descriptionTh: lang === "th" ? raw.editorialSummary?.text : undefined,
    descriptionEn: lang === "en" ? raw.editorialSummary?.text : undefined,
    sourceAttributions: attributions.length > 0 ? attributions : cached.attributionRequired ? [{ provider: "Google Maps" }] : [],
  };
}

export function createCachedPlaceDetail(cached: PlaceSummary, lang: "th" | "en" = "th"): PlaceDetail {
  const name = lang === "th" ? cached.nameTh : cached.nameEn || cached.nameTh;
  const descriptionTh =
    cached.source === "curated"
      ? "ข้อมูลสถานที่คัดเลือกสำหรับการขับสำรวจกรุงเทพในเกม ใช้ร่วมกับข้อมูล Google Places เมื่อเปิดใช้งาน API"
      : "ข้อมูลจากแคช Google Places สำหรับการสำรวจในเกม";
  const descriptionEn =
    cached.source === "curated"
      ? "Curated Bangkok guide entry for in-game exploration. Google Places details can enrich it when the API is configured."
      : "Cached Google Places entry for in-game exploration.";

  return {
    ...cached,
    name,
    description: lang === "th" ? descriptionTh : descriptionEn,
    descriptionTh,
    descriptionEn,
    googleMapsUri: cached.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cached.nameEn ?? cached.nameTh)}`,
    sourceAttributions: cached.attributionRequired ? [{ provider: "Google Maps" }] : [],
  };
}
