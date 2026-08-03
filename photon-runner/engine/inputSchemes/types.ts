export interface MovementCallbacks {
  /**
   * x: -1 (left) .. 1 (right) strafe, z: -1 (back) .. 1 (forward).
   * sprint: true while a sprint modifier (e.g. Shift) is held alongside
   * movement. Schemes that have no sprint concept (touch joystick) omit it,
   * which callers must treat the same as `false`.
   */
  onMove: (x: number, z: number, sprint?: boolean) => void;
  onInteract: () => void;
}

/**
 * A control scheme translates raw keyboard/touch/pointer events into the
 * movement events every game cares about. Games never touch DOM events
 * directly, so a new scheme can be added later without changing game code.
 */
export interface InputScheme {
  id: string;
  attach(target: HTMLElement, callbacks: MovementCallbacks): void;
  detach(): void;
}
