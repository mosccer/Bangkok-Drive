// Procedural WebAudio sound: engine, tyres, nitro and UI cues without shipping audio files.
const GEAR_TOP_SPEEDS_KMH = [22, 45, 70, 95, 125];

export function engineRpmFraction(speedKmh: number): number {
  const speed = Math.abs(speedKmh);
  let gearFloor = 0;
  for (const gearTop of GEAR_TOP_SPEEDS_KMH) {
    if (speed <= gearTop) {
      return Math.max(0, Math.min(1, (speed - gearFloor) / (gearTop - gearFloor)));
    }
    gearFloor = gearTop;
  }
  return 1;
}

export interface EngineSoundInput {
  speedKmh: number;
  throttle: boolean;
  boosting: boolean;
  drifting: boolean;
}

export class GameAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private engineGain?: GainNode;
  private engineOsc?: OscillatorNode;
  private engineSub?: OscillatorNode;
  private engineFilter?: BiquadFilterNode;
  private screechGain?: GainNode;
  private boostGain?: GainNode;
  private hornGain?: GainNode;
  private noiseBuffer?: AudioBuffer;
  private enabled = true;

  constructor() {
    const unlock = () => {
      this.ensureContext();
      void this.context?.resume();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(enabled ? 0.55 : 0, this.context.currentTime, 0.05);
    }
  }

  updateEngine(input: EngineSoundInput): void {
    const ctx = this.context;
    if (!ctx || !this.engineOsc || !this.engineSub || !this.engineGain || !this.engineFilter || !this.screechGain || !this.boostGain) return;
    const now = ctx.currentTime;
    const rpm = engineRpmFraction(input.speedKmh);
    const base = 48 + rpm * 92 + (input.throttle ? 10 : 0);
    this.engineOsc.frequency.setTargetAtTime(base, now, 0.05);
    this.engineSub.frequency.setTargetAtTime(base / 2, now, 0.05);
    this.engineFilter.frequency.setTargetAtTime(420 + rpm * 1600 + (input.throttle ? 500 : 0), now, 0.08);
    this.engineGain.gain.setTargetAtTime(input.throttle ? 0.13 : 0.07, now, 0.1);
    this.screechGain.gain.setTargetAtTime(input.drifting ? 0.09 : 0, now, 0.06);
    this.boostGain.gain.setTargetAtTime(input.boosting ? 0.1 : 0, now, 0.08);
  }

  setHorn(on: boolean): void {
    if (!this.context || !this.hornGain) return;
    this.hornGain.gain.setTargetAtTime(on ? 0.12 : 0, this.context.currentTime, 0.02);
  }

  playCoin(): void {
    this.playTones([988, 1319], 0.07, "square", 0.06);
  }

  playNitroPickup(): void {
    this.playSweep(300, 1400, 0.35, "sawtooth", 0.07);
  }

  playNearMiss(): void {
    this.playNoise(0.35, 900, 2800, 0.16);
  }

  playCrash(intensity: number): void {
    this.playNoise(0.45, 900, 180, 0.2 + Math.min(0.25, intensity * 0.01));
    this.playSweep(120, 40, 0.3, "sine", 0.25);
  }

  playCheckpoint(): void {
    this.playTones([660, 880], 0.09, "triangle", 0.08);
  }

  playMissionComplete(): void {
    this.playTones([523, 659, 784, 1047], 0.12, "triangle", 0.09);
  }

  playLevelUp(): void {
    this.playTones([392, 523, 659, 784, 1047], 0.09, "square", 0.05);
  }

  playFail(): void {
    this.playTones([392, 311, 262], 0.16, "sawtooth", 0.05);
  }

  playUi(): void {
    this.playTones([740], 0.05, "triangle", 0.05);
  }

  private ensureContext(): void {
    if (this.context) return;
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    this.context = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.55 : 0;
    this.master.connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 600;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 50;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc.start();
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = "square";
    this.engineSub.frequency.value = 25;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    this.engineSub.connect(subGain).connect(this.engineFilter);
    this.engineSub.start();

    this.noiseBuffer = this.createNoiseBuffer(ctx);
    this.screechGain = this.loopNoise(ctx, "bandpass", 1500, 6);
    this.boostGain = this.loopNoise(ctx, "highpass", 2200, 0.7);

    this.hornGain = ctx.createGain();
    this.hornGain.gain.value = 0;
    this.hornGain.connect(this.master);
    for (const frequency of [392, 494]) {
      const horn = ctx.createOscillator();
      horn.type = "square";
      horn.frequency.value = frequency;
      horn.connect(this.hornGain);
      horn.start();
    }
  }

  private loopNoise(ctx: AudioContext, type: BiquadFilterType, frequency: number, q: number): GainNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer ?? null;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain);
    if (this.master) gain.connect(this.master);
    source.start();
    return gain;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private playTones(frequencies: number[], step: number, type: OscillatorType, volume: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled) return;
    frequencies.forEach((frequency, index) => {
      const start = ctx.currentTime + index * step;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + step * 1.8);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + step * 2);
    });
  }

  private playSweep(from: number, to: number, duration: number, type: OscillatorType, volume: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.enabled) return;
    const start = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private playNoise(duration: number, fromHz: number, toHz: number, volume: number): void {
    const ctx = this.context;
    if (!ctx || !this.master || !this.noiseBuffer || !this.enabled) return;
    const start = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(fromHz, start);
    filter.frequency.exponentialRampToValueAtTime(toHz, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }
}
