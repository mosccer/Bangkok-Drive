import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { curatedPlaces } from "../src/data/curatedPlaces";
import { guideReviews } from "../src/data/guideReviews";
import { createCachedPlaceDetail, normalizeGoogleReviews } from "../src/services/placeNormalization";
import { filterGuideEntries, formatDistance, type GuideEntry } from "../src/ui/Hud";
import { serializeCuratedPlaces } from "../scripts/export-curated-places";
import { createStarterMissions } from "../src/simulation/missions";

describe("Bangkok guide content", () => {
  it("has an editorial review for every curated place", () => {
    for (const place of curatedPlaces) {
      const review = guideReviews[place.id];
      expect(review, place.id).toBeTruthy();
      expect(review.score).toBeGreaterThanOrEqual(1);
      expect(review.score).toBeLessThanOrEqual(5);
      expect(review.highlights.length).toBeGreaterThan(0);
      expect(review.summaryTh.length).toBeGreaterThan(10);
    }
    expect(Object.keys(guideReviews).every((id) => curatedPlaces.some((place) => place.id === id))).toBe(true);
  });

  it("covers temples, cafes and attractions", () => {
    const count = (categories: string[]) => curatedPlaces.filter((place) => categories.includes(place.category)).length;
    expect(count(["temple"])).toBeGreaterThanOrEqual(20);
    expect(count(["cafe", "bakery", "dessert"])).toBeGreaterThanOrEqual(12);
    expect(count(["tourist_attraction", "museum", "park"])).toBeGreaterThanOrEqual(20);
  });

  it("keeps the API's static places file in sync with the curated source", () => {
    expect(readFileSync("public/data/places.json", "utf8")).toBe(serializeCuratedPlaces(curatedPlaces));
  });

  it("keeps the original mission routes when guide places are appended", () => {
    const missions = createStarterMissions(curatedPlaces);
    expect(missions.find((mission) => mission.id === "ari-cafe-trail")?.waypoints).toEqual([
      "ari-cafe-zone",
      "talat-noi-cafe-walk",
      "thonglor-cafe-trail",
      "charoen-krung-creative-cafes",
      "mont-nomsod",
    ]);
    expect(missions.find((mission) => mission.id === "royal-island-tour")?.waypoints).toEqual(["grand-palace", "wat-phra-kaew", "wat-pho"]);
  });
});

describe("guide details", () => {
  it("attaches the editorial review to cached details", () => {
    const place = curatedPlaces.find((candidate) => candidate.id === "wat-saket")!;
    const detail = createCachedPlaceDetail(place, "th");
    expect(detail.guideReview?.score).toBe(guideReviews["wat-saket"].score);
    expect(detail.descriptionTh).toBe(guideReviews["wat-saket"].summaryTh);
  });

  it("credits OpenStreetMap for imported places", () => {
    const detail = createCachedPlaceDetail({ ...curatedPlaces[0], id: "osm-n1", source: "osm" }, "th");
    expect(detail.guideReview).toBeUndefined();
    expect(detail.sourceAttributions[0].provider).toContain("OpenStreetMap");
  });

  it("maps Google user reviews with author attribution", () => {
    const reviews = normalizeGoogleReviews([
      { rating: 5, text: { text: "สวยมาก" }, relativePublishTimeDescription: "a week ago", authorAttribution: { displayName: "Nok", uri: "https://maps.google.com/u/1" } },
      { rating: 3, originalText: { text: "Busy" } },
      { rating: 4 },
    ]);
    expect(reviews).toEqual([
      { authorName: "Nok", authorUri: "https://maps.google.com/u/1", rating: 5, text: "สวยมาก", relativeTime: "a week ago" },
      { authorName: "Google user", authorUri: undefined, rating: 3, text: "Busy", relativeTime: undefined },
    ]);
  });
});

describe("guide list filtering", () => {
  const entries: GuideEntry[] = curatedPlaces.map((place, index) => ({ place, review: guideReviews[place.id], distanceMeters: index * 100 }));

  it("filters by tab and search text", () => {
    expect(filterGuideEntries(entries, "temple", "", "near").every((entry) => entry.place.category === "temple")).toBe(true);
    expect(filterGuideEntries(entries, "cafe", "", "near").every((entry) => ["cafe", "bakery", "dessert"].includes(entry.place.category))).toBe(true);
    expect(filterGuideEntries(entries, "all", "ภูเขาทอง", "near").map((entry) => entry.place.id)).toEqual(["wat-saket"]);
    expect(filterGuideEntries(entries, "all", "golden", "near").map((entry) => entry.place.id)).toContain("wat-traimit");
  });

  it("sorts by distance or guide score", () => {
    const near = filterGuideEntries(entries, "all", "", "near");
    expect(near[0].distanceMeters).toBe(0);
    const top = filterGuideEntries(entries, "all", "", "score");
    expect(top[0].review!.score).toBe(Math.max(...Object.values(guideReviews).map((review) => review.score)));
  });

  it("formats distances in Thai units", () => {
    expect(formatDistance(420)).toBe("420 ม.");
    expect(formatDistance(2_450)).toBe("2.5 กม.");
  });
});
