// =============================================================
// CHIMÈRE — État, sauvegarde et actions de jeu
// =============================================================

import {
  BALANCE, BODIES, ZONES, ZONE_BY_ID, QUESTS, PART_TYPE_KEYS, SAVE_VERSION,
  ROLES, ROLE_KEYS, LAB_DEFENSES
} from './data.js';
import {
  uid, generatePart, generateMonsterName, createMonster, createStarterParts, monsterStats, monsterPower,
  capacityOf, canAttach, autoPlacements, applyXp, nextLevelXp,
  expeditionRates, groupExpeditionRates, resolveGroupExpedition,
  fairPrice, monsterValue, formatNumber, formatDuration, zonePower, roleOf,
  monsterMaxHp, expeditionDps, calculateExpeditionHpAtTime, calculateGroupExpeditionHpAtTime, isMonsterDead
} from './economy.js';
import {
  npcLabs, attackerSnapshot, resolveRaid, raidDuration, labDefense, defenseUpgradeBonus
} from './raid.js';

const BOT_NAMES = ['Kael', 'Nyx-07', 'Mira', 'Sable', 'Orrin', 'Vex', 'Luth', 'Dregg', 'Iko', 'Sélène', 'Rook', 'Tisseur', 'Mante', 'Vesper'];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function logEntry(state, text, kind = 'info') {
  state.log.unshift({ t: Date.now(), text, kind });
  state.log = state.log.slice(0, 40);
}

// -------------------------------------------------------------
// ÉTAT INITIAL
// -------------------------------------------------------------
export function createInitialState(playerName) {
  const parts = createStarterParts();
  const monster = createMonster({
    bodyId: 'larve',
    attachments: [],
    role: 'harvester'
  });

  const state = {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    player: {
      id: uid('player'),
      name: playerName || `Chercheur-${randInt(100, 999)}`,
      createdAt: Date.now()
    },
    resources: { biomass: BALANCE.startBiomass, shards: BALANCE.startShards },
    inventory: [parts.tentacle, parts.crystal, parts.ear],
    monsters: [monster],
    selectedMonsterId: monster.uid,
    guardianId: null,
    defenses: { sentry: 0 },
    expeditions: [],
    raids: [],
    unlocks: { bodies: ['larve'] },
    quests: {},
    records: {
      expeditionsDone: 0,
      sales: 0,
      bestPower: 0,
      maxAttachments: 0,
      partsFound: 0,
      verreRuns: 0,
      zoneRuns: {},
      shardsEarned: 0,
      biomassEarned: 0,
      biomassFed: 0,
      raidsDone: 0,
      raidsWon: 0
    },
    market: {
      listings: [],
      counter: 1,
      lastBotAt: 0
    },
    log: [],
    flags: {
      introSeen: false,
      tutorialDismissed: false
    },
    settings: { reduceMotion: false }
  };

  // Le monstre de départ a déjà deux greffes.
  const eyeSlot = 0;
  const clawSlot = Math.floor(BODIES.larve.sockets * 0.55);
  monster.attachments.push({ part: parts.eye, socket: eyeSlot });
  monster.attachments.push({ part: parts.claw, socket: clawSlot });

  logEntry(state, `Le laboratoire est en ligne. ${monster.name} vous attend.`, 'system');
  logEntry(state, 'Objectif : récolter, assembler, expédier, échanger.', 'info');

  seedMarket(state);
  updateRecords(state);
  return state;
}

// -------------------------------------------------------------
// SAUVEGARDE
// -------------------------------------------------------------
export function loadState() {
  try {
    const raw = localStorage.getItem(BALANCE.saveKey);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SAVE_VERSION) return createInitialState();
    return normalizeState(parsed);
  } catch (err) {
    console.warn('Sauvegarde illisible, nouveau laboratoire.', err);
    return createInitialState();
  }
}

export function normalizeState(state) {
  state.resources ||= { biomass: 0, shards: 0 };
  state.inventory ||= [];
  state.monsters ||= [];
  state.expeditions ||= [];
  state.unlocks ||= { bodies: ['larve'] };
  state.unlocks.bodies ||= ['larve'];
  state.quests ||= {};
  state.records ||= {};
  state.records.zoneRuns ||= {};
  state.records.bestPower ??= 0;
  state.records.expeditionsDone ??= 0;
  state.records.sales ??= 0;
  state.records.maxAttachments ??= 0;
  state.records.verreRuns ??= 0;
  state.records.biomassFed ??= 0;
  state.records.raidsDone ??= 0;
  state.records.raidsWon ??= 0;
  state.raids ||= [];
  state.raids = state.raids.filter(r => r && r.id && r.monsterId && r.endsAt && r.attacker);
  state.guardianId ??= null;
  if (!state.defenses || typeof state.defenses !== 'object' || Array.isArray(state.defenses)) {
    state.defenses = { sentry: 0 };
  }
  state.defenses.sentry = Math.max(0, Math.min(LAB_DEFENSES.length, Math.floor(Number(state.defenses.sentry) || 0)));
  if (state.guardianId && !state.monsters.some(m => m.uid === state.guardianId)) {
    state.guardianId = null;
  }
  for (const monster of state.monsters) {
    monster.fatigueUntil ??= 0;
    monster.role = ROLE_KEYS.includes(monster.role) ? monster.role : 'harvester';
    monster.hue = typeof monster.hue === 'number' ? ((monster.hue % 1) + 1) % 1 : Math.random();
  }
  state.expeditions = state.expeditions.filter(e => e && e.zoneId && e.endsAt).map(exp => {
    if (!Array.isArray(exp.monsterIds)) exp.monsterIds = exp.monsterId ? [exp.monsterId] : [];
    exp.monsterIds = exp.monsterIds.filter(id => state.monsters.some(m => m.uid === id));
    exp.monsterId = exp.monsterIds[0] || exp.monsterId;
    return exp;
  }).filter(exp => exp.monsterIds.length > 0);
  state.market ||= { listings: [], counter: 1, lastBotAt: 0 };
  state.market.listings ||= [];
  state.log ||= [];
  state.flags ||= {};
  state.settings ||= { reduceMotion: false };
  if (!state.selectedMonsterId || !state.monsters.find(m => m.uid === state.selectedMonsterId)) {
    state.selectedMonsterId = state.monsters[0]?.uid || null;
  }
  // Si la sauvegarde locale est le miroir d'un marché en ligne,
  // on ne réutilise pas les annonces du serveur hors ligne.
  if (state.market.serverMirror) {
    state.market.listings = [];
    state.market.serverMirror = false;
  }
  return state;
}

// -------------------------------------------------------------
// MARCHÉ LOCAL (simulation de joueurs)
// -------------------------------------------------------------
function randomBotPart(now) {
  const zone = pick(ZONES);
  const rarityRoll = Math.random();
  const rarity = rarityRoll < 0.62 ? 'common' : rarityRoll < 0.9 ? 'rare' : rarityRoll < 0.985 ? 'epic' : 'mythic';
  const type = pick(PART_TYPE_KEYS);
  const part = generatePart(type, rarity, Math.floor(Math.random() * 2 ** 31), 'marche');
  return part;
}

function makeBotListing(state, now) {
  const part = randomBotPart(now);
  const fair = fairPrice(part);
  const price = Math.max(15, Math.round(fair * rand(0.85, 1.35)));
  return {
    id: `mk_${state.market.counter++}`,
    kind: 'part',
    item: part,
    price,
    seller: pick(BOT_NAMES),
    sellerId: 'npc',
    mine: false,
    createdAt: now,
    expiresAt: now + BALANCE.marketDuration,
    sellAt: null
  };
}

function seedMarket(state) {
  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    state.market.listings.push(makeBotListing(state, now - i * 1000));
  }
  state.market.lastBotAt = now;
}

/** Remplit le comptoir local si besoin (hors ligne). */
export function seedLocalMarket(state) {
  if (!state.market) state.market = { listings: [], counter: 1, lastBotAt: 0 };
  if (state.market.listings.length > 0) return;
  seedMarket(state);
}

// -------------------------------------------------------------
// ENREGISTREMENTS
// -------------------------------------------------------------
export function questProgress(state, quest) {
  switch (quest.metric) {
    case 'expeditionsDone': return state.records.expeditionsDone || 0;
    case 'maxAttachments': return state.records.maxAttachments || 0;
    case 'sales': return state.records.sales || 0;
    case 'bestPower': return state.records.bestPower || 0;
    case 'verreRuns': return state.records.verreRuns || 0;
    case 'biomassFed': return state.records.biomassFed || 0;
    case 'raidsWon': return state.records.raidsWon || 0;
    default: return 0;
  }
}

export function updateRecords(state) {
  let maxAttachments = 0;
  let bestPower = state.records.bestPower || 0;
  for (const monster of state.monsters) {
    maxAttachments = Math.max(maxAttachments, monster.attachments.length);
    bestPower = Math.max(bestPower, monsterPower(monster));
  }
  state.records.maxAttachments = Math.max(state.records.maxAttachments || 0, maxAttachments);
  state.records.bestPower = Math.max(state.records.bestPower || 0, bestPower);
}

// -------------------------------------------------------------
// JEU
// -------------------------------------------------------------
export class Game {
  constructor() {
    this.state = loadState();
    seedLocalMarket(this.state);
    this.ensureSelection();
    this.listeners = new Set();
    this.eventListeners = new Set();
    this._saveTimer = null;
    this._lastTick = 0;
    this.mode = 'offline';
    this.net = null;
  }

  // ----- abonnements -----
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onEvent(fn) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  emitEvent(type, payload = {}) {
    for (const fn of this.eventListeners) fn({ type, ...payload });
  }

  commit({ save = true, reason = 'action' } = {}) {
    this.ensureSelection();
    updateRecords(this.state);
    for (const fn of this.listeners) fn(this.state, reason);
    if (save) this.scheduleSave();
  }

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 250);
    if (this.mode === 'online') this.emitEvent('remotesave');
  }

  saveNow() {
    try {
      localStorage.setItem(BALANCE.saveKey, JSON.stringify(this.state));
    } catch (err) {
      console.warn('Sauvegarde impossible', err);
    }
  }

  reset() {
    this.state = createInitialState();
    this.mode = 'offline';
    this.saveNow();
    this.emitEvent('toast', { text: 'Nouveau laboratoire créé.', kind: 'info' });
    this.commit({ reason: 'reset' });
  }

  exportSave() {
    return JSON.stringify(this.state);
  }

  importSave(raw) {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== SAVE_VERSION) throw new Error('Version de sauvegarde incompatible.');
    this.state = normalizeState(parsed);
    updateRecords(this.state);
    this.saveNow();
    this.commit({ reason: 'import' });
  }

  // ----- sélection -----
  ensureSelection() {
    const found = this.state.monsters.find(m => m.uid === this.state.selectedMonsterId);
    if (!found) {
      this.state.selectedMonsterId = this.state.monsters[0]?.uid || null;
    }
  }

  get selectedMonster() {
    return this.state.monsters.find(m => m.uid === this.state.selectedMonsterId) || null;
  }

  selectMonster(uid) {
    if (!this.state.monsters.find(m => m.uid === uid)) return false;
    this.state.selectedMonsterId = uid;
    this.commit({ reason: 'select' });
    return true;
  }

  renameMonster(uid, name) {
    const monster = this.state.monsters.find(m => m.uid === uid);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    const clean = String(name || '').trim().slice(0, 24);
    if (!clean) return { ok: false, reason: 'Le nom ne peut pas être vide.' };
    monster.name = clean;
    this.commit();
    return { ok: true, name: clean };
  }

  renamePlayer(name) {
    const clean = String(name || '').trim().slice(0, 20);
    if (!clean) return { ok: false, reason: 'Nom invalide.' };
    this.state.player.name = clean;
    this.commit();
    return { ok: true };
  }

  /** Convertit de la biomasse en XP pour un spécimen. */
  feedMonster(monsterId, biomass) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };
    const amount = Math.floor(Number(biomass) || 0);
    if (amount < 10) return { ok: false, reason: 'Minimum 10 biomasse.' };
    if (this.state.resources.biomass < amount) {
      return { ok: false, reason: 'Pas assez de biomasse.' };
    }

    const xp = Math.max(1, Math.round(amount / BALANCE.feedRate));
    this.state.resources.biomass -= amount;
    this.state.records.biomassFed = (this.state.records.biomassFed || 0) + amount;
    const levels = applyXp(monster, xp);
    logEntry(this.state, `${monster.name} absorbe ${formatNumber(amount)} biomasse (+${formatNumber(xp)} XP).`, 'level');
    if (levels > 0) {
      logEntry(this.state, `${monster.name} atteint le niveau ${monster.level}.`, 'level');
      this.emitEvent('toast', { text: `${monster.name} · niveau ${monster.level} !`, kind: 'level' });
    }
    this.emitEvent('feed', { monster, amount, xp, levels });
    this.commit();
    return { ok: true, monster, amount, xp, levels };
  }

  // ----- inventaire -----
  addPart(part, { silent = false } = {}) {
    if (this.state.inventory.length >= BALANCE.inventoryMax) {
      const value = Math.round(fairPrice(part) * 1.4);
      this.state.resources.biomass += value;
      logEntry(this.state, `Inventaire plein : ${part.name} converti en ${formatNumber(value)} biomasse.`, 'warn');
      if (!silent) this.emitEvent('toast', { text: `Inventaire plein · +${formatNumber(value)} biomasse`, kind: 'warn' });
      return { ok: true, converted: value };
    }
    this.state.inventory.push(part);
    this.state.records.partsFound = (this.state.records.partsFound || 0) + 1;
    return { ok: true };
  }

  addParts(parts) {
    let converted = 0;
    for (const part of parts) {
      const result = this.addPart(part, { silent: true });
      if (result.converted) converted += result.converted;
    }
    return converted;
  }

  removePartFromInventory(partUid) {
    const index = this.state.inventory.findIndex(p => p.uid === partUid);
    if (index === -1) return null;
    return this.state.inventory.splice(index, 1)[0];
  }

  inventoryValue() {
    return this.state.inventory.reduce((sum, p) => sum + fairPrice(p), 0);
  }

  // ----- assemblage -----
  isAway(monsterId) {
    return this.state.expeditions.some(e =>
      (e.monsterIds || [e.monsterId]).includes(monsterId)
    ) || this.state.raids.some(r => r.monsterId === monsterId);
  }

  isExploring(monsterId) {
    return this.isAway(monsterId);
  }

  isFatigued(monster) {
    return Boolean(monster && (monster.fatigueUntil || 0) > Date.now());
  }

  isGuardian(monsterId) {
    return this.state.guardianId === monsterId;
  }

  /** Peut-on envoyer ce monstre en expédition ou en razzia ? */
  canDeploy(monsterId) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.activeExpedition(monsterId)) return { ok: false, reason: 'Déjà en expédition.' };
    if (this.activeRaid(monsterId)) return { ok: false, reason: 'Déjà en razzia.' };
    if (this.isGuardian(monsterId)) return { ok: false, reason: 'Ce monstre garde le laboratoire.' };
    if (this.isFatigued(monster)) {
      const left = Math.ceil(((monster.fatigueUntil || 0) - Date.now()) / 1000);
      return { ok: false, reason: `Fatigue : encore ${formatDuration(left)}.` };
    }
    return { ok: true };
  }

  activeRaid(monsterId) {
    return this.state.raids.find(r => r.monsterId === monsterId) || null;
  }

  /** Activité en cours du monstre sélectionné (expédition ou razzia). */
  activeActivity(monsterId) {
    const raid = this.activeRaid(monsterId);
    if (raid) return { type: 'raid', raid };
    const expedition = this.activeExpedition(monsterId);
    if (expedition) return { type: 'expedition', expedition };
    return null;
  }

  get guardianMonster() {
    return this.state.monsters.find(m => m.uid === this.state.guardianId) || null;
  }

  labDefenseValue() {
    const bonus = defenseUpgradeBonus(this.state.defenses?.sentry);
    return labDefense(this.state.records.bestPower || 0, this.guardianMonster, bonus);
  }

  upgradeSentry() {
    const currentLevel = this.state.defenses?.sentry || 0;
    const upgrade = LAB_DEFENSES[currentLevel];
    if (!upgrade) return { ok: false, reason: 'La tourelle de veille est au niveau maximal.' };
    if (this.state.resources.biomass < upgrade.biomass || this.state.resources.shards < upgrade.shards) {
      return { ok: false, reason: 'Ressources insuffisantes pour améliorer la tourelle.' };
    }

    this.state.resources.biomass -= upgrade.biomass;
    this.state.resources.shards -= upgrade.shards;
    this.state.defenses.sentry = currentLevel + 1;
    logEntry(this.state, `Tourelle de veille améliorée au niveau ${currentLevel + 1} (+${upgrade.defense} DEF).`, 'unlock');
    this.emitEvent('toast', { text: `Tourelle de veille · niveau ${currentLevel + 1}`, kind: 'success' });
    this.commit({ reason: 'defense-upgrade' });
    return { ok: true, level: currentLevel + 1, defense: upgrade.defense, cost: { biomass: upgrade.biomass, shards: upgrade.shards } };
  }

  setGuardian(monsterId) {
    if (this.mode === 'online') return { ok: false, reason: 'Serveur en ligne : utilise le serveur.' };
    if (!monsterId) {
      this.state.guardianId = null;
      logEntry(this.state, 'Le laboratoire n’a plus de gardien.', 'warn');
      this.commit();
      return { ok: true };
    }
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };
    if (this.state.guardianId === monsterId) return { ok: true, guardian: monster };
    this.state.guardianId = monsterId;
    logEntry(this.state, `${monster.name} devient le gardien du laboratoire.`, 'unlock');
    this.emitEvent('toast', { text: `${monster.name} garde le laboratoire`, kind: 'success' });
    this.commit();
    return { ok: true, guardian: monster };
  }

  raidTargets() {
    return npcLabs();
  }

  attachPart(monsterId, partUid, socket) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };

    const part = this.state.inventory.find(p => p.uid === partUid);
    if (!part) return { ok: false, reason: 'Cette partie n’est plus dans l’inventaire.' };

    const check = canAttach(monster, part, socket);
    if (!check.ok) return { ok: false, reason: check.reason };

    this.removePartFromInventory(partUid);
    monster.attachments.push({ part, socket });
    this.emitEvent('attach', { monster, part, socket });
    this.commit({ reason: 'attach' });
    return { ok: true, monster, part };
  }

  detachPart(monsterId, partUid) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };
    if (this.state.inventory.length >= BALANCE.inventoryMax) {
      return { ok: false, reason: 'Inventaire plein : impossible de détacher.' };
    }

    const index = monster.attachments.findIndex(a => a.part.uid === partUid);
    if (index === -1) return { ok: false, reason: 'Cette partie n’est pas greffée ici.' };
    const [attachment] = monster.attachments.splice(index, 1);
    this.state.inventory.push(attachment.part);
    this.emitEvent('detach', { monster, part: attachment.part, socket: attachment.socket });
    this.commit({ reason: 'detach' });
    return { ok: true, monster, part: attachment.part };
  }

  autoAssemble(monsterId) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };

    const placements = autoPlacements(monster, this.state.inventory);
    if (!placements.length) return { ok: false, reason: 'Aucune partie compatible à assembler.' };

    for (const { part, socket } of placements) {
      this.removePartFromInventory(part.uid);
      monster.attachments.push({ part, socket });
    }
    this.emitEvent('autoassemble', { monster, placements });
    this.commit({ reason: 'autoassemble' });
    return { ok: true, count: placements.length, monster };
  }

  /** Retire toutes les greffes et les remet dans l'inventaire. */
  stripMonster(monsterId) {
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Ce monstre est en mission.' };
    const free = BALANCE.inventoryMax - this.state.inventory.length;
    if (free <= 0) return { ok: false, reason: 'Inventaire plein.' };
    const removed = monster.attachments.splice(0, free);
    for (const a of removed) this.state.inventory.push(a.part);
    this.commit();
    return { ok: true, count: removed.length, remaining: monster.attachments.length };
  }

  // ----- corps / monstres -----
  unlockBody(bodyId) {
    const body = BODIES[bodyId];
    if (!body) return { ok: false, reason: 'Corps inconnu.' };
    if (this.state.unlocks.bodies.includes(bodyId)) return { ok: false, reason: 'Déjà débloqué.' };
    const { biomass, shards } = body.unlockCost;
    if (this.state.resources.biomass < biomass || this.state.resources.shards < shards) {
      return { ok: false, reason: 'Ressources insuffisantes.' };
    }
    this.state.resources.biomass -= biomass;
    this.state.resources.shards -= shards;
    this.state.unlocks.bodies.push(bodyId);
    logEntry(this.state, `Plan du ${body.label} débloqué.`, 'unlock');
    this.emitEvent('toast', { text: `Plan débloqué : ${body.label}`, kind: 'success' });
    this.commit();
    return { ok: true };
  }

  createMonster(bodyId) {
    const body = BODIES[bodyId];
    if (!body) return { ok: false, reason: 'Corps inconnu.' };
    if (!this.state.unlocks.bodies.includes(bodyId)) return { ok: false, reason: 'Plan non débloqué.' };
    if (this.state.monsters.length >= BALANCE.labSlots) {
      return { ok: false, reason: `Laboratoire plein (${BALANCE.labSlots} spécimens).` };
    }
    if (this.state.resources.biomass < body.createCost.biomass ||
        this.state.resources.shards < body.createCost.shards) {
      return { ok: false, reason: 'Ressources insuffisantes.' };
    }

    this.state.resources.biomass -= body.createCost.biomass;
    this.state.resources.shards -= body.createCost.shards;
    const monster = createMonster({ bodyId });
    this.state.monsters.push(monster);
    this.state.selectedMonsterId = monster.uid;
    logEntry(this.state, `${monster.name} sort du bain de culture.`, 'unlock');
    this.emitEvent('toast', { text: `Nouveau spécimen : ${monster.name}`, kind: 'success' });
    this.commit();
    return { ok: true, monster };
  }

  setRole(monsterId, role) {
    if (!ROLE_KEYS.includes(role)) return { ok: false, reason: 'Rôle inconnu.' };
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Spécimen introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Impossible de changer de rôle en mission.' };
    if (monster.role === role) return { ok: true, role };
    monster.role = role;
    const def = ROLES[role];
    logEntry(this.state, `${monster.name} devient ${def.label.toLowerCase()}.`, 'role');
    this.emitEvent('toast', { text: `${monster.name} · ${def.label}`, kind: 'success' });
    this.commit({ reason: 'role' });
    return { ok: true, role, monster };
  }

  // ----- expéditions -----
  activeExpedition(monsterId) {
    return this.state.expeditions.find(e =>
      (e.monsterIds || [e.monsterId]).includes(monsterId)
    ) || null;
  }

  expeditionMembers(expedition) {
    const ids = expedition?.monsterIds || (expedition?.monsterId ? [expedition.monsterId] : []);
    return ids
      .map(id => this.state.monsters.find(m => m.uid === id))
      .filter(Boolean);
  }

  zoneStatus(monster, zone, squad = []) {
    const unlocked = (this.state.records.bestPower || 0) >= zone.unlockPower;
    const active = monster ? this.activeExpedition(monster.uid) : null;
    const ids = [monster?.uid, ...(squad || [])].filter(Boolean);
    const members = [...new Set(ids)]
      .map(id => this.state.monsters.find(m => m.uid === id))
      .filter(Boolean)
      .slice(0, 3);
    const rates = members.length ? groupExpeditionRates(members, zone) : null;
    const deploy = monster ? this.canDeploy(monster.uid) : { ok: false, reason: 'Aucun spécimen.' };
    return {
      zone,
      unlocked,
      active,
      rates,
      members,
      canLaunch: Boolean(monster) && unlocked && deploy.ok,
      deploy
    };
  }

  startExpedition(monsterId, zoneId, extraIds = []) {
    const zone = ZONE_BY_ID[zoneId];
    if (!zone) return { ok: false, reason: 'Zone inconnue.' };

    const ids = [...new Set([monsterId, ...(extraIds || [])])].slice(0, 3);
    const members = ids
      .map(id => this.state.monsters.find(m => m.uid === id))
      .filter(Boolean);
    if (!members.length) return { ok: false, reason: 'Monstre introuvable.' };
    if (members.length !== ids.length) return { ok: false, reason: 'Un membre de l’escouade est introuvable.' };
    if ((this.state.records.bestPower || 0) < zone.unlockPower) {
      return { ok: false, reason: `Puissance ${zone.unlockPower} requise pour débloquer cette zone.` };
    }

    for (const member of members) {
      if (this.canDeploy(member.uid).ok) continue;
      return { ok: false, reason: `${member.name} : ${this.canDeploy(member.uid).reason}` };
    }

    const rates = groupExpeditionRates(members, zone);
    const now = Date.now();
    
    // Initialize HP for each member
    for (const member of members) {
      member.currentHp = monsterMaxHp(member);
    }

    const exp = {
      id: uid('exp'),
      monsterId: members[0].uid,
      monsterIds: members.map(m => m.uid),
      zoneId,
      startedAt: now,
      endsAt: now + rates.duration * 1000,
      duration: rates.duration,
      seed: Math.floor(Math.random() * 2 ** 31),
      notified: false,
      // Track HP at start for recall calculations
      startHp: members.map(m => ({ uid: m.uid, hp: m.currentHp, maxHp: monsterMaxHp(m) }))
    };
    this.state.expeditions.push(exp);
    const names = members.map(m => m.name).join(', ');
    logEntry(
      this.state,
      members.length > 1
        ? `Escouade (${names}) part vers ${zone.name}.`
        : `${members[0].name} part vers ${zone.name}.`,
      'expedition'
    );
    this.commit();
    return { ok: true, expedition: exp, members, rates };
  }

  claimExpedition(expeditionId) {
    const index = this.state.expeditions.findIndex(e => e.id === expeditionId);
    if (index === -1) return { ok: false, reason: 'Expédition introuvable.' };
    const exp = this.state.expeditions[index];
    if (Date.now() < exp.endsAt) return { ok: false, reason: 'Expédition encore en cours.' };

    const members = this.expeditionMembers(exp);
    const zone = ZONE_BY_ID[exp.zoneId];
    this.state.expeditions.splice(index, 1);
    if (!members.length || !zone) {
      this.commit();
      return { ok: false, reason: 'Expédition close : spécimens perdus.' };
    }

    const outcome = resolveGroupExpedition(members, zone, exp.seed);
    this.state.resources.biomass += outcome.biomass;
    this.state.resources.shards += outcome.shards;
    this.state.records.biomassEarned = (this.state.records.biomassEarned || 0) + outcome.biomass;
    this.state.records.shardsEarned = (this.state.records.shardsEarned || 0) + outcome.shards;
    this.state.records.expeditionsDone = (this.state.records.expeditionsDone || 0) + 1;
    this.state.records.zoneRuns[zone.id] = (this.state.records.zoneRuns[zone.id] || 0) + 1;
    if (zone.id === 'verre') this.state.records.verreRuns = (this.state.records.verreRuns || 0) + 1;

    const converted = this.addParts(outcome.parts);
    const memberLevels = [];
    let levels = 0;
    for (const member of members) {
      const gained = applyXp(member, outcome.xpEach || outcome.xp);
      if (gained > 0) {
        levels += gained;
        memberLevels.push({ uid: member.uid, name: member.name, level: member.level });
        this.emitEvent('toast', { text: `${member.name} · niveau ${member.level} !`, kind: 'level' });
      }
    }

    const names = members.map(m => m.name).join(', ');
    logEntry(
      this.state,
      `${names} rentre de ${zone.name} : +${formatNumber(outcome.biomass)} biomasse, ${outcome.parts.length} partie(s).`,
      'loot'
    );
    this.emitEvent('claim', {
      monster: members[0],
      monsters: members,
      zone,
      outcome,
      converted,
      levels,
      memberLevels
    });
    this.commit({ reason: 'claim' });
    return {
      ok: true,
      monster: members[0],
      monsters: members,
      zone,
      outcome,
      converted,
      levels,
      memberLevels
    };
  }

  claimAll() {
    const ready = this.state.expeditions.filter(e => Date.now() >= e.endsAt);
    const results = [];
    for (const exp of ready) {
      const result = this.claimExpedition(exp.id);
      if (result.ok) results.push(result);
    }
    return results;
  }

  /** Rappelle une expédition avant la fin. Les monstres reviennent avec leur HP actuel.
   * Butin proportionnel au temps passé, pas de pénalité XP. */
  recallExpedition(expeditionId) {
    const index = this.state.expeditions.findIndex(e => e.id === expeditionId);
    if (index === -1) return { ok: false, reason: 'Expédition introuvable.' };
    const exp = this.state.expeditions[index];
    const now = Date.now();
    if (now >= exp.endsAt) return { ok: false, reason: 'Expédition déjà terminée.' };

    const members = this.expeditionMembers(exp);
    const zone = ZONE_BY_ID[exp.zoneId];
    if (!members.length || !zone) {
      this.state.expeditions.splice(index, 1);
      this.commit();
      return { ok: false, reason: 'Expédition invalide.' };
    }

    // Calculate current HP for each member
    const hpResults = calculateGroupExpeditionHpAtTime(members, zone, exp.startedAt, now, exp.duration);
    
    // Check for dead monsters
    const deadMembers = [];
    for (let i = 0; i < members.length; i++) {
      const hpData = hpResults[i];
      members[i].currentHp = hpData.hp;
      if (hpData.dead) {
        deadMembers.push(members[i]);
      }
    }

    // Remove expedition
    this.state.expeditions.splice(index, 1);

    // Calculate partial rewards based on time spent
    const progress = Math.min(1, (now - exp.startedAt) / (exp.endsAt - exp.startedAt));
    const rates = groupExpeditionRates(members, zone);
    const outcome = resolveGroupExpedition(members, zone, exp.seed);
    
    // Scale rewards by progress (minimum 10%)
    const rewardMult = Math.max(0.1, progress);
    const biomass = Math.round(outcome.biomass * rewardMult);
    const shards = Math.round(outcome.shards * rewardMult);
    const xpEach = Math.round(outcome.xpEach * rewardMult);
    const parts = outcome.parts.slice(0, Math.max(1, Math.ceil(outcome.parts.length * rewardMult)));

    this.state.resources.biomass += biomass;
    this.state.resources.shards += shards;
    this.state.records.biomassEarned = (this.state.records.biomassEarned || 0) + biomass;
    this.state.records.shardsEarned = (this.state.records.shardsEarned || 0) + shards;
    this.state.records.expeditionsDone = (this.state.records.expeditionsDone || 0) + 1;
    this.state.records.zoneRuns[zone.id] = (this.state.records.zoneRuns[zone.id] || 0) + 1;
    if (zone.id === 'verre') this.state.records.verreRuns = (this.state.records.verreRuns || 0) + 1;

    const converted = this.addParts(parts);
    const memberLevels = [];
    for (const member of members) {
      const gained = applyXp(member, xpEach);
      if (gained > 0) {
        memberLevels.push({ uid: member.uid, name: member.name, level: member.level });
        this.emitEvent('toast', { text: `${member.name} · niveau ${member.level} !`, kind: 'level' });
      }
    }

    // Handle dead monsters - they're fatigued for longer
    for (const dead of deadMembers) {
      dead.fatigueUntil = Math.max(dead.fatigueUntil || 0, Date.now() + 3600 * 1000); // 1 hour fatigue
      logEntry(this.state, `${dead.name} est revenu épuisé de ${zone.name} (HP: 0).`, 'warn');
      this.emitEvent('toast', { text: `${dead.name} est revenu épuisé !`, kind: 'warn' });
    }

    const names = members.map(m => m.name).join(', ');
    logEntry(
      this.state,
      `${names} rappelé de ${zone.name} (${Math.round(progress * 100)}%) : +${formatNumber(biomass)} biomasse, ${parts.length} partie(s).`,
      deadMembers.length ? 'warn' : 'loot'
    );

    this.emitEvent('recall', {
      monsters: members,
      zone,
      progress,
      outcome: { biomass, shards, xpEach, parts },
      converted,
      memberLevels,
      dead: deadMembers.map(m => m.uid)
    });

    this.commit({ reason: 'recall' });
    return {
      ok: true,
      monsters: members,
      zone,
      progress,
      biomass,
      shards,
      xpEach,
      parts,
      converted,
      memberLevels,
      dead: deadMembers.map(m => m.uid)
    };
  }

  /** Récupère l'HP actuel de tous les monstres en expédition (pour l'UI temps réel) */
  getExpeditionHp(expeditionId) {
    const exp = this.state.expeditions.find(e => e.id === expeditionId);
    if (!exp) return null;
    const members = this.expeditionMembers(exp);
    const zone = ZONE_BY_ID[exp.zoneId];
    if (!zone) return null;
    const now = Date.now();
    return calculateGroupExpeditionHpAtTime(members, zone, exp.startedAt, now, exp.duration);
  }

  // ----- razzias (mode local) -----
  startRaid(monsterId, target) {
    if (this.mode === 'online') return { ok: false, reason: 'Serveur en ligne : utilise le serveur.' };
    const monster = this.state.monsters.find(m => m.uid === monsterId);
    if (!monster) return { ok: false, reason: 'Monstre introuvable.' };
    if (!target || !target.id || !Number.isFinite(target.defense)) {
      return { ok: false, reason: 'Cible invalide.' };
    }
    const deploy = this.canDeploy(monsterId);
    if (!deploy.ok) return deploy;

    const now = Date.now();
    const duration = raidDuration(monster);
    const raid = {
      id: uid('raid'),
      monsterId,
      target: {
        id: target.id,
        kind: target.kind || 'npc',
        name: target.name,
        level: target.level || 1,
        defense: target.defense,
        biomass: target.biomass || 0,
        shards: target.shards || 0,
        hue: target.hue ?? 0.3,
        guardianName: target.guardianName || null
      },
      attacker: attackerSnapshot(monster),
      startedAt: now,
      endsAt: now + duration * 1000,
      duration,
      seed: Math.floor(Math.random() * 2 ** 31),
      notified: false
    };
    this.state.raids.push(raid);
    logEntry(this.state, `${monster.name} part en razzia contre ${target.name}.`, 'raid');
    this.commit();
    return { ok: true, raid };
  }

  claimRaid(raidId) {
    if (this.mode === 'online') return { ok: false, reason: 'Serveur en ligne : utilise le serveur.' };
    const index = this.state.raids.findIndex(r => r.id === raidId);
    if (index === -1) return { ok: false, reason: 'Razzia introuvable.' };
    const raid = this.state.raids[index];
    if (Date.now() < raid.endsAt) return { ok: false, reason: 'La razzia est encore en cours.' };

    this.state.raids.splice(index, 1);
    const monster = this.state.monsters.find(m => m.uid === raid.monsterId);
    const result = resolveRaid({
      attacker: raid.attacker,
      defender: {
        name: raid.target.name,
        kind: raid.target.kind,
        defense: raid.target.defense,
        biomass: raid.target.biomass,
        shards: raid.target.shards,
        guardianName: raid.target.guardianName
      },
      seed: raid.seed
    });

    this.state.resources.biomass += result.lootBiomass;
    this.state.resources.shards += result.lootShards;
    this.state.records.raidsDone = (this.state.records.raidsDone || 0) + 1;
    if (result.win) this.state.records.raidsWon = (this.state.records.raidsWon || 0) + 1;
    this.state.records.biomassEarned = (this.state.records.biomassEarned || 0) + result.lootBiomass;
    this.state.records.shardsEarned = (this.state.records.shardsEarned || 0) + result.lootShards;

    if (monster) {
      applyXp(monster, result.xp);
      if (result.fatigue > 0) {
        monster.fatigueUntil = Math.max(monster.fatigueUntil || 0, Date.now() + result.fatigue * 1000);
      }
    }

    if (result.win) {
      logEntry(
        this.state,
        `${monster?.name || 'Un spécimen'} pille ${raid.target.name} : +${formatNumber(result.lootBiomass)} biomasse, +${formatNumber(result.lootShards)} éclats.`,
        'raid'
      );
    } else {
      logEntry(
        this.state,
        `${raid.target.name} repousse ${monster?.name || 'le raid'}. Fatigue : ${formatDuration(result.fatigue)}.`,
        'raid'
      );
    }

    this.emitEvent('raid-claim', { raid, result, monster });
    this.commit({ reason: 'raid-claim' });
    return { ok: true, raid, result, monster };
  }

  claimAllRaids() {
    const ready = this.state.raids.filter(r => Date.now() >= r.endsAt);
    const results = [];
    for (const raid of ready) {
      const result = this.claimRaid(raid.id);
      if (result.ok) results.push(result);
    }
    return results;
  }

  // ----- marché local -----
  get marketMode() {
    return this.mode;
  }

  listingFair(listing) {
    return listing.kind === 'monster' ? monsterValue(listing.item) : fairPrice(listing.item);
  }

  sellPart(partUid, price, { sellerName } = {}) {
    if (this.mode === 'online') return { ok: false, reason: 'Marché en ligne : utilise le serveur.' };
    const index = this.state.inventory.findIndex(p => p.uid === partUid);
    if (index === -1) return { ok: false, reason: 'Partie introuvable.' };
    if (this.state.market.listings.filter(l => l.mine).length >= BALANCE.marketSlots) {
      return { ok: false, reason: 'Trop d’annonces actives.' };
    }
    const part = this.state.inventory.splice(index, 1)[0];
    const fair = fairPrice(part);
    const cleanPrice = Math.max(1, Math.round(price));
    const now = Date.now();
    const listing = {
      id: `mk_${this.state.market.counter++}`,
      kind: 'part',
      item: part,
      price: cleanPrice,
      seller: sellerName || this.state.player.name,
      sellerId: this.state.player.id,
      mine: true,
      createdAt: now,
      expiresAt: now + BALANCE.marketDuration,
      sellAt: cleanPrice <= fair * 1.3 ? now + rand(BALANCE.marketBotDelayMin, BALANCE.marketBotDelayMax) : null
    };
    this.state.market.listings.unshift(listing);
    this.emitEvent('toast', { text: `Annonce publiée : ${part.name} · ${cleanPrice} éclats`, kind: 'success' });
    this.commit();
    return { ok: true, listing };
  }

  sellMonster(monsterId, price) {
    if (this.mode === 'online') return { ok: false, reason: 'Marché en ligne : utilise le serveur.' };
    const index = this.state.monsters.findIndex(m => m.uid === monsterId);
    if (index === -1) return { ok: false, reason: 'Monstre introuvable.' };
    if (this.isAway(monsterId)) return { ok: false, reason: 'Un monstre en mission ne peut pas être vendu.' };
    if (this.state.monsters.length <= 1) return { ok: false, reason: 'Garde au moins un spécimen au laboratoire.' };
    if (this.state.guardianId === monsterId) return { ok: false, reason: 'Le gardien ne peut pas être vendu.' };
    if (this.state.market.listings.filter(l => l.mine).length >= BALANCE.marketSlots) {
      return { ok: false, reason: 'Trop d’annonces actives.' };
    }
    const [monster] = this.state.monsters.splice(index, 1);
    const fair = monsterValue(monster);
    const cleanPrice = Math.max(1, Math.round(price));
    const now = Date.now();
    const listing = {
      id: `mk_${this.state.market.counter++}`,
      kind: 'monster',
      item: monster,
      price: cleanPrice,
      seller: this.state.player.name,
      sellerId: this.state.player.id,
      mine: true,
      createdAt: now,
      expiresAt: now + BALANCE.marketDuration,
      sellAt: cleanPrice <= fair * 1.25 ? now + rand(BALANCE.marketBotDelayMin, BALANCE.marketBotDelayMax) : null
    };
    this.state.market.listings.unshift(listing);
    this.ensureSelection();
    this.emitEvent('toast', { text: `Annonce publiée : ${monster.name} · ${cleanPrice} éclats`, kind: 'success' });
    this.commit();
    return { ok: true, listing };
  }

  cancelListing(listingId) {
    if (this.mode === 'online') return { ok: false, reason: 'Marché en ligne : utilise le serveur.' };
    const index = this.state.market.listings.findIndex(l => l.id === listingId && l.mine);
    if (index === -1) return { ok: false, reason: 'Annonce introuvable.' };
    const [listing] = this.state.market.listings.splice(index, 1);
    if (listing.kind === 'part') {
      if (this.state.inventory.length >= BALANCE.inventoryMax) {
        this.state.market.listings.splice(index, 0, listing);
        return { ok: false, reason: 'Inventaire plein : impossible de retirer l’annonce.' };
      }
      this.state.inventory.push(listing.item);
    } else {
      if (this.state.monsters.length >= BALANCE.labSlots) {
        this.state.market.listings.splice(index, 0, listing);
        return { ok: false, reason: 'Laboratoire plein : impossible de retirer l’annonce.' };
      }
      this.state.monsters.push(listing.item);
    }
    this.commit();
    return { ok: true };
  }

  buyListing(listingId) {
    if (this.mode === 'online') return { ok: false, reason: 'Marché en ligne : utilise le serveur.' };
    const index = this.state.market.listings.findIndex(l => l.id === listingId && !l.mine);
    if (index === -1) return { ok: false, reason: 'Annonce introuvable.' };
    const listing = this.state.market.listings[index];
    if (this.state.resources.shards < listing.price) {
      return { ok: false, reason: 'Pas assez d’éclats.' };
    }
    if (listing.kind === 'monster' && this.state.monsters.length >= BALANCE.labSlots) {
      return { ok: false, reason: 'Laboratoire plein.' };
    }
    if (listing.kind === 'part' && this.state.inventory.length >= BALANCE.inventoryMax) {
      return { ok: false, reason: 'Inventaire plein.' };
    }

    this.state.resources.shards -= listing.price;
    this.state.market.listings.splice(index, 1);
    if (listing.kind === 'part') {
      this.addPart(listing.item);
    } else {
      this.state.monsters.push(listing.item);
      this.state.selectedMonsterId = listing.item.uid;
    }
    this.emitEvent('toast', { text: `Acheté : ${listing.item.name}`, kind: 'success' });
    this.commit();
    return { ok: true, listing };
  }

  /** Fait tourner l'économie locale : ventes PNJ, annonces, expirations. */
  tickMarket(now = Date.now()) {
    if (this.mode !== 'offline') return false;
    let changed = false;
    const listings = this.state.market.listings;

    // 1. Ventes de nos annonces
    for (let i = listings.length - 1; i >= 0; i--) {
      const listing = listings[i];
      if (listing.mine && listing.sellAt && now >= listing.sellAt) {
        const net = Math.round(listing.price * (1 - BALANCE.marketTax));
        this.state.resources.shards += net;
        this.state.records.sales = (this.state.records.sales || 0) + 1;
        this.state.records.shardsEarned = (this.state.records.shardsEarned || 0) + net;
        listings.splice(i, 1);
        logEntry(this.state, `Vendu : ${listing.item.name} à un collectionneur (+${net} éclats).`, 'sale');
        this.emitEvent('market-sale', { listing, net });
        this.emitEvent('toast', { text: `Vendu ! +${formatNumber(net)} éclats`, kind: 'success' });
        changed = true;
      }
    }

    // 2. Expirations
    for (let i = listings.length - 1; i >= 0; i--) {
      const listing = listings[i];
      if (now < listing.expiresAt) continue;
      if (listing.mine) {
        const canReturn = listing.kind === 'part'
          ? this.state.inventory.length < BALANCE.inventoryMax
          : this.state.monsters.length < BALANCE.labSlots;
        if (canReturn) {
          if (listing.kind === 'part') this.state.inventory.push(listing.item);
          else this.state.monsters.push(listing.item);
          listings.splice(i, 1);
          logEntry(this.state, `Annonce expirée : ${listing.item.name} retourne au labo.`, 'warn');
          this.emitEvent('toast', { text: `Annonce expirée · ${listing.item.name} récupéré`, kind: 'warn' });
          changed = true;
        } else {
          listing.expiresAt = now + 10 * 60 * 1000;
          changed = true;
        }
      } else {
        listings.splice(i, 1);
        changed = true;
      }
    }

    // 3. Nouvelles annonces PNJ
    const bots = listings.filter(l => !l.mine).length;
    if (bots < 6 && now - (this.state.market.lastBotAt || 0) > 18000) {
      this.state.market.listings.push(makeBotListing(this.state, now));
      this.state.market.lastBotAt = now;
      changed = true;
    }

    return changed;
  }

  // ----- objectifs -----
  questStates() {
    return QUESTS.map(quest => {
      const progress = Math.min(questProgress(this.state, quest), quest.goal);
      const claimed = Boolean(this.state.quests[quest.id]?.claimed);
      return {
        ...quest,
        progress,
        claimed,
        complete: progress >= quest.goal,
        claimable: progress >= quest.goal && !claimed
      };
    });
  }

  claimQuest(questId) {
    const quest = QUESTS.find(q => q.id === questId);
    if (!quest) return { ok: false, reason: 'Objectif inconnu.' };
    const state = this.questStates().find(q => q.id === questId);
    if (!state.claimable) return { ok: false, reason: 'Objectif non terminé ou déjà réclamé.' };

    this.state.quests[questId] = { claimed: true, claimedAt: Date.now() };
    this.state.resources.biomass += quest.rewards.biomass || 0;
    this.state.resources.shards += quest.rewards.shards || 0;
    const parts = [];
    for (const loot of quest.rewards.loot || []) {
      for (let i = 0; i < loot.count; i++) {
        parts.push(generatePart(
          pick(PART_TYPE_KEYS),
          loot.rarity,
          Math.floor(Math.random() * 2 ** 31),
          `objectif:${quest.id}`
        ));
      }
    }
    const converted = this.addParts(parts);
    logEntry(this.state, `Objectif accompli : ${quest.title}.`, 'quest');
    this.emitEvent('claim-quest', { quest, parts, converted });
    this.commit();
    return { ok: true, quest, parts, converted };
  }

  // ----- boucle -----
  tick(now = Date.now()) {
    if (now - this._lastTick < 900) return;
    this._lastTick = now;

    let changed = false;
    
    // Check expeditions for dead monsters (auto-recall)
    for (const exp of this.state.expeditions) {
      const members = this.expeditionMembers(exp);
      const zone = ZONE_BY_ID[exp.zoneId];
      if (members.length && zone) {
        const hpResults = calculateGroupExpeditionHpAtTime(members, zone, exp.startedAt, now, exp.duration);
        const deadCount = hpResults.filter(h => h.dead).length;
        if (deadCount > 0) {
          // Auto-recall expedition with dead monsters
          this.recallExpedition(exp.id);
          changed = true;
          continue; // Skip the rest for this expedition since it was removed
        }
      }

      if (!exp.notified && now >= exp.endsAt) {
        exp.notified = true;
        const members = this.expeditionMembers(exp);
        const label = members.length > 1
          ? `Escouade (${members.map(m => m.name).join(', ')})`
          : (members[0]?.name || 'Un spécimen');
        this.emitEvent('expedition-ready', { expedition: exp, monster: members[0], monsters: members });
        this.emitEvent('toast', {
          text: `${label} est rentré · butin à récolter`,
          kind: 'ready'
        });
        changed = true;
      }
    }
    for (const raid of this.state.raids) {
      if (!raid.notified && now >= raid.endsAt) {
        raid.notified = true;
        const monster = this.state.monsters.find(m => m.uid === raid.monsterId);
        this.emitEvent('raid-ready', { raid, monster });
        this.emitEvent('toast', {
          text: `${monster?.name || 'Un spécimen'} revient de razzia · résultat à résoudre`,
          kind: 'ready'
        });
        changed = true;
      }
    }
    if (this.tickMarket(now)) changed = true;
    if (changed) this.commit();
  }

  // ----- lecture -----
  totalPower() {
    return this.state.monsters.reduce((sum, m) => sum + monsterPower(m), 0);
  }

  nextXpFor(monster) {
    return nextLevelXp(monster.level || 1);
  }

  statsOf(monster) {
    return monsterStats(monster);
  }

  capacityOf(monster) {
    return capacityOf(monster);
  }

  zonePowerOf(monster, zone) {
    return zonePower(monsterStats(monster), zone);
  }

  questProgressOf(quest) {
    return questProgress(this.state, quest);
  }
}
