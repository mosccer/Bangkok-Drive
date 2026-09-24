import * as THREE from "three";
import type { VisualMood } from "../../types";

export interface MoodPreset {
  skyTop: string;
  skyHorizon: string;
  skyBottom: string;
  sunColor: string;
  sunIntensity: number;
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  exposure: number;
  environmentIntensity: number;
  windowGlow: number;
  lampGlow: number;
  headlights: number;
  stars: boolean;
  bloomStrength: number;
  fogNearFactor: number;
}

export const moodPresets: Record<VisualMood, MoodPreset> = {
  day_festival: {
    skyTop: "#2f7fd6",
    skyHorizon: "#cde9f7",
    skyBottom: "#9fb7a6",
    sunColor: "#fff1d6",
    sunIntensity: 2.7,
    sunElevationDeg: 58,
    sunAzimuthDeg: 135,
    hemiSky: "#d7ecff",
    hemiGround: "#5d6b4c",
    hemiIntensity: 1.05,
    exposure: 1,
    environmentIntensity: 0.7,
    windowGlow: 0,
    lampGlow: 0.05,
    headlights: 0,
    stars: false,
    bloomStrength: 0.1,
    fogNearFactor: 0.35,
  },
  boost_arcade: {
    skyTop: "#3b5ea8",
    skyHorizon: "#ffb07a",
    skyBottom: "#8a6d63",
    sunColor: "#ffae5e",
    sunIntensity: 2.5,
    sunElevationDeg: 11,
    sunAzimuthDeg: 250,
    hemiSky: "#ffd2a1",
    hemiGround: "#4a3a3a",
    hemiIntensity: 0.85,
    exposure: 1.05,
    environmentIntensity: 0.6,
    windowGlow: 0.35,
    lampGlow: 0.9,
    headlights: 0.4,
    stars: false,
    bloomStrength: 0.22,
    fogNearFactor: 0.28,
  },
  neon_night: {
    skyTop: "#04060f",
    skyHorizon: "#1b2547",
    skyBottom: "#0b0e18",
    sunColor: "#a9c0ff",
    sunIntensity: 0.45,
    sunElevationDeg: 42,
    sunAzimuthDeg: 60,
    hemiSky: "#2a3a66",
    hemiGround: "#07090f",
    hemiIntensity: 0.32,
    exposure: 0.95,
    environmentIntensity: 0.1,
    windowGlow: 1.1,
    lampGlow: 3,
    headlights: 1,
    stars: true,
    bloomStrength: 0.5,
    fogNearFactor: 0.18,
  },
};

const skyVertexShader = `
  varying vec3 vWorldDirection;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    gl_Position.z = gl_Position.w;
  }
`;

const skyFragmentShader = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform float sunSize;
  varying vec3 vWorldDirection;
  void main() {
    vec3 dir = normalize(vWorldDirection);
    float h = dir.y;
    vec3 color = h > 0.0
      ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.4));
    float sunAmount = max(dot(dir, normalize(sunDirection)), 0.0);
    color += sunColor * pow(sunAmount, 900.0 / sunSize) * 1.6;
    color += sunColor * pow(sunAmount, 12.0) * 0.28;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkyEnvironment {
  readonly hemi = new THREE.HemisphereLight("#d7ecff", "#5d6b4c", 1);
  readonly sun = new THREE.DirectionalLight("#fff1d6", 2.7);
  readonly headlight = new THREE.SpotLight("#fff4d6", 0, 90, Math.PI / 5, 0.45, 1.2);
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly stars: THREE.Points;
  private readonly sunDirection = new THREE.Vector3();
  private preset: MoodPreset = moodPresets.day_festival;
  private shadowExtent = 90;

  constructor(private readonly scene: THREE.Scene) {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color() },
          horizonColor: { value: new THREE.Color() },
          bottomColor: { value: new THREE.Color() },
          sunColor: { value: new THREE.Color() },
          sunDirection: { value: new THREE.Vector3(0, 1, 0) },
          sunSize: { value: 1 },
        },
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.scale.setScalar(1500);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    const starPositions: number[] = [];
    for (let i = 0; i < 900; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.95);
      starPositions.push(Math.sin(phi) * Math.cos(theta) * 1400, Math.cos(phi) * 1400, Math.sin(phi) * Math.sin(theta) * 1400);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: "#e0e7ff", size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    scene.add(this.stars);

    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.headlight.castShadow = false;
    scene.add(this.headlight, this.headlight.target);
  }

  setShadowQuality(mapSize: number, extent: number): void {
    this.shadowExtent = extent;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    const camera = this.sun.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = 10;
    camera.far = 900;
    camera.updateProjectionMatrix();
  }

  applyMood(mood: VisualMood, drawDistance: number): MoodPreset {
    const preset = moodPresets[mood];
    this.preset = preset;
    const uniforms = this.sky.material.uniforms;
    uniforms.topColor.value.set(preset.skyTop);
    uniforms.horizonColor.value.set(preset.skyHorizon);
    uniforms.bottomColor.value.set(preset.skyBottom);
    uniforms.sunColor.value.set(preset.stars ? "#dbe4ff" : preset.sunColor);
    uniforms.sunSize.value = preset.stars ? 0.6 : 1.4;
    const elevation = THREE.MathUtils.degToRad(preset.sunElevationDeg);
    const azimuth = THREE.MathUtils.degToRad(preset.sunAzimuthDeg);
    this.sunDirection.set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth)).normalize();
    uniforms.sunDirection.value.copy(this.sunDirection);
    this.sun.color.set(preset.sunColor);
    this.sun.intensity = preset.sunIntensity;
    this.hemi.color.set(preset.hemiSky);
    this.hemi.groundColor.set(preset.hemiGround);
    this.hemi.intensity = preset.hemiIntensity;
    this.stars.visible = preset.stars;
    this.headlight.intensity = preset.headlights * 180;
    this.scene.fog = new THREE.Fog(preset.skyHorizon, drawDistance * preset.fogNearFactor, drawDistance);
    this.scene.environmentIntensity = preset.environmentIntensity;
    return preset;
  }

  get currentPreset(): MoodPreset {
    return this.preset;
  }

  follow(camera: THREE.Camera, target: THREE.Vector3, yaw: number): void {
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    // Snap the shadow frustum to texel-sized steps so shadows don't shimmer while driving.
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const snapped = new THREE.Vector3(Math.round(target.x / texel) * texel, 0, Math.round(target.z / texel) * texel);
    this.sun.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(this.sunDirection, 450);
    this.sun.target.updateMatrixWorld();
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    this.headlight.position.set(target.x + forwardX * 1.8, 1.3, target.z + forwardZ * 1.8);
    this.headlight.target.position.set(target.x + forwardX * 30, 0, target.z + forwardZ * 30);
    this.headlight.target.updateMatrixWorld();
  }
}
