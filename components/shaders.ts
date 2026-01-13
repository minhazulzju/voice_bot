export const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

uniform float uTime;
uniform float uAudioIntensity;
uniform float uPhase; // 0 = idle, 1 = listening, 2 = speaking

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  
  vec3 pos = position;
  
  // Subtle audio-reactive displacement kept small to avoid heavy occlusion
  float displacement = 0.0;
  float breathe = sin(uTime * 0.5) * 0.04;

  // Subtle phase-independent ripple
  float ripple = sin(pos.y * 8.0 + uTime * 1.6) * cos(pos.x * 8.0 + uTime * 1.6);
  displacement = ripple * uAudioIntensity * 0.12;

  pos += normal * (displacement + breathe);

  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectedPosition = projectionMatrix * viewPosition;

  gl_Position = projectedPosition;
}
`;

export const fragmentShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;

uniform float uTime;
uniform float uAudioIntensity;
uniform float uPhase;
uniform float uBrightness;

// Simplex noise function (simplified version)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m;
  m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  // Fresnel effect for edge glow
  vec3 viewDirection = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - dot(viewDirection, vNormal), 2.0);

  // Radial distance from center (for core/edge effects)
  float r = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.0, 0.18, 0.18 - r);
  float mid = smoothstep(0.15, 0.45, r);
  float edge = smoothstep(0.6, 1.0, r);

  // Color definitions
  vec3 hotPink = vec3(1.0, 0.0, 0.6);        // #FF0099
  vec3 electricBlue = vec3(0.0, 0.4, 1.0);   // #0066FF
  vec3 brightTeal = vec3(0.0, 1.0, 0.8);     // #00FFD0
  vec3 deepPurple = vec3(0.2, 0.0, 0.4);     // #330066

  // Hot Pink and Electric Blue swirl core
  float swirl = 0.5 + 0.5 * sin(uTime * 1.2 + vUv.x * 8.0 + vUv.y * 8.0);
  vec3 coreGlow = mix(hotPink, electricBlue, swirl) * core * 1.2;

  // Bright Teal and Hot Pink midtones
  float band = 0.5 + 0.5 * cos(uTime * 1.5 + vUv.y * 10.0 - vUv.x * 10.0);
  vec3 vibrant = mix(brightTeal, hotPink, band);
  vibrant = mix(vibrant, electricBlue, 0.3 * (1.0 - abs(vUv.x - 0.5)));
  vibrant *= (1.0 - edge) * mid;

  // Deep Purple at the edge
  float shadowShift = 0.5 + 0.5 * cos(uTime * 0.7 + vUv.x * 4.0);
  vec3 shadow = mix(deepPurple, deepPurple * 0.7, vUv.y + 0.2 * shadowShift);
  shadow *= edge * 1.3;

  // Combine all layers
  vec3 baseColor = coreGlow + vibrant + shadow;

  // Add fresnel rim for extra neon pop, animated color
  vec3 rimColor = mix(electricBlue, brightTeal, 0.5 + 0.5 * sin(uTime + vUv.y * 6.0));
  baseColor += fresnel * rimColor * 0.7 * (1.0 - r);

  // Audio-reactive pulse and glow
  float pulse = 0.22 * (sin(uTime * 2.0) * 0.5 + 0.5) * (0.5 + uAudioIntensity * 0.5);
  baseColor = mix(baseColor, baseColor * (1.0 + pulse), 0.8);

  // Subtle chromatic aberration for digital feel
  float aberr = 0.01 * sin(uTime * 2.5 + vUv.x * 12.0);
  baseColor.r += aberr;
  baseColor.b -= aberr * 0.7;

  // Tone-mapping / luminance cap
  float lum = dot(baseColor, vec3(0.2126, 0.7152, 0.0722));
  float maxLum = 2.2 * max(uBrightness, 0.8);
  if (lum > maxLum) {
    baseColor *= (maxLum / max(lum, 1e-6));
  }

  gl_FragColor = vec4(baseColor, 1.0);
}
`;
