// =============================================================
// CHIMÈRE — Interface
// =============================================================

import {
  STATS, STAT_KEYS, PART_TYPES, PART_TYPE_KEYS, RARITIES, RARITY_KEYS,
  BODIES, BODY_KEYS, ZONES, ZONE_BY_ID, QUESTS, BALANCE, ROLES, ROLE_KEYS, LAB_DEFENSES
} from './data.js';
import {
  monsterStats, monsterPower, capacityOf, validSocketsFor, nextLevelXp,
  formatNumber, formatDuration, formatClock, fairPrice, priceRange,
  monsterValue, expeditionRates, groupExpeditionRates, zonePower, partTotalStats, durationFor,
  expeditionJournal
} from './economy.js';
import { icon, hydrateIcons } from './icons.js';
import { raidLootHint, raidTargetLabel, attackScore, cargoCapacity, RAID, defenseUpgradeBonus } from './raid.js';

const TABS = [
  { id: 'labo', label: 'Labo', icon: 'flask' },
  { id: 'assemblage', label: 'Assemblage', icon: 'dna' },
  { id: 'expeditions', label: 'Expéditions', icon: 'compass' },
  { id: 'marche', label: 'Marché', icon: 'market' },
  { id: 'objectifs', label: 'Objectifs', icon: 'target' }
];

const FILTER_ICONS = {
  all: 'layers'
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function pct(value, max) {
  if (!max) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 45000) return 'à l’instant';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  return `il y a ${h} h`;
}

function initials(name) {
  const clean = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, '');
  const words = clean.trim().split(/\s+/);
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase() || '?';
}

function statSummary(part, max = 2) {
  const entries = Object.entries(part.stats || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, max);
  return entries;
}

function statText(part) {
  return statSummary(part, 2)
    .map(([key, value]) => `${value} ${STATS[key].short}`)
    .join(' · ');
}

function relativeTimeLeft(endsAt) {
  return Math.max(0, endsAt - Date.now());
}

export class UI {
  constructor({ game, scene }) {
    this.game = game;
    this.scene = scene;
    this.net = null;
    this.tab = 'labo';
    this.filter = 'all';
    this.sort = 'power';
    this.marketView = 'buy';
    this.expView = 'expeditions';
    this.squadExtras = [];
    this.raidTargets = [];
    this.raidTargetsAt = 0;
    this.raidTargetsLoading = false;
    this.selection = null;
    this.pendingPop = null;
    this.pendingInstant = false;
    this.lastKey = null;
    this.lastMonsterUid = null;
    this.suppressClaimModal = false;
    this.modalOpen = false;
    this.lastFocus = null;

    this.el = {
      biomass: document.getElementById('resBiomass'),
      shards: document.getElementById('resShards'),
      syncBadge: document.getElementById('syncBadge'),
      syncLabel: document.getElementById('syncLabel'),
      tabs: document.getElementById('tabs'),
      panel: document.getElementById('panelBody'),
      roster: document.getElementById('roster'),
      stageName: document.getElementById('stageName'),
      stageIndex: document.getElementById('stageIndex'),
      stageBody: document.getElementById('stageBody'),
      stageLevel: document.getElementById('stageLevel'),
      stageXp: document.getElementById('stageXp'),
      stagePower: document.getElementById('stagePower'),
      xpFill: document.getElementById('xpFill'),
      xpBar: document.getElementById('xpBar'),
      stageStats: document.getElementById('stageStats'),
      stageExpedition: document.getElementById('stageExpedition'),
      stageEmpty: document.getElementById('stageEmpty'),
      stageHint: document.getElementById('stageHint'),
      toastStack: document.getElementById('toastStack'),
      modalRoot: document.getElementById('modalRoot'),
      helpBtn: document.getElementById('helpBtn')
    };

    this.buildTabs();
    this.bind();
    this.game.subscribe((state, reason) => this.onState(reason));
    this.game.onEvent(event => this.onEvent(event));
    this.renderAll();
    this.timer = setInterval(() => this.updateTimers(), 500);
  }

  // -----------------------------------------------------------
  // EVENTS
  // -----------------------------------------------------------
  bind() {
    this.el.tabs.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]');
      if (tab) this.setTab(tab.dataset.tab);
    });

    this.el.panel.addEventListener('click', event => {
      const jump = event.target.closest('[data-tab-jump]');
      if (jump) {
        this.setTab(jump.dataset.tabJump);
        return;
      }
      const tab = event.target.closest('[data-tab]');
      if (tab) {
        this.setTab(tab.dataset.tab);
        return;
      }
      const action = event.target.closest('[data-action]');
      if (action) this.handleAction(action.dataset.action, action);
    });

    this.el.panel.addEventListener('change', event => {
      if (event.target.matches('[data-sort-select]')) {
        this.sort = event.target.value;
        this.renderPanel();
      }
    });

    this.el.roster.addEventListener('click', event => {
      const chip = event.target.closest('[data-action="select-monster"]');
      if (chip) {
        this.squadExtras = [];
        this.game.selectMonster(chip.dataset.uid);
        return;
      }
      if (event.target.closest('[data-action="new-monster"]')) {
        this.openBodyModal();
      }
    });

    this.el.stageExpedition.addEventListener('click', event => {
      const btn = event.target.closest('[data-action]');
      if (btn) this.handleAction(btn.dataset.action, btn);
    });

    this.el.stageEmpty.addEventListener('click', event => {
      const btn = event.target.closest('[data-tab-jump]');
      if (btn) this.setTab(btn.dataset.tabJump);
    });

    this.el.helpBtn.addEventListener('click', () => this.openHelpModal());
    this.el.syncBadge.addEventListener('click', () => this.openHelpModal());

    this.el.modalRoot.addEventListener('click', event => {
      if (event.target.matches('.modal-backdrop')) {
        this.closeModal();
        return;
      }
      const close = event.target.closest('[data-modal-action="close"]');
      if (close) {
        this.closeModal();
        return;
      }
      const action = event.target.closest('[data-modal-action]');
      if (action) this.handleModalAction(action.dataset.modalAction, action);
    });

    this.el.modalRoot.addEventListener('input', event => {
      if (event.target.matches('#sellPriceInput')) this.updateSellPreview();
      if (event.target.matches('#feedBiomassInput')) this.updateFeedPreview();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.modalOpen) this.closeModal();
    });
  }

  onState() {
    this.renderAll();
  }

  onEvent(event) {
    switch (event.type) {
      case 'toast':
        this.toast(event.text, event.kind);
        break;
      case 'attach':
        this.pendingPop = [event.part.uid];
        this.selection = null;
        break;
      case 'detach':
        this.pendingInstant = true;
        this.selection = null;
        break;
      case 'autoassemble':
        this.pendingPop = event.placements.map(p => p.part.uid);
        this.selection = null;
        break;
      case 'claim':
        if (!this.suppressClaimModal) this.openRewardModal(event);
        break;
      case 'raid-claim':
        if (!this.suppressClaimModal) this.openRaidResultModal(event.result, event.monster, event.raid);
        break;
      case 'claim-quest':
        if (!this.suppressClaimModal) this.openQuestRewardModal(event);
        break;
      case 'expedition-ready':
      case 'raid-ready':
        this.renderAll();
        break;
      case 'remotesave':
        if (this.net?.online) this.net.scheduleSave();
        break;
      default:
        break;
    }
  }

  // -----------------------------------------------------------
  // RENDU GLOBAL
  // -----------------------------------------------------------
  renderAll() {
    const state = this.game.state;
    this.validateSquad();
    this.validateSelection();
    this.el.biomass.textContent = formatNumber(state.resources.biomass);
    this.el.shards.textContent = formatNumber(state.resources.shards);
    this.renderSync();
    this.renderTabs();
    this.renderStage();
    this.renderPanel();
    this.renderRoster();
    this.syncScene();
    hydrateIcons(document);
    this.updateTimers();
  }

  renderSync() {
    const online = this.net?.online;
    this.el.syncBadge.dataset.state = online ? 'online' : 'offline';
    this.el.syncLabel.textContent = online
      ? `En ligne${this.net.onlineCount ? ` · ${this.net.onlineCount}` : ''}`
      : 'Local';
    this.el.syncBadge.title = online
      ? 'Salon partagé connecté — clique pour les détails'
      : 'Mode local : marché simulé. Lance `node server.js` pour le multijoueur.';
  }

  buildTabs() {
    this.el.tabs.innerHTML = TABS.map(tab => `
      <button type="button" class="tab" role="tab" data-tab="${tab.id}" aria-selected="false" aria-controls="panelBody">
        ${icon(tab.icon, 18)}
        <span class="tab-label">${tab.label}</span>
      </button>
    `).join('');
  }

  renderTabs() {
    const readyExpeditions = this.game.state.expeditions.filter(e => Date.now() >= e.endsAt).length;
    const readyRaids = this.game.state.raids.filter(r => Date.now() >= r.endsAt).length;
    const ready = readyExpeditions + readyRaids;
    const quests = this.game.questStates().filter(q => q.claimable).length;

    this.el.tabs.querySelectorAll('.tab').forEach(tab => {
      const active = tab.dataset.tab === this.tab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.querySelector('.tab-badge')?.remove();
      if (tab.dataset.tab === 'expeditions' && ready > 0) {
        tab.insertAdjacentHTML('beforeend', `<span class="tab-badge">${ready}</span>`);
      }
      if (tab.dataset.tab === 'objectifs' && quests > 0) {
        tab.insertAdjacentHTML('beforeend', `<span class="tab-badge">${quests}</span>`);
      }
    });
  }

  setTab(tab) {
    if (!TABS.some(t => t.id === tab)) return;
    this.tab = tab;
    this.renderTabs();
    this.renderPanel();
    this.syncScene();
    this.el.panel.scrollTop = 0;
    if (window.innerWidth <= 980) {
      this.el.panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  renderStage() {
    const monster = this.game.selectedMonster;
    const state = this.game.state;

    if (!monster) {
      this.el.stageName.textContent = '—';
      this.el.stageIndex.textContent = 'AUCUN SPÉCIMEN';
      this.el.stageBody.textContent = '—';
      this.el.stageLevel.textContent = 'Niv. —';
      this.el.stageXp.textContent = '—';
      this.el.stagePower.textContent = '— PWR';
      this.el.xpFill.style.width = '0%';
      this.el.stageStats.innerHTML = '';
      this.el.stageExpedition.classList.add('hidden');
      this.el.stageEmpty.classList.remove('hidden');
      this.el.stageHint.classList.add('hidden');
      return;
    }

    this.el.stageEmpty.classList.add('hidden');
    this.el.stageHint.classList.toggle('hidden', this.tab === 'assemblage');

    const index = state.monsters.findIndex(m => m.uid === monster.uid) + 1;
    const body = BODIES[monster.bodyId] || BODIES.larve;
    const stats = monsterStats(monster);
    const power = monsterPower(monster);
    const need = nextLevelXp(monster.level || 1);

    this.el.stageName.textContent = monster.name;
    this.el.stageIndex.textContent = `SPÉCIMEN ${String(index).padStart(2, '0')}`;
    const stageRole = ROLES[monster.role] || ROLES.harvester;
    this.el.stageBody.textContent = `${body.label.toUpperCase()} · ${stageRole.short}${this.game.state.guardianId === monster.uid ? ' · GARDIEN' : ''}`;
    this.el.stageLevel.textContent = `Niv. ${monster.level || 1}`;
    this.el.stageXp.textContent = `${formatNumber(monster.xp || 0)} / ${formatNumber(need)} XP`;
    this.el.stagePower.textContent = `${formatNumber(power)} PWR`;
    this.el.xpFill.style.width = `${pct(monster.xp || 0, need)}%`;
    this.el.xpBar.setAttribute('aria-valuenow', String(Math.round(pct(monster.xp || 0, need))));
    this.el.xpBar.setAttribute('aria-valuemin', '0');
    this.el.xpBar.setAttribute('aria-valuemax', '100');

    const maxStat = Math.max(20, ...STAT_KEYS.map(k => stats[k] || 0));
    this.el.stageStats.innerHTML = `
      <div class="hud-head"><span>Attributs</span><b>${formatNumber(power)} PWR</b></div>
      ${STAT_KEYS.map(key => {
        const def = STATS[key];
        return `<div class="hud-row" title="${esc(def.label)} — ${esc(def.desc)}">
          <span class="hud-ico" style="color:${def.color}">${icon(def.icon, 13)}</span>
          <span class="hud-label">${def.label}</span>
          <span class="hud-val">${stats[key] || 0}</span>
          <span class="hud-track" style="--stat:${def.color}"><i style="width:${pct(stats[key] || 0, maxStat)}%"></i></span>
        </div>`;
      }).join('')}
    `;

    this.el.stageStats.classList.toggle('hidden', Boolean(this.game.activeActivity(monster.uid)));

    this.renderStageActivity(monster);
  }

  renderStageActivity(monster) {
    const raid = this.game.activeRaid(monster.uid);
    const exp = this.game.state.expeditions.find(e => e.monsterId === monster.uid);
    const el = this.el.stageExpedition;

    if (!raid && !exp) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    const isRaid = Boolean(raid);
    const target = isRaid
      ? (raid.target || { id: raid.targetId, name: raid.targetName, kind: raid.targetKind, defense: raid.defense })
      : null;
    const expMembers = exp ? this.game.expeditionMembers(exp) : [];
    const endsAt = isRaid ? raid.endsAt : exp.endsAt;
    const startedAt = isRaid ? raid.startedAt : exp.startedAt;
    const label = isRaid ? target.name : ZONE_BY_ID[exp.zoneId].name;
    const tag = isRaid ? 'RAID' : `${ZONE_BY_ID[exp.zoneId].tag}${expMembers.length > 1 ? ` ×${expMembers.length}` : ''}`;
    const remaining = relativeTimeLeft(endsAt);
    const ready = remaining <= 0;
    const progress = pct(Date.now() - startedAt, endsAt - startedAt);

    // HP bars for expedition members
    let hpHtml = '';
    if (!isRaid && expMembers.length) {
      const zone = ZONE_BY_ID[exp.zoneId];
      const hpData = this.game.getExpeditionHp ? this.game.getExpeditionHp(exp.id) : null;
      if (hpData) {
        hpHtml = `<div class="se-hp-bars">` + hpData.map((hd, i) => {
          const member = expMembers[i];
          const hpPct = hd.maxHp > 0 ? (hd.hp / hd.maxHp * 100) : 0;
          const dead = hd.dead;
          return `<div class="hp-bar-row">
            <span class="hp-name">${esc(member?.name || 'Spécimen')}</span>
            <div class="hp-bar-wrap">
              <div class="hp-bar ${dead ? 'dead' : ''}" style="width:${hpPct}%"></div>
            </div>
            <span class="hp-value">${dead ? 'ÉPUISÉ' : `${Math.round(hd.hp)}/${hd.maxHp}`}</span>
          </div>`;
        }).join('') + `</div>`;
      }
    }

    el.classList.remove('hidden');
    el.classList.toggle('raid', isRaid);
    el.innerHTML = `
      <div class="se-top">
        <span>${ready ? (isRaid ? 'RÉSULTAT PRÊT' : 'PRÊT À RÉCOLTER') : (isRaid ? 'EN RAZZIA' : 'EN EXPÉDITION')}</span>
        <span>${tag}</span>
      </div>
      <div class="se-zone">${esc(label)}</div>
      <div class="se-timer" data-ends="${endsAt}">${ready ? '00:00' : formatClock(remaining / 1000)}</div>
      <div class="se-bar"><i data-progress data-start="${startedAt}" data-end="${endsAt}" style="width:${progress}%"></i></div>
      ${hpHtml}
      ${ready
        ? `<button class="se-claim" type="button" data-action="${isRaid ? 'claim-raid' : 'claim-expedition'}" data-id="${isRaid ? raid.id : exp.id}">${isRaid ? 'Résoudre la razzia' : 'Récolter'}</button>`
        : (!isRaid ? `<button class="se-recall" type="button" data-action="recall-expedition" data-id="${exp.id}">${icon('rotate-cw', 14)} Rappeler</button>` : '')}
    `;
  }

  renderRoster() {
    const state = this.game.state;
    const awayIds = new Set([
      ...state.expeditions.map(e => e.monsterId),
      ...state.raids.map(r => r.monsterId)
    ]);
    const guardianId = state.guardianId;
    const chips = state.monsters.map(monster => {
      const body = BODIES[monster.bodyId] || BODIES.larve;
      const hue = Math.round(((monster.hue ?? body.hue) % 1) * 360);
      const active = monster.uid === state.selectedMonsterId;
      const away = awayIds.has(monster.uid);
      const guardian = guardianId === monster.uid;
      const role = ROLES[monster.role] || ROLES.harvester;
      return `<button type="button" class="roster-chip ${active ? 'active' : ''} ${away ? 'away' : ''}"
        data-action="select-monster" data-uid="${monster.uid}"
        aria-pressed="${active ? 'true' : 'false'}" title="${esc(monster.name)} · ${esc(body.label)} · ${role.label}${guardian ? ' · gardien' : ''}">
        <span class="avatar" style="--hue:${hue}">${esc(initials(monster.name))}</span>
        <span class="roster-meta">
          <span class="roster-name">${esc(monster.name)}</span>
          <span class="roster-lv">Nv. ${monster.level || 1} · ${role.short}${guardian ? ' · garde' : ''}</span>
        </span>
        ${guardian ? `<span class="roster-guardian" title="Gardien">${icon('shield', 10)}</span>` : away ? '<span class="roster-away-dot" title="En mission"></span>' : ''}
      </button>`;
    }).join('');

    this.el.roster.innerHTML = `
      <div class="roster-head">
        <span>Laboratoire</span>
        <span>${state.monsters.length} / ${BALANCE.labSlots}</span>
      </div>
      <div class="roster-scroll">
        ${chips}
        <button type="button" class="roster-add" data-action="new-monster" title="Nouveau spécimen" aria-label="Nouveau spécimen">
          ${icon('plus', 18)}
        </button>
      </div>
    `;
  }

  // -----------------------------------------------------------
  // PANNEAU
  // -----------------------------------------------------------
  renderPanel() {
    const scroll = this.el.panel.scrollTop;
    let html = '';

    if (this.tab === 'labo') html = this.viewLabo();
    else if (this.tab === 'assemblage') html = this.viewAssemblage();
    else if (this.tab === 'expeditions') html = this.viewExpeditions();
    else if (this.tab === 'marche') html = this.viewMarche();
    else if (this.tab === 'objectifs') html = this.viewObjectifs();

    this.el.panel.innerHTML = html;
    this.el.panel.scrollTop = scroll;
    hydrateIcons(this.el.panel);
  }

  // ----- LABO -----
  viewLabo() {
    const state = this.game.state;
    const monster = this.game.selectedMonster;
    if (!monster) {
      return `<div class="empty-state">
        ${icon('flask', 28)}
        <b>Laboratoire vide</b>
        Crée un premier spécimen pour lancer la boucle.
        <div style="margin-top:14px"><button class="btn primary" type="button" data-action="new-monster">Créer un spécimen</button></div>
      </div>`;
    }

    const body = BODIES[monster.bodyId] || BODIES.larve;
    const role = ROLES[monster.role] || ROLES.harvester;
    const stats = monsterStats(monster);
    const power = monsterPower(monster);
    const capacity = capacityOf(monster);
    const slots = body.sockets;
    const need = nextLevelXp(monster.level || 1);
    const exploring = this.game.activeExpedition(monster.uid);
    const raid = this.game.activeRaid(monster.uid);
    const away = Boolean(exploring || raid);
    const isGuardian = this.game.state.guardianId === monster.uid;
    const guardian = this.game.guardianMonster;
    const maxStat = Math.max(20, ...STAT_KEYS.map(k => stats[k] || 0));

    const attached = monster.attachments.length
      ? monster.attachments.map(a => {
        const part = a.part;
        return `<div class="attach-row">
          <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 18)}</span>
          <span class="meta">
            <b>${esc(part.name)}</b>
            <span>${PART_TYPES[part.type].singular} · ${statText(part)}</span>
          </span>
          <button class="btn tiny ghost" type="button" data-action="inspect-part" data-uid="${part.uid}">Détail</button>
        </div>`;
      }).join('')
      : `<div class="empty-state">Aucune greffe. Passe à l’assemblage pour donner des attributs à ${esc(monster.name)}.</div>`;

    const log = state.log.slice(0, 7).map(entry => `
      <div class="log-item" data-kind="${entry.kind || 'info'}">
        <span class="log-time">${timeAgo(entry.t)}</span>
        <span>${esc(entry.text)}</span>
      </div>
    `).join('') || '<div class="empty-state">Rien à signaler.</div>';

    return `
      <section class="section">
        <div class="section-head">
          <div>
            <p class="eyebrow">Spécimen actif</p>
            <h2>${esc(monster.name)}</h2>
          </div>
          <button class="icon-btn" type="button" data-action="rename-monster" title="Renommer" aria-label="Renommer">
            ${icon('settings', 16)}
          </button>
        </div>
        <div class="power-card">
          <div class="power-orb">${formatNumber(power)}</div>
          <div>
            <p class="eyebrow">Puissance</p>
            <b>${esc(body.label)}</b>
            <p>${esc(body.desc)}</p>
            <div class="chips" style="margin-top:7px">
              <span class="chip" style="color:${role.color};border-color:${role.color}44">${icon(role.icon, 11)} ${role.label}</span>
              ${isGuardian ? `<span class="chip" style="color:var(--mint)">${icon('shield', 11)} Gardien du labo</span>` : ''}
              <span class="chip">${icon('spark', 11)} ${esc(monster.hue !== undefined ? `Teinte ${Math.round((monster.hue % 1) * 360)}°` : 'Teinte libre')}</span>
            </div>
          </div>
        </div>
      </section>

      ${raid ? this.activeRaidCard(raid) : exploring ? this.activeExpeditionCard(exploring) : ''}

      <section class="section">
      <section class="section">
        <div class="row between" style="margin-bottom:8px">
          <p class="eyebrow">Attributs</p>
          <span class="tiny dim mono">${monster.attachments.length} / ${capacity} greffes</span>
        </div>
        <div class="stat-table">
          ${STAT_KEYS.map(key => {
            const def = STATS[key];
            return `<div class="stat-line" style="--stat-color:${def.color}" title="${esc(def.desc)}">
              <span class="icon" style="color:${def.color}">${icon(def.icon, 14)}</span>
              <span class="lbl">${def.label}</span>
              <span class="val">${stats[key] || 0}</span>
              <span class="track"><i style="width:${pct(stats[key] || 0, maxStat)}%"></i></span>
            </div>`;
          }).join('')}
        </div>
      </section>

      <section class="section">
        <div class="capacity">
          <span>Capacité</span>
          <b>${monster.attachments.length}/${capacity}</b>
          <div class="capacity-bar"><i style="width:${pct(monster.attachments.length, capacity)}%"></i></div>
          <span class="grow"></span>
          <span class="dim mono tiny">${slots} sockets</span>
        </div>
        <div class="capacity" style="margin-top:6px">
          <span>Défense</span>
          <b>${formatNumber(this.game.labDefenseValue())}</b>
          <span class="grow"></span>
          <span class="tiny dim">${guardian ? `${esc(guardian.name)} · gardien` : 'aucun gardien'}</span>
        </div>
        <div class="cta-row" style="margin-top:8px">
          <button class="btn primary" type="button" data-tab="assemblage">${icon('dna', 15)} Assembler</button>
          <button class="btn" type="button" data-tab="expeditions">${icon('compass', 15)} Expédier</button>
          <button class="btn" type="button" data-action="open-feed">${icon('jaw', 15)} Nourrir</button>
        </div>
        <button class="btn ghost wide" style="margin-top:6px" type="button" data-action="go-raids">
          ${icon('skull', 15)} Lancer une razzia
        </button>
      </section>

      <section class="section">
        <div class="row between" style="margin-bottom:7px">
          <p class="eyebrow">Greffes</p>
          <span class="tiny dim mono">+${formatNumber(statsPerPart(monster))} stats</span>
        </div>
        <div class="part-list">${attached}</div>
      </section>

      <section class="section">
        <div class="row between" style="margin-bottom:5px">
          <p class="eyebrow">Journal</p>
          <span class="tiny dim mono">${formatNumber(monster.xp || 0)}/${formatNumber(need)} XP</span>
        </div>
        <div class="card tight"><div class="log">${log}</div></div>
      </section>
    `;
  }

  activeExpeditionCard(exp) {
    const zone = ZONE_BY_ID[exp.zoneId];
    const members = this.game.expeditionMembers(exp);
    const remaining = relativeTimeLeft(exp.endsAt);
    const ready = remaining <= 0;
    const progress = pct(Date.now() - exp.startedAt, exp.endsAt - exp.startedAt);
    return `<section class="section">
      <div class="exp-live ${ready ? 'ready' : ''}">
        <div class="exp-top">
          <div>
            <div class="exp-monster">${esc(zone.name)}</div>
            <div class="exp-zone">${ready ? 'Butin prêt' : 'En cours de récolte'} · ${members.length} spécimen(s)</div>
          </div>
          <div class="exp-time" data-ends="${exp.endsAt}">${ready ? '00:00' : formatClock(remaining / 1000)}</div>
        </div>
        <div class="exp-progress"><i data-progress data-start="${exp.startedAt}" data-end="${exp.endsAt}" style="width:${progress}%"></i></div>
        <div class="chips" style="margin:7px 0 8px">
          ${members.map(m => {
            const role = ROLES[m.role] || ROLES.harvester;
            return `<span class="chip" style="color:${role.color}">${icon(role.icon, 10)} ${esc(m.name)}</span>`;
          }).join('')}
        </div>
        <div class="exp-journal" data-journal="${exp.id}">${this.expeditionJournalHtml(exp)}</div>
        ${ready
          ? `<button class="btn primary wide" type="button" data-action="claim-expedition" data-id="${exp.id}">Récolter le butin</button>`
          : `<span class="tiny dim">Durée ${formatDuration(exp.duration)} · ${members.length > 1 ? 'escouade' : 'attributs'} appliqués au retour</span>`}
      </div>
    </section>`;
  }

  /** Journal déroulant d'une expédition (Fallout style). */
  expeditionJournalHtml(exp) {
    const zone = ZONE_BY_ID[exp.zoneId];
    const members = this.game.expeditionMembers(exp);
    if (!zone || !members.length) return '';
    const lines = expeditionJournal(exp, members, zone).slice(-20);
    return lines.map(line => `<div class="jrow ${line.kind}">
        <span class="jtime">${formatClock(line.t)}</span>
        <span class="jicon">${icon(line.icon, 12)}</span>
        <span class="jtext">${esc(line.text)}</span>
      </div>`).join('');
  }

  activeRaidCard(raid) {
    const target = raid.target || { name: raid.targetName, kind: raid.targetKind, defense: raid.defense };
    const remaining = relativeTimeLeft(raid.endsAt);
    const ready = remaining <= 0;
    const progress = pct(Date.now() - raid.startedAt, raid.endsAt - raid.startedAt);
    return `<section class="section">
      <div class="exp-live raid ${ready ? 'ready' : ''}">
        <div class="exp-top">
          <div>
            <div class="exp-monster">${esc(target.name)}</div>
            <div class="exp-zone">${ready ? 'Résultat prêt' : 'Razzia en cours'} · ${raidTargetLabel(target)}</div>
          </div>
          <div class="exp-time" data-ends="${raid.endsAt}">${ready ? '00:00' : formatClock(remaining / 1000)}</div>
        </div>
        <div class="exp-progress"><i data-progress data-start="${raid.startedAt}" data-end="${raid.endsAt}" style="width:${progress}%"></i></div>
        ${ready
          ? `<button class="btn primary wide" type="button" data-action="claim-raid" data-id="${raid.id}">Résoudre la razzia</button>`
          : `<span class="tiny dim">Défense estimée ${formatNumber(target.defense)} · trajet ${formatDuration(raid.duration)}</span>`}
      </div>
    </section>`;
  }

  // ----- ASSEMBLAGE -----
  viewAssemblage() {
    const monster = this.game.selectedMonster;
    if (!monster) {
      return `<div class="empty-state">
        ${icon('dna', 28)}
        <b>Aucun spécimen</b>
        Il faut un corps avant de greffer des parties.
        <div style="margin-top:14px"><button class="btn primary" type="button" data-action="new-monster">Créer un spécimen</button></div>
      </div>`;
    }

    const away = this.game.isAway(monster.uid);
    const capacity = capacityOf(monster);
    const free = capacity - monster.attachments.length;
    const atCapacity = free <= 0;

    let inventory = [...this.game.state.inventory];
    if (this.filter !== 'all') inventory = inventory.filter(p => p.type === this.filter);
    inventory = this.sortParts(inventory);

    const presentTypes = [...new Set(this.game.state.inventory.map(p => p.type))];
    const filters = [`<button type="button" class="filter-chip ${this.filter === 'all' ? 'active' : ''}" data-action="set-filter" data-filter="all">${icon('layers', 13)} Toutes</button>`]
      .concat(presentTypes.map(type => `
        <button type="button" class="filter-chip ${this.filter === type ? 'active' : ''}" data-action="set-filter" data-filter="${type}">
          ${icon(PART_TYPES[type].icon, 13)} ${PART_TYPES[type].label}
        </button>`))
      .join('');

    const selected = this.selection;
    let banner = '';
    if (selected) {
      const valid = validSocketsFor(monster, selected).length;
      banner = `<div class="selection-banner">
        <span class="part-tile rar-${selected.rarity}">${icon(PART_TYPES[selected.type].icon, 16)}</span>
        <span class="txt"><b>${esc(selected.name)}</b>${valid} socket(s) compatible(s) — touche un anneau lumineux sur le corps.</span>
        <button class="icon-btn" type="button" data-action="cancel-selection" aria-label="Annuler la sélection">${icon('close', 14)}</button>
      </div>`;
    } else if (!away && !atCapacity) {
      banner = `<div class="notice mint">${icon('info', 15)}<span>Touche une partie de l’inventaire, puis un socket lumineux sur ton monstre. Les anneaux violets sont libres.</span></div>`;
    }

    const rows = inventory.map(part => this.partRow(part, selected?.uid === part.uid)).join('');
    const attachedRows = monster.attachments.length
      ? monster.attachments.map(a => `
        <div class="attach-row">
          <span class="part-tile rar-${a.part.rarity}">${icon(PART_TYPES[a.part.type].icon, 16)}</span>
          <span class="meta">
            <b>${esc(a.part.name)}</b>
            <span>socket ${String(a.socket + 1).padStart(2, '0')} · ${statText(a.part)}</span>
          </span>
          <button class="btn tiny ghost" type="button" data-action="detach-part" data-uid="${a.part.uid}">Retirer</button>
        </div>`).join('')
      : '<div class="empty-state">Rien de greffé pour l’instant.</div>';

    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Atelier</p>
          <h2>Assemblage</h2>
        </div>
        <button class="btn sm violet" type="button" data-action="new-monster">${icon('plus', 14)} Spécimen</button>
      </div>

      <div class="capacity" style="margin-bottom:10px">
        <span>${esc(monster.name)}</span>
        <b>${monster.attachments.length}/${capacity}</b>
        <div class="capacity-bar"><i style="width:${pct(monster.attachments.length, capacity)}%"></i></div>
        <span class="grow"></span>
        <span class="dim mono tiny">${free} libre(s)</span>
      </div>

      ${away ? `<div class="notice">${icon('clock', 15)}<span>${esc(monster.name)} est en mission. L’assemblage est verrouillé jusqu’au retour.</span></div>` : ''}
      ${!away ? banner : ''}

      <section class="section" style="margin-top:12px">
        <div class="row between" style="margin-bottom:8px">
          <p class="eyebrow">Inventaire</p>
          <button class="btn tiny ghost" type="button" data-action="auto-assemble" ${away || atCapacity ? 'disabled' : ''}>
            ${icon('spark', 12)} Auto
          </button>
        </div>
        <div class="filters">${filters || ''}</div>
        <div class="sort-row">
          <span>${inventory.length} partie(s) · ${this.game.state.inventory.length}/${BALANCE.inventoryMax}</span>
          <select class="select" data-sort-select aria-label="Trier l’inventaire">
            <option value="power" ${this.sort === 'power' ? 'selected' : ''}>Puissance</option>
            <option value="rarity" ${this.sort === 'rarity' ? 'selected' : ''}>Rareté</option>
            <option value="recent" ${this.sort === 'recent' ? 'selected' : ''}>Récent</option>
            <option value="name" ${this.sort === 'name' ? 'selected' : ''}>Nom</option>
          </select>
        </div>
        <div class="part-list">${rows || `<div class="empty-state">${icon('layers', 24)}<b>Aucune partie</b>Lance une expédition pour récolter des parties.</div>`}</div>
      </section>

      <section class="section">
        <div class="row between" style="margin-bottom:7px">
          <p class="eyebrow">Greffes actives</p>
          <button class="btn tiny ghost" type="button" data-action="strip-monster" ${away || !monster.attachments.length ? 'disabled' : ''}>Tout retirer</button>
        </div>
        <div class="part-list">${attachedRows}</div>
      </section>

      <section class="section">
        <p class="eyebrow" style="margin-bottom:7px">Corps débloqués</p>
        <div class="body-card">
          <span class="body-avatar" style="--hue:${Math.round(((monster.hue ?? (BODIES[monster.bodyId] || BODIES.larve).hue) % 1) * 360)}">${icon((BODIES[monster.bodyId] || BODIES.larve).icon, 20)}</span>
          <span class="body-main">
            <b>${esc((BODIES[monster.bodyId] || BODIES.larve).label)}</b>
            <p>Corps actuel · ${monster.attachments.length}/${capacityOf(monster)} greffes · niveau ${monster.level || 1}</p>
          </span>
        </div>
        <button class="btn ghost wide" style="margin-top:7px" type="button" data-action="new-monster">Changer de corps / créer un spécimen</button>
      </section>
    `;
  }

  partRow(part, selected) {
    const def = PART_TYPES[part.type];
    const rarity = RARITIES[part.rarity];
    return `<button type="button" class="part-row rar-${part.rarity} ${selected ? 'selected' : ''}" data-action="select-part" data-uid="${part.uid}">
      <span class="part-tile rar-${part.rarity}">${icon(def.icon, 21)}</span>
      <span class="part-main">
        <span class="part-name">${esc(part.name)}</span>
        <span class="part-sub">
          <span class="rar-dot"></span>
          <span class="rar-label" style="color:${rarity.color}">${rarity.label}</span>
          <span>·</span>
          <span>${def.singular}</span>
        </span>
        <span class="part-stats">
          ${statSummary(part, 3).map(([key, value]) => `<span class="pstat"><b>${value}</b> ${STATS[key].short}</span>`).join('')}
        </span>
      </span>
      <span class="part-side">
        <span class="part-price">${formatNumber(fairPrice(part))} <span class="icon" style="display:inline-flex;vertical-align:-2px;color:var(--blue)">${icon('shards', 9)}</span></span>
        <span class="part-chev">${icon('chevron', 13)}</span>
      </span>
    </button>`;
  }

  sortParts(parts) {
    const copy = [...parts];
    if (this.sort === 'power') copy.sort((a, b) => partTotalStats(b) - partTotalStats(a));
    else if (this.sort === 'rarity') copy.sort((a, b) => RARITIES[b.rarity].rank - RARITIES[a.rarity].rank || partTotalStats(b) - partTotalStats(a));
    else if (this.sort === 'recent') copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (this.sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return copy;
  }

  // ----- EXPÉDITIONS -----
  viewExpeditions() {
    const readyRaids = this.game.state.raids.filter(r => Date.now() >= r.endsAt).length;
    const segments = `<div class="segmented" style="margin-bottom:12px" role="tablist" aria-label="Missions">
      <button type="button" class="${this.expView === 'expeditions' ? 'active' : ''}" data-action="exp-view" data-view="expeditions">${icon('compass', 12)} Expéditions</button>
      <button type="button" class="${this.expView === 'raids' ? 'active' : ''}" data-action="exp-view" data-view="raids">${icon('skull', 12)} Razzias${readyRaids ? ` (${readyRaids})` : ''}</button>
    </div>`;

    return segments + (this.expView === 'raids' ? this.viewRaids() : this.viewExpeditionList());
  }

  viewExpeditionList() {
    const state = this.game.state;
    const monster = this.game.selectedMonster;
    const squad = this.squadMembers();
    const selectedExpedition = monster ? this.game.activeExpedition(monster.uid) : null;

    const active = state.expeditions
      .slice()
      .sort((a, b) => a.endsAt - b.endsAt)
      .map(exp => this.expeditionCard(exp))
      .join('');

    const readyCount = state.expeditions.filter(e => Date.now() >= e.endsAt).length;

    const zones = ZONES.map(zone => this.zoneCard(zone, monster, squad)).join('');

    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Terrain</p>
          <h2>Expéditions</h2>
        </div>
        ${readyCount > 0
          ? `<button class="btn sm primary" type="button" data-action="claim-all">${icon('check', 14)} Tout récolter</button>`
          : ''}
      </div>

      ${monster ? `<div class="notice mint" style="margin-bottom:12px">${icon('compass', 15)}
        <span><b>${esc(monster.name)}</b> mène l’escouade. Ajoute jusqu’à deux équipiers : chaque rôle pèse sur le rendement et la durée.</span>
      </div>` : ''}

      ${monster && !selectedExpedition ? this.squadCard(monster, squad) : ''}

      ${active ? `<section class="section">
        <p class="eyebrow" style="margin-bottom:7px">En cours</p>
        ${active}
      </section>` : ''}

      <section class="section">
        <div class="row between" style="margin-bottom:8px">
          <p class="eyebrow">Zones</p>
          <span class="tiny dim mono">Record ${formatNumber(state.records.bestPower || 0)} PWR</span>
        </div>
        ${zones}
      </section>
    `;
  }

  squadCard(monster, squad) {
    const state = this.game.state;
    const leaderId = monster.uid;
    const extras = this.squadExtras;
    const full = squad.length >= 3;
    const role = ROLES[monster.role] || ROLES.harvester;

    const cards = state.monsters.map(m => {
      const mRole = ROLES[m.role] || ROLES.harvester;
      const isLeader = m.uid === leaderId;
      const joined = isLeader || extras.includes(m.uid);
      const away = this.game.isAway(m.uid);
      const deploy = this.game.canDeploy(m.uid);
      const disabled = isLeader || away || (!joined && (full || !deploy.ok));
      const hue = Math.round(((m.hue ?? (BODIES[m.bodyId] || BODIES.larve).hue) % 1) * 360);
      const status = isLeader ? 'CHEF' : joined ? 'RETIRER' : away ? 'EN MISSION' : 'AJOUTER';
      return `<button type="button" class="squad-card ${joined ? 'joined' : ''} ${isLeader ? 'leader' : ''}"
        data-action="squad-toggle" data-uid="${m.uid}" ${disabled ? 'disabled' : ''}
        title="${esc(m.name)} · ${mRole.label}">
        <span class="avatar" style="--hue:${hue};width:30px;height:30px">${esc(initials(m.name))}</span>
        <span class="squad-main">
          <b>${esc(m.name)}</b>
          <span style="color:${mRole.color}">${mRole.label} · Nv.${m.level || 1}</span>
        </span>
        <span class="squad-status">${status}</span>
      </button>`;
    }).join('');

    return `<section class="section">
      <div class="row between" style="margin-bottom:7px">
        <p class="eyebrow">Escouade</p>
        <span class="tiny mono" style="color:${squad.length > 1 ? 'var(--mint)' : 'var(--dim)'}">
          ${squad.length}/3 · ${esc(role.label)}
        </span>
      </div>
      <div class="squad-grid">${cards}</div>
      <p class="tiny dim" style="margin-top:7px;line-height:1.45">Le chef est le spécimen sélectionné. Les équipiers ajoutent leurs stats, leur rôle et une part d’XP ; la durée suit le plus lent. Rôles cumulés = butin et survie.</p>
    </section>`;
  }

  // ----- RAZZIS -----
  viewRaids() {
    const state = this.game.state;
    const monster = this.game.selectedMonster;
    const guardian = this.game.guardianMonster;
    const defense = this.game.labDefenseValue();

    if (!this.net?.online && !this.raidTargets.length) {
      this.raidTargets = this.game.raidTargets();
      this.raidTargetsAt = Date.now();
    } else if (this.net?.online && !this.raidTargets.length && !this.raidTargetsLoading) {
      this.refreshRaidTargets(true);
    }

    const stats = monster ? monsterStats(monster) : null;
    const raidRole = monster ? (ROLES[monster.role] || ROLES.harvester) : ROLES.harvester;
    const attack = stats ? attackScore(stats, monster.level || 1, raidRole.raid) : 0;
    const cargo = stats ? cargoCapacity(stats, monster.level || 1, raidRole.cargo) : 0;
    const deploy = monster ? this.game.canDeploy(monster.uid) : { ok: false, reason: 'Aucun spécimen sélectionné.' };

    const active = state.raids
      .slice()
      .sort((a, b) => a.endsAt - b.endsAt)
      .map(raid => this.raidCard(raid))
      .join('');

    const readyRaids = state.raids.filter(r => Date.now() >= r.endsAt).length;

    const guardianOptions = state.monsters
      .filter(m => !this.game.isAway(m.uid))
      .map(m => `<option value="${m.uid}" ${m.uid === state.guardianId ? 'selected' : ''}>${esc(m.name)} · Nv.${m.level || 1}</option>`)
      .join('');

    const guardianHue = guardian ? Math.round(((guardian.hue ?? (BODIES[guardian.bodyId] || BODIES.larve).hue) % 1) * 360) : 180;
    const sentryLevel = state.defenses?.sentry || 0;
    const sentryBonus = defenseUpgradeBonus(sentryLevel);
    const sentryNext = LAB_DEFENSES[sentryLevel];
    const sentryAffordable = sentryNext && state.resources.biomass >= sentryNext.biomass && state.resources.shards >= sentryNext.shards;
    const sentryOnline = Boolean(this.net?.online);

    const targetsHtml = this.raidTargets.length
      ? this.raidTargets.map(target => this.raidTargetCard(target, monster, attack, deploy)).join('')
      : `<div class="empty-state">
          ${icon(this.raidTargetsLoading ? 'clock' : 'skull', 24)}
          <b>${this.raidTargetsLoading ? 'Scan des laboratoires…' : 'Aucune cible'}</b>
          ${this.raidTargetsLoading ? 'Les signaux arrivent.' : 'Réessaie dans un instant.'}
        </div>`;

    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Pillage</p>
          <h2>Razzias</h2>
        </div>
        <button class="btn sm ghost" type="button" data-action="refresh-raids">
          ${icon('compass', 13)} Scanner
        </button>
      </div>

      <div class="capacity" style="margin-bottom:10px">
        <span>ATK</span>
        <b>${formatNumber(attack)}</b>
        <span class="grow"></span>
        <span>DEF labo</span>
        <b>${formatNumber(defense)}</b>
        <span class="grow"></span>
        <span class="dim mono tiny">cargo ${formatNumber(cargo)} · ${raidRole.label}</span>
      </div>

      ${monster && !deploy.ok ? `<div class="notice" style="margin-bottom:10px">${icon('clock', 15)}<span>${esc(monster.name)} ne peut pas partir : ${esc(deploy.reason)}</span></div>` : ''}
      ${!monster ? `<div class="notice" style="margin-bottom:10px">${icon('info', 15)}<span>Sélectionne un spécimen dans la barre du bas pour lancer une razzia.</span></div>` : ''}

      <section class="section">
        <div class="row between" style="margin-bottom:7px">
          <p class="eyebrow">Défense du laboratoire</p>
          <span class="tiny mono" style="color:var(--mint)">${formatNumber(defense)} DEF</span>
        </div>
        <div class="card tight">
          ${guardian ? `<div class="attach-row" style="margin-bottom:9px">
            <span class="avatar" style="--hue:${guardianHue}">${esc(initials(guardian.name))}</span>
            <span class="meta"><b>${esc(guardian.name)}</b><span>Gardien · Nv.${guardian.level}</span></span>
            <button class="btn tiny ghost" type="button" data-action="clear-guardian">Retirer</button>
          </div>` : `<p class="small dim" style="margin-bottom:9px">Aucun gardien. La défense de base protège faiblement le stockage.</p>`}
          <div class="row">
            <select class="select" id="guardianSelect" style="flex:1;min-width:0" aria-label="Choisir un gardien">
              <option value="">Aucun gardien</option>
              ${guardianOptions}
            </select>
            <button class="btn sm violet" type="button" data-action="set-guardian">Définir</button>
          </div>
          <p class="tiny dim" style="margin-top:7px;line-height:1.5">Le gardien reste au laboratoire, ne peut plus explorer et ajoute sa défense entre chaque razzia.</p>
        </div>
      </section>

      <section class="section">
        <div class="row between" style="margin-bottom:7px">
          <p class="eyebrow">Tourelle de veille</p>
          <span class="tiny mono" style="color:var(--mint)">Niv. ${sentryLevel} · +${sentryBonus} DEF</span>
        </div>
        <div class="card tight">
          <p class="small dim" style="margin-bottom:9px">Ajoute de la DEF contre les razzias d’autres joueurs. Les labos PNJ ne ripostent pas ; amélioration disponible en ligne.</p>
          ${sentryNext ? `<div class="row between">
            <span class="tiny mono">Prochain niveau · +${sentryNext.defense} DEF</span>
            <button class="btn sm violet" type="button" data-action="upgrade-sentry" ${sentryAffordable && sentryOnline ? '' : 'disabled'}>Améliorer</button>
          </div>
          ${!sentryOnline ? `<p class="tiny dim" style="margin-top:7px">Connecte-toi au salon partagé pour améliorer la défense.</p>` : ''}
          <div class="chips" style="margin-top:8px">
            <span class="chip">${icon('biomass', 11)} ${formatNumber(sentryNext.biomass)} biomasse</span>
            <span class="chip">${icon('shards', 11)} ${formatNumber(sentryNext.shards)} éclats</span>
          </div>` : `<span class="tiny mono" style="color:var(--mint)">Niveau maximal atteint</span>`}
        </div>
      </section>

      ${active ? `<section class="section">
        <div class="row between" style="margin-bottom:7px">
          <p class="eyebrow">En cours</p>
          ${readyRaids > 0 ? `<span class="tiny mono" style="color:var(--mint)">${readyRaids} prêt(s)</span>` : ''}
        </div>
        ${active}
      </section>` : ''}

      <section class="section">
        <div class="row between" style="margin-bottom:8px">
          <p class="eyebrow">Cibles</p>
          <span class="tiny dim mono">${this.raidTargets.length} signal(aux)</span>
        </div>
        ${targetsHtml}
      </section>

      <div class="notice mint">
        ${icon('info', 15)}
        <span>Une razzia vole des ressources, jamais des parties ni des monstres. En cas d’échec, le spécimen est fatigué ${formatDuration(RAID.fatigue)}.</span>
      </div>
    `;
  }

  raidTargetCard(target, monster, attack, deploy) {
    const loot = target.lootHint || raidLootHint(target);
    const recommended = target.recommendedPower || Math.round(target.defense * 1.05);
    const advantage = attack >= target.defense;
    const canAttack = Boolean(monster) && deploy.ok;
    const kindLabel = raidTargetLabel(target);
    const hue = Math.round((target.hue ?? 0.4) * 360);
    const isPlayer = target.kind === 'player';

    return `<div class="zone-card ${canAttack ? '' : 'locked'}" style="--hue:${hue}">
      <div class="zone-head">
        <span class="zone-name">
          <span class="zone-tag">${icon(isPlayer ? 'users' : 'skull', 10)}</span>
          ${esc(target.name)}
        </span>
        <span class="zone-dur">${kindLabel}${target.level ? ` · Nv.${target.level}` : ''}</span>
      </div>
      <p class="zone-desc">${esc(target.desc || (isPlayer ? 'Un laboratoire rival, défendu par son gardien.' : 'Un stockage abandonné, encore surveillé.'))}</p>
      <div class="zone-meta">
        <span class="zone-stat ${advantage ? 'ok' : 'ko'}">DEF <b>${formatNumber(target.defense)}</b></span>
        <span class="zone-stat">ATK <b>${attack ? formatNumber(attack) : '—'}</b></span>
        <span class="zone-stat">conseillé ${formatNumber(recommended)} PWR</span>
        ${target.guardianName ? `<span class="zone-stat">${icon('shield', 10)} ${esc(target.guardianName)}</span>` : ''}
      </div>
      <div class="zone-footer">
        <span class="zone-reward">${icon('biomass', 10)} ~${formatNumber(loot.biomass)} <small>+ ${formatNumber(loot.shards)} éclats</small></span>
        <button class="btn sm ${advantage ? 'primary' : 'ghost'}" type="button" data-action="launch-raid" data-id="${esc(target.id)}" ${canAttack ? '' : 'disabled'}>
          Razzier
        </button>
      </div>
    </div>`;
  }

  raidCard(raid) {
    const monster = this.game.state.monsters.find(m => m.uid === raid.monsterId);
    const target = raid.target || { name: raid.targetName, kind: raid.targetKind, defense: raid.defense };
    const remaining = relativeTimeLeft(raid.endsAt);
    const ready = remaining <= 0;
    const progress = pct(Date.now() - raid.startedAt, raid.endsAt - raid.startedAt);
    return `<div class="exp-live raid ${ready ? 'ready' : ''}">
      <div class="exp-top">
        <div>
          <div class="exp-monster">${esc(monster?.name || 'Spécimen perdu')} → ${esc(target.name)}</div>
          <div class="exp-zone">${raidTargetLabel(target)} · DEF ${formatNumber(target.defense)}</div>
        </div>
        <div class="exp-time" data-ends="${raid.endsAt}">${ready ? '00:00' : formatClock(remaining / 1000)}</div>
      </div>
      <div class="exp-progress"><i data-progress data-start="${raid.startedAt}" data-end="${raid.endsAt}" style="width:${progress}%"></i></div>
      ${ready
        ? `<button class="btn primary sm wide" type="button" data-action="claim-raid" data-id="${raid.id}">Résoudre la razzia</button>`
        : `<span class="tiny dim">${formatDuration(Math.ceil(remaining / 1000))} avant le rapport</span>`}
    </div>`;
  }

  async refreshRaidTargets(force = false) {
    if (this.raidTargetsLoading) return;
    if (!force && this.raidTargets.length && Date.now() - this.raidTargetsAt < 20000) return;

    if (!this.net?.online) {
      this.raidTargets = this.game.raidTargets();
      this.raidTargetsAt = Date.now();
      return;
    }

    this.raidTargetsLoading = true;
    try {
      const data = await this.net.getRaidTargets();
      this.raidTargets = data.targets || [];
      this.raidTargetsAt = Date.now();
    } catch (err) {
      this.raidTargetsAt = Date.now();
      this.toast(err.message || 'Scan impossible.', 'warn');
    } finally {
      this.raidTargetsLoading = false;
      if (this.tab === 'expeditions' && this.expView === 'raids') this.renderPanel();
    }
  }

  expeditionCard(exp) {
    const zone = ZONE_BY_ID[exp.zoneId];
    const members = this.game.expeditionMembers(exp);
    const remaining = relativeTimeLeft(exp.endsAt);
    const ready = remaining <= 0;
    const progress = pct(Date.now() - exp.startedAt, exp.endsAt - exp.startedAt);
    
    // HP bars for expedition members
    let hpHtml = '';
    if (!ready && members.length) {
      const hpData = this.game.getExpeditionHp ? this.game.getExpeditionHp(exp.id) : null;
      if (hpData) {
        hpHtml = `<div class="exp-hp-bars">` + hpData.map((hd, i) => {
          const member = members[i];
          const hpPct = hd.maxHp > 0 ? (hd.hp / hd.maxHp * 100) : 0;
          const dead = hd.dead;
          return `<div class="hp-bar-row">
            <span class="hp-name">${esc(member?.name || 'Spécimen')}</span>
            <div class="hp-bar-wrap">
              <div class="hp-bar ${dead ? 'dead' : ''}" style="width:${hpPct}%"></div>
            </div>
            <span class="hp-value">${dead ? 'ÉPUISÉ' : `${Math.round(hd.hp)}/${hd.maxHp}`}</span>
          </div>`;
        }).join('') + `</div>`;
      }
    }
    
    return `<div class="exp-live ${ready ? 'ready' : ''}">
      <div class="exp-top">
        <div>
          <div class="exp-monster">${members.map(m => esc(m.name)).join(' · ') || 'Spécimen perdu'}</div>
          <div class="exp-zone">${esc(zone.name)} · ${formatDuration(exp.duration)} · ${members.length} membre(s)</div>
        </div>
        <div class="exp-time" data-ends="${exp.endsAt}">${ready ? '00:00' : formatClock(remaining / 1000)}</div>
      </div>
      <div class="exp-progress"><i data-progress data-start="${exp.startedAt}" data-end="${exp.endsAt}" style="width:${progress}%"></i></div>
      ${hpHtml}
      <div class="chips" style="margin:7px 0 8px">
        ${members.map(m => {
          const role = ROLES[m.role] || ROLES.harvester;
          return `<span class="chip" style="color:${role.color}">${icon(role.icon, 10)} ${role.label}</span>`;
        }).join('')}
      </div>
      ${ready
        ? `<button class="btn primary sm wide" type="button" data-action="claim-expedition" data-id="${exp.id}">Récolter</button>`
        : `<div class="exp-actions">
            <span class="tiny dim">Retour dans ${formatDuration(Math.ceil(remaining / 1000))}</span>
            <button class="btn sm ghost" type="button" data-action="recall-expedition" data-id="${exp.id}">${icon('rotate-cw', 12)} Rappeler</button>
           </div>`}
    </div>`;
  }

  zoneCard(zone, monster, squad = []) {
    const unlocked = (this.game.state.records.bestPower || 0) >= zone.unlockPower;
    const members = (squad && squad.length ? squad : [monster]).filter(Boolean);
    const rates = members.length ? groupExpeditionRates(members, zone) : null;
    const power = rates?.power || 0;
    const ratio = power / Math.max(1, zone.req);
    const ratioOk = ratio >= 1;
    const deployChecks = members.map(m => ({ member: m, ...this.game.canDeploy(m.uid) }));
    const failed = deployChecks.find(check => !check.ok);
    const deploy = failed
      ? { ok: false, reason: `${failed.member.name} : ${failed.reason}` }
      : { ok: members.length > 0 };
    const away = monster ? this.game.isAway(monster.uid) : false;

    const totalOdd = Object.values(zone.rarityWeights).reduce((a, b) => a + b, 0) || 1;
    const odds = RARITY_KEYS.map(key => {
      const value = (zone.rarityWeights[key] || 0) / totalOdd * 100;
      if (value < 1) return '';
      return `<span class="odds-dot" style="--c:${RARITIES[key].color}" title="${RARITIES[key].label} ${Math.round(value)}%"></span>`;
    }).join('');

    let action = '';
    if (!unlocked) {
      action = `<span class="zone-lock">${icon('lock', 12)} ${formatNumber(zone.unlockPower)} PWR requis</span>`;
    } else if (!monster) {
      action = `<span class="zone-lock">Aucun spécimen</span>`;
    } else if (away) {
      action = `<button class="btn sm ghost" type="button" disabled>En mission</button>`;
    } else if (!deploy.ok) {
      action = `<span class="zone-lock">${icon('clock', 12)} ${esc(deploy.reason)}</span>`;
    } else {
      action = `<button class="btn sm primary" type="button" data-action="launch-expedition" data-zone="${zone.id}" ${deploy.ok ? '' : 'disabled'}>Lancer${members.length > 1 ? ` ×${members.length}` : ''}</button>`;
    }

    return `<div class="zone-card ${unlocked ? '' : 'locked'}" style="--hue:${Math.round(zone.hue * 360)}">
      <div class="zone-head">
        <span class="zone-name"><span class="zone-tag">${zone.tag}</span>${esc(zone.name)}</span>
        <span class="zone-dur">${formatDuration(rates?.duration || zone.duration)}</span>
      </div>
      <p class="zone-desc">${esc(zone.desc)}</p>
      <div class="zone-meta">
        <span class="zone-stat ${ratioOk ? 'ok' : 'ko'}">PWR <b>${formatNumber(power)}</b> / ${zone.req}</span>
        <span class="zone-stat">${icon(STATS[zone.favored].icon, 10)} fav. ${STATS[zone.favored].label}</span>
        <span class="zone-stat">Escouade ${members.length}/3</span>
        <span class="zone-stat">Butin ${zone.lootMax} max</span>
      </div>
      <div class="zone-odds">${odds}<span class="odds-label">rareté</span></div>
      <div class="zone-footer">
        <span class="zone-reward">${icon('biomass', 10)} ~${formatNumber(rates?.biomass || zone.biomass)} <small>+ ${formatNumber(rates?.shards || zone.biomass * 0.11)} éclats</small></span>
        ${action}
      </div>
    </div>`;
  }

  // ----- MARCHÉ -----
  viewMarche() {
    const state = this.game.state;
    const mode = this.net?.online ? 'online' : 'local';
    const mine = state.market.listings.filter(l => l.mine);
    const others = state.market.listings.filter(l => !l.mine);

    let body = '';
    if (this.marketView === 'buy') {
      body = others.length
        ? others.map(l => this.listingRow(l)).join('')
        : `<div class="empty-state">${icon('market', 26)}<b>Marché vide</b>Lance une expédition, ou reviens dans quelques minutes.</div>`;
    } else if (this.marketView === 'sell') {
      body = this.sellList();
    } else {
      body = mine.length
        ? mine.map(l => this.mineListingRow(l)).join('')
        : `<div class="empty-state">${icon('clock', 26)}<b>Aucune annonce</b>Tes ventes en cours apparaîtront ici.</div>`;
    }

    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Comptoir</p>
          <h2>Marché</h2>
        </div>
        <span class="market-mode ${mode === 'online' ? '' : 'offline'}">${mode === 'online' ? 'PARTAGÉ' : 'SIMULÉ'}</span>
      </div>

      <div class="market-head">
        <div class="market-balance"><small>ÉCLATS DISPONIBLES</small>${formatNumber(state.resources.shards)}</div>
        <span class="tiny dim" style="text-align:right;line-height:1.45">Taxe ${Math.round(BALANCE.marketTax * 100)} %<br>Annonce ${Math.round(BALANCE.marketDuration / 60000)} min</span>
      </div>

      <div class="segmented" role="tablist" aria-label="Marché">
        <button type="button" class="${this.marketView === 'buy' ? 'active' : ''}" data-action="market-view" data-view="buy">Acheter</button>
        <button type="button" class="${this.marketView === 'sell' ? 'active' : ''}" data-action="market-view" data-view="sell">Vendre</button>
        <button type="button" class="${this.marketView === 'mine' ? 'active' : ''}" data-action="market-view" data-view="mine">Mes annonces${mine.length ? ` (${mine.length})` : ''}</button>
      </div>

      ${this.marketView === 'buy' ? `<div class="row between" style="margin-bottom:8px">
        <span class="tiny dim">${others.length} annonce(s) · prix libres</span>
        <span class="tiny dim mono">${mode === 'online' ? 'joueurs réels' : 'collectionneurs PNJ'}</span>
      </div>` : ''}

      ${body}
    `;
  }

  listingRow(listing) {
    const isPart = listing.kind === 'part';
    const part = listing.item;
    const type = isPart ? part.type : null;
    const tier = isPart ? part.rarity : 'epic';
    const name = part.name;
    const fair = isPart ? fairPrice(part) : monsterValue(part);
    const canAfford = this.game.state.resources.shards >= listing.price;
    const sellerHue = Math.abs(hashCode(listing.seller || 'PNJ')) % 360;

    const sub = isPart
      ? `<span class="rar-dot" style="--rar:${RARITIES[tier].color}"></span><span style="color:${RARITIES[tier].color}">${RARITIES[tier].label}</span><span>·</span><span>${PART_TYPES[type].singular}</span><span>·</span><span>${statText(part)}</span>`
      : `<span>Nv. ${part.level || 1}</span><span>·</span><span>${formatNumber(monsterPower(part))} PWR</span><span>·</span><span>${part.attachments?.length || 0} greffes</span>`;

    return `<div class="listing">
      <span class="part-tile rar-${tier}">${isPart ? icon(PART_TYPES[type].icon, 21) : icon('spectre', 21)}</span>
      <div class="listing-main">
        <div class="listing-name">${esc(isPart ? name : `${name} (monstre)`)}</div>
        <div class="listing-sub">${sub}</div>
        <div class="listing-sub"><span class="seller"><span class="seller-dot" style="--c:hsl(${sellerHue},60%,60%)"></span>${esc(listing.seller || 'Anonyme')}</span><span>·</span><span>${timeAgo(listing.createdAt)}</span></div>
        <div class="fair-hint">Valeur conseillée ${formatNumber(fair)} ${listing.price > fair * 1.4 ? '· au-dessus du prix' : listing.price < fair * 0.7 ? '· bonne affaire' : ''}</div>
      </div>
      <div class="listing-price">${formatNumber(listing.price)}<small>éclats</small></div>
      <div class="listing-actions">
        <button class="btn tiny ${canAfford ? 'primary' : 'ghost'}" type="button" data-action="buy-listing" data-id="${listing.id}" ${canAfford ? '' : 'disabled'}>Prendre</button>
      </div>
    </div>`;
  }

  mineListingRow(listing) {
    const isPart = listing.kind === 'part';
    const item = listing.item;
    const fair = isPart ? fairPrice(item) : monsterValue(item);
    const remaining = relativeTimeLeft(listing.expiresAt);
    const status = listing.sellAt ? `achat probable · ${formatDuration(Math.ceil(relativeTimeLeft(listing.sellAt) / 1000))}` : 'en attente d’acheteur';

    return `<div class="listing mine">
      <span class="part-tile rar-${isPart ? item.rarity : 'epic'}">${isPart ? icon(PART_TYPES[item.type].icon, 21) : icon('spectre', 21)}</span>
      <div class="listing-main">
        <div class="listing-name">${esc(item.name)}</div>
        <div class="listing-sub"><span>${isPart ? RARITIES[item.rarity].label : `monstre Nv. ${item.level}`}</span><span>·</span><span>${status}</span></div>
        <div class="fair-hint">Expire dans ${formatDuration(Math.ceil(remaining / 1000))} · conseillé ${formatNumber(fair)}</div>
      </div>
      <div class="listing-price">${formatNumber(listing.price)}<small>éclats</small></div>
      <div class="listing-actions">
        <button class="btn tiny ghost" type="button" data-action="cancel-listing" data-id="${listing.id}">Retirer</button>
      </div>
    </div>`;
  }

  sellList() {
    const state = this.game.state;
    const awayIds = new Set([
      ...state.expeditions.map(e => e.monsterId),
      ...state.raids.map(r => r.monsterId)
    ]);
    const parts = this.sortParts(state.inventory).slice(0, 30);
    const partRows = parts.map(part => `
      <div class="listing">
        <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 20)}</span>
        <div class="listing-main">
          <div class="listing-name">${esc(part.name)}</div>
          <div class="listing-sub"><span class="rar-label" style="color:${RARITIES[part.rarity].color}">${RARITIES[part.rarity].label}</span><span>·</span><span>${statText(part)}</span></div>
          <div class="fair-hint">Conseillé ${formatNumber(fairPrice(part))} éclats</div>
        </div>
        <button class="btn tiny violet" type="button" data-action="open-sell-part" data-uid="${part.uid}">Vendre</button>
      </div>`).join('');

    const monsters = state.monsters.map(monster => `
      <div class="listing">
        <span class="avatar" style="--hue:${Math.round(((monster.hue ?? (BODIES[monster.bodyId] || BODIES.larve).hue) % 1) * 360)}">${esc(initials(monster.name))}</span>
        <div class="listing-main">
          <div class="listing-name">${esc(monster.name)}</div>
          <div class="listing-sub"><span>Nv. ${monster.level}</span><span>·</span><span>${formatNumber(monsterPower(monster))} PWR</span><span>·</span><span>${monster.attachments.length} greffes</span></div>
          <div class="fair-hint">Conseillé ${formatNumber(monsterValue(monster))} éclats</div>
        </div>
        <button class="btn tiny ghost" type="button" data-action="open-sell-monster" data-uid="${monster.uid}"
          ${awayIds.has(monster.uid) || state.monsters.length <= 1 || state.guardianId === monster.uid ? 'disabled' : ''}>Vendre</button>
      </div>`).join('');

    return `
      <div class="notice mint" style="margin-bottom:10px">${icon('info', 15)}
        <span>Fixe ton prix. Un collectionneur achète vite si l’offre est correcte ; sinon l’annonce expire et l’objet revient.</span>
      </div>
      <p class="eyebrow" style="margin-bottom:7px">Parties · ${state.inventory.length}/${BALANCE.inventoryMax}</p>
      <div class="part-list">${partRows || `<div class="empty-state">Inventaire vide.</div>`}</div>
      <p class="eyebrow" style="margin:14px 0 7px">Monstres</p>
      <div class="part-list">${monsters}</div>
    `;
  }

  // ----- OBJECTIFS -----
  viewObjectifs() {
    const quests = this.game.questStates();
    const state = this.game.state;

    const questHtml = quests.map(quest => {
      const rewards = [];
      if (quest.rewards.biomass) rewards.push(`<span class="reward-chip">${icon('biomass', 10)} ${formatNumber(quest.rewards.biomass)}</span>`);
      if (quest.rewards.shards) rewards.push(`<span class="reward-chip">${icon('shards', 10)} ${formatNumber(quest.rewards.shards)}</span>`);
      for (const loot of quest.rewards.loot || []) {
        rewards.push(`<span class="reward-chip" style="color:${RARITIES[loot.rarity].color}">${RARITIES[loot.rarity].icon} ${loot.count} ${RARITIES[loot.rarity].label.toLowerCase()}</span>`);
      }

      return `<div class="quest ${quest.complete ? 'done' : ''} ${quest.claimed ? 'claimed' : ''}">
        <div class="quest-head">
          <span class="quest-ico">${icon(quest.icon, 16)}</span>
          <div style="flex:1;min-width:0">
            <div class="quest-title">${esc(quest.title)}</div>
            <div class="quest-desc">${esc(quest.desc)}</div>
          </div>
        </div>
        <div class="quest-body">
          <div class="quest-progress"><i style="width:${pct(quest.progress, quest.goal)}%"></i></div>
          <div class="quest-foot">
            <span class="quest-count">${formatNumber(quest.progress)} / ${formatNumber(quest.goal)}</span>
            <div class="quest-rewards">${rewards.join('')}</div>
          </div>
          ${quest.claimable ? `<button class="btn primary sm wide" style="margin-top:8px" type="button" data-action="claim-quest" data-id="${quest.id}">Réclamer la récompense</button>` : ''}
          ${quest.claimed ? '<div class="tiny dim mono" style="margin-top:7px">RÉCLAMÉ</div>' : ''}
        </div>
      </div>`;
    }).join('');

    return `
      <div class="section-head">
        <div>
          <p class="eyebrow">Progression</p>
          <h2>Objectifs</h2>
        </div>
        <span class="tiny dim mono">${quests.filter(q => q.complete).length}/${quests.length}</span>
      </div>

      <div class="loop-card">
        <p class="eyebrow">La boucle</p>
        <div class="loop-steps">
          <div class="loop-step">${icon('compass', 16)}<b>Récolter</b><span>expéditions</span></div>
          <div class="loop-step">${icon('dna', 16)}<b>Assembler</b><span>attributs</span></div>
          <div class="loop-step">${icon('bolt', 16)}<b>Renforcer</b><span>zones dures</span></div>
          <div class="loop-step">${icon('market', 16)}<b>Échanger</b><span>marché</span></div>
          <div class="loop-step">${icon('skull', 16)}<b>Piller</b><span>razzias</span></div>
        </div>
        <button class="btn ghost wide" style="margin-top:10px" type="button" data-action="help">Comment jouer</button>
      </div>

      <div class="part-list">${questHtml}</div>

      <section class="section" style="margin-top:16px">
        <p class="eyebrow" style="margin-bottom:7px">Archives</p>
        <div class="records">
          <div class="record"><b>${formatNumber(state.records.expeditionsDone)}</b><span>expéditions</span></div>
          <div class="record"><b>${formatNumber(state.records.partsFound)}</b><span>parties trouvées</span></div>
          <div class="record"><b>${formatNumber(state.records.sales)}</b><span>ventes</span></div>
          <div class="record"><b>${formatNumber(state.records.bestPower)}</b><span>record de puissance</span></div>
          <div class="record"><b>${formatNumber(state.records.raidsWon)}</b><span>razzias gagnées</span></div>
          <div class="record"><b>${formatNumber(state.records.raidsDone)}</b><span>razzias lancées</span></div>
        </div>
      </section>
    `;
  }

  // -----------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------
  handleAction(action, el) {
    const game = this.game;
    const monster = game.selectedMonster;

    switch (action) {
      case 'select-monster':
        this.squadExtras = [];
        game.selectMonster(el.dataset.uid);
        break;
      case 'new-monster':
        this.openBodyModal();
        break;
      case 'rename-monster':
        this.openRenameModal();
        break;
      case 'open-feed':
        this.openFeedModal();
        break;

      case 'help':
        this.openHelpModal();
        break;
      case 'auto-assemble': {
        if (!monster) return;
        const result = game.autoAssemble(monster.uid);
        if (result.ok) this.toast(`${result.count} partie(s) greffée(s)`, 'success');
        else this.toast(result.reason, 'warn');
        break;
      }
      case 'strip-monster': {
        if (!monster) return;
        const result = game.stripMonster(monster.uid);
        if (result.ok) this.toast(`${result.count} greffe(s) retirée(s)`, 'info');
        else this.toast(result.reason, 'warn');
        break;
      }
      case 'select-part':
        this.selectPart(el.dataset.uid);
        break;
      case 'cancel-selection':
        this.clearSelection();
        break;
      case 'detach-part': {
        if (!monster) return;
        const result = game.detachPart(monster.uid, el.dataset.uid);
        if (result.ok) this.toast('Greffe retirée', 'info');
        else this.toast(result.reason, 'warn');
        break;
      }
      case 'inspect-part':
        this.openPartModal(el.dataset.uid);
        break;
      case 'open-sell-part':
        this.openSellModal('part', el.dataset.uid);
        break;
      case 'open-sell-monster':
        this.openSellModal('monster', el.dataset.uid);
        break;
      case 'set-filter':
        this.filter = el.dataset.filter;
        this.renderPanel();
        break;
      case 'market-view':
        this.marketView = el.dataset.view;
        this.renderPanel();
        break;
      case 'buy-listing':
        this.buyListing(el.dataset.id);
        break;
      case 'cancel-listing':
        this.cancelListing(el.dataset.id);
        break;
      case 'launch-expedition': {
        if (!monster) return;
        const squad = this.squadMembers();
        const extras = squad.filter(m => m.uid !== monster.uid).slice(0, 2).map(m => m.uid);
        const result = game.startExpedition(monster.uid, el.dataset.zone, extras);
        if (result.ok) {
          const zone = ZONE_BY_ID[result.expedition.zoneId];
          const names = (result.members || [monster]).map(m => m.name).join(', ');
          this.toast(
            (result.members?.length || 1) > 1
              ? `Escouade (${names}) part vers ${zone.name}`
              : `${monster.name} part vers ${zone.name}`,
            'ready'
          );
          this.selection = null;
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'claim-expedition':
        this.claimOne(el.dataset.id);
        break;
      case 'recall-expedition':
        this.recallOne(el.dataset.id);
        break;
      case 'claim-all':
        this.claimAll();
        break;
      case 'claim-quest':
        this.claimQuest(el.dataset.id);
        break;
      case 'exp-view':
        this.expView = el.dataset.view === 'raids' ? 'raids' : 'expeditions';
        this.renderPanel();
        if (this.expView === 'raids') this.refreshRaidTargets(true);
        break;
      case 'go-raids':
        this.expView = 'raids';
        this.setTab('expeditions');
        this.refreshRaidTargets(true);
        break;
      case 'squad-toggle':
        this.toggleSquad(el.dataset.uid);
        break;
      case 'refresh-raids':
        this.refreshRaidTargets(true);
        break;
      case 'set-guardian':
        this.setGuardianFromSelect();
        break;
      case 'clear-guardian':
        this.setGuardian(null);
        break;
      case 'upgrade-sentry': {
        const result = game.upgradeSentry();
        if (!result.ok) this.toast(result.reason, 'warn');
        else this.toast(`Tourelle · niveau ${result.level} (+${result.defense} DEF)`, 'success');
        break;
      }
      case 'launch-raid':
        this.launchRaid(el.dataset.id);
        break;
      case 'claim-raid':
        this.claimRaid(el.dataset.id);
        break;
      default:
        break;
    }
  }

  selectPart(uid) {
    const monster = this.game.selectedMonster;
    if (!monster) return;
    if (this.game.isAway(monster.uid)) {
      this.toast('Ce spécimen est en mission.', 'warn');
      return;
    }
    const part = this.game.state.inventory.find(p => p.uid === uid);
    if (!part) return;

    if (this.selection?.uid === uid) {
      this.clearSelection();
      return;
    }

    const capacity = capacityOf(monster);
    if (monster.attachments.length >= capacity) {
      this.toast('Capacité atteinte : fais monter le monstre de niveau.', 'warn');
      return;
    }

    const valid = validSocketsFor(monster, part);
    if (!valid.length) {
      this.toast('Aucun socket libre compatible avec cette partie.', 'warn');
      return;
    }

    this.selection = part;
    this.scene.setSelection(part, valid);
    this.renderPanel();
    this.toast(`${valid.length} socket(s) compatible(s)`, 'info');
  }

  clearSelection() {
    this.selection = null;
    this.scene.clearSelection();
    this.renderPanel();
  }

  onSocketClick(socket) {
    if (this.tab !== 'assemblage') return;
    const monster = this.game.selectedMonster;
    if (!monster) return;
    if (!this.selection) {
      this.toast('Choisis d’abord une partie dans l’inventaire.', 'info');
      return;
    }
    const result = this.game.attachPart(monster.uid, this.selection.uid, socket);
    if (result.ok) {
      this.toast('Greffe réussie', 'success');
    } else {
      this.toast(result.reason, 'warn');
    }
  }

  onPartClick(partUid) {
    this.openPartModal(partUid);
  }

  claimOne(id) {
    const result = this.game.claimExpedition(id);
    if (!result.ok) this.toast(result.reason, 'warn');
  }

  recallOne(id) {
    const result = this.game.recallExpedition(id);
    if (!result.ok) {
      this.toast(result.reason, 'warn');
    } else {
      if (result.dead && result.dead.length > 0) {
        this.toast(`${result.monsters.filter(m => result.dead.includes(m.uid)).map(m => m.name).join(', ')} revenu(s) épuisé(s) !`, 'warn');
      } else {
        this.toast(`Expédition rappelée (${Math.round(result.progress * 100)}%) · +${formatNumber(result.biomass)} biomasse`, 'info');
      }
      // Show reward modal for recall
      this.openRecallRewardModal(result);
    }
  }

  claimAll() {
    this.suppressClaimModal = true;
    const results = this.game.claimAll();
    this.suppressClaimModal = false;
    if (!results.length) {
      this.toast('Rien à récolter pour l’instant.', 'info');
      return;
    }
    this.openBatchRewardModal(results);
  }

  claimQuest(id) {
    const result = this.game.claimQuest(id);
    if (!result.ok) this.toast(result.reason, 'warn');
  }

  async launchRaid(targetId) {
    const monster = this.game.selectedMonster;
    if (!monster) {
      this.toast('Sélectionne un spécimen.', 'warn');
      return;
    }
    const target = this.raidTargets.find(t => String(t.id) === String(targetId));
    if (!target) {
      this.toast('Cible introuvable, relance un scan.', 'warn');
      return;
    }

    if (this.net?.online) {
      try {
        const result = await this.net.startRaid(monster.uid, targetId);
        if (!result.ok) {
          this.toast(result.reason || 'Razzia impossible.', 'warn');
          return;
        }
        this.toast(`${monster.name} part piller ${target.name}`, 'ready');
        this.expView = 'raids';
        this.renderAll();
      } catch (err) {
        this.toast(err.message || 'Le serveur ne répond pas.', 'warn');
      }
      return;
    }

    const result = this.game.startRaid(monster.uid, target);
    if (result.ok) {
      this.toast(`${monster.name} part piller ${target.name}`, 'ready');
      this.expView = 'raids';
    } else {
      this.toast(result.reason, 'warn');
    }
  }

  async claimRaid(id) {
    if (this.net?.online) {
      try {
        const result = await this.net.claimRaid(id);
        if (!result.ok) {
          this.toast(result.reason || 'Razzia impossible à résoudre.', 'warn');
          return;
        }
        this.openRaidResultModal(result.result, result.monster, result.raid);
      } catch (err) {
        this.toast(err.message || 'Le serveur ne répond pas.', 'warn');
      }
      return;
    }
    const result = this.game.claimRaid(id);
    if (!result.ok) this.toast(result.reason, 'warn');
  }

  async setGuardianFromSelect() {
    const select = document.getElementById('guardianSelect');
    const uid = select?.value || null;
    await this.setGuardian(uid);
  }

  async setGuardian(monsterUid) {
    if (this.net?.online) {
      try {
        const result = await this.net.setGuardian(monsterUid);
        if (result.ok) this.toast(monsterUid ? 'Gardien désigné.' : 'Garde retirée.', 'success');
        else this.toast(result.reason || 'Impossible de définir le gardien.', 'warn');
      } catch (err) {
        this.toast(err.message || 'Le serveur ne répond pas.', 'warn');
      }
      return;
    }
    const result = this.game.setGuardian(monsterUid);    if (result.ok) {
      if (!monsterUid) this.toast('Garde retirée.', 'info');
    } else {
      this.toast(result.reason, 'warn');
    }
  }

  openRaidResultModal(result, monster, raid) {
    const win = result.win;
    const fatigue = result.fatigue || 0;
    this.openModal(`
      ${this.modalHead(
        'Rapport de razzia',
        win ? 'Razzia réussie' : 'Razzia repoussée',
        `${result.targetName || raid?.target?.name || 'Cible'} · ${monster?.name || 'Spécimen'}`
      )}
      <div class="modal-body">
        <div class="reward-burst" style="grid-template-columns:repeat(3,1fr)">
          <div class="reward-big">${icon('biomass', 18)}<b>+${formatNumber(result.lootBiomass || 0)}</b><span>Biomasse</span></div>
          <div class="reward-big">${icon('shards', 18)}<b>+${formatNumber(result.lootShards || 0)}</b><span>Éclats</span></div>
          <div class="reward-big">${icon('bolt', 18)}<b>+${formatNumber(result.xp || 0)}</b><span>XP</span></div>
        </div>
        ${win
          ? `<div class="notice mint">${icon('check', 15)}<span>Stockage forcé${result.lootBiomass + result.lootShards === 0 ? ' — il était vide.' : '.'}</span></div>`
          : `<div class="notice">${icon('shield', 15)}<span>Défense efficace. ${monster ? `${esc(monster.name)} est fatigué ${formatDuration(fatigue)}.` : ''}</span></div>`}
        <div class="card tight" style="margin-top:10px">
          <div class="row between"><span class="tiny dim">Attaque</span><span class="mono small">${formatNumber(result.attack)}</span></div>
          <div class="row between" style="margin-top:6px"><span class="tiny dim">Défense</span><span class="mono small">${formatNumber(result.defense)}</span></div>
          <div class="row between" style="margin-top:6px"><span class="tiny dim">Jet</span><span class="mono small">×${result.roll}</span></div>
          ${result.guardianName ? `<div class="row between" style="margin-top:6px"><span class="tiny dim">Gardien adverse</span><span class="tiny">${esc(result.guardianName)}</span></div>` : ''}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Ranger le rapport</button>
      </div>
    `);
  }

  async buyListing(id) {
    if (this.net?.online) {
      try {
        const result = await this.net.buyListing(id);
        if (!result.ok) this.toast(result.reason || 'Achat impossible.', 'warn');
      } catch (err) {
        this.toast(err.message || 'Le marché ne répond pas.', 'warn');
      }
      return;
    }
    const result = this.game.buyListing(id);
    if (!result.ok) this.toast(result.reason, 'warn');
  }

  async cancelListing(id) {
    if (this.net?.online) {
      try {
        const result = await this.net.cancelListing(id);
        if (!result.ok) this.toast(result.reason || 'Retrait impossible.', 'warn');
        else this.toast('Annonce retirée', 'info');
      } catch (err) {
        this.toast(err.message || 'Le marché ne répond pas.', 'warn');
      }
      return;
    }
    const result = this.game.cancelListing(id);
    if (result.ok) this.toast('Annonce retirée', 'info');
    else this.toast(result.reason, 'warn');
  }

  // -----------------------------------------------------------
  // SÉLECTION & SCÈNE 3D
  // -----------------------------------------------------------
  validateSquad() {
    const selected = this.game.selectedMonster;
    const seen = new Set(selected ? [selected.uid] : []);
    this.squadExtras = (this.squadExtras || []).filter(uid => {
      if (seen.has(uid)) return false;
      const monster = this.game.state.monsters.find(m => m.uid === uid);
      if (!monster || this.game.isAway(uid)) return false;
      seen.add(uid);
      return true;
    }).slice(0, 2);
  }

  squadMembers() {
    const selected = this.game.selectedMonster;
    if (!selected) return [];
    const ids = [selected.uid, ...(this.squadExtras || [])];
    return [...new Set(ids)]
      .map(id => this.game.state.monsters.find(m => m.uid === id))
      .filter(Boolean)
      .slice(0, 3);
  }

  toggleSquad(monsterUid) {
    const selected = this.game.selectedMonster;
    if (!selected || monsterUid === selected.uid) return;
    const index = this.squadExtras.indexOf(monsterUid);
    if (index !== -1) {
      this.squadExtras.splice(index, 1);
      this.renderPanel();
      return;
    }
    if (this.squadExtras.length >= 2) {
      this.toast('Escouade complète (3 spécimens).', 'warn');
      return;
    }
    const monster = this.game.state.monsters.find(m => m.uid === monsterUid);
    if (!monster) return;
    const deploy = this.game.canDeploy(monsterUid);
    if (!deploy.ok) {
      this.toast(`${monster.name} : ${deploy.reason}`, 'warn');
      return;
    }
    this.squadExtras.push(monsterUid);
    this.renderPanel();
  }

  validateSelection() {
    if (!this.selection) return;
    const monster = this.game.selectedMonster;
    const stillThere = this.game.state.inventory.some(p => p.uid === this.selection.uid);
    if (!monster || !stillThere) {
      this.selection = null;
      this.scene.clearSelection();
    }
  }

  syncScene() {
    const monster = this.game.selectedMonster;
    const expedition = monster ? this.game.activeExpedition(monster.uid) : null;
    const raid = monster ? this.game.activeRaid(monster.uid) : null;
    const mode = expedition ? 'expedition' : raid ? 'raid' : 'idle';
    const away = mode !== 'idle';
    const builder = this.tab === 'assemblage' && Boolean(monster) && !away;

    this.scene.setBuilderMode(builder);

    if (!monster) {
      if (this.lastKey !== null) {
        this.scene.setMonster(null);
        this.lastKey = null;
        this.lastMonsterUid = null;
      }
      return;
    }

    if (away) {
      const members = expedition
        ? this.game.expeditionMembers(expedition)
        : [monster];
      const zone = expedition
        ? ZONE_BY_ID[expedition.zoneId]
        : {
            id: 'raid',
            hue: raid.target?.hue ?? 0.02,
            name: raid.target?.name || 'Razzia'
          };

      const key = `${mode}|${expedition ? expedition.id : raid.id}|${members.map(m => `${m.uid}:${m.level}:${m.role}:${m.hue}:${m.attachments.map(a => a.part.uid + '@' + a.socket).join(',')}`).join('~')}|${zone.id}`;
      if (key === this.lastKey) return;

      this.scene.setExpedition(members, {
        zone,
        mode,
        leaderId: expedition ? expedition.monsterId : monster.uid,
        beats: expedition ? expedition.beats || [] : [],
        startedAt: expedition ? expedition.startedAt : undefined,
        duration: expedition ? expedition.duration : undefined
      });
      this.lastKey = key;
      this.lastMonsterUid = monster.uid;
      this.pendingPop = null;
      this.pendingInstant = false;
      this.scene.clearSelection();
      return;
    }

    const key = `idle|${monster.uid}|${monster.level}|${monster.bodyId}|${monster.hue}|${monster.role}|${monster.attachments.map(a => `${a.part.uid}@${a.socket}`).join(',')}`;
    if (key === this.lastKey) {
      if (builder) {
        this.scene.setBuilderMode(true);
        if (this.selection) {
          this.scene.setSelection(this.selection, validSocketsFor(monster, this.selection));
        } else {
          this.scene.clearSelection();
        }
      }
      return;
    }

    const sameMonster = this.lastMonsterUid === monster.uid;
    const popUids = this.pendingPop;
    const instant = this.pendingInstant || (sameMonster && !popUids) || (sameMonster && this.lastKey === null);

    this.scene.setMonster(monster, {
      instant: this.lastKey === null ? false : instant,
      popUids: popUids && popUids.length ? popUids : null
    });

    this.lastKey = key;
    this.lastMonsterUid = monster.uid;
    this.pendingPop = null;
    this.pendingInstant = false;

    if (builder) {
      this.scene.setBuilderMode(true);
      if (this.selection) {
        this.scene.setSelection(this.selection, validSocketsFor(monster, this.selection));
      }
    }
  }

  // -----------------------------------------------------------
  // TIMERS
  // -----------------------------------------------------------
  updateTimers() {
    const now = Date.now();

    document.querySelectorAll('[data-ends]').forEach(el => {
      const ends = Number(el.dataset.ends);
      if (!ends) return;
      const remaining = Math.max(0, ends - now);
      el.textContent = remaining <= 0 ? '00:00' : formatClock(remaining / 1000);
      const parent = el.closest('.exp-live, .se, .stage-expedition');
      if (parent) parent.classList.toggle('ready', remaining <= 0);
    });

    document.querySelectorAll('[data-journal]').forEach(el => {
      const exp = this.game.state.expeditions.find(e => e.id === el.dataset.journal);
      if (!exp) return;
      const html = this.expeditionJournalHtml(exp);
      if (el.innerHTML !== html) el.innerHTML = html;
    });

    document.querySelectorAll('[data-progress]').forEach(el => {
      const start = Number(el.dataset.start);
      const end = Number(el.dataset.end);
      if (!start || !end || end <= start) return;
      const value = pct(now - start, end - start);
      el.style.width = `${value}%`;
    });
  }

  // -----------------------------------------------------------
  // MODALES
  // -----------------------------------------------------------
  openModal(html, { className = '' } = {}) {
    this.lastFocus = document.activeElement;
    this.el.modalRoot.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal ${className}" role="dialog" aria-modal="true" tabindex="-1">
        ${html}
      </div>
    `;
    this.el.modalRoot.classList.add('open');
    this.modalOpen = true;
    hydrateIcons(this.el.modalRoot);
    const modal = this.el.modalRoot.querySelector('.modal');
    if (modal) setTimeout(() => modal.focus(), 30);
  }

  closeModal() {
    this.el.modalRoot.classList.remove('open');
    this.el.modalRoot.innerHTML = '';
    this.modalOpen = false;
    if (this.lastFocus?.focus) this.lastFocus.focus();
  }

  modalHead(kicker, title, subtitle = '') {
    return `<div class="modal-head">
      <div>
        <p class="eyebrow">${esc(kicker)}</p>
        <h2>${esc(title)}</h2>
        ${subtitle ? `<p class="small dim" style="margin-top:6px">${esc(subtitle)}</p>` : ''}
      </div>
      <button class="modal-close" type="button" data-modal-action="close" aria-label="Fermer">${icon('close', 16)}</button>
    </div>`;
  }

  openPartModal(partUid) {
    const monster = this.game.selectedMonster;
    let part = null;
    let attachment = null;
    let owner = null;

    if (monster) {
      attachment = monster.attachments.find(a => a.part.uid === partUid) || null;
      if (attachment) {
        part = attachment.part;
        owner = monster;
      }
    }
    if (!part) part = this.game.state.inventory.find(p => p.uid === partUid);
    if (!part) {
      this.toast('Partie introuvable.', 'warn');
      return;
    }

    const def = PART_TYPES[part.type];
    const rarity = RARITIES[part.rarity];
    const isAttached = Boolean(attachment);
    const away = owner ? Boolean(this.game.isAway(owner.uid)) : false;

    const actions = [];
    if (isAttached) {
      actions.push(`<button class="btn danger" type="button" data-modal-action="detach-modal" data-uid="${part.uid}" ${away ? 'disabled' : ''}>Retirer la greffe</button>`);
    } else {
      actions.push(`<button class="btn primary" type="button" data-modal-action="select-modal" data-uid="${part.uid}" ${!monster || away ? 'disabled' : ''}>Greffer</button>`);
      actions.push(`<button class="btn" type="button" data-modal-action="sell-modal" data-uid="${part.uid}">Vendre</button>`);
    }
    actions.push(`<button class="btn ghost wide-auto" type="button" data-modal-action="close">Fermer</button>`);

    this.openModal(`
      ${this.modalHead(isAttached ? 'Greffe active' : 'Inventaire', part.name, `${rarity.label} · ${def.label}`)}
      <div class="modal-body">
        <div class="modal-hero">
          <span class="part-tile rar-${part.rarity}">${icon(def.icon, 27)}</span>
          <div>
            <b>${esc(part.name)}</b>
            <span>${rarity.label.toUpperCase()} · ${def.singular.toUpperCase()}</span>
            <div class="tiny dim" style="margin-top:5px;line-height:1.4">${esc(def.blurb)}</div>
          </div>
        </div>
        <div class="stat-table">
          ${STAT_KEYS.filter(k => part.stats[k]).map(key => {
            const stat = STATS[key];
            return `<div class="stat-line" style="--stat-color:${stat.color}">
              <span class="icon" style="color:${stat.color}">${icon(stat.icon, 14)}</span>
              <span class="lbl">${stat.label}</span>
              <span class="val">+${part.stats[key]}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="row between" style="margin-top:14px">
          <span class="tiny dim">Valeur conseillée</span>
          <span class="mono small" style="color:var(--amber)">${formatNumber(fairPrice(part))} éclats</span>
        </div>
        ${isAttached ? `<div class="row between" style="margin-top:4px"><span class="tiny dim">Greffé sur</span><span class="tiny">${esc(owner?.name || '—')} · socket ${attachment.socket + 1}</span></div>` : ''}
        ${part.origin ? `<div class="row between" style="margin-top:4px"><span class="tiny dim">Provenance</span><span class="tiny dim mono">${esc(part.origin)}</span></div>` : ''}
      </div>
      <div class="modal-actions">${actions.join('')}</div>
    `);
  }

  openSellModal(kind, uid) {
    const isPart = kind === 'part';
    const item = isPart
      ? this.game.state.inventory.find(p => p.uid === uid)
      : this.game.state.monsters.find(m => m.uid === uid);
    if (!item) return;

    const fair = isPart ? fairPrice(item) : monsterValue(item);
    const range = isPart ? priceRange(item) : { min: Math.round(fair * 0.55), max: Math.round(fair * 2.2) };
    const def = isPart ? PART_TYPES[item.type] : null;

    this.openModal(`
      ${this.modalHead('Marché', `Vendre ${isPart ? 'une partie' : 'un monstre'}`, item.name)}
      <div class="modal-body">
        <div class="modal-hero">
          ${isPart
            ? `<span class="part-tile rar-${item.rarity}">${icon(def.icon, 27)}</span>`
            : `<span class="avatar" style="--hue:${Math.round(((item.hue ?? (BODIES[item.bodyId] || BODIES.larve).hue) % 1) * 360)}">${esc(initials(item.name))}</span>`}
          <div>
            <b>${esc(item.name)}</b>
            <span>${isPart ? `${RARITIES[item.rarity].label.toUpperCase()} · ${def.singular.toUpperCase()}` : `NIV. ${item.level} · ${formatNumber(monsterPower(item))} PWR`}</span>
            <div class="tiny dim" style="margin-top:5px">Prix conseillé : ${formatNumber(fair)} éclats</div>
          </div>
        </div>

        <label class="eyebrow" for="sellPriceInput">Prix de vente</label>
        <div class="price-input">
          ${icon('shards', 17)}
          <input id="sellPriceInput" type="number" min="1" max="9999999" inputmode="numeric" value="${fair}" />
          <span>ÉCLATS</span>
        </div>
        <div class="quick-prices">
          <button type="button" data-modal-action="quick-price" data-value="${Math.max(1, Math.round(fair * 0.85))}">-15 %</button>
          <button type="button" data-modal-action="quick-price" data-value="${fair}">Conseillé</button>
          <button type="button" data-modal-action="quick-price" data-value="${Math.round(fair * 1.15)}">+15 %</button>
          <button type="button" data-modal-action="quick-price" data-value="${Math.round(fair * 1.35)}">+35 %</button>
        </div>
        <div class="card tight">
          <div class="row between"><span class="tiny dim">Prix affiché</span><span class="mono small" id="sellPriceEcho">${formatNumber(fair)}</span></div>
          <div class="row between" style="margin-top:5px"><span class="tiny dim">Taxe ${Math.round(BALANCE.marketTax * 100)} %</span><span class="mono tiny" id="sellTaxEcho">-${formatNumber(Math.round(fair * BALANCE.marketTax))}</span></div>
          <div class="row between" style="margin-top:5px"><span class="tiny dim">Tu reçois</span><span class="mono small" style="color:var(--mint)" id="sellNetEcho">${formatNumber(Math.round(fair * (1 - BALANCE.marketTax)))}</span></div>
        </div>
        <p class="tiny dim" style="margin-top:10px;line-height:1.5">Un collectionneur achète rapidement si le prix reste sous ~${formatNumber(Math.round(fair * 1.3))} éclats. Au-delà, l’annonce peut expirer.</p>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Annuler</button>
        <button class="btn primary" type="button" data-modal-action="publish-sale" data-kind="${kind}" data-uid="${uid}">Publier l’annonce</button>
      </div>
    `);
  }

  updateSellPreview() {
    const input = this.el.modalRoot.querySelector('#sellPriceInput');
    if (!input) return;
    const price = Math.max(1, Math.round(Number(input.value) || 0));
    const net = Math.round(price * (1 - BALANCE.marketTax));
    const tax = price - net;
    const echo = this.el.modalRoot.querySelector('#sellPriceEcho');
    const taxEcho = this.el.modalRoot.querySelector('#sellTaxEcho');
    const netEcho = this.el.modalRoot.querySelector('#sellNetEcho');
    if (echo) echo.textContent = formatNumber(price);
    if (taxEcho) taxEcho.textContent = `-${formatNumber(tax)}`;
    if (netEcho) netEcho.textContent = formatNumber(net);
  }

  openFeedModal() {
    const monster = this.game.selectedMonster;
    if (!monster) return;
    if (this.game.isAway(monster.uid)) {
      this.toast('Ce spécimen est en mission.', 'warn');
      return;
    }

    const available = this.game.state.resources.biomass;
    const next = nextLevelXp(monster.level || 1);
    const missing = Math.max(10, next - (monster.xp || 0));
    const suggested = Math.min(available, Math.max(10, Math.round(missing * BALANCE.feedRate)));

    this.openModal(`
      ${this.modalHead('Nutrition', 'Nourrir le spécimen', `${formatNumber(available)} biomasse disponible · 1 XP = ${BALANCE.feedRate} biomasse`)}
      <div class="modal-body">
        <div class="modal-hero">
          <span class="avatar" style="--hue:${Math.round(((monster.hue ?? (BODIES[monster.bodyId] || BODIES.larve).hue) % 1) * 360)}">${esc(initials(monster.name))}</span>
          <div>
            <b>${esc(monster.name)}</b>
            <span>NIV. ${monster.level} · ${formatNumber(monster.xp || 0)} / ${formatNumber(next)} XP</span>
            <div class="tiny dim" style="margin-top:5px">La biomasse se transforme en expérience. Un niveau = un socket et +2 % d’attributs.</div>
          </div>
        </div>

        <label class="eyebrow" for="feedBiomassInput">Biomasse à absorber</label>
        <div class="price-input">
          ${icon('biomass', 17)}
          <input id="feedBiomassInput" type="number" min="10" max="${available}" step="10" inputmode="numeric" value="${suggested}" />
          <span>BIOMASSE</span>
        </div>
        <div class="quick-prices">
          <button type="button" data-modal-action="quick-feed" data-pct="0.25">25 %</button>
          <button type="button" data-modal-action="quick-feed" data-pct="0.5">50 %</button>
          <button type="button" data-modal-action="quick-feed" data-pct="1">Tout</button>
        </div>

        <div class="card tight">
          <div class="row between"><span class="tiny dim">Gain d’XP</span><span class="mono small" style="color:var(--mint)" id="feedXpEcho">+0</span></div>
          <div class="row between" style="margin-top:5px"><span class="tiny dim">Niveau</span><span class="mono small" id="feedLevelEcho">${monster.level}</span></div>
        </div>
        <p class="tiny dim" style="margin-top:10px;line-height:1.5">Astuce : les expéditions rapportent de la biomasse ; la nourrir est le moyen le plus direct d’ouvrir des sockets.</p>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Annuler</button>
        <button class="btn primary" type="button" data-modal-action="confirm-feed">Nourrir</button>
      </div>
    `);

    this.updateFeedPreview();
  }

  updateFeedPreview() {
    const input = this.el.modalRoot.querySelector('#feedBiomassInput');
    const monster = this.game.selectedMonster;
    if (!input || !monster) return;
    const amount = Math.max(0, Math.floor(Number(input.value) || 0));
    const xp = Math.floor(amount / BALANCE.feedRate);
    let level = monster.level || 1;
    let xpLeft = (monster.xp || 0) + xp;
    while (xpLeft >= nextLevelXp(level) && level < 60) {
      xpLeft -= nextLevelXp(level);
      level++;
    }
    const xpEcho = this.el.modalRoot.querySelector('#feedXpEcho');
    const levelEcho = this.el.modalRoot.querySelector('#feedLevelEcho');
    if (xpEcho) xpEcho.textContent = `+${formatNumber(xp)} XP`;
    if (levelEcho) levelEcho.textContent = level > (monster.level || 1)
      ? `Niv. ${monster.level} → ${level}`
      : `Niv. ${level}`;
  }

  openBodyModal() {
    const state = this.game.state;
    const slotsLeft = BALANCE.labSlots - state.monsters.length;

    const cards = BODY_KEYS.map(bodyId => {
      const body = BODIES[bodyId];
      const unlocked = state.unlocks.bodies.includes(bodyId);
      const canAfford = state.resources.biomass >= body.createCost.biomass &&
                        state.resources.shards >= body.createCost.shards;
      const canUnlock = state.resources.biomass >= body.unlockCost.biomass &&
                        state.resources.shards >= body.unlockCost.shards;

      const action = unlocked
        ? `<button class="btn tiny ${canAfford && slotsLeft > 0 ? 'primary' : 'ghost'}" type="button" data-modal-action="create-body" data-body="${bodyId}" ${canAfford && slotsLeft > 0 ? '' : 'disabled'}>Créer</button>`
        : `<button class="btn tiny ${canUnlock ? 'violet' : 'ghost'}" type="button" data-modal-action="unlock-body" data-body="${bodyId}" ${canUnlock ? '' : 'disabled'}>Débloquer</button>`;

      const costs = unlocked
        ? `<span>${icon('biomass', 10)} ${formatNumber(body.createCost.biomass)}</span>${body.createCost.shards ? `<span>${icon('shards', 10)} ${formatNumber(body.createCost.shards)}</span>` : ''}`
        : `<span>${icon('biomass', 10)} ${formatNumber(body.unlockCost.biomass)}</span>${body.unlockCost.shards ? `<span>${icon('shards', 10)} ${formatNumber(body.unlockCost.shards)}</span>` : ''}`;

      return `<div class="body-card ${unlocked ? '' : 'locked'}">
        <span class="body-avatar" style="--hue:${Math.round(body.hue * 360)}">${icon(body.icon, 20)}</span>
        <span class="body-main">
          <b>${esc(body.label)}</b>
          <p>${esc(body.desc)}</p>
          <span class="body-costs">${costs}</span>
        </span>
        <span class="body-actions">${action}</span>
      </div>`;
    }).join('');

    this.openModal(`
      ${this.modalHead('Bain de culture', 'Nouveau spécimen', `${slotsLeft} emplacement(s) libre(s) sur ${BALANCE.labSlots}`)}
      <div class="modal-body">
        ${cards}
        <p class="tiny dim" style="margin-top:12px;line-height:1.5">Un nouveau corps débloque des sockets et des attributs de base. Les parties restent dans l’inventaire commun du laboratoire.</p>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Fermer</button>
      </div>
    `);
  }

  openRenameModal() {
    const monster = this.game.selectedMonster;
    if (!monster) return;
    this.openModal(`
      ${this.modalHead('Identité', 'Renommer le spécimen')}
      <div class="modal-body">
        <div class="field">
          <label for="renameInput">Nom du monstre</label>
          <input class="input" id="renameInput" maxlength="24" value="${esc(monster.name)}" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Annuler</button>
        <button class="btn primary" type="button" data-modal-action="confirm-rename">Valider</button>
      </div>
    `);
  }

  openHelpModal() {
    const online = this.net?.online;
    this.openModal(`
      ${this.modalHead('Manuel', 'Comment jouer', 'Une boucle idle, six attributs, un marché.')}
      <div class="modal-body">
        <div class="help-step">
          <span class="help-num">1</span>
          <div><b>Récolte</b><p>Envoie un monstre en expédition. Sa puissance pondérée et sa voracité déterminent la biomasse ; sa perception et son ésotérisme, le butin.</p></div>
        </div>
        <div class="help-step">
          <span class="help-num">2</span>
          <div><b>Assemblage</b><p>Sélectionne une partie puis un socket lumineux sur le corps. Chaque greffe ajoute ses attributs. La capacité augmente d’un socket par niveau (4 + niveau).</p></div>
        </div>
        <div class="help-step">
          <span class="help-num">3</span>
          <div><b>Progression</b><p>Les expéditions rapportent de l’XP, de la biomasse et des éclats. Nourris tes monstres avec la biomasse pour gagner des niveaux, débloquer des sockets et des corps, puis ouvrir les zones suivantes.</p></div>
        </div>
        <div class="help-step">
          <span class="help-num">4</span>
          <div><b>Échange</b><p>Vends le surplus, achète la partie manquante. En ligne, le marché est partagé entre joueurs ; hors ligne, des collectionneurs simulés animent le comptoir.</p></div>
        </div>
        <div class="help-step">
          <span class="help-num">5</span>
          <div><b>Razzia</b><p>Scanne les laboratoires rivaux (PNJ ou joueurs) et envoie un monstre piller leurs ressources. Désigne un gardien pour défendre ton propre stockage ; il ne pourra plus partir en mission. Un échec fatigue le pilleur 4 minutes, sans rien détruire.</p></div>
        </div>

        <div class="card tight" style="margin-top:12px">
          <p class="eyebrow" style="margin-bottom:8px">Monde partagé</p>
          <p class="small" style="line-height:1.5;color:var(--muted)">
            ${online
              ? `Connecté au salon <b>${esc(this.net.serverName || 'CHIMÈRE')}</b>${this.net.onlineCount ? ` · ${this.net.onlineCount} chercheur(s) en ligne` : ''}. Marché et razzias sont partagés.`
              : 'Mode local. Le jeu fonctionne seul avec un marché simulé et des labos PNJ. Lance <code class="mono" style="color:var(--mint)">node server.js</code> puis ouvre l’adresse affichée pour activer le marché et les razzias entre joueurs.'}
          </p>
          <div class="row" style="margin-top:9px">
            <button class="btn sm ${online ? 'ghost' : 'violet'}" type="button" data-modal-action="${online ? 'close' : 'go-online'}">
              ${online ? 'Fermer' : 'Se connecter au serveur'}
            </button>
            <button class="btn sm ghost" type="button" data-modal-action="rename-player">Changer de nom</button>
          </div>
        </div>

        <div class="card tight" style="margin-top:10px">
          <p class="eyebrow" style="margin-bottom:8px">Réglages</p>
          <p class="tiny dim" style="line-height:1.5">Sauvegarde locale automatique. La réinitialisation efface le laboratoire et repart de zéro.</p>
          <button class="btn sm danger" style="margin-top:9px" type="button" data-modal-action="reset-confirm">Réinitialiser la sauvegarde</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Compris</button>
      </div>
    `);
  }

  openResetConfirm() {
    this.openModal(`
      ${this.modalHead('Attention', 'Réinitialiser ?', 'Cette action efface définitivement le laboratoire local.')}
      <div class="modal-body">
        <p class="small" style="line-height:1.6;color:var(--muted)">
          Tous les monstres, parties, éclats, annonces et objectifs seront perdus. Le monde partagé du serveur n’est pas touché.
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Annuler</button>
        <button class="btn danger" type="button" data-modal-action="reset-confirm-2">Oui, tout effacer</button>
      </div>
    `);
  }

  openRenamePlayerModal() {
    this.openModal(`
      ${this.modalHead('Identité', 'Nom de chercheur', 'Visible sur le marché partagé.')}
      <div class="modal-body">
        <div class="field">
          <label for="playerNameInput">Nom</label>
          <input class="input" id="playerNameInput" maxlength="20" value="${esc(this.game.state.player.name)}" />
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-modal-action="close">Annuler</button>
        <button class="btn primary" type="button" data-modal-action="confirm-player-name">Valider</button>
      </div>
    `);
  }

  openRewardModal(event) {
    const { monster, zone, outcome, levels, converted } = event;
    const members = event.monsters || (monster ? [monster] : []);
    const memberLevels = event.memberLevels || [];
    const partsHtml = outcome.parts.map(part => `
      <div class="attach-row">
        <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 16)}</span>
        <span class="meta"><b>${esc(part.name)}</b><span>${RARITIES[part.rarity].label} · ${statText(part)}</span></span>
      </div>
    `).join('');

    this.openModal(`
      ${this.modalHead(
        'Butin récolté',
        zone.name,
        members.length > 1
          ? `Escouade de ${members.length} : ${members.map(m => m.name).join(', ')}.`
          : `${monster?.name || 'Le spécimen'} rentre au laboratoire.`
      )}
      <div class="modal-body">
        <div class="reward-burst">
          <div class="reward-big">${icon('biomass', 18)}<b>+${formatNumber(outcome.biomass)}</b><span>Biomasse</span></div>
          <div class="reward-big">${icon('shards', 18)}<b>+${formatNumber(outcome.shards)}</b><span>Éclats</span></div>
          <div class="reward-big">${icon('bolt', 18)}<b>+${formatNumber(outcome.xp)}</b><span>XP</span></div>
          <div class="reward-big">${icon('spark', 18)}<b>${formatNumber(outcome.power)}</b><span>Puissance</span></div>
        </div>
        <div class="chips" style="margin-bottom:8px">
          ${members.map(m => {
            const role = ROLES[m.role] || ROLES.harvester;
            return `<span class="chip" style="color:${role.color}">${icon(role.icon, 10)} ${esc(m.name)} · ${role.label}</span>`;
          }).join('')}
        </div>
        ${levels > 0
          ? `<div class="notice mint">${icon('bolt', 15)}<span><b>${levels} montée(s) de niveau</b>${memberLevels.length ? ` · ${memberLevels.map(m => `${m.name} → Nv.${m.level}`).join(' · ')}` : ''}</span></div>`
          : ''}
        ${converted ? `<div class="notice" style="margin-top:8px">${icon('info', 15)}<span>Inventaire plein : ${formatNumber(converted)} biomasse supplémentaires.</span></div>` : ''}
        <div class="loot-title"><span class="eyebrow">Parties trouvées</span><span class="line"></span><span class="tiny dim mono">${outcome.parts.length}</span></div>
        <div class="part-list">${partsHtml || '<div class="empty-state">Rien cette fois-ci.</div>'}</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Ranger le butin</button>
      </div>
    `);
  }

  openRecallRewardModal(result) {
    const { monsters, zone, progress, outcome, parts, memberLevels, dead, converted } = result;
    const partsHtml = (parts || []).map(part => `
      <div class="attach-row">
        <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 16)}</span>
        <span class="meta"><b>${esc(part.name)}</b><span>${RARITIES[part.rarity].label} · ${statText(part)}</span></span>
      </div>
    `).join('');

    const deadNames = dead ? monsters.filter(m => dead.includes(m.uid)).map(m => m.name).join(', ') : '';
    const isPartial = progress < 1;
    const deadCount = dead?.length || 0;

    this.openModal(`
      ${this.modalHead(
        isPartial ? 'Expédition rappelée' : 'Expédition terminée',
        zone.name,
        `${monsters.map(m => m.name).join(', ')} ${isPartial ? `rappelé(s) à ${Math.round(progress * 100)}%` : 'rentre au laboratoire'}.${deadCount ? ` ${deadCount} épuisé(s) : ${deadNames}` : ''}`
      )}
      <div class="modal-body">
        <div class="reward-burst">
          <div class="reward-big">${icon('biomass', 18)}<b>+${formatNumber(outcome.biomass)}</b><span>Biomasse</span></div>
          <div class="reward-big">${icon('shards', 18)}<b>+${formatNumber(outcome.shards)}</b><span>Éclats</span></div>
          <div class="reward-big">${icon('bolt', 18)}<b>+${formatNumber(outcome.xpEach)}</b><span>XP / spécimen</span></div>
        </div>
        <div class="chips" style="margin-bottom:8px">
          ${monsters.map(m => {
            const role = ROLES[m.role] || ROLES.harvester;
            const isDead = dead?.includes(m.uid);
            return `<span class="chip ${isDead ? 'dead' : ''}" style="color:${role.color}">${icon(role.icon, 10)} ${esc(m.name)} · ${role.label}${isDead ? ' ⚰' : ''}</span>`;
          }).join('')}
        </div>
        ${deadCount > 0
          ? `<div class="notice" style="margin-bottom:8px">${icon('skull', 15)}<span><b>${deadCount} spécimen(s) épuisé(s)</b> · ${deadNames} · Fatigue prolongée (1h).</span></div>`
          : ''}
        ${memberLevels && memberLevels.length > 0
          ? `<div class="notice mint">${icon('bolt', 15)}<span><b>${memberLevels.length} montée(s) de niveau</b> · ${memberLevels.map(m => `${m.name} → Nv.${m.level}`).join(' · ')}</span></div>`
          : ''}
        ${converted ? `<div class="notice" style="margin-top:8px">${icon('info', 15)}<span>Inventaire plein : ${formatNumber(converted)} biomasse supplémentaires.</span></div>` : ''}
        <div class="loot-title"><span class="eyebrow">Parties trouvées</span><span class="line"></span><span class="tiny dim mono">${(parts || []).length}</span></div>
        <div class="part-list">${partsHtml || '<div class="empty-state">Rien cette fois-ci.</div>'}</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Ranger le rapport</button>
      </div>
    `);
  }

  openBatchRewardModal(results) {
    const biomass = results.reduce((sum, r) => sum + r.outcome.biomass, 0);
    const shards = results.reduce((sum, r) => sum + r.outcome.shards, 0);
    const xp = results.reduce((sum, r) => sum + r.outcome.xp, 0);
    const parts = results.flatMap(r => r.outcome.parts);
    const converted = results.reduce((sum, r) => sum + (r.converted || 0), 0);
    const levelUps = results.reduce((sum, r) => sum + (r.levels || 0), 0);

    const partsHtml = parts.map(part => `
      <div class="attach-row">
        <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 16)}</span>
        <span class="meta"><b>${esc(part.name)}</b><span>${RARITIES[part.rarity].label} · ${statText(part)}</span></span>
      </div>`).join('');

    this.openModal(`
      ${this.modalHead('Récolte groupée', 'Tout le butin', `${results.length} expédition(s) terminée(s).`)}
      <div class="modal-body">
        <div class="reward-burst" style="grid-template-columns:repeat(3,1fr)">
          <div class="reward-big">${icon('biomass', 18)}<b>+${formatNumber(biomass)}</b><span>Biomasse</span></div>
          <div class="reward-big">${icon('shards', 18)}<b>+${formatNumber(shards)}</b><span>Éclats</span></div>
          <div class="reward-big">${icon('bolt', 18)}<b>+${formatNumber(xp)}</b><span>XP</span></div>
        </div>
        ${levelUps > 0 ? `<div class="notice mint">${icon('bolt', 15)}<span>${levelUps} montée(s) de niveau.</span></div>` : ''}
        ${converted ? `<div class="notice" style="margin-top:8px">${icon('info', 15)}<span>Inventaire plein : ${formatNumber(converted)} biomasse supplémentaires.</span></div>` : ''}
        <div class="loot-title"><span class="eyebrow">Parties trouvées</span><span class="line"></span><span class="tiny dim mono">${parts.length}</span></div>
        <div class="part-list">${partsHtml || '<div class="empty-state">Aucune partie cette fois.</div>'}</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Ranger le butin</button>
      </div>
    `);
  }

  openQuestRewardModal(event) {
    const { quest, parts, converted } = event;
    const partsHtml = parts.map(part => `
      <div class="attach-row">
        <span class="part-tile rar-${part.rarity}">${icon(PART_TYPES[part.type].icon, 16)}</span>
        <span class="meta"><b>${esc(part.name)}</b><span>${RARITIES[part.rarity].label} · ${statText(part)}</span></span>
      </div>`).join('');

    this.openModal(`
      ${this.modalHead('Objectif accompli', quest.title, quest.desc)}
      <div class="modal-body">
        <div class="reward-burst">
          <div class="reward-big">${icon('biomass', 18)}<b>+${formatNumber(quest.rewards.biomass || 0)}</b><span>Biomasse</span></div>
          <div class="reward-big">${icon('shards', 18)}<b>+${formatNumber(quest.rewards.shards || 0)}</b><span>Éclats</span></div>
        </div>
        ${converted ? `<div class="notice">${icon('info', 15)}<span>Inventaire plein : ${formatNumber(converted)} biomasse supplémentaires.</span></div>` : ''}
        <div class="loot-title"><span class="eyebrow">Récompenses</span><span class="line"></span></div>
        <div class="part-list">${partsHtml || '<div class="empty-state">Récompense en ressources.</div>'}</div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" type="button" data-modal-action="close">Récupérer</button>
      </div>
    `);
  }

  async handleModalAction(action, el) {
    const game = this.game;

    switch (action) {
      case 'close':
        this.closeModal();
        break;
      case 'select-modal': {
        const uid = el.dataset.uid;
        this.closeModal();
        this.setTab('assemblage');
        setTimeout(() => this.selectPart(uid), 30);
        break;
      }
      case 'detach-modal': {
        const monster = game.selectedMonster;
        if (!monster) return;
        const result = game.detachPart(monster.uid, el.dataset.uid);
        if (result.ok) {
          this.closeModal();
          this.toast('Greffe retirée', 'info');
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'sell-modal':
        this.closeModal();
        this.openSellModal('part', el.dataset.uid);
        break;
      case 'quick-price': {
        const input = this.el.modalRoot.querySelector('#sellPriceInput');
        if (input) {
          input.value = el.dataset.value;
          this.updateSellPreview();
        }
        break;
      }
      case 'quick-feed': {
        const input = this.el.modalRoot.querySelector('#feedBiomassInput');
        if (input) {
          const available = this.game.state.resources.biomass;
          const pctValue = Math.floor(available * Number(el.dataset.pct || 0));
          input.value = String(Math.max(10, pctValue));
          this.updateFeedPreview();
        }
        break;
      }
      case 'confirm-feed': {
        const input = this.el.modalRoot.querySelector('#feedBiomassInput');
        const monster = game.selectedMonster;
        if (!monster) return;
        const result = game.feedMonster(monster.uid, Number(input?.value));
        if (result.ok) {
          this.closeModal();
          this.toast(`+${formatNumber(result.xp)} XP absorbés`, 'success');
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'publish-sale':
        await this.publishSale(el.dataset.kind, el.dataset.uid);
        break;
      case 'unlock-body': {
        const result = game.unlockBody(el.dataset.body);
        if (result.ok) {
          this.openBodyModal();
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'create-body': {
        const result = game.createMonster(el.dataset.body);
        if (result.ok) {
          this.closeModal();
          this.toast(`${result.monster.name} est né.`, 'success');
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'confirm-rename': {
        const input = this.el.modalRoot.querySelector('#renameInput');
        const monster = game.selectedMonster;
        if (!monster) return;
        const result = game.renameMonster(monster.uid, input?.value);
        if (result.ok) {
          this.closeModal();
          this.toast('Spécimen renommé.', 'success');
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'rename-player':
        this.openRenamePlayerModal();
        break;
      case 'confirm-player-name': {
        const input = this.el.modalRoot.querySelector('#playerNameInput');
        const result = game.renamePlayer(input?.value);
        if (result.ok) {
          this.closeModal();
          this.toast('Nom mis à jour.', 'success');
        } else {
          this.toast(result.reason, 'warn');
        }
        break;
      }
      case 'go-online':
        this.closeModal();
        if (this.net) {
          this.net.connect()
            .catch(err => this.toast(err.message || 'Connexion impossible.', 'warn'));
        } else {
          this.toast('Serveur indisponible. Lance `node server.js`.', 'warn');
        }
        break;
      case 'reset-confirm':
        this.openResetConfirm();
        break;
      case 'reset-confirm-2':
        if (this.net?.online) {
          const result = await this.net.resetServer();
          if (!result.ok) {
            this.toast(result.reason || 'Réinitialisation impossible.', 'warn');
            return;
          }
        } else {
          game.reset();
        }
        this.closeModal();
        this.toast('Laboratoire réinitialisé.', 'info');
        break;
      default:
        break;
    }
  }

  async publishSale(kind, uid) {
    const input = this.el.modalRoot.querySelector('#sellPriceInput');
    const price = Math.max(1, Math.round(Number(input?.value) || 0));

    if (this.net?.online) {
      try {
        const result = await this.net.sell(kind, uid, price);
        if (!result.ok) {
          this.toast(result.reason || 'Publication impossible.', 'warn');
          return;
        }
        this.closeModal();
        this.toast(`Annonce publiée · ${formatNumber(price)} éclats`, 'success');
      } catch (err) {
        this.toast(err.message || 'Le marché ne répond pas.', 'warn');
      }
      return;
    }

    const result = kind === 'part'
      ? this.game.sellPart(uid, price)
      : this.game.sellMonster(uid, price);

    if (result.ok) {
      this.closeModal();
      this.toast(`Annonce publiée · ${formatNumber(price)} éclats`, 'success');
    } else {
      this.toast(result.reason, 'warn');
    }
  }

  setOnlineStatus(online, { count = 0, serverName = '' } = {}) {
    if (!this.net) return;
    this.net.online = online;
    this.net.onlineCount = count;
    this.net.serverName = serverName;
    this.renderSync();
    if (this.modalOpen) {
      // Rafraîchit l'aide si elle est ouverte.
      const helpVisible = this.el.modalRoot.querySelector('.help-step');
      if (helpVisible) this.openHelpModal();
    }
  }

  // -----------------------------------------------------------
  // TOASTS
  // -----------------------------------------------------------
  toast(text, kind = 'info') {
    if (!text) return;
    const icons = {
      success: 'check',
      warn: 'info',
      level: 'bolt',
      ready: 'bell',
      info: 'info'
    };
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.kind = kind;
    node.innerHTML = `${icon(icons[kind] || 'info', 16)}<span>${esc(text)}</span>`;
    this.el.toastStack.appendChild(node);

    while (this.el.toastStack.children.length > 4) {
      this.el.toastStack.firstElementChild?.remove();
    }

    setTimeout(() => {
      node.classList.add('leaving');
      setTimeout(() => node.remove(), 240);
    }, kind === 'warn' ? 4800 : 3600);
  }
}

function statsPerPart(monster) {
  return monster.attachments.reduce((sum, a) => sum + partTotalStats(a.part), 0);
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h << 5) - h + String(str).charCodeAt(i);
    h |= 0;
  }
  return h;
}
