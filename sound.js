/* =========================================================================
   SHISNEKAI NO KAMI - Moteur sonore (Web Audio API, sans fichier externe)
   Tous les sons sont generes par synthese -> fonctionne hors-ligne.
   API globale : SNKSound
     .unlock()        - a appeler sur une interaction utilisateur (clic)
     .setEnabled(b)   - activer/couper
     .isEnabled()
     .lobby(on)       - musique d'ambiance du lobby (boucle douce)
     .tickStart(sec)  - lance le tic-tac de compte a rebours (accelere)
     .tickStop()
     .correct()       - son bonne reponse
     .wrong()         - son mauvaise reponse
     .reveal()        - petit son de revelation/classement
     .climb()         - petit "whoosh" de montee au classement
     .fanfare()       - fanfare de victoire (fin de quiz)
     .lose()          - jingle de defaite (doux)
     .click()         - clic d'interface
   ========================================================================= */
(function(global){
  let ctx = null;
  let enabled = (localStorage.getItem('snk_sound') !== 'off');
  let master = null;
  let lobbyNodes = null;
  let tickTimer = null;

  function ensure(){
    if(!ctx){
      try{
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
      }catch(e){ ctx = null; }
    }
    return ctx;
  }
  function unlock(){ if(ensure() && ctx.state === 'suspended'){ ctx.resume(); } }

  // --- helpers de synthese ---
  function tone(freq, start, dur, type, vol, slideTo){
    if(!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime + start);
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol||0.3, ctx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    o.connect(g); g.connect(master);
    o.start(ctx.currentTime + start);
    o.stop(ctx.currentTime + start + dur + 0.05);
  }
  function noiseHit(start, dur, vol){
    if(!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<data.length;i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol||0.2;
    const f = ctx.createBiquadFilter(); f.type='highpass'; f.frequency.value=1200;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(ctx.currentTime + start);
  }

  const SNKSound = {
    unlock,
    isEnabled(){ return enabled; },
    setEnabled(b){
      enabled = !!b;
      localStorage.setItem('snk_sound', enabled ? 'on' : 'off');
      if(!enabled){ this.lobby(false); this.tickStop(); }
    },
    click(){ if(!enabled) return; ensure(); tone(660, 0, 0.06, 'square', 0.12); },

    /* Musique de lobby : nappe douce + arpege lent mysterieux (boucle) */
    lobby(on){
      if(!enabled){ on = false; }
      if(on){
        if(lobbyNodes) return;
        if(!ensure()) return;
        const g = ctx.createGain(); g.gain.value = 0.0; g.connect(master);
        g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);
        // nappe (deux oscillateurs detunes)
        const o1 = ctx.createOscillator(); o1.type='sine'; o1.frequency.value=110;
        const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value=110.5;
        const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600;
        o1.connect(lp); o2.connect(lp); lp.connect(g);
        o1.start(); o2.start();
        // arpege japonisant (gamme pentatonique) joue en boucle
        const scale = [220, 261.6, 293.7, 329.6, 392, 440];
        let step = 0;
        const arp = setInterval(()=>{
          if(!ctx) return;
          const f = scale[step % scale.length];
          const ag = ctx.createGain(); ag.gain.value=0.0; ag.connect(master);
          const ao = ctx.createOscillator(); ao.type='triangle'; ao.frequency.value=f;
          ao.connect(ag); ao.start();
          ag.gain.linearRampToValueAtTime(0.07, ctx.currentTime+0.05);
          ag.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.9);
          ao.stop(ctx.currentTime+1);
          step++;
        }, 650);
        lobbyNodes = { g, o1, o2, arp };
      } else {
        if(lobbyNodes){
          try{
            lobbyNodes.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
            clearInterval(lobbyNodes.arp);
            const n = lobbyNodes;
            setTimeout(()=>{ try{ n.o1.stop(); n.o2.stop(); }catch(e){} }, 700);
          }catch(e){}
          lobbyNodes = null;
        }
      }
    },

    /* Tic-tac de compte a rebours qui accelere quand le temps file */
    tickStart(seconds){
      this.tickStop();
      if(!enabled || !ensure()) return;
      let remaining = seconds;
      const schedule = ()=>{
        if(remaining <= 0){ this.tickStop(); return; }
        // tic plus aigu et plus rapproche vers la fin
        const urgent = remaining <= 5;
        tone(urgent ? 1100 : 800, 0, 0.05, 'square', urgent ? 0.16 : 0.08);
        remaining--;
        const interval = remaining <= 5 ? 500 : 1000;
        tickTimer = setTimeout(schedule, interval);
      };
      schedule();
    },
    tickStop(){ if(tickTimer){ clearTimeout(tickTimer); tickTimer = null; } },

    correct(){ if(!enabled||!ensure())return; tone(523,0,0.12,'triangle',0.25); tone(659,0.10,0.12,'triangle',0.25); tone(784,0.20,0.22,'triangle',0.28); },
    wrong(){ if(!enabled||!ensure())return; tone(300,0,0.18,'sawtooth',0.18,150); tone(200,0.12,0.28,'sawtooth',0.16,90); },
    reveal(){ if(!enabled||!ensure())return; tone(440,0,0.08,'sine',0.15); tone(660,0.08,0.12,'sine',0.16); },
    climb(){ if(!enabled||!ensure())return; tone(400,0,0.18,'sine',0.14,900); noiseHit(0,0.15,0.06); },

    /* Fanfare de victoire */
    fanfare(){
      if(!enabled||!ensure())return;
      const n=[523,659,784,1046]; // Do Mi Sol Do
      n.forEach((f,i)=> tone(f, i*0.14, 0.3, 'triangle', 0.28));
      tone(1318, 0.6, 0.6, 'triangle', 0.3);
      noiseHit(0.0, 0.2, 0.12); noiseHit(0.6, 0.25, 0.1);
    },
    lose(){
      if(!enabled||!ensure())return;
      tone(440,0,0.25,'triangle',0.2,392);
      tone(392,0.22,0.3,'triangle',0.2,330);
      tone(294,0.5,0.5,'triangle',0.2,233);
    }
  };

  global.SNKSound = SNKSound;
})(window);
