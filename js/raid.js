// =============================================================
// CHIMÈRE — moteur de raids (pur, partagé client / serveur)
// =============================================================

import { STAT_KEYS, ROLES, ROLE_KEYS, LAB_DEFENSES } from './data.js';
import { monsterStats, clamp, deriveRole } from './economy.js';

export const RAID = {
  duration: 150,
  minDuration: 60,
  fatigue: 240,
  baseDefense: 15,
  defensePerPower: 0.7,
  guardianFactor: 0.85,
  capacityBase: 80,
  capacityPerVor: 8,
  capacityPerLevel: 10,
  capacityPerForce: 2,
  minShare: 0.07,
  maxShare: 0.22,
  winXp: 30,
  lossXp: 12
};

function roleOf(monster) {
  return ROLES[deriveRole(monster)] || ROLES.harvester;
}

/** Puissance d'attaque d'un monstre partant en razzia. */
export function attackScore(stats, level = 1, roleMult = 1) {
  return Math.round(
    ((stats.force || 0) * 2.4 +
    (stats.vitesse || 0) * 1.8 +
    (stats.perception || 0) * 1.0 +
    (stats.esoterisme || 0) * 0.8 +
    (stats.resistance || 0) * 0.5 +
    (stats.voracite || 0) * 1.2 +
    level * 3) * roleMult
  );
}

/** Apport défensif d'un monstre gardien. */
export function guardianDefenseScore(stats, level = 1, roleMult = 1) {
  return Math.round(
    ((stats.resistance || 0) * 2.2 +
    (stats.force || 0) * 1.6 +
    (stats.voracite || 0) * 1.2 +
    (stats.perception || 0) * 0.8 +
    (stats.esoterisme || 0) * 0.5 +
    level * 3) * roleMult
  );
}

/** Bonus de défense cumulé des améliorations du laboratoire. */
export function defenseUpgradeBonus(level = 0) {
  const safeLevel = Math.max(0, Math.min(LAB_DEFENSES.length, Math.floor(Number(level) || 0)));
  return LAB_DEFENSES.slice(0, safeLevel).reduce((sum, upgrade) => sum + upgrade.defense, 0);
}

/** Défense totale d'un laboratoire. */
export function labDefense(bestPower, guardianMonster = null, defenseBonus = 0) {
  const base = RAID.baseDefense + (bestPower || 0) * RAID.defensePerPower;
  if (!guardianMonster) return Math.round(base + Math.max(0, defenseBonus));
  const stats = monsterStats(guardianMonster);
  const role = roleOf(guardianMonster);
  const guardian = guardianDefenseScore(stats, guardianMonster.level || 1, role.defense);
  return Math.round(base + guardian * RAID.guardianFactor + Math.max(0, defenseBonus));
}

/** Capacité d'emport de la razzia. */
export function cargoCapacity(stats, level = 1, roleMult = 1) {
  return Math.round((
    RAID.capacityBase +
    (stats.voracite || 0) * RAID.capacityPerVor +
    (level || 1) * RAID.capacityPerLevel +
    (stats.force || 0) * RAID.capacityPerForce
  ) * roleMult);
}

export function raidDuration(monster) {
  const stats = monsterStats(monster);
  const role = roleOf(monster);
  const factor = Math.max(0.4, 1 / (1 + (stats.vitesse || 0) / 400)) * role.speed;
  return Math.max(RAID.minDuration, Math.round(RAID.duration * factor));
}

export function attackerSnapshot(monster) {
  const stats = monsterStats(monster);
  const level = monster.level || 1;
  const role = roleOf(monster);
  return {
    name: monster.name,
    level,
    stats,
    role: role.label,
    roleKey: deriveRole(monster),
    attack: attackScore(stats, level, role.raid),
    capacity: cargoCapacity(stats, level, role.cargo)
  };
}

export function defenderSnapshot({ name, kind = 'npc', bestPower = 0, guardian = null, biomass = 0, shards = 0 }) {
  const defense = labDefense(bestPower, guardian);
  return {
    name,
    kind,
    defense,
    biomass: Math.max(0, Math.floor(biomass)),
    shards: Math.max(0, Math.floor(shards)),
    guardianName: guardian?.name || null
  };
}

/**
 * Résout une razzia. Déterministe à partir de la graine.
 * @param {{attacker:object, defender:object, seed:number}} input
 */
export function resolveRaid({ attacker, defender, seed = 1 }) {
  let state = (seed >>> 0) || 1;
  const rng = () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const roll = 0.85 + rng() * 0.35;
  const attack = Math.max(1, attacker.attack || 1);
  const defense = Math.max(1, defender.defense || 1);
  const effective = attack * roll;
  const upset = rng() < 0.08;

  const win = effective >= defense || upset;
  let share = 0;
  if (win) {
    const margin = (effective - defense) / defense;
    share = clamp(RAID.minShare + margin * 0.10, RAID.minShare, RAID.maxShare);
  }

  const capacity = Math.max(1, attacker.capacity || 1);
  const lootBiomass = win
    ? Math.min(capacity, Math.floor((defender.biomass || 0) * share))
    : 0;
  const lootShards = win
    ? Math.min(Math.floor(capacity * 0.35), Math.floor((defender.shards || 0) * share))
    : 0;

  const level = attacker.level || 1;
  const xp = win ? RAID.winXp + level * 3 : RAID.lossXp + level * 2;
  const fatigue = win ? 0 : RAID.fatigue;

  return {
    win,
    attack,
    defense,
    roll: Math.round(roll * 100) / 100,
    share: Math.round(share * 1000) / 1000,
    lootBiomass,
    lootShards,
    xp,
    fatigue,
    targetName: defender.name,
    targetKind: defender.kind,
    guardianName: defender.guardianName || null,
    upset
  };
}

/** Laboratoires PNJ : cibles permanentes, en ligne comme hors ligne. */
export const NPC_LABS = [
  {
    key: 'mycelium', name: 'Mycélium oublié', level: 1, defense: 38,
    biomass: 650, shards: 60, hue: 0.29,
    desc: 'Une colonie fongique qui stocke de la matière organique.'
  },
  {
    key: 'antenne', name: 'Antenne morte', level: 2, defense: 56,
    biomass: 1100, shards: 120, hue: 0.55,
    desc: 'Un relais abandonné, encore gardé par quelque chose.'
  },
  {
    key: 'ferme', name: 'Ferme de sel', level: 3, defense: 78,
    biomass: 1800, shards: 220, hue: 0.1,
    desc: 'Des cuves de saumure et un gardien ossifié.'
  },
  {
    key: 'puits', name: 'Puits vitreux', level: 4, defense: 112,
    biomass: 3200, shards: 400, hue: 0.6,
    desc: 'Un puits de verre noir. Les éclats brillent au fond.'
  },
  {
    key: 'carcasse', name: 'Carcasse orbitale', level: 5, defense: 168,
    biomass: 5600, shards: 700, hue: 0.75,
    desc: 'Un fragment de station qui n’a jamais fini de tomber.'
  },
  {
    key: 'silo', name: 'Le Silo', level: 6, defense: 248,
    biomass: 9000, shards: 1200, hue: 0.02,
    desc: 'Un silo pressurisé. On entend battre quelque chose dedans.'
  }
];

export function npcLabs() {
  return NPC_LABS.map(lab => ({
    id: `npc:${lab.key}`,
    kind: 'npc',
    name: lab.name,
    level: lab.level,
    defense: lab.defense,
    biomass: lab.biomass,
    shards: lab.shards,
    hue: lab.hue,
    desc: lab.desc,
    guardianName: null,
    recommendedPower: Math.round(lab.defense * 1.05)
  }));
}

export function raidLootHint(target) {
  const share = 0.1;
  return {
    biomass: Math.max(10, Math.round((target.biomass || 0) * share)),
    shards: Math.max(1, Math.round((target.shards || 0) * share))
  };
}

export function raidTargetLabel(target) {
  return target.kind === 'player' ? 'Joueur' : 'Labo PNJ';
}

export function emptyRaid() {
  return null;
}

export function sumStats(stats) {
  return STAT_KEYS.reduce((sum, key) => sum + (stats[key] || 0), 0);
}
