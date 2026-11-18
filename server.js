// =============================================================
// CHIMÈRE — serveur multijoueur (sans dépendance)
//   node server.js
//   http://localhost:8787
//
// Le serveur sert le jeu, garde les sauvegardes des chercheurs et
// anime un marché partagé (annonces PNJ + échanges réels).
// Prototype : l'identité est un jeton local, sans mot de passe.
// =============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { createInitialState, normalizeState } from './js/state.js';
import {
  SAVE_VERSION, BALANCE, PART_TYPE_KEYS, BODIES
} from './js/data.js';
import {
  generatePart, fairPrice, monsterValue, monsterStats, applyXp, uid
} from './js/economy.js';
import {
  npcLabs, attackerSnapshot, defenderSnapshot, resolveRaid, raidDuration, labDefense, defenseUpgradeBonus, raidLootHint
} from './js/raid.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.CHIMERE_DB
  ? path.resolve(process.env.CHIMERE_DB)
  : path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 8787);
const SERVER_NAME = 'CHIMÈRE · SALON PARTAGÉ';
const TAX = BALANCE.marketTax;
const RAID_MULT = Math.max(0.01, Number(process.env.CHIMERE_RAID_MULT || 1));
const RAID_MIN_MS = Math.max(100, Number(process.env.CHIMERE_RAID_MIN_MS || 15000));

const BOT_NAMES = ['Kael', 'Nyx-07', 'Mira', 'Sable', 'Orrin', 'Vex', 'Luth', 'Dregg', 'Iko', 'Sélène', 'Rook', 'Tisseur', 'Mante', 'Vesper'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// -------------------------------------------------------------
// BASE
// -------------------------------------------------------------
function loadDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (raw && raw.players && raw.listings) {
        raw.raidCounter ||= 1;
        for (const player of Object.values(raw.players)) {
          player.raids ||= [];
          player.save ||= freshSave(player.name);
          player.save.raids = [];
          player.save.guardianId ||= null;
        }
        return raw;
      }
    }
  } catch (err) {
    console.warn('[db] fichier illisible, sauvegarde de côté', err.message);
    try { fs.renameSync(DB_FILE, `${DB_FILE}.broken-${Date.now()}`); } catch { /* ignore */ }
  }
  return { players: {}, listings: [], counter: 1, raidCounter: 1, createdAt: Date.now() };
}

const db = loadDb();
let dirty = false;

function markDirty() {
  dirty = true;
}

function saveDb() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.warn('[db] écriture impossible', err.message);
  }
}

// -------------------------------------------------------------
// UTILITAIRES
// -------------------------------------------------------------
function now() { return Date.now(); }
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function sanitizeName(name, fallback = 'Chercheur') {
  const clean = String(name || '').replace(/[<>&"'`]/g, '').trim().slice(0, 20);
  return clean || `${fallback}-${randInt(100, 999)}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripMarket(save) {
  if (!save.market) save.market = { listings: [], counter: 1, lastBotAt: 0 };
  save.market.listings = [];
  return save;
}

function sanitizeSave(input, name) {
  if (!input || typeof input !== 'object') throw new Error('Sauvegarde invalide.');
  if (input.version !== SAVE_VERSION) throw new Error('Version de sauvegarde incompatible.');
  const save = normalizeState(deepClone(input));
  save.inventory = (save.inventory || []).filter(p => p && typeof p.uid === 'string').slice(0, 200);
  save.monsters = (save.monsters || []).filter(m => m && typeof m.uid === 'string').slice(0, 20);
  save.expeditions = (save.expeditions || []).filter(e => e && e.monsterId).slice(0, 20);
  save.raids = [];
  save.log = (save.log || []).slice(0, 40);
  save.player = save.player || {};
  if (!save.player.id) save.player.id = `player_${crypto.randomBytes(4).toString('hex')}`;
  if (name) save.player.name = sanitizeName(name, 'Chercheur');
  save.player.name = sanitizeName(save.player.name, 'Chercheur');
  if (save.guardianId && !save.monsters.some(m => m.uid === save.guardianId)) {
    save.guardianId = null;
  }
  for (const monster of save.monsters) monster.fatigueUntil ||= 0;
  stripMarket(save);
  return save;
}

function freshSave(name) {
  const save = createInitialState(sanitizeName(name, 'Chercheur'));
  stripMarket(save);
  return save;
}

function onlineCount() {
  return new Set([...clients].map(c => c.token)).size;
}

function publicListing(listing, token) {
  const { sellerToken, ...rest } = listing;
  return { ...rest, mine: sellerToken === token };
}

function listingsFor(token) {
  return db.listings.map(l => publicListing(l, token));
}

function sellerListingsCount(token) {
  return db.listings.filter(l => l.sellerToken === token).length;
}

// -------------------------------------------------------------
// RAIDS
// -------------------------------------------------------------
function logToSave(save, text, kind = 'info') {
  save.log ||= [];
  save.log.unshift({ t: now(), text, kind });
  save.log = save.log.slice(0, 40);
}

function findPlayerBySaveId(id) {
  for (const player of Object.values(db.players)) {
    if (player.save.player.id === id) return player;
  }
  return null;
}

function guardianOf(player) {
  const uidGuardian = player.save.guardianId;
  if (!uidGuardian) return null;
  return player.save.monsters.find(m => m.uid === uidGuardian) || null;
}

function defenseOf(player) {
  const bonus = defenseUpgradeBonus(player.save.defenses?.sentry);
  return labDefense(player.save.records.bestPower || 0, guardianOf(player), bonus);
}

function isMonsterBusy(player, monsterUid) {
  if ((player.save.expeditions || []).some(e =>
    (e.monsterIds || [e.monsterId]).includes(monsterUid)
  )) return true;
  if ((player.raids || []).some(r => r.monsterId === monsterUid)) return true;
  return false;
}

function publicRaid(raid) {
  const { seed, ...rest } = raid;
  return {
    ...rest,
    target: {
      id: raid.targetId,
      name: raid.targetName,
      kind: raid.targetKind,
      level: raid.targetLevel || 1,
      defense: raid.defense,
      guardianName: raid.guardianName,
      hue: 0.45
    }
  };
}

function playerTarget(player) {
  const save = player.save;
  const bestLevel = save.monsters.reduce((max, m) => Math.max(max, m.level || 1), 1);
  const guardian = guardianOf(player);
  const defense = defenseOf(player);
  const lootHint = {
    biomass: Math.max(10, Math.round((save.resources.biomass || 0) * 0.1)),
    shards: Math.max(1, Math.round((save.resources.shards || 0) * 0.1))
  };
  return {
    id: `player:${save.player.id}`,
    kind: 'player',
    name: save.player.name,
    level: bestLevel,
    defense,
    biomass: save.resources.biomass || 0,
    shards: save.resources.shards || 0,
    lootHint,
    guardianName: guardian?.name || null,
    recommendedPower: Math.round(defense * 1.05),
    hue: 0.5,
    desc: `Laboratoire de ${save.player.name} · ${save.monsters.length} spécimen(s).`
  };
}

function raidTargetsFor(player) {
  const npcTargets = npcLabs();
  const playerTargets = [];
  for (const other of Object.values(db.players)) {
    if (other.token === player.token) continue;
    if (!other.save?.player?.id) continue;
    if ((other.save.resources?.biomass || 0) + (other.save.resources?.shards || 0) < 250) continue;
    playerTargets.push(playerTarget(other));
  }
  playerTargets.sort((a, b) => a.defense - b.defense);
  return [...npcTargets, ...playerTargets.slice(0, 5)]
    .sort((a, b) => a.defense - b.defense);
}

function resolveTargetFor(player, targetId) {
  if (targetId.startsWith('npc:')) {
    const target = npcLabs().find(t => t.id === targetId);
    return target ? { target, player: null } : null;
  }
  if (targetId.startsWith('player:')) {
    const id = targetId.slice('player:'.length);
    const other = findPlayerBySaveId(id);
    if (!other || other.token === player.token) return null;
    return { target: playerTarget(other), player: other };
  }
  return null;
}

// -------------------------------------------------------------
// SSE
// -------------------------------------------------------------
const clients = new Set();

function sseWrite(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(client);
  }
}

function broadcast(event, data) {
  for (const client of clients) sseWrite(client, event, data);
}

function broadcastPresence() {
  broadcast('presence', { count: onlineCount() });
}

function sendToToken(token, event, data) {
  for (const client of clients) {
    if (client.token === token) sseWrite(client, event, data);
  }
}

// -------------------------------------------------------------
// MARCHÉ
// -------------------------------------------------------------
function makeNpcListing() {
  const roll = Math.random();
  const rarity = roll < 0.56 ? 'common' : roll < 0.88 ? 'rare' : roll < 0.975 ? 'epic' : 'mythic';
  const part = generatePart(pick(PART_TYPE_KEYS), rarity, Math.floor(Math.random() * 2 ** 31), 'marche');
  const fair = fairPrice(part);
  return {
    id: `l_${db.counter++}`,
    kind: 'part',
    item: part,
    price: Math.max(15, Math.round(fair * rand(0.9, 1.35))),
    seller: pick(BOT_NAMES),
    sellerId: 'npc',
    sellerToken: 'npc',
    npc: true,
    createdAt: now(),
    expiresAt: now() + BALANCE.marketDuration,
    sellAt: null
  };
}

function ensureNpcListings() {
  let changed = false;
  while (db.listings.filter(l => l.sellerToken === 'npc').length < 6) {
    db.listings.push(makeNpcListing());
    changed = true;
  }
  return changed;
}

function creditSeller(listing, seller) {
  const net = Math.max(1, Math.round(listing.price * (1 - TAX)));
  seller.save.resources.shards += net;
  seller.save.records.sales = (seller.save.records.sales || 0) + 1;
  seller.save.records.shardsEarned = (seller.save.records.shardsEarned || 0) + net;
  seller.save.log.unshift({
    t: now(),
    text: `Vendu : ${listing.item.name} (+${net} éclats).`,
    kind: 'sale'
  });
  seller.save.log = seller.save.log.slice(0, 40);
  seller.rev += 1;
  seller.lastSeen = now();
  sendToToken(seller.token, 'sale', {
    net,
    name: listing.item.name,
    price: listing.price
  });
  markDirty();
  return net;
}

function listingFair(listing) {
  return listing.kind === 'monster' ? monsterValue(listing.item) : fairPrice(listing.item);
}

function returnItemToSeller(listing, seller) {
  if (listing.kind === 'part') {
    if (seller.save.inventory.length >= BALANCE.inventoryMax) return false;
    seller.save.inventory.push(listing.item);
    seller.save.log.unshift({ t: now(), text: `Annonce expirée : ${listing.item.name} récupéré.`, kind: 'warn' });
  } else {
    if (seller.save.monsters.length >= BALANCE.labSlots) return false;
    seller.save.monsters.push(listing.item);
    if (!seller.save.selectedMonsterId) seller.save.selectedMonsterId = listing.item.uid;
    seller.save.log.unshift({ t: now(), text: `Annonce expirée : ${listing.item.name} récupéré.`, kind: 'warn' });
  }
  seller.save.log = seller.save.log.slice(0, 40);
  seller.rev += 1;
  markDirty();
  return true;
}

function tickMarket() {
  let changed = false;
  const time = now();

  for (let i = db.listings.length - 1; i >= 0; i--) {
    const listing = db.listings[i];

    if (time >= listing.expiresAt) {
      if (listing.sellerToken === 'npc') {
        db.listings.splice(i, 1);
        changed = true;
        continue;
      }
      const seller = db.players[listing.sellerToken];
      if (!seller) {
        db.listings.splice(i, 1);
        changed = true;
        continue;
      }
      if (returnItemToSeller(listing, seller)) {
        db.listings.splice(i, 1);
      } else {
        listing.expiresAt = time + 10 * 60 * 1000;
      }
      changed = true;
      continue;
    }

    if (listing.sellerToken !== 'npc' && listing.sellAt && time >= listing.sellAt) {
      const seller = db.players[listing.sellerToken];
      if (!seller) {
        db.listings.splice(i, 1);
        changed = true;
        continue;
      }
      const fair = listingFair(listing);
      if (listing.price <= fair * 1.3 && Math.random() < 0.8) {
        creditSeller(listing, seller);
        db.listings.splice(i, 1);
        changed = true;
      } else {
        listing.attempts = (listing.attempts || 0) + 1;
        listing.sellAt = listing.attempts < 3 ? time + 30000 : null;
        changed = true;
      }
    }
  }

  if (ensureNpcListings()) changed = true;

  if (changed) {
    broadcast('market', { at: time });
    saveDb();
  }
}

// -------------------------------------------------------------
// HTTP
// -------------------------------------------------------------
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('Corps de requête trop volumineux.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

function auth(req, url) {
  const token = req.headers['x-token'] || url.searchParams.get('token');
  if (typeof token !== 'string' || token.length < 8 || token.length > 200) return null;
  return db.players[token] || null;
}

function getPlayerSave(player) {
  player.save.raids = [];
  stripMarket(player.save);
  return player.save;
}

function createPlayer(token, name, seedSave) {
  let save;
  if (seedSave) {
    try {
      save = sanitizeSave(seedSave, name);
    } catch (err) {
      console.warn('[login] sauvegarde locale refusée :', err.message);
      save = freshSave(name);
    }
  } else {
    save = freshSave(name);
  }
  const player = {
    token,
    name: save.player.name,
    save,
    raids: [],
    rev: 1,
    createdAt: now(),
    lastSeen: now()
  };
  db.players[token] = player;
  markDirty();
  return player;
}

function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400); res.end('Bad request'); return;
  }
  if (rel === '/') rel = '/index.html';
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  const parts = path.relative(ROOT, filePath).split(path.sep);
  const blocked = ['data', 'tools', 'tests', 'node_modules', '.git', 'js/data.js'];
  if (parts[0].startsWith('.') || blocked.includes(parts[0]) || parts[0] === 'server.js' || parts[0] === 'package.json' || parts[0] === 'README.md') {
    res.writeHead(404); res.end('Not found'); return;
  }
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404); res.end('Not found'); return;
  }
  if (!stat.isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const mime = MIME[path.extname(filePath).toLowerCase()];
  if (!mime) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache'
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      name: SERVER_NAME,
      players: Object.keys(db.players).length,
      listings: db.listings.length,
      online: onlineCount()
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(req);
    let token = typeof body.token === 'string' && body.token.length >= 8 ? body.token : null;
    let player = token ? db.players[token] : null;

    if (!player) {
      token = token || newToken();
      player = createPlayer(token, body.name, body.seedSave);
      console.log(`[login] nouveau chercheur ${player.save.player.name}`);
    } else {
      if (body.name) {
        player.save.player.name = sanitizeName(body.name, 'Chercheur');
        player.name = player.save.player.name;
      }
      player.lastSeen = now();
      markDirty();
    }

    sendJson(res, 200, {
      token: player.token,
      name: player.save.player.name,
      save: getPlayerSave(player),
      rev: player.rev,
      listings: listingsFor(player.token),
      raids: player.raids.map(publicRaid),
      online: onlineCount(),
      serverName: SERVER_NAME
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/events') {
    const player = auth(req, url);
    if (!player) {
      res.writeHead(401); res.end('Unauthorized');
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    const client = { res, token: player.token };
    clients.add(client);
    sseWrite(client, 'presence', { count: onlineCount() });
    sseWrite(client, 'market', { at: now() });
    broadcastPresence();
    req.on('close', () => {
      clients.delete(client);
      broadcastPresence();
    });
    return true;
  }

  const player = auth(req, url);
  if (!player) {
    sendJson(res, 401, { reason: 'Jeton invalide.' });
    return true;
  }
  player.lastSeen = now();

  if (req.method === 'GET' && pathname === '/api/save') {
    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      raids: player.raids.map(publicRaid)
    });
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/save') {
    const body = await readBody(req);
    if (Number(body.rev) !== player.rev) {
      sendJson(res, 409, {
        reason: 'Sauvegarde désynchronisée.',
        save: getPlayerSave(player),
        rev: player.rev
      });
      return true;
    }
    let save;
    try {
      save = sanitizeSave(body.save, player.name);
    } catch (err) {
      sendJson(res, 400, { reason: err.message });
      return true;
    }
    player.save = save;
    player.name = save.player.name;
    player.rev += 1;
    markDirty();
    sendJson(res, 200, { rev: player.rev });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/market') {
    sendJson(res, 200, {
      listings: listingsFor(player.token),
      online: onlineCount(),
      rev: player.rev
    });
    return true;
  }

  // ----- raids -----
  if (req.method === 'GET' && pathname === '/api/raids') {
    sendJson(res, 200, {
      raids: player.raids.map(publicRaid),
      online: onlineCount()
    });
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/raids/targets') {
    const targets = raidTargetsFor(player).map(target => {
      const { biomass, shards, ...rest } = target;
      return { ...rest, lootHint: target.lootHint || raidLootHint(target) };
    });
    sendJson(res, 200, { targets, online: onlineCount() });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/raids/start') {
    const body = await readBody(req);
    const monsterUid = String(body.monsterUid || '');
    const targetId = String(body.targetId || '');
    const monster = player.save.monsters.find(m => m.uid === monsterUid);
    if (!monster) {
      sendJson(res, 404, { reason: 'Spécimen introuvable.' });
      return true;
    }
    if (player.save.guardianId === monsterUid) {
      sendJson(res, 409, { reason: 'Un gardien ne quitte pas le laboratoire.' });
      return true;
    }
    if (isMonsterBusy(player, monsterUid)) {
      sendJson(res, 409, { reason: 'Ce spécimen est déjà en mission.' });
      return true;
    }
    if ((monster.fatigueUntil || 0) > now()) {
      sendJson(res, 409, { reason: 'Ce spécimen est encore fatigué.' });
      return true;
    }

    const resolved = resolveTargetFor(player, targetId);
    if (!resolved) {
      sendJson(res, 404, { reason: 'Cible introuvable.' });
      return true;
    }
    const { target, player: defender } = resolved;
    const defense = defender ? defenseOf(defender) : target.defense;
    const resources = defender
      ? { biomass: defender.save.resources.biomass || 0, shards: defender.save.resources.shards || 0 }
      : { biomass: target.biomass || 0, shards: target.shards || 0 };

    const raid = {
      id: `raid_${db.raidCounter++}`,
      monsterId: monsterUid,
      targetId,
      targetName: target.name,
      targetKind: target.kind,
      targetLevel: target.level || 1,
      guardianName: defender ? (guardianOf(defender)?.name || null) : (target.guardianName || null),
      defense,
      targetResources: resources,
      attacker: attackerSnapshot(monster),
      startedAt: now(),
      endsAt: now() + Math.max(RAID_MIN_MS, Math.round(raidDuration(monster) * 1000 * RAID_MULT)),
      seed: Math.floor(Math.random() * 2 ** 31)
    };
    player.raids.push(raid);
    markDirty();
    sendJson(res, 200, {
      raid: publicRaid(raid),
      raids: player.raids.map(publicRaid)
    });
    return true;
  }

  const raidClaimMatch = pathname.match(/^\/api\/raids\/([^/]+)\/claim$/);
  if (req.method === 'POST' && raidClaimMatch) {
    const raid = player.raids.find(r => r.id === raidClaimMatch[1]);
    if (!raid) {
      sendJson(res, 404, { reason: 'Razzia introuvable.' });
      return true;
    }
    if (now() < raid.endsAt) {
      sendJson(res, 409, { reason: 'La razzia est encore en route.' });
      return true;
    }
    const monster = player.save.monsters.find(m => m.uid === raid.monsterId);
    if (!monster) {
      player.raids = player.raids.filter(r => r.id !== raid.id);
      markDirty();
      sendJson(res, 410, { reason: 'Spécimen perdu en mission.' });
      return true;
    }

    const defender = raid.targetId.startsWith('player:')
      ? findPlayerBySaveId(raid.targetId.slice('player:'.length))
      : null;
    const current = defender
      ? { biomass: defender.save.resources.biomass || 0, shards: defender.save.resources.shards || 0 }
      : raid.targetResources;

    const result = resolveRaid({
      attacker: raid.attacker,
      defender: {
        name: raid.targetName,
        kind: raid.targetKind,
        defense: raid.defense,
        biomass: current.biomass,
        shards: current.shards,
        guardianName: raid.guardianName
      },
      seed: raid.seed
    });

    let lootBiomass = result.lootBiomass;
    let lootShards = result.lootShards;
    if (defender) {
      lootBiomass = Math.min(lootBiomass, defender.save.resources.biomass || 0);
      lootShards = Math.min(lootShards, defender.save.resources.shards || 0);
      defender.save.resources.biomass -= lootBiomass;
      defender.save.resources.shards -= lootShards;
    }
    result.lootBiomass = lootBiomass;
    result.lootShards = lootShards;
    result.targetName = raid.targetName;
    result.guardianName = raid.guardianName;

    player.save.resources.biomass += lootBiomass;
    player.save.resources.shards += lootShards;
    player.save.records.raidsDone = (player.save.records.raidsDone || 0) + 1;
    if (result.win) player.save.records.raidsWon = (player.save.records.raidsWon || 0) + 1;
    player.save.records.biomassEarned = (player.save.records.biomassEarned || 0) + lootBiomass;
    player.save.records.shardsEarned = (player.save.records.shardsEarned || 0) + lootShards;

    applyXp(monster, result.xp || 0);
    if (result.fatigue > 0) {
      monster.fatigueUntil = Math.max(monster.fatigueUntil || 0, now() + result.fatigue * 1000);
    }

    logToSave(
      player.save,
      result.win
        ? `Razzia réussie sur ${raid.targetName} : +${lootBiomass} biomasse, +${lootShards} éclats.`
        : `Razzia repoussée par ${raid.targetName}. Fatigue ${Math.round((result.fatigue || 0) / 60)} min.`,
      'raid'
    );

    player.raids = player.raids.filter(r => r.id !== raid.id);
    player.rev += 1;
    player.lastSeen = now();

    if (defender) {
      logToSave(
        defender.save,
        `Razzia de ${player.save.player.name} : -${lootBiomass} biomasse, -${lootShards} éclats.`,
        'raid'
      );
      defender.rev += 1;
      markDirty();
      sendToToken(defender.token, 'raid-incoming', {
        result: {
          win: result.win,
          lootBiomass,
          lootShards,
          targetName: raid.targetName
        },
        attackerName: player.save.player.name,
        targetName: raid.targetName
      });
    }

    markDirty();
    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      raids: player.raids.map(publicRaid),
      result,
      monster: { uid: monster.uid, name: monster.name, level: monster.level }
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/guardian') {
    const body = await readBody(req);
    const monsterUid = body.monsterUid ? String(body.monsterUid) : null;

    if (!monsterUid) {
      player.save.guardianId = null;
      player.rev += 1;
      markDirty();
      sendJson(res, 200, { save: getPlayerSave(player), rev: player.rev });
      return true;
    }
    const monster = player.save.monsters.find(m => m.uid === monsterUid);
    if (!monster) {
      sendJson(res, 404, { reason: 'Spécimen introuvable.' });
      return true;
    }
    if (isMonsterBusy(player, monsterUid)) {
      sendJson(res, 409, { reason: 'Ce spécimen est en mission.' });
      return true;
    }
    player.save.guardianId = monsterUid;
    player.rev += 1;
    markDirty();
    sendJson(res, 200, { save: getPlayerSave(player), rev: player.rev });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/market/list') {
    const body = await readBody(req);
    if (Number(body.rev) !== player.rev) {
      sendJson(res, 409, {
        reason: 'Sauvegarde désynchronisée.',
        save: getPlayerSave(player),
        rev: player.rev
      });
      return true;
    }
    if (sellerListingsCount(player.token) >= BALANCE.marketSlots) {
      sendJson(res, 409, { reason: 'Trop d’annonces actives.' });
      return true;
    }

    const kind = body.listing?.kind;
    const itemUid = String(body.listing?.uid || '');
    const price = Math.round(Number(body.listing?.price));
    if (kind !== 'part' && kind !== 'monster') {
      sendJson(res, 400, { reason: 'Type d’annonce invalide.' });
      return true;
    }
    if (!Number.isFinite(price) || price < 1 || price > 9_999_999) {
      sendJson(res, 400, { reason: 'Prix invalide.' });
      return true;
    }

    let item;
    if (kind === 'part') {
      const index = player.save.inventory.findIndex(p => p.uid === itemUid);
      if (index === -1) {
        sendJson(res, 404, { reason: 'Partie introuvable dans l’inventaire.' });
        return true;
      }
      item = player.save.inventory[index];
      player.save.inventory.splice(index, 1);
    } else {
      if (player.save.monsters.length <= 1) {
        sendJson(res, 409, { reason: 'Garde au moins un spécimen.' });
        return true;
      }
      const index = player.save.monsters.findIndex(m => m.uid === itemUid);
      if (index === -1) {
        sendJson(res, 404, { reason: 'Monstre introuvable.' });
        return true;
      }
      if (isMonsterBusy(player, itemUid)) {
        sendJson(res, 409, { reason: 'Ce monstre est en mission.' });
        return true;
      }
      if (player.save.guardianId === itemUid) {
        sendJson(res, 409, { reason: 'Le gardien ne peut pas être vendu.' });
        return true;
      }
      item = player.save.monsters[index];
      player.save.monsters.splice(index, 1);
      if (player.save.selectedMonsterId === itemUid) {
        player.save.selectedMonsterId = player.save.monsters[0]?.uid || null;
      }
    }

    const fair = kind === 'monster' ? monsterValue(item) : fairPrice(item);
    const listing = {
      id: `l_${db.counter++}`,
      kind,
      item,
      price,
      seller: player.save.player.name,
      sellerId: player.save.player.id,
      sellerToken: player.token,
      npc: false,
      createdAt: now(),
      expiresAt: now() + BALANCE.marketDuration,
      sellAt: price <= fair * 1.3 ? now() + rand(45000, 120000) : null
    };
    db.listings.unshift(listing);
    player.save.log.unshift({
      t: now(),
      text: `Annonce publiée : ${item.name} · ${price} éclats.`,
      kind: 'sale'
    });
    player.save.log = player.save.log.slice(0, 40);
    player.rev += 1;
    markDirty();
    broadcast('market', { at: now() });

    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      listing: publicListing(listing, player.token)
    });
    return true;
  }

  const buyMatch = pathname.match(/^\/api\/market\/([^/]+)\/buy$/);
  if (req.method === 'POST' && buyMatch) {
    const listing = db.listings.find(l => l.id === buyMatch[1]);
    if (!listing) {
      sendJson(res, 404, { reason: 'Annonce introuvable.' });
      return true;
    }
    if (listing.sellerToken === player.token) {
      sendJson(res, 409, { reason: 'C’est déjà ton annonce.' });
      return true;
    }
    if (now() >= listing.expiresAt) {
      sendJson(res, 410, { reason: 'Annonce expirée.' });
      return true;
    }
    if (player.save.resources.shards < listing.price) {
      sendJson(res, 409, { reason: 'Pas assez d’éclats.' });
      return true;
    }
    if (listing.kind === 'part' && player.save.inventory.length >= BALANCE.inventoryMax) {
      sendJson(res, 409, { reason: 'Inventaire plein.' });
      return true;
    }
    if (listing.kind === 'monster' && player.save.monsters.length >= BALANCE.labSlots) {
      sendJson(res, 409, { reason: 'Laboratoire plein.' });
      return true;
    }

    player.save.resources.shards -= listing.price;
    if (listing.kind === 'part') {
      player.save.inventory.push(listing.item);
    } else {
      player.save.monsters.push(listing.item);
      player.save.selectedMonsterId = listing.item.uid;
    }
    player.save.log.unshift({
      t: now(),
      text: `Acheté : ${listing.item.name} (${listing.price} éclats).`,
      kind: 'sale'
    });
    player.save.log = player.save.log.slice(0, 40);
    player.rev += 1;

    const index = db.listings.indexOf(listing);
    if (index !== -1) db.listings.splice(index, 1);

    if (listing.sellerToken !== 'npc') {
      const seller = db.players[listing.sellerToken];
      if (seller) creditSeller(listing, seller);
    }

    markDirty();
    broadcast('market', { at: now() });
    broadcastPresence();

    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      listing: publicListing(listing, player.token)
    });
    return true;
  }

  const cancelMatch = pathname.match(/^\/api\/market\/([^/]+)\/cancel$/);
  if (req.method === 'POST' && cancelMatch) {
    const index = db.listings.findIndex(l => l.id === cancelMatch[1]);
    if (index === -1) {
      sendJson(res, 404, { reason: 'Annonce introuvable.' });
      return true;
    }
    const listing = db.listings[index];
    if (listing.sellerToken !== player.token) {
      sendJson(res, 403, { reason: 'Cette annonce n’est pas la tienne.' });
      return true;
    }
    if (!returnItemToSeller(listing, player)) {
      sendJson(res, 409, { reason: 'Inventaire ou laboratoire plein.' });
      return true;
    }
    db.listings.splice(index, 1);
    markDirty();
    broadcast('market', { at: now() });
    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      listing: publicListing(listing, player.token)
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/reset') {
    for (let i = db.listings.length - 1; i >= 0; i--) {
      if (db.listings[i].sellerToken === player.token) db.listings.splice(i, 1);
    }
    player.save = freshSave(player.save.player.name);
    player.raids = [];
    player.name = player.save.player.name;
    player.rev += 1;
    markDirty();
    broadcast('market', { at: now() });
    sendJson(res, 200, {
      save: getPlayerSave(player),
      rev: player.rev,
      listings: listingsFor(player.token),
      raids: [],
      online: onlineCount()
    });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      const handled = await handleApi(req, res, url);
      if (!handled) sendJson(res, 404, { reason: 'Route API inconnue.' });
    } catch (err) {
      console.warn('[api]', err.message);
      if (!res.headersSent) sendJson(res, 500, { reason: 'Erreur serveur.' });
      else res.end();
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); res.end('Method not allowed'); return;
  }
  serveStatic(req, res, url.pathname);
});

// -------------------------------------------------------------
// BOUCLES
// -------------------------------------------------------------
ensureNpcListings();
markDirty();

setInterval(() => {
  tickMarket();
}, 15000);

setInterval(() => {
  saveDb();
}, 2000);

setInterval(() => {
  for (const client of clients) {
    try { client.res.write(': ping\n\n'); } catch { clients.delete(client); }
  }
}, 25000);

function shutdown() {
  console.log('\n[chimère] sauvegarde et arrêt…');
  saveDb();
  try { server.close(); } catch { /* ignore */ }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  const lan = [];
  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      if (info.family === 'IPv4' && !info.internal) lan.push(info.address);
    }
  }
  console.log(`\n  CHIMÈRE — salon partagé`);
  console.log(`  local   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  réseau  http://${ip}:${PORT}`);
  console.log(`  joueurs ${Object.keys(db.players).length} · annonces ${db.listings.length}\n`);
});
