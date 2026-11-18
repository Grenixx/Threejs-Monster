import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createInitialState } from '../js/state.js';

const PORT = Number(process.env.CHIMERE_TEST_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const DB_FILE = path.resolve('data', 'test-db.json');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
fs.rmSync(DB_FILE, { force: true });

const server = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    CHIMERE_DB: DB_FILE,
    CHIMERE_RAID_MULT: '0.01',
    CHIMERE_RAID_MIN_MS: '100'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

const serverLog = [];
server.stdout.on('data', chunk => serverLog.push(chunk.toString()));
server.stderr.on('data', chunk => serverLog.push(chunk.toString()));

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return await res.json();
    } catch { /* pas encore prêt */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Serveur de test injoignable.\n${serverLog.join('')}`);
}

async function api(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-token'] = token;
  const res = await fetch(BASE + endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function freshSave(name) {
  const save = createInitialState(name);
  save.market.listings = [];
  return save;
}

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

let alpha;
let beta;

try {
  const health = await waitForServer();
  console.log('serveur de test :', health.name, '·', health.listings, 'annonces');

  alpha = await api('POST', '/api/login', { name: 'Alpha', seedSave: freshSave('Alpha') });
  beta = await api('POST', '/api/login', { name: 'Beta', seedSave: freshSave('Beta') });
  assert.equal(alpha.status, 200);
  assert.equal(beta.status, 200);

  const tokenA = alpha.data.token;
  const tokenB = beta.data.token;

  await test('login crée une sauvegarde et un jeton', () => {
    assert.ok(tokenA && tokenB);
    assert.equal(alpha.data.save.player.name, 'Alpha');
    assert.equal(alpha.data.listings.length, 6);
    assert.equal(alpha.data.save.monsters.length, 1);
  });

  await test('sauvegarde distante et conflit de révision', async () => {
    const save = alpha.data.save;
    save.resources.biomass += 10;
    const put = await api('PUT', '/api/save', { save, rev: alpha.data.rev }, tokenA);
    assert.equal(put.status, 200);
    const stale = await api('PUT', '/api/save', { save, rev: alpha.data.rev }, tokenA);
    assert.equal(stale.status, 409);
    assert.ok(stale.data.rev > alpha.data.rev);
  });

  await test('création d’annonce et retrait de l’inventaire', async () => {
    const saveNow = await api('GET', '/api/save', null, tokenA);
    const part = saveNow.data.save.inventory[0];
    assert.ok(part, 'inventaire non vide');
    const list = await api('POST', '/api/market/list', {
      rev: saveNow.data.rev,
      listing: { kind: 'part', uid: part.uid, price: 30 }
    }, tokenA);
    assert.equal(list.status, 200, JSON.stringify(list.data));
    assert.equal(list.data.save.inventory.some(p => p.uid === part.uid), false);
    alpha.listedPart = part;
    alpha.listingId = list.data.listing.id;
    alpha.rev = list.data.rev;
  });

  await test('achat par un autre joueur et crédit du vendeur', async () => {
    const market = await api('GET', '/api/market', null, tokenB);
    const listing = market.data.listings.find(l => l.id === alpha.listingId);
    assert.ok(listing, 'annonce visible');
    assert.equal(listing.mine, false);

    const before = await api('GET', '/api/save', null, tokenA);
    const buy = await api('POST', `/api/market/${alpha.listingId}/buy`, {}, tokenB);
    assert.equal(buy.status, 200, JSON.stringify(buy.data));
    assert.equal(buy.data.save.inventory.some(p => p.uid === alpha.listedPart.uid), true);

    const after = await api('GET', '/api/save', null, tokenA);
    const delta = after.data.save.resources.shards - before.data.save.resources.shards;
    assert.ok(delta > 0, 'le vendeur reçoit des éclats');
    assert.equal(after.data.save.records.sales >= 1, true);
  });

  await test('annulation d’annonce', async () => {
    const saveNow = await api('GET', '/api/save', null, tokenB);
    const part = saveNow.data.save.inventory[0];
    const list = await api('POST', '/api/market/list', {
      rev: saveNow.data.rev,
      listing: { kind: 'part', uid: part.uid, price: 999 }
    }, tokenB);
    assert.equal(list.status, 200, JSON.stringify(list.data));
    const cancel = await api('POST', `/api/market/${list.data.listing.id}/cancel`, {}, tokenB);
    assert.equal(cancel.status, 200, JSON.stringify(cancel.data));
    assert.equal(cancel.data.save.inventory.some(p => p.uid === part.uid), true);
  });

  await test('razzia : cibles, gardien, lancer et résoudre', async () => {
    const gamma = await api('POST', '/api/login', { name: 'Gamma', seedSave: freshSave('Gamma') });
    const delta = await api('POST', '/api/login', { name: 'Delta', seedSave: freshSave('Delta') });
    assert.equal(gamma.status, 200);
    assert.equal(delta.status, 200);
    const tokenG = gamma.data.token;
    const tokenD = delta.data.token;
    const deltaId = delta.data.save.player.id;

    const targets = await api('GET', '/api/raids/targets', null, tokenG);
    assert.equal(targets.status, 200);
    assert.ok(targets.data.targets.length >= 6, 'labs PNJ présents');
    const deltaTarget = targets.data.targets.find(t => t.id === `player:${deltaId}`);
    assert.ok(deltaTarget, 'le joueur Delta apparaît comme cible');
    assert.equal(Object.hasOwn(deltaTarget, 'biomass'), false, 'les ressources exactes sont masquées');

    const upgradedSave = structuredClone(delta.data.save);
    upgradedSave.defenses = { sentry: 1 };
    const savedUpgrade = await api('PUT', '/api/save', {
      save: upgradedSave,
      rev: delta.data.rev
    }, tokenD);
    assert.equal(savedUpgrade.status, 200, JSON.stringify(savedUpgrade.data));
    const targetsAfterUpgrade = await api('GET', '/api/raids/targets', null, tokenG);
    const upgradedTarget = targetsAfterUpgrade.data.targets.find(t => t.id === `player:${deltaId}`);
    assert.equal(upgradedTarget.defense, deltaTarget.defense + 18, 'la tourelle protège aussi en multijoueur');

    const guardian = await api('POST', '/api/guardian', {
      monsterUid: delta.data.save.monsters[0].uid
    }, tokenD);
    assert.equal(guardian.status, 200);
    assert.equal(guardian.data.save.guardianId, delta.data.save.monsters[0].uid);

    const targets2 = await api('GET', '/api/raids/targets', null, tokenG);
    const guarded = targets2.data.targets.find(t => t.id === `player:${deltaId}`);
    assert.ok(guarded.defense > deltaTarget.defense, 'le gardien augmente la défense');

    const start = await api('POST', '/api/raids/start', {
      monsterUid: gamma.data.save.monsters[0].uid,
      targetId: `player:${deltaId}`
    }, tokenG);
    assert.equal(start.status, 200, JSON.stringify(start.data));
    assert.ok(start.data.raid.endsAt > Date.now() - 1000);
    assert.equal(start.data.raids.length, 1);
    assert.equal(start.data.raid.target.name, 'Delta');
    assert.equal(start.data.raid.defense, guarded.defense, 'la défense améliorée est figée au départ');
    assert.ok(start.data.raid.attacker.attack > 0);

    await new Promise(r => setTimeout(r, 1900));
    const claim = await api('POST', `/api/raids/${start.data.raid.id}/claim`, {}, tokenG);
    assert.equal(claim.status, 200, JSON.stringify(claim.data));
    assert.ok(claim.data.result);
    assert.equal(claim.data.raids.length, 0);
    assert.equal(claim.data.save.records.raidsDone, 1);

    const gammaAfter = await api('GET', '/api/save', null, tokenG);
    assert.equal(gammaAfter.data.raids.length, 0);
    assert.ok(gammaAfter.data.save.records.raidsDone >= 1);
  });

  await test('un gardien ne peut pas partir en razzia', async () => {
    const saveNow = await api('GET', '/api/save', null, tokenA);
    const guardian = await api('POST', '/api/guardian', {
      monsterUid: saveNow.data.save.monsters[0].uid
    }, tokenA);
    assert.equal(guardian.status, 200);
    assert.equal(guardian.data.save.guardianId, saveNow.data.save.monsters[0].uid);

    const targets = await api('GET', '/api/raids/targets', null, tokenA);
    const target = targets.data.targets[0];
    const start = await api('POST', '/api/raids/start', {
      monsterUid: saveNow.data.save.monsters[0].uid,
      targetId: target.id
    }, tokenA);
    assert.equal(start.status, 409);
  });

  await test('réinitialisation serveur', async () => {
    const reset = await api('POST', '/api/reset', {}, tokenB);
    assert.equal(reset.status, 200);
    assert.equal(reset.data.save.monsters.length, 1);
    assert.equal(reset.data.save.inventory.length, 3);
  });

  console.log(`\n${passed} test(s) serveur passé(s).`);
} catch (err) {
  console.error(err);
  console.error('\n--- journaux serveur ---\n' + serverLog.join(''));
  process.exitCode = 1;
} finally {
  server.kill();
  await new Promise(r => setTimeout(r, 600));
  fs.rmSync(DB_FILE, { force: true });
}
