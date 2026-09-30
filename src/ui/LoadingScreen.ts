// Start-up and fast-travel overlay. The markup and styles live in index.html so the screen is
// visible before the game bundle has downloaded; this class drives its progress and messages.

const tips = [
  "กด N เพื่อเปิดแผนที่ แล้วแตะที่ใดก็ได้เพื่อปักหมุด",
  "คลิกหรือแตะตึกเพื่อดูชื่อ จำนวนชั้น ที่อยู่ และร้านข้างใน",
  "กด X หรือปุ่ม × เพื่อยกเลิกเส้นทาง",
  "Space = ดริฟต์ สะสมแต้มและเติมไนตรัส · Shift = ไนตรัส",
  "ขับเฉียดรถคันอื่นได้โบนัส Near miss",
  "กด B เปิดไกด์วัด คาเฟ่ และที่เที่ยว พร้อมรีวิว",
  "เล่นกับเพื่อนได้ที่ปุ่ม Online · แข่งไปแลนด์มาร์กพร้อมกัน",
  "ระวังตุ๊กตุ๊กกับมอเตอร์ไซค์ที่ชิดขอบถนน",
];

export class LoadingScreen {
  private readonly root: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly car?: HTMLElement;
  private tipIndex = 0;
  private tipTimer?: number;
  private progress = 0;

  constructor(doc: Document = document) {
    this.root = doc.getElementById("loading-screen") ?? LoadingScreen.createMarkup(doc);
    this.fill = this.part(doc, "loading-fill");
    this.status = this.part(doc, "loading-status");
    this.tip = this.part(doc, "loading-tip");
    this.car = doc.getElementById("loading-car") ?? undefined;
    this.tipIndex = Math.floor(Math.random() * tips.length);
    this.showTip();
    this.tipTimer = window.setInterval(() => this.showTip(), 3800);
  }

  get visible(): boolean {
    return !this.root.classList.contains("done");
  }

  get value(): number {
    return this.progress;
  }

  setProgress(fraction: number, status?: string): void {
    this.progress = Math.max(0, Math.min(1, fraction));
    const percent = `${Math.round(this.progress * 100)}%`;
    this.fill.style.width = percent;
    if (this.car) this.car.style.left = percent;
    if (status !== undefined && this.status.textContent !== status) this.status.textContent = status;
  }

  // Compact translucent version over the game while fast travel rebuilds the destination.
  showWarp(status: string): void {
    this.root.classList.remove("done");
    this.root.classList.add("warp");
    this.setProgress(0, status);
  }

  hide(delayMs = 250): void {
    window.setTimeout(() => {
      this.root.classList.add("done");
      this.root.classList.remove("warp");
    }, delayMs);
  }

  fail(message: string): void {
    this.root.classList.remove("done", "warp");
    this.status.textContent = message;
    this.status.classList.add("loading-error");
    if (this.tipTimer !== undefined) window.clearInterval(this.tipTimer);
    this.tip.textContent = "ลองโหลดหน้าเว็บใหม่ ถ้ายังไม่ได้ให้ลองเบราว์เซอร์อื่นที่รองรับ WebGL2";
    if (!this.root.querySelector(".loading-retry")) {
      const retry = document.createElement("button");
      retry.className = "loading-retry";
      retry.textContent = "โหลดใหม่";
      retry.addEventListener("click", () => window.location.reload());
      this.tip.after(retry);
    }
  }

  private showTip(): void {
    this.tip.textContent = `เคล็ดลับ: ${tips[this.tipIndex % tips.length]}`;
    this.tipIndex += 1;
  }

  private part(doc: Document, id: string): HTMLElement {
    const element = doc.getElementById(id);
    if (!element) throw new Error(`Missing loading element ${id}`);
    return element;
  }

  private static createMarkup(doc: Document): HTMLElement {
    const root = doc.createElement("div");
    root.id = "loading-screen";
    root.className = "loading-screen";
    root.innerHTML = `<div class="loading-card"><div class="loading-bar"><i id="loading-fill"></i></div><p class="loading-status" id="loading-status"></p><p class="loading-tip" id="loading-tip"></p></div>`;
    doc.body.append(root);
    return root;
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(undefined), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      () => {
        window.clearTimeout(timer);
        resolve(undefined);
      },
    );
  });
}
