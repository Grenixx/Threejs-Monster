const { game, net } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="assemblage"]').click();
await sleep(300);
document.querySelector('[data-action="auto-assemble"]').click();
await sleep(1800);

const remote = await fetch('/api/save', { headers: { 'x-token': net.token } }).then(r => r.json());
return {
  local: {
    attachments: game.selectedMonster.attachments.length,
    power: game.state.records.bestPower
  },
  remote: {
    attachments: remote.save.monsters[0]?.attachments.length,
    power: remote.save.records.bestPower,
    rev: remote.rev
  },
  net: { online: net.online, rev: net.rev }
};
