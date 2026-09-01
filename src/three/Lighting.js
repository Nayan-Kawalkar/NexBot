import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Vector3,
} from 'three';

/**
 * Direct lighting sitting on top of the environment map.
 *
 * The environment supplies the soft, wrapping illumination; these lights add
 * the two things it cannot — a directional cast shadow, and crisp specular
 * terminators that give the bodywork an edge to read against.
 */
export default class Lighting {
  constructor({ shadowMapSize = 2048 } = {}) {
    this.group = new Group();
    this.group.name = 'lighting';

    this.key = new DirectionalLight(new Color('#fdfaf6'), 2.1);
    this.key.position.set(-4.2, 5.6, 4.4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.key.shadow.bias = -0.0012;
    this.key.shadow.normalBias = 0.018;
    // Softens the shadow edge without paying for a larger map.
    this.key.shadow.radius = 4;
    this.group.add(this.key, this.key.target);

    this.fill = new DirectionalLight(new Color('#cfdbe8'), 0.62);
    this.fill.position.set(5.4, 2.2, 3.2);
    this.group.add(this.fill, this.fill.target);

    this.rim = new DirectionalLight(new Color('#ffcda0'), 1.45);
    this.rim.position.set(3.0, 2.4, -5.0);
    this.group.add(this.rim, this.rim.target);

    this.bounce = new HemisphereLight(new Color('#8fa2b5'), new Color('#1b2026'), 0.34);
    this.group.add(this.bounce);

    this._targets = [this.key.target, this.fill.target, this.rim.target];
  }

  /**
   * Re-aims the lights at the vehicle and tightens the shadow frustum around
   * it, so shadow texels are spent on the model rather than empty floor.
   */
  focus(center, radius) {
    const target = new Vector3(center.x, center.y, center.z);
    for (const t of this._targets) {
      t.position.copy(target);
      t.updateMatrixWorld();
    }

    const camera = this.key.shadow.camera;
    const extent = radius * 1.35;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = 0.1;
    camera.far = radius * 12;
    camera.updateProjectionMatrix();
  }

  setShadowMapSize(size) {
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.map?.dispose();
    this.key.shadow.map = null;
  }

  dispose() {
    this.key.shadow.map?.dispose();
    this.group.clear();
  }
}
