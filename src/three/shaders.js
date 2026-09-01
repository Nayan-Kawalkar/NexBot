/**
 * Shader sources for the studio render chain.
 *
 * The canvas is composited over the page rather than painting its own
 * background, so every pass here has to carry alpha through deliberately —
 * that is what lets the vehicle occlude the oversized word behind it while its
 * light strips still bleed a little glow onto the page.
 */

export const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Isolates only genuinely hot pixels — the baked LED strips and wheel rings. */
export const BRIGHT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(tDiffuse, vUv);
    float luma = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Soft knee so the glow ramps in instead of switching on at a hard edge.
    float soft = clamp(luma - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 0.00001);
    float contribution = max(soft, luma - uThreshold) / max(luma, 0.00001);
    gl_FragColor = vec4(texel.rgb * contribution, texel.a);
  }
`;

/** Separable nine-tap gaussian; `uDirection` carries the texel step. */
export const BLUR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec4 sum = texture2D(tDiffuse, vUv) * 0.227027;
    vec2 o1 = uDirection * 1.3846153846;
    vec2 o2 = uDirection * 3.2307692308;
    sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
    sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
    sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
    gl_FragColor = sum;
  }
`;

/**
 * Final pass: bloom, tone mapping and transfer, in that order.
 *
 * Tone mapping is done here rather than by the renderer because the scene is
 * drawn into a linear float target — three only tone maps when it renders
 * straight to the canvas. The operator is Khronos PBR Neutral, which was
 * designed for product visualisation: it rolls off highlights without pulling
 * saturation out of the paint the way a filmic curve does.
 */
export const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloomNear;
  uniform sampler2D tBloomFar;
  uniform float uBloomStrength;
  uniform float uBloomSpill;
  uniform float uExposure;
  varying vec2 vUv;

  vec3 pbrNeutralToneMapping(vec3 color) {
    const float startCompression = 0.8 - 0.04;
    const float desaturation = 0.15;

    float x = min(color.r, min(color.g, color.b));
    float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
    color -= offset;

    float peak = max(color.r, max(color.g, color.b));
    if (peak < startCompression) return color;

    float d = 1.0 - startCompression;
    float newPeak = 1.0 - d * d / (peak + d - startCompression);
    color *= newPeak / peak;

    float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
    return mix(color, vec3(newPeak), g);
  }

  vec3 linearToSRGB(vec3 value) {
    return mix(
      pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
      value * 12.92,
      vec3(lessThanEqual(value, vec3(0.0031308)))
    );
  }

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec3 bloom = texture2D(tBloomNear, vUv).rgb * 0.62
               + texture2D(tBloomFar, vUv).rgb * 0.38;
    bloom *= uBloomStrength;

    vec3 color = (base.rgb + bloom) * uExposure;
    color = pbrNeutralToneMapping(color);
    color = linearToSRGB(clamp(color, 0.0, 1.0));

    // Glow is allowed to spill past the silhouette so light strips read as
    // light against the page, not as a hard-edged cut-out.
    float bloomLuma = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
    float alpha = clamp(base.a + bloomLuma * uBloomSpill, 0.0, 1.0);

    gl_FragColor = vec4(color, alpha);
  }
`;

/** Backdrop for the off-screen environment scene that feeds the PMREM. */
export const ENV_GRADIENT_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  varying vec3 vWorld;

  void main() {
    float h = normalize(vWorld).y;
    vec3 color = h > 0.0
      ? mix(uHorizon, uTop, pow(h, 0.65))
      : mix(uHorizon, uBottom, pow(-h, 0.55));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export const ENV_GRADIENT_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Depth-to-darkness material used to bake the contact shadow. Geometry closest
 * to the floor writes the strongest value; MAX blending keeps overlapping
 * surfaces from stacking into a black hole.
 */
export const CONTACT_DEPTH_VERT = /* glsl */ `
  uniform float uFar;
  varying float vDepth;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vDepth = clamp(-mvPosition.z / uFar, 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const CONTACT_DEPTH_FRAG = /* glsl */ `
  precision highp float;
  uniform float uFalloff;
  varying float vDepth;
  void main() {
    float value = pow(1.0 - vDepth, uFalloff);
    gl_FragColor = vec4(vec3(value), value);
  }
`;

/** Projects the baked contact shadow onto the ground plane. */
export const CONTACT_PLANE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tShadow;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float shadow = texture2D(tShadow, vUv).r;
    // Fade the very edge of the plane so the shadow never shows its own border.
    vec2 d = abs(vUv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.72, 1.0, max(d.x, d.y));
    gl_FragColor = vec4(uColor, shadow * uOpacity * edge);
  }
`;

export const CONTACT_PLANE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
