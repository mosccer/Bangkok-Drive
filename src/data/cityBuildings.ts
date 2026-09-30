import type { BuildingUse, MapBuilding, MapBuildingKind, RoadSegment, WorldMeters } from "../types";
import { hashString } from "../simulation/hash";
import { convexPolygonsOverlap, polygonBounds, polygonCentroid, rectsOverlap, segmentPolygonDistance, type Rect } from "../simulation/geometry2d";
import type { BangkokDistrict } from "./bangkokDistricts";
import type { CityDensity, CityRoadEdge, CityRoadPiece } from "./proceduralCity";

// Building placement and flavour for the procedural city: street-front rows along every road plus
// infill inside each superblock, each with a use, floors, a Thai/English name, address and tenants.

export interface CityCell {
  id: string;
  // Grid corners in order: north-west, north-east, south-east, south-west.
  corners: WorldMeters[];
}

export interface BuildingPlacementContext {
  tileId: string;
  rect: Rect;
  cells: CityCell[];
  edgesNear: (rect: Rect) => CityRoadEdge[];
  piecesNear: (rect: Rect) => CityRoadPiece[];
  piecesOfEdge: (edge: CityRoadEdge) => CityRoadPiece[];
  blocked: (point: WorldMeters, radius: number) => boolean;
  density: (point: WorldMeters) => CityDensity;
  district: (point: WorldMeters) => BangkokDistrict;
}

const SIDEWALK = 3.2;
const ROAD_CLEARANCE = 2.2;

interface Dimensions {
  width: number;
  depth: number;
  floors: number;
  heightMeters: number;
}

const pick = <T>(list: readonly T[], seed: number): T => list[seed % list.length];
const range = (seed: number, min: number, max: number) => min + (seed % (max - min + 1));

const majorKinds = new Set<RoadSegment["kind"]>(["primary", "secondary", "arterial", "motorway"]);

export function pickFrontageUse(kind: RoadSegment["kind"], density: CityDensity, seed: number): BuildingUse {
  const r = (seed % 1000) / 1000;
  const r2 = ((seed >>> 10) % 1000) / 1000;
  const major = majorKinds.has(kind);
  const towerChance = density.oldTown ? 0 : major ? 0.06 + 0.42 * density.cbd : 0.02 + 0.14 * density.cbd;
  if (r < towerChance) {
    if (!major) return "condo";
    if (density.cbd > 0.5) return r2 < 0.45 ? "office" : r2 < 0.8 ? "condo" : "hotel";
    return r2 < 0.6 ? "condo" : r2 < 0.8 ? "office" : "hotel";
  }
  if (major) {
    if (r2 < 0.03 + density.cbd * 0.04) return "mall";
    if (r2 < 0.1) return "convenience";
    if (r2 < 0.115) return "hospital";
    if (r2 < 0.13) return "school";
    if (r2 < 0.15) return "government";
    if (r2 < 0.17) return "market";
    if (r2 < 0.185) return "temple";
    if (r2 < 0.3) return "townhouse";
    return "shophouse";
  }
  if (r2 < 0.04) return "convenience";
  if (r2 < 0.055) return "school";
  if (r2 < 0.07) return "temple";
  if (r2 < 0.08) return "market";
  if (r2 < 0.11 && density.cbd < 0.2) return "warehouse";
  if (r2 < 0.28) return "house";
  if (r2 < 0.55) return "townhouse";
  return "shophouse";
}

export function pickInfillUse(density: CityDensity, seed: number): BuildingUse {
  const r = (seed % 1000) / 1000;
  const tower = density.oldTown ? 0 : 0.06 + density.cbd * 0.32;
  if (r < tower) return (seed >>> 11) % 4 === 0 ? "office" : "condo";
  if (r < tower + 0.04) return "warehouse";
  if (r < tower + 0.07) return "school";
  if (r < tower + 0.09) return "temple";
  if (r < tower + 0.1) return "hospital";
  if (r < tower + 0.12) return "market";
  if (r < tower + 0.14) return "government";
  if (r < tower + 0.24) return "shophouse";
  if (r < tower + 0.5) return "townhouse";
  return "house";
}

export function buildingDimensions(use: BuildingUse, seed: number, density: CityDensity, infill = false): Dimensions {
  const s1 = seed >>> 3;
  const s2 = seed >>> 9;
  const s3 = seed >>> 15;
  const cbd = density.cbd;
  let width: number;
  let depth: number;
  let floors: number;
  let floorHeight = 3.3;
  switch (use) {
    case "shophouse":
      width = range(s1, 8, 12);
      depth = range(s2, 18, 27);
      floors = density.oldTown ? range(s3, 2, 3) : range(s3, 3, 5);
      break;
    case "townhouse":
      width = range(s1, 9, 12);
      depth = range(s2, 16, 22);
      floors = range(s3, 2, 3);
      break;
    case "house":
      width = range(s1, 14, 20);
      depth = range(s2, 14, 20);
      floors = range(s3, 1, 2);
      floorHeight = 3.2;
      break;
    case "condo":
      width = infill ? range(s1, 24, 34) : range(s1, 26, 41);
      depth = infill ? range(s2, 22, 32) : range(s2, 24, 38);
      floors = 8 + (s3 % (10 + Math.round(36 * cbd)));
      break;
    case "office":
      width = infill ? range(s1, 26, 36) : range(s1, 28, 46);
      depth = infill ? range(s2, 24, 34) : range(s2, 26, 42);
      floors = 12 + (s3 % (10 + Math.round(48 * cbd)));
      break;
    case "hotel":
      width = range(s1, 26, 38);
      depth = range(s2, 22, 34);
      floors = 10 + (s3 % (8 + Math.round(30 * cbd)));
      break;
    case "mall":
      width = range(s1, 70, 120);
      depth = range(s2, 50, 80);
      floors = range(s3, 4, 7);
      floorHeight = 5;
      break;
    case "temple":
      width = range(s1, 26, 36);
      depth = range(s2, 40, 56);
      floors = 1;
      floorHeight = range(s3, 12, 17);
      break;
    case "school":
      width = range(s1, 50, 70);
      depth = range(s2, 18, 24);
      floors = range(s3, 3, 4);
      break;
    case "hospital":
      width = range(s1, 40, 60);
      depth = range(s2, 30, 42);
      floors = range(s3, 6, 14);
      break;
    case "market":
      width = range(s1, 40, 60);
      depth = range(s2, 30, 48);
      floors = range(s3, 1, 2);
      floorHeight = 5;
      break;
    case "warehouse":
      width = range(s1, 30, 50);
      depth = range(s2, 28, 40);
      floors = 1;
      floorHeight = range(s3, 8, 11);
      break;
    case "government":
      width = range(s1, 36, 56);
      depth = range(s2, 26, 38);
      floors = range(s3, 3, 6);
      break;
    case "convenience":
      width = range(s1, 12, 16);
      depth = range(s2, 14, 18);
      floors = range(s3, 1, 2);
      break;
  }
  if (density.oldTown) floors = Math.min(floors, use === "hospital" || use === "government" ? 5 : 4);
  return { width, depth, floors, heightMeters: floors * floorHeight + (use === "house" ? 1.5 : 0) };
}

export function kindForUse(use: BuildingUse): MapBuildingKind {
  switch (use) {
    case "condo":
    case "townhouse":
    case "house":
      return "residential";
    case "office":
    case "hotel":
    case "mall":
    case "market":
    case "convenience":
      return "commercial";
    case "temple":
      return "temple";
    case "school":
    case "hospital":
    case "government":
      return "civic";
    case "warehouse":
      return "industrial";
    default:
      return "generic";
  }
}

// ---------------------------------------------------------------------------------------------
// Names, addresses and tenants

const shops: Array<[string, string]> = [
  ["ร้านก๋วยเตี๋ยวเรือ", "Boat noodle shop"],
  ["ร้านข้าวมันไก่", "Chicken rice"],
  ["ร้านกาแฟ", "Coffee shop"],
  ["ร้านขายยา", "Pharmacy"],
  ["ร้านทอง", "Gold shop"],
  ["ร้านซ่อมมอเตอร์ไซค์", "Motorbike repair"],
  ["ร้านนวดแผนไทย", "Thai massage"],
  ["ร้านข้าวแกง", "Curry rice"],
  ["ร้านเสริมสวย", "Beauty salon"],
  ["ร้านโชห่วย", "Corner grocery"],
  ["ร้านชานมไข่มุก", "Bubble tea"],
  ["ร้านผัดไทย", "Pad thai"],
  ["ร้านหมูกระทะ", "Thai BBQ"],
  ["ร้านเครื่องเขียน", "Stationery"],
  ["ร้านมือถือ", "Phone shop"],
  ["ร้านซักรีด", "Laundry"],
  ["ร้านขนมหวาน", "Dessert shop"],
  ["ร้านข้าวขาหมู", "Braised pork leg rice"],
  ["ร้านอาหารตามสั่ง", "Made-to-order kitchen"],
  ["ร้านฮาร์ดแวร์", "Hardware store"],
];
const owners: Array<[string, string]> = [
  ["เจ๊แดง", "Jae Daeng"],
  ["ป้าศรี", "Pa Si"],
  ["ลุงชัย", "Lung Chai"],
  ["เฮียเล้ง", "Hia Leng"],
  ["พี่ต้อม", "Phi Tom"],
  ["ยายปราณี", "Yai Pranee"],
  ["น้าหนึ่ง", "Na Nueng"],
  ["เจ๊หมวย", "Jae Muay"],
  ["ลุงหวัง", "Lung Wang"],
  ["พี่นก", "Phi Nok"],
  ["ป้าจันทร์", "Pa Chan"],
  ["เฮียตี๋", "Hia Tee"],
];
const condoBrands = ["The Lotus", "Baan Suan", "Krung Residence", "Siri Place", "Sky Villa", "River View", "Rim Klong", "Park Avenue", "Urbano", "Nakara", "Plumeria", "Sathu Living", "Metro Loft", "Rattana Suites", "The Orchid"];
const officeNames = ["Krung Thep", "Rattana", "Mongkol", "Sinthorn", "Chaiyo", "Siam Pacific", "Thai Prosperity", "Bangkok City", "Golden Lotus", "Pinnacle", "Charoen", "United", "Asia Link", "Sathu", "Wattana"];
const officeSuffix = ["Tower", "Building", "Plaza", "Center", "Complex"];
const hotelNames = ["Riverside", "Lotus", "Silk Road", "Elephant", "Orchid", "Royal Garden", "Jasmine", "Mango Tree", "Sabai", "Moonlight"];
const mallNames = ["City", "Grand", "Mega", "Lotus", "Park", "Terminal", "Paradise", "Fashion", "Rainbow", "Sun"];
const mallSuffix = ["Plaza", "Mall", "Square", "Market Place"];
const temples: Array<[string, string]> = [
  ["วัดสว่างอารมณ์", "Wat Sawang Arom"],
  ["วัดใหม่", "Wat Mai"],
  ["วัดทองนพคุณ", "Wat Thong Noppakhun"],
  ["วัดศรีมหาธาตุ", "Wat Si Mahathat"],
  ["วัดชัยมงคล", "Wat Chai Mongkhon"],
  ["วัดสุวรรณาราม", "Wat Suwannaram"],
  ["วัดประชาบำรุง", "Wat Pracha Bamrung"],
  ["วัดดอกไม้", "Wat Dokmai"],
  ["วัดโพธิ์ทอง", "Wat Pho Thong"],
  ["วัดราษฎร์บำรุง", "Wat Rat Bamrung"],
  ["วัดสามัคคีธรรม", "Wat Samakkhi Tham"],
  ["วัดปทุมคงคา", "Wat Pathum Khongkha"],
];
const placeWords: Array<[string, string]> = [
  ["เมืองไทย", "Mueang Thai"],
  ["ศรีสุข", "Si Suk"],
  ["ประชาอุทิศ", "Pracha Uthit"],
  ["กรุงสยาม", "Krung Siam"],
  ["ร่วมใจ", "Ruam Jai"],
  ["สามัคคี", "Samakkhi"],
  ["รุ่งเรือง", "Rung Rueang"],
  ["ชัยพฤกษ์", "Chaiyaphruek"],
  ["บุญมา", "Bun Ma"],
  ["พัฒนา", "Phatthana"],
];
const tenantsByUse: Partial<Record<BuildingUse, string[]>> = {
  mall: ["โรงภาพยนตร์", "ฟู้ดคอร์ท", "ซูเปอร์มาร์เก็ต", "ร้านแฟชั่น", "ร้านไอที", "ร้านหนังสือ", "ฟิตเนส", "ธนาคาร"],
  office: ["สำนักงานบริษัทประกัน", "ธนาคาร (สาขา)", "ร้านกาแฟชั้นล่าง", "บริษัทเทคโนโลยี", "สำนักงานกฎหมาย", "เอเจนซีโฆษณา"],
  condo: ["ร้านสะดวกซื้อชั้นล่าง", "ฟิตเนส", "สระว่ายน้ำบนดาดฟ้า", "ร้านซักรีด", "ที่จอดรถ"],
  hotel: ["ล็อบบี้บาร์", "ห้องอาหารไทย", "สปา", "สระว่ายน้ำ", "รูฟท็อปบาร์"],
  market: ["แผงผักสด", "แผงหมู", "ร้านผลไม้", "ของทอด", "ข้าวแกง", "ขนมไทย"],
  hospital: ["แผนกฉุกเฉิน 24 ชม.", "คลินิกทั่วไป", "ร้านขายยา", "ร้านกาแฟ"],
  school: ["โรงอาหาร", "สนามฟุตบอล", "ห้องสมุด"],
  government: ["จุดบริการประชาชน", "ทำบัตรประชาชน"],
  convenience: ["ร้านสะดวกซื้อ 24 ชม.", "ตู้ ATM", "จุดชำระค่าบริการ"],
};

function pickMany(list: string[], seed: number, count: number): string[] {
  const chosen: string[] = [];
  for (let i = 0; chosen.length < Math.min(count, list.length) && i < list.length * 2; i += 1) {
    const item = list[(seed + i * 7) % list.length];
    if (!chosen.includes(item)) chosen.push(item);
  }
  return chosen;
}

function shortRoad(roadName: string): string {
  return roadName.replace(/^(ถนน|ซอย)/, "").replace(/\s.*$/, "");
}

export interface BuildingFlavor {
  name: string;
  nameEn: string;
  tenants: string[];
  yearBuilt: number;
  landmark: boolean;
}

export function buildingFlavor(use: BuildingUse, seed: number, floors: number, roadName: string, district: BangkokDistrict): BuildingFlavor {
  const s = seed >>> 5;
  const place = pick(placeWords, s);
  const houseNumber = (s % 180) + 1;
  switch (use) {
    case "shophouse": {
      const [shopTh, shopEn] = pick(shops, s);
      const [ownerTh, ownerEn] = pick(owners, s >>> 6);
      return { name: `${shopTh}${ownerTh}`, nameEn: `${ownerEn}'s ${shopEn}`, tenants: [`${shopTh}${ownerTh}`, "ห้องพักชั้นบน"], yearBuilt: range(s >>> 3, 1962, 2004), landmark: false };
    }
    case "townhouse":
      return { name: `ทาวน์เฮาส์ ${shortRoad(roadName)} ${houseNumber}`, nameEn: `Townhouse ${houseNumber}`, tenants: [], yearBuilt: range(s >>> 3, 1978, 2018), landmark: false };
    case "house":
      return { name: `บ้านเลขที่ ${houseNumber}`, nameEn: `House no. ${houseNumber}`, tenants: [], yearBuilt: range(s >>> 3, 1965, 2020), landmark: false };
    case "condo": {
      const brand = pick(condoBrands, s);
      return { name: `คอนโด ${brand} ${shortRoad(roadName)}`, nameEn: `${brand} ${district.nameEn}`, tenants: pickMany(tenantsByUse.condo!, s, 3), yearBuilt: range(s >>> 3, 1995, 2025), landmark: floors >= 42 };
    }
    case "office": {
      const nameEn = `${pick(officeNames, s)} ${pick(officeSuffix, s >>> 4)}`;
      return { name: `อาคาร${nameEn}`, nameEn, tenants: pickMany(tenantsByUse.office!, s, 3), yearBuilt: range(s >>> 3, 1985, 2025), landmark: floors >= 38 };
    }
    case "hotel": {
      const nameEn = `${pick(hotelNames, s)} Hotel ${district.nameEn}`;
      return { name: `โรงแรม${pick(hotelNames, s)} ${district.nameTh}`, nameEn, tenants: pickMany(tenantsByUse.hotel!, s, 3), yearBuilt: range(s >>> 3, 1980, 2024), landmark: floors >= 34 };
    }
    case "mall": {
      const nameEn = `${pick(mallNames, s)} ${pick(mallSuffix, s >>> 4)} ${district.nameEn}`;
      return { name: `ศูนย์การค้า ${nameEn}`, nameEn, tenants: pickMany(tenantsByUse.mall!, s, 5), yearBuilt: range(s >>> 3, 1990, 2024), landmark: true };
    }
    case "temple": {
      const [th, en] = pick(temples, s);
      return { name: th, nameEn: en, tenants: ["อุโบสถ", "ศาลาการเปรียญ", "ลานจอดรถ"], yearBuilt: range(s >>> 3, 1782, 1950), landmark: true };
    }
    case "school":
      return { name: `โรงเรียน${place[0]}วิทยา`, nameEn: `${place[1]} Witthaya School`, tenants: pickMany(tenantsByUse.school!, s, 2), yearBuilt: range(s >>> 3, 1950, 2010), landmark: false };
    case "hospital":
      return { name: `โรงพยาบาล${place[0]}`, nameEn: `${place[1]} Hospital`, tenants: pickMany(tenantsByUse.hospital!, s, 3), yearBuilt: range(s >>> 3, 1960, 2020), landmark: true };
    case "market":
      return { name: `ตลาดสด${place[0]}`, nameEn: `${place[1]} Fresh Market`, tenants: pickMany(tenantsByUse.market!, s, 4), yearBuilt: range(s >>> 3, 1955, 2015), landmark: false };
    case "warehouse":
      return { name: `โกดังสินค้า ${houseNumber}`, nameEn: `Warehouse ${houseNumber}`, tenants: [], yearBuilt: range(s >>> 3, 1970, 2015), landmark: false };
    case "government": {
      const options: Array<[string, string]> = [
        [`สำนักงานเขต${district.nameTh}`, `${district.nameEn} District Office`],
        [`สถานีตำรวจนครบาล${district.nameTh}`, `${district.nameEn} Police Station`],
        [`ที่ทำการไปรษณีย์${district.nameTh}`, `${district.nameEn} Post Office`],
      ];
      const [name, nameEn] = pick(options, s);
      return { name, nameEn, tenants: pickMany(tenantsByUse.government!, s, 2), yearBuilt: range(s >>> 3, 1950, 2010), landmark: false };
    }
    case "convenience":
      return { name: "ร้านสะดวกซื้อ 24 ชม.", nameEn: "24h Mini Mart", tenants: pickMany(tenantsByUse.convenience!, s, 3), yearBuilt: range(s >>> 3, 1995, 2024), landmark: false };
  }
}

// ---------------------------------------------------------------------------------------------
// Placement

interface Candidate {
  building: MapBuilding;
  polygon: WorldMeters[];
  bounds: Rect;
}

const frontageCache = new Map<string, Candidate[]>();
const infillCache = new Map<string, Candidate[]>();

function remember<T>(cache: Map<string, T>, key: string, value: T, limit: number): T {
  if (cache.size >= limit) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

function clearOfRoads(polygon: WorldMeters[], bounds: Rect, pieces: CityRoadPiece[]): boolean {
  for (const piece of pieces) {
    const reach = piece.width / 2 + ROAD_CLEARANCE;
    if (
      Math.max(piece.a.x, piece.b.x) + reach < bounds.minX ||
      Math.min(piece.a.x, piece.b.x) - reach > bounds.maxX ||
      Math.max(piece.a.z, piece.b.z) + reach < bounds.minZ ||
      Math.min(piece.a.z, piece.b.z) - reach > bounds.maxZ
    ) {
      continue;
    }
    if (segmentPolygonDistance(piece.a, piece.b, polygon) < reach) return false;
  }
  return true;
}

function footprintClear(polygon: WorldMeters[], center: WorldMeters, halfDiagonal: number, context: BuildingPlacementContext): boolean {
  if (context.blocked(center, halfDiagonal)) return false;
  return polygon.every((corner) => !context.blocked(corner, 0));
}

function makeBuilding(
  id: string,
  polygon: WorldMeters[],
  use: BuildingUse,
  dims: Dimensions,
  seed: number,
  roadName: string,
  houseNumber: string,
  facesStreet: boolean,
  context: BuildingPlacementContext,
): Candidate {
  const center = polygonCentroid(polygon);
  const district = context.district(center);
  const flavor = buildingFlavor(use, seed, dims.floors, roadName, district);
  return {
    polygon,
    bounds: polygonBounds(polygon),
    building: {
      id,
      footprint: polygon,
      heightMeters: dims.heightMeters,
      kind: kindForUse(use),
      use,
      floors: dims.floors,
      name: flavor.name,
      nameEn: flavor.nameEn,
      tenants: flavor.tenants,
      yearBuilt: flavor.yearBuilt,
      landmark: flavor.landmark || dims.floors >= 45,
      roadName,
      address: `${houseNumber} ${roadName} เขต${district.nameTh}`,
      districtId: district.id,
      facesStreet,
    },
  };
}

// Street-front row on both sides of one road edge. Deterministic per edge, so every tile that
// touches the edge gets the same buildings.
function frontageFor(edge: CityRoadEdge, context: BuildingPlacementContext): Candidate[] {
  const cached = frontageCache.get(edge.id);
  if (cached) return cached;
  const result: Candidate[] = [];
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z);
  if (edge.kind === "bridge" || edge.kind === "motorway" || edge.kind === "service" || length < 20) {
    return remember(frontageCache, edge.id, result, 4_000);
  }
  const dx = (edge.b.x - edge.a.x) / length;
  const dz = (edge.b.z - edge.a.z) / length;
  const nx = -dz;
  const nz = dx;
  const ownPieces = context.piecesOfEdge(edge);
  const pieceLength = length / ownPieces.length;
  const pad = 110;
  const near = context
    .piecesNear({
      minX: Math.min(edge.a.x, edge.b.x) - pad,
      maxX: Math.max(edge.a.x, edge.b.x) + pad,
      minZ: Math.min(edge.a.z, edge.b.z) - pad,
      maxZ: Math.max(edge.a.z, edge.b.z) + pad,
    })
    .filter((piece) => {
      if (piece.edgeId === edge.id) return false;
      if (piece.roadId !== edge.roadId) return true;
      const pl = Math.hypot(piece.b.x - piece.a.x, piece.b.z - piece.a.z) || 1;
      return Math.abs(((piece.b.x - piece.a.x) / pl) * dx + ((piece.b.z - piece.a.z) / pl) * dz) < 0.97;
    });
  const half = edge.width / 2;
  for (const side of [-1, 1]) {
    let along = 3 + (hashString(`${edge.id}|${side}`) % 7);
    let index = 0;
    while (along < length - 4 && index < 300) {
      const seed = hashString(`${edge.id}|${side}|${index}`);
      index += 1;
      const probe = { x: edge.a.x + dx * along, z: edge.a.z + dz * along };
      const density = context.density(probe);
      let use = pickFrontageUse(edge.kind, density, seed);
      let dims = buildingDimensions(use, seed, density);
      if (along + dims.width > length - 4 && use !== "shophouse") {
        use = "shophouse";
        dims = buildingDimensions(use, seed, density);
      }
      if (along + dims.width > length - 4) break;
      const row = use === "shophouse" || use === "townhouse";
      const gap = row ? ((seed >>> 9) % 13 === 0 ? 4 + ((seed >>> 13) % 7) : 0.4) : 3 + ((seed >>> 9) % 7);
      const centerAlong = along + dims.width / 2;
      const offset = (half + SIDEWALK + 1.2 + dims.depth / 2) * side;
      const center = { x: edge.a.x + dx * centerAlong + nx * offset, z: edge.a.z + dz * centerAlong + nz * offset };
      const piece = ownPieces[Math.min(ownPieces.length - 1, Math.floor(centerAlong / pieceLength))];
      const hw = dims.width / 2;
      const hd = dims.depth / 2;
      const corner = (u: number, v: number) => ({ x: center.x + dx * u + nx * v * side, z: center.z + dz * u + nz * v * side });
      const polygon = [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)];
      const bounds = polygonBounds(polygon);
      if (piece.kept && footprintClear(polygon, center, Math.hypot(hw, hd), context) && clearOfRoads(polygon, bounds, near)) {
        const houseNumber = `${Math.floor(along / 9) * 2 + (side > 0 ? 1 : 2)}${row && seed % 3 === 0 ? `/${(seed >>> 4) % 40}` : ""}`;
        result.push(makeBuilding(`${edge.id}|${side}|${index}`, polygon, use, dims, seed, edge.name, houseNumber, true, context));
      }
      along += dims.width + gap;
    }
  }
  return remember(frontageCache, edge.id, result, 4_000);
}

function cellInnerRect(cell: CityCell): Rect {
  const [nw, ne, se, sw] = cell.corners;
  const inset = 18;
  return {
    minX: Math.max(nw.x, sw.x) + inset,
    maxX: Math.min(ne.x, se.x) - inset,
    minZ: Math.max(nw.z, ne.z) + inset,
    maxZ: Math.min(sw.z, se.z) - inset,
  };
}

// Back rows and courtyard buildings inside a superblock, packed around the street fronts.
function infillFor(cell: CityCell, context: BuildingPlacementContext): Candidate[] {
  const cached = infillCache.get(cell.id);
  if (cached) return cached;
  const result: Candidate[] = [];
  const inner = cellInnerRect(cell);
  if (inner.maxX - inner.minX < 40 || inner.maxZ - inner.minZ < 40) return remember(infillCache, cell.id, result, 1_500);
  const around = { minX: inner.minX - 130, maxX: inner.maxX + 130, minZ: inner.minZ - 130, maxZ: inner.maxZ + 130 };
  const pieces = context.piecesNear(around);
  const occupied: Candidate[] = [];
  for (const edge of context.edgesNear(around)) {
    for (const candidate of frontageFor(edge, context)) {
      if (rectsOverlap(candidate.bounds, around)) occupied.push(candidate);
    }
  }
  const spacing = 30;
  for (let x = inner.minX + spacing / 2; x < inner.maxX; x += spacing) {
    for (let z = inner.minZ + spacing / 2; z < inner.maxZ; z += spacing) {
      const seed = hashString(`in${cell.id}:${Math.round(x)}:${Math.round(z)}`);
      if (seed % 100 < 14) continue;
      const center = { x: x + (((seed >>> 7) % 9) - 4), z: z + (((seed >>> 11) % 9) - 4) };
      const density = context.density(center);
      const use = pickInfillUse(density, seed);
      const dims = buildingDimensions(use, seed, density, true);
      const hw = dims.width / 2;
      const hd = dims.depth / 2;
      if (center.x - hw < inner.minX || center.x + hw > inner.maxX || center.z - hd < inner.minZ || center.z + hd > inner.maxZ) continue;
      const polygon = [
        { x: center.x - hw, z: center.z - hd },
        { x: center.x + hw, z: center.z - hd },
        { x: center.x + hw, z: center.z + hd },
        { x: center.x - hw, z: center.z + hd },
      ];
      const bounds = polygonBounds(polygon);
      if (!footprintClear(polygon, center, Math.hypot(hw, hd), context) || !clearOfRoads(polygon, bounds, pieces)) continue;
      const overlaps = occupied.some((other) => rectsOverlap(other.bounds, { minX: bounds.minX - 2, maxX: bounds.maxX + 2, minZ: bounds.minZ - 2, maxZ: bounds.maxZ + 2 }) && convexPolygonsOverlap(other.polygon, polygon, 2));
      if (overlaps) continue;
      const nearestRoad = pieces.reduce<{ name: string; distance: number }>(
        (best, piece) => {
          const distance = Math.hypot((piece.a.x + piece.b.x) / 2 - center.x, (piece.a.z + piece.b.z) / 2 - center.z);
          return distance < best.distance ? { name: piece.name, distance } : best;
        },
        { name: "ซอยภายใน", distance: Number.POSITIVE_INFINITY },
      );
      const candidate = makeBuilding(`${cell.id}|in|${Math.round(x)}:${Math.round(z)}`, polygon, use, dims, seed, nearestRoad.name, `${(seed % 300) + 1}/${(seed >>> 8) % 60}`, false, context);
      occupied.push(candidate);
      result.push(candidate);
    }
  }
  return remember(infillCache, cell.id, result, 1_500);
}

export function generateCityBuildings(context: BuildingPlacementContext): MapBuilding[] {
  const { rect } = context;
  const inside = (candidate: Candidate) => {
    const center = polygonCentroid(candidate.polygon);
    return center.x >= rect.minX && center.x < rect.maxX && center.z >= rect.minZ && center.z < rect.maxZ;
  };
  const buildings: MapBuilding[] = [];
  const seen = new Set<string>();
  const around = { minX: rect.minX - 110, maxX: rect.maxX + 110, minZ: rect.minZ - 110, maxZ: rect.maxZ + 110 };
  for (const edge of context.edgesNear(around)) {
    for (const candidate of frontageFor(edge, context)) {
      if (inside(candidate) && !seen.has(candidate.building.id)) {
        seen.add(candidate.building.id);
        buildings.push(candidate.building);
      }
    }
  }
  for (const cell of context.cells) {
    if (!rectsOverlap(cellInnerRect(cell), rect)) continue;
    for (const candidate of infillFor(cell, context)) {
      if (inside(candidate) && !seen.has(candidate.building.id)) {
        seen.add(candidate.building.id);
        buildings.push(candidate.building);
      }
    }
  }
  return buildings;
}
