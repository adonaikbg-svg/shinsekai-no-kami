# 🚀 Mettre Shisnekai no Kami en ligne — GRATUIT & PERMANENT
### Guide pas à pas, faisable entièrement depuis ton téléphone 📱

Tu vas faire 4 étapes. Compte ~20-30 min la première fois. Tout est **gratuit**.

À la fin tu auras :
- ✅ Un lien public `https://shisnekai-no-kami.onrender.com` (exemple) accessible partout
- ✅ Les parties/classements **conservés en permanence** (Redis)
- ✅ L'app qui **ne s'endort jamais** (UptimeRobot)
- ✅ L'app **installée sur ton écran d'accueil**

---

## 😴 D'abord : c'est quoi la « mise en veille » ?

Sur l'hébergement gratuit, si **personne n'utilise l'app pendant 15 min**, le serveur se
**met en pause** pour économiser. À la visite suivante, il met **30-50 s à se réveiller**
(page lente). Ce n'est **pas une panne**, juste un réveil lent.

➡️ **L'étape 3 (UptimeRobot)** règle ça : elle « réveille » l'app toutes les 5 min,
donc elle reste **toujours rapide**, gratuitement.

---

# ÉTAPE 1 — Mettre le code sur GitHub

GitHub = l'endroit où ton code est stocké pour que Render puisse le lire.

1. Va sur **github.com** → crée un compte gratuit (ou connecte-toi).
2. En haut à droite : **+** → **New repository**.
3. **Repository name** : `shisnekai-no-kami`
4. Laisse **Public** (ou Private, les deux marchent), puis **Create repository**.
5. Maintenant il faut **envoyer les fichiers** du dossier `shisnekai-server` dedans :
   - **Le plus simple sur téléphone** : sur la page du dépôt, clique **« uploading an existing file »**
     (ou **Add file → Upload files**), puis **glisse/sélectionne TOUS les fichiers** du dossier
     `shisnekai-server` (sauf le dossier `node_modules` s'il existe — pas besoin).
     ⚠️ Inclure : `server.js`, `package.json`, `room-store.js`, `question-bank.js`, `demo-media.js`,
     `render.yaml`, et **tout le dossier `public/`**.
   - Clique **Commit changes** en bas.

> 💡 Astuce : GitHub sur mobile permet d'uploader plusieurs fichiers. Si c'est pénible,
> fais-le depuis un ordi pour cette seule étape, puis tout le reste se gère au téléphone.

---

# ÉTAPE 2 — Héberger sur Render (gratuit)

1. Va sur **render.com** → **Get Started** → connecte-toi **avec GitHub** (le plus simple).
2. Clique **New +** (en haut) → **Web Service**.
3. **Connect** ton dépôt `shisnekai-no-kami`.
4. Render détecte Node automatiquement. Vérifie / remplis :
   - **Name** : `shisnekai-no-kami` (ce sera le début de ton lien)
   - **Region** : choisis la plus proche (ex. *Frankfurt* pour l'Afrique/Europe)
   - **Branch** : `main`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
5. Clique **Create Web Service**.
6. Attends 2-4 min (Render installe et démarre). Quand c'est **Live**, ton lien apparaît en haut :
   `https://shisnekai-no-kami.onrender.com` 🎉

✅ **Teste tout de suite** : ouvre ce lien, connecte-toi avec **Adonaikbg / 1234567**.

---

# ÉTAPE 3 — Garder l'app éveillée avec UptimeRobot (gratuit)

C'est ça qui empêche la mise en veille.

1. Va sur **uptimerobot.com** → crée un compte gratuit.
2. **+ New Monitor** (ou **Add New Monitor**).
3. Remplis :
   - **Monitor Type** : `HTTP(s)`
   - **Friendly Name** : `Shisnekai`
   - **URL** : `https://shisnekai-no-kami.onrender.com/healthz`
     ⚠️ Bien mettre **`/healthz`** à la fin (c'est une page légère prévue pour ça).
   - **Monitoring Interval** : `5 minutes`
4. **Create Monitor**.

✅ Désormais UptimeRobot visite ton app toutes les 5 min → **elle ne dort plus jamais**.

---

# ÉTAPE 4 — Persistance permanente avec Upstash Redis (gratuit)

Sans ça, un **redéploiement** de Render peut effacer les parties/classements. Avec Redis, **tout est gardé**.

1. Va sur **upstash.com** → crée un compte gratuit → **Console**.
2. **Create Database** (type **Redis**) :
   - **Name** : `shisnekai`
   - **Region** : la plus proche de ta région Render (ex. *eu-west*).
   - **Type** : **Free**. Clique **Create**.
3. Sur la page de la base, copie l'**URL de connexion** :
   - Cherche **« Redis Connect »** / **« redis-cli »** ou le champ **`UPSTASH_REDIS_URL`**.
   - Tu veux l'URL qui commence par **`rediss://`** (avec deux « s »), contenant le mot de passe.
     Exemple : `rediss://default:XXXXXXXX@eu1-xxx.upstash.io:6379`
4. Retourne sur **Render** → ton service → onglet **Environment** → **Add Environment Variable** :
   - **Key** : `REDIS_URL`
   - **Value** : colle l'URL `rediss://...`
   - **Save Changes** (Render va redéployer automatiquement ~2 min).
5. Vérifie : ouvre `https://ton-app.onrender.com/healthz` → tu dois voir `"persistance":"redis"`. ✅

---

# 📱 BONUS — Installer l'app sur l'écran d'accueil

- **Android (Chrome)** : ouvre le lien → un bouton **« 📲 Installer l'app »** apparaît,
  ou menu **⋮ → Ajouter à l'écran d'accueil**.
- **iPhone (Safari)** : ouvre le lien → bouton **Partager** (carré avec flèche) →
  **« Sur l'écran d'accueil »**.

➡️ Tu obtiens l'**icône SNK**, le **logo au démarrage** (splash), et le **plein écran**.

---

## ✅ Récapitulatif

| Étape | Service | Rôle | Coût |
|---|---|---|---|
| 1 | GitHub | Stocke le code | Gratuit |
| 2 | Render | Héberge + lien public | Gratuit |
| 3 | UptimeRobot | Empêche la mise en veille | Gratuit |
| 4 | Upstash Redis | Garde les données en permanence | Gratuit |

🔐 **Dès ta 1ʳᵉ connexion** : change le mot de passe super-admin et configure ta **question de
sécurité** (boutons sur l'accueil).

🆘 Un souci à une étape ? Note le message d'erreur exact et le numéro d'étape — c'est facile à débloquer.
