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
// ANIMATION DE TEXTE (HACKER SCRAMBLE)
// =========================================================
const CHARS = "!<>-_\\/[]{}—=+*^?#________";
let textIntervals = {};

function scrambleText(el, newText, duration = 800) {
  // Annule l'animation précédente sur cet élément s'il y en a une
  if (textIntervals[el.id]) clearInterval(textIntervals[el.id]);

  const totalFrames = Math.floor(duration / 30); // ~30ms par frame
  let frame = 0;

  textIntervals[el.id] = setInterval(() => {
    let display = "";
    // On itère sur la longueur du nouveau texte
    for (let i = 0; i < newText.length; i++) {
      // Le point de révélation progresse avec le temps
      const revealPoint = (frame / totalFrames) * newText.length;

      if (i < revealPoint) {
        display += newText[i]; // La lettre est révélée
      } else {
        // Sinon on affiche un caractère aléatoire
        display += CHARS[Math.floor(Math.random() * CHARS.length)];
      }
    }
    el.textContent = display;

    frame++;
    if (frame >= totalFrames) {
      clearInterval(textIntervals[el.id]);
      el.textContent = newText; // Sécurité : on s'assure que le texte final est parfait
    }
  }, 30);
}

// =========================================================
// GESTION DU CLIC ET DU DRAG
// =========================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDraggingMonster = false;
let previousMousePosition = { x: 0, y: 0 };

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
      axisX.set(1, 0, 0).applyQuaternion(camera.quaternion);
      axisY.set(0, 1, 0).applyQuaternion(camera.quaternion);

      qX.setFromAxisAngle(axisY, deltaX * 0.01);
      qY.setFromAxisAngle(axisX, deltaY * 0.01);

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
// ANIMATION DES PARTIES
// =========================================================
function animateMonster(monster, time) {
  if (!monster) return;

  const t = time * 0.5;

  monster.traverse(child => {
    if (!child.userData.animType) return;

    // 1. TENTACULES
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

            const waveX = Math.sin(t * 2.5 + phase + progress * 4) * amp;
            const waveZ = Math.cos(t * 2.0 + phase * 1.3 + progress * 4) * amp;

            pos.setX(i, bx + waveX);
            pos.setZ(i, bz + waveZ);
          }
          pos.needsUpdate = true;
          mesh.geometry.computeVertexNormals();
        } else {
          const progress = Math.max(0, Math.min(1, meshBaseY / maxHeight));
          const amp = progress * progress * 0.25;

          const waveX = Math.sin(t * 2.5 + phase + progress * 4) * amp;
          const waveZ = Math.cos(t * 2.0 + phase * 1.3 + progress * 4) * amp;

          mesh.position.x = mesh.userData.basePos.x + waveX;
          mesh.position.z = mesh.userData.basePos.z + waveZ;
        }
      });
    }

    // 2. YEUX
    if (child.userData.animType === 'eye') {
      const phase = child.userData.phase;
      child.rotation.y = Math.sin(t * 1.2 + phase) * 0.5;
      child.rotation.x = Math.cos(t * 0.9 + phase) * 0.3;
    }

    // 3. DENTS
    if (child.userData.animType === 'tooth') {
      const phase = child.userData.phase;
      const chewX = Math.sin(t * 4.0 + phase) * 0.15;
      const chewZ = Math.cos(t * 4.0 + phase) * 0.15;

      const chewQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(chewX, 0, chewZ));
      child.quaternion.copy(child.userData.baseQuat).multiply(chewQuat);
    }

    // 4. AILES
    if (child.userData.animType === 'wing') {
      const phase = child.userData.phase;
      const flapX = Math.sin(t * 2.0 + phase) * 0.6;
      const flapQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(flapX, 0, 0));
      child.quaternion.copy(child.userData.baseQuat).multiply(flapQuat);
    }
  });
}

// =========================================================
// BOUTON REROLL (Avec animation de texte)
// =========================================================
function reroll() {
  const info = spawnMonster();

  // Lancement des animations de texte
  scrambleText(nameEl, info.name.toUpperCase(), 600);
  scrambleText(seedEl, `seed : ${info.seed}`, 800);
  scrambleText(partsEl, `${info.partCount} parties`, 700);

  const monster = getCurrentMonster();
  if (monster) {
    monster.quaternion.identity();
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

  animateMonster(getCurrentMonster(), t);

  renderer.render(scene, camera);
}

animate();
