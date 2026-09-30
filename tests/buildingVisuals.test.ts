import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { latLngToWorld } from "../src/data/coordinates";
import { cityTileAt, generateCityTile } from "../src/data/proceduralCity";
import { getRenderQualityProfile } from "../src/render/quality";
import { buildTileGroup, tileGroupSteps, type WorldMaterials } from "../src/render/world/tileBuilder";

function materials(): WorldMaterials {
  const named = (name: string) => {
    const material = new THREE.MeshBasicMaterial();
    material.name = name;
    return material;
  };
  const wires = new THREE.LineBasicMaterial();
  wires.name = "wires";
  return {
    asphalt: named("asphalt"),
    bridge: named("bridge"),
    sidewalk: named("sidewalk"),
    markings: named("markings"),
    walls: named("walls"),
    roofs: named("roofs"),
    signs: named("signs"),
    props: named("props"),
    gold: named("gold"),
    concrete: named("concrete"),
    wires,
    treeTrunk: named("treeTrunk"),
    treeLeaves: named("treeLeaves"),
    lampPole: named("lampPole"),
    lampHead: named("lampHead"),
  };
}

const tile = generateCityTile(cityTileAt(latLngToWorld(13.74, 100.5085)))!;

describe("building visuals", () => {
  it("mixes several facade styles in one tile", () => {
    const group = buildTileGroup(tile, { materials: materials(), quality: getRenderQualityProfile("medium", false) });
    const walls = group.children.find((child) => child instanceof THREE.Mesh && (child.material as THREE.Material).name === "walls") as THREE.Mesh;
    const cells = new Set(Array.from(walls.geometry.getAttribute("facadeCell").array as Float32Array));
    expect(cells.size).toBeGreaterThanOrEqual(4);
    expect(walls.userData.pickable).toBe("building");
  });

  it("strings power lines between concrete poles on medium quality, none on low", () => {
    const medium = buildTileGroup(tile, { materials: materials(), quality: getRenderQualityProfile("medium", false) });
    const wires = medium.children.find((child) => child instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
    expect(wires?.geometry.getAttribute("position").count).toBeGreaterThan(50);
    expect(medium.children.some((child) => child instanceof THREE.InstancedMesh && (child.material as THREE.Material).name === "concrete")).toBe(true);
    const low = buildTileGroup(tile, { materials: materials(), quality: getRenderQualityProfile("low", false) });
    expect(low.children.some((child) => child instanceof THREE.LineSegments)).toBe(false);
  });

  it("builds a tile in several small resumable steps", () => {
    const steps = tileGroupSteps(tile, { materials: materials(), quality: getRenderQualityProfile("medium", false) });
    let count = 0;
    let result = steps.next();
    while (!result.done) {
      count += 1;
      result = steps.next();
    }
    expect(count).toBeGreaterThan(2);
    expect(result.value.children.length).toBeGreaterThan(5);
  });
});
