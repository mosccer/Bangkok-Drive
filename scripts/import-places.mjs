/* global process, fetch, console, setTimeout */
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2] ?? "dry-run";
const dryRun = process.argv.includes("--dry-run") || mode === "dry-run";
const lang = process.env.PLACES_IMPORT_LANG === "en" ? "en" : "th";
const qps = Number(process.env.PLACES_IMPORT_QPS ?? 1);
const dailyLimit = Number(process.env.PLACES_IMPORT_DAILY_REQUEST_LIMIT ?? 300);
const maxPerDistrictCategory = Number(process.env.MAX_RESULTS_PER_DISTRICT_CATEGORY ?? 60);
const googleKey = process.env.GOOGLE_PLACES_API_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resumeCursor = process.env.PLACES_IMPORT_RESUME_CURSOR ?? process.argv.find((arg) => arg.startsWith("--cursor="))?.replace("--cursor=", "");

const nearbyTypes = ["restaurant", "cafe", "bakery", "tourist_attraction", "museum", "park", "shopping_mall"];
const textTypes = ["temple", "street_food", "night_market", "dessert", "market"];
const districts = [
  ["phra-nakhon", "พระนคร", "Phra Nakhon", 13.7566, 100.4982],
  ["dusit", "ดุสิต", "Dusit", 13.7768, 100.5206],
  ["nong-chok", "หนองจอก", "Nong Chok", 13.8554, 100.8628],
  ["bang-rak", "บางรัก", "Bang Rak", 13.7305, 100.5230],
  ["bang-khen", "บางเขน", "Bang Khen", 13.8736, 100.5965],
  ["bang-kapi", "บางกะปิ", "Bang Kapi", 13.7658, 100.6478],
  ["pathum-wan", "ปทุมวัน", "Pathum Wan", 13.7449, 100.5329],
  ["pom-prap-sattru-phai", "ป้อมปราบศัตรูพ่าย", "Pom Prap Sattru Phai", 13.7538, 100.5136],
  ["phra-khanong", "พระโขนง", "Phra Khanong", 13.7022, 100.6019],
  ["min-buri", "มีนบุรี", "Min Buri", 13.8130, 100.7312],
  ["lat-krabang", "ลาดกระบัง", "Lat Krabang", 13.7223, 100.7852],
  ["yan-nawa", "ยานนาวา", "Yan Nawa", 13.6969, 100.5431],
  ["samphanthawong", "สัมพันธวงศ์", "Samphanthawong", 13.7399, 100.5090],
  ["phaya-thai", "พญาไท", "Phaya Thai", 13.7801, 100.5428],
  ["thon-buri", "ธนบุรี", "Thon Buri", 13.7257, 100.4850],
  ["bangkok-yai", "บางกอกใหญ่", "Bangkok Yai", 13.7353, 100.4754],
  ["huai-khwang", "ห้วยขวาง", "Huai Khwang", 13.7767, 100.5790],
  ["khlong-san", "คลองสาน", "Khlong San", 13.7266, 100.5099],
  ["taling-chan", "ตลิ่งชัน", "Taling Chan", 13.7765, 100.4568],
  ["bangkok-noi", "บางกอกน้อย", "Bangkok Noi", 13.7661, 100.4757],
  ["bang-khun-thian", "บางขุนเทียน", "Bang Khun Thian", 13.5940, 100.4268],
  ["phasi-charoen", "ภาษีเจริญ", "Phasi Charoen", 13.7147, 100.4372],
  ["nong-khaem", "หนองแขม", "Nong Khaem", 13.7047, 100.3488],
  ["rat-burana", "ราษฎร์บูรณะ", "Rat Burana", 13.6824, 100.5051],
  ["bang-phlat", "บางพลัด", "Bang Phlat", 13.7930, 100.5057],
  ["din-daeng", "ดินแดง", "Din Daeng", 13.7697, 100.5527],
  ["bueng-kum", "บึงกุ่ม", "Bueng Kum", 13.7852, 100.6691],
  ["sathon", "สาทร", "Sathon", 13.7212, 100.5261],
  ["bang-sue", "บางซื่อ", "Bang Sue", 13.8035, 100.5375],
  ["chatuchak", "จตุจักร", "Chatuchak", 13.8166, 100.5610],
  ["bang-kho-laem", "บางคอแหลม", "Bang Kho Laem", 13.6931, 100.5020],
  ["prawet", "ประเวศ", "Prawet", 13.7060, 100.6945],
  ["khlong-toei", "คลองเตย", "Khlong Toei", 13.7074, 100.5847],
  ["suan-luang", "สวนหลวง", "Suan Luang", 13.7303, 100.6514],
  ["chom-thong", "จอมทอง", "Chom Thong", 13.6777, 100.4841],
  ["don-mueang", "ดอนเมือง", "Don Mueang", 13.9136, 100.5894],
  ["ratchathewi", "ราชเทวี", "Ratchathewi", 13.7590, 100.5362],
  ["lat-phrao", "ลาดพร้าว", "Lat Phrao", 13.8066, 100.6072],
  ["watthana", "วัฒนา", "Watthana", 13.7306, 100.5857],
  ["bang-khae", "บางแค", "Bang Khae", 13.6961, 100.4094],
  ["lak-si", "หลักสี่", "Lak Si", 13.8877, 100.5793],
  ["sai-mai", "สายไหม", "Sai Mai", 13.9190, 100.6540],
  ["khan-na-yao", "คันนายาว", "Khan Na Yao", 13.8261, 100.6793],
  ["saphan-sung", "สะพานสูง", "Saphan Sung", 13.7686, 100.6854],
  ["wang-thonglang", "วังทองหลาง", "Wang Thonglang", 13.7855, 100.6116],
  ["khlong-sam-wa", "คลองสามวา", "Khlong Sam Wa", 13.8591, 100.7048],
  ["bang-na", "บางนา", "Bang Na", 13.6676, 100.6070],
  ["thawi-watthana", "ทวีวัฒนา", "Thawi Watthana", 13.7878, 100.3638],
  ["thung-khru", "ทุ่งครุ", "Thung Khru", 13.6473, 100.5090],
  ["bang-bon", "บางบอน", "Bang Bon", 13.6592, 100.3991],
].map(([id, nameTh, nameEn, lat, lng]) => ({ id, nameTh, nameEn, lat, lng }));

function supabase() {
  if (!supabaseUrl || !supabaseServiceKey) return undefined;
  return createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
}

function textQuery(type, district) {
  const districtName = `${district.nameTh} ${district.nameEn}`;
  return {
    temple: `วัด เขต${district.nameTh} กรุงเทพ`,
    street_food: `street food ${districtName} Bangkok`,
    night_market: `night market ${districtName} Bangkok`,
    dessert: `dessert cafe ${districtName} Bangkok`,
    market: `market ${districtName} Bangkok`,
  }[type];
}

function normalizeGooglePlace(raw, district, category) {
  const googlePlaceId = raw.id?.replace(/^places\//, "");
  if (!googlePlaceId || !raw.displayName?.text || !raw.location?.latitude || !raw.location?.longitude) return undefined;
  return {
    id: `google-${googlePlaceId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    source: "google",
    googlePlaceId,
    name: raw.displayName.text,
    nameTh: lang === "th" ? raw.displayName.text : "",
    nameEn: lang === "en" ? raw.displayName.text : undefined,
    category,
    lat: raw.location.latitude,
    lng: raw.location.longitude,
    district: district.nameEn,
    districtId: district.id,
    districtName: district.nameEn,
    rating: raw.rating,
    userRatingCount: raw.userRatingCount,
    priceLevel: raw.priceLevel,
    googleMapsUri: raw.googleMapsUri,
    tags: [category],
    attributionRequired: true,
    updatedAt: new Date().toISOString(),
  };
}

async function googleRequest(path, body) {
  const response = await fetch(`https://places.googleapis.com/v1/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": googleKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.primaryType,places.googleMapsUri",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Google Places ${path} failed: ${response.status}`);
  return response.json();
}

async function fetchGoogleIndexCell(district, category) {
  const maxResultCount = Math.min(20, maxPerDistrictCategory);
  const body =
    nearbyTypes.includes(category)
      ? {
          includedTypes: [category],
          maxResultCount,
          languageCode: lang,
          regionCode: "TH",
          locationRestriction: { circle: { center: { latitude: district.lat, longitude: district.lng }, radius: 3200 } },
        }
      : {
          textQuery: textQuery(category, district),
          maxResultCount,
          languageCode: lang,
          regionCode: "TH",
          locationBias: { circle: { center: { latitude: district.lat, longitude: district.lng }, radius: 3200 } },
        };
  const payload = await googleRequest(nearbyTypes.includes(category) ? "places:searchNearby" : "places:searchText", body);
  return (payload.places ?? []).flatMap((place) => normalizeGooglePlace(place, district, category) ?? []);
}

async function upsertRows(table, rows, key) {
  if (dryRun) {
    console.log(`[dry-run] would upsert ${rows.length} rows into ${table}`);
    return;
  }
  const client = supabase();
  if (!client) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for Supabase writes.");
  const { error } = await client.from(table).upsert(rows, { onConflict: key });
  if (error) throw error;
}

async function curatedSeed() {
  const places = JSON.parse(await readFile("public/data/places.json", "utf8"));
  await upsertRows(
    "curated_places",
    places
      .filter((place) => place.source === "curated")
      .map((place) => ({
        id: place.id,
        summary: place,
        district_id: place.districtId,
        category: place.category,
        is_active: true,
        updated_at: new Date().toISOString(),
      })),
    "id",
  );
}

async function googleIndex() {
  if (!googleKey && !dryRun) throw new Error("Set GOOGLE_PLACES_API_KEY or run with --dry-run.");
  const categories = [...nearbyTypes, ...textTypes];
  const [startDistrict = "0", startCategory = "0"] = (resumeCursor ?? "0:0").split(":");
  let quotaUsed = 0;

  for (let districtIndex = Number(startDistrict); districtIndex < districts.length; districtIndex += 1) {
    for (let categoryIndex = districtIndex === Number(startDistrict) ? Number(startCategory) : 0; categoryIndex < categories.length; categoryIndex += 1) {
      if (quotaUsed >= dailyLimit) {
        console.log(`Quota guard stopped import at cursor ${districtIndex}:${categoryIndex}`);
        return;
      }
      const district = districts[districtIndex];
      const category = categories[categoryIndex];
      if (dryRun) {
        quotaUsed += 1;
        continue;
      }
      const rows = await fetchGoogleIndexCell(district, category);
      quotaUsed += 1;
      await upsertRows(
        "google_place_index",
        rows.map((summary) => ({
          google_place_id: summary.googlePlaceId,
          summary,
          district_id: summary.districtId,
          category: summary.category,
          last_seen_at: new Date().toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        })),
        "google_place_id",
      );
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(1000 / qps)));
    }
  }
  console.log(`Google index import completed with ${quotaUsed} requests.`);
}

async function exportStatic() {
  const client = supabase();
  if (!client) {
    console.log("No Supabase env set; keeping existing public/data/places.json.");
    return;
  }
  const [curated, google] = await Promise.all([
    client.from("curated_places").select("summary").eq("is_active", true),
    client.from("google_place_index").select("summary").eq("is_active", true),
  ]);
  if (curated.error || google.error) throw curated.error ?? google.error;
  const places = [...(curated.data ?? []), ...(google.data ?? [])].flatMap((row) => row.summary ?? []);
  await writeFile("public/data/places.json", `${JSON.stringify(places, null, 2)}\n`);
  console.log(`Exported ${places.length} places to public/data/places.json.`);
}

async function main() {
  if (mode === "dry-run") {
    console.log(`Bangkok import frame: ${districts.length} districts, ${nearbyTypes.length + textTypes.length} categories.`);
    console.log(`Estimated full index requests: ${districts.length * (nearbyTypes.length + textTypes.length)}. Daily guard: ${dailyLimit}.`);
    return;
  }
  if (mode === "curated-seed") return curatedSeed();
  if (mode === "google-index") return googleIndex();
  if (mode === "refresh-details") {
    console.log("refresh-details is intentionally lazy in v1: /api/places/:id fetches details on demand and can be moved to a scheduled job later.");
    return;
  }
  if (mode === "export-static") return exportStatic();
  throw new Error(`Unknown places import mode "${mode}". Use dry-run, curated-seed, google-index, refresh-details, or export-static.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
