import * as THREE from 'three';
import { createScene } from './scene.js';

const threeCanvas = document.getElementById('threeCanvas');
const rerollBtn = document.getElementById('rerollBtn');
const nameEl = document.getElementById('monsterName');
const seedEl = document.getElementById('monsterSeed');
const partsEl = document.getElementById('monsterParts');

const { renderer, scene, camera, controls, spawnMonster, getCurrentMonster, update } =
  createScene(threeCanvas);

// =========================================================
// GESTION DU CLIC ET DU DRAG (Rotation libre 360°)
// =========================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDraggingMonster = false;
let previousMousePosition = { x: 0, y: 0 };

// Pré-allocation des objets pour éviter le garbage collector
const qX = new THREE.Quaternion();
const qY = new THREE.Quaternion();
const axisX = new THREE.Vector3();
const axisY = new THREE.Vector3();

renderer.domElement.addEventListener('pointerdown', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const monster = getCurrentMonster();

  if (monster) {
    const intersects = raycaster.intersectObject(monster, true);
    if (intersects.length > 0) {
      isDraggingMonster = true;
      controls.enabled = false;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    }
  }
});

window.addEventListener('pointermove', (e) => {
  if (isDraggingMonster) {
    const deltaX = e.clientX - previousMousePosition.x;
    const deltaY = e.clientY - previousMousePosition.y;

    const monster = getCurrentMonster();
    if (monster) {
      // 1. On récupère les axes X et Y "locaux" de la caméra
      // Ça permet de tourner le monstre par rapport à ce que l'on voit à l'écran
      axisX.set(1, 0, 0).applyQuaternion(camera.quaternion);
      axisY.set(0, 1, 0).applyQuaternion(camera.quaternion);

      // 2. On crée les rotations (vitesse de 0.01)
      qX.setFromAxisAngle(axisY, deltaX * 0.01);
      qY.setFromAxisAngle(axisX, deltaY * 0.01);

      // 3. On applique la rotation au monstre (premultiply = par rapport au monde)
      // Aucune limite n'est imposée, on peut le retourner dans tous les sens
      monster.quaternion.premultiply(qX).premultiply(qY);
    }

    previousMousePosition = { x: e.clientX, y: e.clientY };
  }
});

window.addEventListener('pointerup', () => {
  if (isDraggingMonster) {
    isDraggingMonster = false;
    controls.enabled = true;
  }
});

// =========================================================
// BOUTON REROLL
// =========================================================
function reroll() {
  const info = spawnMonster();
  nameEl.textContent = info.name;
  seedEl.textContent = `seed : ${info.seed}`;
  partsEl.textContent = `${info.partCount} parties`;

  // Reset de la rotation
  const monster = getCurrentMonster();
  if (monster) {
    monster.quaternion.identity(); // Remet la rotation à zéro
  }
}

rerollBtn.addEventListener('click', reroll);
reroll();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// =========================================================
// BOUCLE D'ANIMATION
// =========================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  controls.update();
  update(t);

  // Le monstre ne tourne plus automatiquement.
  // Sa rotation dépend uniquement de tes clics/glissers.

  renderer.render(scene, camera);
}

animate();
