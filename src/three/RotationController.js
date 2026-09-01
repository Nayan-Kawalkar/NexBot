import { MathUtils } from 'three';

/**
 * Turntable interaction.
 *
 * Horizontal drag spins the vehicle; vertical drag raises and lowers the
 * camera within a narrow band. Splitting the two axes that way is what keeps
 * this feeling like a product configurator rather than a free orbit camera —
 * the vehicle never leaves the floor, the shadow stays honest, and there is no
 * way to end up underneath the model looking at its undercarriage.
 */

const DRAG_TO_RADIANS = 0.0085;
const ELEVATION_SENSITIVITY = 0.0022;
const ELEVATION_LIMIT = 0.34;
const FLICK_DECAY = 3.4;
const SETTLE = 14;
const IDLE_RESUME_DELAY = 2.4;

export default class RotationController {
  constructor(element, { reducedMotion = false } = {}) {
    this.element = element;
    this.reducedMotion = reducedMotion;

    this.enabled = true;
    this.dragging = false;
    this.pointerId = null;

    /** User-applied yaw, on top of the project's presentation angle. */
    this.yaw = 0;
    this.yawVelocity = 0;

    this.elevation = 0;
    this.elevationTarget = 0;

    this.idleTimer = 0;
    this.idleAmount = 1;
    this.hasInteracted = false;

    this._last = { x: 0, y: 0 };
    this._onPointerDown = this.#onPointerDown.bind(this);
    this._onPointerMove = this.#onPointerMove.bind(this);
    this._onPointerUp = this.#onPointerUp.bind(this);
    this._onKeyDown = this.#onKeyDown.bind(this);

    element.addEventListener('pointerdown', this._onPointerDown);
    element.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('pointermove', this._onPointerMove, { passive: false });
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
  }

  #onPointerDown(event) {
    if (!this.enabled || event.button > 0) return;
    this.dragging = true;
    this.pointerId = event.pointerId;
    this._last.x = event.clientX;
    this._last.y = event.clientY;
    this.yawVelocity = 0;
    this.idleTimer = 0;
    this.hasInteracted = true;
    this.element.setPointerCapture?.(event.pointerId);
    this.element.classList.add('is-grabbing');
  }

  #onPointerMove(event) {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    event.preventDefault();

    const dx = event.clientX - this._last.x;
    const dy = event.clientY - this._last.y;
    this._last.x = event.clientX;
    this._last.y = event.clientY;

    this.yaw += dx * DRAG_TO_RADIANS;
    // Velocity is sampled from the live delta so releasing mid-swipe throws the
    // model rather than stopping it dead.
    this.yawVelocity = dx * DRAG_TO_RADIANS * 60;

    this.elevationTarget = MathUtils.clamp(
      this.elevationTarget - dy * ELEVATION_SENSITIVITY,
      -ELEVATION_LIMIT,
      ELEVATION_LIMIT * 0.72,
    );
  }

  #onPointerUp(event) {
    if (!this.dragging || (this.pointerId !== null && event.pointerId !== this.pointerId)) return;
    this.dragging = false;
    this.pointerId = null;
    this.element.classList.remove('is-grabbing');
  }

  #onKeyDown(event) {
    if (!this.enabled) return;
    const step = event.shiftKey ? 0.35 : 0.14;
    switch (event.key) {
      case 'ArrowLeft': this.yaw -= step; break;
      case 'ArrowRight': this.yaw += step; break;
      case 'ArrowUp':
        this.elevationTarget = MathUtils.clamp(this.elevationTarget + 0.05, -ELEVATION_LIMIT, ELEVATION_LIMIT * 0.72);
        break;
      case 'ArrowDown':
        this.elevationTarget = MathUtils.clamp(this.elevationTarget - 0.05, -ELEVATION_LIMIT, ELEVATION_LIMIT * 0.72);
        break;
      default: return;
    }
    event.preventDefault();
    this.hasInteracted = true;
    this.idleTimer = 0;
  }

  /** Smoothly returns user rotation to neutral, used when switching projects. */
  reset() {
    this.yaw = 0;
    this.yawVelocity = 0;
    this.elevationTarget = 0;
    this.elevation = 0;
    this.idleTimer = IDLE_RESUME_DELAY;
  }

  update(delta) {
    if (!this.dragging) {
      // Momentum, then a slow return of idle drift once the hand is off.
      this.yaw += this.yawVelocity * delta;
      this.yawVelocity *= Math.exp(-FLICK_DECAY * delta);
      if (Math.abs(this.yawVelocity) < 0.0005) this.yawVelocity = 0;

      this.idleTimer += delta;
    } else {
      this.idleTimer = 0;
    }

    const wantsIdle = this.reducedMotion
      ? 0
      : MathUtils.clamp((this.idleTimer - IDLE_RESUME_DELAY) / 1.6, 0, 1);
    this.idleAmount += (wantsIdle - this.idleAmount) * Math.min(1, delta * 2.2);

    this.elevation = MathUtils.damp(this.elevation, this.elevationTarget, SETTLE, delta);

    return this.yaw;
  }

  dispose() {
    this.element.removeEventListener('pointerdown', this._onPointerDown);
    this.element.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }
}
