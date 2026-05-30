import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GhostPlayerState, LeaderboardRun, PlayerProfile, SaveGame } from "../types";

export interface OnlineService {
  isConfigured(): boolean;
  ensureProfile(): Promise<PlayerProfile>;
  loadCloudSave(profileId: string): Promise<Partial<SaveGame> | undefined>;
  saveCloud(profileId: string, save: SaveGame): Promise<void>;
  submitLeaderboardRun(run: LeaderboardRun): Promise<void>;
  listLeaderboard(missionId: string): Promise<LeaderboardRun[]>;
  joinGhostChannel(chunkId: string, onGhosts: (states: GhostPlayerState[]) => void): Promise<void>;
  trackGhost(state: GhostPlayerState): Promise<void>;
}

const localProfile: PlayerProfile = {
  id: "local-guest",
  displayName: "Guest Driver",
  isGuest: true,
  createdAt: new Date(0).toISOString(),
};

export class OfflineOnlineService implements OnlineService {
  isConfigured(): boolean {
    return false;
  }

  async ensureProfile(): Promise<PlayerProfile> {
    return localProfile;
  }

  async loadCloudSave(): Promise<Partial<SaveGame> | undefined> {
    return undefined;
  }

  async saveCloud(): Promise<void> {
    return;
  }

  async submitLeaderboardRun(): Promise<void> {
    return;
  }

  async listLeaderboard(): Promise<LeaderboardRun[]> {
    return [];
  }

  async joinGhostChannel(): Promise<void> {
    return;
  }

  async trackGhost(): Promise<void> {
    return;
  }
}

export class SupabaseOnlineService implements OnlineService {
  private client?: SupabaseClient;
  private channel?: ReturnType<SupabaseClient["channel"]>;
  private profile?: PlayerProfile;

  constructor(
    url = import.meta.env.VITE_SUPABASE_URL,
    publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ) {
    if (url && publishableKey) {
      this.client = createClient(url, publishableKey);
    }
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  async ensureProfile(): Promise<PlayerProfile> {
    if (!this.client) return localProfile;
    const session = await this.client.auth.getSession();
    const userResult = session.data.session?.user ?? (await this.client.auth.signInAnonymously()).data.user;
    if (!userResult) return localProfile;

    const profile: PlayerProfile = {
      id: userResult.id,
      displayName: `Guest ${userResult.id.slice(0, 4)}`,
      isGuest: userResult.is_anonymous ?? true,
      createdAt: userResult.created_at,
    };
    this.profile = profile;

    await this.client.from("profiles").upsert({
      id: profile.id,
      display_name: profile.displayName,
      is_guest: profile.isGuest,
      created_at: profile.createdAt,
    });

    return profile;
  }

  async loadCloudSave(profileId: string): Promise<Partial<SaveGame> | undefined> {
    if (!this.client) return undefined;
    const { data } = await this.client.from("cloud_saves").select("*").eq("profile_id", profileId).maybeSingle();
    if (!data) return undefined;
    return {
      activeVehicleId: data.active_vehicle_id,
      unlockedVehicles: data.unlocked_vehicle_ids ?? [],
      completedMissionIds: data.completed_mission_ids ?? [],
      discoveredPlaceIds: data.discovered_place_ids ?? [],
      player: {
        xp: data.xp ?? 0,
        badges: data.badges ?? [],
        activeMissionId: data.active_mission_id ?? "royal-island-tour",
        discoveryDailyXpByDistrict: data.discovery_daily_xp_by_district ?? {},
      },
    };
  }

  async saveCloud(profileId: string, save: SaveGame): Promise<void> {
    if (!this.client) return;
    await this.client.from("cloud_saves").upsert({
      profile_id: profileId,
      xp: save.player.xp,
      badges: save.player.badges,
      active_mission_id: save.player.activeMissionId,
      active_vehicle_id: save.activeVehicleId,
      unlocked_vehicle_ids: save.unlockedVehicles,
      completed_mission_ids: save.completedMissionIds,
      discovered_place_ids: save.discoveredPlaceIds,
      discovery_daily_xp_by_district: save.player.discoveryDailyXpByDistrict ?? {},
      updated_at: new Date().toISOString(),
    });
  }

  async submitLeaderboardRun(run: LeaderboardRun): Promise<void> {
    if (!this.client) return;
    await this.client.from("leaderboard_runs").insert({
      mission_id: run.missionId,
      profile_id: run.profileId,
      vehicle_id: run.vehicleId,
      time_ms: run.timeMs,
      created_at: run.createdAt,
    });
  }

  async listLeaderboard(missionId: string): Promise<LeaderboardRun[]> {
    if (!this.client) return [];
    const { data } = await this.client
      .from("leaderboard_runs")
      .select("mission_id, profile_id, vehicle_id, time_ms, created_at")
      .eq("mission_id", missionId)
      .order("time_ms", { ascending: true })
      .limit(20);
    return (data ?? []).map((row) => ({
      missionId: row.mission_id,
      profileId: row.profile_id,
      vehicleId: row.vehicle_id,
      timeMs: row.time_ms,
      createdAt: row.created_at,
    }));
  }

  async joinGhostChannel(chunkId: string, onGhosts: (states: GhostPlayerState[]) => void): Promise<void> {
    if (!this.client) return;
    if (this.channel) {
      await this.client.removeChannel(this.channel);
    }

    this.channel = this.client.channel(`ghosts:${chunkId}`, { config: { presence: { key: this.profile?.id ?? "guest" } } });
    this.channel.on("presence", { event: "sync" }, () => {
      const state = this.channel?.presenceState<GhostPlayerState>() ?? {};
      const ghosts = Object.values(state)
        .flat()
        .filter((ghost) => ghost.profileId !== this.profile?.id);
      onGhosts(ghosts);
    });
    await this.channel.subscribe();
  }

  async trackGhost(state: GhostPlayerState): Promise<void> {
    await this.channel?.track(state);
  }
}

export function createOnlineService(): OnlineService {
  const service = new SupabaseOnlineService();
  return service.isConfigured() ? service : new OfflineOnlineService();
}
