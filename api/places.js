/* global console */
import { loadSupabasePlaces, parsePlaceQuery, queryPlaces, readStaticPlaces } from "./_places-utils.js";

export default async function handler(request, response) {
  const query = parsePlaceQuery(request);
  let places = await readStaticPlaces();
  let source = "static";

  try {
    const supabasePlaces = await loadSupabasePlaces();
    if (supabasePlaces?.length) {
      places = [...places, ...supabasePlaces];
      source = "mixed";
    }
  } catch (error) {
    console.warn("Supabase places cache unavailable", error);
  }

  response.setHeader("cache-control", "s-maxage=120, stale-while-revalidate=600");
  response.status(200).json(queryPlaces(places, query, source));
}
