// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen, withTimeout } from "../src/ui/LoadingScreen";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("loading screen", () => {
  it("shows progress and status, then hides", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="loading-screen" class="loading-screen"><span id="loading-car"></span><div><i id="loading-fill"></i></div><p id="loading-status"></p><p id="loading-tip"></p></div>`;
    const loading = new LoadingScreen();
    loading.setProgress(0.42, "สร้างตึกและเมือง…");
    expect(document.getElementById("loading-fill")!.style.width).toBe("42%");
    expect(document.getElementById("loading-status")!.textContent).toBe("สร้างตึกและเมือง…");
    expect(document.getElementById("loading-tip")!.textContent).toContain("เคล็ดลับ");
    loading.hide(100);
    expect(loading.visible).toBe(true);
    vi.advanceTimersByTime(150);
    expect(loading.visible).toBe(false);
    loading.showWarp("⚡ กำลังวาร์ป…");
    expect(loading.visible).toBe(true);
    expect(document.getElementById("loading-screen")!.classList.contains("warp")).toBe(true);
  });

  it("builds its own markup when the page has none and can show an error with a reload button", () => {
    const loading = new LoadingScreen();
    loading.fail("เริ่มเกมไม่สำเร็จ");
    expect(document.getElementById("loading-status")!.textContent).toBe("เริ่มเกมไม่สำเร็จ");
    expect(document.querySelector(".loading-retry")).not.toBeNull();
  });

  it("stops waiting on slow start-up steps", async () => {
    vi.useFakeTimers();
    const slow = withTimeout(new Promise<string>(() => undefined), 1_000);
    vi.advanceTimersByTime(1_000);
    await expect(slow).resolves.toBeUndefined();
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
    await expect(withTimeout(Promise.reject(new Error("offline")), 1_000)).resolves.toBeUndefined();
  });
});
