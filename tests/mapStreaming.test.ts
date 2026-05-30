import { describe, expect, it } from "vitest";
import { createWorldAnchor, latLngToWorld } from "../src/data/coordinates";
import { fallbackRoadTiles } from "../src/data/roadTileFixtures";
import { MapStreamingService } from "../src/services/MapStreamingService";

describe("1:1 map streaming", () => {
  it("loads the active central tile around the vehicle", async () => {
    const service = new MapStreamingService(undefined, { desktopTileRadius: 1, mobileTileRadius: 1 });
    const anchor = createWorldAnchor({ lat: 13.7515, lng: 100.4929 });
    const vehicleWorld = latLngToWorld(13.7515, 100.4929);
    const state = await service.update(anchor, vehicleWorld, false);

    expect(state.scaleMode).toBe("real_1_1");
    expect(state.visibleTileIds).toContain("real-phra-nakhon-00");
    expect(state.loadedTiles.some((tile) => tile.segments.length > 0)).toBe(true);
  });

  it("keeps the current tile and unloads distant fallback tiles", async () => {
    const service = new MapStreamingService(undefined, { desktopTileRadius: 1, mobileTileRadius: 1 });
    const target = fallbackRoadTiles.find((tile) => tile.id === "real-siam-00");
    expect(target).toBeTruthy();
    const anchor = createWorldAnchor({ lat: 13.7466, lng: 100.5347 });
    const state = await service.update(anchor, target!.originMeters, true);

    expect(state.activeTileId).toBe("real-siam-00");
    expect(state.visibleTileIds).toContain("real-siam-00");
    expect(state.visibleTileIds).not.toContain("real-ari-chatuchak-00");
  });
});
