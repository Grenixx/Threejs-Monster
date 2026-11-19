// =============================================================
// CHIMÈRE — Moteur de jeu pur (aucun DOM, aucun Three.js)
// Utilisable côté client et côté serveur.
// =============================================================

import { mulberry32 } from './rng.js';
import {
  STAT_KEYS, PART_TYPES, PART_TYPE_KEYS, RARITIES, RARITY_KEYS,
  BODIES, BALANCE, ROLES, ROLE_KEYS
} from './data.js';

// -------------------------------------------------------------
// UTILITAIRES
// -------------------------------------------------------------
export function uid(prefix = 'x') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function socketY(index, count) {
  if (count <= 1) return 0;
  return 1 - (index / (count - 1)) * 2;
}

export function partTotalStats(part) {
  return STAT_KEYS.reduce((sum, key) => sum + (part.stats?.[key] || 0), 0);
}

export function monsterStats(monster) {
  const body = BODIES[monster.bodyId] || BODIES.larve;
  const total = {};
  for (const key of STAT_KEYS) total[key] = body.stats?.[key] || 0;

  for (const item of monster.attachments || []) {
    const stats = item.part?.stats || {};
    for (const key of STAT_KEYS) total[key] += stats[key] || 0;
  }

  const levelMult = 1 + BALANCE.levelStatBonus * Math.max(0, (monster.level || 1) - 1);
  for (const key of STAT_KEYS) {
    total[key] = Math.max(0, Math.round(total[key] * levelMult));
  }
  return total;
}

export function monsterPower(monster) {
  const stats = monsterStats(monster);
  return STAT_KEYS.reduce((sum, key) => sum + stats[key], 0);
}

export function powerOfStats(stats) {
  return STAT_KEYS.reduce((sum, key) => sum + (stats[key] || 0), 0);
}

export function zonePower(stats, zone) {
  let total = 0;
  for (const key of STAT_KEYS) {
    total += (stats[key] || 0) * (zone.weights?.[key] ?? 1);
  }
  return Math.round(total);
}

export function capacityOf(monster) {
  const body = BODIES[monster.bodyId] || BODIES.larve;
  const level = monster.level || 1;
  return Math.min(body.sockets, 4 + level);
}

export function socketCount(bodyId) {
  return (BODIES[bodyId] || BODIES.larve).sockets;
}

export function nextLevelXp(level) {
  return Math.round(BALANCE.xpCurveBase * Math.pow(level, BALANCE.xpCurveExp));
}

/** Ajoute de l'XP et retourne le nombre de niveaux gagnés. */
export function applyXp(monster, amount) {
  monster.xp = (monster.xp || 0) + Math.max(0, Math.round(amount));
  let gained = 0;
  while (monster.xp >= nextLevelXp(monster.level || 1)) {
    monster.xp -= nextLevelXp(monster.level || 1);
    monster.level = (monster.level || 1) + 1;
    gained++;
    if (monster.level >= 60) break;
  }
  return gained;
}

/**
 * Déduit le rôle d'un monstre à partir des parties qu'il a équipées.
 * Chaque rôle correspond à la stat dominante de son équipement :
 *  - harvester : perception / esoterisme (trouver, récolter)
 *  - raider    : force / vitesse (attaquer, piller)
 *  - guardian  : résistance (encaisser, défendre)
 *  - scout     : vitesse (rapide, léger)
 * Si aucun équipement ne se distingue, le monstre garde son rôle stocké
 * (fallback harvester).
 */
export function deriveRole(monster) {
  const stats = monsterStats(monster || {});
  const score = {
    harvester: (stats.perception || 0) * 1.5 + (stats.esoterisme || 0),
    raider:    (stats.force || 0) * 1.5 + (stats.vitesse || 0),
    guardian:  (stats.resistance || 0) * 1.5 + (stats.force || 0) * 0.5,
    scout:     (stats.vitesse || 0) * 1.5 + (stats.perception || 0) * 0.5
  };
  let best = 'harvester';
  let bestScore = score.harvester;
  for (const [key, value] of Object.entries(score)) {
    if (value > bestScore + 1e-9) {
      best = key;
      bestScore = value;
    }
  }
  // Aucun équipement marquant : on ne force pas un rôle par l'équipement.
  const hasParts = (monster?.attachments || []).length > 0;
  if (!hasParts && monster?.role && ROLES[monster.role]) return monster.role;
  return best;
}

export function roleOf(monster) {
  return ROLES[deriveRole(monster)] || ROLES.harvester;
}

export function rollLoot(zone, stats, rng, origin = 'expedition', lootBonus = 1) {
  const perception = stats.perception || 0;
  let count = 1;
  if (rng() < clamp((0.2 + perception / 320) * lootBonus, 0, 0.9)) count++;
  if (perception >= 120 && rng() < clamp((perception / 520) * lootBonus, 0, 0.75)) count++;
  count = Math.min(count, zone.lootMax || 2);
  count = Math.min(count, 4);

  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(lootPart(zone, stats, rng, origin));
  }
  return parts;
}

// -------------------------------------------------------------
// EXPÉDITIONS
// -------------------------------------------------------------
export function durationFor(monster, zone) {
  const stats = monsterStats(monster);
  const role = roleOf(monster);
  const factor = Math.max(
    BALANCE.minDurationFactor,
    1 / (1 + stats.vitesse / BALANCE.durationSpeedDivisor)
  );
  return Math.max(10, Math.round(zone.duration * factor * role.speed));
}

export function expeditionRates(monster, zone) {
  const stats = monsterStats(monster);
  const role = roleOf(monster);
  const power = zonePower(stats, zone);
  const ratio = clamp(power / Math.max(1, zone.req), 0.35, 3);
  const vorBonus = 1 + stats.voracite / 120;
  const levelBonus = 1 + BALANCE.levelStatBonus * Math.max(0, (monster.level || 1) - 1);

  return {
    stats,
    power,
    ratio,
    role: role.label,
    lootBonus: role.loot,
    biomass: Math.round(zone.biomass * ratio * vorBonus * levelBonus * role.expedition),
    shards: Math.round(zone.biomass * 0.11 * ratio * (1 + stats.esoterisme / 250) * role.expedition),
    duration: durationFor(monster, zone),
    xp: zone.xp
  };
}

/**
 * Agrège une escouade de 1 à 3 monstres. Le rendement monte avec la somme
 * des stats et un bonus d'escouade ; la durée est celle du plus lent.
 */
export function groupExpeditionRates(monsters, zone) {
  const members = (monsters || []).filter(Boolean);
  if (!members.length) return null;

  const stats = {};
  for (const key of STAT_KEYS) stats[key] = 0;
  for (const monster of members) {
    const ms = monsterStats(monster);
    for (const key of STAT_KEYS) stats[key] += ms[key] || 0;
  }

  const level = Math.max(...members.map(m => m.level || 1));
  const roleExpedition = members.reduce((sum, m) => sum + roleOf(m).expedition, 0) / members.length;
  const roleLoot = members.reduce((sum, m) => sum + roleOf(m).loot, 0) / members.length;
  const squadBonus = 1 + 0.15 * (members.length - 1);
  const power = Math.round(zonePower(stats, zone) * squadBonus);
  const ratio = clamp(power / Math.max(1, zone.req), 0.35, 3);
  const vorBonus = 1 + (stats.voracite || 0) / 120;
  const levelBonus = 1 + BALANCE.levelStatBonus * Math.max(0, level - 1);
  const duration = Math.max(...members.map(m => durationFor(m, zone)));

  return {
    stats,
    power,
    ratio,
    roleExpedition,
    roleLoot,
    squadBonus,
    level,
    members,
    duration,
    biomass: Math.round(zone.biomass * ratio * vorBonus * levelBonus * roleExpedition * squadBonus),
    shards: Math.round(zone.biomass * 0.11 * ratio * (1 + (stats.esoterisme || 0) / 250) * roleExpedition * squadBonus),
    xp: zone.xp
  };
}

/**
 * Résout une expédition de groupe de façon déterministe.
 * @returns {{biomass:number, shards:number, xp:number, xpEach:number, parts:Array, power:number, ratio:number, duration:number}}
 */
export function resolveGroupExpedition(monsters, zone, seed) {
  const members = (monsters || []).filter(Boolean);
  const rng = mulberry32((seed >>> 0) || 1);
  const rates = groupExpeditionRates(members, zone);
  if (!rates) {
    return { biomass: 0, shards: 0, xp: 0, xpEach: 0, parts: [], power: 0, ratio: 0, duration: 0 };
  }

  const swing = 0.9 + rng() * 0.2;
  const biomass = Math.max(1, Math.round(rates.biomass * swing));
  const shards = Math.max(1, Math.round(rates.shards * (0.9 + rng() * 0.2)));
  const parts = rollLoot(zone, rates.stats, rng, `expedition:${zone.id}`, rates.roleLoot);
  const xpEach = Math.round(zone.xp * (1 + 0.25 * (members.length - 1)));

  return {
    biomass,
    shards,
    xp: xpEach * members.length,
    xpEach,
    parts,
    power: rates.power,
    ratio: rates.ratio,
    duration: rates.duration
  };
}

/**
 * Résout une expédition de façon déterministe à partir de la graine.
 * @returns {{biomass:number, shards:number, xp:number, parts:Array, power:number, ratio:number}}
 */
export function resolveExpedition(monster, zone, seed) {
  const rng = mulberry32((seed >>> 0) || 1);
  const rates = expeditionRates(monster, zone);
  const swing = 0.9 + rng() * 0.2;
  const biomass = Math.max(1, Math.round(rates.biomass * swing));
  const shards = Math.max(1, Math.round(rates.shards * (0.9 + rng() * 0.2)));
  const parts = rollLoot(zone, rates.stats, rng, `expedition:${zone.id}`, rates.lootBonus);

  return {
    biomass,
    shards,
    xp: rates.xp,
    parts,
    power: rates.power,
    ratio: rates.ratio
  };
}

// -------------------------------------------------------------
// EXPEDITION HP / DAMAGE (Fallout Shelter style)
// -------------------------------------------------------------
export function monsterMaxHp(monster) {
  const stats = monsterStats(monster);
  // Base HP from resistance + level bonus
  const baseHp = 50 + stats.resistance * 8 + (monster.level || 1) * 10;
  // Voracité gives small HP bonus
  const vorBonus = 1 + (stats.voracite || 0) / 200;
  return Math.round(baseHp * vorBonus);
}

export function monsterHp(monster) {
  // Current HP stored on monster, or max if not set
  return monster.currentHp ?? monsterMaxHp(monster);
}

export function setMonsterHp(monster, hp) {
  const max = monsterMaxHp(monster);
  monster.currentHp = Math.max(0, Math.min(max, Math.round(hp)));
  return monster.currentHp;
}

export function healMonster(monster, amount) {
  const max = monsterMaxHp(monster);
  const current = monster.currentHp ?? max;
  monster.currentHp = Math.min(max, current + Math.round(amount));
  return monster.currentHp;
}

export function damageMonster(monster, amount) {
  const current = monster.currentHp ?? monsterMaxHp(monster);
  monster.currentHp = Math.max(0, current - Math.round(amount));
  return monster.currentHp;
}

export function isMonsterDead(monster) {
  return (monster.currentHp ?? monsterMaxHp(monster)) <= 0;
}

export function expeditionDanger(zone) {
  // Base danger from zone, scaled by danger level
  const dangerMap = {
    'fosses': 0.5,
    'sel': 1.0,
    'verre': 1.8,
    'nebuleuse': 2.5,
    'ventre': 4.0
  };
  return dangerMap[zone.id] || 1.0;
}

export function expeditionDps(monster, zone) {
  const stats = monsterStats(monster);
  const danger = expeditionDanger(zone);
  // Base DPS from zone danger
  let dps = danger * 0.8;
  // Resistance reduces damage significantly
  const resReduction = 1 / (1 + stats.resistance / 50);
  // Vitesse gives small dodge chance
  const speedReduction = 1 / (1 + stats.vitesse / 100);
  // Role modifiers
  const role = roleOf(monster);
  const roleMult = role.expedition; // harvester=1.25, raider=0.8, guardian=0.7, scout=1
  dps *= resReduction * speedReduction * roleMult;
  return Math.max(0.1, dps); // Minimum 0.1 DPS
}

export function calculateExpeditionHpAtTime(monster, zone, startedAt, now, maxDuration) {
  const maxHp = monsterMaxHp(monster);
  const dps = expeditionDps(monster, zone);
  const elapsed = (now - startedAt) / 1000; // seconds
  const progress = Math.min(1, elapsed / maxDuration);
  // Damage accumulates over time
  const totalDamage = dps * elapsed;
  // Healing from voracité (slow regen)
  const stats = monsterStats(monster);
  const hps = (stats.voracite || 0) * 0.05; // HP per second
  const totalHeal = hps * elapsed;
  let hp = maxHp - totalDamage + totalHeal;
  hp = Math.max(0, Math.min(maxHp, hp));
  return { hp, maxHp, dps, hps, progress, dead: hp <= 0 };
}

export function calculateGroupExpeditionHpAtTime(members, zone, startedAt, now, maxDuration) {
  return members.map(m => calculateExpeditionHpAtTime(m, zone, startedAt, now, maxDuration));
}

// -------------------------------------------------------------
// GÉNÉRATION DE PARTIES
// -------------------------------------------------------------
export function rollRarity(zone, esoterisme, rng) {
  const weights = { ...zone.rarityWeights };
  const eso = Math.max(0, esoterisme || 0);
  weights.rare *= 1 + eso / 220;
  weights.epic *= 1 + eso / 130;
  weights.mythic *= 1 + eso / 80;

  const entries = RARITY_KEYS
    .map(key => [key, Math.max(0, weights[key] || 0)])
    .filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]?.[0] || 'common';
}

export function partName(type, rarity, rng) {
  const def = PART_TYPES[type];
  const rarityDef = RARITIES[rarity];
  const suffixes = rarityDef.suffixes;
  const suffix = suffixes[Math.floor(rng() * suffixes.length)];
  return `${def.singular} ${suffix}`;
}

export function generatePart(type, rarity = 'common', seed = Math.floor(Math.random() * 2 ** 31), origin = 'drop') {
  const def = PART_TYPES[type];
  if (!def) throw new Error(`Type de partie inconnu : ${type}`);
  const rarityDef = RARITIES[rarity] || RARITIES.common;
  const rng = mulberry32((seed ^ Math.imul(type.length + 31, 2654435761)) >>> 0);

  const stats = {};
  for (const [key, base] of Object.entries(def.stats)) {
    const variance = 0.88 + rng() * 0.24;
    stats[key] = Math.max(1, Math.round(base * rarityDef.mult * variance));
  }

  return {
    uid: uid('part'),
    type,
    rarity,
    seed,
    stats,
    name: partName(type, rarity, rng),
    origin,
    createdAt: Date.now()
  };
}

export function lootPart(zone, stats, rng, origin = 'expedition') {
  const type = PART_TYPE_KEYS[Math.floor(rng() * PART_TYPE_KEYS.length)];
  const rarity = rollRarity(zone, stats.esoterisme || 0, rng);
  return generatePart(type, rarity, Math.floor(rng() * 2 ** 31), origin);
}

// -------------------------------------------------------------
// ASSEMBLAGE
// -------------------------------------------------------------
export function usedSockets(monster) {
  return new Set((monster.attachments || []).map(a => a.socket));
}

export function attachmentsOfType(monster, type) {
  return (monster.attachments || []).filter(a => a.part.type === type).length;
}

export function canAttach(monster, part, socket) {
  const def = PART_TYPES[part.type];
  if (!def) return { ok: false, reason: 'Partie inconnue.' };
  const body = BODIES[monster.bodyId] || BODIES.larve;

  if (socket < 0 || socket >= body.sockets) {
    return { ok: false, reason: 'Socket invalide.' };
  }
  if ((monster.attachments || []).length >= capacityOf(monster)) {
    return { ok: false, reason: 'Capacité atteinte. Fais monter le monstre de niveau.' };
  }
  if (usedSockets(monster).has(socket)) {
    return { ok: false, reason: 'Ce socket est occupé.' };
  }
  const y = socketY(socket, body.sockets);
  if (y < def.rule.yMin || y > def.rule.yMax) {
    return { ok: false, reason: `${def.label} ne peuvent pas être greffés ici.` };
  }
  if (attachmentsOfType(monster, part.type) >= def.rule.max) {
    return { ok: false, reason: `Maximum ${def.rule.max} ${def.label.toLowerCase()} par monstre.` };
  }
  return { ok: true };
}

export function validSocketsFor(monster, part) {
  const body = BODIES[monster.bodyId] || BODIES.larve;
  const used = usedSockets(monster);
  const out = [];
  for (let i = 0; i < body.sockets; i++) {
    if (used.has(i)) continue;
    if (canAttach(monster, part, i).ok) out.push(i);
  }
  return out;
}

/**
 * Remplissage automatique : choisit les meilleures parties de l'inventaire
 * et les place sur les sockets compatibles.
 */
export function autoPlacements(monster, inventory) {
  const placements = [];
  let current = {
    ...monster,
    attachments: [...(monster.attachments || [])]
  };

  const pool = [...inventory].sort((a, b) => partTotalStats(b) - partTotalStats(a));
  for (const part of pool) {
    if (current.attachments.length >= capacityOf(current)) break;
    const valid = validSocketsFor(current, part);
    if (!valid.length) continue;

    const def = PART_TYPES[part.type];
    // Les yeux/cornes vont en haut, les tentacules en bas.
    const mid = (def.rule.yMin + def.rule.yMax) / 2;
    valid.sort((a, b) => {
      const ya = socketY(a, BODIES[current.bodyId].sockets);
      const yb = socketY(b, BODIES[current.bodyId].sockets);
      return Math.abs(ya - mid) - Math.abs(yb - mid);
    });
    const socket = valid[0];
    placements.push({ part, socket });
    current.attachments.push({ part, socket });
  }
  return placements;
}

// -------------------------------------------------------------
// VALEUR MARCHANDE
// -------------------------------------------------------------
export function fairPrice(part) {
  const rarity = RARITIES[part.rarity] || RARITIES.common;
  const base = 30 + partTotalStats(part) * 5;
  return Math.max(25, Math.round(base * rarity.priceMult));
}

export function monsterValue(monster) {
  const base = 120 + monsterPower(monster) * 6;
  const parts = (monster.attachments || []).reduce((sum, a) => sum + fairPrice(a.part), 0);
  return Math.round(base + parts * 0.65);
}

export function priceRange(part) {
  const fair = fairPrice(part);
  return {
    fair,
    min: Math.max(10, Math.round(fair * 0.55)),
    max: Math.round(fair * 2.4)
  };
}

// -------------------------------------------------------------
// NOMS
// -------------------------------------------------------------
const NAME_S1 = ['Azh', 'Vor', 'Kal', 'Nyx', 'Zul', 'Mor', 'Kar', 'Gha', 'Xar', 'Tho', 'Ulg', 'Vex', 'Ith', 'Oph', 'Dra', 'Syl', 'Ur', 'Mog', 'Zer', 'Kro'];
const NAME_S2 = ['', '', 'a', 'o', 'u', 'e', 'ka', 'zo', 'ra', 'thi', 'ne', 'sa', 'lu', 'mi'];
const NAME_S3 = ['k', 'th', 'n', 'z', 'x', 'gul', 'tor', 'zar', 'oth', 'iss', 'ak', 'or', 'an', 'ys', 'eth', 'mog', 'ul', 'rak', 'ith'];

export function generateMonsterName(rng = Math.random) {
  const a = NAME_S1[Math.floor(rng() * NAME_S1.length)];
  const b = NAME_S2[Math.floor(rng() * NAME_S2.length)];
  const c = NAME_S3[Math.floor(rng() * NAME_S3.length)];
  return `${a}${b}${c}`;
}

// -------------------------------------------------------------
// CORPS / MONSTRES
// -------------------------------------------------------------
export function createMonster({ bodyId = 'larve', name, attachments = [], level = 1, xp = 0, role = 'harvester', hue }) {
  const body = BODIES[bodyId] || BODIES.larve;
  return {
    uid: uid('mon'),
    name: name || generateMonsterName(),
    bodyId,
    level,
    xp,
    role: ROLE_KEYS.includes(role) ? role : 'harvester',
    hue: typeof hue === 'number' ? ((hue % 1) + 1) % 1 : Math.random(),
    attachments,
    createdAt: Date.now()
  };
}

export function createStarterParts() {
  const eye = generatePart('eye', 'common', 101);
  const claw = generatePart('claw', 'common', 202);
  const tentacle = generatePart('tentacle', 'common', 303);
  const crystal = generatePart('crystal', 'rare', 404);
  const ear = generatePart('ear', 'common', 505);
  return { eye, claw, tentacle, crystal, ear };
}

// -------------------------------------------------------------
// FORMATAGE
// -------------------------------------------------------------
export function formatNumber(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.00$/, '')} Md`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.00$/, '')} M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')} k`;
  return Math.round(n).toLocaleString('fr-FR');
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// -------------------------------------------------------------
// EXPÉDITIONS — RENCONTRES, BESTIAIRE ET JOURNAL
// -------------------------------------------------------------
// Les rencontres sont tirées de la graine de l'expédition : elles sont donc
// identiques au rechargement et calculables même hors ligne. Aucune d'entre
// elles ne modifie les PV (déjà simulés en continu) : le journal se contente
// d'expliquer la courbe de vie.

export const BEAST_NAMES = {
  fosses: ['Radcafard', 'Spore grouillante', 'Ver de souche', 'Champi-crocs', 'Lampe-venin'],
  sel: ['Scarabée de sel', 'Chien de poussière', 'Racine sèche', 'Sable-gueule', 'Écailloir'],
  verre: ['Éclat rampant', 'Veuve de verre', 'Miroir hurlant', 'Verre-âme', 'Prisme ocellé'],
  nebuleuse: ['Spectre de gaz', 'Œil mort', 'Prière flottante', 'Nuage-crocs', 'Brume-perce'],
  ventre: ['Parasite digestif', 'Langue du Ventre', 'Gardien de chair', 'Épave-vivante', 'Cœur-puits']
};

export const BEAST_SHAPES = ['worm', 'eye', 'beast', 'roach'];

/** Génère un monstre aléatoire pour une zone, tiré de la graine de l'expédition. */
export function generateRandomBeast(rng, zone) {
  const names = BEAST_NAMES[zone?.id] || BEAST_NAMES.fosses;
  const shape = BEAST_SHAPES[Math.floor(rng() * BEAST_SHAPES.length)];
  const name = names[Math.floor(rng() * names.length)];
  return {
    id: `beast-${uid('b')}`,
    name,
    shape,
    elite: rng() < 0.15,
    hue: (zone?.hue ?? 0.28 + (rng() - 0.5) * 0.18 + 1) % 1
  };
}

export function beastsForZone(zone) {
  return EXPEDITION_BEASTS[zone?.id] || EXPEDITION_BEASTS.fosses;
}

/**
 * Tire les rencontres d'une expédition à partir de sa graine.
 * @returns {Array<{id:string, at:number, kind:string, beast:object|null, targetUid:string|null, amount:number}>}
 */
export function expeditionBeats(members, zone, seed, duration) {
  const list = (members || []).filter(Boolean);
  if (!list.length) return [];
  const rng = mulberry32((seed >>> 0) || 1);
  // Une rencontre toutes les ~15 % du trajet, entre 4 et 7 au total.
  const count = 4 + Math.floor(rng() * 4);
  const beats = [];
  for (let i = 0; i < count; i++) {
    const at = +(0.12 + ((i + 1) * 0.78) / (count + 1)).toFixed(3);
    const roll = rng();
    const target = list[Math.floor(rng() * list.length)] || list[0];
    const kind = roll < 0.62 ? 'enemy' : roll < 0.88 ? 'loot' : 'relic';
    beats.push({
      id: `beat${i}`,
      at,
      kind,
      beast: kind === 'enemy' ? generateRandomBeast(rng, zone) : null,
      targetUid: target.uid,
      amount: 6 + Math.floor(rng() * 18)
    });
  }
  return beats;
}

/** Progression temporelle d'une rencontre (0 → 1). */
export function expeditionProgressAt(exp, now = Date.now()) {
  const duration = Math.max(1, exp.duration || 1);
  return clamp((now - exp.startedAt) / (duration * 1000), 0, 1);
}

/**
 * Journal d'une expédition : les lignes déjà survenues, prêtes à afficher.
 * @returns {Array<{t:number, kind:string, icon:string, text:string}>}
 */
export function expeditionJournal(exp, members, zone, now = Date.now()) {
  const list = (members || []).filter(Boolean);
  const lines = [];
  if (!list.length) return lines;
  const duration = Math.max(1, exp.duration || 1);
  const names = list.map(m => m.name).join(' · ');
  lines.push({ t: 0, kind: 'start', icon: 'compass', text: `Départ du labo : ${names} vers ${zone.name}.` });

  const hpOf = (member, time) => calculateExpeditionHpAtTime(member, zone, exp.startedAt, time, duration).hp;

  for (const beat of exp.beats || []) {
    const time = exp.startedAt + beat.at * duration * 1000;
    if (now < time) break;
    const secs = Math.round(beat.at * duration);
    const target = list.find(m => m.uid === beat.targetUid) || list[0];

    if (beat.kind === 'enemy' && beat.beast) {
      lines.push({
        t: secs, kind: 'threat', icon: 'jaw',
        text: `${beat.beast.name} surgit devant ${target.name}.`
      });
      const before = hpOf(target, time - duration * 1000 * 0.04);
      const after = hpOf(target, Math.min(now, time + duration * 1000 * 0.02));
      const dmg = Math.max(1, Math.round(before - after));
      lines.push({
        t: secs, kind: 'damage', icon: 'sword',
        text: `${beat.beast.name} griffe ${target.name} : −${dmg} PV.`
      });
      lines.push({
        t: secs, kind: 'kill', icon: 'skull',
        text: `${target.name} l'abat et reprend la marche.`
      });
    } else if (beat.kind === 'loot') {
      lines.push({
        t: secs, kind: 'loot', icon: 'biomass',
        text: `${target.name} fouille une carcasse éventrée : +${beat.amount} biomasse.`
      });
    } else {
      lines.push({
        t: secs, kind: 'relic', icon: 'crystal',
        text: `${target.name} déniche un éclat intact sous la poussière.`
      });
    }
  }

  if (now >= exp.endsAt) {
    lines.push({ t: Math.round(duration), kind: 'return', icon: 'check', text: 'Retour au labo : le butin est prêt.' });
  } else {
    lines.push({ t: Math.round(expeditionProgressAt(exp, now) * duration), kind: 'moving', icon: 'arrow', text: 'Le groupe progresse…' });
  }
  return lines;
}
