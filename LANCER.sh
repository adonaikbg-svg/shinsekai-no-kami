#!/usr/bin/env bash
# =====================================================================
#  Shisnekai no Kami - Lancement automatique (Mac / Linux)
#  Double-cliquez ce fichier, ou lancez :  bash LANCER.sh
# =====================================================================
set -e
cd "$(dirname "$0")"

echo ""
echo "  =============================================="
echo "   神  SHISNEKAI NO KAMI  -  Demarrage"
echo "  =============================================="
echo ""

# 1) Verifier Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "  [!] Node.js n'est pas installe."
  echo "      Installez-le ici (gratuit) : https://nodejs.org  (version LTS)"
  echo "      Puis relancez ce fichier."
  read -p "  Appuyez sur Entree pour fermer..."
  exit 1
fi
echo "  [OK] Node.js detecte : $(node --version)"

# 2) Installer les dependances si besoin
if [ ! -d node_modules ]; then
  echo "  [..] Installation des composants (une seule fois)..."
  npm install --silent
fi
echo "  [OK] Composants prets."

# 3) Trouver l'adresse IP locale (pour les telephones du meme WiFi)
IP=""
if command -v ipconfig >/dev/null 2>&1; then
  IP=$(ipconfig getifaddr en0 2>/dev/null || true)
fi
if [ -z "$IP" ] && command -v hostname >/dev/null 2>&1; then
  IP=$(hostname -I 2>/dev/null | awk '{print $1}')
fi
[ -z "$IP" ] && IP="<votre-IP-locale>"

echo ""
echo "  =============================================="
echo "   C'EST PRET !  Ouvrez ces adresses :"
echo "  ----------------------------------------------"
echo "   ANIMATEUR (vous) :  http://localhost:3000"
echo "   JOUEURS (memes WiFi):  http://$IP:3000/play"
echo "  ----------------------------------------------"
echo "   Connexion admin/demo :"
echo "     Identifiant : Adonaishinsekai"
echo "     Mot de passe: 1234567"
echo "  =============================================="
echo "   (Laissez cette fenetre ouverte pendant le jeu)"
echo "   (Pour arreter : Ctrl + C)"
echo ""

npm start
