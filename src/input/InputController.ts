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

export class InputController {
  readonly actions = blankActions();
  private readonly pressed = new Set<string>();
  private pauseLatch = false;
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
    this.actions.handbrake = this.pressed.has("Space");
    this.actions.boost = this.pressed.has("ShiftLeft") || this.pressed.has("ShiftRight");
    this.actions.pause = this.pauseLatch;
    this.pauseLatch = false;
    return { ...this.actions };
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    this.pressed.add(event.code);
    if (event.code === "Escape" || event.code === "KeyP") {
      this.pauseLatch = true;
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
  }
}
