// =============================================================
// CHIMÈRE — Données de jeu
// Toutes les valeurs d'équilibrage vivent ici.
// =============================================================

export const SAVE_VERSION = 4;

// -------------------------------------------------------------
// ATTRIBUTS
// -------------------------------------------------------------
export const STAT_KEYS = ['force', 'perception', 'vitesse', 'resistance', 'esoterisme', 'voracite'];

export const STATS = {
  force: {
    label: 'Force', short: 'FOR', color: '#ff8a7a', icon: 'sword',
    desc: 'Domine les zones hostiles. Poids doublé au Ventre.'
  },
  perception: {
    label: 'Perception', short: 'PER', color: '#7cc7ff', icon: 'eye',
    desc: 'Augmente la quantité et la qualité du butin.'
  },
  vitesse: {
    label: 'Vitesse', short: 'VIT', color: '#ffe27a', icon: 'bolt',
    desc: 'Réduit la durée des expéditions (jusqu’à -50 %).'
  },
  resistance: {
    label: 'Résistance', short: 'RES', color: '#8fe6b0', icon: 'shield',
    desc: 'Puissance doublée dans les Dunes de sel.'
  },
  esoterisme: {
    label: 'Ésotérisme', short: 'ÉSO', color: '#c6a4ff', icon: 'spark',
    desc: 'Fait pencher le butin vers les raretés hautes.'
  },
  voracite: {
    label: 'Voracité', short: 'VOR', color: '#ffb066', icon: 'jaw',
    desc: 'Augmente la biomasse récoltée.'
  }
};

// -------------------------------------------------------------
// PARTIES DE CORPS
// yMin / yMax : zone du corps où la partie peut être greffée
// -------------------------------------------------------------
export const PART_TYPES = {
  eye: {
    label: 'Yeux', singular: 'Œil', icon: 'eye', gender: 'm',
    stats: { perception: 5, esoterisme: 1 },
    rule: { yMin: 0.08, yMax: 1, max: 8, scale: 1.02, sink: 0.12 },
    blurb: 'Ouvre des yeux partout. Le butin se montre.'
  },
  horn: {
    label: 'Cornes', singular: 'Corne', icon: 'horn', gender: 'f',
    stats: { force: 4, resistance: 2 },
    rule: { yMin: 0.35, yMax: 1, max: 6, scale: 1.5, sink: 0.1 },
    blurb: 'La force brute, plantée dans l’os.'
  },
  claw: {
    label: 'Griffes', singular: 'Griffe', icon: 'claw', gender: 'f',
    stats: { force: 4, vitesse: 1 },
    rule: { yMin: -0.45, yMax: 0.5, max: 6, scale: 1.5, sink: 0.1 },
    blurb: 'Coupe, creuse, accélère.'
  },
  tentacle: {
    label: 'Tentacules', singular: 'Tentacule', icon: 'tentacle', gender: 'm',
    stats: { vitesse: 3, voracite: 2 },
    rule: { yMin: -1, yMax: 0.02, max: 8, scale: 1.5, sink: 0.12 },
    blurb: 'Ramasse tout ce qui traîne. Vite.'
  },
  crystal: {
    label: 'Cristaux', singular: 'Cristal', icon: 'crystal', gender: 'm',
    stats: { esoterisme: 5, resistance: 1 },
    rule: { yMin: -0.2, yMax: 0.9, max: 6, scale: 1.5, sink: 0.1 },
    blurb: 'Un fragment de quelque chose qui rêve.'
  },
  wing: {
    label: 'Ailes', singular: 'Aile', icon: 'wing', gender: 'f',
    stats: { vitesse: 5, perception: 1 },
    rule: { yMin: -0.15, yMax: 0.65, max: 4, scale: 1.6, sink: 0.02 },
    blurb: 'Le vent porte les expéditions.'
  },
  spike: {
    label: 'Épines', singular: 'Épine', icon: 'spike', gender: 'f',
    stats: { resistance: 5, force: 1 },
    rule: { yMin: -0.6, yMax: 1, max: 8, scale: 1.3, sink: 0.1 },
    blurb: 'Ce qui ne se laisse pas manger.'
  },
  mouth: {
    label: 'Gueules', singular: 'Gueule', icon: 'mouth', gender: 'f',
    stats: { voracite: 5, force: 1 },
    rule: { yMin: -0.35, yMax: 0.45, max: 4, scale: 1.2, sink: 0.02 },
    blurb: 'Une faim qui a des dents.'
  },
  hole: {
    label: 'Orbites', singular: 'Orbite', icon: 'hole', gender: 'f',
    stats: { esoterisme: 3, voracite: 2 },
    rule: { yMin: -0.55, yMax: 0.8, max: 6, scale: 1, sink: 0 },
    blurb: 'Un trou par lequel le Vide regarde.'
  },
  ear: {
    label: 'Oreilles', singular: 'Oreille', icon: 'ear', gender: 'f',
    stats: { perception: 3, vitesse: 2 },
    rule: { yMin: 0.15, yMax: 1, max: 4, scale: 1.2, sink: 0.03 },
    blurb: 'Entend les gisements avant tout le monde.'
  },
  torse: {
    label: 'Torses', singular: 'Torse', icon: 'spike', gender: 'm',
    stats: { force: 6, resistance: 4, voracite: 2 },
    rule: { yMin: -0.5, yMax: 1, max: 4, scale: 1.6, sink: 0.15 },
    blurb: 'Un torse renforcé pour supporter plus de greffes.'
  },
  base: {
    label: 'Bases de corps', singular: 'Base de corps', icon: 'colosse', gender: 'f',
    stats: { resistance: 8, force: 4, voracite: 3 },
    rule: { yMin: -1, yMax: 1, max: 2, scale: 2.0, sink: 0.2 },
    blurb: 'Une base de corps solide qui change toute l\'allure du spécimen.'
  }
};

export const PART_TYPE_KEYS = Object.keys(PART_TYPES);

// -------------------------------------------------------------
// RÔLES DE SPÉCIMEN
// Chaque rôle privilégie une activité. Changer de rôle est gratuit
// au laboratoire, mais impossible en mission.
// -------------------------------------------------------------
export const ROLE_KEYS = ['harvester', 'raider', 'guardian', 'scout'];

export const ROLES = {
  harvester: {
    label: 'Récolteur', short: 'RÉC', icon: 'biomass', color: '#74f5c3',
    desc: 'Rend +25 % de biomasse en expédition, mais frappe moins fort en razzia.',
    expedition: 1.25, raid: 0.8, defense: 0.9, speed: 1, loot: 1.1, cargo: 0.9
  },
  raider: {
    label: 'Pilleur', short: 'PIL', icon: 'skull', color: '#ff8a7a',
    desc: 'Rend +30 % d’attaque et +20 % de cargo en razzia, moins en expédition.',
    expedition: 0.8, raid: 1.3, defense: 0.85, speed: 1, loot: 0.9, cargo: 1.2
  },
  guardian: {
    label: 'Gardien', short: 'GAR', icon: 'shield', color: '#7cc7ff',
    desc: 'Rend +35 % de défense au laboratoire. Moins efficace en mission.',
    expedition: 0.7, raid: 0.75, defense: 1.35, speed: 1, loot: 1, cargo: 0.9
  },
  scout: {
    label: 'Éclaireur', short: 'ÉCL', icon: 'compass', color: '#ffe27a',
    desc: 'Réduit les trajets de 25 % et améliore les trouvailles, avec moins de cargo.',
    expedition: 1, raid: 1, defense: 0.95, speed: 0.75, loot: 1.2, cargo: 0.85
  }
};

// -------------------------------------------------------------
// DÉFENSES DU LABORATOIRE
// Chaque rang ajoute son bonus à la défense du laboratoire.
// -------------------------------------------------------------
export const LAB_DEFENSES = [
  { biomass: 180, shards: 60, defense: 18 },
  { biomass: 320, shards: 130, defense: 22 },
  { biomass: 600, shards: 260, defense: 28 }
];

// -------------------------------------------------------------
// RARETÉS
// -------------------------------------------------------------
export const RARITY_KEYS = ['common', 'rare', 'epic', 'mythic'];

export const RARITIES = {
  common: {
    label: 'Commun', icon: '○', color: '#9aa7bc', mult: 1,
    priceMult: 1, weight: 1, rank: 0,
    suffixes: ['de cendre', 'de boue', 'de sel', 'de mousse']
  },
  rare: {
    label: 'Rare', icon: '◆', color: '#5cb6ff', mult: 1.55,
    priceMult: 1.35, weight: 1, rank: 1,
    suffixes: ['de verre', 'd’os', 'de cuivre', 'de givre']
  },
  epic: {
    label: 'Épique', icon: '✦', color: '#c48bff', mult: 2.3,
    priceMult: 1.95, weight: 1, rank: 2,
    suffixes: ['des abysses', 'de nébuleuse', 'de quartz', 'd’obsidienne']
  },
  mythic: {
    label: 'Mythique', icon: '✺', color: '#ffb35c', mult: 3.5,
    priceMult: 2.9, weight: 1, rank: 3,
    suffixes: ['du Vide', 'de l’Aube', 'du Néant', 'de l’Origine']
  }
};

// -------------------------------------------------------------
// CORPS DE BASE
// -------------------------------------------------------------
export const BODY_KEYS = ['larve', 'colosse', 'spectre'];

export const BODIES = {
  larve: {
    label: 'Masse primordiale', icon: 'larve', geo: 'blob', hue: 0.74,
    sockets: 24,
    stats: { force: 1, perception: 1, vitesse: 1, resistance: 1, esoterisme: 1, voracite: 1 },
    createCost: { biomass: 120, shards: 0 },
    unlockCost: { biomass: 0, shards: 0 },
    desc: 'La base équilibrée du laboratoire. 24 sockets, aucune spécialité.',
    blurb: 'Souple, tolérante, prête à tout.'
  },
  colosse: {
    label: 'Colosse ossieux', icon: 'colosse', geo: 'tank', hue: 0.085,
    sockets: 22,
    stats: { force: 8, perception: 0, vitesse: -1, resistance: 9, esoterisme: 0, voracite: 2 },
    createCost: { biomass: 220, shards: 40 },
    unlockCost: { biomass: 800, shards: 160 },
    desc: 'Une montagne d’os. 22 sockets, force et résistance massives.',
    blurb: 'Lent. Inarrêtable.'
  },
  spectre: {
    label: 'Spectre nébuleux', icon: 'spectre', geo: 'wisp', hue: 0.52,
    sockets: 26,
    stats: { force: 0, perception: 7, vitesse: 4, resistance: 0, esoterisme: 9, voracite: 1 },
    createCost: { biomass: 320, shards: 90 },
    unlockCost: { biomass: 2200, shards: 420 },
    desc: 'Un corps qui n’obéit pas tout à fait aux lois. 26 sockets.',
    blurb: 'Perception et ésotérisme. Les fonds lui parlent.'
  }
};

// -------------------------------------------------------------
// ZONES D'EXPÉDITION
// -------------------------------------------------------------
export const ZONES = [
  {
    id: 'fosses',
    name: 'Fosses fongiques',
    tag: 'I',
    desc: 'Des champignons gros comme des maisons. Tout est comestible, presque.',
    duration: 60,
    req: 18,
    biomass: 160,
    xp: 15,
    favored: 'voracite',
    unlockPower: 0,
    hue: 0.28,
    weights: { force: 0.8, perception: 0.8, vitesse: 0.8, resistance: 0.8, esoterisme: 0.8, voracite: 1.9 },
    rarityWeights: { common: 70, rare: 25, epic: 5, mythic: 0 },
    lootMax: 2,
    danger: 'Aucune'
  },
  {
    id: 'sel',
    name: 'Dunes de sel',
    tag: 'II',
    desc: 'Le vent racle les carapaces. Ce qui survit ici est solide.',
    duration: 300,
    req: 60,
    biomass: 680,
    xp: 42,
    favored: 'resistance',
    unlockPower: 32,
    hue: 0.095,
    weights: { force: 0.8, perception: 0.8, vitesse: 0.7, resistance: 2.0, esoterisme: 0.7, voracite: 0.9 },
    rarityWeights: { common: 48, rare: 37, epic: 13, mythic: 2 },
    lootMax: 2,
    danger: 'Faible'
  },
  {
    id: 'verre',
    name: 'Crevasse vitreuse',
    tag: 'III',
    desc: 'Un canyon de verre noir. Les reflets montrent des choses qui bougent.',
    duration: 900,
    req: 150,
    biomass: 2100,
    xp: 105,
    favored: 'perception',
    unlockPower: 95,
    hue: 0.56,
    weights: { force: 0.8, perception: 2.0, vitesse: 0.8, resistance: 0.8, esoterisme: 1.2, voracite: 0.8 },
    rarityWeights: { common: 20, rare: 40, epic: 31, mythic: 9 },
    lootMax: 3,
    danger: 'Modérée'
  },
  {
    id: 'nebuleuse',
    name: 'Nébuleuse morte',
    tag: 'IV',
    desc: 'Une mer de gaz refroidi où flottent des morceaux de dieux.',
    duration: 2700,
    req: 360,
    biomass: 6400,
    xp: 260,
    favored: 'esoterisme',
    unlockPower: 250,
    hue: 0.74,
    weights: { force: 0.7, perception: 1.1, vitesse: 0.8, resistance: 0.7, esoterisme: 2.1, voracite: 0.8 },
    rarityWeights: { common: 7, rare: 29, epic: 43, mythic: 21 },
    lootMax: 3,
    danger: 'Élevée'
  },
  {
    id: 'ventre',
    name: 'Le Ventre',
    tag: 'V',
    desc: 'Quelque chose de vivant, à l’échelle d’un continent. Il digère encore.',
    duration: 7200,
    req: 780,
    biomass: 19000,
    xp: 620,
    favored: 'force',
    unlockPower: 580,
    hue: 0.015,
    weights: { force: 2.1, perception: 0.8, vitesse: 0.7, resistance: 1.1, esoterisme: 0.9, voracite: 1.2 },
    rarityWeights: { common: 0, rare: 18, epic: 46, mythic: 36 },
    lootMax: 4,
    danger: 'Mortelle'
  }
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map(z => [z.id, z]));

// -------------------------------------------------------------
// OBJECTIFS
// -------------------------------------------------------------
export const QUESTS = [
  {
    id: 'first-run',
    title: 'Premier souffle',
    desc: 'Terminer une expédition et récolter son butin.',
    metric: 'expeditionsDone',
    goal: 1,
    rewards: { biomass: 120, shards: 40, loot: [{ rarity: 'common', count: 1 }] },
    icon: 'compass'
  },
  {
    id: 'chimera',
    title: 'Petite chimère',
    desc: 'Assembler 5 parties sur un même monstre.',
    metric: 'maxAttachments',
    goal: 5,
    rewards: { biomass: 0, shards: 120, loot: [{ rarity: 'rare', count: 1 }] },
    icon: 'dna'
  },
  {
    id: 'merchant',
    title: 'Première vente',
    desc: 'Vendre une partie ou un monstre sur le marché.',
    metric: 'sales',
    goal: 1,
    rewards: { biomass: 0, shards: 220, loot: [] },
    icon: 'coin'
  },
  {
    id: 'power-150',
    title: 'Spécimen viable',
    desc: 'Atteindre 150 de puissance avec un monstre.',
    metric: 'bestPower',
    goal: 150,
    rewards: { biomass: 200, shards: 150, loot: [{ rarity: 'epic', count: 1 }] },
    icon: 'bolt'
  },
  {
    id: 'crevasse',
    title: 'Le verre se souvient',
    desc: 'Terminer une expédition dans la Crevasse vitreuse.',
    metric: 'verreRuns',
    goal: 1,
    rewards: { biomass: 300, shards: 400, loot: [{ rarity: 'rare', count: 1 }] },
    icon: 'eye'
  },
  {
    id: 'nutrition',
    title: 'Appétit sans fond',
    desc: 'Nourrir un spécimen avec 600 biomasse.',
    metric: 'biomassFed',
    goal: 600,
    rewards: { biomass: 0, shards: 180, loot: [{ rarity: 'rare', count: 1 }] },
    icon: 'jaw'
  },
  {
    id: 'first-raid',
    title: 'Première razzia',
    desc: 'Gagner un raid contre un laboratoire rival.',
    metric: 'raidsWon',
    goal: 1,
    rewards: { biomass: 150, shards: 250, loot: [{ rarity: 'rare', count: 1 }] },
    icon: 'skull'
  }
];

// -------------------------------------------------------------
// ÉQUILIBRAGE GLOBAL
// -------------------------------------------------------------
export const BALANCE = {
  saveKey: 'chimere.save.v4',
  playerKey: 'chimere.player',
  inventoryMax: 80,
  labSlots: 5,
  marketSlots: 6,
  marketDuration: 20 * 60 * 1000,
  marketBotDelayMin: 30 * 1000,
  marketBotDelayMax: 95 * 1000,
  marketTax: 0.05,
  levelStatBonus: 0.02,
  startBiomass: 420,
  startShards: 160,
  durationSpeedDivisor: 300,
  minDurationFactor: 0.5,
  feedRate: 4,
  xpCurveBase: 60,
  xpCurveExp: 1.25
};

export const RARITY_COLORS = Object.fromEntries(
  RARITY_KEYS.map(k => [k, RARITIES[k].color])
);
