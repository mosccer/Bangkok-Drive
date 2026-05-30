export type PlaceCategory =
  | "tourist_attraction"
  | "restaurant"
  | "cafe"
  | "museum"
  | "temple"
  | "shopping_mall"
  | "park";

export interface PlaceSummary {
  id: string;
  googlePlaceId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  district: string;
  rating?: number;
  userRatingCount?: number;
  tags: string[];
}

export interface PlaceDetail extends PlaceSummary {
  openingHours?: string[];
  photos?: string[];
  websiteUri?: string;
  googleMapsUri?: string;
  description?: string;
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

export interface RenderQualityProfile {
  quality: GraphicsQuality;
  pixelRatioCap: number;
  shadowMapSize: number;
  toneMappingExposure: number;
  drawDistance: number;
  usePostEffects: boolean;
  useHighDetailMaterials: boolean;
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
  };
  activeVehicleId: string;
  unlockedVehicles: string[];
  discoveredPlaceIds: string[];
  completedMissionIds: string[];
  settings: {
    graphicsQuality: GraphicsQuality;
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
  kind: "arterial" | "street" | "bridge" | "alley";
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
