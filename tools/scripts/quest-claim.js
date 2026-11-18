const { game } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

document.querySelector('[data-tab="objectifs"]').click();
await sleep(400);

const claimButton = document.querySelector('[data-action="claim-quest"]');
if (!claimButton) {
  return { quests: game.questStates().map(q => ({ id: q.id, progress: q.progress, claimable: q.claimable })) };
}
claimButton.click();
await sleep(600);

return {
  modal: document.querySelector('.modal h2')?.textContent || null,
  parts: document.querySelectorAll('.modal .attach-row').length,
  quests: game.questStates().map(q => ({ id: q.id, claimed: q.claimed }))
};
