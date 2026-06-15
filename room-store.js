/* =========================================================================
   SHISNEKAI NO KAMI - Persistance des rooms (survit a un redemarrage serveur)
   - Si REDIS_URL est defini : utilise Redis (ioredis).
   - Sinon : fallback sur un fichier JSON local (data/rooms.json).
   Dans les deux cas, les parties en cours sont RESTAUREES au demarrage.

   On persiste un SNAPSHOT serialisable de chaque room (pas les sockets ni les timers,
   qui sont reconstruits en memoire). API asynchrone, non bloquante.
   ========================================================================= */
const fs = require('fs');
const path = require('path');

const REDIS_URL = process.env.REDIS_URL || null;
const KEY_PREFIX = 'snk:room:';
const ROOM_TTL_SEC = 60 * 60; // 1h de securite cote Redis

let redis = null;
let mode = 'memory-file';
let fileDir, filePath;

function initFile(dataDir){
  fileDir = dataDir;
  filePath = path.join(dataDir, 'rooms.json');
  if(!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive:true });
}

let writeQueued = false, pendingSnapshots = {};
function flushFile(){
  writeQueued = false;
  try{ fs.writeFileSync(filePath, JSON.stringify(pendingSnapshots)); }catch(e){ console.error('[room-store] write err', e.message); }
}

const Store = {
  mode(){ return mode; },

  async init(dataDir){
    initFile(dataDir);
    if(REDIS_URL){
      try{
        const Redis = require('ioredis');
        redis = new Redis(REDIS_URL, { lazyConnect:true, maxRetriesPerRequest:2, enableOfflineQueue:false });
        redis.on('error', e=>{ /* evite le spam ; on bascule sur fichier si indispo */ });
        await redis.connect();
        mode = 'redis';
        console.log('[room-store] Mode REDIS actif (persistance des parties).');
      }catch(e){
        console.warn('[room-store] Redis indisponible, fallback fichier local :', e.message);
        redis = null; mode = 'memory-file';
      }
    } else {
      mode = 'memory-file';
      console.log('[room-store] Mode FICHIER local (data/rooms.json) - persistance des parties.');
    }
  },

  // Sauvegarde un snapshot (objet serialisable) pour un pin
  async save(pin, snapshot){
    if(mode === 'redis' && redis){
      try{ await redis.set(KEY_PREFIX + pin, JSON.stringify(snapshot), 'EX', ROOM_TTL_SEC); return; }
      catch(e){ /* tombe en fallback fichier */ }
    }
    // fichier : ecriture groupee (debounced) pour ne pas bloquer
    pendingSnapshots[pin] = snapshot;
    if(!writeQueued){ writeQueued = true; setTimeout(flushFile, 300); }
  },

  async remove(pin){
    if(mode === 'redis' && redis){ try{ await redis.del(KEY_PREFIX + pin); }catch(e){} }
    if(pendingSnapshots[pin]){ delete pendingSnapshots[pin]; if(!writeQueued){ writeQueued=true; setTimeout(flushFile,300);} }
  },

  // Charge tous les snapshots au demarrage
  async loadAll(){
    if(mode === 'redis' && redis){
      try{
        const keys = await redis.keys(KEY_PREFIX + '*');
        const out = {};
        for(const k of keys){
          const v = await redis.get(k);
          if(v){ const snap = JSON.parse(v); out[snap.pin] = snap; }
        }
        return out;
      }catch(e){ console.warn('[room-store] loadAll redis err', e.message); return {}; }
    }
    // fichier
    try{
      if(fs.existsSync(filePath)){
        pendingSnapshots = JSON.parse(fs.readFileSync(filePath, 'utf8')) || {};
        return { ...pendingSnapshots };
      }
    }catch(e){ console.warn('[room-store] loadAll file err', e.message); }
    return {};
  }
};

module.exports = Store;
