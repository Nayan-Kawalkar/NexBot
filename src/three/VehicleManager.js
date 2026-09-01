import {
  Box3,
  Group,
  LoadingManager,
  Sphere,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { VEHICLE_LAYER } from './ContactShadow.js';

/**
 * Loads, normalises, caches and stages the vehicles.
 *
 * The three GLBs were authored independently, so nothing about them can be
 * assumed to agree: different heights, different footprints, different facing.
 * Every model therefore goes through the same measured pipeline — measure,
 * scale to a shared presentation size, re-centre onto its own footprint, drop
 * onto the floor — and only then does the per-project yaw refinement apply.
 *
 * Node graph per vehicle:
 *
 *   pivot      turntable yaw, idle motion, transition transforms
 *    └ frame   normalisation: uniform scale + centring offset
 *       └ gltf the authored scene, untouched
 */
export default class VehicleManager {
  constructor({ renderer, onProgress } = {}) {
    this.renderer = renderer;
    this.onProgress = onProgress;
    this.cache = new Map();
    this.inflight = new Map();

    this.manager = new LoadingManager();
    this.loader = new GLTFLoader(this.manager);
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    this.maxAnisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1;
    this.environment = null;
    this.anisotropy = 8;
  }

  setEnvironment(texture) {
    this.environment = texture;
    for (const entry of this.cache.values()) {
      this.#applyEnvironment(entry);
    }
  }

  setAnisotropy(value) {
    this.anisotropy = value;
    for (const entry of this.cache.values()) {
      for (const texture of entry.textures) {
        texture.anisotropy = Math.min(value, this.maxAnisotropy);
        texture.needsUpdate = true;
      }
    }
  }

  #applyEnvironment(entry) {
    for (const material of entry.materials) {
      material.envMap = this.environment;
      material.envMapIntensity = entry.envMapIntensity;
      material.needsUpdate = true;
    }
  }

  /**
   * Conditions the authored materials for this studio without rewriting them.
   *
   * Two problems to solve, both inherited from how these assets were generated
   * rather than from any design intent:
   *
   *  - the scooters arrive with a flat metal 0 / roughness 0.5 default and a
   *    single baked base colour, so their light strips have no emissive channel
   *    at all even though the bake clearly draws them;
   *  - the car's roughness map bottoms out near zero, which turns large panels
   *    into mirrors and makes every wobble in the generated mesh read as creased
   *    foil — the studio render it came from shows a calm semi-gloss body.
   *
   * Both are corrected with a small shader patch rather than by replacing the
   * materials, so everything the asset actually authored survives.
   */
  #conditionMaterials(entry, config) {
    const { emissive, roughnessFloor } = config;

    for (const material of entry.materials) {
      material.envMapIntensity = entry.envMapIntensity;

      if (config.roughness != null && !material.roughnessMap) {
        material.roughness = config.roughness;
      }
      if (config.metalness != null && !material.metalnessMap) {
        material.metalness = config.metalness;
      }
      if (material.normalScale && config.normalScale != null) {
        material.normalScale.multiplyScalar(config.normalScale);
      }

      const wantsEmissive = emissive && material.map && !material.emissiveMap;
      const wantsRoughnessFloor = roughnessFloor != null;
      if (!wantsEmissive && !wantsRoughnessFloor) continue;

      const uniforms = {};
      const declarations = [];
      let key = '';

      if (wantsEmissive) {
        Object.assign(uniforms, {
          uEmitThreshold: { value: emissive.threshold },
          uEmitSoftness: { value: emissive.softness },
          uEmitStrength: { value: emissive.strength },
        });
        declarations.push(
          'uniform float uEmitThreshold;',
          'uniform float uEmitSoftness;',
          'uniform float uEmitStrength;',
        );
        key += `e${emissive.threshold}-${emissive.strength}`;
      }

      if (wantsRoughnessFloor) {
        uniforms.uRoughnessFloor = { value: roughnessFloor };
        declarations.push('uniform float uRoughnessFloor;');
        key += `r${roughnessFloor}`;
      }

      material.userData.shaderUniforms = uniforms;

      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        let fragment = shader.fragmentShader.replace(
          'void main() {',
          `${declarations.join('\n')}\nvoid main() {`,
        );

        if (wantsEmissive) {
          fragment = fragment.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             // The light strips are baked into the albedo as near-white pixels.
             // Lifting only those into emission gives bloom something true to
             // catch while the surrounding bodywork stays matte.
             float emitLuma = dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
             float emitMask = smoothstep( uEmitThreshold, uEmitThreshold + uEmitSoftness, emitLuma );
             totalEmissiveRadiance += diffuseColor.rgb * emitMask * uEmitStrength;`,
          );
        }

        if (wantsRoughnessFloor) {
          fragment = fragment.replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
             // Remap rather than clamp: the authored variation is preserved,
             // it just no longer reaches a perfect mirror.
             roughnessFactor = mix( uRoughnessFloor, 1.0, roughnessFactor );`,
          );
        }

        shader.fragmentShader = fragment;
      };

      material.customProgramCacheKey = () => key;
      material.needsUpdate = true;
    }
  }

  /**
   * Measures the authored scene and builds the normalised node graph.
   * Returns everything downstream systems need to frame, light and shadow it.
   */
  #normalise(gltf, vehicle) {
    const source = gltf.scene;
    source.updateMatrixWorld(true);

    const rawBox = new Box3().setFromObject(source);
    const rawSize = rawBox.getSize(new Vector3());
    const rawCenter = rawBox.getCenter(new Vector3());

    // Normalise on the longest authored axis so all three arrive at a shared
    // presentation size before framing gets a say.
    const scale = 1 / Math.max(rawSize.x, rawSize.y, rawSize.z);

    const frame = new Group();
    frame.name = `${vehicle.id}-frame`;
    frame.scale.setScalar(scale);
    // Centre horizontally on the footprint, and sit the lowest geometry on y=0
    // regardless of where the exporter happened to leave the origin.
    frame.position.set(
      -rawCenter.x * scale,
      -rawBox.min.y * scale,
      -rawCenter.z * scale,
    );
    frame.add(source);

    const pivot = new Group();
    pivot.name = `${vehicle.id}-pivot`;
    pivot.add(frame);
    pivot.updateMatrixWorld(true);

    const box = new Box3().setFromObject(pivot);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const sphere = box.getBoundingSphere(new Sphere());

    return { pivot, frame, box, size, center, sphere, groundY: box.min.y };
  }

  #collect(root) {
    const materials = new Set();
    const textures = new Set();
    const geometries = new Set();

    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      // Layer 1 lets the contact-shadow camera see the vehicle and nothing else.
      node.layers.enable(VEHICLE_LAYER);
      geometries.add(node.geometry);

      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        for (const key of [
          'map', 'normalMap', 'roughnessMap', 'metalnessMap',
          'aoMap', 'emissiveMap', 'alphaMap', 'clearcoatMap',
        ]) {
          if (material[key]) textures.add(material[key]);
        }
      }
    });

    return { materials: [...materials], textures: [...textures], geometries: [...geometries] };
  }

  /** Loads a vehicle, or returns the cached instance. */
  load(vehicle) {
    if (this.cache.has(vehicle.id)) return Promise.resolve(this.cache.get(vehicle.id));
    if (this.inflight.has(vehicle.id)) return this.inflight.get(vehicle.id);

    const promise = new Promise((resolve, reject) => {
      this.loader.load(
        vehicle.model,
        (gltf) => resolve(gltf),
        (event) => {
          if (event.lengthComputable) {
            this.onProgress?.(vehicle.id, event.loaded / event.total);
          }
        },
        reject,
      );
    })
      .then((gltf) => {
        const normalised = this.#normalise(gltf, vehicle);
        const collected = this.#collect(normalised.pivot);

        const entry = {
          id: vehicle.id,
          vehicle,
          ...normalised,
          ...collected,
          envMapIntensity: MATERIAL_CONFIG[vehicle.id]?.envMapIntensity ?? 1,
        };

        this.#conditionMaterials(entry, MATERIAL_CONFIG[vehicle.id] ?? {});
        this.#applyEnvironment(entry);

        for (const texture of entry.textures) {
          texture.anisotropy = Math.min(this.anisotropy, this.maxAnisotropy);
        }

        // Compile now so the first frame after a switch does not stall on
        // shader compilation — the single most visible hitch in a 3D swap.
        entry.pivot.visible = false;

        this.cache.set(vehicle.id, entry);
        this.inflight.delete(vehicle.id);
        return entry;
      })
      .catch((error) => {
        this.inflight.delete(vehicle.id);
        throw error;
      });

    this.inflight.set(vehicle.id, promise);
    return promise;
  }

  get(id) {
    return this.cache.get(id);
  }

  isLoaded(id) {
    return this.cache.has(id);
  }

  dispose(id) {
    const entry = this.cache.get(id);
    if (!entry) return;
    entry.pivot.removeFromParent();
    for (const geometry of entry.geometries) geometry.dispose();
    for (const texture of entry.textures) texture.dispose();
    for (const material of entry.materials) material.dispose();
    this.cache.delete(id);
  }

  disposeAll() {
    for (const id of [...this.cache.keys()]) this.dispose(id);
    this.inflight.clear();
  }
}

/**
 * Per-model material conditioning.
 *
 * `halo` ships real roughness/metalness and normal maps, so it is left alone
 * beyond an environment weighting. The two scooters carry only a baked albedo
 * and need the emissive lift to get their light strips back.
 */
const MATERIAL_CONFIG = {
  // Thresholds are set against `diffuseColor`, which is the sampled albedo
  // already multiplied by the exporter's 0.8 base-colour factor. Measured off
  // the atlases: the light strips are the top ~1% of texels, at ~0.62 and up.
  pal: {
    envMapIntensity: 0.92,
    roughness: 0.58,
    metalness: 0.06,
    emissive: { threshold: 0.6, softness: 0.14, strength: 2.4 },
  },
  sola: {
    envMapIntensity: 0.95,
    roughness: 0.56,
    metalness: 0.06,
    emissive: { threshold: 0.6, softness: 0.14, strength: 2.4 },
  },
  halo: {
    envMapIntensity: 1.05,
    // Its roughness map dips to ~0.004 in places, which turns large panels into
    // mirrors and makes the generator's baked-in creasing read as crumpled
    // foil. A high floor is what settles the bodywork down.
    roughnessFloor: 0.5,
    // Deliberately far tighter than the scooters'. This bake has specular
    // highlights painted into the albedo at ~0.9-0.97, and a looser threshold
    // lifts those streaks into emission — which lights up the exact artefact we
    // are trying to play down. Only the genuine light strips reach 0.97.
    emissive: { threshold: 0.97, softness: 0.03, strength: 1.6 },
  },
};
