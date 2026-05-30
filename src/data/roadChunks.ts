import type { RoadChunk, RoadNode, RoadSegment } from "../types";

const node = (id: string, x: number, z: number): RoadNode => ({ id, x, z });
const segment = (
  id: string,
  from: string,
  to: string,
  district: string,
  kind: RoadSegment["kind"] = "arterial",
  width = kind === "alley" ? 8 : kind === "street" ? 12 : 18,
): RoadSegment => ({ id, from, to, width, district, kind });

export const roadChunks: RoadChunk[] = [
  {
    id: "phra-nakhon",
    district: "Phra Nakhon",
    bounds: { minX: -860, maxX: -340, minZ: -380, maxZ: 120 },
    nodes: [node("pn0", -780, -180), node("pn1", -580, -180), node("pn2", -380, -180), node("pn3", -580, 60), node("pn4", -780, 60)],
    segments: [
      segment("pn-r0", "pn0", "pn1", "Phra Nakhon"),
      segment("pn-r1", "pn1", "pn2", "Phra Nakhon"),
      segment("pn-r2", "pn1", "pn3", "Phra Nakhon", "street"),
      segment("pn-r3", "pn3", "pn4", "Phra Nakhon", "street"),
      segment("pn-r4", "pn4", "pn0", "Phra Nakhon", "alley"),
    ],
    landmarks: [{ id: "grand-palace-lm", name: "Grand Palace", x: -670, z: -50, kind: "temple" }],
  },
  {
    id: "yaowarat",
    district: "Samphanthawong",
    bounds: { minX: -360, maxX: 80, minZ: -380, maxZ: 120 },
    nodes: [node("yw0", -340, -180), node("yw1", -140, -180), node("yw2", 60, -180), node("yw3", -140, 70), node("yw4", 40, 60)],
    segments: [
      segment("yw-r0", "yw0", "yw1", "Samphanthawong"),
      segment("yw-r1", "yw1", "yw2", "Samphanthawong"),
      segment("yw-r2", "yw1", "yw3", "Samphanthawong", "street"),
      segment("yw-r3", "yw3", "yw4", "Samphanthawong", "alley"),
    ],
    landmarks: [{ id: "yaowarat-lm", name: "Yaowarat Road", x: -150, z: -80, kind: "market" }],
  },
  {
    id: "siam",
    district: "Pathum Wan",
    bounds: { minX: 80, maxX: 520, minZ: -380, maxZ: 120 },
    nodes: [node("sm0", 100, -180), node("sm1", 200, -180), node("sm2", 500, -180), node("sm3", 200, 70), node("sm4", 100, 70)],
    segments: [
      segment("sm-r0", "sm0", "sm1", "Pathum Wan"),
      segment("sm-r1", "sm1", "sm2", "Pathum Wan"),
      segment("sm-r2", "sm1", "sm3", "Pathum Wan"),
      segment("sm-r3", "sm3", "sm4", "Pathum Wan", "street"),
    ],
    landmarks: [{ id: "siam-lm", name: "Siam Center", x: 300, z: -80, kind: "mall" }],
  },
  {
    id: "sathorn",
    district: "Sathorn / Silom",
    bounds: { minX: 80, maxX: 720, minZ: -700, maxZ: -380 },
    nodes: [node("st0", 100, -500), node("st1", 300, -500), node("st2", 620, -500), node("st3", 300, -660), node("st4", 620, -660)],
    segments: [
      segment("st-r0", "st0", "st1", "Sathorn / Silom"),
      segment("st-r1", "st1", "st2", "Sathorn / Silom"),
      segment("st-r2", "st1", "st3", "Sathorn / Silom", "street"),
      segment("st-r3", "st3", "st4", "Sathorn / Silom", "street"),
    ],
    landmarks: [{ id: "lumphini-lm", name: "Lumphini Park", x: 430, z: -564, kind: "park" }],
  },
  {
    id: "ari-chatuchak",
    district: "Ari / Chatuchak",
    bounds: { minX: -240, maxX: 760, minZ: 120, maxZ: 720 },
    nodes: [node("ac0", -160, 200), node("ac1", 160, 200), node("ac2", 520, 200), node("ac3", 160, 540), node("ac4", 520, 540)],
    segments: [
      segment("ac-r0", "ac0", "ac1", "Ari"),
      segment("ac-r1", "ac1", "ac2", "Chatuchak"),
      segment("ac-r2", "ac1", "ac3", "Ari", "street"),
      segment("ac-r3", "ac3", "ac4", "Chatuchak"),
      segment("ac-r4", "ac2", "ac4", "Chatuchak"),
    ],
    landmarks: [{ id: "chatuchak-lm", name: "Chatuchak Market", x: 500, z: 460, kind: "market" }],
  },
  {
    id: "thonburi",
    district: "Thonburi / Khlong San",
    bounds: { minX: -780, maxX: -240, minZ: -700, maxZ: -380 },
    nodes: [node("tb0", -720, -500), node("tb1", -500, -500), node("tb2", -270, -500), node("tb3", -500, -670)],
    segments: [
      segment("tb-r0", "tb0", "tb1", "Khlong San", "bridge"),
      segment("tb-r1", "tb1", "tb2", "Khlong San", "street"),
      segment("tb-r2", "tb1", "tb3", "Khlong San", "street"),
    ],
    landmarks: [{ id: "iconsiam-lm", name: "ICONSIAM", x: -500, z: -572, kind: "riverfront" }],
  },
];

export function findChunkIdAt(x: number, z: number): string {
  return roadChunks.find((chunk) => x >= chunk.bounds.minX && x <= chunk.bounds.maxX && z >= chunk.bounds.minZ && z <= chunk.bounds.maxZ)?.id ?? "central";
}

export function visibleChunksNear(x: number, z: number, padding = 80): RoadChunk[] {
  return roadChunks.filter(
    (chunk) =>
      x >= chunk.bounds.minX - padding &&
      x <= chunk.bounds.maxX + padding &&
      z >= chunk.bounds.minZ - padding &&
      z <= chunk.bounds.maxZ + padding,
  );
}
