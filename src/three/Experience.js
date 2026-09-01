import {
  Color,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  NoToneMapping,
  WebGLRenderer,
  Clock,
} from 'three';
import gsap from 'gsap';

import CameraRig from './CameraRig.js';
import ContactShadow from './ContactShadow.js';
import Lighting from './Lighting.js';
import PostFX from './PostFX.js';
import RotationController from './RotationController.js';
import StudioEnvironment from './StudioEnvironment.js';
import VehicleManager from './VehicleManager.js';
import { createPerformanceGovernor, detectTier, stepDown } from './quality.js';
import { DUR, EASE } from '../lib/motion.js';

const IDLE_DRIFT_SPEED = 0.021;
const IDLE_BOB_SPEED = 0.58;
const IDLE_BOB_AMOUNT = 0.007;

/**
 * The rendering layer.
 *
 * Deliberately imperative and entirely outside React's render cycle: React
 * owns the interface, this owns the frame. The only traffic between them is a
 * project index going in and a handful of lifecycle callbacks coming out, so
 * nothing here ever triggers a re-render, and no re-render ever costs a frame.
 */
export default class Experience {
  constructor(canvas, { onProgress, onVehicleReady, measureStage, reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.onProgress = onProgress;
    this.onVehicleReady = onVehicleReady;
    // Supplied by the interface layer: the horizontal band left free between the
    // side columns. Framing is derived from it rather than guessed per
    // breakpoint, so the vehicle can never grow into the copy.
    this.measureStage = measureStage;
    this.reducedMotion = reducedMotion;

    this.tier = detectTier();
    this.clock = new Clock();
    this.running = false;
    this.transitioning = false;
    this.cinematic = false;

    this.activeEntry = null;
    this.activeVehicle = null;
    this.idleDrift = 0;
    this.elapsed = 0;

    this.#createRenderer();
    this.#createScene();

    this.rig = new CameraRig();
    this.lighting = new Lighting({ shadowMapSize: this.tier.shadowMapSize });
    this.scene.add(this.lighting.group);

    this.environment = new StudioEnvironment(this.renderer);
    this.contactShadow = new ContactShadow(this.renderer, {
      resolution: this.tier.contactShadowSize,
      blurPasses: this.tier.contactShadowBlur,
    });
    this.scene.add(this.contactShadow.group);

    this.post = new PostFX(this.renderer, { tier: this.tier });

    // Writes depth and nothing else. See #setFadeMode.
    this.depthPrepassMaterial = new MeshBasicMaterial({ colorWrite: false });

    this.manager = new VehicleManager({
      renderer: this.renderer,
      onProgress: (id, ratio) => this.onProgress?.(id, ratio),
    });
    this.manager.setAnisotropy(this.tier.anisotropy);
    this.manager.setEnvironment(this.environment.generate());

    this.controller = new RotationController(canvas, { reducedMotion });

    this.governor = createPerformanceGovernor({
      onDowngrade: (average) => this.#downgrade(average),
    });

    this._onResize = this.resize.bind(this);
    window.addEventListener('resize', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    screen.orientation?.addEventListener?.('change', this._onResize);

    this._tick = this.#tick.bind(this);
    this.resize();
  }

  #createRenderer() {
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false, // handled by the multisampled target inside PostFX
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    // Tone mapping happens in the composite pass, since the scene is drawn into
    // a linear float target where the renderer would skip it anyway.
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // The hero is static most of the time, and the car alone is a quarter of a
    // million triangles — re-drawing the shadow map every frame for a vehicle
    // that has not moved is the single largest avoidable cost in the scene.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  #createScene() {
    this.scene = new Scene();
    this.scene.background = null;

    // Catches the directional shadow only — the page's own gradient shows
    // through everywhere else, so floor and backdrop never meet at a seam.
    this.floorMaterial = new ShadowMaterial({
      color: new Color('#070a0e'),
      opacity: 0.38,
      transparent: true,
      depthWrite: false,
    });
    this.floor = new Mesh(new PlaneGeometry(24, 24), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.renderOrder = -2;
    this.scene.add(this.floor);
  }

  #downgrade(average) {
    const next = stepDown(this.tier);
    if (next === this.tier) return;
    this.tier = next;
    this.lighting.setShadowMapSize(next.shadowMapSize);
    this.contactShadow.setResolution(next.contactShadowSize);
    this.contactShadow.blurPasses = next.contactShadowBlur;
    this.manager.setAnisotropy(next.anisotropy);
    this.post.setTier(next);
    this.resize();
    console.info(
      `[experience] ${average.toFixed(1)}ms frames — stepping quality down to "${next.name}"`,
    );
  }

  /**
   * How firmly the vehicle is planted, from 0 to 1.
   *
   * The cast shadow and the contact shadow have to move together: a shadow map
   * is drawn from depth, so a model faded to zero opacity still casts one, and
   * a project change would otherwise leave a silhouette hanging over an empty
   * floor. One handle keeps them honest.
   */
  get shadowStrength() {
    return this._shadowStrength ?? 1;
  }

  set shadowStrength(value) {
    this._shadowStrength = value;
    this.contactShadow.opacity = 0.9 * value;
    this.floorMaterial.opacity = 0.38 * value;
  }

  get pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.tier.maxPixelRatio);
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const ratio = this.pixelRatio;

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.post.setSize(width, height, ratio);
    this.rig.setViewport(width, height);

    // Stacked layouts put copy beneath the hero, so the vehicle is lifted into
    // the upper half rather than being shrunk to make room for it.
    this.rig.setFramingOffset(this.#isStacked() ? 0.155 : 0);

    if (this.activeEntry) this.#frameActive();
    this.#invalidateShadows();
  }

  /**
   * Whether the interface has collapsed into a single stacked column.
   *
   * Read from the layout itself rather than from the viewport, because the
   * breakpoint that stacks the rails is not the same question as "is this
   * portrait" — a 900x620 window stacks while still being landscape, and
   * framing the vehicle for a landscape composition there buries it under the
   * content sheet.
   */
  #isStacked() {
    const band = this.measureStage?.();
    if (band) return band.stacked === true;
    return window.innerHeight > window.innerWidth;
  }

  /** Marks both shadow systems as needing a re-draw on the next frame. */
  #invalidateShadows() {
    this.contactShadow.needsUpdate = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * How much of the frame's width the vehicle may claim.
   *
   * Derived from the live gap between the left rail and the right column,
   * mirrored around the centre of the frame so the vehicle stays centred on the
   * page rather than on the gap. Calibrated so the reference viewport resolves
   * to the framing the reference itself uses.
   */
  #horizontalFill(stacked) {
    if (stacked) return 0.9;

    const stage = this.measureStage?.();
    if (!stage || stage.stacked) return 0.72;

    const width = window.innerWidth;
    const centre = width / 2;
    const halfBand = Math.min(centre - stage.left, stage.right - centre);
    if (!(halfBand > 0)) return 0.72;

    // The worst-case rotational diagonal always exceeds the silhouette the eye
    // actually sees; 0.707 is that ratio, measured against the reference frame.
    // The 0.92 keeps a margin of air inside the band — without it the vehicle
    // packs the band wall-to-wall and buries the word behind it.
    const band = ((halfBand * 2) / width / 0.707) * 0.92;

    // Frames squarer than roughly 3:2 have proportionally less room across than
    // the reference does, so the vehicle gives a little more ground there. Above
    // 3:2 this term is inert and the reference framing is untouched.
    const aspect = width / window.innerHeight;
    const squareness = Math.min(1, Math.max(0.82, 0.82 + ((aspect - 1.2) / 0.3) * 0.18));

    return Math.min(0.78, Math.max(0.42, band * squareness));
  }

  #frameActive() {
    const { presentation } = this.activeVehicle;
    const stacked = this.#isStacked();
    // Very short frames have no room for the full presentation height once the
    // header and footer have taken their share.
    const compact = window.innerHeight < 520 ? 0.86 : 1;
    // Stacked layouts give the vehicle roughly the top half, sized so it clears
    // the content sheet below rather than being cropped by it.
    this.rig.frame(this.activeEntry, {
      fillV: presentation.fill * (stacked ? 0.53 : 1) * compact,
      fillH: this.#horizontalFill(stacked),
    });
  }

  /**
   * A colour-less clone of the vehicle, used to lay down depth before the
   * dissolve blends anything.
   *
   * Geometry is shared with the original, so this costs one extra depth-only
   * pass while a transition is running and no extra memory at all.
   */
  #depthPrepass(entry) {
    if (entry.depthPrepass) return entry.depthPrepass;

    const prepass = entry.frame.clone(true);
    prepass.name = `${entry.id}-depth-prepass`;
    prepass.traverse((node) => {
      if (!node.isMesh) return;
      node.material = this.depthPrepassMaterial;
      node.castShadow = false;
      node.receiveShadow = false;
      node.frustumCulled = false;
      // Layer 0 only, so the contact-shadow camera never draws it twice.
      node.layers.set(0);
    });

    entry.depthPrepass = prepass;
    return prepass;
  }

  /**
   * Puts a vehicle into (or out of) dissolve mode.
   *
   * Fading an opaque, self-overlapping mesh by turning on `transparent` alone
   * is what makes a model appear to break apart: with depth writes off you see
   * straight through the canopy to the seats behind it, and with them on you
   * get the far side blended underneath the near one. The fix is the standard
   * one — lay depth down first with a colour-less prepass, then blend only the
   * nearest surface.
   */
  #setFadeMode(entry, active) {
    if (!entry) return;

    for (const material of entry.materials) {
      if (material.transparent === active) continue;
      material.transparent = active;
      material.depthWrite = !active;
      // `transparent` is part of three's program cache key, so this is a real
      // program switch. Both variants are pre-compiled in load() so it is a
      // lookup rather than a stall.
      material.needsUpdate = true;
    }

    const prepass = this.#depthPrepass(entry);
    if (active) entry.pivot.add(prepass);
    else prepass.removeFromParent();

    if (!active) setEntryOpacity(entry, 1);
  }

  async load(vehicle) {
    const entry = await this.manager.load(vehicle);
    if (!entry.pivot.parent) {
      // Warm up with the model in the graph but scaled to nothing, so none of
      // this can flash on screen.
      entry.pivot.scale.setScalar(0);
      entry.pivot.visible = true;
      this.scene.add(entry.pivot);

      // Upload every texture up front. Without this the first frame a vehicle
      // appears in is drawn against three's 1x1 white placeholder — the model
      // shows up untextured and then pops.
      for (const texture of entry.textures) {
        this.renderer.initTexture(texture);
      }

      // Compile both program variants. `transparent` changes the program cache
      // key, so the first dissolve would otherwise compile a second shader
      // mid-transition and hitch exactly when the eye is on the model.
      this.#setFadeMode(entry, true);
      await this.renderer.compileAsync(this.scene, this.rig.camera, this.scene);
      this.#setFadeMode(entry, false);
      await this.renderer.compileAsync(this.scene, this.rig.camera, this.scene);

      entry.pivot.visible = false;
      entry.pivot.scale.setScalar(1);
    }
    return entry;
  }

  /** Loads the rest of the fleet quietly, once the hero is on screen. */
  preload(vehicles) {
    const queue = vehicles.filter((v) => !this.manager.isLoaded(v.id));
    const next = () => {
      const vehicle = queue.shift();
      if (!vehicle) return;
      this.load(vehicle)
        .then(() => this.onVehicleReady?.(vehicle.id))
        .catch((error) => console.warn(`[experience] preload failed: ${vehicle.id}`, error))
        .finally(() => {
          if (queue.length) {
            if ('requestIdleCallback' in window) requestIdleCallback(next, { timeout: 2500 });
            else setTimeout(next, 300);
          }
        });
    };
    next();
  }

  /** Places a vehicle in its presentation pose without any animation. */
  commit(vehicle, entry) {
    if (this.activeEntry && this.activeEntry !== entry) {
      this.activeEntry.pivot.visible = false;
      this.#setFadeMode(this.activeEntry, false);
    }

    this.activeVehicle = vehicle;
    this.activeEntry = entry;
    this.idleDrift = 0;
    this.controller.reset();

    entry.pivot.visible = true;
    entry.pivot.position.set(0, vehicle.presentation.lift * entry.size.y, 0);
    entry.pivot.scale.setScalar(1);
    entry.pivot.rotation.set(0, vehicle.presentation.yaw, 0);

    this.#frameActive();
    this.lighting.focus(entry.center, entry.sphere.radius);
    this.contactShadow.fit(entry);
    this.#invalidateShadows();
  }

  /**
   * Puts the current vehicle back into its presentation pose.
   *
   * Only reached when a switch is abandoned — a model that failed to load, say.
   * Without it the interface would be left holding a half-dissolved hero with
   * its controls disabled.
   */
  restore() {
    const entry = this.activeEntry;
    this.transitioning = false;
    this.controller.enabled = true;
    if (!entry) return;

    gsap.killTweensOf([entry.pivot.rotation, entry.pivot.scale, entry.pivot.position]);
    this.#setFadeMode(entry, false);
    entry.pivot.visible = true;
    entry.pivot.position.set(0, this.activeVehicle.presentation.lift * entry.size.y, 0);
    entry.pivot.scale.setScalar(1);
    entry.pivot.rotation.set(0, this.activeVehicle.presentation.yaw, 0);
    this.controller.reset();
    this.idleDrift = 0;
    this.shadowStrength = 1;
    this.post.exposure = 1;
    this.#invalidateShadows();
  }

  /** The outgoing half of a project change: drift back, shrink, dissolve. */
  createExitTimeline(direction = 1) {
    const entry = this.activeEntry;
    const timeline = gsap.timeline();
    if (!entry) return timeline;

    this.transitioning = true;
    this.controller.enabled = false;

    this.#setFadeMode(entry, true);

    timeline
      .to(entry.pivot.rotation, {
        y: `+=${0.55 * direction}`,
        duration: DUR.base,
        ease: EASE.in,
      }, 0)
      .to(entry.pivot.scale, { x: 0.82, y: 0.82, z: 0.82, duration: DUR.base, ease: EASE.in }, 0)
      .to(entry.pivot.position, { z: -0.55, duration: DUR.base, ease: EASE.in }, 0)
      .to(this, { shadowStrength: 0, duration: DUR.short, ease: EASE.in }, 0)
      .to(opacityProxy(entry), { value: 0, duration: DUR.short, ease: EASE.in }, 0.06);

    return timeline;
  }

  /** The incoming half: arrive from depth, settle into the presentation angle. */
  createEnterTimeline(direction = 1) {
    const entry = this.activeEntry;
    const timeline = gsap.timeline({
      onComplete: () => {
        this.#setFadeMode(entry, false);
        this.transitioning = false;
        this.controller.enabled = true;
      },
    });
    if (!entry) return timeline;

    const yaw = this.activeVehicle.presentation.yaw;
    this.#setFadeMode(entry, true);
    setEntryOpacity(entry, 0);

    entry.pivot.rotation.set(0, yaw - 0.62 * direction, 0);
    entry.pivot.scale.setScalar(0.84);
    entry.pivot.position.set(0, this.activeVehicle.presentation.lift * entry.size.y, 0.6);

    timeline
      .to(entry.pivot.rotation, { y: yaw, duration: DUR.hero, ease: EASE.outLong }, 0)
      .to(entry.pivot.scale, { x: 1, y: 1, z: 1, duration: DUR.hero, ease: EASE.outLong }, 0)
      .to(entry.pivot.position, { z: 0, duration: DUR.hero, ease: EASE.outLong }, 0)
      .to(opacityProxy(entry), { value: 1, duration: DUR.base, ease: EASE.outSoft }, 0)
      .to(this, { shadowStrength: 1, duration: DUR.long, ease: EASE.outSoft }, 0.1)
      // A brief lift in exposure so the light visibly finds the new vehicle.
      .fromTo(this.post, { exposure: 1.16 }, { exposure: 1, duration: DUR.long, ease: EASE.outSoft }, 0);

    return timeline;
  }

  /**
   * Cinematic mode: the interface steps away and the camera does a slow,
   * single pass around the vehicle. Uses the real model rather than falling
   * back to a video, because the model is the piece of work being shown.
   */
  setCinematic(active) {
    this.cinematic = active;
    this.controller.enabled = !active;

    const timeline = gsap.timeline();
    const entry = this.activeEntry;
    if (!entry) return timeline;

    if (active) {
      this._cinematicFrom = {
        elevation: this.rig.baseElevation,
        fill: this.rig.fillV,
        yaw: entry.pivot.rotation.y,
      };
      timeline
        .to(this.rig, { baseElevation: 0.2, duration: DUR.long, ease: EASE.inOut }, 0)
        // The bars take 22% of the height, so the camera gives that back.
        .to(this.rig, { distanceScale: 1.16, duration: DUR.long, ease: EASE.inOut }, 0)
        .to(entry.pivot.rotation, {
          y: `+=${Math.PI * 2}`,
          duration: this.reducedMotion ? 0.001 : 22,
          ease: 'none',
          repeat: -1,
        }, 0);
    } else {
      gsap.killTweensOf(entry.pivot.rotation);
      timeline
        .to(this.rig, { baseElevation: this._cinematicFrom?.elevation ?? 0.085, duration: DUR.base, ease: EASE.inOut }, 0)
        .to(this.rig, { distanceScale: 1, duration: DUR.base, ease: EASE.inOut }, 0)
        .to(entry.pivot.rotation, {
          y: this.activeVehicle.presentation.yaw,
          duration: DUR.long,
          ease: EASE.outLong,
          onComplete: () => {
            this.idleDrift = 0;
            this.controller.reset();
            this.controller.enabled = true;
          },
        }, 0);
    }

    return timeline;
  }

  setReducedMotion(reduced) {
    this.reducedMotion = reduced;
    this.controller.reducedMotion = reduced;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  #tick() {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += delta;
    const frameStart = performance.now();

    this.controller.update(delta);

    const entry = this.activeEntry;
    if (entry && !this.transitioning && !this.cinematic) {
      const { presentation } = this.activeVehicle;
      this.idleDrift += delta * IDLE_DRIFT_SPEED * this.controller.idleAmount;

      entry.pivot.rotation.y = presentation.yaw + this.controller.yaw + this.idleDrift;

      // A breath, not a bounce: well under one percent of the vehicle's height.
      const bob = this.reducedMotion
        ? 0
        : Math.sin(this.elapsed * IDLE_BOB_SPEED) * entry.size.y * IDLE_BOB_AMOUNT * this.controller.idleAmount;
      entry.pivot.position.y = presentation.lift * entry.size.y + bob;

      // Both shadows are re-drawn only once the vehicle has moved far enough for
      // the difference to be visible. Idle drift alone is well under this, so a
      // resting hero costs one pass a frame instead of three.
      const baked = this._bakedPose;
      const movedEnough =
        !baked ||
        Math.abs(entry.pivot.rotation.y - baked.yaw) > 0.006 ||
        Math.abs(entry.pivot.position.y - baked.y) > entry.size.y * 0.0025;

      if (movedEnough) {
        this._bakedPose = { yaw: entry.pivot.rotation.y, y: entry.pivot.position.y };
        this.#invalidateShadows();
      }
    } else if (entry) {
      // Transitions and the film view move the vehicle every frame.
      this._bakedPose = null;
      this.#invalidateShadows();
    }

    this.rig.update(this.controller.elevation);
    this.contactShadow.update(this.scene, { interval: 2 });
    this.post.render(this.scene, this.rig.camera);

    this.governor.sample(performance.now() - frameStart);
  }

  dispose() {
    this.stop();
    this.governor.stop();
    gsap.killTweensOf(this);
    gsap.killTweensOf(this.rig);
    gsap.killTweensOf(this.post);
    gsap.killTweensOf(this.contactShadow);

    window.removeEventListener('resize', this._onResize);
    window.visualViewport?.removeEventListener('resize', this._onResize);
    screen.orientation?.removeEventListener?.('change', this._onResize);

    this.controller.dispose();
    this.depthPrepassMaterial.dispose();
    this.manager.disposeAll();
    this.contactShadow.dispose();
    this.lighting.dispose();
    this.environment.dispose();
    this.post.dispose();
    this.floor.geometry.dispose();
    this.floorMaterial.dispose();
    this.scene.clear();
    this.renderer.dispose();
  }
}

/* --- material helpers ------------------------------------------------------ */

function setEntryOpacity(entry, value) {
  if (!entry) return;
  for (const material of entry.materials) material.opacity = value;
}

/**
 * GSAP needs a plain object to tween, but the value has to land on every
 * material in the model — this bridges the two without allocating per frame.
 */
function opacityProxy(entry) {
  if (!entry._opacityProxy) {
    entry._opacityProxy = { _value: 1 };
    Object.defineProperty(entry._opacityProxy, 'value', {
      get: () => entry._opacityProxy._value,
      set: (next) => {
        entry._opacityProxy._value = next;
        setEntryOpacity(entry, next);
      },
    });
  }
  entry._opacityProxy._value = entry.materials[0]?.opacity ?? 1;
  return entry._opacityProxy;
}
