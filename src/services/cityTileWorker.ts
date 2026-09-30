import { generateCityTile } from "../data/proceduralCity";

// Generates procedural city tiles off the main thread so streaming never stalls a frame.
interface Scope {
  onmessage: ((event: MessageEvent<{ requestId: number; id: string }>) => void) | null;
  postMessage: (message: unknown) => void;
}

const scope = self as unknown as Scope;

scope.onmessage = (event) => {
  const { requestId, id } = event.data;
  try {
    scope.postMessage({ requestId, tile: generateCityTile(id) });
  } catch (error) {
    scope.postMessage({ requestId, error: String(error) });
  }
};
