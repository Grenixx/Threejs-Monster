import * as THREE from 'three';
import { createScene } from './scene.js';

const threeCanvas = document.getElementById('threeCanvas');

const { renderer, scene, camera, controls, sphere, floorUniforms, sphereUniforms } =
  createScene(threeCanvas);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  controls.update();
  floorUniforms.uTime.value = t;
  sphereUniforms.uTime.value = t;
  sphereUniforms.uCameraPos.value.copy(camera.position);

  sphere.rotation.y = t * 0.3;
  sphere.position.y = 0.8 + Math.sin(t * 1.5) * 0.05;

  renderer.render(scene, camera);
}

animate();
