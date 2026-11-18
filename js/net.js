// =============================================================
// CHIMÈRE — client réseau (marché partagé + sauvegarde serveur)
// Fonctionne en repli total hors ligne si le serveur est absent.
// =============================================================

import { normalizeState } from './state.js';
import { BALANCE } from './data.js';
import { formatNumber } from './economy.js';

const TOKEN_KEY = 'chimere.net.token';

export class Net {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.token = localStorage.getItem(TOKEN_KEY) || null;
    this.online = false;
    this.available = false;
    this.connecting = false;
    this.onlineCount = 0;
    this.serverName = 'CHIMÈRE';
    this.rev = 0;
    this.es = null;
    this._saveTimer = null;
    this._savePromise = null;
    this._lastErrorToast = 0;
    this.unsubscribeGameEvents = game.onEvent(event => {
      if (event.type === 'remotesave') this.scheduleSave();
    });
    ui.net = this;
  }

  async init() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) return false;
      const health = await res.json();
      this.available = true;
      this.serverName = health.name || this.serverName;
      this.onlineCount = health.online || 0;
      await this.connect();
      return this.online;
    } catch {
      this.available = false;
      return false;
    }
  }

  async api(method, endpoint, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['x-token'] = this.token;
    const res = await fetch(endpoint, {
      method,
      headers,
      cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok) {
      const error = new Error(data.reason || `Le serveur renvoie ${res.status}.`);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  // -----------------------------------------------------------
  // CONNEXION
  // -----------------------------------------------------------
  async connect() {
    if (this.connecting) return;
    if (this.online) return;
    this.connecting = true;

    try {
      const health = await fetch('/api/health', { cache: 'no-store' });
      if (!health.ok) throw new Error('Serveur multijoueur indisponible.');
      const healthData = await health.json();
      this.available = true;
      this.serverName = healthData.name || this.serverName;

      const data = await this.api('POST', '/api/login', {
        token: this.token,
        name: this.game.state.player.name,
        seedSave: this.game.state
      });

      this.token = data.token;
      localStorage.setItem(TOKEN_KEY, this.token);
      this.rev = data.rev;
      this.serverName = data.serverName || this.serverName;
      this.onlineCount = data.online || 0;

      this.game.mode = 'online';
      this.game.state = normalizeState(data.save);
      this.game.ensureSelection();
      this.game.state.market ||= { listings: [], counter: 1, lastBotAt: 0 };
      this.game.state.market.listings = data.listings || [];
      this.game.state.market.serverMirror = true;
      this.game.state.raids = data.raids || [];
      this.game.saveNow();

      this.online = true;
      this.connectEvents();
      this.ui.renderAll();
      this.ui.toast('Connecté au salon partagé', 'success');
      this.ui.setOnlineStatus?.(true, { count: this.onlineCount, serverName: this.serverName });
    } finally {
      this.connecting = false;
    }
  }

  connectEvents() {
    if (this.es) this.es.close();
    this.es = new EventSource(`/api/events?token=${encodeURIComponent(this.token)}`);

    this.es.addEventListener('presence', event => {
      try {
        const data = JSON.parse(event.data);
        this.onlineCount = data.count || 0;
        this.ui.renderSync();
      } catch { /* ignore */ }
    });

    this.es.addEventListener('market', () => {
      this.refreshMarket().catch(() => {});
    });

    this.es.addEventListener('sale', event => {
      let data = {};
      try { data = JSON.parse(event.data); } catch { /* ignore */ }
      if (data.net) this.ui.toast(`Vendu ! +${formatNumber(data.net)} éclats`, 'success');
      this.pullSave().catch(() => {});
    });

    this.es.addEventListener('raid-incoming', event => {
      let data = {};
      try { data = JSON.parse(event.data); } catch { /* ignore */ }
      if (data.result?.win) {
        this.ui.toast(`Razzia de ${data.attackerName} · -${formatNumber(data.result.lootBiomass)} biomasse`, 'warn');
      } else {
        this.ui.toast(`Razzia de ${data.attackerName} repoussée`, 'success');
      }
      this.pullSave().catch(() => {});
    });

    this.es.onerror = () => {
      // EventSource se reconnecte tout seul ; on garde le jeu jouable.
    };
  }

  // -----------------------------------------------------------
  // MARCHÉ
  // -----------------------------------------------------------
  async refreshMarket() {
    if (!this.online) return;
    try {
      const data = await this.api('GET', '/api/market');
      this.onlineCount = data.online || 0;
      this.game.state.market.listings = data.listings || [];
      this.game.state.market.serverMirror = true;
      this.ui.renderSync();
      if (this.ui.tab === 'marche') this.ui.renderPanel();
    } catch {
      // silencieux : le prochain tick SSE réessaiera
    }
  }

  async pullSave() {
    if (!this.online) return;
    const [saveData, marketData] = await Promise.all([
      this.api('GET', '/api/save'),
      this.api('GET', '/api/market').catch(() => null)
    ]);
    this.applyServerSave(saveData.save, saveData.rev, marketData?.listings, saveData.raids);
    this.ui.toast('Sauvegarde synchronisée', 'info');
  }

  applyServerSave(save, rev, listings = null, raids = null) {
    const currentListings = this.game.state.market?.listings || [];
    const currentRaids = this.game.state.raids || [];
    this.rev = rev;
    this.game.mode = 'online';
    this.game.state = normalizeState(save);
    this.game.state.market ||= { listings: [], counter: 1, lastBotAt: 0 };
    this.game.state.market.listings = listings ?? currentListings;
    this.game.state.market.serverMirror = true;
    this.game.state.raids = raids ?? currentRaids;
    this.game.ensureSelection();
    this.game.saveNow();
    this.ui.renderAll();
  }

  // -----------------------------------------------------------
  // SAUVEGARDE
  // -----------------------------------------------------------
  scheduleSave() {
    if (!this.online) return;
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.flushSave().catch(() => {});
    }, 400);
  }

  flushSave() {
    if (!this.online) return Promise.resolve();
    if (this._savePromise) return this._savePromise;
    this._savePromise = this._doFlush().finally(() => {
      this._savePromise = null;
    });
    return this._savePromise;
  }

  async _doFlush() {
    try {
      const data = await this.api('PUT', '/api/save', {
        save: this.game.state,
        rev: this.rev
      });
      this.rev = data.rev;
    } catch (error) {
      if (error.status === 409 && error.data?.save) {
        const listings = this.game.state.market?.listings || [];
        this.applyServerSave(error.data.save, error.data.rev, listings);
        this.ui.toast('Synchronisé avec le serveur', 'info');
      } else {
        const now = Date.now();
        if (now - this._lastErrorToast > 8000) {
          this._lastErrorToast = now;
          this.ui.toast('Synchronisation impossible pour le moment.', 'warn');
        }
      }
    }
  }

  // -----------------------------------------------------------
  // ACTIONS MARCHÉ
  // -----------------------------------------------------------
  // -----------------------------------------------------------
  // RAIDS
  // -----------------------------------------------------------
  async getRaidTargets() {
    return this.api('GET', '/api/raids/targets');
  }

  async startRaid(monsterUid, targetId) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', '/api/raids/start', { monsterUid, targetId });
      this.game.state.raids = data.raids || [];
      this.game.saveNow();
      this.ui.renderAll();
      return { ok: true, raid: data.raid };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async claimRaid(raidId) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', `/api/raids/${encodeURIComponent(raidId)}/claim`, {});
      this.applyServerSave(data.save, data.rev, null, data.raids);
      return { ok: true, result: data.result, monster: data.monster, raid: null };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async setGuardian(monsterUid) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', '/api/guardian', { monsterUid: monsterUid || null });
      this.applyServerSave(data.save, data.rev);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async sell(kind, uid, price) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', '/api/market/list', {
        rev: this.rev,
        listing: { kind, uid, price }
      });
      this.applyServerSave(data.save, data.rev);
      await this.refreshMarket();
      return { ok: true, listing: data.listing };
    } catch (error) {
      if (error.status === 409 && error.data?.save) {
        this.applyServerSave(error.data.save, error.data.rev);
      }
      return { ok: false, reason: error.message };
    }
  }

  async buyListing(id) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', `/api/market/${encodeURIComponent(id)}/buy`, {});
      this.applyServerSave(data.save, data.rev);
      await this.refreshMarket();
      this.ui.toast(`Acheté : ${data.listing.item.name}`, 'success');
      return { ok: true, listing: data.listing };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async cancelListing(id) {
    if (!this.online) return { ok: false, reason: 'Serveur hors ligne.' };
    await this.flushSave();
    try {
      const data = await this.api('POST', `/api/market/${encodeURIComponent(id)}/cancel`, {});
      this.applyServerSave(data.save, data.rev);
      await this.refreshMarket();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async resetServer() {
    if (!this.online) {
      this.game.reset();
      return { ok: true };
    }
    try {
      const data = await this.api('POST', '/api/reset', {});
      this.onlineCount = data.online || this.onlineCount;
      this.applyServerSave(data.save, data.rev, data.listings, data.raids || []);
      await this.refreshMarket();
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  disconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.online = false;
    this.game.mode = 'offline';
    this.ui.renderAll();
  }

  get maxInventory() {
    return BALANCE.inventoryMax;
  }
}
