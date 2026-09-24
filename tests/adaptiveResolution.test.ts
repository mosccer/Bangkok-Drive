import { describe, expect, it } from "vitest";
import { AdaptiveResolution } from "../src/render/adaptiveResolution";

const run = (controller: AdaptiveResolution, frameMs: number, seconds: number) => {
  const changes: number[] = [];
  for (let t = 0; t < seconds * 1000; t += frameMs) {
    const change = controller.update(frameMs);
    if (change !== undefined) changes.push(change);
  }
  return changes;
};

describe("adaptive resolution", () => {
  it("lowers the render scale when frames are slow, down to the floor", () => {
    const controller = new AdaptiveResolution();
    run(controller, 40, 30);
    expect(controller.scale).toBe(0.6);
  });

  it("recovers when frames are fast again and ignores hitches", () => {
    const controller = new AdaptiveResolution();
    run(controller, 40, 5);
    const low = controller.scale;
    expect(low).toBeLessThan(1);
    expect(controller.update(5_000)).toBeUndefined();
    run(controller, 8, 30);
    expect(controller.scale).toBe(1);
  });

  it("stays put at a steady 60 fps", () => {
    const controller = new AdaptiveResolution();
    expect(run(controller, 16.7, 10)).toEqual([]);
  });
});
