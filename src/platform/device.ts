import type { GraphicsQuality } from "../types";

export interface DeviceHints {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

export function isLowEndDevice(hints: DeviceHints): boolean {
  return (hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4) || (hints.deviceMemory !== undefined && hints.deviceMemory <= 3);
}

// Only used for a first launch; players can change it in Settings afterwards.
export function initialGraphicsQuality(mobile: boolean, hints: DeviceHints): GraphicsQuality {
  if (!mobile) return "medium";
  return isLowEndDevice(hints) ? "low" : "medium";
}

export function detectMobile(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) <= 520;
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
    await orientation.lock?.("landscape").catch(() => undefined);
  } catch {
    // Fullscreen is unavailable (e.g. iOS Safari outside a home-screen app).
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration is optional.
  }
}

// Keeps the phone screen awake while driving; released when paused or hidden.
export class WakeLockGuard {
  private sentinel?: { release: () => Promise<void> };
  private pending = false;

  async request(): Promise<void> {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wakeLock || this.sentinel || this.pending || document.visibilityState !== "visible") return;
    this.pending = true;
    try {
      this.sentinel = await wakeLock.request("screen");
    } catch {
      this.sentinel = undefined;
    } finally {
      this.pending = false;
    }
  }

  async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = undefined;
    await sentinel?.release().catch(() => undefined);
  }
}
