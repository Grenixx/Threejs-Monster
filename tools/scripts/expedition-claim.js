const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="expeditions"]').click();
await sleep(250);

const monster = game.selectedMonster;
const launch = game.startExpedition(monster.uid, 'fosses');
if (!launch.ok) return { error: launch.reason };

await sleep(300);
const exp = game.state.expeditions.find(e => e.id === launch.expedition.id);
exp.endsAt = Date.now() - 500;
exp.notified = false;
game.tick(Date.now());
await sleep(600);

const claimButton = document.querySelector('[data-action="claim-all"]');
if (!claimButton) return { error: 'bouton claim-all introuvable', exp: !!exp };
claimButton.click();
await sleep(700);

return {
  expeditions: game.state.expeditions.length,
  biomass: game.state.resources.biomass,
  shards: game.state.resources.shards,
  modal: document.querySelector('.modal') ? document.querySelector('.modal h2')?.textContent : null,
  loot: document.querySelectorAll('.modal .attach-row').length
};
