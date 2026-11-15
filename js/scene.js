import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag, sphereVert, sphereFrag } from './shaders.js';

export function createScene(canvas) {
  // =========================================================
  // RENDERER
  // =========================================================
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false
  });
  renderer.setPixelRatio(0.3);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // =========================================================
  // SCÈNE
  // =========================================================
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08060f);
  scene.fog = new THREE.FogExp2(0x08060f, 0.08);

  // =========================================================
  // CAMÉRA
  // =========================================================
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100
  );
  camera.position.set(3, 2.5, 5);

  // =========================================================
  // ORBITE
  // =========================================================
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.8, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();

  // =========================================================
  // LUMIÈRES (pour le sol et éventuels futurs objets standard)
  // =========================================================
  scene.add(new THREE.HemisphereLight(0x4455ff, 0x220044, 0.6));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, 6, 3);
  scene.add(keyLight);

  // =========================================================
  // SOL
  // =========================================================
  const floorUniforms = {
    uTime: { value: 0 },
    uGrid: { value: new THREE.Color(0x7a3ff2) },
    uBg:   { value: new THREE.Color(0x08060f) }
  };
  const floorMat = new THREE.ShaderMaterial({
    uniforms: floorUniforms,
    vertexShader: floorVert,
    fragmentShader: floorFrag
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // =========================================================
  // SPHÈRE avec ShaderMaterial custom (displacement + normales)
  // =========================================================
  const SPHERE_RADIUS = 0.8;

  const sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 96, 96);

  const sphereUniforms = {
    uTime:      { value: 0 },
    uNoiseFreq: { value: 2.5 },
    uNoiseAmp:  { value: 0.15 },
    uSpeed:     { value: 1.0 },
    uRadius:    { value: SPHERE_RADIUS },
    uColor:     { value: new THREE.Color(0x7b3fc4) },
    uLightPos:  { value: new THREE.Vector3(3, 6, 3) },
    uCameraPos: { value: new THREE.Vector3() }
  };

  const sphereMat = new THREE.ShaderMaterial({
    uniforms: sphereUniforms,
    vertexShader: sphereVert,
    fragmentShader: sphereFrag
  });

  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.y = SPHERE_RADIUS;
  scene.add(sphere);

  // =========================================================
  // RETURN
  // =========================================================
  return {
    renderer,
    scene,
    camera,
    controls,
    sphere,
    floorUniforms,
    sphereUniforms
  };
}
