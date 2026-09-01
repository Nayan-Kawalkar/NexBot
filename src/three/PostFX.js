import {
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  HalfFloatType,
  LinearFilter,
  ClampToEdgeWrapping,
  RGBAFormat,
} from 'three';

import {
  BLUR_FRAG,
  BRIGHT_FRAG,
  COMPOSITE_FRAG,
  FULLSCREEN_VERT,
} from './shaders.js';

/**
 * A small, purpose-built post chain.
 *
 * three's stock EffectComposer assumes it owns an opaque frame; this one keeps
 * alpha intact end to end so the canvas can float over the page. Two bloom
 * octaves give a wide, soft halo around the emissive strips without the fat
 * blur radius that would smear the wheel detail.
 */
export default class PostFX {
  constructor(renderer, { tier }) {
    this.renderer = renderer;
    this.tier = tier;
    this.enabled = tier.bloom;

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new Scene();
    this.quad = new Mesh(new PlaneGeometry(2, 2), null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const targetOptions = {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: true,
      stencilBuffer: false,
    };

    // Multisampling here is what keeps edges clean: once the scene renders into
    // a target, the renderer's own antialias flag no longer applies.
    this.sceneTarget = new WebGLRenderTarget(1, 1, {
      ...targetOptions,
      samples: tier.samples,
    });

    const bloomOptions = { ...targetOptions, depthBuffer: false, samples: 0 };
    this.brightTarget = new WebGLRenderTarget(1, 1, bloomOptions);
    this.blurTargetA = new WebGLRenderTarget(1, 1, bloomOptions);
    this.blurTargetB = new WebGLRenderTarget(1, 1, bloomOptions);
    this.farTargetA = new WebGLRenderTarget(1, 1, bloomOptions);
    this.farTargetB = new WebGLRenderTarget(1, 1, bloomOptions);

    this.brightMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BRIGHT_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uThreshold: { value: 0.82 },
        uKnee: { value: 0.25 },
      },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.blurMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new Vector2() },
      },
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMaterial = new ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tBloomNear: { value: null },
        tBloomFar: { value: null },
        uBloomStrength: { value: 0.55 },
        uBloomSpill: { value: 1.35 },
        uExposure: { value: 1.0 },
      },
      transparent: true,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    });
  }

  get exposure() {
    return this.compositeMaterial.uniforms.uExposure.value;
  }

  set exposure(value) {
    this.compositeMaterial.uniforms.uExposure.value = value;
  }

  setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.sceneTarget.setSize(w, h);

    const near = Math.max(1, Math.floor(w * this.tier.bloomScale));
    const nearH = Math.max(1, Math.floor(h * this.tier.bloomScale));
    this.brightTarget.setSize(near, nearH);
    this.blurTargetA.setSize(near, nearH);
    this.blurTargetB.setSize(near, nearH);

    const far = Math.max(1, Math.floor(near * 0.5));
    const farH = Math.max(1, Math.floor(nearH * 0.5));
    this.farTargetA.setSize(far, farH);
    this.farTargetB.setSize(far, farH);
  }

  /** Draws `material` across the viewport into `target` (null = canvas). */
  #blit(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  #blurPass(source, ping, pong, radius) {
    const { width, height } = ping;
    this.blurMaterial.uniforms.tDiffuse.value = source.texture;
    this.blurMaterial.uniforms.uDirection.value.set(radius / width, 0);
    this.#blit(this.blurMaterial, ping);

    this.blurMaterial.uniforms.tDiffuse.value = ping.texture;
    this.blurMaterial.uniforms.uDirection.value.set(0, radius / height);
    this.#blit(this.blurMaterial, pong);
    return pong;
  }

  render(scene, camera) {
    const { renderer } = this;

    renderer.setRenderTarget(this.sceneTarget);
    renderer.clear();
    renderer.render(scene, camera);

    if (!this.enabled) {
      this.compositeMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
      this.compositeMaterial.uniforms.tBloomNear.value = null;
      this.compositeMaterial.uniforms.tBloomFar.value = null;
      this.compositeMaterial.uniforms.uBloomStrength.value = 0;
      renderer.setRenderTarget(null);
      this.#blit(this.compositeMaterial, null);
      return;
    }

    this.brightMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.#blit(this.brightMaterial, this.brightTarget);

    const near = this.#blurPass(this.brightTarget, this.blurTargetA, this.blurTargetB, 1.0);
    const far = this.#blurPass(near, this.farTargetA, this.farTargetB, 2.0);

    this.compositeMaterial.uniforms.tDiffuse.value = this.sceneTarget.texture;
    this.compositeMaterial.uniforms.tBloomNear.value = near.texture;
    this.compositeMaterial.uniforms.tBloomFar.value = far.texture;

    renderer.setRenderTarget(null);
    this.#blit(this.compositeMaterial, null);
  }

  setTier(tier) {
    this.tier = tier;
    this.enabled = tier.bloom;
    this.sceneTarget.samples = tier.samples;
    this.sceneTarget.dispose();
  }

  dispose() {
    for (const target of [
      this.sceneTarget,
      this.brightTarget,
      this.blurTargetA,
      this.blurTargetB,
      this.farTargetA,
      this.farTargetB,
    ]) {
      target.dispose();
    }
    this.brightMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.geometry.dispose();
  }
}
