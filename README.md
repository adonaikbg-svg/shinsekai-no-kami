# 神 Shisnekai no Kami — Quiz multijoueur temps réel (style Kahoot)

Plateforme de quiz en **temps réel sur plusieurs téléphones**, aux couleurs du logo **S·N·K**
(masque Kitsune rouge & noir) utilisé en **fond d'écran bien visible**.

L'animateur héberge la partie sur un écran (PC/projecteur), et chaque joueur rejoint depuis **son
propre téléphone** en entrant un PIN — exactement comme Kahoot.

---

## 🚀 Installation & lancement

Prérequis : **Node.js 18+** installé.

```bash
cd shisnekai-server
npm install      # installe express + ws (déjà fait si node_modules présent)
npm start        # démarre le serveur sur le port 3000
```

Vous verrez :

```
  SHISNEKAI NO KAMI - serveur demarre
  Local        : http://localhost:3000
  Reseau (LAN) : http://<IP-de-votre-PC>:3000
```

---

## 📱 Jouer sur plusieurs téléphones (même WiFi)

1. **Trouvez l'adresse IP locale** de l'ordinateur qui fait tourner le serveur :
   - Windows : `ipconfig` → « Adresse IPv4 » (ex. `192.168.1.42`)
   - Mac/Linux : `ifconfig` ou `ip addr` (ex. `192.168.1.42`)
2. **L'animateur** ouvre `http://localhost:3000` (ou l'IP) → se connecte → **Mes quiz → Lancer**.
   Un **PIN à 6 chiffres** s'affiche.
3. **Chaque joueur**, sur son téléphone connecté au **même WiFi**, ouvre :
   `http://192.168.1.42:3000/play` (remplacez par votre IP), entre le **PIN** + un **pseudo**.
4. L'animateur voit les joueurs arriver en direct, puis clique **Démarrer**.
5. Les questions s'affichent en temps réel ; les joueurs répondent depuis leur écran.
6. À la fin, l'animateur obtient le **classement final complet, du 1er au dernier**.

> 💡 Pour jouer **hors de votre réseau local** (Internet), déployez le serveur sur un hébergeur
> (Render, Railway, Fly.io, un VPS…) ou exposez-le temporairement avec un tunnel
> (`ngrok http 3000`). Le code fonctionne tel quel en HTTP **et** HTTPS (WebSocket ws/wss auto).

---

## 🆚 Duel 1v1 (2 humains — NOUVEAU)
- Un joueur **crée un duel** (questions de la banque Kami **ou** un quiz composé) → reçoit un **PIN**.
- Il **partage le PIN** (WhatsApp/lien/QR) à un ami ; dès que l'adversaire rejoint, **le duel démarre tout seul**.
- 2 joueurs max, même questions, **score comparé**, classement final. Spectateurs + chat possibles.
- ⚠️ Différent du **championnat** (qui, lui, classe beaucoup de joueurs — ex. 40 — sur le même quiz = une journée).

## 🏁 Course Kami (mode buzzer — NOUVEAU)
- L'**animateur pose des questions libres** qu'il écrit lui-même (devinettes manga/perso/culture)
  avec la réponse attendue (+ descriptif/indice optionnel).
- Les joueurs **tapent leur réponse** (texte libre) ; le **1er qui trouve la bonne réponse gagne** les points.
- Reconnaissance **tolérante** : insensible aux accents/majuscules/ponctuation + tolérance fautes de frappe,
  plusieurs réponses acceptées (séparées par `|`).
- Réponse **cachée aux joueurs** (visible seulement par l'animateur). Timeout = réponse révélée.
- ⚠️ C'est l'**organisateur** qui prépare les questions (Kami ne va PAS chercher sur Internet —
  ce serait possible avec une IA/LLM payante, non incluse).

## ⚔️ Versus 1v1 IA — interactif
- L'agent **Kami provoque et réagit en direct** (avant/après ta réponse, qui mène, combos).
- **Barre de momentum** visuelle (qui domine), **VS clash** animé à chaque question.
- **Combos** : bonnes réponses d'affilée → bonus de points + effet 🔥.
- Avatar de Kami qui « réfléchit », sons de tension, confettis à la victoire.

## 🎮 Modes de jeu solo (contre l'IA Kami)
- **⚔️ Versus — 1v1 IA** : choisissez thème + difficulté, le serveur génère 10 questions et
  vous affrontez l'agent **Kami** (proba de bonne réponse : facile 50 %, moyen 70 %, difficile 90 %;
  temps de réponse aléatoire). Score comparé en direct, victoire/défaite finale. (`mode: 'versus'`)
- **🎯 Solo entraînement** : 10 questions générées, avec **toggle « Mode relaxe »** (sans chrono).
  Récap final : questions ratées + bonnes réponses, temps moyen, % de réussite, message du Kami. (`mode: 'solo'`)
- Génération de questions **hors-ligne** via une banque par thème/difficulté (`question-bank.js`).
  *(Aucune clé API requise. Pour brancher un vrai LLM plus tard, remplacez `genererQuestions`.)*
- **11 thèmes intégrés** : 🌸 Mangas & Animés, ⚔️ Événements d'animés (faits marquants, arcs,
  combats clés…), 🎮 Jeux vidéo, 🌍 Culture générale, 🦊 Japon, 🔬 Sciences, 🏛️ Histoire,
  ⚽ Sport, 🎬 Cinéma, 🎵 Musique, 🗺️ Géographie.
- **Thèmes communautaires** : un compositeur peut cocher **« Partager dans les modes Versus & Solo IA »**
  dans l'éditeur ; ses questions QCM (min. 4) deviennent un **thème jouable contre le Kami** par tout
  le monde (section « Thèmes de la communauté » dans Versus/Solo). Les **images/audios** des quiz
  partagés sont **inclus** (parfait pour « devine l'anime par l'image »).

## 🌍 Robustesse réseau (connexions instables, RDC/3G/4G)
- **Heartbeat ping/pong (25 s)** : coupe les sockets fantômes (mobile qui perd le réseau).
- **Reconnexion automatique** joueur **et** hôte : fenêtre de 90 s, backoff Fibonacci,
  **overlay de reconnexion**, et **resynchronisation complète** de l'état (question en cours,
  temps restant recalculé serveur, score conservé).
- **Anti-usurpation** : chaque joueur reçoit un `sessionToken` secret exigé pour se reconnecter.
- **Rate limiting** (30 messages / 10 s par socket), `maxPayload` 8 MB.
- **Room conservée 30 min** après la fin ; nettoyage périodique des sessions (anti fuite mémoire).
- L'hôte voit en direct qui est **déconnecté** (📵 grisé).
- **Persistance des parties (survit à un redémarrage serveur)** : les parties en cours sont
  snapshotées (module `room-store.js`). Au redémarrage, elles sont **restaurées** et les
  joueurs/hôtes se reconnectent — **scores conservés**.
  - Par défaut : fichier `data/rooms.json` (aucune config requise).
  - En production : définir **`REDIS_URL`** pour une persistance robuste via Redis.
  - 100 % rétrocompatible : sans config, le serveur fonctionne comme avant.
- Détails complets : voir **`AUDIT-ROBUSTESSE.md`**.

## 📜 Conditions d'utilisation (CGU) avant l'entrée
- Un **portail de consentement** s'affiche avant toute connexion (web + app).
- L'utilisateur doit **cocher la case** d'acceptation des CGU / politique de confidentialité.
- S'il refuse : **message amical** et accès bloqué tant que la case n'est pas cochée.
- Acceptation **horodatée** et mémorisée (localStorage). Texte des CGU dans `public/cgu.js`.

## 🔑 Compte
- **Super-admin unique : `Adonaikbg` / `1234567`** (à changer). L'ancien `Adonaishinsekai` est
  automatiquement supprimé/migré au démarrage.

## 🏆 Championnat Shinsekai (3 divisions, 20 journées, logique foot)
- **3 divisions otaku** : 🐉 Ligue des Kami 神 (élite) · ⚔️ Voie des Senpai · 🌱 Cercle des Kohai.
  Classement **cumulatif** par division (score + bonus 3/2/1).
- **Montée/descente** façon foot : à la clôture de saison, **5 montent / 5 descendent** entre divisions
  (bouton « Clôturer la saison »). Marquage ⬆/⬇ dans les classements.
- Membres ajoutés (et déplacés entre divisions) par le **super-admin** ou les **admins** qu'il délègue.
- Journées jouées **en live** (l'animateur choisit division + n° de journée), **1 seul essai** par journée+division,
  scores **enregistrés automatiquement**. Classement de la journée visible à la fin pour tous.

## 🏆 (ancien) Championnat Shinsekai (20 journées, logique foot)
- Une saison de **20 journées**. Les **membres** sont ajoutés par les admins / super-admin.
- Chaque journée se joue **en live** (l'animateur lance un quiz et coche « journée de championnat N »).
- **1 seul essai par journée** (rejouer une journée déjà jouée est refusé).
- À la fin de la partie, les scores sont **enregistrés automatiquement** + **bonus façon foot**
  (1er +3 pts, 2e +2, 3e +1).
- **Classement cumulatif** : le score s'additionne d'une journée à l'autre (ex. 3000 puis +2000 = 5000),
  et la **place monte ou descend** selon le cumul. Visible par tous dans « Championnat Shinsekai ».
- Saisie manuelle des scores aussi possible (panneau Gérer) en secours.

## 👁️ Versus / Duel avec spectateurs + chat + réactions
- N'importe quelle partie peut être **regardée en spectateur** (menu « Regarder un duel » ou via le PIN).
- **Chat en direct** partagé entre joueurs, animateur et spectateurs.
- **Réactions emoji** flottantes (👍❤️😂🔥…) pendant la partie.
- Le nombre de spectateurs s'affiche en temps réel.

## 🔐 Comptes & sécurité
- Super-admin : **`Adonaikbg` / `1234567`** *(à changer)*.
- **« Se souvenir de moi »** : session 30 jours (sinon effacée à la fermeture du navigateur).
- **Récupération sans email** : une **seule question de sécurité** suffit (réponses hashées scrypt).
- **Anti-bots (sans captcha visuel)** : honeypot, délai minimum de formulaire, limite d'inscriptions
  par IP (5/h), throttle de connexion (blocage 60s après 5 échecs).
- Le super-admin **délègue des admins** capables de **virer/bannir** les joueurs.

## 🌐📱 Site web ET application (PWA)
Un seul code = les deux à la fois :
- **Site web** : on ouvre simplement le lien dans le navigateur.
- **Application installable** (PWA) : sur le téléphone, « Ajouter à l'écran d'accueil »
  → icône SNK, plein écran, **splash screen avec le logo au démarrage**, lancement rapide.
- Bouton **« 📲 Installer l'app »** qui apparaît automatiquement (Android/Chrome).
- Service worker : démarrage instantané et logo affiché même en connexion faible
  (l'API et le temps réel ne sont jamais mis en cache).

## 🔊 Ambiance sonore (Web Audio, sans fichier)
Sons générés en direct par le navigateur (aucun téléchargement, marche hors-ligne), via `public/sound.js` :
- 🎵 **Musique de lobby** douce et mystérieuse (arpège pentatonique japonisant).
- ⏳ **Tic-tac de compte à rebours** qui **s'accélère** dans les 5 dernières secondes.
- ✅ **Son de bonne réponse** / ❌ **mauvaise réponse**.
- 🛗 **Whoosh** quand un joueur grimpe au classement.
- 🎉 **Fanfare de victoire** + 😔 jingle de défaite en fin de partie.
- Actif en multijoueur, **Versus IA** et **Solo**. Bouton **🎵 Son : ON/OFF** (préférence mémorisée).
- *(Le son se débloque au premier clic, conformément aux règles des navigateurs.)*

## 🎬 Animations
- **Classement animé entre les questions** : chaque joueur **glisse** vers sa nouvelle position
  (animation FLIP fluide), avec **flèches ▲/▼** indiquant les montées/descentes et le **+points** gagnés.
  Le 1er est mis en valeur (cadre or, halo).
- **Fin de quiz spectaculaire** : le **podium se construit progressivement** (3e → 2e → 1er),
  couronne 👑 animée sur le gagnant, **bannière de victoire** et **confettis** (canvas, sans dépendance).
- Côté joueur : **confettis** pour le top 3 sur l'écran de fin ; confettis aussi à la victoire en **Versus IA**.

## 💬 Invitation au groupe WhatsApp (intelligente)
- Une popup invite à rejoindre le **groupe WhatsApp communautaire** (phrase attractive).
- **« J'y suis déjà »** → ne réapparaît plus jamais.
- **« Plus tard / Non merci »** → réapparaît seulement de temps en temps (après ~3 jours).
- **« Rejoindre »** → ouvre le groupe et arrête de demander.
- Lien aussi présent dans l'encart « Suivez-nous » (fin de partie). Modifiable dans `SOCIAL.whatsappGroup`.

## 📲 Suivi réseaux sociaux
À la **fin de chaque partie** (multijoueur, Versus, Solo), un encart invite à suivre :
- **Instagram** : `https://www.instagram.com/shinsekai_no__kami`
- **TikTok** : `https://www.tiktok.com/@shinsekai_no_kami` *(à corriger si besoin dans `public/index.html` et `public/play.html`, constante `SOCIAL`)*

## 📊 Statistiques (super-admin)
Panneau Administration → section **Statistiques** (visible par le super-admin uniquement) :
- Visites du jour, visiteurs uniques du jour, visites sur 7 jours, parties jouées.
- **Niveau d'affluence** (Très faible → Très élevé) selon les visites du jour.
- **Graphique** des 14 derniers jours (visites + visiteurs uniques).
- Répartition des parties par mode (multijoueur / Versus / Solo) + totaux cumulés.
- Suivi anonyme via un identifiant de navigateur (localStorage), stocké dans `data/stats.json`.

## 👑 Système de rôles
- **`superadmin`** (👑) — `Adonaishinsekai` uniquement. **Indestructible**, ne peut être banni ni perdre son rôle.
- **`admin`** (🛡️) — comptes promus par le super-admin. Peuvent créer des quiz, lancer des parties,
  accéder au panneau admin et au code, **mais ne peuvent ni bannir ni modifier les rôles**.
- **`user`** — par défaut.
- Section **« Gestion des rôles »** (visible par le super-admin) : Promouvoir / Révoquer.

## 🔑 Compte SUPER-ADMIN permanent
- **Nom d'utilisateur :** `Adonaishinsekai`
- **Mot de passe :** `1234567` *(à changer : bouton « 🔑 Changer mon mot de passe »)*
- Créé automatiquement au démarrage s'il n'existe pas.

### 🔐 Récupération de mot de passe (sans email)
- Bouton **« Mot de passe oublié ? »** sur la page de connexion (réservé `superadmin`/`admin`).
- 3 **questions de sécurité** (ex. prénom de la mère, ville de naissance, surnom d'enfance)
  configurées via le bouton **« Questions de sécurité »** de l'accueil.
- Réponses stockées **hashées (scrypt)**. Les 3 bonnes réponses → définition d'un nouveau mot de passe.

### 🛡️ Pouvoirs
- **Bannir / débannir** : **super-admin uniquement** (par pseudo + en partie).
- **Expulser** et **ajuster les points** des joueurs pendant la partie (animateur/admin).
- **Accès au code source** en lecture (panneau Administration).
- Rôle **ADMIN** + **Quiz Démo** prêt à lancer.
- Bouton *« Remplir le compte démo »* sur l'écran de connexion.

---

## ✨ Fonctionnalités (comme Kahoot)

- **Comptes** : inscription / connexion, mots de passe **hachés (scrypt + sel)**.
- **Création de quiz** :
  - **QCM** (jusqu'à 4 réponses, couleurs ▲ ◆ ● ■).
  - **Vrai / Faux**.
  - Temps réglable par question (10 à 60 s).
- **Rooms temps réel** avec **PIN à 6 chiffres**, **jusqu'à 100 participants**.
- **Mode ÉQUIPES** (choisi par le compositeur au lancement) :
  - **Choix libre** (chaque joueur choisit son équipe) ou **répartition automatique** équilibrée.
  - Équipes par défaut : *Esprits Rouges* vs *Lames Bleues*.
  - Score d'équipe affiché après chaque question + classement d'équipes final.
- **Médias dans les questions** : importez une **image** et/ou un **audio** par question.
  - Idéal pour « Quelle est cette image ? » et **« Quel est ce son ? »**.
  - Image affichée et audio joué automatiquement (avec bouton 🔊 Rejouer) chez l'animateur
    ET sur le téléphone de chaque joueur.
  - Médias **intégrés au quiz** (base64, autonome) ; images **compressées automatiquement**.
    Limites : image ≤ 2 Mo (après compression), audio ≤ 6 Mo.
- **Mascottes** : chaque joueur choisit sa mascotte en rejoignant (Ninja, Licorne, Panda,
  Ours, Renard, Tigre, Dragon, Hibou, Loup, Chat, Grenouille, Poulpe) — affichées partout
  avec de jolis cadres dégradés + animation.
- **Agent IA "Kami"** : commente la partie en direct (accueil, intros de questions, résultats,
  qui mène, victoire...) **en texte ET à voix haute** (synthèse vocale du navigateur, FR,
  bouton 🔊 pour activer/couper). Fonctionne hors-ligne, aucun coût.
- **Pouvoirs de modération** (animateur de la partie + admin) directement dans le lobby :
  - **Expulser** un joueur, **Bannir** (avec raison), **± Points** (retirer ou ajouter).
- **Lobby** : joueurs affichés en direct à mesure qu'ils rejoignent.
- **QR Code** dans le lobby : les joueurs scannent pour rejoindre directement
  (le PIN est pré-rempli automatiquement). Généré **hors-ligne**, sans service externe.
- **Boutons de partage** : WhatsApp, Facebook, Instagram, TikTok + copie du lien.
  (Instagram/TikTok n'ayant pas d'API de partage de lien web, l'invitation est copiée
  automatiquement pour la coller dans une story / bio / message.)
- **Jeu synchronisé** : tout le monde voit la même question en même temps.
- **Score basé sur la rapidité** (500 pts + bonus selon le temps de réponse restant).
- **Classement provisoire** après chaque question + **classement final complet
  (1er → dernier)** réservé au **créateur du quiz**.
- **Historique** de toutes les parties animées (section *Classements*), persistant.
- **Panneau Admin** : liste des comptes, suppression, statistiques.

---

## 🗂️ Architecture

```
shisnekai-server/
├── server.js            # Serveur Node.js : Express (API REST) + WebSocket (ws)
├── package.json
├── public/
│   ├── index.html       # Espace animateur (auth, éditeur, hébergement, classements)
│   ├── play.html        # Écran joueur mobile (rejoindre via PIN, répondre)
│   ├── style.css        # Thème S·N·K + logo en fond d'écran
│   └── logo.jpg         # Votre logo (fond d'écran, non modifié)
└── data/                # Stockage JSON (users / quizzes / results) — créé au 1er lancement
```

- **REST** (`/api/...`) : auth, gestion des quiz, historique, admin.
- **WebSocket** : événements de jeu en temps réel
  (`host-create`, `join`, `start`, `question`, `answer`, `reveal`, `next`, `gameover`).
- **Persistance** : fichiers JSON dans `data/`. Pour réinitialiser, supprimez `data/*.json`
  (le compte admin et le quiz démo seront recréés au prochain démarrage).

---

## ✅ Testé de bout en bout

Le flux complet a été validé : hôte + plusieurs joueurs simultanés, scoring à la rapidité,
révélation synchronisée, et **classement final ordonné du 1er au dernier**, enregistré côté serveur.
