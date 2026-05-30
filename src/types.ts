export type PlaceSource = "curated" | "google" | "osm";

export type PlaceCategory =
  | "tourist_attraction"
  | "temple"
  | "museum"
  | "park"
  | "shopping_mall"
  | "market"
  | "night_market"
  | "restaurant"
  | "street_food"
  | "cafe"
  | "bakery"
  | "dessert";

export interface PlaceSummary {
  id: string;
  source: PlaceSource;
  googlePlaceId?: string;
  name: string;
  nameTh: string;
  nameEn?: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  district: string;
  districtId: string;
  districtName: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  googleMapsUri?: string;
  curatedPriority?: number;
  attributionRequired: boolean;
  updatedAt: string;
  tags: string[];
}

export interface PlaceDetail extends PlaceSummary {
  addressTh?: string;
  addressEn?: string;
  phone?: string;
  openingHours?: string[];
  photos?: string[];
  websiteUri?: string;
  googleMapsUri?: string;
  description?: string;
  descriptionTh?: string;
  descriptionEn?: string;
  sourceAttributions: Array<{
    provider: string;
    providerUri?: string;
  }>;
}

export interface PlaceQuery {
  districtId?: string;
  category?: PlaceCategory;
  nearLat?: number;
  nearLng?: number;
  radius?: number;
  limit?: number;
  cursor?: string;
  lang?: "th" | "en";
  tag?: string;
}

export interface PlaceListResponse {
  places: PlaceSummary[];
  nextCursor?: string;
  total: number;
  source: "supabase" | "static" | "mixed";
  attribution: string[];
}

export type MapScaleMode = "condensed" | "real_1_1";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface WorldMeters {
  x: number;
  z: number;
}

export interface WorldAnchor {
  geo: GeoPoint;
  worldMeters: WorldMeters;
  version: number;
}

export type MissionType = "tour_route" | "food_run" | "cafe_trail" | "time_trial" | "discovery";

export interface Mission {
  id: string;
  type: MissionType;
  title: string;
  districts: string[];
  waypoints: string[];
  timeLimit?: number;
  reward: {
    xp: number;
    badge?: string;
    unlockVehicle?: string;
  };
  unlockRequirements: {
    minXp?: number;
    completedMissionIds?: string[];
  };
}

export interface MissionProgress {
  missionId: string;
  activeWaypointIndex: number;
  reachedWaypointIds: string[];
  startedAt: number;
  completedAt?: number;
}

export interface InputActions {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  boost: boolean;
  pause: boolean;
}

export type GraphicsQuality = "low" | "medium" | "high";

export type OrientationMode = "portrait" | "landscape";

export type VisualMood = "day_festival" | "neon_night" | "boost_arcade";

export interface ArcadeVisualSettings {
  visualMood: VisualMood;
  cameraShake: boolean;
  speedEffects: boolean;
  reduceMotion: boolean;
}

export interface RenderQualityProfile {
  quality: GraphicsQuality;
  pixelRatioCap: number;
  shadowMapSize: number;
  toneMappingExposure: number;
  drawDistance: number;
  usePostEffects: boolean;
  useHighDetailMaterials: boolean;
  useSpeedEffects: boolean;
  useBoostTrails: boolean;
  useSkidMarks: boolean;
  useEnhancedMaterials: boolean;
}

export interface VehicleVisualState {
  speedKmh: number;
  speedIntensity: number;
  boostIntensity: number;
  brakeIntensity: number;
  skidIntensity: number;
  wheelSpinDelta: number;
}

export interface SpeedEffectState {
  fov: number;
  shake: number;
  streakOpacity: number;
  boostGlow: number;
}

export interface VehicleState {
  position: { x: number; y: number; z: number };
  rotation: number;
  speed: number;
  gearMode: "drive" | "reverse" | "neutral";
  damage: number;
  traction: number;
  inputActions: InputActions;
}

export type VehicleClass = "compact" | "taxi" | "sport" | "pickup" | "ev";

export interface VehicleStats {
  maxSpeedKmh: number;
  accelerationMps2: number;
  brakeMps2: number;
  grip: number;
  drift: number;
  mass: number;
}

export interface VehicleDefinition {
  id: string;
  brand: string;
  model: string;
  class: VehicleClass;
  stats: VehicleStats;
  unlockRequirement: {
    xp?: number;
    missionId?: string;
  };
  meshKey: string;
  color: string;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  isGuest: boolean;
  createdAt: string;
}

export interface CloudSave {
  profileId: string;
  xp: number;
  badges: string[];
  activeVehicleId: string;
  unlockedVehicleIds: string[];
  completedMissionIds: string[];
  discoveredPlaceIds: string[];
  discoveryDailyXpByDistrict?: Record<string, { date: string; xp: number }>;
}

export interface LeaderboardRun {
  missionId: string;
  profileId: string;
  vehicleId: string;
  timeMs: number;
  createdAt: string;
}

export interface GhostPlayerState {
  profileId: string;
  displayName: string;
  vehicleId: string;
  chunkId: string;
  x: number;
  z: number;
  lat?: number;
  lng?: number;
  tileId?: string;
  originVersion?: number;
  yaw: number;
  speed: number;
  updatedAt: number;
}

export interface SaveGame {
  player: {
    xp: number;
    badges: string[];
    activeMissionId: string;
    missionProgress?: MissionProgress;
    discoveryDailyXpByDistrict?: Record<string, { date: string; xp: number }>;
  };
  activeVehicleId: string;
  unlockedVehicles: string[];
  discoveredPlaceIds: string[];
  completedMissionIds: string[];
  settings: {
    graphicsQuality: GraphicsQuality;
    mapScaleMode: MapScaleMode;
    visualMood: VisualMood;
    cameraShake: boolean;
    speedEffects: boolean;
    reduceMotion: boolean;
    units: "metric";
  };
}

export interface RoadNode {
  id: string;
  x: number;
  z: number;
}

export interface RoadSegment {
  id: string;
  from: string;
  to: string;
  width: number;
  district: string;
  kind: "motorway" | "primary" | "secondary" | "tertiary" | "residential" | "service" | "arterial" | "street" | "bridge" | "alley";
}

export interface Landmark {
  id: string;
  name: string;
  x: number;
  z: number;
  kind: "temple" | "mall" | "park" | "market" | "riverfront" | "station";
}

export interface RoadChunk {
  id: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  nodes: RoadNode[];
  segments: RoadSegment[];
  district: string;
  landmarks: Landmark[];
}

export interface RoadTile {
  id: string;
  boundsLatLng: { south: number; west: number; north: number; east: number };
  boundsMeters: { minX: number; maxX: number; minZ: number; maxZ: number };
  originMeters: WorldMeters;
  nodes: RoadNode[];
  segments: RoadSegment[];
  districtIds: string[];
  loadedAt: number;
}

export interface RoadTileManifestEntry {
  id: string;
  href: string;
  boundsLatLng: RoadTile["boundsLatLng"];
  boundsMeters: RoadTile["boundsMeters"];
  districtIds: string[];
}

export interface RoadTileManifest {
  scaleMode: "real_1_1";
  tileSizeMeters: number;
  generatedAt: string;
  tiles: RoadTileManifestEntry[];
}

export interface StreamingMapState {
  scaleMode: MapScaleMode;
  anchor: WorldAnchor;
  activeTileId?: string;
  visibleTileIds: string[];
  loadedTiles: RoadTile[];
  tileSizeMeters: number;
}

export interface FastTravelPoint {
  id: string;
  label: string;
  target: GeoPoint;
  distanceMeters: number;
}

export interface BangkokWorldData {
  origin: { lat: number; lng: number };
  districts: Array<{
    id: string;
    name: string;
    center: { lat: number; lng: number };
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  }>;
  roadNodes: RoadNode[];
  roadSegments: RoadSegment[];
  places: PlaceSummary[];
}
