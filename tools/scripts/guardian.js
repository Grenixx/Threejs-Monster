const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="expeditions"]').click();
await sleep(300);
document.querySelector('[data-action="exp-view"][data-view="raids"]').click();
await sleep(500);

const before = game.labDefenseValue();
const select = document.getElementById('guardianSelect');
if (!select) return { error: 'select gardien absent' };
select.value = game.selectedMonster.uid;
document.querySelector('[data-action="set-guardian"]').click();
await sleep(700);

return {
  before,
  after: game.labDefenseValue(),
  guardianId: game.state.guardianId,
  guardianName: game.guardianMonster?.name,
  selectValue: document.getElementById('guardianSelect')?.value,
  roster: document.querySelector('.roster-chip.active')?.textContent.replace(/\s+/g, ' ').trim(),
  toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-1)
};
