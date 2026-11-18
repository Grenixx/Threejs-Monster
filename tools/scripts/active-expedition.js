const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));
document.querySelector('[data-tab="labo"]').click();
await sleep(250);
const monster = game.selectedMonster;
const active = game.activeExpedition(monster.uid);
if (!active) game.startExpedition(monster.uid, 'fosses');
await sleep(500);
const pill = document.getElementById('stageExpedition').getBoundingClientRect();
return {
  active: game.state.expeditions.length,
  pill: { left: Math.round(pill.left), right: Math.round(pill.right), top: Math.round(pill.top) },
  panelLeft: Math.round(document.getElementById('panel').getBoundingClientRect().left),
  text: document.getElementById('stageExpedition').textContent.replace(/\s+/g, ' ').trim()
};
