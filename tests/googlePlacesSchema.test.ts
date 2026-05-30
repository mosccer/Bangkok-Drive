import { describe, expect, it } from "vitest";
import { buildBangkokImportGrid, GOOGLE_NEARBY_PLACE_TYPES, GOOGLE_TEXT_PLACE_TYPES } from "../src/services/googlePlacesSchema";

describe("Google Places import schema", () => {
  it("builds a conservative 50-district import frame", () => {
    const grid = buildBangkokImportGrid();
    expect(grid).toHaveLength(50 * (GOOGLE_NEARBY_PLACE_TYPES.length + GOOGLE_TEXT_PLACE_TYPES.length));
    expect(grid.some((cell) => cell.districtId === "phra-nakhon" && cell.type === "restaurant")).toBe(true);
    expect(grid.some((cell) => cell.districtId === "phra-nakhon" && cell.type === "street_food" && cell.query)).toBe(true);
  });
});
