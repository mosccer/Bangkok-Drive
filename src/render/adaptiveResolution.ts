// Dynamic resolution: trades render scale for frame rate on slower (mostly mobile) GPUs.
export interface AdaptiveResolutionOptions {
  minScale: number;
  maxScale: number;
  slowFrameMs: number;
  fastFrameMs: number;
  settleMs: number;
}

const defaults: AdaptiveResolutionOptions = {
  minScale: 0.6,
  maxScale: 1,
  slowFrameMs: 24,
  fastFrameMs: 15,
  settleMs: 1_500,
};

export class AdaptiveResolution {
  private average = 16.7;
  private sinceChange = 0;
  private current: number;
  private readonly options: AdaptiveResolutionOptions;

  constructor(options: Partial<AdaptiveResolutionOptions> = {}) {
    this.options = { ...defaults, ...options };
    this.current = this.options.maxScale;
  }

  get scale(): number {
    return this.current;
  }

  reset(): void {
    this.current = this.options.maxScale;
    this.sinceChange = 0;
    this.average = 16.7;
  }

  // Returns the new scale when it changes, otherwise undefined.
  update(frameMs: number): number | undefined {
    if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 250) return undefined;
    this.average += (frameMs - this.average) * 0.05;
    this.sinceChange += frameMs;
    if (this.sinceChange < this.options.settleMs) return undefined;
    let next = this.current;
    if (this.average > this.options.slowFrameMs) next = Math.max(this.options.minScale, this.current - 0.1);
    else if (this.average < this.options.fastFrameMs) next = Math.min(this.options.maxScale, this.current + 0.05);
    if (Math.abs(next - this.current) < 0.001) return undefined;
    this.current = Math.round(next * 100) / 100;
    this.sinceChange = 0;
    return this.current;
  }
}
