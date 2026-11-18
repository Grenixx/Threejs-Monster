import * as THREE from 'three';
import { BODIES, PART_TYPES } from './data.js';
import { mulberry32 } from './rng.js';
import {
  generatePartParams,
  buildPartMeshFromType
} from './partGenerator.js';

// =============================================================
// BASES — géométries stables et mises en cache
// =============================================================
const geometryCache = new Map();

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildBaseGeometry(geoId) {
  const rng = mulberry32(hashString(geoId) ^ 0x9e3779b9);
  const geo = new THREE.SphereGeometry(0.8, 56, 56);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  const noiseAmp = geoId === 'tank' ? 0.035 : geoId === 'wisp' ? 0.07 : 0.055;
  const f1 = 2 + rng() * 2;
  const f2 = 4 + rng() * 3;
  const phase = rng() * 10;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();

    // Relief organique
    const h = Math.sin(v.x * f1 + phase) * Math.cos(v.y * f1 + phase)
            + Math.sin(v.z * f2 - phase) * Math.cos(v.x * f2) * 0.5;
    v.addScaledVector(n, h * noiseAmp);

    if (geoId === 'tank') {
      v.x *= 1.08;
      v.z *= 0.98;
      v.y *= 0.92;
      // base aplatie
      if (v.y < -0.42) v.y = -0.42 - (v.y + 0.42) * 0.35;
    } else if (geoId === 'wisp') {
      // torse qui s'effile vers le haut + vrille
      const t = (v.y + 0.8) / 1.6;
      const s = 1 - Math.pow(t, 1.8) * 0.62;
      v.x *= s;
      v.z *= s;
      const angle = v.y * 2.4 + Math.sin(v.y * 3.0) * 0.5;
      const x = v.x * Math.cos(angle) - v.z * Math.sin(angle);
      const z = v.x * Math.sin(angle) + v.z * Math.cos(angle);
      v.x = x;
      v.z = z;
      v.y *= 1.1;
    } else {
      // larve : un peu d'asymétrie
      v.y *= 1.02;
      v.x *= 1 + Math.sin(v.y * 2.2) * 0.03;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  geo.userData.shared = true;
  return geo;
}

export function getBaseDef(bodyId) {
  const body = BODIES[bodyId] || BODIES.larve;
  if (!geometryCache.has(bodyId)) {
    geometryCache.set(bodyId, buildBaseGeometry(body.geo));
  }
  return {
    id: bodyId,
    ...body,
    geometry: geometryCache.get(bodyId),
    radius: 1
  };
}

// =============================================================
// SOCKETS
// =============================================================
function fibonacciDirections(count) {
  const points = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    points.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return points;
}

function surfaceAnchors(bodyMesh, count) {
  bodyMesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const dirs = fibonacciDirections(count);
  const anchors = [];

  for (let i = 0; i < count; i++) {
    const dir = dirs[i];
    raycaster.set(dir.clone().multiplyScalar(4), dir.clone().negate());
    const hits = raycaster.intersectObject(bodyMesh, false);
    if (hits.length > 0) {
      const hit = hits[0];
      const normal = hit.face.normal.clone()
        .transformDirection(bodyMesh.matrixWorld).normalize();
      anchors.push({
        index: i,
        position: hit.point.clone(),
        normal
      });
    } else {
      anchors.push({
        index: i,
        position: dir.clone().multiplyScalar(0.8),
        normal: dir.clone()
      });
    }
  }
  return anchors;
}

// =============================================================
// COULEURS
// =============================================================
function recolorMesh(mesh, baseHue, variant) {
  const mainHue = (baseHue + variant + 1) % 1;
  const mainColor = new THREE.Color().setHSL(mainHue, 0.55, 0.45);
  const accentColor = new THREE.Color().setHSL((mainHue + 0.08) % 1, 0.72, 0.56);
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

// =============================================================
// LISSAGE DES GUEULES SUR LA PEAU
// =============================================================
function conformToBody(mesh, body, minOffset = 0.008) {
  mesh.updateMatrixWorld(true);
  body.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  const origin = new THREE.Vector3(0, 0, 0);
  const P = new THREE.Vector3();

  mesh.traverse(child => {
    if (child.userData.isToothPivot) {
      P.copy(child.position).applyMatrix4(child.parent.matrixWorld);
      const dist = P.length();
      if (dist < 0.001) return;

      const dir = P.clone().divideScalar(dist);
      raycaster.set(origin, dir);
      const hits = raycaster.intersectObject(body, false);

      if (hits.length > 0) {
        const target = dir.clone().multiplyScalar(hits[0].point.length() + minOffset);
        const worldToParent = child.parent.matrixWorld.clone().invert();
        target.applyMatrix4(worldToParent);
        child.position.copy(target);
      }
      return;
    }

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

// =============================================================
// ASSEMBLAGE
// =============================================================
function quaternionForNormal(normal) {
  const localY = normal.clone().normalize();
  let upRef = new THREE.Vector3(0, 1, 0);
  if (Math.abs(localY.dot(upRef)) > 0.95) upRef = new THREE.Vector3(1, 0, 0);
  const localX = new THREE.Vector3().crossVectors(upRef, localY).normalize();
  const localZ = new THREE.Vector3().crossVectors(localX, localY).normalize();
  const basis = new THREE.Matrix4().makeBasis(localX, localY, localZ);
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

/**
 * Construit un monstre complet à partir de son état de jeu.
 * @returns {{group:THREE.Group, body:THREE.Mesh, anchors:Array, def:object, hue:number}}
 */
export function buildAssemblyMonster(monster) {
  const bodyDef = getBaseDef(monster.bodyId);
  const group = new THREE.Group();
  group.name = `monster_${monster.uid}`;

  const hueJitter = ((hashString(monster.uid) % 1000) / 1000 - 0.5) * 0.03;
  const baseHue = typeof monster.hue === 'number' ? monster.hue : bodyDef.hue;
  const hue = (baseHue + hueJitter + 1) % 1;

  const bodyColor = new THREE.Color().setHSL(hue, 0.5, 0.3);
  const body = new THREE.Mesh(
    bodyDef.geometry,
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.58,
      metalness: 0.08,
      emissive: new THREE.Color().setHSL(hue, 0.7, 0.05),
      emissiveIntensity: 0.35,
      side: THREE.DoubleSide
    })
  );
  body.userData.sharedGeo = true;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  group.updateMatrixWorld(true);

  const anchors = surfaceAnchors(body, bodyDef.sockets);

  for (const attachment of monster.attachments || []) {
    const part = attachment.part;
    const socket = attachment.socket;
    const anchor = anchors[socket];
    if (!anchor) continue;

    const rule = PART_TYPES_RULES[part.type];
    if (!rule) continue;

    const params = generatePartParams(part.type, part.seed);
    if (!params) continue;

    const mesh = buildPartMeshFromType(part.type, params, part.seed);
    const partRng = mulberry32((part.seed ^ 0x85ebca6b) >>> 0);
    const hueVariant = (partRng() - 0.5) * 0.16;
    recolorMesh(mesh, hue, hueVariant);

    const normal = anchor.normal.clone();
    const position = anchor.position.clone().addScaledVector(normal, -rule.sink);

    const quat = quaternionForNormal(normal);
    const tilt = (partRng() - 0.5) * 0.5;
    const tiltQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler((partRng() - 0.5) * tilt, 0, (partRng() - 0.5) * tilt, 'XYZ')
    );
    quat.multiply(tiltQuat);

    const scale = rule.scale * (0.85 + partRng() * 0.3);
    mesh.position.copy(position);
    mesh.quaternion.copy(quat);
    mesh.scale.setScalar(scale);

    mesh.userData.partUid = part.uid;
    mesh.userData.baseQuat = quat.clone();
    mesh.userData.baseScale = scale;

    mesh.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });

    group.add(mesh);

    if (part.type === 'mouth') {
      group.updateMatrixWorld(true);
      conformToBody(mesh, body, 0.006);
    }
  }

  return { group, body, anchors, def: bodyDef, hue };
}

// Les règles d'orientation viennent des données.
const PART_TYPES_RULES = Object.fromEntries(
  Object.entries(PART_TYPES).map(([key, def]) => [key, def.rule])
);

// =============================================================
// ANIMATION DES PARTIES
// =============================================================
export function animateMonsterParts(root, time) {
  if (!root) return;
  const t = time * 0.5;

  root.traverse(child => {
    if (!child.userData.animType) return;

    if (child.userData.animType === 'tentacle') {
      const phase = child.userData.phase;
      const maxHeight = child.userData.height || 0.5;

      child.traverse(mesh => {
        if (!mesh.isMesh || !mesh.userData.baseGeoPos) return;
        const meshBaseY = mesh.userData.basePos.y;

        if (mesh.geometry.attributes.position.count > 100) {
          const pos = mesh.geometry.attributes.position;
          const base = mesh.userData.baseGeoPos;

          for (let i = 0; i < pos.count; i++) {
            const bx = base[i * 3];
            const by = base[i * 3 + 1];
            const bz = base[i * 3 + 2];

            const progress = Math.max(0, Math.min(1, (meshBaseY + by) / maxHeight));
            const amp = progress * progress * 0.25;

            pos.setX(i, bx + Math.sin(t * 2.5 + phase + progress * 4) * amp);
            pos.setZ(i, bz + Math.cos(t * 2.0 + phase * 1.3 + progress * 4) * amp);
          }
          pos.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        } else {
          const progress = Math.max(0, Math.min(1, meshBaseY / maxHeight));
          const amp = progress * progress * 0.25;
          mesh.position.x = mesh.userData.basePos.x + Math.sin(t * 2.5 + phase + progress * 4) * amp;
          mesh.position.z = mesh.userData.basePos.z + Math.cos(t * 2.0 + phase * 1.3 + progress * 4) * amp;
        }
      });
    }

    if (child.userData.animType === 'eye') {
      const phase = child.userData.phase;
      child.rotation.y = Math.sin(t * 1.2 + phase) * 0.5;
      child.rotation.x = Math.cos(t * 0.9 + phase) * 0.3;
    }

    if (child.userData.animType === 'tooth') {
      const phase = child.userData.phase;
      const chewX = Math.sin(t * 4.0 + phase) * 0.15;
      const chewZ = Math.cos(t * 4.0 + phase) * 0.15;
      const chewQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(chewX, 0, chewZ));
      if (child.userData.baseQuat) {
        child.quaternion.copy(child.userData.baseQuat).multiply(chewQuat);
      }
    }

    if (child.userData.animType === 'wing') {
      const phase = child.userData.phase;
      const flapX = Math.sin(t * 2.0 + phase) * 0.6;
      const flapQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(flapX, 0, 0));
      if (child.userData.baseQuat) {
        child.quaternion.copy(child.userData.baseQuat).multiply(flapQuat);
      }
    }
  });
}

// =============================================================
// LIBÉRATION
// =============================================================
export function disposeMonsterGroup(group) {
  if (!group) return;
  group.traverse(obj => {
    if (obj.isSprite) {
      if (obj.material) {
        obj.material.map?.dispose?.();
        obj.material.dispose();
      }
      return;
    }
    if (!obj.isMesh) return;
    if (!obj.userData.sharedGeo && obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material.dispose();
    }
  });
}
