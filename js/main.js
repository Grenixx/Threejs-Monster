import * as THREE from 'three';
import { createScene } from './scene.js';

const threeCanvas = document.getElementById('threeCanvas');
const rerollBtn = document.getElementById('rerollBtn');
const nameEl = document.getElementById('monsterName');
const seedEl = document.getElementById('monsterSeed');
const partsEl = document.getElementById('monsterParts');

const { renderer, scene, camera, controls, spawnMonster, getCurrentMonster, update } =
  createScene(threeCanvas);

function reroll() {
  const info = spawnMonster();
  nameEl.textContent = info.name;
  seedEl.textContent = `seed : ${info.seed}`;
  partsEl.textContent = `${info.partCount} parties`;
}

rerollBtn.addEventListener('click', reroll);
reroll();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  controls.update();
  update(t); // Met à jour les particules, anneaux, etc.

  const m = getCurrentMonster();
  if (m) m.rotation.y = t * 0.4;

  renderer.render(scene, camera);
}

animate();
