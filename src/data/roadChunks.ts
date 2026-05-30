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
    bounds: { minX: -430, maxX: -170, minZ: -190, maxZ: 60 },
    nodes: [node("pn0", -390, -90), node("pn1", -290, -90), node("pn2", -190, -90), node("pn3", -290, 30), node("pn4", -390, 30)],
    segments: [
      segment("pn-r0", "pn0", "pn1", "Phra Nakhon"),
      segment("pn-r1", "pn1", "pn2", "Phra Nakhon"),
      segment("pn-r2", "pn1", "pn3", "Phra Nakhon", "street"),
      segment("pn-r3", "pn3", "pn4", "Phra Nakhon", "street"),
      segment("pn-r4", "pn4", "pn0", "Phra Nakhon", "alley"),
    ],
    landmarks: [{ id: "grand-palace-lm", name: "Grand Palace", x: -335, z: -25, kind: "temple" }],
  },
  {
    id: "yaowarat",
    district: "Samphanthawong",
    bounds: { minX: -180, maxX: 40, minZ: -190, maxZ: 60 },
    nodes: [node("yw0", -170, -90), node("yw1", -70, -90), node("yw2", 30, -90), node("yw3", -70, 35), node("yw4", 20, 30)],
    segments: [
      segment("yw-r0", "yw0", "yw1", "Samphanthawong"),
      segment("yw-r1", "yw1", "yw2", "Samphanthawong"),
      segment("yw-r2", "yw1", "yw3", "Samphanthawong", "street"),
      segment("yw-r3", "yw3", "yw4", "Samphanthawong", "alley"),
    ],
    landmarks: [{ id: "yaowarat-lm", name: "Yaowarat Road", x: -75, z: -40, kind: "market" }],
  },
  {
    id: "siam",
    district: "Pathum Wan",
    bounds: { minX: 40, maxX: 260, minZ: -190, maxZ: 60 },
    nodes: [node("sm0", 50, -90), node("sm1", 150, -90), node("sm2", 250, -90), node("sm3", 150, 35), node("sm4", 50, 35)],
    segments: [
      segment("sm-r0", "sm0", "sm1", "Pathum Wan"),
      segment("sm-r1", "sm1", "sm2", "Pathum Wan"),
      segment("sm-r2", "sm1", "sm3", "Pathum Wan"),
      segment("sm-r3", "sm3", "sm4", "Pathum Wan", "street"),
    ],
    landmarks: [{ id: "siam-lm", name: "Siam Center", x: 150, z: -40, kind: "mall" }],
  },
  {
    id: "sathorn",
    district: "Sathorn / Silom",
    bounds: { minX: 40, maxX: 360, minZ: -350, maxZ: -190 },
    nodes: [node("st0", 50, -250), node("st1", 150, -250), node("st2", 310, -250), node("st3", 150, -330), node("st4", 310, -330)],
    segments: [
      segment("st-r0", "st0", "st1", "Sathorn / Silom"),
      segment("st-r1", "st1", "st2", "Sathorn / Silom"),
      segment("st-r2", "st1", "st3", "Sathorn / Silom", "street"),
      segment("st-r3", "st3", "st4", "Sathorn / Silom", "street"),
    ],
    landmarks: [{ id: "lumphini-lm", name: "Lumphini Park", x: 215, z: -282, kind: "park" }],
  },
  {
    id: "ari-chatuchak",
    district: "Ari / Chatuchak",
    bounds: { minX: -120, maxX: 380, minZ: 60, maxZ: 360 },
    nodes: [node("ac0", -80, 100), node("ac1", 80, 100), node("ac2", 260, 100), node("ac3", 80, 270), node("ac4", 260, 270)],
    segments: [
      segment("ac-r0", "ac0", "ac1", "Ari"),
      segment("ac-r1", "ac1", "ac2", "Chatuchak"),
      segment("ac-r2", "ac1", "ac3", "Ari", "street"),
      segment("ac-r3", "ac3", "ac4", "Chatuchak"),
      segment("ac-r4", "ac2", "ac4", "Chatuchak"),
    ],
    landmarks: [{ id: "chatuchak-lm", name: "Chatuchak Market", x: 250, z: 230, kind: "market" }],
  },
  {
    id: "thonburi",
    district: "Thonburi / Khlong San",
    bounds: { minX: -390, maxX: -120, minZ: -350, maxZ: -190 },
    nodes: [node("tb0", -360, -250), node("tb1", -250, -250), node("tb2", -135, -250), node("tb3", -250, -335)],
    segments: [
      segment("tb-r0", "tb0", "tb1", "Khlong San", "bridge"),
      segment("tb-r1", "tb1", "tb2", "Khlong San", "street"),
      segment("tb-r2", "tb1", "tb3", "Khlong San", "street"),
    ],
    landmarks: [{ id: "iconsiam-lm", name: "ICONSIAM", x: -250, z: -286, kind: "riverfront" }],
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
