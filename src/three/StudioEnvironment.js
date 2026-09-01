import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';

import { ENV_GRADIENT_FRAG, ENV_GRADIENT_VERT } from './shaders.js';

/**
 * A hand-built lighting studio, pre-filtered into an environment map.
 *
 * A stock HDRI would announce itself the moment the vehicle turns — you would
 * read a room in the paint. This instead models what an automotive shoot
 * actually looks like: one big soft key, a broad low fill, a long overhead
 * strip that draws the highlight down the length of the body, and a warm kicker
 * behind the shoulder. Because it is geometry, the reflections are ours to
 * art-direct rather than something we inherit.
 */

/** `[width, height, position, rotation, linear RGB]` for each light card. */
const SOFTBOXES = [
  // Key: large, high, front-left. Owns the primary highlight.
  { size: [7, 5], position: [-5.2, 5.4, 5.0], lookAt: [0, 0.6, 0], color: [5.4, 5.5, 5.8] },
  // Fill: broad and low on the opposite side, opens up the shadow side.
  { size: [8, 4], position: [6.0, 2.0, 3.4], lookAt: [0, 0.7, 0], color: [1.25, 1.32, 1.45] },
  // Overhead strip: narrow and long, running nose to tail.
  { size: [1.5, 9], position: [0, 6.4, 0.2], lookAt: [0, 0, 0], color: [4.2, 4.3, 4.5] },
  // Kicker: warm, behind the right shoulder, separates the silhouette.
  { size: [4, 3.2], position: [3.6, 2.6, -5.2], lookAt: [0, 0.9, 0], color: [3.0, 2.15, 1.45] },
  // Cool counter-kick on the left rear, so the dark side is not dead.
  { size: [3.4, 3], position: [-4.4, 2.2, -4.6], lookAt: [0, 0.9, 0], color: [0.9, 1.05, 1.35] },
];

export default class StudioEnvironment {
  constructor(renderer) {
    this.renderer = renderer;
    this.pmrem = new PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.disposables = [];
    this.target = null;
  }

  #buildScene() {
    const scene = new Scene();

    const domeMaterial = new ShaderMaterial({
      vertexShader: ENV_GRADIENT_VERT,
      fragmentShader: ENV_GRADIENT_FRAG,
      side: BackSide,
      depthWrite: false,
      uniforms: {
        // Kept dim and cool: the environment sets the mood, the cards do the work.
        uTop: { value: new Color().setRGB(0.115, 0.135, 0.16, LinearSRGBColorSpace) },
        uHorizon: { value: new Color().setRGB(0.052, 0.062, 0.075, LinearSRGBColorSpace) },
        uBottom: { value: new Color().setRGB(0.026, 0.03, 0.036, LinearSRGBColorSpace) },
      },
    });
    const dome = new Mesh(new SphereGeometry(40, 24, 16), domeMaterial);
    scene.add(dome);
    this.disposables.push(dome.geometry, domeMaterial);

    for (const box of SOFTBOXES) {
      const material = new MeshBasicMaterial({
        color: new Color().setRGB(...box.color, LinearSRGBColorSpace),
        side: DoubleSide,
      });
      const mesh = new Mesh(new PlaneGeometry(box.size[0], box.size[1]), material);
      mesh.position.set(...box.position);
      mesh.lookAt(...box.lookAt);
      scene.add(mesh);
      this.disposables.push(mesh.geometry, material);
    }

    // A ground card so the underside of the vehicle picks up bounce instead of
    // falling into flat black, which is what makes wheels read as grounded.
    const floorMaterial = new MeshBasicMaterial({
      color: new Color().setRGB(0.09, 0.1, 0.115, LinearSRGBColorSpace),
    });
    const floor = new Mesh(new BoxGeometry(60, 0.1, 60), floorMaterial);
    floor.position.y = -0.06;
    scene.add(floor);
    this.disposables.push(floor.geometry, floorMaterial);

    return scene;
  }

  /** Builds (or rebuilds) the pre-filtered map. Safe to call on tier changes. */
  generate() {
    this.target?.dispose();
    const scene = this.#buildScene();
    this.target = this.pmrem.fromScene(scene, 0.04, 0.1, 100);
    scene.clear();
    return this.target.texture;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.target?.dispose();
    this.pmrem.dispose();
  }
}
