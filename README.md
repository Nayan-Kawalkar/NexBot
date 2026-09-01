# Phenomenon — projects

A three-vehicle showcase built as a single immersive screen: a dark studio, one
oversized word, and a real-time 3D vehicle rendered in front of it.

Three.js draws the vehicle into a **transparent** canvas that sits above the
page's typography layer, so the model genuinely occludes the word behind it and
its shadow genuinely falls across the letterforms. Nothing about the layering is
faked, and nothing about the vehicle is a pre-rendered image.

```
npm install
npm run optimize   # source GLBs  -> public/models   (run once; output is committed)
npm run media      # source PNGs  -> public/media    (run once; output is committed)
npm run dev
```

---

## The assets

Three Tripo exports were supplied. They render beautifully and are entirely
unsuited to the web as delivered — 8K albedo atlases and, in the car's case,
1.9 million triangles.

| Project | Source | Shipped | Triangles | Notes |
|---|---:|---:|---:|---|
| `pal` — standing four-wheel platform | 13.16 MB | **1.23 MB** | 45,290 | geometry untouched |
| `sola` — seated three-wheeler | 12.20 MB | **1.33 MB** | 48,676 | geometry untouched |
| `halo` — canopy micro-car | 57.66 MB | **4.35 MB** | 249,730 | decimated from 1,921,125; 4K albedo |

**83 MB → 6.9 MB**, all three preloaded, with no visible loss.

Two findings drove the pipeline, both from measuring rather than assuming:

- **The 8K atlases are upscales.** Sampled at 1:1 they are large flat regions of
  soft grey — almost no high-frequency content. 2048 loses nothing on screen and
  turns a 10 MB JPEG into a 0.36 MB WebP. GPU residency drops from 268 MB per
  texture to 16 MB.
- **Decimating the car costs nothing visible.** Rendered side by side against
  untouched geometry, ~250k is indistinguishable. Removing the base-colour map
  entirely leaves a perfectly smooth body, which is what proves the creasing on
  the canopy lives in the bake rather than in the mesh.
- **The car is the one atlas that needs 4K.** Its UV islands are packed tightly
  and the generator painted specular streaks into the albedo; at 2048 the mip
  chain smears island edges together and that creasing reads as crumpled foil.
  4K is where the bodywork settles. The two scooters are clean at 2048.

The filenames also lie: `futuristic scooter 3d model (1).glb` is the standing
platform, not the seated trike. `scripts/optimize-models.mjs` maps them by what
they actually are.

Geometry ships as `EXT_meshopt_compression` — three bundles the decoder, it
keeps every attribute, and it decodes far faster than Draco on mobile.

The preview cards use the supplied studio renders rather than unrelated stock:
`scripts/build-media.mjs` flood-fills the white sweep away from the frame border
so the vehicle survives untouched, and re-authors the contact shadow as a black
veil — on a light sweep a grey shadow darkens, but composited onto the dark card
that same grey would glow.

---

## Architecture

```
src/
├─ App.jsx                 project state, and the master transition timeline
├─ data/vehicles.js        copy, framing and presentation, per project
├─ components/             the interface — no component knows which vehicle it draws
├─ lib/
│  ├─ motion.js            one easing and duration vocabulary for DOM and WebGL
│  └─ transitions.js       the interface half of a project change
└─ three/
   ├─ Experience.js        renderer, loop, lifecycle — entirely outside React
   ├─ CameraRig.js         product-photography framing, derived from measured bounds
   ├─ VehicleManager.js    load, normalise, condition, cache
   ├─ StudioEnvironment.js a hand-built lighting studio, pre-filtered to an env map
   ├─ Lighting.js          key / fill / kicker, and the only cast shadow
   ├─ ContactShadow.js     the vehicle rendered from underneath, blurred, projected
   ├─ PostFX.js            an alpha-preserving bloom and tone-mapping chain
   ├─ RotationController.js turntable drag with momentum
   └─ quality.js           device tiering, and a governor that steps down on demand
```

React owns the interface; `Experience` owns the frame. The only traffic between
them is a project index going in and a few lifecycle callbacks coming out — so
nothing in the 3D layer ever triggers a re-render, and no re-render ever costs a
frame.

---

## Decisions worth knowing about

**A custom post chain, not `EffectComposer`.** three's composer assumes it owns
an opaque frame. This one carries alpha end to end, which is what lets the canvas
float over the page. Tone mapping (Khronos PBR Neutral, built for product
visualisation) runs in the final pass, because three skips tone mapping entirely
when a scene renders into a render target.

**A built studio, not an HDRI.** A stock environment announces itself the moment
the vehicle turns — you read a room in the paint. `StudioEnvironment` models what
an automotive shoot actually looks like: one big soft key, a broad low fill, a
long overhead strip that draws the highlight down the body, and a warm kicker
behind the shoulder. Because it is geometry, the reflections are art-directed
rather than inherited.

**Materials are conditioned, not replaced.** Three problems, all inherited from
how the assets were generated:

- The scooters carry a single baked albedo with a flat metal 0 / roughness 0.5
  default, so their light strips have no emissive channel at all. Measuring the
  atlases showed the strips are the top ~1% of texels; a shader patch lifts only
  those into emission, and bloom has something true to catch.
- The car's roughness map bottoms out near 0.004, turning large panels into
  mirrors. Its roughness is remapped — not clamped — so the authored variation
  survives but nothing reaches a perfect mirror.
- **The car's emissive threshold is far tighter than the scooters'** (0.97 rather
  than 0.6). Its bake has specular highlights painted into the albedo at roughly
  0.9–0.97, and the looser threshold lifted those streaks into emission — which
  lit up, and bloomed, the exact artefact the roughness floor exists to play
  down. Only the genuine light strips reach 0.97.

**Framing is measured, never hard-coded.** Every model is scaled on its longest
authored axis, re-centred on its own footprint and dropped onto the floor,
whatever the exporter left behind. The camera then fits it using extents that are
invariant under yaw, so the vehicle holds its size as it spins instead of
breathing. How much width it may claim comes from the live gap between the left
rail and the right column — which is why it can never grow into the copy at any
viewport, and why the 3D layer asks the interface whether the rails are still
beside the hero rather than inferring it from the viewport.

**Stacking is decided by aspect, not width alone.** A 900×620 window is narrow
enough to hit the mobile breakpoint and wide enough to host the side-rail
composition; stacking it would bury the vehicle under the content sheet. The
layout collapses below 13/10 and keeps its rails above it.

**Fading an opaque mesh needs a depth prepass.** Turning on `transparent` alone
is what makes a single-mesh vehicle appear to break apart mid-transition: with
depth writes off you look straight through the canopy to the seats behind it,
and with them on the far side blends in underneath the near one. Each vehicle
therefore gets a colour-less clone that lays down depth first, so only the
nearest surface ever blends. Geometry is shared, so it costs one depth-only pass
while a transition runs and no extra memory at all.

**Both program variants are compiled before a vehicle is ever shown.**
`transparent` is part of three's program cache key, so the first dissolve would
otherwise compile a second shader mid-transition — a hitch landing exactly when
the eye is on the model. `load()` compiles both and calls `initTexture` on every
map, so a vehicle's first visible frame is never drawn against three's 1×1 white
placeholder.

**Two shadows, one handle.** A shadow map alone leaves the vehicle pasted onto
the floor. `ContactShadow` renders it from directly underneath, weights each
fragment by its distance to the ground and projects the blurred result back down,
so the wheels get a contact patch. Both shadows move together through a single
`shadowStrength` — a shadow map is drawn from depth, so a model faded to zero
opacity still casts one, and a project change would otherwise leave a silhouette
hanging over an empty floor.

**Shadows are re-drawn only when the vehicle has actually moved.** Idle drift
falls under the threshold, so a resting hero costs one pass a frame instead of
three — worth roughly 500k triangles a frame on the car.

**One master timeline per project change.** The vehicle, the word behind it and
every line of copy are children of the same clock. The interface swaps at the
midpoint under `flushSync`, so the entrance tween never animates stale text.

---

## Verification

`tools/capture.mjs` boots Vite in-process, drives a real Chrome over it and
writes a screenshot per entry in `tools/shots.json`, asserting no horizontal
overflow, no page errors and no failed requests along the way.

```
node tools/capture.mjs                 # the full matrix
node tools/perf.mjs                    # draw calls, triangles, resource retention
node tools/timeline.mjs halo           # frames at fixed offsets after load
TIME_SCALE=0.1 node tools/burst.mjs pal 3   # a project change, frame by frame
```

The last two exist because a settled screenshot cannot show a transition. Both
lean on `window.__experience` and `window.__gsap`, which are exposed in
development only; `TIME_SCALE` slows every timeline so headless screenshot
latency cannot outrun the moment being inspected.

`perf.mjs` also cycles every project three times and reports whether geometry or
texture counts grow — they do not, past the one-time GPU residency of the third
model.

---

## Known constraints

- The canopy of `halo` is opaque. The source asset bakes the glazing as solid
  geometry; the model is treated as the source of truth rather than being
  re-authored.
- Secondary copy sits at ~3.7:1 rather than the 4.5:1 WCAG asks for. The
  reference sets it far darker still; this is a deliberate midpoint between the
  art direction and legibility, and every value a user needs is also exposed to
  assistive technology through labels.
