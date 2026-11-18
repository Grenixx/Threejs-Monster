// Simulation d'équilibrage : une créature, expéditions enchaînées.
// node tools/simulate.mjs
import { createInitialState } from '../js/state.js';
import {
  monsterStats, monsterPower, autoPlacements, applyXp, resolveExpedition,
  capacityOf, partTotalStats
} from '../js/economy.js';
import { ZONES, ZONE_BY_ID, BALANCE } from '../js/data.js';

const state = createInitialState('Sim');
const monster = state.monsters[0];

function attachAll() {
  let total = 0;
  for (let pass = 0; pass < 10; pass++) {
    const placements = autoPlacements(monster, state.inventory);
    if (!placements.length) break;
    for (const { part, socket } of placements) {
      const index = state.inventory.findIndex(p => p.uid === part.uid);
      if (index === -1) continue;
      state.inventory.splice(index, 1);
      monster.attachments.push({ part, socket });
      total++;
    }
  }
  return total;
}

function bestZone() {
  const power = monsterPower(monster);
  let best = ZONES[0];
  for (const zone of ZONES) {
    if (power >= zone.unlockPower) best = zone;
  }
  return best;
}

attachAll();
let elapsed = 0;
let runs = 0;
console.log(`départ : Nv.${monster.level} · ${monsterPower(monster)} PWR · ${monster.attachments.length} greffes`);

while (elapsed < 4 * 3600 && runs < 500) {
  const zone = bestZone();
  const outcome = resolveExpedition(monster, zone, Math.floor(Math.random() * 2 ** 31));
  state.resources.biomass += outcome.biomass;
  state.resources.shards += outcome.shards;
  for (const part of outcome.parts) {
    if (state.inventory.length < BALANCE.inventoryMax) state.inventory.push(part);
  }
  applyXp(monster, outcome.xp);
  attachAll();
  elapsed += outcome.duration || zone.duration;
  runs++;

  if (runs % 10 === 0) {
    console.log(
      `${(elapsed / 60).toFixed(0).padStart(4)} min · Nv.${String(monster.level).padStart(2)} · ` +
      `${String(monsterPower(monster)).padStart(3)} PWR · ${monster.attachments.length} greffes · ` +
      `cap ${capacityOf(monster)} · ${zone.name} · ${Math.round(state.resources.biomass)} bio`
    );
  }
}

const stats = monsterStats(monster);
console.log('\nfin :', {
  duréeMin: Math.round(elapsed / 60),
  runs,
  niveau: monster.level,
  puissance: monsterPower(monster),
  greffes: monster.attachments.length,
  capacite: capacityOf(monster),
  stats
});
