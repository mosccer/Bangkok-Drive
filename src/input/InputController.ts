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
  horn: boolean;
}

const latchKeys: Record<string, keyof Omit<UiActions, "horn">> = {
  KeyC: "cycleCamera",
  KeyM: "zoomMinimap",
  KeyR: "respawn",
  KeyG: "toggleGarage",
  KeyJ: "toggleMissions",
};

export class InputController {
  readonly actions = blankActions();
  private readonly pressed = new Set<string>();
  private readonly uiLatches = new Set<keyof UiActions>();
  private pauseLatch = false;
  private touchHandbrake = false;
  private touchHorn = false;
  private touchSteer = 0;
  private touchThrottle = 0;

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
    this.actions.accelerate = this.pressed.has("KeyW") || this.pressed.has("ArrowUp") || this.touchThrottle > 0;
    this.actions.brake = this.pressed.has("KeyS") || this.pressed.has("ArrowDown") || this.touchThrottle < 0;
    this.actions.steerLeft = this.pressed.has("KeyA") || this.pressed.has("ArrowLeft") || this.touchSteer < -0.25;
    this.actions.steerRight = this.pressed.has("KeyD") || this.pressed.has("ArrowRight") || this.touchSteer > 0.25;
    this.actions.handbrake = this.pressed.has("Space") || this.touchHandbrake;
    this.actions.boost = this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight");
    this.actions.pause = this.pauseLatch;
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
    const throttle = this.root.querySelector<HTMLElement>("[data-control='throttle']");
    const brake = this.root.querySelector<HTMLElement>("[data-control='brake']");
    const boost = this.root.querySelector<HTMLElement>("[data-control='boost']");
    const pause = this.root.querySelector<HTMLElement>("[data-control='pause']");
    const drift = this.root.querySelector<HTMLElement>("[data-control='drift']");
    const camera = this.root.querySelector<HTMLElement>("[data-control='camera']");
    const horn = this.root.querySelector<HTMLElement>("[data-control='horn']");

    stick?.addEventListener("pointermove", (event) => {
      const rect = stick.getBoundingClientRect();
      this.touchSteer = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    });
    stick?.addEventListener("pointerleave", () => {
      this.touchSteer = 0;
    });
    stick?.addEventListener("pointerup", () => {
      this.touchSteer = 0;
    });

    throttle?.addEventListener("pointerdown", () => {
      this.touchThrottle = 1;
    });
    throttle?.addEventListener("pointerup", () => {
      this.touchThrottle = 0;
    });
    throttle?.addEventListener("pointerleave", () => {
      this.touchThrottle = 0;
    });

    brake?.addEventListener("pointerdown", () => {
      this.touchThrottle = -1;
    });
    brake?.addEventListener("pointerup", () => {
      this.touchThrottle = 0;
    });
    brake?.addEventListener("pointerleave", () => {
      this.touchThrottle = 0;
    });

    boost?.addEventListener("pointerdown", () => {
      this.pressed.add("ShiftLeft");
    });
    boost?.addEventListener("pointerup", () => {
      this.pressed.delete("ShiftLeft");
    });
    pause?.addEventListener("click", () => {
      this.pauseLatch = true;
    });
    drift?.addEventListener("pointerdown", () => {
      this.touchHandbrake = true;
    });
    for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) {
      drift?.addEventListener(eventName, () => {
        this.touchHandbrake = false;
      });
      horn?.addEventListener(eventName, () => {
        this.touchHorn = false;
      });
    }
    horn?.addEventListener("pointerdown", () => {
      this.touchHorn = true;
    });
    camera?.addEventListener("click", () => {
      this.uiLatches.add("cycleCamera");
    });
  }
}
