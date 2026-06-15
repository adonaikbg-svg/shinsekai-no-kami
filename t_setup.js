const WebSocket=require('ws');const http=require('http');const fs=require('fs');
function login(){return new Promise(r=>{const d=JSON.stringify({username:'Adonaishinsekai',password:'1234567'});const q=http.request({host:'localhost',port:3000,path:'/api/login',method:'POST',headers:{'Content-Type':'application/json','Content-Length':d.length}},x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>r(JSON.parse(b).token));});q.write(d);q.end();});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function mk(){const w=new WebSocket('ws://localhost:3000');const q=[],wt=[];w.on('message',m=>{m=JSON.parse(m);const i=wt.findIndex(x=>x.t===m.type);if(i>=0)wt.splice(i,1)[0].r(m);else q.push(m);});w.waitFor=t=>new Promise(r=>{const i=q.findIndex(m=>m.type===t);if(i>=0)r(q.splice(i,1)[0]);else wt.push({t,r});});w.ready=new Promise(r=>w.on('open',r));w.sendJ=o=>w.send(JSON.stringify(o));return w;}
(async()=>{
  const tk=await login();
  const host=mk();await host.ready;host.sendJ({type:'host-create',token:tk,quizId:'demo-quiz'});
  const cr=await host.waitFor('host-create'?'room-created':'room-created');
  const p=mk();await p.ready;p.sendJ({type:'join',pin:cr.pin,name:'S',mascot:'ninja'});const j=await p.waitFor('joined');
  await sleep(120);host.sendJ({type:'start'});await host.waitFor('game-start');
  // repondre a Q1 et Q2 pour cumuler du score
  let hq=await host.waitFor('question');await p.waitFor('question');p.sendJ({type:'answer',opt:hq.correct[0]});await p.waitFor('answer-ack');
  await host.waitFor('reveal');await p.waitFor('reveal');host.sendJ({type:'next'});
  hq=await host.waitFor('question');await p.waitFor('question');p.sendJ({type:'answer',opt:hq.correct[0]});await p.waitFor('answer-ack');
  const rv=await p.waitFor('reveal');
  fs.writeFileSync('/tmp/snk_test.json', JSON.stringify({pin:cr.pin, playerId:j.playerId, sessionToken:j.sessionToken, hostToken:tk, scoreBefore:rv.score, qCount:cr.questionCount}));
  console.log('SETUP: 2 questions repondues, score avant redemarrage =', rv.score);
  await sleep(400); host.close(); p.close(); process.exit(0);
})().catch(e=>{console.error('SETUP ERR',e);process.exit(1);});
