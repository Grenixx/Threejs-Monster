const { game, ui, net } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (let i = 0; i < 30 && !net.online; i++) await sleep(200);
if (!net.online) return { error: 'pas connecté' };

const monster = game.selectedMonster;
game.autoAssemble(monster.uid);
await sleep(900);

document.querySelector('[data-tab="expeditions"]').click();
await sleep(300);
document.querySelector('[data-action="exp-view"][data-view="raids"]').click();
await sleep(1200);

for (let i = 0; i < 20 && !ui.raidTargets.some(t => t.kind === 'player'); i++) await sleep(200);
const target = ui.raidTargets.find(t => t.kind === 'player');
if (!target) return { error: 'aucune cible joueur', targets: ui.raidTargets.map(t => t.kind) };

const button = [...document.querySelectorAll('[data-action="launch-raid"]')]
  .find(b => b.dataset.id === target.id);
if (!button) return { error: 'bouton cible absent', target: target.id };
const before = {
  disabled: button.disabled,
  deploy: game.canDeploy(monster.uid),
  targetId: target.id,
  online: net.online,
  raids: game.state.raids.length
};
button.click();
await sleep(1500);

const serverRaids = await fetch('/api/raids', { headers: { 'x-token': net.token } }).then(r => r.json()).catch(e => ({ error: String(e) }));
if (!game.state.raids.length) {
  return {
    error: 'raid non lancé',
    before,
    serverRaids,
    localRaids: game.state.raids,
    toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-3)
  };
}
await sleep(2600);
game._lastTick = 0;
game.tick(Date.now());
await sleep(700);

const claim = document.querySelector('[data-action="claim-raid"]');
if (!claim) return { error: 'pas de bouton claim', raid: game.state.raids[0] };
claim.click();
await sleep(1200);

return {
  target: target.name,
  targets: ui.raidTargets.length,
  raids: game.state.raids.length,
  raidsDone: game.state.records.raidsDone,
  shards: game.state.resources.shards,
  modal: document.querySelector('.modal h2')?.textContent || null,
  online: net.online
};
