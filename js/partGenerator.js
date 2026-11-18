import * as THREE from 'three';
import { mulberry32 } from './rng.js';

// ============================================================
// MATÉRIAUX
// ============================================================
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.6,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0.0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1.0,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flat ?? false
  });
}

const fleshMat    = (c) => mat(c, { roughness: 0.65, metalness: 0.02 });
const boneMat     = (c) => mat(c, { roughness: 0.4,  metalness: 0.15 });
const crystalMat  = (c) => mat(c, { roughness: 0.1, metalness: 0.4, emissive: c, emissiveIntensity: 0.5, flat: true });
const membraneMat = (c) => mat(c, { roughness: 0.7, metalness: 0.0, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
const glowMat     = (c) => mat(c, { roughness: 0.3, emissive: c, emissiveIntensity: 1.2 });

const EYE_MAT   = mat(0xfff8ee, { roughness: 0.05 });
const PUPIL_MAT = mat(0x050505, { roughness: 0.1 });

// ============================================================
// COURBE + TUBE
// ============================================================
function organicCurve(rng, height, jitter = 0.3, segments = 10) {
  const pts = [new THREE.Vector3(0, 0, 0)];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    pts.push(new THREE.Vector3(
      (rng() - 0.5) * jitter * t,
      t * height,
      (rng() - 0.5) * jitter * t
    ));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function taperedTube(curve, baseRadius, tipScale = 0.1, segments = 30, radial = 10) {
  const verts = [], normals = [], indices = [], uvs = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const up = Math.abs(tangent.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const fwd  = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const radius = baseRadius * (1 - t * (1 - tipScale));
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const offX = side.x * Math.cos(a) + fwd.x * Math.sin(a);
      const offY = side.y * Math.cos(a) + fwd.y * Math.sin(a);
      const offZ = side.z * Math.cos(a) + fwd.z * Math.sin(a);
      verts.push(point.x + offX * radius, point.y + offY * radius, point.z + offZ * radius);
      normals.push(offX, offY, offZ);
      uvs.push(t, j / radial);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

// ============================================================
// TYPES
// ============================================================
const TYPES = {

  tentacle: {
    generate: (rng) => ({
      height: 0.55 + rng() * 0.4,
      radius: 0.06 + rng() * 0.04,
      jitter: 0.4 + rng() * 0.4,
      hue: rng() > 0.5 ? 0.72 + rng() * 0.15 : rng() * 0.15,
      suckers: 4 + Math.floor(rng() * 4),
      tipBulb: 0.3 + rng() * 0.6
    }),
    build: (p, seed) => {
      const rng = mulberry32(seed);
      const g = new THREE.Group();
      const curve = organicCurve(rng, p.height, p.jitter, 10);
      const baseColor = new THREE.Color().setHSL(p.hue, 0.6, 0.35);
      const tipColor  = new THREE.Color().setHSL(p.hue, 0.7, 0.55);

      g.add(new THREE.Mesh(taperedTube(curve, p.radius, 0.05, 32, 10), fleshMat(baseColor)));

      for (let i = 0; i < p.suckers; i++) {
        const t = 0.15 + (i / Math.max(p.suckers - 1, 1)) * 0.75;
        const pt = curve.getPoint(t);
        const tan = curve.getTangent(t).normalize();
        const side = new THREE.Vector3(0, 1, 0).cross(tan).normalize();
        const radiusAtT = p.radius * (1 - t * 0.9);
        const sucker = new THREE.Mesh(
          new THREE.SphereGeometry(radiusAtT * 0.7, 8, 8),
          fleshMat(new THREE.Color().setHSL(p.hue, 0.5, 0.5))
        );
        sucker.position.copy(pt).add(side.multiplyScalar(radiusAtT * 0.85));
        sucker.scale.set(1, 0.5, 1);
        g.add(sucker);
      }

      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(p.radius * p.tipBulb, 10, 10),
        glowMat(tipColor)
      );
      tip.position.copy(curve.getPoint(1));
      g.add(tip);

      // --- ANIMATION : Sauvegarde des positions ---
      g.traverse(obj => {
        if (obj.isMesh) {
          obj.userData.basePos = obj.position.clone();
          if (obj.geometry?.attributes?.position) {
            obj.userData.baseGeoPos = obj.geometry.attributes.position.array.slice();
          }
        }
      });

      g.userData.animType = 'tentacle';
      g.userData.phase = rng() * Math.PI * 2;
      g.userData.height = p.height;

      return g;
    }
  },

  horn: {
    generate: (rng) => ({
      height: 0.35 + rng() * 0.35,
      baseRadius: 0.07 + rng() * 0.04,
      bendX: (rng() - 0.5) * 1.0,
      bendZ: (rng() - 0.5) * 1.0,
      hue: rng() * 0.1 + 0.05,
      ridges: Math.floor(rng() * 5),
      tipSharpness: 0.01 + rng() * 0.04
    }),
    build: (p, seed) => {
      const g = new THREE.Group();
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector3(
          Math.sin(t * p.bendX) * 0.18,
          t * p.height,
          Math.sin(t * p.bendZ) * 0.18
        ));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const color = new THREE.Color().setHSL(p.hue, 0.25, 0.85);

      g.add(new THREE.Mesh(taperedTube(curve, p.baseRadius, p.tipSharpness, 24, 8), boneMat(color)));

      for (let i = 0; i < p.ridges; i++) {
        const t = 0.12 + (i / Math.max(p.ridges, 1)) * 0.6;
        const pt = curve.getPoint(t);
        const tan = curve.getTangent(t).normalize();
        const r = p.baseRadius * (1 - t * (1 - p.tipSharpness)) * 1.12;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(r, 0.008, 6, 14),
          boneMat(new THREE.Color().setHSL(p.hue, 0.3, 0.55))
        );
        ring.position.copy(pt);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
        g.add(ring);
      }

      return g;
    }
  },

  eye: {
    generate: (rng) => ({
      size: 0.12 + rng() * 0.07,
      irisHue: rng(),
      pupilType: Math.floor(rng() * 4),
      hasStalk: rng() > 0.4,
      stalkHeight: 0.1 + rng() * 0.16
    }),
    build: (p, seed) => {
      const rng = mulberry32(seed);
      const g = new THREE.Group();
      let baseY = 0;

      if (p.hasStalk) {
        const curve = organicCurve(mulberry32(seed), p.stalkHeight, 0.15, 5);
        const stalkColor = new THREE.Color().setHSL(0.75, 0.4, 0.25);
        g.add(new THREE.Mesh(taperedTube(curve, 0.03, 0.9, 16, 8), fleshMat(stalkColor)));
        baseY = p.stalkHeight;
      }

      const eyeY = baseY + p.size * 0.5;

      const eyeballGroup = new THREE.Group();
      eyeballGroup.position.y = eyeY;

      const eye = new THREE.Mesh(new THREE.SphereGeometry(p.size, 24, 24), EYE_MAT);
      eyeballGroup.add(eye);

      const irisColor = new THREE.Color().setHSL(p.irisHue, 0.9, 0.55);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(p.size * 0.6, 20, 20), glowMat(irisColor));
      iris.position.set(0, p.size * 0.3, p.size * 0.6);
      eyeballGroup.add(iris);

      let pupilGeo;
      if (p.pupilType === 0) pupilGeo = new THREE.SphereGeometry(p.size * 0.28, 12, 12);
      else if (p.pupilType === 1) pupilGeo = new THREE.BoxGeometry(p.size * 0.1, p.size * 0.55, p.size * 0.2);
      else if (p.pupilType === 2) pupilGeo = new THREE.BoxGeometry(p.size * 0.4, p.size * 0.1, p.size * 0.2);
      else pupilGeo = new THREE.SphereGeometry(p.size * 0.22, 12, 12);

      const pupil = new THREE.Mesh(pupilGeo, PUPIL_MAT);
      pupil.position.set(0, p.size * 0.3, p.size * 0.78);
      eyeballGroup.add(pupil);

      if (p.pupilType === 3) {
        const pupil2 = new THREE.Mesh(new THREE.SphereGeometry(p.size * 0.15, 8, 8), PUPIL_MAT);
        pupil2.position.set(p.size * 0.2, p.size * 0.3, p.size * 0.75);
        eyeballGroup.add(pupil2);
      }

      const spec = new THREE.Mesh(new THREE.SphereGeometry(p.size * 0.08, 6, 6), mat(0xffffff, { roughness: 0 }));
      spec.position.set(p.size * 0.15, p.size * 0.55, p.size * 0.75);
      eyeballGroup.add(spec);

      g.add(eyeballGroup);

      eyeballGroup.userData.animType = 'eye';
      eyeballGroup.userData.phase = rng() * Math.PI * 2;

      return g;
    }
  },

  claw: {
    generate: (rng) => ({
      fingerCount: 3 + Math.floor(rng() * 3),
      length: 0.35 + rng() * 0.25,
      curl: 0.3 + rng() * 0.4,
      spread: 0.08 + rng() * 0.1,
      hue: rng() * 0.08
    }),
    build: (p, seed) => {
      const g = new THREE.Group();
      const color = new THREE.Color().setHSL(p.hue, 0.15, 0.9);

      const base = new THREE.Mesh(
        new THREE.SphereGeometry(p.spread * 1.5, 12, 12),
        fleshMat(new THREE.Color().setHSL(0.85, 0.3, 0.25))
      );
      g.add(base);

      for (let i = 0; i < p.fingerCount; i++) {
        const angle = (i / Math.max(p.fingerCount - 1, 1)) * Math.PI * 1.2 - Math.PI * 0.6;
        const x0 = Math.sin(angle) * p.spread;
        const z0 = Math.cos(angle) * p.spread * 0.5;

        const pts = [
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(x0 * 0.4, p.length * 0.35, z0 * 0.4),
          new THREE.Vector3(x0 * 0.8, p.length * 0.75, z0 * 0.8 - p.curl * 0.2),
          new THREE.Vector3(x0, p.length, z0 - p.curl * 0.5)
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        g.add(new THREE.Mesh(taperedTube(curve, 0.04, 0.05, 16, 8), boneMat(color)));
      }
      return g;
    }
  },

  crystal: {
    generate: (rng) => ({
      spikes: 1 + Math.floor(rng() * 4),
      size: 0.12 + rng() * 0.08,
      stretch: 1.4 + rng() * 1.4,
      hue: rng()
    }),
    build: (p, seed) => {
      const rng = mulberry32(seed);
      const g = new THREE.Group();
      const baseColor = new THREE.Color().setHSL(p.hue, 0.9, 0.55);

      for (let i = 0; i < p.spikes; i++) {
        const geo = new THREE.OctahedronGeometry(p.size, 0);
        const mesh = new THREE.Mesh(geo, crystalMat(baseColor));
        mesh.scale.y = p.stretch;
        mesh.position.y = (p.size * p.stretch) / 2;

        if (i > 0) {
          const a = rng() * Math.PI * 2;
          const r = p.size * 0.8;
          mesh.position.x = Math.cos(a) * r;
          mesh.position.z = Math.sin(a) * r;
          mesh.scale.multiplyScalar(0.5);
          mesh.rotation.z = (rng() - 0.5) * 0.6;
          mesh.position.y = (p.size * p.stretch * 0.5) / 2;
        }
        g.add(mesh);
      }
      return g;
    }
  },

  wing: {
    generate: (rng) => ({
      size: 0.35 + rng() * 0.3,
      segments: 4 + Math.floor(rng() * 4),
      hue: rng(),
      sweep: (rng() - 0.5) * 1.2,
      cup: (rng() - 0.5) * 1.0,
      tipBend: (rng() - 0.5) * 0.6
    }),
    build: (p, seed) => {
      const g = new THREE.Group();
      const color = new THREE.Color().setHSL(p.hue, 0.6, 0.5);

      const pts = [];
      for (let i = 0; i <= p.segments; i++) {
        const t = i / p.segments;
        const a = t * Math.PI * 0.85;
        let x = Math.cos(a) * p.size;
        let y = Math.sin(a) * p.size * 0.85;
        let z = 0;
        z += p.sweep * t * t * p.size;
        z += p.cup * x * x / p.size;
        y += p.tipBend * t * t * p.size;
        pts.push(new THREE.Vector3(x, y, z));
      }

      const verts = [0, 0, 0];
      const indices = [];
      for (let i = 0; i < pts.length; i++) {
        verts.push(pts[i].x, pts[i].y, pts[i].z);
        if (i > 0) indices.push(0, i, i + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, membraneMat(color)));

      for (let i = 1; i < pts.length; i++) {
        const ribCurve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), pts[i]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(ribCurve, 6, 0.008, 6, false), boneMat(new THREE.Color(0x2a1545))));
      }

      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), glowMat(color));
      tip.position.copy(pts[pts.length - 1]);
      g.add(tip);

      // --- ANIMATION AILE ---
      g.userData.animType = 'wing';
      g.userData.phase = Math.random() * Math.PI * 2;

      return g;
    }
  },

  spike: {
    generate: (rng) => ({
      height: 0.2 + rng() * 0.3,
      width: 0.05 + rng() * 0.04,
      bend: (rng() - 0.5) * 0.5,
      hue: rng() * 0.1,
      flatten: 0.6 + rng() * 0.6
    }),
    build: (p, seed) => {
      const g = new THREE.Group();
      const color = new THREE.Color().setHSL(p.hue, 0.4, 0.25);

      const geo = new THREE.ConeGeometry(p.width, p.height, 8, 4);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = (y + p.height / 2) / p.height;
        pos.setX(i, pos.getX(i) + p.bend * t * t * p.height);
        pos.setX(i, pos.getX(i) * p.flatten);
      }
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, boneMat(color));
      mesh.position.y = p.height / 2;
      g.add(mesh);
      return g;
    }
  },

  ear: {
    generate: (rng) => ({
      height: 0.22 + rng() * 0.22,
      width: 0.09 + rng() * 0.06,
      curve: (rng() - 0.5) * 0.3,
      hue: 0.75 + rng() * 0.15
    }),
    build: (p, seed) => {
      const g = new THREE.Group();
      const color = new THREE.Color().setHSL(p.hue, 0.4, 0.4);

      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector3(0, t * p.height, p.curve * t * t));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const earGeo = taperedTube(curve, p.width, 0.05, 20, 10);
      const earMesh = new THREE.Mesh(earGeo, fleshMat(color));
      earMesh.scale.z = 0.35;
      g.add(earMesh);

      const ridgePts = pts.map(pt => new THREE.Vector3(0, pt.y, pt.z + 0.005));
      const ridgeCurve = new THREE.CatmullRomCurve3(ridgePts);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(ridgeCurve, 12, 0.006, 4, false), boneMat(color.clone().multiplyScalar(0.6))));

      const innerGeo = taperedTube(curve, p.width * 0.6, 0.05, 16, 8);
      const innerMesh = new THREE.Mesh(innerGeo, fleshMat(color.clone().multiplyScalar(0.5)));
      innerMesh.scale.z = 0.2;
      innerMesh.position.z = -0.012;
      g.add(innerMesh);

      return g;
    }
  },

  hole: {
    generate: (rng) => ({
      radius: 0.06 + rng() * 0.05,
      rimThickness: 0.015 + rng() * 0.01,
      hue: rng() * 0.1
    }),
    build: (p, seed) => {
      const g = new THREE.Group();

      const discMat = new THREE.MeshBasicMaterial({ color: 0x050005, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.radius, 24), discMat);
      disc.rotation.x = -Math.PI / 2;
      g.add(disc);

      const innerDisc = new THREE.Mesh(new THREE.CircleGeometry(p.radius * 0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      innerDisc.rotation.x = -Math.PI / 2;
      innerDisc.position.y = 0.001;
      g.add(innerDisc);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(p.radius + p.rimThickness * 0.5, p.rimThickness, 6, 24), fleshMat(new THREE.Color().setHSL(p.hue, 0.5, 0.22)));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.005;
      g.add(rim);

      return g;
    }
  },

  mouth: {
    generate: (rng) => ({
      radius: 0.1 + rng() * 0.06,
      lipThickness: 0.04 + rng() * 0.02,
      teeth: 6 + Math.floor(rng() * 7),
      toothSize: 0.018 + rng() * 0.014,
      hue: rng() * 0.05,
      curvature: 0.4 + rng() * 1.0
    }),
    build: (p, seed) => {
      const rng = mulberry32(seed);
      const g = new THREE.Group();

      const R = 0.85;

      const lipGeo = new THREE.TorusGeometry(p.radius, p.lipThickness, 12, 32);
      const pos = lipGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const d2 = x * x + y * y;
        pos.setZ(i, z + d2 / (2 * R) * p.curvature);
      }
      lipGeo.computeVertexNormals();

      const lips = new THREE.Mesh(lipGeo, fleshMat(new THREE.Color().setHSL(p.hue, 0.5, 0.28)));
      lips.rotation.x = Math.PI / 2;
      g.add(lips);

      const innerGeo = new THREE.CircleGeometry(p.radius * 0.85, 32);
      const ipos = innerGeo.attributes.position;
      for (let i = 0; i < ipos.count; i++) {
        const x = ipos.getX(i);
        const y = ipos.getY(i);
        const d2 = x * x + y * y;
        ipos.setZ(i, d2 / (2 * R) * p.curvature - 0.008);
      }
      innerGeo.computeVertexNormals();
      const inner = new THREE.Mesh(innerGeo, new THREE.MeshBasicMaterial({ color: 0x050000, side: THREE.DoubleSide }));
      inner.rotation.x = Math.PI / 2;
      g.add(inner);

      for (let i = 0; i < p.teeth; i++) {
        const a = (i / p.teeth) * Math.PI * 2 + rng() * 0.15;
        const r = p.radius - p.lipThickness * 0.9;
        const tH = p.toothSize * (3.0 + rng() * 1.5);
        const tR = p.toothSize * (0.6 + rng() * 0.3);

        const toothPivot = new THREE.Group();
        toothPivot.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r);

        const geo = new THREE.ConeGeometry(tR, tH, 4);
        geo.translate(0, tH / 2, 0);

        const tooth = new THREE.Mesh(geo, boneMat(new THREE.Color(0xffffee)));
        tooth.userData.noConform = true;

        const toCenter = new THREE.Vector3(-Math.cos(a), -0.15, -Math.sin(a)).normalize();
        tooth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toCenter);

        toothPivot.add(tooth);

        toothPivot.userData.animType = 'tooth';
        toothPivot.userData.isToothPivot = true;
        toothPivot.userData.phase = rng() * Math.PI * 2;
        toothPivot.userData.baseQuat = toothPivot.quaternion.clone();

        g.add(toothPivot);
      }

      return g;
    }
  }
};

export const PART_TYPE_NAMES = Object.keys(TYPES);

export function generatePartParams(type, seed) {
  const t = TYPES[type];
  if (!t) return null;
  return t.generate(mulberry32(seed + 7));
}

export function buildPartMeshFromType(type, params, seed) {
  const t = TYPES[type];
  if (!t) return new THREE.Group();
  return t.build(params, seed);
}

export function generatePartDef(seed) {
  const rng = mulberry32(seed);
  const type = PART_TYPE_NAMES[Math.floor(rng() * PART_TYPE_NAMES.length)];
  return { instanceId: `part_${seed}`, seed, type, params: generatePartParams(type, seed) };
}

export function buildPartMesh(def) {
  return buildPartMeshFromType(def.type, def.params, def.seed);
}
