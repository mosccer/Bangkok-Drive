import { describe, expect, it } from "vitest";
import { bearingDegrees, cardinalFor, escapeHtml, headingDegrees, relativeBearing } from "../src/ui/format";

describe("compass helpers", () => {
  it("maps yaw to compass headings with north at -z", () => {
    expect(headingDegrees(0)).toBeCloseTo(180);
    expect(headingDegrees(Math.PI / 2)).toBeCloseTo(90);
    expect(headingDegrees(Math.PI)).toBeCloseTo(0);
    expect(headingDegrees(-Math.PI / 2)).toBeCloseTo(270);
  });

  it("computes waypoint bearings from world offsets", () => {
    expect(bearingDegrees(100, 0)).toBeCloseTo(90);
    expect(bearingDegrees(0, -100)).toBeCloseTo(0);
    expect(bearingDegrees(0, 100)).toBeCloseTo(180);
    expect(bearingDegrees(-100, 0)).toBeCloseTo(270);
  });

  it("puts targets clockwise from the heading on the right", () => {
    expect(relativeBearing(90, 0)).toBe(90);
    expect(relativeBearing(350, 10)).toBe(-20);
    expect(relativeBearing(10, 350)).toBe(20);
  });

  it("labels cardinal directions", () => {
    expect(cardinalFor(0)).toBe("N");
    expect(cardinalFor(22)).toBe("N");
    expect(cardinalFor(23)).toBe("NE");
    expect(cardinalFor(180)).toBe("S");
    expect(cardinalFor(337)).toBe("NW");
    expect(cardinalFor(338)).toBe("N");
  });

  it("escapes place names before they reach innerHTML", () => {
    expect(escapeHtml(`<img src=x onerror="alert(1)">`)).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
