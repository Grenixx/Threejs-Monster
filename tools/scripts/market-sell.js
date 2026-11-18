const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="marche"]').click();
await sleep(300);
document.querySelector('[data-action="market-view"][data-view="sell"]').click();
await sleep(300);

const sellButton = document.querySelector('[data-action="open-sell-part"]');
if (!sellButton) return { error: 'inventaire vide' };
sellButton.click();
await sleep(400);

const priceInput = document.querySelector('#sellPriceInput');
if (!priceInput) return { error: 'modale de vente absente' };
priceInput.value = String(Math.max(20, Number(priceInput.value)));
priceInput.dispatchEvent(new Event('input', { bubbles: true }));
await sleep(150);

document.querySelector('[data-modal-action="publish-sale"]').click();
await sleep(500);

const mine = game.state.market.listings.filter(l => l.mine);
if (!mine.length) return { error: 'annonce non créée' };
mine[0].sellAt = Date.now() - 10;
mine[0].expiresAt = Date.now() + 60000;
game.tick(Date.now());
await sleep(500);

document.querySelector('[data-action="market-view"][data-view="mine"]').click();
await sleep(300);

return {
  listings: game.state.market.listings.length,
  mine: game.state.market.listings.filter(l => l.mine).length,
  shards: game.state.resources.shards,
  sales: game.state.records.sales,
  toast: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-2)
};
