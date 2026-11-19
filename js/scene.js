import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag, skyVert, skyFrag } from './shaders.js';
import { ROLES, BODIES, BODY_KEYS } from './data.js';
import {
  buildAssemblyMonster, animateMonsterParts, disposeMonsterGroup, recolorMesh
} from './monsterBuilder.js';
import { generatePartDef, PART_TYPE_NAMES } from './partGenerator.js';
import { mulberry32 } from './rng.js';
import { monsterStats, rollLoot } from './economy.js';

const MARKER_COLORS = {
  available: 0x8b7cff,
  valid: 0x7bffc8,
  hover: 0xffffff
};

function createMarkerSet(anchors, groupScale) {
  const markerGroup = new THREE.Group();
  markerGroup.name = 'socket-markers';

  const ringGeo = new THREE.RingGeometry(0.72, 1, 32);
  const coreGeo = new THREE.SphereGeometry(0.16, 10, 10);
  const hitGeo = new THREE.SphereGeometry(1.1, 8, 8);

  for (const anchor of anchors) {
    const marker = new THREE.Group();
    marker.position.copy(anchor.position).addScaledVector(anchor.normal, 0.012);

    const zAxis = new THREE.Vector3(0, 0, 1);
    marker.quaternion.setFromUnitVectors(zAxis, anchor.normal.clone().normalize());

    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: MARKER_COLORS.available,
        transparent: true,
        opacity: 0.34,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.renderOrder = 20;
    marker.add(ring);

    const core = new THREE.Mesh(
      coreGeo,
      new THREE.MeshBasicMaterial({
        color: MARKER_COLORS.available,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    core.renderOrder = 21;
    marker.add(core);

    const hit = new THREE.Mesh(
      hitGeo,
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        colorWrite: false,
        depthWrite: false
      })
    );
    hit.renderOrder = 22;
    marker.add(hit);

    const localScale = 0.092 / groupScale;
    marker.scale.setScalar(localScale);
    marker.userData.isMarker = true;
    marker.userData.socket = anchor.index;
    marker.userData.state = 'available';

    markerGroup.add(marker);
  }

  return markerGroup;
}

export function createScene(canvas, options = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  // Rendu en basse résolution puis mise à l'échelle crépie (look pixel-art cohérent sur tous les écrans)
  const _iW = Math.max(1, Math.floor(canvas.clientWidth * 0.5));
  const _iH = Math.max(1, Math.floor(canvas.clientHeight * 0.5));
  renderer.setSize(_iW, _iH, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05040c, 0.035);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
  camera.position.set(1.4, 1.9, 4.8);

  const controls = new OrbitControls(camera, renderer.domElement);
  canvas.style.cursor = 'grab';
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.target.set(0, 1.25, 0);
  controls.update();

  // ------------------------------------------------ CADRAGE CAMÉRA ----
  // L'orbite est horizontale : l'élévation du cadrage est figée à chaque
  // placement, donc le sol ne bascule jamais quand on tourne autour du monstre.
  // Le zoom du joueur ne traverse pas un changement de mode : chaque écran
  // (labo / expédition) repart de son cadrage, mais l'angle horizontal choisi
  // par le joueur est conservé.
  const UP = new THREE.Vector3(0, 1, 0);
  let orbitAzimuth = 0;   // rotation horizontale demandée par le joueur
  let baseAzimuth = 0;    // rotation horizontale du cadrage courant
  let currentFraming = null; // 'idle' | 'expedition'

  function lockElevation() {
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    const len = off.length() || 1;
    const phi = Math.acos(THREE.MathUtils.clamp(off.y / len, -1, 1));
    controls.minPolarAngle = phi;
    controls.maxPolarAngle = phi;
  }

  /** Place la caméra sur le cadrage voulu (position de base + hauteur visée). */
  function placeCamera(base, targetY, framing) {
    controls.target.set(0, targetY, 0);
    const off = new THREE.Vector3(base[0], base[1] - targetY, base[2]);
    baseAzimuth = Math.atan2(off.x, off.z);
    off.applyAxisAngle(UP, orbitAzimuth);
    camera.position.copy(controls.target).add(off);
    controls.update();
    lockElevation();
    currentFraming = framing;
  }

  // Cadrage du labo selon la forme de l'écran.
  function idleFraming() {
    const mobile = window.innerWidth <= 980;
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight < 560;
    const aspect = camera.aspect || 1;
    const distance = landscape ? 7.3 : mobile ? 6.6 : aspect < 0.9 ? 6.2 : aspect < 1.35 ? 5.9 : 5.7;
    return {
      base: [0.85, landscape ? 2.55 : mobile ? 2.35 : 2.0, distance],
      targetY: landscape ? 1.72 : mobile ? 1.62 : 1.3
    };
  }

  // Retient la rotation horizontale du joueur (les mouvements verticaux sont
  // ignorés : l'élévation reste figée).
  controls.addEventListener('end', () => {
    const off = new THREE.Vector3().subVectors(camera.position, controls.target);
    orbitAzimuth = Math.atan2(off.x, off.z) - baseAzimuth;
  });

  // -----------------------------------------------------------
  // CIEL
  // -----------------------------------------------------------
  const skyUniforms = {
    uColorTop: { value: new THREE.Color(0x010003) },
    uColorBottom: { value: new THREE.Color(0x140425) }
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 32), skyMat));

  // -----------------------------------------------------------
  // LUMIÈRES
  // -----------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x6644ff, 0x110022, 0.55);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.1);
  keyLight.position.set(4, 7, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 5;
  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.bias = -0.0004;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x4477ff, 16, 14, 2);
  fillLight.position.set(-3.5, 2.2, 2.5);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff55aa, 22, 14, 2);
  rimLight.position.set(0, 2.2, -3.5);
  scene.add(rimLight);

  const spotLight = new THREE.SpotLight(0xffffff, 110, 18, Math.PI / 5, 0.55, 2);
  spotLight.position.set(0, 7, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(1024, 1024);
  spotLight.shadow.bias = -0.0005;
  scene.add(spotLight);
  scene.add(spotLight.target);

  const aura = new THREE.PointLight(0x9d6bff, 6, 6, 2);
  aura.position.set(0, 1.0, 1.2);
  scene.add(aura);


  // -----------------------------------------------------------
  // SOL (floor shader — pas d'ombres de contact)
  // -----------------------------------------------------------
  const floorUniforms = {
    uGrid: { value: new THREE.Color(0x1a182e) },
    uBg: { value: new THREE.Color(0x05040c) },
    uFogColor: { value: new THREE.Color(0x05040c) },
    uTime: { value: 0 },
    uFogDensity: { value: 0.035 }
  };
  const floorMat = new THREE.ShaderMaterial({
    vertexShader: floorVert,
    fragmentShader: floorFrag,
    uniforms: floorUniforms,
    depthWrite: true
  });
  const floorGeo = new THREE.PlaneGeometry(200, 200);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  floor.renderOrder = 1;
  scene.add(floor);

  // -----------------------------------------------------------
  // PARTICULES
  // -----------------------------------------------------------
  const particleCount = 260;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 1] = Math.random() * 9;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    speeds[i] = 0.15 + Math.random() * 0.7;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

  const particleMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xaa88ff) } },
    vertexShader: /* glsl */`
      attribute float aSpeed;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * aSpeed, 9.0);
        vAlpha = smoothstep(0.0, 1.2, p.y / 9.0) * smoothstep(9.0, 7.5, p.y);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 3.4 * (9.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vAlpha;
      uniform vec3 uColor;
      void main() {
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r = dot(cxy, cxy);
        if (r > 1.0) discard;
        float a = smoothstep(1.0, 0.15, r);
        gl_FragColor = vec4(uColor, a * vAlpha * 0.7);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // -----------------------------------------------------------
  // ÉTAT
  // -----------------------------------------------------------
  let currentGroup = null;
  let currentMonster = null;
  let anchors = [];
  let markerGroup = null;
  let builderMode = false;
  const viewQuaternion = new THREE.Quaternion();
  let spawnAnim = null;
  let selection = null;
  let hoveredMarker = null;
  let baseGroupY = 0;
  let expeditionRoot = null;
  let expeditionLights = [];
  let expeditionActors = [];
  let expeditionProps = [];
  let expeditionFoes = [];
  let expeditionClock = null;   // { startedAt, duration }
  let expeditionCombat = null;  // { active:boolean, foe:object, start:number, damageDealt:boolean }
  let expeditionCamFollow = true; // la caméra suit le monstre du joueur si true
  let expeditionCamFollowTimer = 0; // s réactive le suivi auto après 2s sans interaction
  let expeditionMode = false;
  let currentZone = null;

  const targetColors = {
    grid: new THREE.Color(),
    bg: new THREE.Color(),
    skyTop: new THREE.Color(),
    skyBottom: new THREE.Color()
  };

  function applyPalette(hue) {
    targetColors.grid.setHSL((hue + 0.1) % 1.0, 0.8, 0.5);
    targetColors.bg.setHSL(hue, 0.5, 0.035);
    targetColors.skyTop.setHSL(hue, 0.6, 0.01);
    targetColors.skyBottom.setHSL(hue, 0.5, 0.1);
  }

  function markerObjects() {
    if (!markerGroup) return [];
    return markerGroup.children;
  }

  function setMarkerState(marker, state) {
    marker.userData.state = state;
    const ring = marker.children[0];
    const core = marker.children[1];
    if (!ring || !core) return;

    if (state === 'hidden') {
      marker.visible = false;
      return;
    }
    marker.visible = true;

    if (state === 'valid') {
      ring.material.color.setHex(MARKER_COLORS.valid);
      core.material.color.setHex(MARKER_COLORS.valid);
      ring.material.opacity = 0.72;
      core.material.opacity = 0.85;
    } else if (state === 'hover') {
      ring.material.color.setHex(MARKER_COLORS.hover);
      core.material.color.setHex(MARKER_COLORS.hover);
      ring.material.opacity = 0.9;
      core.material.opacity = 1;
    } else {
      ring.material.color.setHex(MARKER_COLORS.available);
      core.material.color.setHex(MARKER_COLORS.available);
      ring.material.opacity = 0.24;
      core.material.opacity = 0.38;
    }
  }

  function refreshMarkers() {
    if (!markerGroup || !currentMonster) return;
    const used = new Set((currentMonster.attachments || []).map(a => a.socket));
    const valid = selection?.validSockets || null;

    for (const marker of markerObjects()) {
      const socket = marker.userData.socket;
      if (used.has(socket)) {
        setMarkerState(marker, 'hidden');
      } else if (selection) {
        setMarkerState(marker, valid?.has(socket) ? 'valid' : 'hidden');
      } else {
        setMarkerState(marker, 'available');
      }
    }
    markerGroup.visible = builderMode;
  }

  function fitGroup(group) {
    group.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(group);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = 2.55 / maxDim;
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);

    const bbox2 = new THREE.Box3().setFromObject(group);
    const center = bbox2.getCenter(new THREE.Vector3());
    group.position.x = -center.x;
    group.position.z = -center.z;
    group.position.y = 1.3 - center.y;  // flotte dans le vide (pas de socle)
    group.updateMatrixWorld(true);
    baseGroupY = group.position.y;
    return scale;
  }

  // -----------------------------------------------------------
  // MISE EN SCÈNE DES EXPÉDITIONS
  // -----------------------------------------------------------
  const labelLayer = document.getElementById('actorLabels');

  function createActorLabel(monster, role) {
    if (!labelLayer) return null;
    const el = document.createElement('div');
    el.className = 'actor-label';
    el.style.setProperty('--role-color', role.color);

    const name = document.createElement('b');
    name.textContent = monster.name;
    const roleEl = document.createElement('span');
    roleEl.textContent = role.label.toUpperCase();
    el.append(name, roleEl);
    labelLayer.appendChild(el);
    return el;
  }

  /** Étiquette flottante d'un ennemi (nom + « hostile »). */
  function createFoeLabel(beast) {
    if (!labelLayer) return null;
    const el = document.createElement('div');
    el.className = 'actor-label foe';
    const name = document.createElement('b');
    name.textContent = beast.name;
    const kind = document.createElement('span');
    kind.textContent = 'HOSTILE';
    el.append(name, kind);
    labelLayer.appendChild(el);
    return el;
  }

  function clearActorLabels() {
    if (labelLayer) labelLayer.replaceChildren();
  }

  function updateActorLabels() {
    if (!labelLayer || !expeditionMode) return;
    const rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3();

    for (const actor of expeditionActors) {
      if (!actor.labelEl) continue;
      actor.group.getWorldPosition(v);
      v.y += 1.62;
      v.project(camera);

      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      const visible = v.z < 1 && x > -120 && x < rect.width + 120 && y > -60 && y < rect.height + 80;

      actor.labelEl.style.left = `${x}px`;
      actor.labelEl.style.top = `${y}px`;
      actor.labelEl.style.opacity = visible ? '1' : '0';
    }

    for (const foe of expeditionFoes) {
      if (!foe.labelEl) continue;
      if (!foe.group.visible) {
        foe.labelEl.style.opacity = '0';
        continue;
      }
      foe.group.getWorldPosition(v);
      v.y += 0.95;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * rect.width;
      const y = (-v.y * 0.5 + 0.5) * rect.height;
      const visible = v.z < 1 && x > -120 && x < rect.width + 120 && y > -60 && y < rect.height + 80;
      foe.labelEl.style.left = `${x}px`;
      foe.labelEl.style.top = `${y}px`;
      foe.labelEl.style.opacity = visible ? '1' : '0';
    }
  }

  function hashText(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  // ------------------------------------------------ PROJECTION VECTORIELLE SUR LE SOL ----
  // Reproduit exactement le noise du shader floorVert pour calculer la hauteur
  // et la normale du sol à n'importe quel point (x, z). Les objets s'y posent
  // donc réellement sur les collines.
  function groundHash2(x, y) {
    x = (x * 123.34) % 1;
    y = (y * 456.21) % 1;
    const d = x * (x + 45.32) + y * (y + 45.32);
    return ((x + d) * (y + d)) % 1;
  }

  function groundNoise(x, y) {
    const i = { x: Math.floor(x), y: Math.floor(y) };
    const f = { x: x - i.x, y: y - i.y };
    const u = f.x * f.x * (3.0 - 2.0 * f.x);
    const v = f.y * f.y * (3.0 - 2.0 * f.y);
    const a = groundHash2(i.x, i.y);
    const b = groundHash2(i.x + 1, i.y);
    const c = groundHash2(i.x, i.y + 1);
    const d = groundHash2(i.x + 1, i.y + 1);
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  }

  /** Hauteur du sol à (x, z), identique au vertex shader du sol. */
  function groundHeight(x, z) {
    return groundNoise(x * 0.6, z * 0.6) * 0.5;
  }

  /** Normale du sol à (x, z), identique au vertex shader du sol. */
  function groundNormal(x, z) {
    const eps = 0.02;
    const hx = groundHeight(x + eps, z);
    const hxm = groundHeight(x - eps, z);
    const hz = groundHeight(x, z + eps);
    const hzm = groundHeight(x, z - eps);
    const nx = (hx - hxm) / (2 * eps);
    const nz = (hz - hzm) / (2 * eps);
    const len = Math.sqrt(nx * nx + 1 + nz * nz);
    return new THREE.Vector3(-nx / len, 1 / len, -nz / len);
  }

  /** Place un groupe sur le sol : position y = hauteur du sol + yOffset, rotation alignée sur la normale. */
  function placeOnGround(group, x, z, keepYaw = 0, yOffset = 0) {
    const pos = new THREE.Vector3(x, groundHeight(x, z) + yOffset, z);
    const nrm = groundNormal(x, z);
    group.position.copy(pos);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), nrm
    );
    if (keepYaw) {
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), keepYaw);
      q.premultiply(qy);
    }
    group.quaternion.copy(q);
    group.updateMatrixWorld();
    return { pos, nrm };
  }

  /**
   * Créature d'expédition : assemblage de primitives, teinté par la zone.
   * Les formes sont volontairement simples (silhouette lisible en pixel-art).
   */
  /**
   * Construit un monstre d'expédition exactement comme le joueur assemble
   * le sien : un corps + des parties greffées, recoloré à la palette du biome.
   * Le résultat est déterministe à partir de la graine (seed).
   */
  function buildExpeditionBeast(beat, biomeHue, seed) {
    const rng = mulberry32((seed >>> 0) || 1);
    const bodyId = BODY_KEYS[Math.floor(rng() * BODY_KEYS.length)];

    const monsterDef = {
      uid: `beast-${beat.id}`,
      bodyId,
      hue: biomeHue,
      attachments: []
    };

    // 1 à 3 parties aléatoires, tirées de la même graine que l'expédition.
    const nParts = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < nParts; i++) {
      const def = generatePartDef((seed * 31 + i * 17 + rng() * 1000) | 0);
      const socket = Math.floor(rng() * (BODIES[bodyId] ? BODIES[bodyId].sockets : 24));
      monsterDef.attachments.push({
        uid: `part-${beat.id}-${i}`,
        part: { ...def, uid: `part-${beat.id}-${i}`, type: def.type, seed: def.seed },
        socket
      });
    }

    const built = buildAssemblyMonster(monsterDef);
    const group = built.group;
    group.name = `foe-${beat.id}`;
    group.userData.beastName = beat.name;
    group.userData.elite = !!beat.elite;

    // Palette du biome : on recolore le monstre assemblé.
    const variant = (rng() - 0.5) * 0.12;
    recolorMesh(group, biomeHue, variant);

    // Taille selon élite (plus petits que les monstres joueurs).
    const scale = beat.elite ? 0.7 : 0.5;
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);

    // Le monstre doit reposer sur le sol (y=0) : on remonte son centre de
    // la demi-hauteur de sa bounding box pour éviter qu'il ne clip dans le sol.
    const bbox = new THREE.Box3().setFromObject(group);
    const baseY = -bbox.min.y;

    return {
      group,
      baseY,
      baseScale: scale,
      phase: expeditionFoes.length * 1.9,
      beat,
      dying: false,
      dyingAt: 0,
      wanderX: (rng() - 0.5) * 2,
      wanderZ: (rng() - 0.5) * 2,
      wanderSpeed: 0.5 + rng() * 1.5
    };
  }

  /**
   * Ressources au sol éparpillées sur toute la ligne de l'expédition (visuel uniquement).
   * Jamais touchables par le joueur : elles restent sur expeditionRoot.
   */
  function buildJourneyResources(zone, rng) {
    const group = new THREE.Group();
    group.name = 'expedition-journey-resources';
    const count = 18;
    const color = new THREE.Color().setHSL(zone.hue, 0.55, 0.32);
    const rockMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 });

    for (let i = 0; i < count; i++) {
      const prop = new THREE.Group();
      const z = -12 + (i / count) * 24 + (rng() - 0.5) * 2.5;
      const x = (rng() - 0.5) * 6;
      const scale = 0.15 + rng() * 0.35;

      const kind = i % 4;
      if (kind === 0) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 * scale, 0), rockMat);
        rock.position.set(0, 0.15 * scale, 0);
        rock.scale.set(1, 0.6 + rng() * 0.5, 1);
        prop.add(rock);
      } else if (kind === 1) {
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3 * scale, 0), rockMat);
        crystal.position.set(0, 0.15 * scale, 0);
        crystal.scale.y = 1.4 + rng() * 1.2;
        prop.add(crystal);
      } else if (kind === 2) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.08 * scale, 0.5 * scale, 6), rockMat);
        stem.position.y = 0.25 * scale;
        prop.add(stem);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 8, 6), rockMat);
        cap.scale.y = 0.5;
        cap.position.y = 0.52 * scale;
        prop.add(cap);
      } else {
        const bone = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 4, 8), rockMat);
        bone.rotation.z = Math.PI / 2;
        bone.position.set(0, 0.2 * scale, 0);
        prop.add(bone);
      }

      placeOnGround(prop, x, z, 0, 0);
      prop.userData.travel = 0;
      prop.userData.spin = (rng() - 0.5) * 0.8;
      prop.userData.baseY = 0;
      group.add(prop);
    }

    return group;
  }

  /** Lumières flottantes sur le chemin d'expédition pour éclairer le monstre. */
  function buildJourneyLights(zone) {
    const group = new THREE.Group();
    group.name = 'expedition-journey-lights';
    const count = 12;
    const color = new THREE.Color().setHSL((zone.hue + 0.05) % 1, 0.8, 0.5);
    for (let i = 0; i < count; i++) {
      const z = -11 + (i / (count - 1)) * 22;
      const x = (Math.sin(i * 1.7) * 1.2);
      const light = new THREE.PointLight(color, 2, 6, 2);
      light.position.set(x, 1.4, z);
      light.castShadow = false;
      light.userData.baseZ = z;
      light.userData.baseX = x;
      light.userData.baseY = 1.4;
      light.userData.phase = i * 1.3;
      group.add(light);
      expeditionLights.push(light);
    }
    return group;
  }

  function buildEnvironment(zone) {
    const group = new THREE.Group();
    group.name = 'expedition-environment';
    const rng = seededRandom(hashText(zone.id));
    const color = new THREE.Color().setHSL(zone.hue, 0.55, 0.32);
    const glow = new THREE.Color().setHSL((zone.hue + 0.08) % 1, 0.85, 0.6);

    const rockMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: glow,
      emissive: glow,
      emissiveIntensity: 0.55,
      roughness: 0.3
    });

    for (let i = 0; i < 60; i++) {
      const prop = new THREE.Group();
      const x = (rng() - 0.5) * 10;
      const z = -12 + rng() * 24;
      const scale = 0.12 + rng() * 0.34;

      if (zone.id === 'fosses') {
        const stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05 * scale, 0.09 * scale, 0.7 * scale, 6),
          rockMat
        );
        stem.position.y = 0.35 * scale;
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.28 * scale, 8, 6),
          new THREE.MeshStandardMaterial({
            color: glow,
            emissive: glow,
            emissiveIntensity: 0.35,
            roughness: 0.7
          })
        );
        cap.scale.y = 0.55;
        cap.position.y = 0.72 * scale;
        prop.add(stem, cap);
      } else if (zone.id === 'verre' || zone.id === 'nebuleuse') {
        const crystal = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.35 * scale, 0),
          glowMat
        );
        crystal.scale.y = 1.6 + rng() * 1.4;
        crystal.position.y = 0.3 * scale;
        crystal.rotation.z = (rng() - 0.5) * 0.5;
        prop.add(crystal);
      } else if (zone.id === 'sel') {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.35 * scale, 0),
          rockMat
        );
        rock.scale.set(1, 0.6 + rng() * 0.5, 1);
        rock.position.y = 0.18 * scale;
        prop.add(rock);
      } else {
        const blob = new THREE.Mesh(
          new THREE.SphereGeometry(0.28 * scale, 8, 6),
          rockMat
        );
        blob.scale.set(1.4, 0.55, 1.1);
        blob.position.y = 0.12 * scale;
        prop.add(blob);
        if (rng() > 0.65) {
          const vein = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 6, 4), glowMat);
          vein.position.set(0.08, 0.24 * scale, 0.05);
          prop.add(vein);
        }
      }

      placeOnGround(prop, x, z);
      prop.userData.travel = 0;
      prop.userData.spin = (rng() - 0.5) * 1.2;
      prop.userData.baseY = 0;
      group.add(prop);
    }

    return group;
  }

  function clearExpedition() {
    clearActorLabels();
    if (expeditionRoot) {
      scene.remove(expeditionRoot);
      disposeMonsterGroup(expeditionRoot);
      expeditionRoot = null;
    }
    expeditionActors = [];
    expeditionProps = [];
    expeditionFoes = [];
    expeditionLights = [];
    expeditionClock = null;
    expeditionMode = false;
    currentZone = null;
  }

  /**
   * Affiche une escouade en expédition : les monstres marchent, la zone défile.
   * @param {Array} monsters
   * @param {{zone:object, mode?:string, leaderId?:string}} opts
   */
  function setExpedition(monsters, opts = {}) {
    userMovedCamera = false;
    expeditionCamFollowTimer = 0;
    lastCameraTarget = null;

    const list = (monsters || []).filter(Boolean);
    if (!list.length) return;

    if (currentGroup) {
      scene.remove(currentGroup);
      disposeMonsterGroup(currentGroup);
      currentGroup = null;
      markerGroup = null;
    }
    clearExpedition();

    const zone = opts.zone || { id: 'fosses', hue: 0.28 };
    currentZone = zone;
    currentMonster = list[0];
    anchors = [];
    selection = null;
    builderMode = false;
    spawnAnim = null;

    // Le décor d'expédition reste aligné sur le monde : seule la caméra tourne
    // (orbite horizontale), jamais le sol ni les ressources.
    const root = new THREE.Group();
    expeditionRoot = root;
    scene.add(root);

    const leaderId = opts.leaderId || list[0].uid;
    const margin = 0.14;

    // Première passe : construire et scaler chaque monstre, mesurer sa largeur
    // finale pour les placer côte à côte sans clipping dans la preview 3D.
    const prepared = [];
    list.forEach((monster, index) => {
      const built = buildAssemblyMonster(monster);
      const actor = built.group;
      actor.updateMatrixWorld(true);

      const bbox = new THREE.Box3().setFromObject(actor);
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      let scale = 1.15 / maxDim;
      actor.scale.setScalar(scale);
      if (monster.uid !== leaderId) actor.scale.multiplyScalar(0.94);
      actor.updateMatrixWorld(true);

      const bbox2 = new THREE.Box3().setFromObject(actor);
      prepared.push({
        actor, built, monster, index,
        width: bbox2.max.x - bbox2.min.x,
        baseY: -bbox2.min.y
      });
    });

    // Largeur totale : largeurs des monstres + marges entre eux.
    let totalWidth = 0;
    prepared.forEach((p, i) => {
      totalWidth += p.width;
      if (i < prepared.length - 1) totalWidth += margin;
    });

    // Deuxième passe : placer côte à côte, centré sur l'origine.
    let cursorX = -totalWidth / 2;
    prepared.forEach((p) => {
      const { actor, monster, index } = p;
      cursorX += p.width / 2;
      const yaw = (index - (prepared.length - 1) / 2) * 0.12;
      placeOnGround(actor, cursorX, 0, yaw, p.baseY);
      actor.userData.baseYaw = yaw;
      actor.userData.yaw = 0;
      cursorX += p.width / 2 + margin;

      const role = ROLES[monster.role] || ROLES.harvester;
      const labelEl = createActorLabel(monster, role);

      root.add(actor);
      expeditionActors.push({
        group: actor,
        monster,
        role,
        roleKey: monster.role || 'harvester',
        baseX: actor.position.x,
        baseY: actor.position.y,
        phase: index * 1.7 + (hashText(monster.uid) % 100) / 100,
        labelEl,
        leader: monster.uid === leaderId
      });
    });

    const environment = buildEnvironment(zone);
    root.add(environment);
    expeditionProps = environment.children.slice();

    // Graine de l'expédition (déterministes pour ennemis et ressources).
    const expSeed = opts.seed || Math.floor(Math.random() * 2 ** 31);

    // Ressources au sol sur tout le chemin de l'expédition (visuel uniquement,
    // jamais touchables par le joueur).
    const journeyRng = seededRandom(expSeed + 777);
    const journeyResources = buildJourneyResources(zone, journeyRng);
    root.add(journeyResources);
    expeditionProps = expeditionProps.concat(journeyResources.children.slice());

    const journeyLights = buildJourneyLights(zone);
    root.add(journeyLights);

    // Ennemis : un par rencontre armée, tirés de la graine de l'expédition.
    // Ils sont assemblés comme des monstres joueurs et recolorés au biome.
    expeditionClock = {
      startedAt: opts.startedAt || Date.now(),
      duration: Math.max(1, opts.duration || 60)
    };
    expeditionFoes = [];
    const JOURNEY_START = -12;
    const JOURNEY_END = 12;
    for (const beat of opts.beats || []) {
      if (beat.kind !== 'enemy' || !beat.beast) continue;
      const foe = buildExpeditionBeast(beat.beast, zone.hue, expSeed);
      const lane = (expeditionFoes.length % 2 === 0 ? -1 : 1) * (0.35 + (expeditionFoes.length % 3) * 0.3);
      foe.laneX = lane;
      foe.beatZ = JOURNEY_START + beat.at * (JOURNEY_END - JOURNEY_START);
      foe.groundY = groundHeight(foe.laneX, foe.beatZ);
      placeOnGround(foe.group, foe.laneX, foe.beatZ, 0, foe.baseY);
      foe.beat = beat;
      foe.group.visible = false;
      foe.labelEl = createFoeLabel(beat.beast);
      root.add(foe.group);
      expeditionFoes.push(foe);
    }

    applyPalette(opts.hue ?? zone.hue);
    expeditionMode = true;

    if (currentFraming !== 'expedition') {
      placeCamera([0.9, 1.95, 6.3], 0.95, 'expedition');
    }
  }

  function setMonster(monster, opts = {}) {
    const { popUids = null, instant = false } = opts;

    clearExpedition();

    if (currentGroup) {
      // Defer disposal to next frame to avoid freeze
      const oldGroup = currentGroup;
      const oldMarkers = markerGroup;
      currentGroup = null;
      markerGroup = null;
      requestAnimationFrame(() => {
        scene.remove(oldGroup);
        disposeMonsterGroup(oldGroup);
        if (oldMarkers) oldMarkers.clear?.();
      });
    }

    currentMonster = monster;
    selection = null;
    if (!monster) {
      return;
    }

    const built = buildAssemblyMonster(monster);
    currentGroup = built.group;
    anchors = built.anchors;
    currentGroup.quaternion.copy(viewQuaternion);
    scene.add(currentGroup);

    const groupScale = fitGroup(currentGroup);
    applyPalette(built.hue);

    if (currentFraming !== 'idle') {
      const framing = idleFraming();
      placeCamera(framing.base, framing.targetY, 'idle');
    }


    markerGroup = createMarkerSet(anchors, groupScale);
    markerGroup.visible = false;
    currentGroup.add(markerGroup);

    // Animation de pousse
    spawnAnim = null;
    if (!instant) {
      const entries = [];
      const body = currentGroup.children.find(c => c === built.body);
      if (body && !popUids) {
        body.scale.setScalar(0.001);
        entries.push({ object: body, target: 1, delay: 0 });
      }
      for (const child of currentGroup.children) {
        if (!child.userData.partUid) continue;
        if (popUids && !popUids.includes(child.userData.partUid)) continue;
        const target = child.userData.baseScale || child.scale.x;
        child.scale.setScalar(0.001);
        entries.push({
          object: child,
          target,
          delay: popUids ? 0 : 0.06 + Math.random() * 0.32
        });
      }
      spawnAnim = { start: null, duration: 0.7, entries };
    }

    refreshMarkers();
  }

  function setBuilderMode(enabled) {
    builderMode = Boolean(enabled);
    if (markerGroup) markerGroup.visible = builderMode;
    refreshMarkers();
  }

  function setSelection(part, validSockets) {
    selection = part ? { part, validSockets: new Set(validSockets || []) } : null;
    refreshMarkers();
  }

  function clearSelection() {
    selection = null;
    refreshMarkers();
  }

  // -----------------------------------------------------------
  // RAYCAST / INTERACTION
  // -----------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  function updateNdc(event) {
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function visibleMarkerFromObject(object) {
    let node = object;
    while (node && node !== markerGroup) {
      if (node.userData?.isMarker) return node.visible ? node : null;
      node = node.parent;
    }
    return null;
  }

  function pickMarker(event) {
    if (!builderMode || !markerGroup || !markerGroup.visible) return null;
    updateNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(markerGroup, true);
    for (const hit of hits) {
      const marker = visibleMarkerFromObject(hit.object);
      if (marker) return marker;
    }
    return null;
  }

  function partUidFromObject(object) {
    if (!currentGroup) return null;
    let node = object;
    while (node && node !== currentGroup) {
      if (node.userData?.partUid) return node.userData.partUid;
      node = node.parent;
    }
    return null;
  }

  function activeRoot() {
    return expeditionMode ? expeditionRoot : currentGroup;
  }

  function pickPart(event) {
    if (expeditionMode || !currentGroup) return null;
    updateNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(currentGroup, true);
    for (const hit of hits) {
      const uid = partUidFromObject(hit.object);
      if (uid) return uid;
    }
    return null;
  }

  /**
   * Renvoie l'objet à faire tourner quand on attrape le monstre.
   * En expédition on ne prend que le spécimen touché : le décor (ressources,
   * props) ne doit jamais suivre la rotation.
   */
  function pickGrabTarget(event) {
    updateNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);

    if (expeditionMode) {
      if (!expeditionRoot) return null;
      const hits = raycaster.intersectObject(expeditionRoot, true);
      for (const hit of hits) {
        let node = hit.object;
        while (node && node.parent !== expeditionRoot) node = node.parent;
        const actor = expeditionActors.find(a => a.group === node);
        if (actor) return actor.group;
      }
      return null;
    }

    if (!currentGroup) return null;
    return raycaster.intersectObject(currentGroup, true).length ? currentGroup : null;
  }

  function setCursor(value) {
    canvas.style.cursor = value;
  }

  const interaction = {
    down: false,
    moved: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    marker: null,
    partUid: null,
    target: null
  };

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const marker = pickMarker(event);
    const partUid = marker ? null : pickPart(event);
    const grabTarget = marker || partUid ? null : pickGrabTarget(event);
    if (!marker && !partUid && !grabTarget) return;

    // Empêche OrbitControls de démarrer sur le monstre.
    event.stopImmediatePropagation();
    event.preventDefault();

    interaction.down = true;
    interaction.moved = false;
    interaction.startX = event.clientX;
    interaction.startY = event.clientY;
    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;
    interaction.marker = marker;
    interaction.partUid = partUid;
    interaction.target = grabTarget;
    setCursor('grabbing');
  }, { capture: true });

  window.addEventListener('pointermove', event => {
    if (!interaction.down) {
      const marker = builderMode ? pickMarker(event) : null;
      if (marker !== hoveredMarker) {
        if (hoveredMarker && hoveredMarker.userData.state === 'hover') {
          setMarkerState(hoveredMarker, selection?.validSockets?.has(hoveredMarker.userData.socket) ? 'valid' : 'available');
        }
        hoveredMarker = marker;
        if (hoveredMarker) setMarkerState(hoveredMarker, 'hover');
      }
      setCursor(marker || pickPart(event) ? 'pointer' : (pickGrabTarget(event) ? 'grab' : 'default'));
      return;
    }

    const dx = event.clientX - interaction.lastX;
    const dy = event.clientY - interaction.lastY;
    const totalDx = event.clientX - interaction.startX;
    const totalDy = event.clientY - interaction.startY;

    if (!interaction.moved && Math.hypot(totalDx, totalDy) > 6) {
      interaction.moved = true;
    }
    if (interaction.moved && interaction.target) {
      const target = interaction.target;
      if (expeditionMode) {
        // Rotation du spécimen autour de lui-même (le décor reste en place).
        target.userData.yaw = (target.userData.yaw || 0) + dx * 0.012;
      } else {
        const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        const qX = new THREE.Quaternion().setFromAxisAngle(axisY, dx * 0.01);
        const qY = new THREE.Quaternion().setFromAxisAngle(axisX, dy * 0.01);
        target.quaternion.premultiply(qX).premultiply(qY);
        viewQuaternion.copy(target.quaternion);
      }
    }

    interaction.lastX = event.clientX;
    interaction.lastY = event.clientY;
  });

  window.addEventListener('pointerup', () => {
    if (!interaction.down) {
      setCursor('grab');
      return;
    }
    const { marker, partUid, moved } = interaction;
    interaction.down = false;
    interaction.marker = null;
    interaction.partUid = null;
    interaction.target = null;
    setCursor('grab');

    if (moved) return;
    if (marker && options.onSocketClick) {
      options.onSocketClick(marker.userData.socket);
    } else if (partUid && options.onPartClick) {
      options.onPartClick(partUid);
    }
  });

  canvas.addEventListener('dblclick', () => {
    viewQuaternion.identity();
    for (const actor of expeditionActors) actor.group.userData.yaw = 0;
    const root = activeRoot();
    if (root) root.quaternion.identity();
  });

  // -----------------------------------------------------------
  // RESIZE + CAMÉRA
  // -----------------------------------------------------------
  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const renderScale = 0.5;
    renderer.setSize(Math.floor(width * renderScale), Math.floor(height * renderScale), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    frameCamera(width / height);

    // Update floor fog density based on camera distance
    floorUniforms.uFogDensity.value = 0.035;
  }

  let userMovedCamera = false;
  let lastCameraTarget = null;
  controls.addEventListener('start', () => { userMovedCamera = true; });

  function frameCamera() {
    if (userMovedCamera) return;
    if (currentFraming && currentFraming !== 'idle') return;
    const framing = idleFraming();
    placeCamera(framing.base, framing.targetY, 'idle');
  }

  window.addEventListener('resize', resize);

  // -----------------------------------------------------------
  // BOUCLE
  // -----------------------------------------------------------
  const clock = new THREE.Clock();
  let elapsed = 0;

  function updateSpawnAnim(dt) {
    if (!spawnAnim) return;
    if (spawnAnim.start === null) spawnAnim.start = elapsed;
    const t = elapsed - spawnAnim.start;

    let allDone = true;
    for (const entry of spawnAnim.entries) {
      const local = t - entry.delay;
      if (local <= 0) {
        if (entry.delay > 0.001) entry.object.scale.setScalar(0.001);
        allDone = false;
        continue;
      }
      const progress = Math.min(1, local / spawnAnim.duration);
      const ease = 1 - Math.pow(1 - progress, 3);
      const overshoot = Math.sin(progress * Math.PI) * 0.14;
      entry.object.scale.setScalar(entry.target * (ease + overshoot));
      if (progress < 1) allDone = false;
    }

    if (allDone) {
      for (const entry of spawnAnim.entries) entry.object.scale.setScalar(entry.target);
      spawnAnim = null;
    }
  }

  function updateFloorPalette(t) {
    // Lerp floor colors to match target palette
    const speed = 0.045;
    floorUniforms.uBg.value.lerp(targetColors.bg, speed);
    floorUniforms.uGrid.value.lerp(targetColors.grid, speed);
    floorUniforms.uFogColor.value.lerp(targetColors.skyBottom, speed);
  }

  function update(t) {
    const dt = Math.min(0.05, clock.getDelta());
    elapsed = t;

    particleMat.uniforms.uTime.value = t;
    floorUniforms.uTime.value = t;

    const speed = 0.045;
    skyUniforms.uColorTop.value.lerp(targetColors.skyTop, speed);
    skyUniforms.uColorBottom.value.lerp(targetColors.skyBottom, speed);
    particleMat.uniforms.uColor.value.lerp(targetColors.grid, speed);

    rimLight.color.lerp(targetColors.grid, speed);
    fillLight.color.lerp(targetColors.skyBottom, speed);
    scene.fog.color.lerp(targetColors.skyBottom, speed);
    aura.color.lerp(targetColors.grid, speed);

    updateFloorPalette(t);

    if (expeditionMode && expeditionRoot) {
      const now = Date.now();
      const span = expeditionClock ? expeditionClock.duration * 1000 : 1;
      const progress = expeditionClock
        ? Math.max(0, Math.min(1, (now - expeditionClock.startedAt) / span))
        : 0;
      const JOURNEY_START = -12;
      const JOURNEY_END = 12;

      // Combat en cours ? l'escouade s'arrete et l'ennemi reste devant.
      let inCombat = expeditionCombat && expeditionCombat.active;

      let camZ;
      if (inCombat) {
        camZ = expeditionCombat.foe.beatZ;
      } else {
        camZ = JOURNEY_START + progress * (JOURNEY_END - JOURNEY_START);
      }

      // Camera : suit TOUJOURS le monstre du joueur (escouade), même pendant
      // l'orbite du joueur. Quand le monstre avance, on décale target ET
      // camera.position du même delta pour conserver l'angle de vue choisi
      // par l'utilisateur. La caméra fait toujours face au monstre.
      const leader = expeditionActors[0];
      if (leader && !inCombat) {
        const targetPos = leader.group.position.clone();
        targetPos.y += 1.2; // regarde un peu au-dessus du monstre

        if (!lastCameraTarget) {
          lastCameraTarget = targetPos.clone();
        }

        const delta = new THREE.Vector3().subVectors(targetPos, lastCameraTarget);
        controls.target.copy(targetPos);
        camera.position.add(delta); // même décalage pour la caméra : angle conservé
        controls.update();
        lockElevation();
        lastCameraTarget.copy(targetPos);
      } else if (leader) {
        lastCameraTarget = null; // réinit au prochain frame hors combat
      }

      // Escouade du joueur : avance ou attend pendant le combat.
      for (const actor of expeditionActors) {
        const phase = actor.phase;
        if (inCombat) {
          actor.group.position.y = actor.baseY + Math.abs(Math.sin(t * 3 + phase)) * 0.02;
          actor.group.rotation.y = Math.sin(t * 1.5 + phase) * 0.1;
        } else {
          const wx = Math.sin(t * 0.7 + phase) * 0.25;
          actor.group.position.set(wx, actor.baseY, camZ - 4 + Math.sin(t * 3 + phase) * 0.1);
          actor.group.rotation.y = Math.sin(t * 2.2 + phase) * 0.2;
        }
        actor.group.rotation.y =
          (actor.group.userData.baseYaw || 0) +
          (actor.group.userData.yaw || 0) +
          (inCombat ? 0 : Math.sin(t * 2.2 + phase) * 0.2);

        // Animation des parties du monstre (tentacules, yeux, ailes, dents…).
        animateMonsterParts(actor.group, t);

        if (actor.labelEl) actor.labelEl.style.opacity = '1';
      }

      // Decors au sol : jamais deplaces (visuel uniquement, jamais touchables).
      for (const prop of expeditionProps) {
        prop.position.y = prop.userData.baseY + Math.sin(t * 1.4 + prop.position.x) * 0.035;
        prop.rotation.y += prop.userData.spin * dt;
      }

      // Rencontres : declenche le combat, puis reprend la route.
      if (expeditionClock) {
        if (!expeditionCombat && progress < 1 && !inCombat) {
          const playerZ = camZ - 4;
          for (const foe of expeditionFoes) {
            if (foe.dying) continue;
            const dist = playerZ - foe.beatZ;
            if (dist < 3.5 && dist > -0.5) {
              const foeIndex = expeditionFoes.indexOf(foe);
              const leader = expeditionActors[0];
              const leaderStats = leader ? monsterStats(leader.monster) : { force: 5, resistance: 5 };
              const foeMaxHp = Math.round(30 + foeIndex * 15 + (foe.beat && foe.beat.elite ? 20 : 0));
              const playerMaxHp = Math.round(50 + (leaderStats.resistance || 0) * 4);
              expeditionCombat = {
                active: true,
                foe,
                start: now,
                foeHp: foeMaxHp,
                foeMaxHp,
                playerHp: playerMaxHp,
                playerMaxHp,
                combatLog: [],
                turn: 'player',
                combatStarted: false,
                combatRng: mulberry32(now)
              };
              expeditionCombat.combatLog.push(`Un ${foe.beat.name}${foe.beat.elite ? ' élite' : ''} bloque la route !`);
              break;
            }
          }
        }

        for (const foe of expeditionFoes) {
          if (expeditionCombat && expeditionCombat.foe === foe && expeditionCombat.active) {
            // En combat : l'ennemi reste devant le joueur.
            foe.group.visible = true;
            foe.group.position.set(foe.laneX, foe.groundY + foe.baseY, foe.beatZ);
            foe.group.rotation.y = Math.sin(t * 2.2 + foe.phase) * 0.25;
            foe.group.scale.setScalar(foe.baseScale);
          } else if (foe.dying) {
            // Mort : inverse du spawn, recule dans le brouillard derriere.
            const k = Math.min(1, (now - foe.dyingAt) / 650);
            foe.group.visible = k < 1;
            foe.group.position.z = foe.beatZ + k * -7;
            foe.group.position.y = foe.groundY + foe.baseY - k * 0.22;
            foe.group.rotation.y = Math.sin(t * 2.2 + foe.phase) * 0.25 * (1 - k);
            foe.group.scale.setScalar(foe.baseScale * (1 - k * 0.55));
          } else if (!expeditionCombat || !expeditionCombat.active) {
            // Pas de combat : apparait de devant puis est croise.
            const dist = camZ - foe.beatZ;
            const approaching = dist < 6 && dist > -1;
            if (approaching) {
              const k = Math.min(1, Math.max(0, (6 - dist) / 8));
              foe.group.visible = true;
              foe.group.position.set(foe.laneX, foe.groundY + foe.baseY, foe.beatZ);
              foe.group.rotation.y = Math.sin(t * 2.2 + foe.phase) * 0.25;
              foe.group.scale.setScalar(foe.baseScale * (0.55 + 0.45 * k));
            } else if (foe.group.visible) {
              foe.group.visible = false;
            }
          }
        }
      }

      if (expeditionRoot) {
        expeditionRoot.position.y = Math.sin(t * 1.1) * 0.005;
      }
      // Animer les lumières du chemin (flottaison)
      for (const light of expeditionLights) {
        light.position.y = light.userData.baseY + Math.sin(t * 2 + light.userData.phase) * 0.15;
        light.position.x = light.userData.baseX + Math.cos(t * 1.5 + light.userData.phase) * 0.1;
      }
      updateActorLabels();
    }

    if (currentGroup) {
      animateMonsterParts(currentGroup, t);
      updateSpawnAnim(dt);
      currentGroup.position.y = baseGroupY + Math.sin(t * 1.1) * 0.012;
    }

    if (markerGroup && markerGroup.visible) {
      for (const marker of markerGroup.children) {
        if (!marker.visible) continue;
        const ring = marker.children[0];
        const core = marker.children[1];
        const phase = marker.userData.socket * 0.7;
        const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + phase);
        if (ring) {
          const base = marker.userData.state === 'valid' ? 0.75 : 0.3;
          ring.material.opacity = base + pulse * 0.18;
        }
        if (core) {
          core.scale.setScalar(0.8 + pulse * 0.5);
        }
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }

  // ------------------------------------------------ COMBAT D'EXPEDITION ----
  /**
   * Action du joueur pendant un combat d'expédition.
   * @param {string} action - 'attack' ou 'flee'
   * @returns {Object} Résultat du combat
   */
  function expeditionCombatAction(action) {
    if (!expeditionCombat || !expeditionCombat.active) return { result: 'none' };
    const { foe, combatLog, combatRng } = expeditionCombat;
    const leader = expeditionActors[0];
    const leaderStats = leader ? monsterStats(leader.monster) : { force: 5, resistance: 5 };
    const rng = combatRng || mulberry32(Date.now());

    if (action === 'flee') {
      expeditionCombat.active = false;
      expeditionCombat = null;
      return { result: 'flee' };
    }

    if (action === 'attack') {
      // Dégâts du joueur
      const playerDmg = Math.round((leaderStats.force || 5) * 1.2 + rng() * 10);
      expeditionCombat.foeHp -= playerDmg;
      combatLog.push(`Vous infligez ${playerDmg} dégâts à ${foe.beat.name}.`);

      if (expeditionCombat.foeHp <= 0) {
        // Victoire : l'ennemi meurt, butin et XP
        expeditionCombat.active = false;
        expeditionCombat.foe.dying = true;
        expeditionCombat.foe.dyingAt = now;
        const zone = currentZone || { id: 'fosses', biomass: 160, xp: 15 };
        const loot = rollLoot(zone, leaderStats, rng, 'expedition:combat', 1);
        expeditionCombat.loot = loot;
        expeditionCombat.xp = zone.xp;
        expeditionCombat.biomass = zone.biomass;
        expeditionCombat.result = 'victory';
        return { result: 'victory', loot, xp: zone.xp, biomass: zone.biomass, damage: playerDmg };
      }

      // Riposte de l'ennemi
      const foeDmg = Math.round((5 + expeditionCombat.foeIndex * 5) * 0.8 + rng() * 8);
      expeditionCombat.playerHp -= foeDmg;
      combatLog.push(`L'ennemi vous inflige ${foeDmg} dégâts.`);

      if (expeditionCombat.playerHp <= 0) {
        // Défaite : fin de l'expédition
        expeditionCombat.active = false;
        expeditionCombat = null;
        return { result: 'defeat', damage: foeDmg };
      }

      return { result: 'continue', damage: playerDmg, foeDamage: foeDmg };
    }

    return { result: 'none' };
  }

  /**
   * Retourne l'état actuel du combat pour l'UI.
   */
  function getExpeditionCombat() {
    return expeditionCombat;
  }

  function start() {
    resize();
    const loop = () => {
      requestAnimationFrame(loop);
      update(clock.getElapsedTime());
    };
    loop();
  }

  return {
    renderer, scene, camera, controls,
    setMonster,
    setExpedition,
    setBuilderMode,
    setSelection,
    clearSelection,
    refreshMarkers,
    resize,
    start,
    update,
    getGroup: () => currentGroup,
    getMonster: () => currentMonster,
    getAnchors: () => anchors,
    isExpeditionMode: () => expeditionMode,
    getExpeditionActors: () => expeditionActors,
    getExpeditionZone: () => currentZone,
    floorUniforms,
    expeditionCombatAction,
    getExpeditionCombat
  };
}