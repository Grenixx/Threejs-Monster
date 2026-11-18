# CHIMÈRE — la boucle de jeu

> Un laboratoire de monstres à assembler. On récolte des parties, on greffe,
> on nourrit, on expédie, on échange — et on pille les labos rivaux.
> Idle asynchrone, jouable en 30 secondes, pensé mobile d'abord, avec un
> marché et des razzias partagés entre joueurs.

---

## 1. Le pitch

À la frontière d'un monde mort, un laboratoire de fortune cultive des
**chimères** : des corps assemblés à partir de morceaux récupérés dans des
expéditions. Chaque partie greffée donne des attributs. Chaque expédition
rapporte de la biomasse, des éclats, de l'expérience et de nouvelles parties.

Le joueur ne « clique » pas pour gagner : il **prépare** un spécimen, l'envoie
travailler, revient, récolte, réassemble. La boucle est courte, lisible, et
laisse toujours une prochaine action utile — même hors ligne.

**Piliers**

1. **Drop** — des parties de corps (yeux, cornes, tentacules, ailes…).
2. **Builder** — assemblage 3D libre sur un corps à sockets.
3. **Attributs** — chaque partie pèse sur six stats et sur le rendement.
4. **Idle** — expéditions chronométrées, butin au retour, progression hors ligne.
5. **Trade** — marché asynchrone entre joueurs, avec liquidité PNJ.
6. **Razzia** — attaquer un laboratoire rival, voler des ressources, poser un gardien.

---

## 2. La boucle

```
                       ┌──────────────────────────────┐
                       │         EXPÉDITION           │
                       │  biomasse · éclats · XP      │
                       │  parties (drop)              │
                       └──────────────┬───────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │                                               │
              ▼                                               ▼
   ┌─────────────────────┐                         ┌─────────────────────┐
   │      ASSEMBLAGE     │                         │       MARCHÉ        │
   │  choisir une partie │                         │  vendre le surplus  │
   │  choisir un socket  │                         │  acheter le manque  │
   └──────────┬──────────┘                         └──────────┬──────────┘
              │                                               │
              ▼                                               │
   ┌─────────────────────┐                                    │
   │      ATTRIBUTS      │                                    │
   │   FOR · PER · VIT   │◄───────────────────────────────────┘
   │   RES · ÉSO · VOR   │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │    NOURRIR / XP     │  biomasse → niveau → sockets
   │  capacité + stats   │
   └──────────┬──────────┘
              │
              ▼
   ┌─────────────────────┐
   │  ZONES PLUS DURES   │  déblocage par record de puissance
   │  MEILLEURES PARTIES │
   └──────────┬──────────┘
              │
              └──────────────► retour à l'expédition
```

Une **seconde sortie** utilise les mêmes attributs : la **razzia**. Au lieu de
récolter, le monstre part piller un laboratoire PNJ ou le stockage d'un autre
joueur. La force et la vitesse décident de l'attaque ; la résistance et la
voracité d'un **gardien** décident de la défense. On ne perd jamais de partie
ni de monstre : on vole des ressources, et un échec fatigue le spécimen.

### Une session type

| Durée | Action |
|---|---|
| 10 s | Ouvrir le labo, voir le timer, récolter une expédition finie. |
| 30 s | Lancer une expédition, greffer une partie fraîche, réclamer un objectif. |
| 1 min | Scanner les cibles, lancer une razzia, nommer un gardien. |
| 2 min | Vider l'inventaire sur le marché, acheter une partie qui complète un build. |
| Hors ligne | Les expéditions et razzias continuent ; les annonces peuvent se vendre. |
| Retour | Récolte en lot, rapport de razzia, montée de niveau, nouveaux sockets. |

### Les trois échelles de temps

- **Tactique (secondes)** : choisir quel socket, quel monstre, quel gardien, quelle cible.
- **Session (minutes)** : expéditions de 1 à 15 minutes, razzias de 2-3 minutes, annonces.
- **Long terme (heures/jours)** : corps rares, parties mythiques, défense du labo, Le Ventre.

---

## 3. Les six attributs

Chaque attribut a **un rôle direct** et **une zone qui le favorise**.

| Attribut | Rôle | Zone favorite |
|---|---|---|
| **Force** (FOR) | Puissance brute, rendement au Ventre | Le Ventre |
| **Perception** (PER) | Nombre de parties trouvées, butin | Crevasse vitreuse |
| **Vitesse** (VIT) | Réduit la durée des expéditions (jusqu'à −50 %) | Toutes |
| **Résistance** (RES) | Puissance pondérée dans les environnements hostiles | Dunes de sel |
| **Ésotérisme** (ÉSO) | Fait pencher le butin vers les raretés hautes | Nébuleuse morte |
| **Voracité** (VOR) | Bonus direct de biomasse récoltée | Fosses fongiques |

La **puissance** affichée est la somme brute des six stats. En expédition, le
jeu utilise une **puissance pondérée** : la stat favorite de la zone compte
environ ×2, les autres entre ×0,7 et ×1,2. C'est ce qui rend chaque zone
« build-specific » sans bloquer le joueur.

En **razzia**, les rôles se resserrent : FOR et VIT portent l'attaque ; RES,
FOR et VOR portent la défense d'un gardien. Un même monstre ne peut donc pas
être à la fois un excellent pilleur et un mur défensif — d'où l'intérêt
d'élever plusieurs spécimens.

---

## 4. Parties & raretés

### Types de parties

| Partie | Stats de base (commun) | Zone de greffe | Max |
|---|---|---|---|
| Œil | +5 PER, +1 ÉSO | haut du corps | 8 |
| Corne | +4 FOR, +2 RES | haut | 6 |
| Griffe | +4 FOR, +1 VIT | milieu | 6 |
| Tentacule | +3 VIT, +2 VOR | bas | 8 |
| Cristal | +5 ÉSO, +1 RES | milieu/haut | 6 |
| Aile | +5 VIT, +1 PER | milieu | 4 |
| Épine | +5 RES, +1 FOR | tout | 8 |
| Gueule | +5 VOR, +1 FOR | milieu | 4 |
| Orbite | +3 ÉSO, +2 VOR | tout | 6 |
| Oreille | +3 PER, +2 VIT | haut | 4 |

Chaque instance a une **graine visuelle** et une **variance de stats** (±12 %).
Deux « Yeux de sel » ne sont donc jamais tout à fait identiques.

### Raretés

| Rareté | Multiplicateur de stats | Prix indicatif |
|---|---|---|
| Commun | ×1,00 | ×1,00 |
| Rare | ×1,55 | ×1,35 |
| Épique | ×2,30 | ×1,95 |
| Mythique | ×3,50 | ×2,90 |

Le prix conseillé d'une partie est `(30 + totalStats × 5) × multiplicateur de rareté`.
Le joueur fixe librement son prix ; des collectionneurs achètent vite en dessous
de ~130 % du prix conseillé, sinon l'annonce expire et l'objet revient.

---

## 5. Corps & capacité

| Corps | Sockets | Stats de base | Création | Déblocage |
|---|---|---|---|---|
| **Larve primordiale** | 24 | +1 partout | 120 biomasse | offert |
| **Colosse ossieux** | 22 | +8 FOR, +9 RES, +2 VOR, −1 VIT | 220 biomasse + 40 éclats | 800 biomasse + 160 éclats |
| **Spectre nébuleux** | 26 | +7 PER, +4 VIT, +9 ÉSO, +1 VOR | 320 biomasse + 90 éclats | 2 200 biomasse + 420 éclats |

**Capacité de greffe** : `min(sockets du corps, 4 + niveau)`.

Chaque niveau donne aussi **+2 % sur tous les attributs** (arrondi). Monter de
niveau est donc doublement utile : plus de sockets *et* des stats multipliées.

**Nourrir** : 4 biomasse = 1 XP ; minimum 10 biomasse par action. C'est le
principal puits de biomasse et le moyen direct d'ouvrir des sockets.

---

## 6. Zones d'expédition

| # | Zone | Durée | Req. PWR | Déblocage | Biomasse | XP | Favori | Loot max |
|---|---|---|---|---|---|---|---|---|
| I | Fosses fongiques | 60 s | 18 | 0 | 160 | 15 | Voracité | 2 |
| II | Dunes de sel | 5 min | 60 | 32 PWR | 680 | 42 | Résistance | 2 |
| III | Crevasse vitreuse | 15 min | 150 | 95 PWR | 2 100 | 105 | Perception | 3 |
| IV | Nébuleuse morte | 45 min | 360 | 250 PWR | 6 400 | 260 | Ésotérisme | 3 |
| V | Le Ventre | 2 h | 780 | 580 PWR | 19 000 | 620 | Force | 4 |

Le **déblocage** se fait sur le record de puissance du joueur ; le **requis**
sert au rendement. Lancer une zone sous-équipée reste possible : le rendement
est simplement réduit (plancher à 35 %), ce qui évite de bloquer un joueur.

### Raretés par zone

| Zone | Commun | Rare | Épique | Mythique |
|---|---|---|---|---|
| Fosses | 70 % | 25 % | 5 % | — |
| Dunes | 48 % | 37 % | 13 % | 2 % |
| Crevasse | 20 % | 40 % | 31 % | 9 % |
| Nébuleuse | 7 % | 29 % | 43 % | 21 % |
| Ventre | — | 18 % | 46 % | 36 % |

L'Ésotérisme du monstre augmente le poids des raretés hautes.

---

## 7. Formules (référence d'équilibrage)

```
Stats monstre   = corps + Σ parties, × (1 + 0,02 × (niveau − 1))
Puissance       = Σ stats
Capacité        = min(sockets, 4 + niveau)
Durée           = duréeZone / (1 + VIT / 300), minimum 50 % de la durée de base
Biomasse        = baseZone × clamp(Pz / req, 0,35 ; 3) × (1 + VOR/120) × (1 + 0,02 × (niveau−1))
Éclats          = baseZone × 0,11 × ratio × (1 + ÉSO/250)
XP              = xpZone
Nourrir         = floor(biomasse / 4) XP
Prix partie     = (30 + Σ stats × 5) × multiplicateur de rareté
```

**Loot** :

1. 1 partie garantie par expédition.
2. 2e partie avec une probabilité `20 % + PER/320` (plafond 85 %).
3. 3e partie si `PER ≥ 120`, avec une probabilité `PER/520` (plafond 60 %).
4. Le nombre est plafonné par `lootMax` de la zone (2 à 4).

**Razzia** :

```
ATK            = 2,4 FOR + 1,8 VIT + 1,0 PER + 0,8 ÉSO + 0,5 RES + 1,2 VOR + 3 × niveau
DEF gardien    = 2,2 RES + 1,6 FOR + 1,2 VOR + 0,8 PER + 0,5 ÉSO + 3 × niveau
DEF labo       = 15 + 0,7 × recordPWR + 0,85 × DEF gardien
Cargo          = 80 + 8 VOR + 10 × niveau + 2 FOR
Durée          = 150 / (1 + VIT / 400), minimum 60 s
Jet            = 0,85 + aléatoire × 0,35
Victoire       = ATK × jet ≥ DEF, ou 8 % de chance d'exploit
Part volée     = min(cargo, ressources × clamp(0,07 + marge × 0,10 ; 0,07 ; 0,22))
Échec          = 0 butin, XP de consolation, fatigue 4 min
```

Les éclats volés sont plafonnés à `cargo × 0,35` ; la biomasse au cargo complet.
Aucune partie, aucun monstre n'est détruit. Un gardien ne peut pas partir en
mission ; il ajoute sa DEF au laboratoire et reste visible dans le roster.

---

## 8. Économie

Deux monnaies seulement, pour rester lisible :

- **Biomasse** : nourrir les monstres, créer des corps, débloquer des plans.
- **Éclats** : marché, plans de corps, récompenses d'objectifs.

La biomasse ne sert jamais à acheter des parties : elle nourrit la progression.
Les éclats ne servent jamais à nourrir : ils font tourner le marché. Les deux
boucles restent distinctes, ce qui évite l'inflation croisée.

**Sources** : expéditions, objectifs, ventes, razzias réussies.
**Puits** : nourriture, création de corps, plans, achats au marché, taxe de 5 %,
pertes subies lors des razzias.

### Objectifs (premiers pas)

| Objectif | Condition | Récompense |
|---|---|---|
| Premier souffle | 1 expédition | 120 biomasse, 40 éclats, 1 commun |
| Petite chimère | 5 greffes sur un monstre | 120 éclats, 1 rare |
| Première vente | 1 vente | 220 éclats |
| Spécimen viable | 150 PWR | 200 biomasse, 150 éclats, 1 épique |
| Le verre se souvient | 1 expédition Crevasse | 300 biomasse, 400 éclats, 1 rare |
| Appétit sans fond | 600 biomasse nourrie | 180 éclats, 1 rare |
| Première razzia | Gagner 1 raid | 150 biomasse, 250 éclats, 1 rare |

Les objectifs donnent une **direction** aux 30 premières minutes, puis
s'effacent derrière le marché, les zones et les razzias.

---

## 9. Rythme de progression

Simulation d'une créature seule, expéditions enchaînées, sans marché ni
nourriture (donc pessimiste) :

```
départ : Nv.1 · 35 PWR · 5 greffes
 50 min : Nv.3 ·  62 PWR · 7 greffes · Dunes de sel
110 min : Nv.5 · 100 PWR · 9 greffes · Crevasse vitreuse
245 min : Nv.7 · 141 PWR · 11 greffes · Crevasse vitreuse
```

Repères voulus :

- **0–10 min** : assembler les 5 premières parties, débloquer les Dunes, remplir
  le premier objectif.
- **30–60 min** : premier niveau significatif, achat/vente, plan du Colosse.
- **2–4 h** : parties épiques, Nébuleuse, spécialisation d'un monstre.
- **Jour 2–3** : mythiques, Le Ventre, plusieurs spécimens spécialisés.

Le multijoueur et la nourriture accélèrent ces repères (échanges de parties,
biomasse convertie en niveaux). Les durées hautes (45 min, 2 h) sont assumées :
ce sont des expéditions « à lancer avant de fermer l'onglet ».

---

## 10. Marché, razzias & multijoueur

### Les razzias (PvP asynchrone)

Depuis l'onglet **Expéditions → Razzias**, le joueur scanne des cibles :

- **Labos PNJ** : 6 réserves permanentes, de 38 à 248 de défense, avec des
  stocks de 650 à 9 000 biomasse. Elles garantissent un adversaire même seul.
- **Labos joueurs** : uniquement en ligne, avec leur gardien et leur défense
  réelle. Les ressources exactes ne sont pas exposées : seul un butin estimé
  (`~10 %`) est affiché.

Lancer une razzia verrouille le monstre pendant **150 s** (réduit par la VIT,
minimum 60 s). Au retour, le serveur résout le rapport, débite la cible et
crédite l'attaquant. En cas d'échec, le monstre est **fatigué 4 min** : il peut
être assemblé/nourri, mais plus envoyé en mission. Aucun monstre ni aucune
partie n'est détruit.

### Gardien & défense

Chaque laboratoire peut désigner **un gardien** parmi ses monstres présents.
Le gardien :

- ajoute sa défense au laboratoire (`2,2 RES + 1,6 FOR + 1,2 VOR + …`) ;
- ne peut plus partir en expédition ni en razzia ;
- ne peut pas être vendu au marché ;
- reste assemblé/nourri au labo.

La défense de base dépend du **record de puissance** du joueur, ce qui évite
de farmer éternellement les mêmes comptes faibles. Le gardien est visible sur
le roster et dans l'onglet Razzias.

### Tourelle de veille

Le laboratoire peut améliorer une tourelle en trois rangs. Chaque rang coûte
biomasse et éclats, puis ajoute +18, +22 et +28 DEF (bonus cumulés : +18, +40,
+68). La défense est prise en compte dans les cibles joueurs et figée au départ
d’une razzia, comme celle du gardien. Le niveau est conservé dans la sauvegarde.

### Deux modes, un seul jeu

**Hors ligne (par défaut)**
- Sauvegarde `localStorage`.
- Marché simulé : 6 annonces PNJ, achats/ventes, expiration.
- Razzias contre les 6 labos PNJ, résolues localement.
- Le jeu est 100 % fonctionnel sans serveur.

**En ligne (`node server.js`)**
- Sauvegarde côté serveur, miroir local.
- Marché **partagé** : les annonces de tous les joueurs connectés.
- Razzias **partagées** : les labos réels apparaissent dans le scan.
- Liquidité PNJ : le serveur garde 6 annonces et simule des collectionneurs
  pour que le marché reste vivant même à un seul joueur.
- Présence, ventes et razzias subies en temps réel via SSE.
- Transactions de marché et razzias atomiques côté serveur (retrait, achat,
  crédit, taxe, vol de ressources, fatigue).

### Flux d'une razzia

```
Client A                    Serveur                     Client B
   │  POST /raids/start        │                            │
   ├──────────────────────────►│ vérifie monstre/gardien   │
   │                           │ fige défense + cible       │
   │                           │                            │
   │  (150 s de trajet)        │                            │
   │  POST /raids/:id/claim    │                            │
   ├──────────────────────────►│ resolveRaid(seed)          │
   │                           │ débite B, crédite A        │
   │                           │ fatigue si échec           │
   │◄──── save + rapport ──────┤                            │
   │                           │──── SSE raid-incoming ────►│
   │                           │                            │ GET /save
```

### API raids (serveur)

```
GET  /api/raids/targets   cibles PNJ + joueurs (sans ressources exactes)
GET  /api/raids           razzias actives du joueur
POST /api/raids/start     { monsterUid, targetId }
POST /api/raids/:id/claim résout et crédite/débite les sauvegardes
POST /api/guardian        { monsterUid | null }
```

Toutes les routes sont authentifiées par le jeton local (`x-token` ou
`?token=` pour SSE). Une razzia est résolue côté serveur à partir de la graine
tirée au départ et de la défense figée ; le client ne peut pas fabriquer son
butin.

### Flux d'une vente

```
Client A                    Serveur                     Client B
   │  POST /market/list        │                            │
   ├──────────────────────────►│ retire l'objet de A        │
   │                           │ crée l'annonce              │
   │                           │ broadcast SSE              │
   │                           │◄───────────────────────────┤ GET /market
   │                           │                            │
   │                           │◄───────────────────────────┤ POST /buy
   │                           │ débite B, livre l'objet    │
   │                           │ crédite A (taxe 5 %)       │
   │◄───── SSE sale ───────────┤                            │
   │  GET /save (sync)         │                            │
```

### Limites assumées du prototype

- Identité par **jeton local**, sans mot de passe : suffisant pour un prototype,
  pas pour une production.
- Les sauvegardes hors marché/razzia sont **client-authoritative** (un joueur
  modifié peut tricher sur son propre inventaire). Le marché et les razzias sont
  validés côté serveur.
- La défense d'une cible est figée au départ de la razzia ; les ressources sont
  lues au retour.
- Conflit de révision = dernière sauvegarde serveur adoptée ; deux onglets sur
  le même compte peuvent se marcher dessus.
- Les PNJ achètent les annonces sous ~130 % du prix conseillé, après 45 à 120 s.
- Pas de revanche automatique, pas de log de défense persistant au-delà du
  journal local.

Pour une version production : comptes, anti-cheat serveur, transactions
idempotentes, rate limiting, base de données, saisons, historique de raids.

---

## 11. Boucle de rétention (au-delà du prototype)

Déjà en place :
- objectifs à paliers, journal, records, montée de niveau, plans de corps,
  marché asynchrone, expéditions hors ligne, razzias, gardien et tourelle de
  veille à trois rangs.

Prochaines couches naturelles :
1. **Défenses spécialisées** : leurres de stockage et pièges qui modifient le
   risque et le type de butin des razzias.
2. **Directives de laboratoire** : spécialiser un monstre (ex. « éclaireur »,
   « gardien », « pilleur ») pour changer ses poids de zone et de razzia.
3. **Contrats de guilde** : objectifs collectifs hebdomadaires, marché de guilde.
4. **Saisons** : nouvelles zones, nouvelles parties, remise à zéro partielle.
5. **Fusion de parties** : deux parties identiques → une rareté supérieure
   (puits d'inventaire).
6. **PWA + notifications** : « ton expédition est rentrée » hors onglet.
7. **Historique de raids** et revanches asynchrones.

---

## 12. Architecture technique

```
index.html
css/style.css              UI sombre, responsive, glassmorphism
js/data.js                 toutes les données d'équilibrage
js/economy.js              moteur pur : stats, loot, prix, expéditions
js/raid.js                 moteur pur : attaque, défense, butin, labs PNJ
js/state.js                état, sauvegarde, actions, marché local, razzias locales
js/net.js                  client serveur, SSE, sync, marché et razzias partagés
js/ui.js                   HUD, onglets, modales, toasts, timers
js/scene.js                Three.js : scène, caméra, picking, palette
js/monsterBuilder.js       assemblage procédural à partir des sockets
js/partGenerator.js        générateurs 3D des 10 types de parties
js/icons.js                icônes SVG inline
server.js                  serveur Node sans dépendance (HTTP + SSE)
data/db.json               sauvegardes, annonces et razzias actives
```

Le moteur (`data.js`, `economy.js`, `raid.js`, `state.js`) ne dépend ni du DOM
ni de Three.js : il est testable sous Node et réutilisable côté serveur.

### Rendu 3D

- Corps : géométries procédurales mises en cache (larve, colosse, spectre).
- 24 à 26 sockets répartis en spirale de Fibonacci.
- Chaque partie est construite à partir de sa graine, orientée vers la normale
  de la surface, avec un enfoncement propre à son type.
- Les sockets sont des marqueurs additifs ; le picking passe par un raycast.
- Les yeux, tentacules, ailes et dents sont animés dans la boucle de rendu.
- Le builder permet de tourner le monstre, attacher/détacher, auto-assembler.

---

## 13. Lancer & tester

```bash
# Solo (marché simulé) — n'importe quel serveur statique
python -m http.server 8000
# ou
npx serve

# Multijoueur (marché partagé)
node server.js
# → http://localhost:8787
```

> Le jeu charge Three.js et les polices depuis un CDN : une connexion internet
> est nécessaire au premier chargement.

Tests :

```bash
node tests/engine.test.js      # moteur pur + razzias locales (18 tests)
node tests/server.test.mjs     # serveur + marché + razzias (8 tests)
node tools/simulate.mjs        # simulation d'équilibrage

# tests serveur accélérés (le script les passe déjà)
CHIMERE_RAID_MULT=0.01 CHIMERE_RAID_MIN_MS=100 node tests/server.test.mjs
```

Le serveur accepte aussi `CHIMERE_DB` pour isoler sa base et `PORT` pour changer
de port. Ces variables servent aux tests et aux environnements de démo.

---

## 14. Ce qui est volontairement simple

- Pas de compte, pas de mot de passe.
- Pas de combat temps réel : les expéditions sont des rendements, les razzias
  sont des résolutions asynchrones.
- Pas de perte de monstre ni de partie lors d'une razzia : seulement des
  ressources et de la fatigue.
- Pas de chat ni de guilde.
- Une seule monnaie de marché.
- Le builder est libre : aucune recette imposée, les combinaisons émergent.

C'est le socle. La suite doit enrichir la **spécialisation** (défenses, rôles,
directives) sans casser la lisibilité de la boucle à cinq temps :
**récolter → assembler → renforcer → échanger → piller**.
