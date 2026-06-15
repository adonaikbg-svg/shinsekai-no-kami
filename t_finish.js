const WebSocket=require('ws');const fs=require('fs');
const info=JSON.parse(fs.readFileSync('/tmp/snk_test.json','utf8'));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mk(){const w=new WebSocket('ws://localhost:3000');const q=[],wt=[];w.on('message',m=>{m=JSON.parse(m);const i=wt.findIndex(x=>x.t===m.type);if(i>=0)wt.splice(i,1)[0].r(m);else q.push(m);});w.waitFor=t=>new Promise(r=>{const i=q.findIndex(m=>m.type===t);if(i>=0)r(q.splice(i,1)[0]);else wt.push({t,r});});w.ready=new Promise(r=>w.on('open',r));w.sendJ=o=>w.send(JSON.stringify(o));return w;}
(async()=>{
  // hote se reconnecte
  const host=mk();await host.ready;host.sendJ({type:'host-rejoin',token:info.hostToken,pin:info.pin});
  const hr=await host.waitFor('host-resync');
  // joueur se reconnecte
  const p=mk();await p.ready;p.sendJ({type:'player-rejoin',pin:info.pin,playerId:info.playerId,sessionToken:info.sessionToken});
  const pr=await Promise.race([p.waitFor('rejoined-question').then(m=>({t:'q',m})),p.waitFor('rejoined-reveal').then(m=>({t:'r',m}))]);
  const scoreAfter = pr.m.score;
  console.log('Score apres redemarrage =', scoreAfter, '(avant =', info.scoreBefore, ') ->', scoreAfter===info.scoreBefore?'IDENTIQUE ✔':'DIFFERENT');
  // finir la partie : on avance jusqu'a la fin
  // determiner ou on en est via host-resync
  let idx = hr.state==='reveal'? hr.index : (hr.state==='question'? hr.index : 0);
  // si on est en reveal, next; sinon on attend la question courante deja recue
  if(hr.state==='reveal'){ host.sendJ({type:'next'}); }
  // boucle jusqu'a gameover
  let safety=0;
  while(safety++<info.qCount+2){
    const hq=await Promise.race([host.waitFor('question').then(m=>({t:'q',m})),host.waitFor('gameover').then(m=>({t:'over',m}))]);
    if(hq.t==='over'){ console.log('✅ PARTIE TERMINEE apres redemarrage, gagnant score', hq.m.leaderboard[0].score); break; }
    await p.waitFor('question'); p.sendJ({type:'answer',opt:0}); 
    await host.waitFor('reveal'); host.sendJ({type:'next'});
  }
  host.close();p.close();process.exit(0);
})().catch(e=>{console.error('FINISH ERR',e);process.exit(1);});
