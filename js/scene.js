import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag, skyVert, skyFrag } from './shaders.js';
import { rollMonster, buildMonster } from './monsterBuilder.js';
import { randomSeed } from './rng.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false
  });
  renderer.setPixelRatio(0.35);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060210, 0.04);

  const camera = new THREE.PerspectiveCamera(
    42, window.innerWidth / window.innerHeight, 0.1, 100
  );
  camera.position.set(2.2, 1.8, 3.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI / 2 + 0.15;
  controls.update();

  // =========================================================
  // CIEL (avec uniforms de couleur)
  // =========================================================
  const skyUniforms = {
    uColorTop: { value: new THREE.Color(0x010003) },
    uColorBottom: { value: new THREE.Color(0x1a032a) }
  };
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 32), skyMat));

  // =========================================================
  // ÉCLAIRAGE
  // =========================================================
  scene.add(new THREE.HemisphereLight(0x6644ff, 0x110022, 0.3));

  const keyLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  keyLight.position.set(4, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left   = -4;
  keyLight.shadow.camera.right  =  4;
  keyLight.shadow.camera.top    =  4;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.camera.near   =  0.5;
  keyLight.shadow.camera.far    =  15;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x4477ff, 8, 10, 2);
  fillLight.position.set(-3, 2, 2);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff55aa, 15, 10, 2);
  rimLight.position.set(0, 1.5, -3);
  scene.add(rimLight);

  const spotLight = new THREE.SpotLight(0xffffff, 80, 15, Math.PI / 5, 0.5, 2);
  spotLight.position.set(0, 6, 0);
  spotLight.castShadow = true;
  spotLight.shadow.mapSize.set(1024, 1024);
  spotLight.shadow.bias = -0.0005;
  scene.add(spotLight);
  scene.add(spotLight.target);

  // =========================================================
  // SOL AVEC VOLUME (Collines)
  // =========================================================
  const floorUniforms = {
    uTime: { value: 0 },
    uGrid: { value: new THREE.Color(0x7a3ff2) },
    uBg:   { value: new THREE.Color(0x060210) }
  };

  // Géométrie subdivisée (128x128 segments pour avoir de belles courbes)
  const floorGeo = new THREE.PlaneGeometry(60, 60, 128, 128);
  const pos = floorGeo.attributes.position;

  // Déplacement des vertices pour créer des collines
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // correspond à -Z dans le monde

    // Distance par rapport au centre
    const dist = Math.sqrt(x * x + y * y);

    // On garde le centre parfaitement plat (rayon 3)
    const flatZone = 3.0;
    const falloff = Math.min(1, Math.max(0, (dist - flatZone) / 10));

    // Fonction de bruit simple
    const noise = Math.sin(x * 0.3) * Math.cos(y * 0.3) * 1.2
                + Math.sin(x * 0.8) * Math.cos(y * 0.9) * 0.4
                + Math.sin(x * 2.0) * Math.cos(y * 2.0) * 0.1;

    // Décalage vertical (Z local, qui devient Y après rotation)
    pos.setZ(i, noise * falloff);
  }
  floorGeo.computeVertexNormals();

  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: floorVert,
      fragmentShader: floorFrag
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // =========================================================
  // PARTICULES (Poussière magique)
  // =========================================================
  const particleCount = 300;
  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const speeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = Math.random() * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    speeds[i] = 0.2 + Math.random() * 0.8;
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
        vec3 pos = position;
        pos.y = mod(pos.y + uTime * aSpeed, 10.0);
        vAlpha = smoothstep(0.0, 1.0, pos.y / 10.0) * smoothstep(10.0, 9.0, pos.y);
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 4.0 * (10.0 / -mv.z);
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
        float a = smoothstep(1.0, 0.2, r);
        gl_FragColor = vec4(uColor, a * vAlpha * 0.8);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);

  // =========================================================
  // MONSTRE & PALETTE DYNAMIQUE
  // =========================================================
  let currentMonster = null;
  let currentDef = null;

  function applyPalette(hue) {
    // Couleur du monstre (base)
    const baseColor = new THREE.Color().setHSL(hue, 0.6, 0.5);

    // Couleur de la grille (plus saturée, teinte proche)
    const gridColor = new THREE.Color().setHSL((hue + 0.1) % 1.0, 0.8, 0.5);

    // Fond du sol (très sombre, teinte du monstre)
    const bgColor = new THREE.Color().setHSL(hue, 0.5, 0.04);

    // Ciel (dégradé dans les tons du monstre)
    const skyTop = new THREE.Color().setHSL(hue, 0.6, 0.01);
    const skyBottom = new THREE.Color().setHSL(hue, 0.5, 0.12);

    // Application
    floorUniforms.uGrid.value.copy(gridColor);
    floorUniforms.uBg.value.copy(bgColor);
    skyUniforms.uColorTop.value.copy(skyTop);
    skyUniforms.uColorBottom.value.copy(skyBottom);
    particleMat.uniforms.uColor.value.copy(gridColor);

    // On adapte aussi les lumières
    rimLight.color.copy(gridColor);
    fillLight.color.copy(skyBottom);
    scene.fog.color.copy(bgColor);
  }

  function spawnMonster() {
    if (currentMonster) {
      scene.remove(currentMonster);
      currentMonster.traverse(obj => {
        if (obj.isMesh) obj.geometry?.dispose?.();
      });
    }

    const seed = randomSeed();
    currentDef = rollMonster(seed);
    currentMonster = buildMonster(currentDef);

    // Auto-fit et placement sur le sol (Y=0)
    const bbox = new THREE.Box3().setFromObject(currentMonster);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 2.4;
    const scale = targetSize / maxDim;
    currentMonster.scale.setScalar(scale);

    const bbox2 = new THREE.Box3().setFromObject(currentMonster);
    currentMonster.position.y = -bbox2.min.y; // Pose exactement sur le sol

    scene.add(currentMonster);

    // On applique la palette du monstre à l'environnement
    applyPalette(currentDef.baseHue);

    return {
      name: currentDef.name,
      seed: currentDef.seed,
      partCount: currentDef.parts.length
    };
  }

  // =========================================================
  // UPDATE
  // =========================================================
  function update(t) {
    floorUniforms.uTime.value = t;
    particleMat.uniforms.uTime.value = t;
  }

  return {
    renderer, scene, camera, controls,
    spawnMonster,
    getCurrentMonster: () => currentMonster,
    update
  };
}
