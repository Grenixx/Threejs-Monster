import assert from 'node:assert/strict';
import { createInitialState, normalizeState } from '../js/state.js';
import { Game } from '../js/state.js';
import {
  monsterStats, monsterPower, capacityOf, autoPlacements, resolveExpedition,
  fairPrice, monsterValue, generatePart, applyXp, nextLevelXp,
  groupExpeditionRates, expeditionRates, createMonster
} from '../js/economy.js';
import { ZONE_BY_ID, BALANCE } from '../js/data.js';
import {
  npcLabs, resolveRaid, attackerSnapshot, defenderSnapshot, labDefense, raidDuration
} from '../js/raid.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function makeGameState() {
  return createInitialState('Testeur');
}

test('état initial cohérent', () => {
  const s = makeGameState();
  assert.equal(s.monsters.length, 1);
  assert.equal(s.inventory.length, 3);
  assert.equal(s.monsters[0].attachments.length, 2);
  assert.ok(s.resources.biomass > 0);
  assert.ok(s.market.listings.length >= 6);
});

test('stats du monstre = corps + parties', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const stats = monsterStats(monster);
  const eye = monster.attachments[0].part;
  assert.ok(stats.perception >= eye.stats.perception);
  assert.ok(monsterPower(monster) > 0);
});

test('assemblage automatique respecte les règles', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const before = monsterPower(monster);
  const placements = autoPlacements(monster, s.inventory);
  assert.ok(placements.length > 0);
  for (const p of placements) {
    assert.ok(p.socket >= 0 && p.socket < 24);
  }
  assert.ok(monsterPower(monster) > 0);
  assert.equal(monsterPower(monster), before);
});

test('capacité évolue avec le niveau', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const cap1 = capacityOf(monster);
  monster.level = 11;
  const cap2 = capacityOf(monster);
  assert.ok(cap2 > cap1);
  assert.ok(cap2 <= 24);
});

test('expédition déterministe et rentable', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const zone = ZONE_BY_ID.fosses;
  const a = resolveExpedition(monster, zone, 12345);
  const b = resolveExpedition(monster, zone, 12345);
  const stable = r => JSON.stringify({
    ...r,
    parts: r.parts.map(p => ({ type: p.type, rarity: p.rarity, seed: p.seed, stats: p.stats }))
  });
  assert.equal(stable(a), stable(b));
  assert.ok(a.biomass > 0);
  assert.ok(a.parts.length >= 1);
  assert.ok(a.parts.every(p => p.stats && p.name));
});

test('XP et montée de niveau', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const need = nextLevelXp(monster.level);
  const gained = applyXp(monster, need);
  assert.equal(gained, 1);
  assert.equal(monster.level, 2);
});

test('prix de marché cohérents', () => {
  const common = generatePart('eye', 'common', 42);
  const mythic = generatePart('eye', 'mythic', 42);
  assert.ok(fairPrice(mythic) > fairPrice(common));
  const s = makeGameState();
  assert.ok(monsterValue(s.monsters[0]) > 0);
});

test('inventaire plein convertit en biomasse', () => {
  const s = makeGameState();
  const fakeGame = {
    state: s,
    addPart(part) {
      if (s.inventory.length >= BALANCE.inventoryMax) {
        s.resources.biomass += 10;
        return { ok: true, converted: 10 };
      }
      s.inventory.push(part);
      return { ok: true };
    }
  };
  while (s.inventory.length < BALANCE.inventoryMax) s.inventory.push(generatePart('eye'));
  const r = fakeGame.addPart(generatePart('eye'));
  assert.equal(r.converted, 10);
});

test('laboratoires PNJ et défense', () => {
  const labs = npcLabs();
  assert.equal(labs.length, 6);
  assert.ok(labs.every(l => l.defense > 0 && l.biomass > 0));
  const s = makeGameState();
  const monster = s.monsters[0];
  const base = labDefense(35, null);
  const withGuardian = labDefense(35, monster);
  assert.ok(withGuardian > base);
});

test('résolution de razzia déterministe et butin plafonné', () => {
  const s = makeGameState();
  const monster = s.monsters[0];
  const attacker = attackerSnapshot(monster);
  const defender = defenderSnapshot({
    name: 'Test', kind: 'npc', bestPower: 20, biomass: 10000, shards: 2000
  });
  const a = resolveRaid({ attacker, defender, seed: 777 });
  const b = resolveRaid({ attacker, defender, seed: 777 });
  assert.deepEqual(a, b);
  assert.ok(a.lootBiomass <= attacker.capacity);
  assert.ok(a.lootShards <= Math.floor(attacker.capacity * 0.35));
  assert.ok(raidDuration(monster) >= 60);
});

test('razzia forte gagne, razzia faible échoue', () => {
  const strong = { attack: 500, capacity: 200, level: 10 };
  const weak = { attack: 10, capacity: 20, level: 1 };
  const fortress = defenderSnapshot({
    name: 'Forteresse', kind: 'npc', bestPower: 400, biomass: 10000, shards: 2000
  });
  const win = resolveRaid({ attacker: strong, defender: fortress, seed: 42 });
  const lose = resolveRaid({ attacker: weak, defender: fortress, seed: 42 });
  assert.equal(win.win, true);
  assert.equal(lose.win, false);
  assert.ok(win.lootBiomass > 0);
  assert.equal(lose.lootBiomass, 0);
});

function makeGameShell() {
  const game = Object.create(Game.prototype);
  game.state = createInitialState('RaidTest');
  game.mode = 'offline';
  game.listeners = new Set();
  game.eventListeners = new Set();
  game.emitEvent = () => {};
  game.commit = () => {};
  return game;
}

test('razzia locale : lancer, résoudre, butin', () => {
  const game = makeGameShell();
  const monster = game.state.monsters[0];
  const before = game.state.resources.biomass;
  const target = {
    id: 'test:weak', kind: 'npc', name: 'Cible faible', level: 1,
    defense: 1, biomass: 1000, shards: 100, hue: 0.2
  };
  const start = game.startRaid(monster.uid, target);
  assert.equal(start.ok, true, start.reason);
  assert.equal(game.state.raids.length, 1);
  game.state.raids[0].endsAt = Date.now() - 1;
  const claim = game.claimRaid(game.state.raids[0].id);
  assert.equal(claim.ok, true, claim.reason);
  assert.equal(claim.result.win, true);
  assert.ok(game.state.resources.biomass > before);
  assert.equal(game.state.raids.length, 0);
  assert.equal(game.state.records.raidsWon, 1);
});

test('razzia locale : échec = fatigue et blocage', () => {
  const game = makeGameShell();
  const monster = game.state.monsters[0];
  const target = {
    id: 'test:fort', kind: 'npc', name: 'Forteresse', level: 10,
    defense: 99999, biomass: 1000, shards: 100, hue: 0.1
  };
  const start = game.startRaid(monster.uid, target);
  assert.equal(start.ok, true, start.reason);
  game.state.raids[0].endsAt = Date.now() - 1;
  game.state.raids[0].seed = 42;
  const claim = game.claimRaid(game.state.raids[0].id);
  assert.equal(claim.ok, true);
  assert.equal(claim.result.win, false);
  assert.ok(monster.fatigueUntil > Date.now());
  const deploy = game.canDeploy(monster.uid);
  assert.equal(deploy.ok, false);
});

test('tourelle : amélioration payante, défense et niveau plafonné', () => {
  const game = makeGameShell();
  const baseDefense = game.labDefenseValue();
  const biomass = game.state.resources.biomass;
  const shards = game.state.resources.shards;

  const upgrade = game.upgradeSentry();
  assert.equal(upgrade.ok, true, upgrade.reason);
  assert.equal(game.state.defenses.sentry, 1);
  assert.equal(game.state.resources.biomass, biomass - upgrade.cost.biomass);
  assert.equal(game.state.resources.shards, shards - upgrade.cost.shards);
  assert.equal(game.labDefenseValue(), baseDefense + upgrade.defense);

  game.state.defenses.sentry = 3;
  const atMaxBiomass = game.state.resources.biomass;
  const atMaxShards = game.state.resources.shards;
  const maxed = game.upgradeSentry();
  assert.equal(maxed.ok, false);
  assert.equal(game.state.resources.biomass, atMaxBiomass);
  assert.equal(game.state.resources.shards, atMaxShards);
});

test('normalisation de la tourelle : ancienne sauvegarde et rang invalide', () => {
  const oldSave = createInitialState('Ancien');
  delete oldSave.defenses;
  assert.deepEqual(normalizeState(oldSave).defenses, { sentry: 0 });

  const invalidSave = createInitialState('Invalide');
  invalidSave.defenses = 99;
  assert.deepEqual(normalizeState(invalidSave).defenses, { sentry: 0 });

  const overbuiltSave = createInitialState('Trop équipé');
  overbuiltSave.defenses.sentry = 99;
  assert.equal(normalizeState(overbuiltSave).defenses.sentry, 3);
});

test('gardien : défense et interdiction de partir', () => {
  const game = makeGameShell();
  const monster = game.state.monsters[0];
  const base = game.labDefenseValue();
  const set = game.setGuardian(monster.uid);
  assert.equal(set.ok, true, set.reason);
  assert.ok(game.labDefenseValue() > base);
  assert.equal(game.state.guardianId, monster.uid);
  const start = game.startRaid(monster.uid, {
    id: 'test:x', kind: 'npc', name: 'X', level: 1, defense: 1, biomass: 10, shards: 1
  });
  assert.equal(start.ok, false);
});

test('rôles : récolteur vs pilleur (dérivé des parties)', () => {
  const game = makeGameShell();
  const monster = game.state.monsters[0];
  const zone = ZONE_BY_ID.fosses;

  // Récolteur : parties perception + ésotérisme
  monster.attachments = [
    { uid: 'a', part: generatePart('eye', 'common', 1), socket: 0 },
    { uid: 'b', part: generatePart('crystal', 'common', 2), socket: 1 }
  ];
  const harvest = expeditionRates(monster, zone);

  // Pilleur : parties force + vitesse
  monster.attachments = [
    { uid: 'c', part: generatePart('claw', 'common', 3), socket: 0 },
    { uid: 'd', part: generatePart('horn', 'common', 4), socket: 1 }
  ];
  const raid = expeditionRates(monster, zone);

  assert.ok(harvest.biomass > raid.biomass, 'le récolteur ramène plus de biomasse');
  assert.ok(harvest.duration <= raid.duration, 'le récolteur est au moins aussi rapide');

  // Attaque : le pilleur frappe plus fort (multiplicateur de rôle + stats)
  monster.attachments = [
    { uid: 'e', part: generatePart('claw', 'common', 7), socket: 0 },
    { uid: 'f', part: generatePart('horn', 'common', 8), socket: 1 }
  ];
  const a = attackerSnapshot(monster);
  monster.attachments = [
    { uid: 'g', part: generatePart('eye', 'common', 9), socket: 0 },
    { uid: 'h', part: generatePart('crystal', 'common', 10), socket: 1 }
  ];
  const b = attackerSnapshot(monster);
  assert.ok(a.attack > b.attack, 'le pilleur attaque plus fort');
});

test('escouade : rendement supérieur et XP partagée', () => {
  const game = makeGameShell();
  const leader = game.state.monsters[0];
  const second = createMonster({ bodyId: 'larve' });
  const third = createMonster({ bodyId: 'larve' });
  game.state.monsters.push(second, third);
  second.role = 'scout';
  third.role = 'raider';

  const solo = groupExpeditionRates([leader], ZONE_BY_ID.fosses);
  const squad = groupExpeditionRates([leader, second, third], ZONE_BY_ID.fosses);
  assert.ok(squad.biomass > solo.biomass);
  assert.ok(squad.duration >= solo.duration);

  const start = game.startExpedition(leader.uid, 'fosses', [second.uid, third.uid]);
  assert.equal(start.ok, true, start.reason);
  assert.equal(game.state.expeditions[0].monsterIds.length, 3);
  assert.equal(game.isAway(second.uid), true);
  assert.equal(game.canDeploy(second.uid).ok, false);

  game.state.expeditions[0].endsAt = Date.now() - 1;
  const claim = game.claimExpedition(game.state.expeditions[0].id);
  assert.equal(claim.ok, true, claim.reason);
  assert.equal(claim.monsters.length, 3);
  assert.ok(leader.xp > 0 && second.xp > 0 && third.xp > 0);
  assert.equal(game.state.expeditions.length, 0);
});

console.log(`\n${passed} test(s) passé(s).`);
