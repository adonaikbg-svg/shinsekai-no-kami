# 🔧 AUDIT & CORRECTIONS — Robustesse réseau (cible RDC, 3G/4G instable)

> ⚠️ **Note de transparence importante.** Le prompt d'audit listait 10 corrections comme
> « déjà présentes dans le code ». **Ce n'était pas le cas** : après vérification, le code ne
> contenait NI heartbeat, NI `player-rejoin`, NI `disconnectedAt`, NI `intentionalClose`,
> NI rate limiting, NI TTL de 30 min. Le `host-rejoin` existait mais était minimal.
>
> J'ai donc **réellement implémenté** ces 10 points + traité les questions d'audit ci-dessous,
> puis **tout testé** (reconnexion joueur/hôte, anti-usurpation, rate limit, resync).

---

## ✅ Implémenté (était annoncé "déjà fait" mais absent)

| # | Fonction | Statut |
|---|----------|--------|
| 1 | Heartbeat ping/pong toutes les 25 s (coupe les sockets zombies) | ✅ ajouté |
| 2 | Reconnexion joueur `player-rejoin` (fenêtre 90 s, backoff Fibonacci, overlay, resync) | ✅ ajouté |
| 3 | Reconnexion hôte `host-rejoin` (bannière, **état complet renvoyé via `host-resync`**) | ✅ ajouté |
| 4 | Rate limiting WS (30 msg / 10 s par socket) | ✅ ajouté |
| 5 | Room survivante 30 min après la fin | ✅ ajouté |
| 6 | `disconnectedAt` horodaté | ✅ ajouté |
| 7 | `broadcastPlayers` n'envoie qu'aux connectés | ✅ (+ batch async) |
| 8 | `playerList` expose `connected:true/false` | ✅ ajouté |
| 9 | `answer-progress` compte les connectés uniquement | ✅ déjà OK, conservé |
| 10 | `intentionalClose` (pas de reco après fin/kick) | ✅ ajouté |

---

## 🔴 CRITIQUE

### 🔴 Usurpation d'identité au `player-rejoin`
**Problème :** se reconnecter en devinant seulement un `playerId` permettrait de voler la place d'un autre.
**Correction :** à chaque `join`, le serveur génère un **`sessionToken` secret** (16 octets aléatoires)
renvoyé uniquement au joueur concerné. Le `player-rejoin` exige ce token ET vérifie la fenêtre de 90 s.
```javascript
// AVANT : (n'existait pas)
// APRÈS :
const sessionToken = crypto.randomBytes(16).toString('hex');
room.players[pid] = { ..., sessionToken, disconnectedAt:null };
send(ws,'joined',{ playerId:pid, sessionToken, ... });
// rejoin :
if(!p || p.sessionToken !== msg.sessionToken){ send(ws,'rejoin-fail',{message:'session invalide'}); return; }
```
*Testé : un imposteur avec un mauvais token est rejeté (`Reconnexion refusée`).*

### 🔴 Perte totale si le serveur redémarre (rooms en RAM) — ✅ RÉSOLU
**Problème :** un crash/redéploiement effaçait toutes les parties en cours (rooms en mémoire).
**Correction :** persistance par **snapshot** des rooms (module `room-store.js`).
- À chaque transition clé (join, set-team, début de question, réponse, reveal, fin), un snapshot
  sérialisable de la room (quiz, joueurs, scores, réponses, index/timing de question, `sessionToken`)
  est sauvegardé.
- **Si `REDIS_URL` est défini → Redis** ; sinon → **fichier `data/rooms.json`** (les deux survivent au redémarrage).
- Au démarrage, `restoreAllRooms()` recharge les parties et **relance les timers** des questions en cours
  (avec le `timeLeft` recalculé). Les joueurs/hôtes se reconnectent via `player-rejoin`/`host-rejoin`.
```javascript
// snapshot a chaque transition :
function persistRoom(room){ RoomStore.save(room.pin, snapshotRoom(room)); }
// au boot :
const snaps = await RoomStore.loadAll();
// ...restore + relance timer si state==='question'
```
*Testé : kill -9 brutal du serveur en pleine partie → redémarrage → **score identique (2000→2000)**,
joueur reconnecté retrouve sa question. Fonctionne même SANS Redis (mode fichier).*
**Rétrocompatible :** sans `REDIS_URL` ni `data/rooms.json`, le serveur démarre exactement comme avant.

### 🔴 `maxPayload` à 50 MB = risque mémoire/DoS
**Correction :** ramené à **8 MB** (suffisant pour images compressées ≤ 2 MB) + garde-fou côté handler.
```javascript
// AVANT : new WebSocketServer({ server, maxPayload: 50*1024*1024 });
// APRÈS : new WebSocketServer({ server, maxPayload: 8*1024*1024 });
```

---

## 🟠 IMPORTANT

### 🟠 Hôte qui se reconnecte pendant une question
**Correction :** `host-rejoin` renvoie `host-resync` avec l'état exact (`question/reveal/ended/lobby`),
le **`timeLeft` recalculé serveur** (`qTime - elapsed`), le nombre de réponses reçues, etc.
Le client reconstruit l'écran adéquat. *Testé : resync en pleine question, timer correct, partie finie normalement.*

### 🟠 Réponse arrivant après `reveal` (joueur reconnecté lent)
**Correction :** `handleAnswer` renvoie maintenant un feedback clair au lieu d'ignorer en silence :
```javascript
if(room.state !== 'question'){ send(player.socket,'answer-too-late',{message:'Temps écoulé'}); return; }
if(room.answeredThisQ[player.id]){ send(player.socket,'answer-ack',{received:true,duplicate:true}); return; }
```

### 🟠 `iaSessions` et `sessions` jamais nettoyés (fuite mémoire)
**Correction :** un `setInterval` (5 min) purge : rooms terminées > 30 min, sessions IA > 1 h,
**tokens auth > 24 h** (via `sessionMeta` qui horodate chaque token).

### 🟠 `broadcastAll` bloquant sur 80+ joueurs
**Correction :** sérialisation **une seule fois** + envoi par **lots de 25** via `setImmediate`
(ne bloque plus l'event loop).

### 🟠 2 onglets du même joueur en `player-rejoin`
**Correction :** si une socket est déjà active pour ce joueur, l'ancienne est fermée proprement
(`intentionalClose=true`) avant d'attacher la nouvelle. Idem côté hôte.

---

## 🟡 MINEUR

### 🟡 Compensation de latence du `timeLeft`
**Correction :** le `timeLeft` est calculé serveur à l'instant de la reconnexion ; on **arrondit au
supérieur** (`Math.ceil`) pour ne pas léser le joueur, et le timer client repart de cette valeur.
Une compensation RTT plus fine (horloge synchronisée) serait possible mais sur-ingénierie ici.

### 🟡 Injections dans pseudos / raisons de ban
**Correction :** déjà échappées à l'affichage via `esc()` (HTML entities) ; pseudos limités à 20 car.
et `trim()`. Pas d'eval ni d'insertion HTML brute. Risque XSS faible.

### 🟡 Médias base64 lourds sur 3G
**Correction (atténuation) :** images **compressées automatiquement** à l'import (≤ 2 MB, JPEG 1280px) ;
`maxPayload` réduit. Un vrai lazy-loading / CDN nécessiterait le stockage fichiers (déjà documenté
comme évolution). Pour la RDC, **privilégier des quiz sans média** ou avec images très légères.

---

## 🧪 Tests automatisés passés
- ✅ Reconnexion joueur mid-question + resync `timeLeft` + score conservé
- ✅ Anti-usurpation (mauvais `sessionToken` rejeté)
- ✅ Hôte voit `connected:false` à la déconnexion
- ✅ Reconnexion hôte + `host-resync` (état question préservé)
- ✅ Rate limiting (40 messages → 30 acceptés, 10 bloqués)
- ✅ Partie multijoueur complète toujours fonctionnelle (non-régression)
