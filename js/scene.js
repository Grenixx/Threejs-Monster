import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag, skyVert, skyFrag } from './shaders.js';
import { ROLES } from './data.js';
import {
  buildAssemblyMonster, animateMonsterParts, disposeMonsterGroup
} from './monsterBuilder.js';

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
  controls.target.set(0, 1.25, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.update();

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
  let expeditionActors = [];
  let expeditionProps = [];
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

    for (let i = 0; i < 28; i++) {
      const prop = new THREE.Group();
      const x = (rng() - 0.5) * 7.5;
      const z = -6 + rng() * 7.2;
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

      prop.position.set(x, 0, z);
      prop.userData.travel = 0.35 + rng() * 0.8;
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
    expeditionMode = false;
    currentZone = null;
  }

  /**
   * Affiche une escouade en expédition : les monstres marchent, la zone défile.
   * @param {Array} monsters
   * @param {{zone:object, mode?:string, leaderId?:string}} opts
   */
  function setExpedition(monsters, opts = {}) {
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

    const root = new THREE.Group();
    root.quaternion.copy(viewQuaternion);
    expeditionRoot = root;
    scene.add(root);

    const offsets = list.length === 1 ? [0] : list.length === 2 ? [-1.3, 1.3] : [-1.75, 0, 1.75];
    const leaderId = opts.leaderId || list[0].uid;

    list.forEach((monster, index) => {
      const built = buildAssemblyMonster(monster);
      const actor = built.group;
      actor.updateMatrixWorld(true);

      const bbox = new THREE.Box3().setFromObject(actor);
      const size = bbox.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const scale = 1.15 / maxDim;
      actor.scale.setScalar(scale);
      actor.updateMatrixWorld(true);

      const bbox2 = new THREE.Box3().setFromObject(actor);
      const baseX = offsets[index];
      actor.position.set(baseX, 0.02 - bbox2.min.y, 0);
      actor.rotation.y = (index - (list.length - 1) / 2) * 0.12;


      const role = ROLES[monster.role] || ROLES.harvester;
      const labelEl = createActorLabel(monster, role);

      if (monster.uid !== leaderId) {
        actor.scale.multiplyScalar(0.94);
      }

      root.add(actor);
      expeditionActors.push({
        group: actor,
        monster,
        role,
        roleKey: monster.role || 'harvester',
        baseX,
        baseY: actor.position.y,
        phase: index * 1.7 + (hashText(monster.uid) % 100) / 100,
        labelEl,
        leader: monster.uid === leaderId
      });
    });

    const environment = buildEnvironment(zone);
    root.add(environment);
    expeditionProps = environment.children.slice();

    applyPalette(opts.hue ?? zone.hue);
    expeditionMode = true;

    if (!userMovedCamera) {
      controls.target.set(0, 0.95, 0);
      camera.position.set(0.9, 1.95, 6.3);
      controls.update();
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

    if (!userMovedCamera) {
      controls.target.set(0, 1.18, 0);
      camera.position.set(0.85, 1.95, 5.7);
      controls.update();
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

  function pickMonsterHit(event) {
    const root = activeRoot();
    if (!root) return false;
    updateNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);
    return raycaster.intersectObject(root, true).length > 0;
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
    partUid: null
  };

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const marker = pickMarker(event);
    const partUid = marker ? null : pickPart(event);
    if (!marker && !partUid && !pickMonsterHit(event)) return;

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
      setCursor(marker || pickPart(event) ? 'pointer' : (pickMonsterHit(event) ? 'grab' : 'default'));
      return;
    }

    const dx = event.clientX - interaction.lastX;
    const dy = event.clientY - interaction.lastY;
    const totalDx = event.clientX - interaction.startX;
    const totalDy = event.clientY - interaction.startY;

    if (!interaction.moved && Math.hypot(totalDx, totalDy) > 6) {
      interaction.moved = true;
    }
    if (interaction.moved) {
      const root = activeRoot();
      if (!root) return;
      const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      const qX = new THREE.Quaternion().setFromAxisAngle(axisY, dx * 0.01);
      const qY = new THREE.Quaternion().setFromAxisAngle(axisX, dy * 0.01);
      root.quaternion.premultiply(qX).premultiply(qY);
      viewQuaternion.copy(root.quaternion);
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
  controls.addEventListener('start', () => { userMovedCamera = true; });

  function frameCamera(aspect) {
    if (userMovedCamera) return;
    const mobile = window.innerWidth <= 980;
    const landscape = window.innerWidth > window.innerHeight && window.innerHeight < 560;
    const distance = landscape ? 7.3 : mobile ? 6.6 : aspect < 0.9 ? 6.2 : aspect < 1.35 ? 5.9 : 5.7;
    camera.position.set(0.85, landscape ? 2.55 : mobile ? 2.35 : 2.0, distance);
    controls.target.set(0, landscape ? 1.72 : mobile ? 1.62 : 1.3, 0);
    controls.update();
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
      const travel = 1.0;
      for (const actor of expeditionActors) {
        const phase = actor.phase;
        const walk = Math.sin(t * 5.2 + phase);
        actor.group.position.x = actor.baseX + Math.sin(t * 0.7 + phase) * 0.08;
        actor.group.position.z = Math.sin(t * 0.45 + phase) * 0.12;
        actor.group.position.y = actor.baseY + Math.abs(walk) * 0.035;

        if (actor.roleKey === 'raider') {
          const lunge = Math.max(0, Math.sin(t * 1.3 + phase)) ** 6;
          actor.group.position.z += lunge * 0.18;
          actor.group.rotation.x = -lunge * 0.08;
        } else if (actor.roleKey === 'harvester') {
          actor.group.rotation.z = Math.sin(t * 1.6 + phase) * 0.04;
        } else if (actor.roleKey === 'guardian') {
          actor.group.rotation.y = Math.sin(t * 0.8 + phase) * 0.12;
        } else {
          actor.group.position.z -= 0.12;
          actor.group.rotation.y = Math.sin(t * 1.1 + phase) * 0.18;
        }

        if (actor.labelEl) {
          actor.labelEl.style.opacity = '1';
        }
      }

      for (const prop of expeditionProps) {
        prop.position.z += prop.userData.travel * dt * 0.9;
        if (prop.position.z > 4.5) prop.position.z -= 11;
        prop.position.y = prop.userData.baseY + Math.sin(t * 1.4 + prop.position.x) * 0.035;
        prop.rotation.y += prop.userData.spin * dt;
      }

      if (expeditionRoot) {
        expeditionRoot.position.y = Math.sin(t * 1.1) * 0.005;
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
    floorUniforms
  };
}