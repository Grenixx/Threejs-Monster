export const floorVert = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float disp = noise(wp.xz * 0.8) * 3.0;
      wp.y += disp;
      vWorldPos = wp.xyz;
      // Normale approximée : gradient du noise sur XZ (même fréquence que disp)
      float eps = 0.02;
      float nx = noise((wp.xz + vec2(eps, 0.0)) * 0.8) * 3.0;
      float ny = noise((wp.xz + vec2(-eps, 0.0)) * 0.8) * 3.0;
      float nz = noise((wp.xz + vec2(0.0, eps)) * 0.8) * 3.0;
      float nw = noise((wp.xz + vec2(0.0, -eps)) * 0.8) * 3.0;
      vNormal = normalize(vec3(nx - ny, 2.0 * eps, nz - nw));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

export const floorFrag = /* glsl */`
  precision mediump float;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  uniform vec3 uGrid, uBg, uFogColor;
  uniform float uTime, uFogDensity;

  float grid(vec2 c) {
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 coord = vWorldPos.xz;
    float line = max(grid(coord), grid(coord * 0.25) * 0.6);
    float dist = length(vWorldPos.xz);
    float fade = smoothstep(25.0, 1.0, dist);

    // Coloration selon la hauteur pour bien voir les collines
    float height = smoothstep(0.0, 1.0, vWorldPos.y * 2.0 + 0.5);
    vec3 color = mix(uBg, uGrid, line * fade);
    color = mix(color, uBg + vec3(0.1, 0.15, 0.2), height * 0.6);

    // Brouillard appliqué au sol (s'adapte à la couleur du monstre)
    float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, fogFactor);

    // Reflet subtil selon la normale
    float rim = pow(0.6 - dot(vNormal, vec3(0.0, 1.0, 0.0)), 3.0);
    color += vec3(0.05, 0.08, 0.12) * rim * 0.5;

    gl_FragColor = vec4(color, 1.0);
  }
`;

export const skyVert = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const skyFrag = /* glsl */`
  varying vec3 vWorldPos;
  uniform vec3 uColorTop;
  uniform vec3 uColorBottom;

  void main() {
    float h = normalize(vWorldPos).y;
    vec3 color = mix(uColorBottom, uColorTop, smoothstep(0.0, 0.6, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;
