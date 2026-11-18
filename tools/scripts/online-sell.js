const { game, net } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="marche"]').click();
await sleep(300);
document.querySelector('[data-action="market-view"][data-view="sell"]').click();
await sleep(300);

const firstPart = document.querySelector('[data-action="open-sell-part"]');
if (!firstPart) return { error: 'aucune partie à vendre' };
firstPart.click();
await sleep(400);

const price = document.querySelector('#sellPriceInput')?.value;
document.querySelector('[data-modal-action="publish-sale"]').click();
await sleep(1800);

const remote = await fetch('/api/market', { headers: { 'x-token': net.token } }).then(r => r.json());
const save = await fetch('/api/save', { headers: { 'x-token': net.token } }).then(r => r.json());
return {
  price,
  mine: remote.listings.filter(l => l.mine).length,
  inventoryLocal: game.state.inventory.length,
  inventoryRemote: save.save.inventory.length,
  listings: remote.listings.length,
  modalClosed: !document.querySelector('.modal'),
  toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).slice(-3)
};
