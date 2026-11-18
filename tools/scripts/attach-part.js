const { game, scene } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="assemblage"]').click();
await sleep(300);
document.querySelector('.part-row[data-uid]').click();
await sleep(350);

const group = scene.getGroup();
const markers = group.getObjectByName('socket-markers');
const canvas = document.getElementById('threeCanvas');
const rect = canvas.getBoundingClientRect();

let best = null;
for (const marker of markers.children) {
  if (!marker.visible) continue;
  const world = marker.position.clone();
  marker.getWorldPosition(world);
  const normal = marker.position.clone();
  marker.getWorldDirection(normal);
  const toCam = scene.camera.position.clone().sub(world).normalize();
  const score = normal.dot(toCam);
  if (!best || score > best.score) best = { marker, world, score };
}

if (!best) return { error: 'aucun marqueur visible' };

const ndc = best.world.clone().project(scene.camera);
const x = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
const y = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;

canvas.dispatchEvent(new PointerEvent('pointerdown', {
  clientX: x, clientY: y, button: 0, pointerType: 'mouse', bubbles: true
}));
window.dispatchEvent(new PointerEvent('pointerup', {
  clientX: x, clientY: y, button: 0, pointerType: 'mouse', bubbles: true
}));
await sleep(700);

return {
  clicked: { x: Math.round(x), y: Math.round(y), score: Number(best.score.toFixed(2)) },
  attachments: game.selectedMonster.attachments.length,
  inventory: game.state.inventory.length,
  power: game.totalPower()
};
