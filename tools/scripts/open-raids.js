const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="expeditions"]').click();
await sleep(300);
document.querySelector('[data-action="exp-view"][data-view="raids"]').click();
await sleep(700);

return {
  expView: ui.expView,
  targets: ui.raidTargets.length,
  defense: game.labDefenseValue(),
  raids: game.state.raids.length,
  online: ui.net?.online || false,
  tabs: [...document.querySelectorAll('#tabs .tab')].map(t => t.textContent.trim())
};
