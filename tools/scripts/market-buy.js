const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="marche"]').click();
await sleep(400);

const before = {
  shards: game.state.resources.shards,
  inventory: game.state.inventory.length
};
const buttons = [...document.querySelectorAll('[data-action="buy-listing"]')].filter(b => !b.disabled);
if (!buttons.length) return { error: 'aucune annonce abordable', before };
buttons[0].click();
await sleep(600);

return {
  before,
  after: {
    shards: game.state.resources.shards,
    inventory: game.state.inventory.length
  },
  listings: game.state.market.listings.length,
  toast: document.querySelector('.toast')?.textContent?.trim() || null
};
