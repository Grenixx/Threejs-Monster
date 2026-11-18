const { game, ui } = window.__CHIMERE__;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const leader = game.selectedMonster;
game.autoAssemble(leader.uid);
await sleep(400);

const second = game.createMonster('larve').monster;
await sleep(250);
const third = game.createMonster('larve').monster;
await sleep(250);
game.setRole(second.uid, 'scout');
game.setRole(third.uid, 'raider');
game.selectMonster(leader.uid);
await sleep(400);

document.querySelector('[data-tab="expeditions"]').click();
await sleep(500);

for (const uid of [second.uid, third.uid]) {
  const button = document.querySelector(`[data-action="squad-toggle"][data-uid="${uid}"]`);
  if (button && !button.disabled) button.click();
  await sleep(250);
}

const launch = document.querySelector('[data-action="launch-expedition"][data-zone="fosses"]');
if (!launch) return { error: 'bouton zone absent', squad: ui.squadExtras };
launch.click();
await sleep(1800);

return {
  name: leader.name,
  hue: leader.hue,
  squad: ui.squadExtras.length + 1,
  expeditions: game.state.expeditions.length,
  members: game.state.expeditions[0]?.monsterIds?.length,
  scene: {
    mode: ui.scene.isExpeditionMode(),
    expedition: ui.scene.getGroup() ? 'idle-group' : 'expedition-root'
  },
  roles: [leader.role, second.role, third.role]
};
