/* =========================================================================
   SHISNEKAI NO KAMI  -  Serveur de quiz multijoueur temps reel (style Kahoot)
   - HTTP/REST (Express) : auth, gestion des quiz, historique des classements
   - WebSocket (ws)      : rooms temps reel entre plusieurs telephones
   - Mascottes, mode equipes (libre/auto), agent IA (commentaires + voix),
     pouvoirs admin/hote : bannir / debannir / ajuster les points
   - Stockage            : fichiers JSON dans /data
   ========================================================================= */

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const { DEMO_IMAGE, DEMO_AUDIO } = require('./demo-media.js');
const { THEMES, DIFFICULTIES, genererQuestions } = require('./question-bank.js');
const RoomStore = require('./room-store.js');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 100;
const DATA_DIR = path.join(__dirname, 'data');

// Identifiants admin : configurables via variables d'environnement (defaut = vos identifiants)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Adonaikbg';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234567';

if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ----------------------- Mascottes ----------------------- */
const MASCOTS = [
  { id:'ninja',   name:'Ninja',   emoji:'🥷', c1:'#3a3a4a', c2:'#15151f' },
  { id:'licorne', name:'Licorne', emoji:'🦄', c1:'#ff7ad9', c2:'#7d2bd1' },
  { id:'panda',   name:'Panda',   emoji:'🐼', c1:'#f2f2f2', c2:'#2a2a2a' },
  { id:'ours',    name:'Ours',    emoji:'🐻', c1:'#c8853f', c2:'#6b3d12' },
  { id:'renard',  name:'Renard',  emoji:'🦊', c1:'#ff8a3d', c2:'#c1440e' },
  { id:'tigre',   name:'Tigre',   emoji:'🐯', c1:'#ffb547', c2:'#a85a00' },
  { id:'dragon',  name:'Dragon',  emoji:'🐲', c1:'#3ddc84', c2:'#0f6b3a' },
  { id:'hibou',   name:'Hibou',   emoji:'🦉', c1:'#9c7b53', c2:'#4d3a23' },
  { id:'loup',    name:'Loup',    emoji:'🐺', c1:'#8fa3b8', c2:'#3a4654' },
  { id:'chat',    name:'Chat',    emoji:'🐱', c1:'#ffcf6b', c2:'#b07d10' },
  { id:'grenouille', name:'Grenouille', emoji:'🐸', c1:'#6bd16b', c2:'#2c7d2c' },
  { id:'poulpe',  name:'Poulpe',  emoji:'🐙', c1:'#ff6b9d', c2:'#9d2c54' }
];
function mascotById(id){ return MASCOTS.find(m=>m.id===id) || MASCOTS[0]; }

/* ----------------------- Stockage JSON ----------------------- */
function dbPath(name){ return path.join(DATA_DIR, name + '.json'); }
function loadDB(name, def){ try { return JSON.parse(fs.readFileSync(dbPath(name),'utf8')); } catch { return def; } }
function saveDB(name, data){ if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true}); fs.writeFileSync(dbPath(name), JSON.stringify(data,null,2)); }

let users    = loadDB('users', []);
let quizzes  = loadDB('quizzes', []);
let results  = loadDB('results', []);
let stats    = loadDB('stats', { days:{}, totalVisits:0, uniqueVisitors:{} });
// stats.days: { 'YYYY-MM-DD': { visits:int, uniques:int } }
// stats.uniqueVisitors: { visitorId: lastSeenDay }  (pour compter les uniques/jour)
let bans     = loadDB('bans', []);   // [{ name, reason, at, by }]
let championship = loadDB('championship', null); // Championnat Shinsekai (saison unique)
let sessions = {};      // token -> userId
let sessionMeta = {};   // token -> timestamp de creation (pour expiration)
// remember=true -> session 30 jours ('se souvenir de moi'), sinon 24h
function newSession(userId, remember){ const token = genToken(); sessions[token] = userId;
  sessionMeta[token] = Date.now() + (remember ? 30*24*3600*1000 : 24*3600*1000); return token; }

/* ----------------------- Securite mots de passe ----------------------- */
function hashPassword(password, salt){
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash){
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(hash));
}
function uid(p){ return p + '-' + crypto.randomBytes(6).toString('hex'); }
function genToken(){ return crypto.randomBytes(24).toString('hex'); }
function genPin(){ return String(Math.floor(100000 + Math.random()*900000)); }
function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
// Normalise une reponse texte : minuscules, sans accents, sans ponctuation, espaces compresses
function normalizeAns(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
// Distance de Levenshtein (tolerance fautes de frappe pour le mode race)
function levenshtein(a,b){
  const m=a.length,n=b.length; if(!m)return n; if(!n)return m;
  const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++)d[0][j]=j;
  for(let i=1;i<=m;i++)for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1;
    d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c); }
  return d[m][n];
}
// La reponse du joueur correspond-elle (avec tolerance) ? Accepte plusieurs reponses separees par |
function answerMatches(playerAns, correctAns){
  const p=normalizeAns(playerAns); if(!p) return false;
  const variants=String(correctAns||'').split('|').map(normalizeAns).filter(Boolean);
  for(const c of variants){
    if(!c) continue;
    if(p===c) return true;
    // tolerance : 1 faute pour mots courts, 2 pour longs
    const tol = c.length<=5 ? 1 : 2;
    if(levenshtein(p,c) <= tol) return true;
    // le joueur a tape le bon nom dans une phrase
    if(c.length>=4 && p.includes(c)) return true;
  }
  return false;
}

/* ----------------------- Seed SUPER-ADMIN permanent + demo ----------------------- */
function seed(){
  // Nettoyage : retirer toute trace de l'ancien compte 'Adonaishinsekai'
  // (sauf si c'est le compte principal u-admin renomme plus bas).
  const stale = users.filter(u => u.username.toLowerCase()==='adonaishinsekai' && u.id!=='u-admin');
  if(stale.length){ users = users.filter(u => !(u.username.toLowerCase()==='adonaishinsekai' && u.id!=='u-admin'));
    saveDB('users', users); console.log('[seed] Ancien compte Adonaishinsekai supprime.'); }
  // Migration : si l'ancien super-admin existait sous un autre nom, on le renomme (garde l'id/le compte).
  const legacy = users.find(u => u.id==='u-admin' && u.username.toLowerCase() !== ADMIN_USERNAME.toLowerCase());
  if(legacy){ legacy.username = ADMIN_USERNAME; legacy.role='superadmin'; saveDB('users', users);
    console.log('[seed] Super-admin renomme en ' + ADMIN_USERNAME + ' (compte conserve).'); }
  // Securite : un seul super-admin. Tout autre superadmin est retrograde admin.
  users.forEach(u => { if(u.role==='superadmin' && u.username.toLowerCase()!==ADMIN_USERNAME.toLowerCase()){ u.role='admin'; } });
  // Compte super-admin permanent (indestructible). Cree s'il n'existe pas.
  let sa = users.find(u => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase());
  if(!sa){
    const { salt, hash } = hashPassword(ADMIN_PASSWORD);
    sa = { id:'u-admin', username:ADMIN_USERNAME, salt, hash, role:'superadmin',
           securityQuestions:null, createdAt:Date.now() };
    users.push(sa);
    saveDB('users', users);
    console.log('[seed] Compte super-admin initialise.');
  } else if(sa.role !== 'superadmin'){
    // Migration : l'ancien compte admin devient superadmin
    sa.role = 'superadmin';
    saveDB('users', users);
    console.log('[seed] Compte ' + ADMIN_USERNAME + ' promu SUPER-ADMIN.');
  }
  if(!quizzes.find(q => q.id === 'demo-quiz')){
    quizzes.push({
      id:'demo-quiz', ownerId:'u-admin', ownerName:ADMIN_USERNAME,
      title:'Quiz Demo - Les Esprits Kitsune',
      description:'Quiz de demonstration pour tester la plateforme.',
      createdAt: Date.now(),
      questions:[
        { type:'qcm', text:'Quel animal le masque Kitsune represente-t-il ?', time:20,
          options:['Le renard','Le loup','Le tigre','Le dragon'], correct:[0] },
        { type:'tf', text:'Le rouge et le noir sont les couleurs du logo Shisnekai no Kami.', time:15,
          options:['Vrai','Faux'], correct:[0] },
        { type:'qcm', text:'Combien de participants maximum par room ?', time:20,
          options:['10','50','100','1000'], correct:[2] },
        { type:'qcm', text:'Que signifie Kami en japonais ?', time:25,
          options:['Esprit / divinite','Guerrier','Montagne','Riviere'], correct:[0] },
        { type:'tf', text:'Le createur du quiz voit le classement final complet.', time:15,
          options:['Vrai','Faux'], correct:[0] },
        { type:'qcm', text:'Quel monument japonais voyez-vous sur cette image ?', time:20,
          options:['Un torii','Une pagode','Un pont','Un chateau'], correct:[0],
          image: DEMO_IMAGE },
        { type:'qcm', text:'Quel est ce son ?', time:20,
          options:['Un bip electronique','Un tambour','Une cloche','Un sifflet'], correct:[0],
          audio: DEMO_AUDIO }
      ]
    });
    saveDB('quizzes', quizzes);
    console.log('[seed] Quiz demo cree.');
  }
}
seed();

/* ----------------------- App Express ----------------------- */
const app = express();
app.use(express.json({ limit: '40mb' })); // 40mb : accueille les medias (images/audios) en base64
app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next){
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const userId = sessions[token];
  const user = userId && users.find(u => u.id === userId);
  if(!user) return res.status(401).json({ error: 'Non authentifie' });
  req.user = user; req.token = token; next();
}
function isAdminish(u){ return u && (u.role==='admin' || u.role==='superadmin'); }
function adminOnly(req,res,next){ if(!isAdminish(req.user)) return res.status(403).json({error:'Reserve admin.'}); next(); }
function superAdminOnly(req,res,next){ if(req.user.role!=='superadmin') return res.status(403).json({error:'Reserve au super-admin.'}); next(); }
function publicUser(u){ return { id:u.id, username:u.username, role:u.role, hasSecurityQuestions: !!(u.securityQuestions && u.securityQuestions.length>=1) }; }

/* ---------- Anti-bots (protections invisibles, sans captcha visuel) ---------- */
const regByIp = {};    // ip -> [timestamps] des inscriptions
const loginFails = {}; // ip -> { count, until }  (throttle apres echecs)
function clientIp(req){ return (req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; }
function tooManyRegistrations(ip){
  const now = Date.now();
  regByIp[ip] = (regByIp[ip]||[]).filter(t => now - t < 3600*1000); // fenetre 1h
  return regByIp[ip].length >= 5; // max 5 comptes / heure / IP
}
function markRegistration(ip){ (regByIp[ip] = regByIp[ip]||[]).push(Date.now()); }
function loginBlocked(ip){ const e = loginFails[ip]; return e && e.until > Date.now(); }
function noteLoginFail(ip){
  const e = loginFails[ip] || { count:0, until:0 };
  e.count++;
  if(e.count >= 5) e.until = Date.now() + 60*1000; // 5 echecs -> blocage 60s
  loginFails[ip] = e;
}
function resetLoginFail(ip){ delete loginFails[ip]; }

/* ---- Auth ---- */
app.post('/api/register', (req, res) => {
  const { username, password, website, formTs } = req.body || {};
  const ip = clientIp(req);
  // Anti-bot 1 : honeypot (champ cache "website" ; un humain ne le remplit jamais)
  if(website){ return res.status(400).json({ error:'Inscription refusee.' }); }
  // Anti-bot 2 : delai minimum (formulaire soumis trop vite = bot)
  if(formTs && (Date.now() - Number(formTs)) < 1500){ return res.status(400).json({ error:'Trop rapide, reessayez.' }); }
  // Anti-bot 3 : limite par IP
  if(tooManyRegistrations(ip)){ return res.status(429).json({ error:'Trop d\'inscriptions depuis ce reseau. Reessayez plus tard.' }); }

  if(!username || username.trim().length < 3) return res.status(400).json({ error:'Nom trop court (min 3).' });
  if(!password || password.length < 4) return res.status(400).json({ error:'Mot de passe trop court (min 4).' });
  if(users.find(u => u.username.toLowerCase() === username.trim().toLowerCase()))
    return res.status(400).json({ error:'Ce nom est deja pris.' });
  const { salt, hash } = hashPassword(password);
  const u = { id: uid('u'), username: username.trim(), salt, hash, role:'user', securityQuestions:null, createdAt: Date.now() };
  users.push(u); saveDB('users', users);
  markRegistration(ip);
  const token = newSession(u.id);
  res.json({ token, user: publicUser(u) });
});
app.post('/api/login', (req, res) => {
  const { username, password, remember } = req.body || {};
  const ip = clientIp(req);
  // Anti-brute-force : blocage temporaire apres trop d'echecs
  if(loginBlocked(ip)) return res.status(429).json({ error:'Trop de tentatives. Patientez une minute.' });
  const u = users.find(x => x.username.toLowerCase() === String(username||'').trim().toLowerCase());
  if(!u || !verifyPassword(password||'', u.salt, u.hash)){
    noteLoginFail(ip);
    return res.status(401).json({ error:'Identifiants incorrects.' });
  }
  resetLoginFail(ip);
  const token = newSession(u.id, !!remember);  // 'se souvenir de moi' -> session longue (30j)
  res.json({ token, user: publicUser(u), remember: !!remember });
});
app.post('/api/logout', authMiddleware, (req, res) => { delete sessions[req.token]; delete sessionMeta[req.token]; res.json({ ok:true }); });
app.get('/api/me', authMiddleware, (req, res) => res.json({ user: publicUser(req.user) }));

// Changer son mot de passe (utile pour l'admin "que je vais changer")
app.post('/api/change-password', authMiddleware, (req,res)=>{
  const { oldPassword, newPassword } = req.body || {};
  if(!verifyPassword(oldPassword||'', req.user.salt, req.user.hash))
    return res.status(400).json({ error:'Ancien mot de passe incorrect.' });
  if(!newPassword || newPassword.length < 4) return res.status(400).json({ error:'Nouveau mot de passe trop court (min 4).' });
  const { salt, hash } = hashPassword(newPassword);
  req.user.salt = salt; req.user.hash = hash; saveDB('users', users);
  res.json({ ok:true });
});

/* ---- Question(s) de securite + recuperation de mot de passe (TOUS les comptes) ---- */
// Definir 1 a 3 questions de securite (reponses hashees scrypt). Une seule suffit.
app.post('/api/security-questions', authMiddleware, (req,res)=>{
  let list = req.body.questions; // [{question, answer}, ...] 1 a 3
  if(!Array.isArray(list)) list = [];
  list = list.filter(it => it && String(it.question||'').trim() && String(it.answer||'').trim());
  if(list.length < 1) return res.status(400).json({ error:'Au moins une question/reponse est requise.' });
  if(list.length > 3) list = list.slice(0,3);
  req.user.securityQuestions = list.map(it=>{
    const ans = String(it.answer).trim().toLowerCase();
    const { salt, hash } = hashPassword(ans);
    return { question: String(it.question).trim(), salt, hash };
  });
  saveDB('users', users);
  res.json({ ok:true, count:req.user.securityQuestions.length });
});
// Etape 1 recuperation : recuperer les intitules des questions d'un compte
app.post('/api/recover/questions', (req,res)=>{
  const u = users.find(x=>x.username.toLowerCase()===String(req.body.username||'').trim().toLowerCase());
  if(!u) return res.status(404).json({ error:'Compte introuvable.' });
  if(!u.securityQuestions || u.securityQuestions.length<1)
    return res.status(400).json({ error:'Aucune question de securite definie. Connectez-vous une fois pour la configurer.' });
  res.json({ questions: u.securityQuestions.map(q=>q.question) });
});
// Etape 2 recuperation : verifier les reponses (toutes) et definir un nouveau mot de passe
app.post('/api/recover/reset', (req,res)=>{
  const u = users.find(x=>x.username.toLowerCase()===String(req.body.username||'').trim().toLowerCase());
  if(!u) return res.status(404).json({ error:'Compte introuvable.' });
  const qs = u.securityQuestions || [];
  if(qs.length<1) return res.status(400).json({ error:'Aucune question de securite.' });
  const answers = req.body.answers;
  if(!Array.isArray(answers) || answers.length!==qs.length) return res.status(400).json({ error:'Repondez a toutes les questions.' });
  let allOk = true;
  for(let i=0;i<qs.length;i++){
    const a = String(answers[i]||'').trim().toLowerCase();
    try{ if(!verifyPassword(a, qs[i].salt, qs[i].hash)) allOk=false; }
    catch{ allOk=false; }
  }
  if(!allOk) return res.status(403).json({ error:'Reponse(s) incorrecte(s).' });
  const np = req.body.newPassword;
  if(!np || np.length<4) return res.status(400).json({ error:'Nouveau mot de passe trop court (min 4).' });
  const { salt, hash } = hashPassword(np);
  u.salt = salt; u.hash = hash; saveDB('users', users);
  res.json({ ok:true });
});

/* ---- Quiz ---- */
app.get('/api/quizzes', authMiddleware, (req, res) => {
  const mine = quizzes.filter(q => q.ownerId === req.user.id || isAdminish(req.user));
  res.json({ quizzes: mine });
});
app.post('/api/quizzes', authMiddleware, (req, res) => {
  const q = req.body || {};
  if(!q.title || !q.title.trim()) return res.status(400).json({ error:'Titre requis.' });
  if(!Array.isArray(q.questions) || q.questions.length === 0) return res.status(400).json({ error:'Au moins une question requise.' });
  const existing = q.id && quizzes.find(x => x.id === q.id);
  if(existing){
    if(existing.ownerId !== req.user.id && !isAdminish(req.user)) return res.status(403).json({ error:'Non autorise.' });
    Object.assign(existing, { title:q.title, description:q.description||'', questions:q.questions, iaShared: !!q.iaShared });
    saveDB('quizzes', quizzes); return res.json({ quiz: existing });
  }
  const nq = { id: uid('quiz'), ownerId: req.user.id, ownerName: req.user.username,
    title: q.title.trim(), description: q.description || '', createdAt: Date.now(), questions: q.questions, iaShared: !!q.iaShared };
  quizzes.push(nq); saveDB('quizzes', quizzes); res.json({ quiz: nq });
});
app.delete('/api/quizzes/:id', authMiddleware, (req, res) => {
  const q = quizzes.find(x => x.id === req.params.id);
  if(!q) return res.status(404).json({ error:'Introuvable.' });
  if(q.ownerId !== req.user.id && !isAdminish(req.user)) return res.status(403).json({ error:'Non autorise.' });
  quizzes = quizzes.filter(x => x.id !== req.params.id); saveDB('quizzes', quizzes); res.json({ ok:true });
});

/* ---- Resultats ---- */
app.get('/api/results', authMiddleware, (req, res) => {
  const mine = results.filter(r => r.hostId === req.user.id || isAdminish(req.user)).sort((a,b) => b.playedAt - a.playedAt);
  res.json({ results: mine });
});
app.get('/api/results/:id', authMiddleware, (req, res) => {
  const r = results.find(x => x.id === req.params.id);
  if(!r) return res.status(404).json({ error:'Introuvable.' });
  if(r.hostId !== req.user.id && !isAdminish(req.user)) return res.status(403).json({ error:'Non autorise.' });
  res.json({ result: r });
});

/* ---- Mascottes ---- */
app.get('/api/mascots', (req,res)=> res.json({ mascots: MASCOTS }));

/* ---- Admin : comptes, bans, code ---- */
app.get('/api/admin/overview', authMiddleware, adminOnly, (req, res) => {
  res.json({
    me: { role: req.user.role },
    users: users.map(u => ({ id:u.id, username:u.username, role:u.role, createdAt:u.createdAt })),
    quizCount: quizzes.length, resultCount: results.length, bans
  });
});
app.delete('/api/admin/users/:id', authMiddleware, superAdminOnly, (req, res) => {
  if(req.params.id === 'u-admin') return res.status(400).json({ error:'Compte super-admin protege.' });
  const target = users.find(u=>u.id===req.params.id);
  if(target && target.role==='superadmin') return res.status(400).json({ error:'Le super-admin est indestructible.' });
  users = users.filter(u => u.id !== req.params.id); saveDB('users', users); res.json({ ok:true });
});

/* ---- Gestion des roles : reserve au SUPER-ADMIN ---- */
app.post('/api/admin/promote', authMiddleware, superAdminOnly, (req,res)=>{
  const u = users.find(x=>x.id===req.body.id);
  if(!u) return res.status(404).json({ error:'Compte introuvable.' });
  if(u.role==='superadmin') return res.status(400).json({ error:'Deja super-admin.' });
  u.role='admin'; saveDB('users', users); res.json({ ok:true, role:u.role });
});
app.post('/api/admin/revoke', authMiddleware, superAdminOnly, (req,res)=>{
  const u = users.find(x=>x.id===req.body.id);
  if(!u) return res.status(404).json({ error:'Compte introuvable.' });
  if(u.role==='superadmin') return res.status(400).json({ error:'Impossible de revoquer le super-admin.' });
  u.role='user'; saveDB('users', users); res.json({ ok:true, role:u.role });
});

/* ---- Bannir / debannir : reserve au SUPER-ADMIN ---- */
app.post('/api/admin/ban', authMiddleware, superAdminOnly, (req,res)=>{
  const name = String(req.body.name||'').trim();
  if(!name) return res.status(400).json({error:'Nom requis.'});
  // Le super-admin ne peut pas etre banni
  const targetUser = users.find(u=>u.username.toLowerCase()===name.toLowerCase());
  if(targetUser && targetUser.role==='superadmin') return res.status(400).json({ error:'Le super-admin ne peut pas etre banni.' });
  if(!bans.find(b=>b.name.toLowerCase()===name.toLowerCase())){
    bans.push({ name, reason:req.body.reason||'Non-respect des regles', at:Date.now(), by:req.user.username });
    saveDB('bans', bans);
  }
  kickBannedEverywhere(name);
  res.json({ ok:true, bans });
});
app.post('/api/admin/unban', authMiddleware, superAdminOnly, (req,res)=>{
  const name = String(req.body.name||'').trim();
  bans = bans.filter(b=>b.name.toLowerCase()!==name.toLowerCase());
  saveDB('bans', bans); res.json({ ok:true, bans });
});
app.get('/api/admin/bans', authMiddleware, adminOnly, (req,res)=> res.json({ bans }));
// Acces au code source (admin) : liste + lecture seule des fichiers du projet
const CODE_FILES = ['server.js','question-bank.js','demo-media.js','room-store.js','package.json','render.yaml','public/index.html','public/play.html','public/style.css','public/qrcode.js','public/sound.js','public/manifest.json','public/sw.js','public/cgu.js','README.md','AUDIT-ROBUSTESSE.md','GUIDE-EN-LIGNE-GRATUIT.md'];
app.get('/api/admin/code', authMiddleware, adminOnly, (req,res)=> res.json({ files: CODE_FILES }));
app.get('/api/admin/code/file', authMiddleware, adminOnly, (req,res)=>{
  const f = String(req.query.f||'');
  if(!CODE_FILES.includes(f)) return res.status(400).json({error:'Fichier non autorise.'});
  try{ const content = fs.readFileSync(path.join(__dirname,f),'utf8'); res.json({ file:f, content }); }
  catch{ res.status(404).json({error:'Introuvable.'}); }
});

function isBanned(name){ return bans.some(b=>b.name.toLowerCase()===String(name).toLowerCase()); }

/* =========================================================================
   STATISTIQUES (visiteurs / jour, affluence) + suivi de visite
   ========================================================================= */
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function recordVisit(visitorId){
  const day = todayKey();
  if(!stats.days[day]) stats.days[day] = { visits:0, uniques:0 };
  stats.days[day].visits++;
  stats.totalVisits = (stats.totalVisits||0) + 1;
  // unique par jour : on garde le dernier jour vu pour chaque visiteur
  if(visitorId){
    if(stats.uniqueVisitors[visitorId] !== day){
      stats.uniqueVisitors[visitorId] = day;
      stats.days[day].uniques++;
    }
  }
  saveDB('stats', stats);
}
// Ping de visite envoye par le client (avec un id de visiteur stocke en localStorage)
app.post('/api/visit', (req,res)=>{
  const vid = String(req.body && req.body.vid || '').slice(0,64) || null;
  recordVisit(vid);
  res.json({ ok:true });
});

// Niveau d'affluence selon le nb de visites du jour
function affluenceLevel(visits){
  if(visits >= 200) return { label:'Très élevé', level:5, color:'#d11414' };
  if(visits >= 80)  return { label:'Élevé',      level:4, color:'#e8550e' };
  if(visits >= 30)  return { label:'Moyen',      level:3, color:'#e8b400' };
  if(visits >= 10)  return { label:'Faible',     level:2, color:'#2b6bd1' };
  return { label:'Très faible', level:1, color:'#888' };
}

// Stats : reserve au SUPER-ADMIN
app.get('/api/admin/stats', authMiddleware, superAdminOnly, (req,res)=>{
  const day = todayKey();
  const todayStats = stats.days[day] || { visits:0, uniques:0 };
  // 14 derniers jours pour le graphe
  const series = [];
  for(let i=13;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const k = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    const s = stats.days[k] || { visits:0, uniques:0 };
    series.push({ day:k, label:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'), visits:s.visits, uniques:s.uniques });
  }
  // Repartition des parties par mode
  const byMode = { multi:0, versus:0, solo:0 };
  results.forEach(r=>{ if(r.mode==='versus') byMode.versus++; else if(r.mode==='solo') byMode.solo++; else byMode.multi++; });
  // 7 derniers jours : total visites + uniques
  const last7 = series.slice(-7);
  const visits7 = last7.reduce((a,b)=>a+b.visits,0);
  const uniques7 = last7.reduce((a,b)=>a+b.uniques,0);

  res.json({
    totalVisits: stats.totalVisits||0,
    uniqueVisitorsAllTime: Object.keys(stats.uniqueVisitors||{}).length,
    today: { ...todayStats, affluence: affluenceLevel(todayStats.visits) },
    series,
    week: { visits: visits7, uniques: uniques7 },
    games: { total: results.length, byMode },
    accounts: users.length
  });
});

/* =========================================================================
   MODES SOLO IA  (point 13 : VERSUS 1v1 IA  /  point 14 : SOLO ENTRAINEMENT)
   - Generation de 10 questions via l'agent Kami (banque locale).
   - Logique entierement en REST (aucun WebSocket supplementaire).
   - La "logique Kami simulee cote serveur via setTimeout" est calculee au
     lancement : pour chaque question, on tire si Kami repond juste (selon la
     difficulte) et son temps de reponse (2 .. time-1 s) ; on agrege le score.
   ========================================================================= */
// Une question de quiz est compatible IA si c'est un QCM avec >=2 options et une bonne reponse
function quizQcmQuestions(quiz){
  return (quiz.questions||[]).filter(q => q.type==='qcm' && Array.isArray(q.options) && q.options.length>=2 && Array.isArray(q.correct) && q.correct.length>=1);
}
// Themes communautaires = quiz partages par leurs compositeurs et ayant assez de QCM
function communityThemes(){
  return quizzes
    .filter(q => q.iaShared && quizQcmQuestions(q).length >= 4)
    .map(q => ({ id:'comm:'+q.id, name:q.title, emoji:'🧩', community:true,
                 author:q.ownerName, count:quizQcmQuestions(q).length }));
}
// Genere n questions pour un theme builtin OU communautaire (id 'comm:<quizId>')
function buildQuestions(theme, difficulte, n){
  n = n || 10;
  if(typeof theme === 'string' && theme.indexOf('comm:')===0){
    const quizId = theme.slice(5);
    const quiz = quizzes.find(q=>q.id===quizId);
    if(quiz && quiz.iaShared){
      const qs = quizQcmQuestions(quiz);
      // melange + normalise (on garde le temps de la question, sinon 15s)
      const shuffled = qs.slice().sort(()=>Math.random()-0.5).slice(0, n);
      return shuffled.map(q=>({ type:'qcm', text:q.text, options:q.options.slice(),
        correct:[ q.correct[0] ], time: q.time || 15,
        image: q.image||null, audio: q.audio||null }));   // Option B : medias des quiz partages
    }
  }
  // fallback : banque integree
  return genererQuestions(theme, difficulte, n);
}

app.get('/api/ia/options', authMiddleware, (req,res)=>{
  res.json({
    themes: THEMES,
    community: communityThemes(),
    difficulties: DIFFICULTIES.map(d=>({id:d.id,name:d.name,proba:d.proba}))
  });
});

// Calcule le deroulement de Kami pour un set de questions (probas + temps)
function simulateKami(questions, proba){
  // Bareme identique au jeu : 500 + 500 * ratio de temps restant
  let score = 0;
  const perQuestion = questions.map(q=>{
    const correct = Math.random() < proba;
    // temps de reponse aleatoire entre 2 et time-1 (au moins 2, au plus time-1)
    const maxT = Math.max(2, q.time - 1);
    const tResp = 2 + Math.random() * Math.max(0.001, (maxT - 2));
    const ratio = Math.max(0, (q.time - tResp) / q.time);
    const pts = correct ? Math.round(500 + 500 * ratio) : 0;
    score += pts;
    return { correct, tResp: Math.round(tResp*10)/10, pts };
  });
  return { score, perQuestion };
}

// VERSUS : demarre une partie 1v1 contre Kami
app.post('/api/ia/versus/start', authMiddleware, (req,res)=>{
  const theme = req.body.theme, difficulte = req.body.difficulte;
  const diff = DIFFICULTIES.find(d=>d.id===difficulte) || DIFFICULTIES[1];
  const questions = buildQuestions(theme, diff.id, 10);
  const kami = simulateKami(questions, diff.proba);
  const sessionId = uid('versus');
  // on stocke la session en memoire (le client renvoie ses reponses a la fin)
  iaSessions[sessionId] = {
    mode:'versus', userId:req.user.id, userName:req.user.username,
    theme, difficulte:diff.id, questions, kami, createdAt:Date.now()
  };
  // On expose les questions SANS la bonne reponse (correct envoye a la reveal cote client par index)
  res.json({
    sessionId, theme, difficulte:diff.id, kamiProba:diff.proba,
    questions: questions.map(q=>({ text:q.text, options:q.options, time:q.time, image:q.image||null, audio:q.audio||null })),
    // mode solo contre IA : on fournit l'index correct au client pour le feedback immediat
    correct: questions.map(q=>q.correct[0]),
    // pour l'affichage progressif, on donne le plan de Kami (correct + temps) question par question
    kamiPlan: kami.perQuestion.map(k=>({ correct:k.correct, tResp:k.tResp }))
  });
});

// VERSUS : termine et enregistre le resultat (le client envoie ses bonnes/mauvaises + score)
app.post('/api/ia/versus/finish', authMiddleware, (req,res)=>{
  const s = iaSessions[req.body.sessionId];
  if(!s || s.userId!==req.user.id || s.mode!=='versus') return res.status(404).json({ error:'Session introuvable.' });
  const myScore = Math.max(0, parseInt(req.body.score)||0);
  const myGood = Math.max(0, parseInt(req.body.good)||0);
  const kamiScore = s.kami.score;
  const kamiGood = s.kami.perQuestion.filter(k=>k.correct).length;
  const outcome = myScore>kamiScore ? 'victoire' : (myScore<kamiScore ? 'defaite' : 'egalite');
  const record = {
    id: uid('res'), mode:'versus', quizTitle:'Versus IA — '+themeName(s.theme),
    hostId:s.userId, hostName:s.userName, playedAt:Date.now(),
    theme:s.theme, difficulte:s.difficulte, totalQuestions:s.questions.length,
    outcome, leaderboard:[
      { rank: myScore>=kamiScore?1:2, name:s.userName, score:myScore, good:myGood },
      { rank: kamiScore>myScore?1:2, name:'Kami 🦊', score:kamiScore, good:kamiGood }
    ]
  };
  results.push(record); saveDB('results', results);
  delete iaSessions[req.body.sessionId];
  res.json({ ok:true, outcome, myScore, kamiScore, kamiGood, message: kamiVersusMessage(outcome) });
});

// SOLO ENTRAINEMENT : genere 10 questions (relaxe = sans chrono)
app.post('/api/ia/solo/start', authMiddleware, (req,res)=>{
  const theme = req.body.theme, difficulte = req.body.difficulte, relaxe = !!req.body.relaxe;
  const diff = DIFFICULTIES.find(d=>d.id===difficulte) || DIFFICULTIES[1];
  const questions = buildQuestions(theme, diff.id, 10);
  const sessionId = uid('solo');
  iaSessions[sessionId] = { mode:'solo', userId:req.user.id, userName:req.user.username,
    theme, difficulte:diff.id, relaxe, questions, createdAt:Date.now() };
  res.json({
    sessionId, theme, difficulte:diff.id, relaxe,
    questions: questions.map(q=>({ text:q.text, options:q.options, time: relaxe?0:q.time, image:q.image||null, audio:q.audio||null })),
    correct: questions.map(q=>q.correct[0])
  });
});

// SOLO : termine, calcule recap, enregistre
app.post('/api/ia/solo/finish', authMiddleware, (req,res)=>{
  const s = iaSessions[req.body.sessionId];
  if(!s || s.userId!==req.user.id || s.mode!=='solo') return res.status(404).json({ error:'Session introuvable.' });
  const answers = Array.isArray(req.body.answers) ? req.body.answers : []; // [{opt, timeSec}]
  let good=0, totalTime=0, timeCount=0;
  const missed=[];
  s.questions.forEach((q,i)=>{
    const a = answers[i] || {};
    const correct = q.correct.includes(a.opt);
    if(correct) good++;
    else missed.push({ question:q.text, yourAnswer: (a.opt!=null && q.options[a.opt]!=null)?q.options[a.opt]:'(aucune)', correctAnswer:q.options[q.correct[0]] });
    if(typeof a.timeSec === 'number'){ totalTime += a.timeSec; timeCount++; }
  });
  const total = s.questions.length;
  const pct = Math.round(good/total*100);
  const avgTime = timeCount? Math.round(totalTime/timeCount*10)/10 : null;
  const record = {
    id: uid('res'), mode:'solo', quizTitle:'Solo — '+themeName(s.theme),
    hostId:s.userId, hostName:s.userName, playedAt:Date.now(),
    theme:s.theme, difficulte:s.difficulte, totalQuestions:total,
    good, pct, avgTime,
    leaderboard:[{ rank:1, name:s.userName, score:good, good }]
  };
  results.push(record); saveDB('results', results);
  delete iaSessions[req.body.sessionId];
  res.json({ ok:true, good, total, pct, avgTime, missed, message: kamiSoloMessage(pct) });
});

function themeName(id){
  if(typeof id==='string' && id.indexOf('comm:')===0){ const q=quizzes.find(x=>x.id===id.slice(5)); return q?q.title:'Communaute'; }
  const t=THEMES.find(x=>x.id===id); return t?t.name:id;
}
function kamiVersusMessage(outcome){
  if(outcome==='victoire') return pick(["Tu m'as battu... cette fois. 😼 Bien joue, mortel !","Victoire meritee ! Le Kami s'incline. 🙇","Impressionnant ! Tu as l'esprit vif. 🔥"]);
  if(outcome==='defaite') return pick(["Hehe ! Le Kami reste maitre. Reessaie ! 🦊","Trop facile pour moi... entraine-toi encore ! 😏","Defaite, mais tu apprends. Reviens plus fort ! 💪"]);
  return "Egalite parfaite ! Nos esprits sont a egalite. ⚖️";
}
function kamiSoloMessage(pct){
  if(pct>=90) return "Maitrise totale ! Tu es un veritable esprit du savoir. 👑";
  if(pct>=70) return "Tres bon score ! Encore un effort vers la perfection. 🔥";
  if(pct>=50) return "Pas mal ! La pratique fait le maitre, continue. 💪";
  if(pct>=30) return "Du progres a faire, mais chaque erreur t'enseigne. 🦊";
  return "Le chemin est long, jeune esprit. Ne lache rien ! 🌱";
}
const iaSessions = {}; // sessions IA en memoire

/* Liste des parties en direct que l'on peut regarder (spectateur) */
app.get('/api/live-rooms', authMiddleware, (req,res)=>{
  const live = Object.values(rooms)
    .filter(r => r.allowSpectators !== false && r.state !== 'ended')
    .map(r => ({ pin:r.pin, title: r.quiz?r.quiz.title:'Partie',
      state:r.state, players: Object.values(r.players).filter(p=>p.connected).length,
      spectators: spectatorCount(r) }));
  res.json({ rooms: live });
});

/* =========================================================================
   CHAMPIONNAT SHINSEKAI (20 journees, classement cumulatif facon foot)
   - Membres ajoutes par admin/superadmin.
   - Chaque journee = un quiz joue ; les points du quiz s'ajoutent au cumul.
   - Bonus "foot" : a chaque journee, le 1er gagne +3 pts de classement,
     le 2e +2, le 3e +1 (en plus des points de score). Configurable.
   - Le classement repart du cumul precedent et le marquoir monte pendant la journee.
   ========================================================================= */
const CHAMP_DAYS = 20;
const CHAMP_DIVISIONS = 3;     // D1, D2, D3
const PROMO_RELEGATE = 5;      // 5 montent / 5 descendent en fin de saison
function defaultDivisions(){
  // Noms otaku dans l'esprit Shinsekai no Kami (神 = divinité/esprit)
  return [
    { id:1, name:'Ligue des Kami 神',      short:'D1', emoji:'🐉', sub:'Élite — les dieux du savoir' },
    { id:2, name:'Voie des Senpai',         short:'D2', emoji:'⚔️', sub:'Les guerriers confirmés' },
    { id:3, name:'Cercle des Kohai',        short:'D3', emoji:'🌱', sub:'Les apprentis ninja' }
  ];
}
function defaultChampionship(){
  return {
    name: 'Championnat Shinsekai',
    season: 1,
    totalDays: CHAMP_DAYS,
    divisions: defaultDivisions(),
    promoRelegate: PROMO_RELEGATE,
    members: [],   // [{ id, name, mascot, division(1..3), addedBy, at }]
    days: [],      // [{ day, division, quizId, quizTitle, playedAt, results:[...] }]
    createdAt: Date.now()
  };
}
function ensureChampionship(){
  if(!championship){ championship = defaultChampionship(); saveDB('championship', championship); }
  // Migration douce : si une ancienne version sans divisions existe
  if(!championship.divisions){ championship.divisions = defaultDivisions(); }
  if(!championship.promoRelegate) championship.promoRelegate = PROMO_RELEGATE;
  championship.members.forEach(m=>{ if(!m.division) m.division = 1; });
  return championship;
}

// Classement cumulatif PAR DIVISION : score cumule + points de classement (facon foot)
function champStandings(division){
  const c = ensureChampionship();
  const map = {};
  c.members.filter(m=>m.division===division).forEach(m => map[m.id] = {
    memberId:m.id, name:m.name, mascot:m.mascot||'ninja', division:m.division,
    totalScore:0, rankPts:0, played:0, wins:0, podiums:0, bestScore:0 });
  c.days.filter(d=>d.division===division).forEach(d => {
    (d.results||[]).forEach(r => {
      const e = map[r.memberId]; if(!e) return;
      e.totalScore += (r.score||0); e.rankPts += (r.rankPts||0); e.played += 1;
      if(r.dayRank===1) e.wins++;
      if(r.dayRank && r.dayRank<=3) e.podiums++;
      if((r.score||0) > e.bestScore) e.bestScore = r.score||0;
    });
  });
  return Object.values(map)
    .sort((a,b)=> (b.rankPts-a.rankPts) || (b.totalScore-a.totalScore))
    .map((e,i)=>({ ...e, rank:i+1 }));
}
function allStandings(){ const c=ensureChampionship(); const out={}; c.divisions.forEach(d=>out[d.id]=champStandings(d.id)); return out; }

// Enregistre AUTOMATIQUEMENT une journee depuis une partie live (liee a une division).
function recordChampDayFromGame(room, lb){
  const c = ensureChampionship();
  const day = room.champDay, division = room.champDivision || 1;
  if(!day) return;
  if(c.days.find(d=>d.day===day && d.division===division)) return; // 1 essai par journee+division
  const dayResults = [];
  let rankCounter = 0;
  lb.forEach(p => {
    const member = c.members.find(m=>m.name.toLowerCase()===p.name.toLowerCase() && m.division===division);
    if(!member) return; // seuls les membres de CETTE division comptent
    rankCounter++;
    const dayRank = rankCounter;
    const rankPts = dayRank===1?3 : dayRank===2?2 : dayRank===3?1 : 0;
    dayResults.push({ memberId:member.id, name:member.name, score:p.score||0, good:p.good||0, dayRank, rankPts });
  });
  c.days.push({ day, division, quizId:room.quiz.id, quizTitle:room.quiz.title, playedAt:Date.now(), results:dayResults, live:true });
  c.days.sort((a,b)=> a.day-b.day || a.division-b.division);
  c.currentDay = Math.max(c.currentDay, day);
  saveDB('championship', championship);
}

// Lecture (tout le monde connecte)
app.get('/api/championship', authMiddleware, (req,res)=>{
  const c = ensureChampionship();
  res.json({
    name:c.name, season:c.season, totalDays:c.totalDays, currentDay:c.currentDay,
    divisions:c.divisions, promoRelegate:c.promoRelegate,
    members:c.members,
    days:c.days.map(d=>({ day:d.day, division:d.division, quizTitle:d.quizTitle, playedAt:d.playedAt })),
    standings: allStandings(),
    canManage: isAdminish(req.user)
  });
});
app.get('/api/championship/day/:div/:n', authMiddleware, (req,res)=>{
  const c = ensureChampionship();
  const d = c.days.find(x=>x.day===parseInt(req.params.n) && x.division===parseInt(req.params.div));
  if(!d) return res.status(404).json({ error:'Journee non jouee.' });
  res.json({ day:d });
});

// --- Gestion (admin / superadmin) ---
app.post('/api/championship/reset', authMiddleware, adminOnly, (req,res)=>{
  championship = defaultChampionship();
  if(req.body.name) championship.name = String(req.body.name).slice(0,60);
  saveDB('championship', championship);
  res.json({ ok:true, championship });
});
app.post('/api/championship/members', authMiddleware, adminOnly, (req,res)=>{
  const c = ensureChampionship();
  const name = String(req.body.name||'').trim().slice(0,30);
  const division = [1,2,3].includes(parseInt(req.body.division)) ? parseInt(req.body.division) : 3; // par defaut D3
  if(!name) return res.status(400).json({ error:'Nom requis.' });
  if(c.members.some(m=>m.name.toLowerCase()===name.toLowerCase())) return res.status(400).json({ error:'Membre deja inscrit.' });
  const m = { id: uid('m'), name, mascot: req.body.mascot||'ninja', division, addedBy:req.user.username, at:Date.now() };
  c.members.push(m); saveDB('championship', championship);
  res.json({ ok:true, member:m, standings:allStandings() });
});
// Deplacer un membre de division (montee/descente manuelle ponctuelle)
app.post('/api/championship/move-member', authMiddleware, adminOnly, (req,res)=>{
  const c = ensureChampionship();
  const m = c.members.find(x=>x.id===req.body.id);
  const division = parseInt(req.body.division);
  if(!m) return res.status(404).json({ error:'Membre introuvable.' });
  if(![1,2,3].includes(division)) return res.status(400).json({ error:'Division invalide.' });
  m.division = division; saveDB('championship', championship);
  res.json({ ok:true, standings:allStandings() });
});
app.delete('/api/championship/members/:id', authMiddleware, adminOnly, (req,res)=>{
  const c = ensureChampionship();
  c.members = c.members.filter(m=>m.id!==req.params.id);
  saveDB('championship', championship);
  res.json({ ok:true, standings:allStandings() });
});
// Saisie manuelle d'une journee (secours) : body { day, division, quizTitle, results:[{name,score,good}] }
app.post('/api/championship/record-day', authMiddleware, adminOnly, (req,res)=>{
  const c = ensureChampionship();
  const day = parseInt(req.body.day) || (c.currentDay+1);
  const division = [1,2,3].includes(parseInt(req.body.division)) ? parseInt(req.body.division) : 1;
  if(day<1 || day>c.totalDays) return res.status(400).json({ error:'Journee hors limites (1-'+c.totalDays+').' });
  const incoming = Array.isArray(req.body.results) ? req.body.results : [];
  const dayResults = [];
  incoming
    .map(r=>({ name:String(r.name||'').trim(), score:Math.max(0,parseInt(r.score)||0), good:parseInt(r.good)||0 }))
    .filter(r=>r.name)
    .sort((a,b)=>b.score-a.score)
    .forEach((r,i)=>{
      const member = c.members.find(m=>m.name.toLowerCase()===r.name.toLowerCase() && m.division===division);
      if(!member) return;
      const dayRank = i+1;
      const rankPts = dayRank===1?3 : dayRank===2?2 : dayRank===3?1 : 0;
      dayResults.push({ memberId:member.id, name:member.name, score:r.score, good:r.good, dayRank, rankPts });
    });
  const existing = c.days.find(d=>d.day===day && d.division===division);
  const entry = { day, division, quizId:req.body.quizId||null, quizTitle:req.body.quizTitle||('Journee '+day),
    playedAt:Date.now(), results:dayResults };
  if(existing) Object.assign(existing, entry); else c.days.push(entry);
  c.days.sort((a,b)=> a.day-b.day || a.division-b.division);
  c.currentDay = Math.max(c.currentDay, day);
  saveDB('championship', championship);
  res.json({ ok:true, standings:allStandings(), day:entry });
});
// Fin de saison : applique la montee/descente (5 montent / 5 descendent) puis nouvelle saison
app.post('/api/championship/promote-relegate', authMiddleware, adminOnly, (req,res)=>{
  const c = ensureChampionship();
  const N = c.promoRelegate || PROMO_RELEGATE;
  const st = allStandings();
  const moves = [];
  // D2 -> D1 (5 premiers de D2 montent), D1 -> D2 (5 derniers de D1 descendent)
  // D3 -> D2 (5 premiers de D3 montent), D2 -> D3 (5 derniers de D2 descendent)
  function topN(div,n){ return (st[div]||[]).slice(0,n).map(e=>e.memberId); }
  function bottomN(div,n){ const a=st[div]||[]; return a.slice(Math.max(0,a.length-n)).map(e=>e.memberId); }
  // On calcule d'abord la destination de CHAQUE membre, sans conflit.
  // Regle : si une division est trop petite, un membre ne peut pas etre a la fois "promu" ET "relegue".
  // Priorite a la PROMOTION (monter prime sur descendre).
  const promoteSet = new Set([ ...topN(2,N), ...topN(3,N) ]);          // montent
  const relegateSet = new Set([ ...bottomN(1,N), ...bottomN(2,N) ]);   // descendent
  // retire les conflits (promu ET relegue) -> on garde la promotion
  for(const id of promoteSet){ relegateSet.delete(id); }
  const dest = {}; // memberId -> nouvelle division
  topN(2,N).forEach(id=>{ if(!dest[id]) dest[id]=1; });
  topN(3,N).forEach(id=>{ if(!dest[id]) dest[id]=2; });
  bottomN(1,N).forEach(id=>{ if(relegateSet.has(id) && !dest[id]) dest[id]=2; });
  bottomN(2,N).forEach(id=>{ if(relegateSet.has(id) && !dest[id]) dest[id]=3; });
  const labelFor=(from,to)=> 'D'+to+(to<from?' (montée)':' (descente)');
  Object.keys(dest).forEach(id=>{
    const m=c.members.find(x=>x.id===id); if(!m) return;
    const from=m.division, to=dest[id];
    if(to!==from){ m.division=to; moves.push(m.name+' → '+labelFor(from,to)); }
  });
  // nouvelle saison : on archive et repart a zero (les divisions/membres sont conserves)
  c.season += 1; c.currentDay = 0; c.days = [];
  saveDB('championship', championship);
  res.json({ ok:true, moves, season:c.season, standings:allStandings() });
});

/* ---- Pages ---- */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
// Endpoint leger pour UptimeRobot (garde l'app eveillee sans servir tout le HTML)
app.get('/healthz', (req, res) => res.json({ ok:true, uptime: Math.round(process.uptime()), persistance: RoomStore.mode() }));

/* =========================================================================
   WEBSOCKET : rooms temps reel
   ========================================================================= */
const server = http.createServer(app);
// maxPayload reduit a 8MB : suffit pour images compressees, limite le risque memoire/DoS
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 * 1024 });
const rooms = {}; // pin -> room

const REJOIN_WINDOW_MS = 90 * 1000;       // fenetre de reconnexion joueur
const ROOM_TTL_AFTER_END_MS = 30 * 60000; // room conservee 30 min apres la fin
const HEARTBEAT_MS = 25 * 1000;           // ping/pong
const RATE_MAX = 30, RATE_WINDOW_MS = 10 * 1000; // 30 messages / 10s par socket

/* ---- Heartbeat : detecte et coupe les sockets zombies (mobile/3G) ---- */
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if(ws.isAlive === false){ try{ ws.terminate(); }catch{} return; }
    ws.isAlive = false;
    try{ ws.ping(); }catch{}
  });
}, HEARTBEAT_MS);
wss.on('close', () => clearInterval(heartbeat));

/* ---- Nettoyage periodique : rooms expirees, sessions IA orphelines, tokens auth ---- */
const SESSION_TTL_MS = 24 * 3600 * 1000;  // tokens auth valides 24h
const IA_SESSION_TTL_MS = 60 * 60000;     // sessions IA valides 1h
setInterval(() => {
  const now = Date.now();
  // rooms terminees depuis trop longtemps OU vides et inactives
  Object.values(rooms).forEach(room => {
    if(room.state === 'ended' && room.endedAt && (now - room.endedAt) > ROOM_TTL_AFTER_END_MS){
      delete rooms[room.pin];
      unpersistRoom(room.pin);
    }
  });
  // sessions IA jamais terminees
  Object.keys(iaSessions).forEach(id => {
    if(now - (iaSessions[id].createdAt||0) > IA_SESSION_TTL_MS) delete iaSessions[id];
  });
  // tokens auth expires
  Object.keys(sessionMeta).forEach(tok => {
    if((sessionMeta[tok]||0) < now){ delete sessions[tok]; delete sessionMeta[tok]; } // expiration absolue
  });
}, 5 * 60000);

function makeRoom(quiz, hostUserId, hostName, opts){
  opts = opts || {};
  return {
    pin: (() => { let p; do { p = genPin(); } while(rooms[p]); return p; })(),
    mode: opts.mode || 'quiz',   // 'quiz' (classique) | 'race' (buzzer anime)
    quiz, hostUserId, hostName, hostSocket: null,
    players: {},
    teamMode: !!opts.teamMode,            // false = individuel
    teamAssign: opts.teamAssign || 'choose', // 'choose' | 'auto'
    teams: opts.teamMode ? (opts.teams || defaultTeams()) : [],
    state: 'lobby', qIndex: -1, qStartTime: 0, qTime:0,
    answeredThisQ: {}, timer: null,
    allowSpectators: opts.allowSpectators !== false,  // spectateurs autorises par defaut
    spectators: {},   // wsId -> { id, name, socket }
    chat: [],         // historique chat (garde les 50 derniers)
    // --- mode RACE (buzzer) ---
    raceAnswer: null,   // bonne reponse (texte) de la question en cours
    raceWon: false,     // une bonne reponse a deja gagne ?
    raceTries: {}       // playerId -> nb d'essais sur la question
  };
}
function defaultTeams(){
  return [
    { id:'rouge', name:'Esprits Rouges', color:'#d11414' },
    { id:'bleu',  name:'Lames Bleues',   color:'#2b6bd1' }
  ];
}

/* ---------- PERSISTANCE DES ROOMS (survit a un redemarrage serveur) ---------- */
// Cree un snapshot serialisable (sans sockets ni timers). Les joueurs sont conserves
// avec leur sessionToken pour permettre la reconnexion apres redemarrage.
function snapshotRoom(room){
  const players = {};
  Object.values(room.players).forEach(p => {
    players[p.id] = {
      id:p.id, name:p.name, score:p.score, answers:p.answers, mascot:p.mascot,
      teamId:p.teamId, sessionToken:p.sessionToken,
      connected:false, disconnectedAt: p.disconnectedAt || Date.now()
    };
  });
  return {
    pin: room.pin, quiz: room.quiz, hostUserId: room.hostUserId, hostName: room.hostName,
    hostIsAdmin: !!room.hostIsAdmin,
    teamMode: room.teamMode, teamAssign: room.teamAssign, teams: room.teams,
    state: room.state, qIndex: room.qIndex, qStartTime: room.qStartTime, qTime: room.qTime,
    answeredThisQ: room.answeredThisQ, endedAt: room.endedAt || null,
    players, savedAt: Date.now()
  };
}
// Reconstruit une room en memoire a partir d'un snapshot (sockets=null, timers a relancer).
function restoreRoom(snap){
  const room = {
    pin: snap.pin, quiz: snap.quiz, hostUserId: snap.hostUserId, hostName: snap.hostName,
    hostIsAdmin: !!snap.hostIsAdmin, hostSocket: null,
    players: {}, teamMode: snap.teamMode, teamAssign: snap.teamAssign, teams: snap.teams||[],
    state: snap.state, qIndex: snap.qIndex, qStartTime: snap.qStartTime, qTime: snap.qTime,
    answeredThisQ: snap.answeredThisQ || {}, endedAt: snap.endedAt || null, timer: null,
    restored: true
  };
  Object.values(snap.players||{}).forEach(p => {
    room.players[p.id] = {
      id:p.id, name:p.name, score:p.score||0, answers:p.answers||[], mascot:p.mascot,
      teamId:p.teamId, sessionToken:p.sessionToken, socket:null, connected:false,
      disconnectedAt: p.disconnectedAt || Date.now()
    };
  });
  return room;
}
// Persiste (asynchrone, non bloquant). Appele aux transitions cles.
function persistRoom(room){ try{ RoomStore.save(room.pin, snapshotRoom(room)); }catch(e){} }
function unpersistRoom(pin){ try{ RoomStore.remove(pin); }catch(e){} }

// Au demarrage : restaure les rooms et relance les timers des questions en cours.
async function restoreAllRooms(){
  const snaps = await RoomStore.loadAll();
  let count = 0;
  Object.values(snaps).forEach(snap => {
    if(!snap || !snap.pin) return;
    // ignore les rooms terminees depuis > 30 min
    if(snap.state === 'ended' && snap.endedAt && (Date.now()-snap.endedAt) > ROOM_TTL_AFTER_END_MS){ unpersistRoom(snap.pin); return; }
    const room = restoreRoom(snap);
    rooms[room.pin] = room;
    count++;
    // Relance le timer si une question etait en cours
    if(room.state === 'question'){
      const elapsedMs = Date.now() - room.qStartTime;
      const remainingMs = (room.qTime * 1000 + 500) - elapsedMs;
      if(remainingMs <= 0){ revealQuestion(room); }
      else { clearTimeout(room.timer); room.timer = setTimeout(()=>revealQuestion(room), remainingMs); }
    }
  });
  if(count) console.log('[room-store] '+count+' partie(s) restauree(s) apres redemarrage.');
}

function send(ws, type, payload){ if(ws && ws.readyState === 1){ try{ ws.send(JSON.stringify({ type, ...payload })); }catch(e){} } }
// Diffusion non bloquante : on serialise UNE fois et on envoie par lots de 25 via setImmediate
function broadcastPlayers(room, type, payload){
  const data = JSON.stringify({ type, ...payload });
  const sockets = Object.values(room.players).filter(p=>p.connected && p.socket && p.socket.readyState===1).map(p=>p.socket);
  let i=0;
  (function batch(){
    const end = Math.min(i+25, sockets.length);
    for(; i<end; i++){ try{ sockets[i].send(data); }catch(e){} }
    if(i < sockets.length) setImmediate(batch);
  })();
}
function broadcastAll(room, type, payload){ send(room.hostSocket,type,payload); broadcastPlayers(room,type,payload); broadcastSpectators(room,type,payload); }
// Spectateurs : diffusion (chat, reactions, et copie de l'etat de jeu pour qu'ils suivent)
function broadcastSpectators(room, type, payload){
  if(!room.spectators) return;
  const data = JSON.stringify({ type, ...payload });
  Object.values(room.spectators).forEach(s=>{ if(s.socket && s.socket.readyState===1){ try{ s.socket.send(data); }catch(e){} } });
}
function spectatorCount(room){ return room.spectators ? Object.keys(room.spectators).length : 0; }
function pushChat(room, entry){
  if(!room.chat) room.chat=[];
  room.chat.push(entry);
  if(room.chat.length>50) room.chat.shift();
  // chat visible par tout le monde (joueurs, hote, spectateurs)
  send(room.hostSocket,'chat',{ entry }); broadcastPlayers(room,'chat',{ entry }); broadcastSpectators(room,'chat',{ entry });
}

function publicPlayer(p){ return { id:p.id, name:p.name, score:p.score, mascot:p.mascot, teamId:p.teamId, connected:p.connected }; }
// Liste tous les joueurs (avec leur statut connecte) ; en lobby on masque les deconnectes
function playerList(room){
  return Object.values(room.players)
    .filter(p => room.state==='lobby' ? p.connected : true)
    .map(publicPlayer);
}

function leaderboard(room){
  return Object.values(room.players)
    .map(p => ({ id:p.id, name:p.name, score:p.score, mascot:p.mascot, teamId:p.teamId,
                 good: p.answers.filter(a=>a&&a.correct).length, answers:p.answers }))
    .sort((a,b) => b.score - a.score)
    .map((p,i) => ({ ...p, rank: i+1 }));
}
function teamScores(room){
  if(!room.teamMode) return [];
  const map = {};
  room.teams.forEach(t=> map[t.id]={ ...t, score:0, members:0 });
  Object.values(room.players).forEach(p=>{ if(p.teamId && map[p.teamId]){ map[p.teamId].score+=p.score; map[p.teamId].members++; } });
  return Object.values(map).sort((a,b)=>b.score-a.score).map((t,i)=>({...t,rank:i+1}));
}

/* ----------------------- AGENT IA (commentaires) ----------------------- */
function aiSay(room, text, mood){ broadcastAll(room, 'ai', { text, mood: mood||'neutral' }); }

function aiLobbyWelcome(room){
  return pick([
    "Bienvenue dans le sanctuaire ! 🦊 Choisissez votre mascotte, les esprits vous observent...",
    "Ahh, de nouveaux challengers ! Que le meilleur esprit gagne. 🔥",
    "Le Kami du quiz s'eveille. Preparez vos neurones, ca va chauffer ! ⚡"
  ]);
}
function aiQuestionIntro(room, q, idx, total){
  if(idx===0) return pick(["C'est parti ! Premiere question, montrez-moi ce que vous valez. 🥷",
                           "Que la chasse aux points commence ! 🦊"]);
  if(idx===total-1) return pick(["Derniere question ! Tout peut encore basculer... 😈",
                                 "Le grand final ! Donnez tout, esprits courageux. 🐲"]);
  return pick(["Question suivante... concentrez-vous. 🎯",
               "Hmm, celle-ci va en piéger plus d'un. 😏",
               "Allez, encore des points a rafler ! ⚡"]);
}
function aiReveal(room, q, counts){
  const lb = leaderboard(room);
  const total = Object.values(room.players).filter(p=>p.connected).length;
  const correctOpt = q.correct[0];
  const goodCount = (counts[correctOpt]||0);
  const lines = [];
  if(total>0 && goodCount===0) lines.push("Aïe... personne n'a trouve ! Le Kami est dechaine. 😱");
  else if(total>0 && goodCount===total) lines.push("Incroyable, TOUT le monde a bon ! Quel niveau ! 👏");
  else if(goodCount>0) lines.push(pick([`${goodCount} esprit(s) ont vu juste. Bien joue ! ✨`,
                                        "Pas mal, pas mal... mais ca se complique. 😎"]));
  if(lb[0]){
    if(room.teamMode){
      const ts = teamScores(room);
      if(ts[0]) lines.push(`En tête : l'équipe ${ts[0].name} ! 🏆`);
    } else {
      lines.push(pick([`${lb[0].name} ${mascotById(lb[0].mascot).emoji} prend la tête !`,
                       `${lb[0].name} domine pour l'instant. Qui osera le détrôner ? 🔥`]));
    }
  }
  return lines.join(' ');
}
function aiGameOver(room){
  if(room.teamMode){
    const ts = teamScores(room);
    if(ts[0]) return `🏁 Victoire de l'équipe ${ts[0].name} ! Les autres esprits s'inclinent. 🎉`;
  }
  const lb = leaderboard(room);
  if(lb[0]) return `🏁 Et le grand vainqueur est... ${lb[0].name} ${mascotById(lb[0].mascot).emoji} ! Respect, champion ! 👑`;
  return "🏁 Partie terminee. Merci d'avoir joue avec le Kami ! 🦊";
}

/* ----------------------- Boucle de jeu ----------------------- */
function startQuestion(room){
  room.qIndex++;
  if(room.qIndex >= room.quiz.questions.length){ endGame(room); return; }
  const q = room.quiz.questions[room.qIndex];
  room.state = 'question'; room.qStartTime = Date.now(); room.qTime = q.time; room.answeredThisQ = {};

  aiSay(room, aiQuestionIntro(room, q, room.qIndex, room.quiz.questions.length), 'hype');

  send(room.hostSocket, 'question', {
    index: room.qIndex, total: room.quiz.questions.length,
    question: { type:q.type, text:q.text, time:q.time, options:q.options, image:q.image||null, audio:q.audio||null }, correct: q.correct
  });
  broadcastPlayers(room, 'question', {
    index: room.qIndex, total: room.quiz.questions.length,
    qtype: q.type, text: q.text, time: q.time, optionCount: q.options.length, options: q.options,
    image: q.image||null, audio: q.audio||null
  });
  // les spectateurs voient la question (avec le texte des options, mode lecture seule)
  broadcastSpectators(room, 'spectate-question', {
    index: room.qIndex, total: room.quiz.questions.length,
    text: q.text, time: q.time, options: q.options, image: q.image||null
  });
  clearTimeout(room.timer);
  room.timer = setTimeout(() => revealQuestion(room), q.time * 1000 + 500);
  persistRoom(room); // snapshot a chaque nouvelle question (etat + timing)
}

function revealQuestion(room){
  if(room.state !== 'question') return;
  clearTimeout(room.timer);
  const q = room.quiz.questions[room.qIndex];
  room.state = 'reveal';
  const counts = q.options.map(()=>0);
  Object.values(room.players).forEach(p => { const a=p.answers[room.qIndex]; if(a && a.opt!=null && counts[a.opt]!=null) counts[a.opt]++; });
  const lb = leaderboard(room);
  const ts = teamScores(room);

  send(room.hostSocket, 'reveal', {
    index: room.qIndex, correct: q.correct, counts,
    leaderboard: lb.slice(0,20).map(p=>({ id:p.id, name:p.name, score:p.score, mascot:p.mascot })),
    teams: ts,
    isLast: room.qIndex >= room.quiz.questions.length - 1
  });
  Object.values(room.players).forEach(p => {
    const a = p.answers[room.qIndex];
    send(p.socket, 'reveal', {
      youCorrect: a ? a.correct : false, youPts: a ? a.pts : 0, score: p.score,
      rank: lb.find(x=>x.id===p.id)?.rank || null, total: lb.length, correct: q.correct,
      teams: ts
    });
  });
  broadcastSpectators(room, 'spectate-reveal', {
    index: room.qIndex, correct: q.correct, counts,
    leaderboard: lb.slice(0,20).map(p=>({ name:p.name, score:p.score, mascot:p.mascot }))
  });
  setTimeout(()=> aiSay(room, aiReveal(room, q, counts), 'fun'), 700);
  persistRoom(room); // snapshot a la revelation (scores a jour)
  // DUEL / autoPilot : on enchaine automatiquement (pas de bouton hote)
  if(room.autoPilot){
    const last = room.qIndex >= room.quiz.questions.length - 1;
    clearTimeout(room.autoTimer);
    room.autoTimer = setTimeout(()=>{ if(last) endGame(room); else startQuestion(room); }, 3500);
  }
}

function endGame(room){
  clearTimeout(room.timer);
  room.state = 'ended';
  const lb = leaderboard(room);
  const ts = teamScores(room);
  const record = {
    id: uid('res'), quizId: room.quiz.id, quizTitle: room.quiz.title,
    hostId: room.hostUserId, hostName: room.hostName, pin: room.pin, playedAt: Date.now(),
    totalQuestions: room.quiz.questions.length, teamMode: room.teamMode,
    teams: ts.map(t=>({ name:t.name, score:t.score, rank:t.rank })),
    leaderboard: lb.map(p => ({ rank:p.rank, name:p.name, score:p.score, good:p.good, mascot:p.mascot, teamId:p.teamId }))
  };
  results.push(record); saveDB('results', results);
  // Journee de championnat : enregistrement AUTOMATIQUE des scores + bonus (1 essai/jour)
  if(room.champDay){ recordChampDayFromGame(room, lb); }
  send(room.hostSocket, 'gameover', { leaderboard: lb, teams: ts, teamMode:room.teamMode, recordId: record.id, champDay: room.champDay||null, champDivision: room.champDivision||null });
  Object.values(room.players).forEach(p => {
    send(p.socket, 'gameover', {
      rank: lb.find(x=>x.id===p.id)?.rank || null, total: lb.length, score: p.score,
      podium: lb.slice(0,3).map(x=>({name:x.name, score:x.score, mascot:x.mascot})),
      teams: ts, teamMode:room.teamMode
    });
  });
  broadcastSpectators(room, 'spectate-gameover', { leaderboard: lb.slice(0,20).map(p=>({name:p.name,score:p.score,mascot:p.mascot,rank:p.rank})), teams:ts, teamMode:room.teamMode });
  setTimeout(()=> aiSay(room, aiGameOver(room), 'win'), 600);
  room.endedAt = Date.now(); // la room survit 30 min (nettoyage periodique) pour consultation/reconnexion
  persistRoom(room);
}

// Mode RACE : temps ecoule sans bonne reponse -> on revele la reponse
function raceTimeUp(room){
  if(room.mode!=='race' || room.state!=='question' || room.raceWon) return;
  room.state='reveal';
  const lb=leaderboard(room);
  broadcastAll(room,'race-winner',{ winner:null, answer:room.raceAnswer,
    leaderboard: lb.slice(0,20).map(x=>({name:x.name,score:x.score,mascot:x.mascot})) });
  aiSay(room, `⏱️ Temps écoulé ! Personne n'a trouvé. La réponse était : « ${room.raceAnswer} » 🦊`, 'fun');
}

function handleAnswer(room, player, opt){
  // Feedback clair si la reponse arrive trop tard (apres reveal) ou en double
  if(room.state !== 'question'){ send(player.socket, 'answer-too-late', { message:'Temps écoulé pour cette question.' }); return; }
  if(room.answeredThisQ[player.id]){ send(player.socket, 'answer-ack', { received:true, duplicate:true }); return; }
  const q = room.quiz.questions[room.qIndex];
  const elapsed = (Date.now() - room.qStartTime) / 1000;
  const ratio = Math.max(0, (room.qTime - elapsed) / room.qTime);
  const correct = q.correct.includes(opt);
  const pts = correct ? Math.round(500 + 500 * ratio) : 0;
  player.score += pts;
  player.answers[room.qIndex] = { opt, correct, pts };
  room.answeredThisQ[player.id] = true;
  send(player.socket, 'answer-ack', { received:true });
  send(room.hostSocket, 'answer-progress', {
    answered: Object.keys(room.answeredThisQ).length,
    total: Object.values(room.players).filter(p=>p.connected).length
  });
  persistRoom(room); // snapshot apres chaque reponse (score + answeredThisQ a jour)
  const connected = Object.values(room.players).filter(p=>p.connected);
  if(connected.length > 0 && Object.keys(room.answeredThisQ).length >= connected.length){
    setTimeout(() => revealQuestion(room), 600);
  }
}

/* ----------------------- Pouvoirs hote/admin en jeu ----------------------- */
function findRoomOfHost(ws){ return rooms[ws.meta.pin]; }
function hostCanModerate(room, ws){
  if(!room) return false;
  if(ws.meta.role==='host') return true;
  // un admin connecte peut moderer n'importe quelle room via son token
  return false;
}
function kickPlayer(room, playerId, reason){
  const p = room.players[playerId];
  if(!p) return;
  send(p.socket, 'kicked', { reason: reason||'Vous avez ete retire de la partie.' });
  try{ if(p.socket){ p.socket.intentionalClose = true; p.socket.close(); } }catch{}
  delete room.players[playerId];
  if(room.hostSocket) send(room.hostSocket, 'players', { players: playerList(room) });
}
function kickBannedEverywhere(name){
  Object.values(rooms).forEach(room=>{
    Object.values(room.players).forEach(p=>{
      if(p.name.toLowerCase()===name.toLowerCase()){ kickPlayer(room, p.id, 'Banni par un administrateur.'); }
    });
  });
}
function autoBalanceTeams(room){
  const ps = Object.values(room.players).filter(p=>p.connected);
  // tri pour repartition stable
  ps.forEach((p,i)=>{ p.teamId = room.teams[i % room.teams.length].id; });
}

/* ----------------------- Connexions WS ----------------------- */
wss.on('connection', (ws, req) => {
  ws.meta = { role:null, pin:null, playerId:null };
  ws.isAlive = true;
  ws.intentionalClose = false;
  ws.on('pong', () => { ws.isAlive = true; });
  // Rate limiting par socket (fenetre glissante simple)
  ws._rl = [];
  const ip = (req && (req.headers['x-forwarded-for']||req.socket.remoteAddress)) || 'unknown';

  ws.on('message', (raw) => {
    ws.isAlive = true;
    // Rate limit : max RATE_MAX messages par RATE_WINDOW_MS
    const now = Date.now();
    ws._rl = ws._rl.filter(t => now - t < RATE_WINDOW_MS);
    if(ws._rl.length >= RATE_MAX){ send(ws,'rate-limited',{ message:'Trop de messages, ralentissez.' }); return; }
    ws._rl.push(now);
    if(raw && raw.length > 8*1024*1024) return; // garde-fou taille
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const t = msg.type;

    /* HOTE : creer une room (avec options equipes) */
    /* ===== MODE RACE (buzzer) : l'organisateur pose des questions libres en direct ===== */
    if(t === 'race-create'){
      const user = users.find(u => u.id === sessions[msg.token]);
      if(!user){ send(ws,'error',{message:'Session invalide. Reconnectez-vous.'}); return; }
      // room sans quiz pre-fait ; on lui donne un faux quiz vide
      const room = makeRoom({ id:'race', title: String(msg.title||'Course Kami').slice(0,60), questions:[] },
        user.id, user.username, { mode:'race', allowSpectators: msg.allowSpectators !== false });
      room.hostIsAdmin = isAdminish(user);
      rooms[room.pin] = room;
      room.hostSocket = ws;
      ws.meta = { role:'host', pin:room.pin };
      send(ws,'room-created',{ pin:room.pin, title:room.quiz.title, mode:'race', isAdmin:room.hostIsAdmin });
      setTimeout(()=> aiSay(room, "🦊 Course au savoir ! Tapez vite la bonne réponse, le plus rapide gagne !", 'hype'), 400);
      return;
    }
    // L'organisateur envoie une question : { text, desc, answer, time }
    if(t === 'race-question'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role!=='host' || room.mode!=='race') return;
      const text = String(msg.text||'').trim().slice(0,300);
      const answer = String(msg.answer||'').trim().slice(0,120);
      const desc = String(msg.desc||'').trim().slice(0,500);
      if(!text || !answer){ send(ws,'race-error',{message:'Question et réponse obligatoires.'}); return; }
      const time = Math.min(120, Math.max(5, parseInt(msg.time)||30));
      room.state='question'; room.qIndex++; room.qStartTime=Date.now(); room.qTime=time;
      room.raceAnswer=answer; room.raceWon=false; room.raceTries={};
      // l'hote voit la reponse ; joueurs/spectateurs ne la voient PAS
      send(room.hostSocket,'race-question-host',{ index:room.qIndex, text, desc, answer, time });
      broadcastPlayers(room,'race-question',{ index:room.qIndex, text, desc, time });
      broadcastSpectators(room,'race-question',{ index:room.qIndex, text, desc, time, spectator:true });
      clearTimeout(room.timer);
      room.timer=setTimeout(()=> raceTimeUp(room), time*1000+500);
      return;
    }
    // Un joueur tente une reponse (texte libre)
    if(t === 'race-answer'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role!=='player' || room.mode!=='race' || room.state!=='question') return;
      const p = room.players[ws.meta.playerId]; if(!p) return;
      if(room.raceWon){ send(ws,'race-feedback',{won:false,already:true}); return; }
      room.raceTries[p.id]=(room.raceTries[p.id]||0)+1;
      if(room.raceTries[p.id]>6){ send(ws,'race-feedback',{won:false,tooMany:true}); return; } // anti-spam
      if(answerMatches(msg.answer, room.raceAnswer)){
        room.raceWon=true;
        const elapsed=(Date.now()-room.qStartTime)/1000;
        const ratio=Math.max(0,(room.qTime-elapsed)/room.qTime);
        const pts=Math.round(500+500*ratio);
        p.score=(p.score||0)+pts;
        clearTimeout(room.timer);
        room.state='reveal';
        send(ws,'race-feedback',{won:true,pts});
        const lb=leaderboard(room);
        broadcastAll(room,'race-winner',{ winner:p.name, mascot:p.mascot, answer:room.raceAnswer, pts,
          leaderboard:lb.slice(0,20).map(x=>({name:x.name,score:x.score,mascot:x.mascot})) });
        aiSay(room, `⚡ ${p.name} a trouvé en premier : « ${room.raceAnswer} » ! (+${pts})`, 'win');
      } else {
        send(ws,'race-feedback',{won:false});
      }
      return;
    }
    // L'organisateur passe a la question suivante (ou termine)
    if(t === 'race-next'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role!=='host' || room.mode!=='race') return;
      room.state='lobby'; // pret pour la prochaine question
      send(room.hostSocket,'race-ready',{});
      return;
    }
    if(t === 'race-end'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role!=='host' || room.mode!=='race') return;
      const lb=leaderboard(room);
      const record={ id:uid('res'), mode:'race', quizTitle:room.quiz.title, hostId:room.hostUserId, hostName:room.hostName,
        pin:room.pin, playedAt:Date.now(), totalQuestions:room.qIndex+1,
        leaderboard: lb.map(p=>({ rank:p.rank, name:p.name, score:p.score, mascot:p.mascot })) };
      results.push(record); saveDB('results', results);
      room.state='ended'; room.endedAt=Date.now();
      broadcastAll(room,'race-over',{ leaderboard: lb.map(p=>({rank:p.rank,name:p.name,score:p.score,mascot:p.mascot})) });
      setTimeout(()=> aiSay(room, aiGameOver(room),'win'), 400);
      return;
    }

    /* ===== DUEL 1v1 (2 humains, via PIN) ===== */
    if(t === 'duel-create'){
      const user = users.find(u => u.id === sessions[msg.token]);
      if(!user){ send(ws,'error',{message:'Session invalide. Reconnectez-vous.'}); return; }
      let quiz;
      if(msg.quizId){
        quiz = quizzes.find(q => q.id === msg.quizId);
        if(!quiz){ send(ws,'error',{message:'Quiz introuvable.'}); return; }
        // copie avec questions limitees (max 10) pour un duel rapide
        quiz = { id:quiz.id, title:'Duel — '+quiz.title, questions: quiz.questions.slice(0,10) };
      } else {
        // banque Kami : theme + difficulte
        const diff = DIFFICULTIES.find(d=>d.id===msg.difficulte) || DIFFICULTIES[1];
        const qs = buildQuestions(msg.theme||'mangas_animes', diff.id, 7);
        quiz = { id:'duel', title:'Duel — '+(themeName(msg.theme||'mangas_animes')), questions: qs };
      }
      const room = makeRoom(quiz, user.id, user.username, { mode:'duel', allowSpectators: msg.allowSpectators!==false });
      room.autoPilot = true;     // le serveur enchaine tout seul (pas de controle hote)
      room.maxDuel = 2;
      rooms[room.pin] = room;
      room.hostSocket = ws;      // le createur garde un canal pour les events (il jouera aussi via 'join')
      ws.meta = { role:'host', pin:room.pin };
      send(ws,'duel-created',{ pin:room.pin, title:quiz.title, questionCount:quiz.questions.length });
      return;
    }

    if(t === 'host-create'){
      const user = users.find(u => u.id === sessions[msg.token]);
      if(!user){ send(ws, 'error', { message:'Session invalide. Reconnectez-vous.' }); return; }
      const quiz = quizzes.find(q => q.id === msg.quizId);
      if(!quiz){ send(ws, 'error', { message:'Quiz introuvable.' }); return; }      if(quiz.ownerId !== user.id && !isAdminish(user)){ send(ws,'error',{message:'Non autorise.'}); return; }
      const room = makeRoom(quiz, user.id, user.username, {
        teamMode: !!msg.teamMode, teamAssign: msg.teamAssign || 'choose',
        allowSpectators: msg.allowSpectators !== false
      });
      room.hostIsAdmin = isAdminish(user);
      // Journee de championnat : on lie la room a une journee + une division (1 seul essai)
      if(msg.champDay && isAdminish(user)){
        const c = ensureChampionship();
        const day = parseInt(msg.champDay);
        const division = [1,2,3].includes(parseInt(msg.champDivision)) ? parseInt(msg.champDivision) : 1;
        if(day>=1 && day<=c.totalDays){
          if(c.days.find(d=>d.day===day && d.division===division)){ send(ws,'error',{message:'Journee '+day+' (D'+division+') deja jouee (1 seul essai).'}); return; }
          room.champDay = day; room.champDivision = division;
        }
      }
      rooms[room.pin] = room;
      room.hostSocket = ws;
      ws.meta = { role:'host', pin:room.pin };
      send(ws, 'room-created', {
        pin: room.pin, title: quiz.title, questionCount: quiz.questions.length,
        teamMode: room.teamMode, teamAssign: room.teamAssign, teams: room.teams,
        isAdmin: room.hostIsAdmin, champDay: room.champDay || null, champDivision: room.champDivision || null
      });
      setTimeout(()=> aiSay(room, aiLobbyWelcome(room), 'hello'), 500);
      persistRoom(room);
      return;
    }

    if(t === 'host-rejoin'){
      const room = rooms[msg.pin];
      if(!room){ send(ws,'rejoin-fail',{message:'Partie introuvable.'}); return; }
      // Verifie que c'est bien le proprietaire (ou un admin) via le token auth
      const u = users.find(x=>x.id===sessions[msg.token]);
      if(!u || (room.hostUserId !== u.id && !isAdminish(u))){ send(ws,'rejoin-fail',{message:'Reconnexion hote refusee.'}); return; }
      if(room.hostSocket && room.hostSocket!==ws && room.hostSocket.readyState===1){ room.hostSocket.intentionalClose=true; try{ room.hostSocket.close(); }catch{} }
      room.hostSocket = ws; ws.meta = { role:'host', pin:msg.pin }; ws.isAlive = true;
      // Resync complet de l'affichage hote selon l'etat
      const base = { pin:room.pin, title:room.quiz.title, questionCount:room.quiz.questions.length,
        teamMode:room.teamMode, teamAssign:room.teamAssign, teams:room.teams, isAdmin:room.hostIsAdmin };
      if(room.state==='lobby'){
        send(ws,'host-resync',{ ...base, state:'lobby', players: playerList(room) });
      } else if(room.state==='question'){
        const q=room.quiz.questions[room.qIndex];
        const elapsed=(Date.now()-room.qStartTime)/1000;
        const timeLeft=Math.max(0, Math.ceil(room.qTime - elapsed));
        send(ws,'host-resync',{ ...base, state:'question', index:room.qIndex, total:room.quiz.questions.length,
          question:{ type:q.type, text:q.text, time:q.time, options:q.options, image:q.image||null, audio:q.audio||null },
          correct:q.correct, timeLeft,
          answered:Object.keys(room.answeredThisQ).length, connected:Object.values(room.players).filter(p=>p.connected).length });
      } else if(room.state==='reveal'){
        const q=room.quiz.questions[room.qIndex];
        const counts=q.options.map(()=>0);
        Object.values(room.players).forEach(p=>{ const a=p.answers[room.qIndex]; if(a&&a.opt!=null&&counts[a.opt]!=null) counts[a.opt]++; });
        const lb=leaderboard(room);
        send(ws,'host-resync',{ ...base, state:'reveal', index:room.qIndex, correct:q.correct, counts,
          leaderboard:lb.slice(0,20).map(p=>({id:p.id,name:p.name,score:p.score,mascot:p.mascot})), teams:teamScores(room),
          isLast: room.qIndex >= room.quiz.questions.length-1 });
      } else if(room.state==='ended'){
        const lb=leaderboard(room);
        send(ws,'host-resync',{ ...base, state:'ended', leaderboard:lb, teams:teamScores(room), teamMode:room.teamMode });
      }
      return;
    }

    /* SPECTATEUR : regarder une partie (versus/duel/championnat) + chat */
    if(t === 'spectate'){
      const room = rooms[msg.pin];
      if(!room){ send(ws,'spectate-error',{message:'Partie introuvable.'}); return; }
      if(room.allowSpectators === false){ send(ws,'spectate-error',{message:'Spectateurs non autorises.'}); return; }
      const name = String(msg.name||'Spectateur').trim().slice(0,20) || 'Spectateur';
      if(isBanned(name)){ send(ws,'spectate-error',{message:'Vous etes banni.'}); return; }
      const sid = uid('s');
      room.spectators[sid] = { id:sid, name, socket:ws };
      ws.meta = { role:'spectator', pin:msg.pin, spectatorId:sid };
      ws.isAlive = true;
      // etat courant pour que le spectateur voie ce qui se passe
      let snap = { state:room.state, title:room.quiz?room.quiz.title:'', spectators:spectatorCount(room),
        players: playerList(room), chat: room.chat||[] };
      if(room.state==='question'){
        const q=room.quiz.questions[room.qIndex];
        const elapsed=(Date.now()-room.qStartTime)/1000;
        snap.question = { index:room.qIndex, total:room.quiz.questions.length, text:q.text,
          options:q.options, timeLeft:Math.max(0,Math.ceil(room.qTime-elapsed)), image:q.image||null };
      } else if(room.state==='reveal' || room.state==='ended'){
        snap.leaderboard = leaderboard(room).slice(0,20).map(p=>({name:p.name,score:p.score,mascot:p.mascot}));
      }
      send(ws,'spectating', snap);
      broadcastAll(room,'spectators',{ count:spectatorCount(room) });
      pushChat(room,{ sys:true, text:`👁️ ${name} regarde la partie`, at:Date.now() });
      return;
    }
    /* CHAT : joueur, hote ou spectateur */
    if(t === 'chat'){
      const room = rooms[ws.meta.pin];
      if(!room) return;
      let from = 'Anonyme', kind='spectator';
      if(ws.meta.role==='host'){ from = room.hostName+' (animateur)'; kind='host'; }
      else if(ws.meta.role==='player' && room.players[ws.meta.playerId]){ from = room.players[ws.meta.playerId].name; kind='player'; }
      else if(ws.meta.role==='spectator' && room.spectators[ws.meta.spectatorId]){ from = room.spectators[ws.meta.spectatorId].name; kind='spectator'; }
      const text = String(msg.text||'').trim().slice(0,200);
      if(!text) return;
      pushChat(room,{ from, kind, text, at:Date.now() });
      return;
    }
    /* REACTION : emoji flottant (joueur/spectateur) */
    if(t === 'react'){
      const room = rooms[ws.meta.pin];
      if(!room) return;
      const emoji = String(msg.emoji||'👍').slice(0,4);
      const allowed=['👍','❤️','😂','😮','🔥','👏','😱','🦊'];
      const e = allowed.includes(emoji)?emoji:'👍';
      broadcastAll(room,'react',{ emoji:e });
      return;
    }

    /* JOUEUR : rejoindre (mascotte + equipe) */
    if(t === 'join'){
      const room = rooms[msg.pin];
      if(!room){ send(ws,'join-error',{message:'PIN invalide ou partie terminee.'}); return; }
      if(room.state !== 'lobby'){ send(ws,'join-error',{message:'La partie a deja commence.'}); return; }
      const name = String(msg.name||'').trim().slice(0,20);
      if(!name){ send(ws,'join-error',{message:'Entrez un pseudo.'}); return; }
      if(isBanned(name)){ send(ws,'join-error',{message:'Vous etes banni de Shisnekai no Kami.'}); return; }
      if(room.mode==='duel' && Object.values(room.players).filter(p=>p.connected).length >= (room.maxDuel||2)){ send(ws,'join-error',{message:'Ce duel est complet (2 joueurs).'}); return; }
      if(Object.values(room.players).filter(p=>p.connected).length >= MAX_PLAYERS){ send(ws,'join-error',{message:'Room pleine ('+MAX_PLAYERS+').'}); return; }
      if(Object.values(room.players).some(p => p.connected && p.name.toLowerCase()===name.toLowerCase())){ send(ws,'join-error',{message:'Ce pseudo est deja pris.'}); return; }

      const mascot = mascotById(msg.mascot).id;
      let teamId = null;
      if(room.teamMode){
        if(room.teamAssign==='auto'){
          // equipe la moins remplie
          const counts = {}; room.teams.forEach(tm=>counts[tm.id]=0);
          Object.values(room.players).forEach(p=>{ if(p.teamId) counts[p.teamId]++; });
          teamId = room.teams.slice().sort((a,b)=>counts[a.id]-counts[b.id])[0].id;
        } else {
          teamId = room.teams.find(tm=>tm.id===msg.teamId)?.id || room.teams[0].id;
        }
      }
      const pid = uid('p');
      const sessionToken = crypto.randomBytes(16).toString('hex'); // secret anti-usurpation pour la reconnexion
      room.players[pid] = { id:pid, name, socket:ws, score:0, answers:[], connected:true, mascot, teamId,
        sessionToken, disconnectedAt:null };
      ws.meta = { role:'player', pin:msg.pin, playerId:pid };
      ws.isAlive = true;
      send(ws, 'joined', {
        playerId:pid, sessionToken, name, title:room.quiz.title, mascot,
        teamMode:room.teamMode, teamAssign:room.teamAssign, teams:room.teams, teamId,
        mode:room.mode||'quiz'
      });
      send(room.hostSocket, 'players', { players: playerList(room) });
      persistRoom(room);
      // DUEL : demarrage automatique des que 2 joueurs sont connectes
      if(room.mode==='duel' && room.state==='lobby'){
        const conn = Object.values(room.players).filter(p=>p.connected).length;
        broadcastAll(room,'duel-lobby',{ players: playerList(room), need:(room.maxDuel||2) });
        if(conn >= (room.maxDuel||2)){
          room.state='starting';
          broadcastAll(room,'game-start',{});
          setTimeout(()=> startQuestion(room), 1500);
        }
      }
      return;
    }

    /* JOUEUR : reconnexion en cours de partie (fenetre 90s, anti-usurpation par sessionToken) */
    if(t === 'player-rejoin'){
      const room = rooms[msg.pin];
      if(!room){ send(ws,'rejoin-fail',{message:'Partie introuvable ou terminee.'}); return; }
      const p = room.players[msg.playerId];
      // Verification stricte : le sessionToken secret doit correspondre (on ne fait pas confiance au playerId seul)
      if(!p || !msg.sessionToken || p.sessionToken !== msg.sessionToken){
        send(ws,'rejoin-fail',{message:'Reconnexion refusee (session invalide).'}); return;
      }
      if(p.disconnectedAt && (Date.now()-p.disconnectedAt) > REJOIN_WINDOW_MS){
        send(ws,'rejoin-fail',{message:'Fenetre de reconnexion expiree.'}); return;
      }
      // si un autre onglet est deja connecte sur ce joueur, on ferme l'ancien proprement
      if(p.socket && p.socket !== ws && p.socket.readyState===1){ p.socket.intentionalClose=true; try{ p.socket.close(); }catch{} }
      p.socket = ws; p.connected = true; p.disconnectedAt = null;
      ws.meta = { role:'player', pin:msg.pin, playerId:p.id };
      ws.isAlive = true;
      // Resync complet de l'etat courant
      if(room.state==='question'){
        const q = room.quiz.questions[room.qIndex];
        const elapsed = (Date.now()-room.qStartTime)/1000;
        const timeLeft = Math.max(0, Math.ceil(room.qTime - elapsed));
        send(ws,'rejoined-question',{
          index:room.qIndex, total:room.quiz.questions.length, qtype:q.type, text:q.text,
          optionCount:q.options.length, options:q.options, image:q.image||null, audio:q.audio||null,
          timeLeft, alreadyAnswered: !!room.answeredThisQ[p.id], score:p.score
        });
      } else if(room.state==='reveal'){
        const q = room.quiz.questions[room.qIndex];
        const a = p.answers[room.qIndex];
        const lb = leaderboard(room);
        send(ws,'rejoined-reveal',{ youCorrect:a?a.correct:false, youPts:a?a.pts:0, score:p.score,
          rank:lb.find(x=>x.id===p.id)?.rank||null, total:lb.length, correct:q.correct });
      } else if(room.state==='ended'){
        const lb=leaderboard(room);
        send(ws,'gameover',{ rank:lb.find(x=>x.id===p.id)?.rank||null, total:lb.length, score:p.score,
          podium:lb.slice(0,3).map(x=>({name:x.name,score:x.score,mascot:x.mascot})), teams:teamScores(room), teamMode:room.teamMode });
      } else {
        send(ws,'rejoined-lobby',{ title:room.quiz.title, mascot:p.mascot, teamMode:room.teamMode, teams:room.teams, teamId:p.teamId });
      }
      if(room.hostSocket) send(room.hostSocket,'players',{ players: playerList(room) });
      return;
    }

    /* JOUEUR : choisir/changer son equipe (mode 'choose', encore en lobby) */
    if(t === 'set-team'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role!=='player' || room.state!=='lobby' || !room.teamMode) return;
      const p = room.players[ws.meta.playerId]; if(!p) return;
      const team = room.teams.find(tm=>tm.id===msg.teamId);
      if(team){ p.teamId = team.id; send(room.hostSocket,'players',{players:playerList(room)}); send(ws,'team-set',{teamId:team.id}); }
      return;
    }

    /* HOTE : demarrer (auto-balance si besoin) */
    if(t === 'start'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role !== 'host' || room.state !== 'lobby') return;
      if(room.teamMode && room.teamAssign==='auto') autoBalanceTeams(room);
      broadcastAll(room, 'game-start', {});
      setTimeout(() => startQuestion(room), 900);
      return;
    }
    if(t === 'next'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role !== 'host' || room.state !== 'reveal') return;
      startQuestion(room); return;
    }
    if(t === 'force-reveal'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role !== 'host') return;
      revealQuestion(room); return;
    }

    /* JOUEUR : repondre */
    if(t === 'answer'){
      const room = rooms[ws.meta.pin];
      if(!room || ws.meta.role !== 'player') return;
      const player = room.players[ws.meta.playerId];
      if(!player) return;
      handleAnswer(room, player, msg.opt); return;
    }

    /* ===== POUVOIRS MODERATION (hote de la room, et admin) ===== */
    // Verifie que l'emetteur est l'hote de la room OU un admin (via token)
    function moderator(room){
      if(!room) return false;
      if(ws.meta.role==='host' && ws.meta.pin===room.pin) return true;
      const u = users.find(x=>x.id===sessions[msg.token]);
      return isAdminish(u);
    }

    if(t === 'mod-kick'){
      const room = rooms[msg.pin || ws.meta.pin];
      if(!moderator(room)) return;
      kickPlayer(room, msg.playerId, msg.reason||'Retire par l\'animateur.');
      send(ws,'mod-ok',{action:'kick'});
      return;
    }
    if(t === 'mod-ban'){
      const room = rooms[msg.pin || ws.meta.pin];
      if(!room) return;
      // Bannir est reserve au SUPER-ADMIN uniquement
      const u = users.find(x=>x.id===sessions[msg.token]);
      if(!u || u.role!=='superadmin'){ send(ws,'mod-error',{message:'Seul le super-admin peut bannir.'}); return; }
      const p = room.players[msg.playerId];
      const name = p ? p.name : msg.name;
      // Ne jamais bannir un super-admin par pseudo
      const targetUser = users.find(x=>x.username.toLowerCase()===String(name).toLowerCase());
      if(targetUser && targetUser.role==='superadmin'){ send(ws,'mod-error',{message:'Le super-admin ne peut pas etre banni.'}); return; }
      if(name && !bans.find(b=>b.name.toLowerCase()===name.toLowerCase())){
        bans.push({ name, reason:msg.reason||'Non-respect des regles', at:Date.now(), by:u.username });
        saveDB('bans', bans);
      }
      if(p) kickPlayer(room, p.id, 'Banni : '+(msg.reason||'non-respect des regles'));
      send(ws,'mod-ok',{action:'ban', name});
      return;
    }
    if(t === 'mod-adjust'){ // retirer ou ajouter des points
      const room = rooms[msg.pin || ws.meta.pin];
      if(!moderator(room)) return;
      const p = room && room.players[msg.playerId];
      if(p){
        const delta = parseInt(msg.delta)||0;
        p.score = Math.max(0, p.score + delta);
        send(room.hostSocket, 'players', { players: playerList(room) });
        send(p.socket, 'score-adjusted', { score:p.score, delta });
        aiSay(room, delta<0
          ? `⚖️ L'animateur retire ${Math.abs(delta)} points a ${p.name}. Les regles sont les regles ! 😼`
          : `⚖️ Bonus ! ${p.name} reçoit ${delta} points de la part de l'animateur. 🎁`, 'fun');
      }
      send(ws,'mod-ok',{action:'adjust'});
      return;
    }
  });

  ws.on('error', () => {});
  ws.on('close', () => {
    const { role, pin, playerId, spectatorId } = ws.meta;
    const room = rooms[pin];
    if(!room) return;
    if(role === 'spectator' && room.spectators && room.spectators[spectatorId]){
      delete room.spectators[spectatorId];
      broadcastAll(room,'spectators',{ count:spectatorCount(room) });
      return;
    }
    if(role === 'player' && room.players[playerId] && room.players[playerId].socket === ws){
      const p = room.players[playerId];
      p.connected = false;
      p.socket = null;
      p.disconnectedAt = Date.now();
      // En lobby : on retire vraiment le joueur apres la fenetre s'il ne revient pas
      if(room.state === 'lobby'){
        setTimeout(()=>{
          const pp = room.players[playerId];
          if(pp && !pp.connected && pp.disconnectedAt && (Date.now()-pp.disconnectedAt) >= REJOIN_WINDOW_MS){
            delete room.players[playerId];
            if(room.hostSocket) send(room.hostSocket,'players',{ players: playerList(room) });
          }
        }, REJOIN_WINDOW_MS + 500);
      }
      if(room.hostSocket) send(room.hostSocket, 'players', { players: playerList(room) });
    }
    if(role === 'host' && room.hostSocket === ws){ room.hostSocket = null; }
  });
});

(async () => {
  // Initialise le store de persistance (Redis si REDIS_URL, sinon fichier local)
  try{ await RoomStore.init(DATA_DIR); await restoreAllRooms(); }
  catch(e){ console.warn('[room-store] init/restore err:', e.message); }

  server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log('  SHISNEKAI NO KAMI - serveur demarre');
    console.log('  Local        : http://localhost:' + PORT);
    console.log('  Reseau (LAN) : http://<IP-de-votre-PC>:' + PORT);
    console.log('  Compte admin : (identifiants masques - voir vos variables d env)');
    console.log('  Persistance  : ' + RoomStore.mode());
    console.log('==========================================================');
  });
})();
