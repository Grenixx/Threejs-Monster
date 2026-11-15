import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import {
  generatePartParams,
  buildPartMeshFromType,
  PART_TYPE_NAMES
} from './partGenerator.js';

// ============================================================
// BASES ALÉATOIRES (6 types)
// ============================================================
function rollBase(rng) {
  const kind = Math.floor(rng() * 6);
  let geometryFn;
  let sockets = 24;

  // 0: Sphère
  if (kind === 0) {
    geometryFn = () => new THREE.SphereGeometry(0.8, 32, 32);
  }
  // 1: Ellipsoïde
  else if (kind === 1) {
    const sx = 0.65 + rng() * 0.6;
    const sy = 0.65 + rng() * 0.6;
    const sz = 0.65 + rng() * 0.6;
    geometryFn = () => {
      const g = new THREE.SphereGeometry(0.8, 32, 32);
      g.scale(sx, sy, sz);
      return g;
    };
  }
  // 2: Lumpy
  else if (kind === 2) {
    const freq = 2 + rng() * 2;
    const amp = 0.08 + rng() * 0.1;
    const offset = rng() * 100;
    geometryFn = () => {
      const g = new THREE.SphereGeometry(0.8, 48, 48);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = v.clone().normalize();
        const noise = Math.sin(v.x * freq + offset)
                    * Math.cos(v.y * freq + offset * 0.7)
                    * Math.sin(v.z * freq + offset * 0.3);
        v.addScaledVector(n, noise * amp);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    };
    sockets = 28;
  }
  // 3: Œuf
  else if (kind === 3) {
    const taper = 0.45 + rng() * 0.35;
    geometryFn = () => {
      const g = new THREE.SphereGeometry(0.8, 32, 32);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const t = (v.y + 0.8) / 1.6;
        const s = 1 - t * (1 - taper);
        v.x *= s;
        v.z *= s;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    };
  }
  // 4: Twisted
  else if (kind === 4) {
    const twist = (rng() - 0.5) * 4;
    geometryFn = () => {
      const g = new THREE.SphereGeometry(0.8, 48, 48);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const angle = v.y * twist;
        const x = v.x * Math.cos(angle) - v.z * Math.sin(angle);
        const z = v.x * Math.sin(angle) + v.z * Math.cos(angle);
        pos.setXYZ(i, x, v.y, z);
      }
      g.computeVertexNormals();
      return g;
    };
  }
  // 5: Amorphous
  else {
    const f1 = 1.5 + rng() * 2;
    const f2 = 4 + rng() * 4;
    const a1 = 0.1 + rng() * 0.15;
    const a2 = 0.05 + rng() * 0.08;
    const phase = rng() * 10;
    geometryFn = () => {
      const g = new THREE.SphereGeometry(0.8, 48, 48);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = v.clone().normalize();
        const h = Math.sin(v.x * f1 + phase) * Math.cos(v.y * f1 + phase)
                + Math.sin(v.z * f2 - phase) * Math.cos(v.x * f2 + phase) * 0.5;
        v.addScaledVector(n, h * a1 + h * a2);
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      return g;
    };
    sockets = 32;
  }

  return {
    name: `base_${kind}`,
    geometryFn,
    radius: 1.0,
    sockets
  };
}

// ============================================================
// SOCKETS
// ============================================================
function getSockets(base) {
  const n = base.sockets;
  const R = base.radius;
  const points = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    points.push(new THREE.Vector3(
      Math.cos(th) * r * R,
      y * R,
      Math.sin(th) * r * R
    ));
  }
  return points;
}

// ============================================================
// RÈGLES
// ============================================================
const RULES = {
  eye:      { yMin:  0.1, yMax:  1.0, max: 4, scale: 1.2, sink: 0.12 },
  horn:     { yMin:  0.4, yMax:  1.0, max: 3, scale: 1.5, sink: 0.10 },
  claw:     { yMin: -0.4, yMax:  0.5, max: 3, scale: 1.5, sink: 0.10 },
  tentacle: { yMin: -1.0, yMax:  0.0, max: 5, scale: 1.5, sink: 0.12 },
  crystal:  { yMin: -0.2, yMax:  0.9, max: 4, scale: 1.5, sink: 0.10 },
  wing:     { yMin: -0.2, yMax:  0.6, max: 2, scale: 1.6, sink: 0.02 },
  spike:    { yMin: -0.6, yMax:  1.0, max: 6, scale: 1.3, sink: 0.10 },
  mouth:    { yMin: -0.3, yMax:  0.4, max: 2, scale: 1.2, sink: 0.02 },
  hole:     { yMin: -0.5, yMax:  0.8, max: 4, scale: 1.0, sink: 0.0  },
  ear:      { yMin:  0.2, yMax:  1.0, max: 2, scale: 1.2, sink: 0.03 }
};
// ============================================================
// RECOLORISATION
// ============================================================
function recolorMesh(mesh, baseHue, variant) {
  const mainHue = (baseHue + variant + 1) % 1;
  const mainColor = new THREE.Color().setHSL(mainHue, 0.55, 0.45);
  const accentColor = new THREE.Color().setHSL((mainHue + 0.08) % 1, 0.7, 0.55);
  const darkColor = new THREE.Color().setHSL(mainHue, 0.5, 0.18);

  mesh.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    obj.material = obj.material.clone();

    if (obj.material.emissive && obj.material.emissiveIntensity > 0.3) {
      obj.material.color.copy(accentColor);
      obj.material.emissive.copy(accentColor);
      return;
    }

    const c = obj.material.color;
    if (!c) return;
    const lum = c.r * 0.299 + c.g * 0.587 + c.b * 0.114;
    if (lum < 0.05 || lum > 0.95) return;

    if (lum < 0.25) obj.material.color.copy(darkColor);
    else if (lum < 0.6) obj.material.color.copy(mainColor);
    else obj.material.color.copy(accentColor);
  });
}

// ============================================================
// CONFORM : pousse les vertices dans le corps vers la surface
// ============================================================
function conformToBody(mesh, body, minOffset = 0.008) {
  mesh.updateMatrixWorld(true);
  body.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(0, 0, 0);
  const P = new THREE.Vector3();

  mesh.traverse(child => {
    if (!child.isMesh) return;
    if (child.userData.noConform) return;
    const geo = child.geometry;
    if (!geo?.attributes?.position) return;

    const worldToChild = child.matrixWorld.clone().invert();
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      P.fromBufferAttribute(pos, i).applyMatrix4(child.matrixWorld);
      const dist = P.length();
      if (dist < 0.001) continue;

      const dir = P.clone().divideScalar(dist);
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObject(body, false);

      if (hits.length > 0) {
        const hitDist = hits[0].point.length();
        // Seulement pousser si le vertex est DANS le corps
        if (dist < hitDist) {
          const target = dir.clone().multiplyScalar(hitDist + minOffset);
          target.applyMatrix4(worldToChild);
          pos.setXYZ(i, target.x, target.y, target.z);
        }
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
}

// ============================================================
// ROLL MONSTER
// ============================================================
export function rollMonster(seed) {
  const rng = mulberry32(seed);
  const base = rollBase(rng);
  const baseScale = 0.9 + rng() * 0.2;
  const partCount = 6 + Math.floor(rng() * 8);
  const hue = rng();

  const sockets = getSockets(base);
  const usedSockets = new Set();
  const usedTypes = {};
  const parts = [];

  for (let i = 0; i < partCount; i++) {
    let type;
    let attempts = 0;
    do {
      type = PART_TYPE_NAMES[Math.floor(rng() * PART_TYPE_NAMES.length)];
      attempts++;
    } while ((usedTypes[type] || 0) >= 2 && attempts < 10);

    const rule = RULES[type] || { yMin: -1, yMax: 1, max: 99, scale: 1, sink: 0.1 };
    if ((usedTypes[type] || 0) >= rule.max) continue;

    const candidates = [];
    for (let s = 0; s < sockets.length; s++) {
      if (usedSockets.has(s)) continue;
      const ny = sockets[s].y / base.radius;
      if (ny < rule.yMin || ny > rule.yMax) continue;

      let tooClose = false;
      for (const used of usedSockets) {
        if (sockets[s].distanceTo(sockets[used]) < base.radius * 0.3) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) candidates.push(s);
    }
    if (candidates.length === 0) continue;

    const socket = candidates[Math.floor(rng() * candidates.length)];
    usedSockets.add(socket);
    usedTypes[type] = (usedTypes[type] || 0) + 1;

    parts.push({
      type,
      seed: Math.floor(rng() * 2 ** 32),
      socket,
      scale: rule.scale * (0.85 + rng() * 0.3),
      sink: rule.sink,
      tilt: (rng() - 0.5) * 0.5,
      hueVariant: (rng() - 0.5) * 0.15
    });
  }

  return {
    seed,
    name: generateName(rng),
    base,
    baseScale,
    baseHue: hue,
    parts
  };
}

// ============================================================
// BUILD
// ============================================================
export function buildMonster(def) {
  const monster = new THREE.Group();
  const base = def.base;

  const bodyColor = new THREE.Color().setHSL(def.baseHue, 0.45, 0.32);
  const body = new THREE.Mesh(
    base.geometryFn(),
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.55,
      metalness: 0.1,
      side: THREE.DoubleSide
    })
  );
  body.scale.setScalar(def.baseScale);
  body.castShadow = true;
  body.receiveShadow = true;
  monster.add(body);
  body.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const sockets = getSockets(base);

  for (const part of def.parts) {
    const socketPos = sockets[part.socket];
    if (!socketPos) continue;

    const params = generatePartParams(part.type, part.seed);
    if (!params) continue;

    const mesh = buildPartMeshFromType(part.type, params, part.seed);
    recolorMesh(mesh, def.baseHue, part.hueVariant ?? 0);

    const dir = socketPos.clone().normalize();

    // Raycast depuis l'extérieur vers le centre
    const rayStart = dir.clone().multiplyScalar(3.0);
    raycaster.set(rayStart, dir.clone().negate());

    const hits = raycaster.intersectObject(body);

    let surfacePoint, surfaceNormal;

    if (hits.length > 0) {
      surfacePoint = hits[0].point;
      // ⚠️ PAS de .negate() : la face.normal pointe déjà vers l'extérieur
      surfaceNormal = hits[0].face.normal.clone()
        .transformDirection(body.matrixWorld).normalize();
    } else {
      surfacePoint = socketPos.clone().multiplyScalar(def.baseScale);
      surfaceNormal = dir;
    }

    // Position avec sink (retrait dans le corps)
    mesh.position.copy(surfacePoint).addScaledVector(surfaceNormal, -part.sink);

    // =====================================================
    // ORIENTATION STABLE via makeBasis
    // =====================================================
    const localY = surfaceNormal.clone().normalize();

    let upRef = new THREE.Vector3(0, 1, 0);
    if (Math.abs(localY.dot(upRef)) > 0.95) {
      upRef = new THREE.Vector3(1, 0, 0);
    }

    const localX = new THREE.Vector3().crossVectors(upRef, localY).normalize();
    const localZ = new THREE.Vector3().crossVectors(localX, localY).normalize();

    const basis = new THREE.Matrix4().makeBasis(localX, localY, localZ);
    mesh.quaternion.setFromRotationMatrix(basis);

    // Tilt local (autour de X et Z locaux)
    if (part.tilt) {
      const tiltRng = mulberry32(part.seed + 99);
      const tiltX = (tiltRng() - 0.5) * part.tilt;
      const tiltZ = (tiltRng() - 0.5) * part.tilt;
      const tiltQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(tiltX, 0, tiltZ, 'XYZ')
      );
      mesh.quaternion.multiply(tiltQuat);
    }

    mesh.scale.setScalar(part.scale);

    mesh.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    monster.add(mesh);

    // Conform pour les bouches : chaque vertex de la bouche épouse la surface
    if (part.type === 'mouth') {
      conformToBody(mesh, body, 0.006);
    }
  }

  return monster;
}

// ============================================================
// NOM
// ============================================================
const S1 = ['Azh', 'Vor', 'Kal', 'Nyx', 'Zul', 'Mor', 'Kar', 'Gha', 'Xar', 'Tho', 'Ulg', 'Vex', 'Ith', 'Oph', 'Dra'];
const S2 = ['', '', 'a', 'o', 'u', 'e', 'ka', 'zo', 'ra', 'thi'];
const S3 = ['k', 'th', 'n', 'z', 'x', 'gul', 'tor', 'zar', 'oth', 'iss', 'ak', 'or', 'an', 'ys'];

function generateName(rng) {
  return S1[Math.floor(rng() * S1.length)]
       + S2[Math.floor(rng() * S2.length)]
       + S3[Math.floor(rng() * S3.length)];
}
