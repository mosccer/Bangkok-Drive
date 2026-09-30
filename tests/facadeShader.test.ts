import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { patchFacadeFragmentShader, patchFacadeVertexShader } from "../src/render/materials/proceduralMaterials";

describe("facade shader", () => {
  it("routes every facade texture lookup through the atlas", () => {
    const fragment = patchFacadeFragmentShader(THREE.ShaderLib.standard.fragmentShader, 256);
    for (const lookup of ["facadeSample( map, vMapUv )", "facadeSample( emissiveMap, vEmissiveMapUv )", "facadeSample( normalMap, vNormalMapUv )", "facadeSample( roughnessMap, vRoughnessMapUv )", "facadeSample( metalnessMap, vMetalnessMapUv )"]) {
      expect(fragment).toContain(lookup);
    }
    expect(fragment).not.toMatch(/texture2D\( (map|emissiveMap|normalMap|roughnessMap|metalnessMap),/);
    expect(fragment).toContain("vec4 facadeSample(");
  });

  it("passes the atlas cell from the vertex shader", () => {
    const vertex = patchFacadeVertexShader(THREE.ShaderLib.standard.vertexShader);
    expect(vertex).toContain("attribute float facadeCell;");
    expect(vertex).toContain("vFacadeCell = facadeCell;");
  });
});
