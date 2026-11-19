export const floorVert = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = vec3(0.0, 1.0, 0.0);
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

    vec3 color = mix(uBg, uGrid, line * fade);

    // Brouillard appliqué au sol
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
