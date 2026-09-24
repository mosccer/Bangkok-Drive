import type { WorldMeters } from "../types";
import type { WorldRoadSegment } from "./roadGeometry";

export interface RoadGraph {
  nodes: Map<string, WorldMeters>;
  edges: Map<string, Array<{ to: string; cost: number }>>;
}

function nodeKey(x: number, z: number): string {
  return `${Math.round(x)}:${Math.round(z)}`;
}

// Segment endpoints that land on the same metre are treated as one junction, and roads that cross
// without a shared node (hand-traced fallback data) are split at the crossing so they connect.
export function buildRoadGraph(segments: WorldRoadSegment[]): RoadGraph {
  const nodes = new Map<string, WorldMeters>();
  const edges = new Map<string, Array<{ to: string; cost: number }>>();
  const link = (from: string, to: string, cost: number) => {
    const list = edges.get(from);
    if (list) list.push({ to, cost });
    else edges.set(from, [{ to, cost }]);
  };
  const splits = findCrossings(segments);
  segments.forEach((segment, index) => {
    // Slightly prefer bigger roads, like a navigation app would.
    const preference = segment.kind === "motorway" || segment.kind === "primary" || segment.kind === "arterial" ? 0.85 : segment.kind === "service" || segment.kind === "alley" ? 1.3 : 1;
    const params = [0, ...(splits.get(index) ?? []).sort((a, b) => a - b), 1];
    for (let i = 0; i < params.length - 1; i += 1) {
      const ax = segment.ax + (segment.bx - segment.ax) * params[i];
      const az = segment.az + (segment.bz - segment.az) * params[i];
      const bx = segment.ax + (segment.bx - segment.ax) * params[i + 1];
      const bz = segment.az + (segment.bz - segment.az) * params[i + 1];
      const a = nodeKey(ax, az);
      const b = nodeKey(bx, bz);
      if (a === b) continue;
      nodes.set(a, { x: ax, z: az });
      nodes.set(b, { x: bx, z: bz });
      const length = Math.hypot(bx - ax, bz - az) * preference;
      link(a, b, length);
      link(b, a, length);
    }
  });
  return { nodes, edges };
}

const CROSSING_CELL = 200;

function findCrossings(segments: WorldRoadSegment[]): Map<number, number[]> {
  const grid = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    const minX = Math.floor(Math.min(segment.ax, segment.bx) / CROSSING_CELL);
    const maxX = Math.floor(Math.max(segment.ax, segment.bx) / CROSSING_CELL);
    const minZ = Math.floor(Math.min(segment.az, segment.bz) / CROSSING_CELL);
    const maxZ = Math.floor(Math.max(segment.az, segment.bz) / CROSSING_CELL);
    for (let x = minX; x <= maxX; x += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        const key = `${x}:${z}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(index);
        else grid.set(key, [index]);
      }
    }
  });
  const splits = new Map<number, number[]>();
  const seen = new Set<string>();
  for (const bucket of grid.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const a = bucket[i];
        const b = bucket[j];
        const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (seen.has(pair)) continue;
        seen.add(pair);
        const hit = intersect(segments[a], segments[b]);
        if (!hit) continue;
        (splits.get(a) ?? splits.set(a, []).get(a)!).push(hit.t);
        (splits.get(b) ?? splits.set(b, []).get(b)!).push(hit.u);
      }
    }
  }
  return splits;
}

function intersect(p: WorldRoadSegment, q: WorldRoadSegment): { t: number; u: number } | undefined {
  const rx = p.bx - p.ax;
  const rz = p.bz - p.az;
  const sx = q.bx - q.ax;
  const sz = q.bz - q.az;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = ((q.ax - p.ax) * sz - (q.az - p.az) * sx) / denominator;
  const u = ((q.ax - p.ax) * rz - (q.az - p.az) * rx) / denominator;
  // Crossings at (or next to) existing endpoints are already joined by the shared-node rule.
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return undefined;
  return { t, u };
}

export function nearestNode(graph: RoadGraph, point: WorldMeters): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [key, node] of graph.nodes) {
    const distance = (node.x - point.x) ** 2 + (node.z - point.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = key;
    }
  }
  return best;
}

class MinHeap {
  private readonly items: Array<{ key: string; priority: number }> = [];

  get size(): number {
    return this.items.length;
  }

  push(key: string, priority: number): void {
    this.items.push({ key, priority });
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].priority <= this.items[index].priority) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }

  pop(): string | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (!top || !last) return top?.key;
    if (this.items.length) {
      this.items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) smallest = left;
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) smallest = right;
        if (smallest === index) break;
        [this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]];
        index = smallest;
      }
    }
    return top.key;
  }
}

// A* over the loaded road network. When the target lies beyond the loaded roads, the route ends at the
// road node closest to it and the caller draws the last stretch as a straight hint.
export function findRoute(graph: RoadGraph, from: WorldMeters, to: WorldMeters, maxExpanded = 30_000): WorldMeters[] | undefined {
  const start = nearestNode(graph, from);
  const goal = nearestNode(graph, to);
  if (!start || !goal) return undefined;
  const goalPoint = graph.nodes.get(goal)!;
  const heuristic = (key: string) => {
    const node = graph.nodes.get(key)!;
    return Math.hypot(node.x - goalPoint.x, node.z - goalPoint.z) * 0.85;
  };
  const open = new MinHeap();
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>([[start, 0]]);
  open.push(start, heuristic(start));
  let expanded = 0;
  while (open.size && expanded < maxExpanded) {
    const current = open.pop()!;
    expanded += 1;
    if (current === goal) {
      const path: WorldMeters[] = [];
      let key: string | undefined = current;
      while (key) {
        path.push(graph.nodes.get(key)!);
        key = cameFrom.get(key);
      }
      return path.reverse();
    }
    const currentCost = cost.get(current)!;
    for (const edge of graph.edges.get(current) ?? []) {
      const next = currentCost + edge.cost;
      if (next < (cost.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        cost.set(edge.to, next);
        cameFrom.set(edge.to, current);
        open.push(edge.to, next + heuristic(edge.to));
      }
    }
  }
  return undefined;
}
