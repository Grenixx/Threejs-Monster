// ============================================================
// SOL — shader simple avec grille
// ============================================================
export const floorVert = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const floorFrag = /* glsl */`
  precision mediump float;
  varying vec3 vWorldPos;
  uniform float uTime;
  uniform vec3 uGrid, uBg;

  float grid(vec2 c) {
    vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    vec2 coord = vWorldPos.xz;
    float line = max(grid(coord), grid(coord * 0.25) * 0.6);
    float dist = length(vWorldPos.xz);
    float fade = smoothstep(25.0, 1.0, dist);

    vec3 color = uBg;
    color = mix(color, uGrid, line * fade);
    gl_FragColor = vec4(color, 1.0);
  }
`;
// ============================================================
// BRUIT 3D — value noise pour le displacement
// ============================================================
export const noise3D = /* glsl */`
  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
`;
// ============================================================
// SPHÈRE DÉPLACÉE — shaders custom
// ============================================================
export const sphereVert = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uNoiseFreq;
  uniform float uNoiseAmp;
  uniform float uSpeed;
  uniform float uRadius;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
          mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
          mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  // Déplacement : 2 octaves de bruit pour plus de détail
  vec3 displace(vec3 p) {
    vec3 n = normalize(p);
    float t = uTime * uSpeed;
    float n1 = noise3(p * uNoiseFreq + vec3(t));
    float n2 = noise3(p * uNoiseFreq * 2.1 + vec3(t * 1.3)) * 0.5;
    return p + n * (n1 + n2) * uNoiseAmp;
  }

  void main() {
    vec3 pos = position;
    vec3 n = normalize(normal);

    vec3 displaced = displace(pos);

    // Normale recalculée par différences finies (2 échantillons voisins)
    vec3 tangent = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0)));
    vec3 bitangent = normalize(cross(n, tangent));
    float eps = 0.02;

    vec3 p1 = normalize(pos + tangent * eps) * uRadius;
    vec3 p2 = normalize(pos + bitangent * eps) * uRadius;

    vec3 d1 = displace(p1);
    vec3 d2 = displace(p2);

    vec3 newNormal = normalize(cross(d1 - displaced, d2 - displaced));

    vNormal = normalize(normalMatrix * newNormal);
    vWorldPos = (modelMatrix * vec4(displaced, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

export const sphereFrag = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform vec3 uLightPos;
  uniform vec3 uCameraPos;

  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 L = normalize(uLightPos - vWorldPos);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 H = normalize(L + V);

    float diff = max(dot(N, L), 0.0);
    float spec = pow(max(dot(N, H), 0.0), 32.0);
    float rim  = pow(1.0 - max(dot(N, V), 0.0), 2.0);

    vec3 ambient  = uColor * 0.25;
    vec3 diffuse  = uColor * diff * 0.85;
    vec3 specular = vec3(1.0) * spec * 0.6;
    vec3 rimColor = vec3(0.4, 0.25, 1.0) * rim * 0.7;

    vec3 color = ambient + diffuse + specular + rimColor;
    gl_FragColor = vec4(color, 1.0);
  }
`;
