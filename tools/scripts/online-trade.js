const { game, net } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="marche"]').click();
await sleep(400);

const buyButtons = [...document.querySelectorAll('[data-action="buy-listing"]')].filter(b => !b.disabled);
if (!buyButtons.length) return { error: 'aucune annonce abordable' };
buyButtons[0].click();
await sleep(2200);

const saveAfterBuy = await fetch('/api/save', { headers: { 'x-token': net.token } }).then(r => r.json());

document.querySelector('[data-action="market-view"][data-view="sell"]').click();
await sleep(300);
const sellButton = document.querySelector('[data-action="open-sell-part"]');
if (!sellButton) return { error: 'rien à vendre après achat', save: saveAfterBuy.save.inventory.length };
sellButton.click();
await sleep(400);
document.querySelector('[data-modal-action="publish-sale"]').click();
await sleep(2400);

const market = await fetch('/api/market', { headers: { 'x-token': net.token } }).then(r => r.json());
const saveAfterSell = await fetch('/api/save', { headers: { 'x-token': net.token } }).then(r => r.json());

return {
  local: {
    shards: game.state.resources.shards,
    inventory: game.state.inventory.length,
    mine: game.state.market.listings.filter(l => l.mine).length,
    online: net.online
  },
  remote: {
    shards: saveAfterSell.save.resources.shards,
    inventory: saveAfterSell.save.inventory.length,
    mine: market.listings.filter(l => l.mine).length,
    rev: saveAfterSell.rev
  },
  toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-4)
};
