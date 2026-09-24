import type { InputActions } from "../types";

const blankActions = (): InputActions => ({
  accelerate: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  boost: false,
  pause: false,
});

export interface UiActions {
  cycleCamera: boolean;
  zoomMinimap: boolean;
  respawn: boolean;
  toggleGarage: boolean;
  toggleMissions: boolean;
  toggleGuide: boolean;
  toggleOnline: boolean;
  horn: boolean;
}

const latchKeys: Record<string, keyof Omit<UiActions, "horn">> = {
  KeyC: "cycleCamera",
  KeyM: "zoomMinimap",
  KeyR: "respawn",
  KeyG: "toggleGarage",
  KeyJ: "toggleMissions",
  KeyB: "toggleGuide",
  KeyO: "toggleOnline",
};

export class InputController {
  readonly actions = blankActions();
  private readonly pressed = new Set<string>();
  private readonly uiLatches = new Set<keyof UiActions>();
  private pauseLatch = false;
  private touchHandbrake = false;
  private touchHorn = false;
  private touchSteer = 0;
  private touchGas = false;
  private touchBrake = false;
  private touchBoost = false;

  constructor(private readonly root: HTMLElement) {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
    this.installTouchControls();
  }

  dispose(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  update(): InputActions {
    this.actions.accelerate = this.pressed.has("KeyW") || this.pressed.has("ArrowUp") || this.touchGas;
    this.actions.brake = this.pressed.has("KeyS") || this.pressed.has("ArrowDown") || this.touchBrake;
    this.actions.steerLeft = this.pressed.has("KeyA") || this.pressed.has("ArrowLeft") || this.touchSteer < -0.25;
    this.actions.steerRight = this.pressed.has("KeyD") || this.pressed.has("ArrowRight") || this.touchSteer > 0.25;
    this.actions.handbrake = this.pressed.has("Space") || this.touchHandbrake;
    this.actions.boost = this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight") || this.touchBoost;
    this.actions.pause = this.pauseLatch;
    const keyboardSteer = this.pressed.has("KeyA") || this.pressed.has("ArrowLeft") || this.pressed.has("KeyD") || this.pressed.has("ArrowRight");
    // Stick right = steer right, which is negative in VehicleController's left-positive convention.
    this.actions.steerAxis = !keyboardSteer && this.touchSteer !== 0 ? -this.touchSteer : undefined;
    this.pauseLatch = false;
    return { ...this.actions };
  }

  consumeUiActions(): UiActions {
    const actions: UiActions = {
      cycleCamera: this.uiLatches.has("cycleCamera"),
      zoomMinimap: this.uiLatches.has("zoomMinimap"),
      respawn: this.uiLatches.has("respawn"),
      toggleGarage: this.uiLatches.has("toggleGarage"),
      toggleMissions: this.uiLatches.has("toggleMissions"),
      toggleGuide: this.uiLatches.has("toggleGuide"),
      toggleOnline: this.uiLatches.has("toggleOnline"),
      horn: this.pressed.has("KeyH") || this.touchHorn,
    };
    this.uiLatches.clear();
    return actions;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
    if (event.code === "Space" || event.code.startsWith("Arrow")) {
      event.preventDefault();
    }
    this.pressed.add(event.code);
    if (event.code === "Escape" || event.code === "KeyP") {
      this.pauseLatch = true;
    }
    const latch = latchKeys[event.code];
    if (latch && !event.repeat) {
      this.uiLatches.add(latch);
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private installTouchControls(): void {
    const stick = this.root.querySelector<HTMLElement>("[data-control='stick']");
    const knob = stick?.querySelector<HTMLElement>("span");
    const throttle = this.root.querySelector<HTMLElement>("[data-control='throttle']");
    const brake = this.root.querySelector<HTMLElement>("[data-control='brake']");
    const boost = this.root.querySelector<HTMLElement>("[data-control='boost']");
    const pause = this.root.querySelector<HTMLElement>("[data-control='pause']");
    const drift = this.root.querySelector<HTMLElement>("[data-control='drift']");
    const camera = this.root.querySelector<HTMLElement>("[data-control='camera']");
    const horn = this.root.querySelector<HTMLElement>("[data-control='horn']");

    // Pointer capture keeps the stick steering when the thumb slides off it.
    if (stick) {
      const steerFrom = (event: PointerEvent) => {
        const rect = stick.getBoundingClientRect();
        const raw = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
        const clamped = Math.max(-1, Math.min(1, raw));
        this.touchSteer = Math.abs(clamped) < 0.12 ? 0 : clamped;
        if (knob) knob.style.transform = `translateX(${clamped * 34}px)`;
      };
      const release = () => {
        this.touchSteer = 0;
        if (knob) knob.style.transform = "";
      };
      stick.addEventListener("pointerdown", (event) => {
        stick.setPointerCapture(event.pointerId);
        steerFrom(event);
      });
      stick.addEventListener("pointermove", (event) => {
        if (stick.hasPointerCapture(event.pointerId)) steerFrom(event);
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) stick.addEventListener(name, release);
    }

    const hold = (element: HTMLElement | null, set: (down: boolean) => void) => {
      if (!element) return;
      element.addEventListener("pointerdown", (event) => {
        element.setPointerCapture(event.pointerId);
        element.classList.add("pressed");
        set(true);
      });
      for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
        element.addEventListener(name, () => {
          element.classList.remove("pressed");
          set(false);
        });
      }
      element.addEventListener("contextmenu", (event) => event.preventDefault());
    };
    hold(throttle, (down) => {
      this.touchGas = down;
    });
    hold(brake, (down) => {
      this.touchBrake = down;
    });
    hold(boost, (down) => {
      this.touchBoost = down;
    });
    hold(drift, (down) => {
      this.touchHandbrake = down;
    });
    hold(horn, (down) => {
      this.touchHorn = down;
    });
    pause?.addEventListener("click", () => {
      this.pauseLatch = true;
    });
    camera?.addEventListener("click", () => {
      this.uiLatches.add("cycleCamera");
    });
  }
}
