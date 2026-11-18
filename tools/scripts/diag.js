const { game, net } = window.__CHIMERE__;
return {
  href: location.href,
  origin: location.origin,
  mode: game.mode,
  online: net?.online,
  available: net?.available,
  token: localStorage.getItem('chimere.net.token')?.slice(0, 8) || null,
  resources: game.state.resources,
  monsters: game.state.monsters.length,
  attachments: game.selectedMonster?.attachments.length,
  marketListings: game.state.market.listings.length,
  sync: document.getElementById('syncLabel')?.textContent,
  health: await fetch('/api/health').then(r => r.json()).catch(e => String(e))
};
