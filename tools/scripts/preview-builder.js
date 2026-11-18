const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const exp of game.state.expeditions) exp.endsAt = Date.now() - 1000;
if (game.state.expeditions.length) {
  game.claimAll();
  await sleep(500);
  ui.closeModal();
}

document.querySelector('[data-tab="assemblage"]').click();
await sleep(350);
document.querySelector('.part-row[data-uid]')?.click();
await sleep(500);

return {
  attachments: game.selectedMonster.attachments.length,
  inventory: game.state.inventory.length,
  selected: Boolean(ui.selection)
};
