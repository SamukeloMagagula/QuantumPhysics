import * as THREE from 'three';

/**
 * A damped spring that chases `target`, tracking `velocity` between calls so
 * motion eases in/out instead of snapping. `mass` behaves like inverse
 * stiffness (smaller = snappier); `damping` should be roughly 2/sqrt(mass)
 * for critical damping (fast settle, no oscillation).
 */
export class SpringSimulator {
  position: number;
  velocity = 0;
  target: number;

  constructor(private mass: number, private damping: number, start = 0) {
    this.position = start;
    this.target = start;
  }

  advance(dt: number): void {
    const accel = (this.target - this.position) / this.mass - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.position += this.velocity * dt;
  }
}

/** Same as {@link SpringSimulator} but over a 2D vector (e.g. planar velocity). */
export class VectorSpringSimulator {
  readonly position: THREE.Vector2;
  readonly velocity = new THREE.Vector2();
  readonly target: THREE.Vector2;

  constructor(private mass: number, private damping: number, start = new THREE.Vector2()) {
    this.position = start.clone();
    this.target = start.clone();
  }

  advance(dt: number): void {
    const ax = (this.target.x - this.position.x) / this.mass - this.velocity.x * this.damping;
    const ay = (this.target.y - this.position.y) / this.mass - this.velocity.y * this.damping;
    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
  }
}

/**
 * Same as {@link SpringSimulator} but for an angle in radians — the delta to
 * `target` is always taken the short way around the +-PI seam, and `position`
 * is kept wrapped to (-PI, PI].
 */
export class RelativeSpringSimulator {
  position: number;
  velocity = 0;
  target: number;

  constructor(private mass: number, private damping: number, start = 0) {
    this.position = start;
    this.target = start;
  }

  advance(dt: number): void {
    let delta = this.target - this.position;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const accel = delta / this.mass - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.position += this.velocity * dt;

    while (this.position > Math.PI) this.position -= Math.PI * 2;
    while (this.position < -Math.PI) this.position += Math.PI * 2;
  }
}
