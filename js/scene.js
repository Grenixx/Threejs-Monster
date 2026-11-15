import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { floorVert, floorFrag, skyVert, skyFrag } from './shaders.js';
import { rollMonster, buildMonster } from './monsterBuilder.js';
import { randomSeed } from './rng.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
  renderer.setPixelRatio(0.35);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060210, 0.04);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(2.2, 1.8, 3.0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI / 2;
  controls.update();

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
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 32), skyMat));

  scene.add(new THREE.HemisphereLight(0x6644ff, 0x110022, 0.3));

  const keyLight = new THREE.DirectionalLight(0xffeedd, 1.5);
  keyLight.position.set(4, 6, 4);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -4;
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

  const floorUniforms = {
    uTime: { value: 0 },
    uGrid: { value: new THREE.Color(0x7a3ff2) },
    uBg:   { value: new THREE.Color(0x060210) },
    uFogColor: { value: new THREE.Color(0x060210) },
    uFogDensity: { value: 0.04 }
  };

  const floorGeo = new THREE.PlaneGeometry(200, 200, 128, 128);
  const pos = floorGeo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const dist = Math.sqrt(x * x + y * y);
    const flatZone = 4.0;
    const falloff = Math.min(1, Math.max(0, (dist - flatZone) / 15));

    const noise = Math.sin(x * 0.08) * Math.cos(y * 0.08) * 4.0
                + Math.sin(x * 0.3) * Math.cos(y * 0.3) * 1.2
                + Math.sin(x * 0.9) * Math.cos(y * 0.9) * 0.3;

    pos.setZ(i, noise * falloff);
  }
  floorGeo.computeVertexNormals();

  const floor = new THREE.Mesh(
    floorGeo,
    new THREE.ShaderMaterial({
      uniforms: floorUniforms,
      vertexShader: floorVert,
      fragmentShader: floorFrag,
      side: THREE.DoubleSide
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Particules
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

  let currentMonster = null;
  let currentDef = null;

  const targetColors = {
    grid: new THREE.Color(), bg: new THREE.Color(), skyTop: new THREE.Color(), skyBottom: new THREE.Color()
  };

  let spawnAnim = null;

  function applyPalette(hue) {
    targetColors.grid.setHSL((hue + 0.1) % 1.0, 0.8, 0.5);
    targetColors.bg.setHSL(hue, 0.5, 0.04);
    targetColors.skyTop.setHSL(hue, 0.6, 0.01);
    targetColors.skyBottom.setHSL(hue, 0.5, 0.12);
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

    const bbox = new THREE.Box3().setFromObject(currentMonster);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.4 / maxDim;

    // On applique le scale global au groupe
    currentMonster.scale.setScalar(scale);

    const bbox2 = new THREE.Box3().setFromObject(currentMonster);
    // On le place un peu plus haut (flottant)
    const finalY = -bbox2.min.y + 0.5;

    currentMonster.position.x = 0;
    currentMonster.position.y = finalY;
    currentMonster.position.z = 0;
    currentMonster.quaternion.identity();

    // --- PRÉPARATION DE L'ANIMATION DE CROISSANCE ---
    spawnAnim = {
      startTime: null,
      duration: 0.8,
      parts: []
    };

    currentMonster.children.forEach((child, index) => {
      // On sauvegarde la taille finale de chaque partie
      const targetScale = child.scale.x;
      // On réduit la taille à presque 0
      child.scale.setScalar(0.001);

      // Le corps (index 0) pousse immédiatement. Les autres parties ont un délai aléatoire.
      const delay = index === 0 ? 0 : 0.05 + Math.random() * 0.35;

      spawnAnim.parts.push({
        mesh: child,
        targetScale,
        delay
      });
    });

    scene.add(currentMonster);
    applyPalette(currentDef.baseHue);

    return {
      name: currentDef.name,
      seed: currentDef.seed,
      partCount: currentDef.parts.length
    };
  }

  function update(t) {
    floorUniforms.uTime.value = t;
    particleMat.uniforms.uTime.value = t;

    // --- Lerp couleurs ---
    const speed = 0.05;
    floorUniforms.uGrid.value.lerp(targetColors.grid, speed);
    floorUniforms.uBg.value.lerp(targetColors.bg, speed);
    floorUniforms.uFogColor.value.lerp(targetColors.skyBottom, speed);

    skyUniforms.uColorTop.value.lerp(targetColors.skyTop, speed);
    skyUniforms.uColorBottom.value.lerp(targetColors.skyBottom, speed);
    particleMat.uniforms.uColor.value.lerp(targetColors.grid, speed);

    rimLight.color.lerp(targetColors.grid, speed);
    fillLight.color.lerp(targetColors.skyBottom, speed);
    scene.fog.color.lerp(targetColors.skyBottom, speed);

    // --- ANIMATION DE CROISSANCE (L'effet "pousse") ---
    if (spawnAnim && currentMonster) {
      if (spawnAnim.startTime === null) spawnAnim.startTime = t;

      const elapsed = t - spawnAnim.startTime;

      spawnAnim.parts.forEach(p => {
        const localElapsed = elapsed - p.delay;

        // Si le délai est passé, la partie commence à pousser
        if (localElapsed > 0) {
          const progress = Math.min(1, localElapsed / spawnAnim.duration);

          // Ease-out cubic (rapide au début, ralentit à la fin)
          const ease = 1 - Math.pow(1 - progress, 3);

          // Petit overshoot (dépasse légèrement sa taille puis revient)
          const overshoot = Math.sin(progress * Math.PI) * 0.15;

          p.mesh.scale.setScalar(p.targetScale * (ease + overshoot));
        }
      });

      // Fin de l'animation
      if (elapsed > spawnAnim.duration + 0.6) {
        // On s'assure que toutes les tailles sont parfaites
        spawnAnim.parts.forEach(p => p.mesh.scale.setScalar(p.targetScale));
        spawnAnim = null;
      }
    }
  }

  return {
    renderer, scene, camera, controls,
    spawnMonster,
    getCurrentMonster: () => currentMonster,
    update
  };
}
