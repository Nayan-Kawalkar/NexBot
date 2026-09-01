import {
  ClampToEdgeWrapping,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  MaxEquation,
  OneFactor,
  CustomBlending,
  Color,
  WebGLRenderTarget,
} from 'three';

import {
  BLUR_FRAG,
  CONTACT_DEPTH_FRAG,
  CONTACT_DEPTH_VERT,
  CONTACT_PLANE_FRAG,
  CONTACT_PLANE_VERT,
  FULLSCREEN_VERT,
} from './shaders.js';

export const VEHICLE_LAYER = 1;

/**
 * Baked contact shadow.
 *
 * A shadow map alone leaves a vehicle looking pasted onto the floor: it gives
 * you the long cast shadow but not the dense, tight darkening where rubber
 * actually meets ground. This renders the vehicle from directly underneath,
 * weights each fragment by how close it sits to the floor, blurs the result and
 * projects it back down — so the wheels get their contact patch and the body
 * gets a soft ambient occlusion pool that follows it as it turns.
 */
export default class ContactShadow {
  constructor(renderer, { resolution = 512, blurPasses = 2 } = {}) {
    this.renderer = renderer;
    this.blurPasses = blurPasses;
    this.needsUpdate = true;
    this._framesSinceBake = 0;

    this.group = new Group();
    this.group.name = 'contact-shadow';

    const options = {
      type: UnsignedByteType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.target = new WebGLRenderTarget(resolution, resolution, options);
    this.scratch = new WebGLRenderTarget(resolution, resolution, options);

    // Looks straight up from just below the floor. With this orientation the
    // render target's UV space lines up with the ground plane's, so no flip.
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.camera.rotation.x = Math.PI / 2;

    this.depthMaterial = new ShaderMaterial({
      vertexShader: CONTACT_DEPTH_VERT,
      fragmentShader: CONTACT_DEPTH_FRAG,
      uniforms: {
        uFar: { value: 1 },
        uFalloff: { value: 2.4 },
      },
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // MAX rather than additive: overlapping surfaces should not compound into
      // a black hole under the chassis.
      blending: CustomBlending,
      blendEquation: MaxEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
      blendEquationAlpha: MaxEquation,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneFactor,
    });

    this.planeMaterial = new ShaderMaterial({
      vertexShader: CONTACT_PLANE_VERT,
      fragmentShader: CONTACT_PLANE_FRAG,
      uniforms: {
        tShadow: { value: this.target.texture },
        uColor: { value: new Color('#0a0e13') },
        uOpacity: { value: 0.9 },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    this.plane = new Mesh(new PlaneGeometry(1, 1), this.planeMaterial);
    this.plane.rotation.x = Math.PI / 2;
    this.plane.renderOrder = -1;
    this.group.add(this.plane);

    this.blurScene = new Scene();
    this.blurMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new Vector2() } },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
    this.blurQuad = new Mesh(new PlaneGeometry(2, 2), this.blurMaterial);
    this.blurQuad.frustumCulled = false;
    this.blurScene.add(this.blurQuad);
    this.blurCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Sizes the capture volume and the projection plane to a vehicle. */
  fit({ center, size, groundY }) {
    const footprint = Math.max(size.x, size.z) * 1.75;
    const height = size.y * 0.62;

    this.plane.geometry.dispose();
    this.plane.geometry = new PlaneGeometry(footprint, footprint);
    this.plane.position.set(center.x, groundY + size.y * 0.0035, center.z);

    const half = footprint / 2;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = 0;
    this.camera.far = height;
    this.camera.position.set(center.x, groundY - height * 0.004, center.z);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    this.depthMaterial.uniforms.uFar.value = height;
    this.needsUpdate = true;
  }

  set opacity(value) {
    this.planeMaterial.uniforms.uOpacity.value = value;
  }

  get opacity() {
    return this.planeMaterial.uniforms.uOpacity.value;
  }

  #blur(direction, radius) {
    const { width, height } = this.target;
    this.blurMaterial.uniforms.tDiffuse.value = this.target.texture;
    this.blurMaterial.uniforms.uDirection.value.set(
      direction === 'x' ? radius / width : 0,
      direction === 'y' ? radius / height : 0,
    );
    this.blurQuad.material = this.blurMaterial;
    this.renderer.setRenderTarget(this.scratch);
    this.renderer.render(this.blurScene, this.blurCamera);

    const swap = this.target;
    this.target = this.scratch;
    this.scratch = swap;
    this.planeMaterial.uniforms.tShadow.value = this.target.texture;
  }

  /**
   * Re-bakes the shadow. Throttled, because it only matters when the vehicle
   * has actually moved — a static hero should not pay for it every frame.
   */
  update(scene, { force = false, interval = 2 } = {}) {
    this._framesSinceBake += 1;
    if (!force && (!this.needsUpdate || this._framesSinceBake < interval)) return;
    this._framesSinceBake = 0;
    this.needsUpdate = false;

    const { renderer } = this;
    const previousOverride = scene.overrideMaterial;
    const previousTarget = renderer.getRenderTarget();

    this.group.visible = false;
    scene.overrideMaterial = this.depthMaterial;
    this.camera.layers.set(VEHICLE_LAYER);

    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(scene, this.camera);

    scene.overrideMaterial = previousOverride;
    this.group.visible = true;

    for (let i = 0; i < this.blurPasses; i++) {
      const radius = 1.4 + i * 1.6;
      this.#blur('x', radius);
      this.#blur('y', radius);
    }

    renderer.setRenderTarget(previousTarget);
  }

  setResolution(resolution) {
    this.target.setSize(resolution, resolution);
    this.scratch.setSize(resolution, resolution);
    this.needsUpdate = true;
  }

  dispose() {
    this.target.dispose();
    this.scratch.dispose();
    this.depthMaterial.dispose();
    this.planeMaterial.dispose();
    this.blurMaterial.dispose();
    this.plane.geometry.dispose();
    this.blurQuad.geometry.dispose();
    this.group.clear();
  }
}
