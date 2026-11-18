const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="labo"]').click();
await sleep(200);
document.querySelector('[data-action="open-feed"]').click();
await sleep(400);

const before = {
  biomass: game.state.resources.biomass,
  xp: game.selectedMonster.xp,
  level: game.selectedMonster.level
};

const input = document.querySelector('#feedBiomassInput');
input.value = '300';
input.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(150);
document.querySelector('[data-modal-action="confirm-feed"]').click();
await sleep(700);

return {
  before,
  after: {
    biomass: game.state.resources.biomass,
    xp: game.selectedMonster.xp,
    level: game.selectedMonster.level
  },
  fed: game.state.records.biomassFed,
  modal: Boolean(document.querySelector('.modal'))
};
