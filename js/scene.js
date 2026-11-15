import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag } from './shaders.js';
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
  scene.background = new THREE.Color(0x060210);
  scene.fog = new THREE.FogExp2(0x060210, 0.12);

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
  // ÉCLAIRAGE
  // =========================================================
  scene.add(new THREE.HemisphereLight(0x6644ff, 0x110022, 0.4));

  const keyLight = new THREE.DirectionalLight(0xffeedd, 2.5);
  keyLight.position.set(4, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left   = -3;
  keyLight.shadow.camera.right  =  3;
  keyLight.shadow.camera.top    =  3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.camera.near   =  0.5;
  keyLight.shadow.camera.far    =  15;
  keyLight.shadow.bias = -0.0005;
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0x4477ff, 10, 10, 2);
  fillLight.position.set(-3, 2, 2);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xff55aa, 15, 10, 2);
  rimLight.position.set(0, 1.5, -3);
  scene.add(rimLight);

  // =========================================================
  // SOL
  // =========================================================
  const floorUniforms = {
    uTime: { value: 0 },
    uGrid: { value: new THREE.Color(0x7a3ff2) },
    uBg:   { value: new THREE.Color(0x060210) }
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
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
  // SOCLE
  // =========================================================
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 0.15, 32),
    new THREE.MeshStandardMaterial({
      color: 0x1a0a2e,
      roughness: 0.2,
      metalness: 0.9
    })
  );
  pedestal.position.y = 0.075;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.2, 0.02, 8, 48),
    new THREE.MeshBasicMaterial({ color: 0xaa55ff })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.16;
  scene.add(ring);

  // =========================================================
  // MONSTRE COURANT
  // =========================================================
  let currentMonster = null;
  let currentDef = null;

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

    // Calcul du rayon englobant réel du monstre
    const bbox = new THREE.Box3().setFromObject(currentMonster);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Normalise : le monstre fait toujours ~2.4 unités de haut
    const targetSize = 2.4;
    const scale = targetSize / maxDim;
    currentMonster.scale.setScalar(scale);

    // Recentre : le bbox est recalculé après scale
    const bbox2 = new THREE.Box3().setFromObject(currentMonster);
    currentMonster.position.y = 0.15 - bbox2.min.y;

    scene.add(currentMonster);

    return {
      name: currentDef.name,
      seed: currentDef.seed,
      partCount: currentDef.parts.length
    };
  }

  return {
    renderer, scene, camera, controls, floorUniforms,
    spawnMonster,
    getCurrentMonster: () => currentMonster
  };
}
