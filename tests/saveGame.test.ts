import { describe, expect, it } from "vitest";
import { defaultSaveGame, loadSave, saveGame } from "../src/simulation/saveGame";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("save game", () => {
  it("loads defaults when storage is empty", () => {
    expect(loadSave(new MemoryStorage()).player.activeMissionId).toBe(defaultSaveGame.player.activeMissionId);
  });

  it("persists discovered places", () => {
    const storage = new MemoryStorage();
    const save = { ...defaultSaveGame, discoveredPlaceIds: ["wat-phra-kaew"] };
    saveGame(save, storage);
    expect(loadSave(storage).discoveredPlaceIds).toEqual(["wat-phra-kaew"]);
  });
});
