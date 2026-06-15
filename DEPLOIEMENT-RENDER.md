# 🚀 Déployer Shisnekai no Kami sur Render (gratuit) — guide pas à pas

À la fin, vous aurez une **vraie URL publique** du type
`https://shisnekai-no-kami.onrender.com` que vous et vos amis pourrez ouvrir
sur **n'importe quel téléphone**, partout.

> ⏱️ Temps estimé : ~10 minutes. Aucun paiement requis (plan gratuit).

---

## Étape 0 — Récupérer le dossier du projet
Téléchargez le dossier **`shisnekai-server/`** (tous les fichiers, sauf `node_modules`
qui sera réinstallé automatiquement).

---

## MÉTHODE A — via GitHub (recommandée)

### 1. Mettre le code sur GitHub
- Créez un compte gratuit sur https://github.com si besoin.
- Créez un nouveau dépôt (ex. `shisnekai-no-kami`), **public ou privé**.
- Envoyez-y le contenu du dossier `shisnekai-server/`. En ligne de commande :

```bash
cd shisnekai-server
git init
git add .
git commit -m "Shisnekai no Kami - quiz multijoueur"
git branch -M main
git remote add origin https://github.com/VOTRE-NOM/shisnekai-no-kami.git
git push -u origin main
```

> 💡 Le fichier `.gitignore` exclut déjà `node_modules/` et les données runtime.

### 2. Créer le service sur Render
1. Allez sur https://render.com → créez un compte gratuit (vous pouvez vous connecter avec GitHub).
2. Cliquez **New +** → **Web Service**.
3. Connectez votre compte GitHub et **sélectionnez le dépôt** `shisnekai-no-kami`.
4. Render détecte Node automatiquement. Vérifiez/renseignez :
   - **Name** : `shisnekai-no-kami` (ce sera le début de votre URL)
   - **Region** : la plus proche de vous (ex. *Frankfurt*)
   - **Branch** : `main`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
5. Cliquez **Create Web Service**.

> ⚙️ Astuce : comme le dépôt contient un fichier **`render.yaml`**, vous pouvez aussi choisir
> **New + → Blueprint** : Render configurera tout automatiquement à partir de ce fichier.

### 3. Attendre le déploiement
Render exécute `npm install` puis `npm start`. Au bout de 1–3 min, le statut passe
à **Live** et une URL s'affiche en haut, par ex. :

```
https://shisnekai-no-kami.onrender.com
```

🎉 **C'est votre lien à partager !**

---

## MÉTHODE B — sans GitHub (déploiement manuel par glisser-déposer)
Render permet aussi un déploiement direct dans certains cas, mais la méthode GitHub
ci-dessus est la plus fiable et permet les mises à jour automatiques.

---

## ✅ Tester une fois en ligne

- **Animateur** : ouvrez `https://VOTRE-APP.onrender.com`
  - Connectez-vous avec **Adonaishinsekai** / **1234567**
  - **Mes quiz → Lancer** → un **PIN** s'affiche.
- **Joueurs** (sur leurs téléphones, n'importe quel réseau) :
  - Ouvrez `https://VOTRE-APP.onrender.com/play`
  - Entrez le **PIN** + un pseudo → **Rejoindre**.
- L'animateur clique **Démarrer**, et à la fin obtient le **classement final complet (1er → dernier)**.

> Le WebSocket fonctionne automatiquement en **wss://** (sécurisé) sur Render — rien à configurer.

---

## ⚠️ À savoir sur le plan GRATUIT de Render

1. **Mise en veille** : après ~15 min sans activité, le service s'endort. La **première
   visite** suivante peut prendre **30–60 s** à charger (réveil). Ensuite c'est instantané.
   👉 Astuce : ouvrez l'URL 1 min avant votre session de quiz pour le « réveiller ».

2. **Données non persistantes** : sur le plan gratuit, le dossier `data/` peut être réinitialisé
   lors d'un redéploiement. Le **compte admin et le quiz démo sont recréés automatiquement**,
   mais les comptes/quiz/classements ajoutés ensuite peuvent disparaître après un redéploiement.
   👉 Pour une persistance durable : passez à un plan payant et activez le bloc `disk`
   (déjà préparé, en commentaire, dans `render.yaml`).

3. **Sécurité** : vous pouvez changer le mot de passe admin sans toucher au code, via les
   **variables d'environnement** Render :
   - `ADMIN_USERNAME` (défaut : `Adonaishinsekai`)
   - `ADMIN_PASSWORD` (défaut : `1234567`)
   (Onglet *Environment* du service → *Add Environment Variable*.)

---

## 🔁 Mettre à jour l'app plus tard
Avec la méthode GitHub : modifiez le code, puis `git push`. Render redéploie tout seul. ✅
