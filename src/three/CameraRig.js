import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

/**
 * Product-photography camera.
 *
 * Long lens, low-ish eyeline, and framing that is derived from each vehicle's
 * measured bounds rather than hand-tuned per model. The extents used for the
 * fit are deliberately rotation-invariant — height, and the diagonal of the
 * footprint — so the vehicle holds its size on screen as it turns instead of
 * breathing in and out on every spin.
 */

/** A 30° vertical field keeps perspective distortion off the bodywork. */
const FOV = 30;

export default class CameraRig {
  constructor() {
    this.camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
    this.target = new Vector3();
    this.distance = 3;
    /** Multiplier the film view pulls on to make room for the letterbox. */
    this.distanceScale = 1;
    this.baseElevation = 0.085;
    this.elevation = 0;
    this.azimuth = 0;

    this.fillV = 0.8;
    this.fillH = 0.72;
    this.framingOffset = 0;

    this._entry = null;
    this._viewport = { width: 1, height: 1 };
  }

  setViewport(width, height) {
    this._viewport = { width, height };
    this.camera.aspect = width / height;
    this.#applyFraming();
  }

  setFramingOffset(fraction) {
    this.framingOffset = fraction;
    this.#applyFraming();
  }

  /** Frames a measured vehicle. Recomputed on resize and on every switch. */
  frame(entry, { fillV = 0.8, fillH = 0.72 } = {}) {
    this._entry = entry;
    this.fillV = fillV;
    this.fillH = fillH;
    this.#applyFraming();
  }

  #applyFraming() {
    const { camera } = this;
    const entry = this._entry;

    if (entry) {
      const halfV = Math.tan(MathUtils.degToRad(camera.fov) / 2);
      const halfH = halfV * camera.aspect;

      const heightExtent = entry.size.y;
      // Worst-case horizontal span across any yaw, so nothing clips mid-spin.
      const widthExtent = Math.hypot(entry.size.x, entry.size.z);

      const distanceForHeight = heightExtent / this.fillV / (2 * halfV);
      const distanceForWidth = widthExtent / this.fillH / (2 * halfH);

      // The near side of the vehicle sits closer than its centre, so back off by
      // part of the depth to stop perspective inflating it past the target fill.
      this.distance = Math.max(distanceForHeight, distanceForWidth) + entry.size.z * 0.22;
      this.target.set(entry.center.x, entry.center.y, entry.center.z);
    }

    const height = this._viewport.height || 1;
    const width = this._viewport.width || 1;
    if (Math.abs(this.framingOffset) > 0.0005) {
      camera.setViewOffset(width, height, 0, this.framingOffset * height, width, height);
    } else {
      camera.clearViewOffset();
    }

    camera.updateProjectionMatrix();
  }

  /** Applies the current orbit angles. Called every frame. */
  update(elevationOffset = 0) {
    const elevation = this.baseElevation + elevationOffset;
    const { camera, target, azimuth } = this;
    const distance = this.distance * this.distanceScale;

    const cosElevation = Math.cos(elevation);
    camera.position.set(
      target.x + Math.sin(azimuth) * cosElevation * distance,
      target.y + Math.sin(elevation) * distance,
      target.z + Math.cos(azimuth) * cosElevation * distance,
    );
    camera.lookAt(target);
    camera.near = Math.max(0.05, distance - 4);
    camera.far = distance + 12;
    camera.updateProjectionMatrix();
  }
}
