const { game, net } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (net.online) await net.resetServer();
await sleep(1000);

const monster = game.selectedMonster;
game.autoAssemble(monster.uid);
await sleep(1000);
game.feedMonster(monster.uid, 300);
await sleep(1000);
const launch = game.startExpedition(monster.uid, 'sel');
await sleep(800);
document.querySelector('[data-tab="labo"]').click();
await sleep(600);

return {
  launch: launch.ok,
  level: monster.level,
  power: game.state.records.bestPower,
  attachments: monster.attachments.length,
  expedition: game.state.expeditions[0]?.zoneId,
  biomass: game.state.resources.biomass,
  online: net.online
};
