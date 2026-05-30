import type { Mission, PlaceSummary } from "../types";

export function createStarterMissions(places: PlaceSummary[]): Mission[] {
  const curated = places.filter((place) => place.source === "curated");
  const missionPlaces = curated.length ? curated : places;
  const byTag = (tag: string) => missionPlaces.filter((place) => place.tags.includes(tag)).map((place) => place.id);
  const byAnyTag = (tags: string[]) => missionPlaces.filter((place) => tags.some((tag) => place.tags.includes(tag))).map((place) => place.id);
  const byAnyCategory = (categories: PlaceSummary["category"][]) => missionPlaces.filter((place) => categories.includes(place.category)).map((place) => place.id);
  const route = (preferred: string[], fallback: string[]) => {
    const unique = Array.from(new Set(preferred.filter((id) => places.some((place) => place.id === id))));
    return unique.length ? unique : fallback.slice(0, 3);
  };

  return [
    {
      id: "royal-island-tour",
      type: "tour_route",
      title: "Royal Island Tour",
      districts: ["Phra Nakhon"],
      waypoints: route(["grand-palace", "wat-phra-kaew", "wat-pho"], byTag("tour")).slice(0, 3),
      reward: { xp: 350, badge: "Explorer of Phra Nakhon" },
      unlockRequirements: {},
    },
    {
      id: "yaowarat-night-run",
      type: "food_run",
      title: "Yaowarat Night Run",
      districts: ["Samphanthawong", "Khlong San"],
      waypoints: route(["yaowarat-food-street", "banthat-thong-food-street", "wang-lang-market"], byAnyTag(["food", "street-food"])).slice(0, 3),
      timeLimit: 180,
      reward: { xp: 420, unlockVehicle: "siam-taxi" },
      unlockRequirements: { minXp: 0 },
    },
    {
      id: "ari-cafe-trail",
      type: "cafe_trail",
      title: "Ari Cafe Trail",
      districts: ["Phaya Thai", "Chatuchak"],
      waypoints: byAnyCategory(["cafe", "bakery", "dessert"]).slice(0, 5),
      reward: { xp: 300, badge: "Cafe Trail Scout" },
      unlockRequirements: {},
    },
    {
      id: "landmark-time-trial",
      type: "time_trial",
      title: "Landmark Time Trial",
      districts: ["Pathum Wan", "Chatuchak"],
      waypoints: route(["siam-paragon", "lumphini-park", "chatuchak-market"], byTag("tour")).slice(0, 3),
      timeLimit: 210,
      reward: { xp: 520, unlockVehicle: "chao-phraya-sport" },
      unlockRequirements: { completedMissionIds: ["royal-island-tour"] },
    },
    {
      id: "bangkok-discovery",
      type: "discovery",
      title: "Bangkok Discovery",
      districts: ["All districts"],
      waypoints: missionPlaces.map((place) => place.id),
      reward: { xp: 800, badge: "Bangkok Street Guide" },
      unlockRequirements: {},
    },
  ];
}

export function availableMissions(missions: Mission[], xp: number, completedMissionIds: string[]): Mission[] {
  return missions.filter((mission) => {
    const minXp = mission.unlockRequirements.minXp ?? 0;
    const required = mission.unlockRequirements.completedMissionIds ?? [];
    return xp >= minXp && required.every((id) => completedMissionIds.includes(id));
  });
}
