const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const button = document.querySelector('[data-action="claim-expedition"]');
if (!button) return { error: 'aucun bouton réclamer', exp: game.state.expeditions.length };
const membersBefore = game.expeditionMembers(game.state.expeditions[0]).map(m => ({ name: m.name, role: m.role, xp: m.xp }));
button.click();
await sleep(1200);

return {
  membersBefore,
  expeditions: game.state.expeditions.length,
  done: game.state.records.expeditionsDone,
  modal: document.querySelector('.modal h2')?.textContent || null,
  modalSubtitle: document.querySelector('.modal .modal-head p.small')?.textContent || null,
  sceneMode: ui.scene.isExpeditionMode(),
  labels: document.querySelectorAll('.actor-label').length,
  membersAfter: game.state.monsters.map(m => ({ name: m.name, role: m.role, xp: m.xp, level: m.level }))
};
