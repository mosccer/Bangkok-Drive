import { describe, expect, it } from "vitest";
import { createWorldAnchor, latLngToWorld } from "../src/data/coordinates";
import { cityTileAt } from "../src/data/proceduralCity";
import { MapStreamingService } from "../src/services/MapStreamingService";

describe("1:1 map streaming", () => {
  it("loads the active central tile around the vehicle", async () => {
    const service = new MapStreamingService(undefined, { desktopTileRadius: 1, mobileTileRadius: 1 });
    const anchor = createWorldAnchor({ lat: 13.7515, lng: 100.4929 });
    const vehicleWorld = latLngToWorld(13.7515, 100.4929);
    const state = await service.update(anchor, vehicleWorld, false);

    expect(state.scaleMode).toBe("real_1_1");
    expect(state.visibleTileIds).toContain(cityTileAt(vehicleWorld));
    expect(state.loadedTiles.some((tile) => tile.segments.length > 0)).toBe(true);
    expect(state.loadedTiles.some((tile) => (tile.buildings?.length ?? 0) > 50)).toBe(true);
  });

  it("keeps the current tile and leaves distant districts unloaded", async () => {
    const service = new MapStreamingService(undefined, { desktopTileRadius: 1, mobileTileRadius: 1 });
    const siam = latLngToWorld(13.7466, 100.5347);
    const anchor = createWorldAnchor({ lat: 13.7466, lng: 100.5347 });
    const state = await service.update(anchor, siam, true);

    expect(state.activeTileId).toBe(cityTileAt(siam));
    expect(state.visibleTileIds).toContain(cityTileAt(siam));
    expect(state.visibleTileIds).not.toContain(cityTileAt(latLngToWorld(13.7998, 100.55)));
    expect(state.visibleTileIds.length).toBeLessThanOrEqual(9);
  });
});
