import { createScene } from './scene.js';
import { Game } from './state.js';
import { UI } from './ui.js';
import { Net } from './net.js';

const canvas = document.getElementById('threeCanvas');
const game = new Game();

let ui = null;

const scene = createScene(canvas, {
  onSocketClick: socket => ui?.onSocketClick(socket),
  onPartClick: partUid => ui?.onPartClick(partUid)
});

ui = new UI({ game, scene });

const net = new Net(game, ui);
net.init().catch(() => {
  // Le jeu reste entièrement jouable en local.
});

scene.start();
game.tick();

setInterval(() => game.tick(), 1000);

window.addEventListener('beforeunload', () => {
  game.saveNow();
  net.flushSave().catch(() => {});
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.saveNow();
    net.flushSave().catch(() => {});
  } else {
    game.tick();
  }
});

// Accès de debug / outils.
window.__CHIMERE__ = { game, scene, ui, net };
