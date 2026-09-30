import type { BuildingUse, MapBuilding } from "../types";
import { hashString } from "../simulation/hash";
import { getDistrictById } from "./bangkokDistricts";
import { MAP_SCALE } from "./coordinates";

// Everything the building card shows. Generated city buildings carry rich data; OSM buildings
// often only have a kind and height, so the missing bits are inferred here.

export const buildingUseLabels: Record<BuildingUse, { th: string; en: string; icon: string }> = {
  shophouse: { th: "ตึกแถว", en: "Shophouse", icon: "🏪" },
  townhouse: { th: "ทาวน์เฮาส์", en: "Townhouse", icon: "🏘️" },
  house: { th: "บ้านเดี่ยว", en: "House", icon: "🏠" },
  condo: { th: "คอนโดมิเนียม", en: "Condominium", icon: "🏢" },
  office: { th: "อาคารสำนักงาน", en: "Office tower", icon: "🏙️" },
  hotel: { th: "โรงแรม", en: "Hotel", icon: "🏨" },
  mall: { th: "ศูนย์การค้า", en: "Shopping mall", icon: "🛍️" },
  temple: { th: "วัด", en: "Temple", icon: "🛕" },
  school: { th: "โรงเรียน", en: "School", icon: "🏫" },
  hospital: { th: "โรงพยาบาล", en: "Hospital", icon: "🏥" },
  market: { th: "ตลาด", en: "Market", icon: "🧺" },
  warehouse: { th: "โกดัง", en: "Warehouse", icon: "🏭" },
  government: { th: "หน่วยงานราชการ", en: "Government office", icon: "🏛️" },
  convenience: { th: "ร้านสะดวกซื้อ", en: "Convenience store", icon: "🏬" },
};

const openingHours: Record<BuildingUse, (seed: number) => string> = {
  shophouse: (seed) => `${String(6 + (seed % 4)).padStart(2, "0")}:00–${17 + ((seed >>> 3) % 6)}:00`,
  townhouse: () => "ที่พักอาศัย",
  house: () => "ที่พักอาศัย",
  condo: () => "นิติบุคคล 08:00–20:00",
  office: () => "จ.–ศ. 08:30–17:30",
  hotel: () => "เช็กอิน 14:00 · เช็กเอาต์ 12:00",
  mall: () => "10:00–22:00",
  temple: () => "08:00–17:00",
  school: () => "จ.–ศ. 07:30–16:00",
  hospital: () => "24 ชั่วโมง",
  market: () => "05:00–18:00",
  warehouse: () => "จ.–ส. 08:00–17:00",
  government: () => "จ.–ศ. 08:30–16:30",
  convenience: () => "24 ชั่วโมง",
};

export function inferBuildingUse(building: MapBuilding): BuildingUse {
  if (building.use) return building.use;
  const tall = building.heightMeters >= 30;
  switch (building.kind) {
    case "temple":
      return "temple";
    case "commercial":
      return tall ? "office" : "shophouse";
    case "residential":
      return tall ? "condo" : building.heightMeters > 9 ? "townhouse" : "house";
    case "civic":
      return "government";
    case "industrial":
      return "warehouse";
    default:
      return tall ? "condo" : "shophouse";
  }
}

export interface BuildingInfo {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  useLabel: string;
  facts: Array<{ label: string; value: string }>;
  tenants: string[];
  landmark: boolean;
}

function footprintArea(building: MapBuilding): number {
  const points = building.footprint;
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return Math.abs(area / 2) / (MAP_SCALE * MAP_SCALE);
}

export function describeBuilding(building: MapBuilding, currentYear = new Date().getFullYear()): BuildingInfo {
  const use = inferBuildingUse(building);
  const label = buildingUseLabels[use];
  const seed = hashString(building.id);
  const floors = building.floors ?? Math.max(1, Math.round(building.heightMeters / 3.3));
  const district = building.districtId ? getDistrictById(building.districtId) : undefined;
  const title = building.name ?? `${label.th} ${floors} ชั้น`;
  const subtitle = [building.nameEn, label.en].filter((part, index, parts) => part && parts.indexOf(part) === index).join(" · ");
  const area = footprintArea(building);
  const facts: BuildingInfo["facts"] = [
    { label: "ประเภท", value: `${label.icon} ${label.th}` },
    { label: "จำนวนชั้น", value: `${floors} ชั้น` },
    { label: "ความสูง", value: `${Math.round(building.heightMeters)} ม.` },
    { label: "พื้นที่ใช้สอย", value: `~${Math.round((area * floors) / 10) * 10} ตร.ม.` },
  ];
  if (building.yearBuilt) facts.push({ label: "ปีที่สร้าง", value: `พ.ศ. ${building.yearBuilt + 543} (${Math.max(0, currentYear - building.yearBuilt)} ปี)` });
  facts.push({ label: "เวลาทำการ", value: openingHours[use](seed) });
  if (building.address) facts.push({ label: "ที่อยู่", value: building.address });
  else if (district) facts.push({ label: "เขต", value: district.nameTh });
  return {
    id: building.id,
    title,
    subtitle,
    icon: label.icon,
    useLabel: label.th,
    facts,
    tenants: building.tenants ?? [],
    landmark: Boolean(building.landmark),
  };
}
