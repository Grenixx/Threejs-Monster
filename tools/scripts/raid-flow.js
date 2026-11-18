const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const monster = game.selectedMonster;
game.autoAssemble(monster.uid);
await sleep(500);
game.feedMonster(monster.uid, 240);
await sleep(500);

document.querySelector('[data-tab="expeditions"]').click();
await sleep(300);
document.querySelector('[data-action="exp-view"][data-view="raids"]').click();
await sleep(500);

const launch = document.querySelector('[data-action="launch-raid"]');
if (!launch) return { error: 'aucune cible' };
const targetName = launch.closest('.zone-card')?.querySelector('.zone-name')?.textContent.trim();
launch.click();
await sleep(900);

const raid = game.state.raids[0];
if (!raid) return { error: 'raid non lancé', targetName };
raid.endsAt = Date.now() - 1;
raid.notified = false;
game._lastTick = 0;
game.tick(Date.now());
await sleep(700);

const claim = document.querySelector('[data-action="claim-raid"]');
if (!claim) return { error: 'bouton claim absent', targetName };
claim.click();
await sleep(900);

return {
  targetName,
  attack: raid.attacker.attack,
  defense: raid.defense,
  raidsLeft: game.state.raids.length,
  raidsDone: game.state.records.raidsDone,
  raidsWon: game.state.records.raidsWon,
  modal: document.querySelector('.modal h2')?.textContent || null,
  fatigue: game.selectedMonster.fatigueUntil > Date.now(),
  toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-2)
};
