#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  ShiftMaster — testy logiki  (node shiftMaster/tests/test-logic.js)
// ══════════════════════════════════════════════════════════════════
//
//  Uruchom: node shiftMaster/tests/test-logic.js
//  Wymaga: Node.js >= 14
//
'use strict';

// ── RUNNER ────────────────────────────────────────────────────────
let pass=0,fail=0;
const G='\x1b[32m',R='\x1b[31m',B='\x1b[34m',D='\x1b[2m',X='\x1b[0m';
function ok(name,v,expected){
  if(v===expected){console.log(`  ${G}✓${X} ${D}${name}${X}`);pass++;}
  else{console.log(`  ${R}✗ ${name}${X}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(v)}`);fail++;}
}
function okDeep(name,v,expected){
  const vs=JSON.stringify(v),es=JSON.stringify(expected);
  if(vs===es){console.log(`  ${G}✓${X} ${D}${name}${X}`);pass++;}
  else{console.log(`  ${R}✗ ${name}${X}\n    expected: ${es}\n    got:      ${vs}`);fail++;}
}
function suite(name,fn){console.log(`\n${B}▶ ${name}${X}`);return fn();}

// ── PURE FUNCTIONS (skopiowane z app.js) ─────────────────────────
const dim=(y,m)=>new Date(y,m,0).getDate();
const dstr=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const addD=(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const dow=(y,m,d)=>new Date(y,m-1,d).getDay();
const isWD=(y,m,d)=>{const w=dow(y,m,d);return w>=1&&w<=5};

// ── GLOBALE (mockowane) ───────────────────────────────────────────
let workers=[], weModes={}, teamSession=null;

// ── LOGIKA Z app.js ───────────────────────────────────────────────
function weekOfficeCnt(wid,date,sched){
  const d=new Date(date);const wd=d.getDay();
  const mon=new Date(d);mon.setDate(d.getDate()-(wd===0?6:wd-1));
  let cnt=0;
  for(let i=0;i<5;i++){
    const cd=new Date(mon);cd.setDate(mon.getDate()+i);
    const ds=cd.toISOString().slice(0,10);
    if(sched.some(e=>e.wid===wid&&e.date===ds&&e.type==='dzien'))cnt++;
  }
  return cnt;
}

function canAssign(w,shift,sched,cfg){
  const {date,type}=shift;const wid=w.id;const r=w.days[date];
  const q=cfg.quotas[wid];
  if(r==='vac'||r==='off')return false;
  if(type==='dzien'&&(r==='no-d'||r==='no-both'))return false;
  if(type==='noc'&&(r==='no-n'||r==='no-both'))return false;
  if(type==='24h'&&(r==='no-d'||r==='no-n'||r==='no-both'))return false;
  if(sched.some(e=>e.wid===wid&&e.date===date))return false;
  const prev=addD(date,-1),next=addD(date,1);
  const pe=sched.find(e=>e.wid===wid&&e.date===prev);
  const ne=sched.find(e=>e.wid===wid&&e.date===next);
  if(pe){
    if(type==='dzien'&&(pe.type==='noc'||pe.type==='24h'))return false;
    if(type==='noc'&&pe.type==='24h')return false;
    if(type==='24h'&&(pe.type==='24h'||pe.type==='noc'))return false;
  }
  if(ne){
    if((type==='noc'||type==='24h')&&ne.type==='dzien')return false;
    if(type==='24h'&&ne.type==='24h')return false;
    if(type==='noc'&&ne.type==='24h')return false;
  }
  if(cfg.maxN&&type==='noc'){
    const maxNVal=cfg.maxNVal||3;let c=0,ch=prev;
    for(let i=0;i<maxNVal;i++){const e=sched.find(x=>x.wid===wid&&x.date===ch);if(e&&e.type==='noc'){c++;ch=addD(ch,-1);}else break;}
    if(c>=maxNVal)return false;
  }
  if(cfg.maxD&&type==='dzien'){
    const maxDVal=cfg.maxDVal||3;let c=0,ch=prev;
    for(let i=0;i<maxDVal;i++){const e=sched.find(x=>x.wid===wid&&x.date===ch);if(e&&e.type==='dzien'){c++;ch=addD(ch,-1);}else break;}
    if(c>=maxDVal)return false;
  }
  if(cfg.maxSun&&new Date(date).getDay()===0){
    let c=0;
    for(let w7=7;w7<=14;w7+=7){const prevSun=addD(date,-w7);if(sched.some(e=>e.wid===wid&&e.date===prevSun))c++;else break;}
    if(c>=2)return false;
  }
  const myTotalH=sched.filter(e=>e.wid===wid).reduce((s,e)=>s+e.hours,0);
  if(myTotalH+shift.hours>q.target+cfg.tol)return false;
  const wd=new Date(date).getDay();const isWday=wd>=1&&wd<=5;
  const is8all=!!shift.slot;
  if(type==='dzien'&&(isWday||is8all)){
    const myDzien=is8all
      ?sched.filter(e=>e.wid===wid&&e.type==='dzien').length
      :sched.filter(e=>e.wid===wid&&e.type==='dzien'&&(()=>{const w2=new Date(e.date).getDay();return w2>=1&&w2<=5;})()).length;
    if(myDzien>=q.maxDzienWday+cfg.tol/(shift.hours||12))return false;
  }
  if(!is8all&&(type==='noc'||type==='24h'||(type==='dzien'&&!isWday))){
    const myNocWeH=sched.filter(e=>e.wid===wid&&(
      e.type==='noc'||e.type==='24h'||(e.type==='dzien'&&!e.slot&&(()=>{const w2=new Date(e.date).getDay();return w2===0||w2===6;})())
    )).reduce((s,e)=>s+e.hours,0);
    if(myNocWeH+shift.hours>q.maxNocWeH+cfg.tol)return false;
  }
  return true;
}

function wScore(w,shift,sched,cfg){
  const wid=w.id;const q=cfg.quotas[wid];
  const myH=sched.filter(e=>e.wid===wid).reduce((s,e)=>s+e.hours,0);
  let score=myH/q.target;
  const wd=new Date(shift.date).getDay();
  if(w.reqDays&&w.reqDays.length&&w.reqDays.includes(wd)){
    if(shift.type==='dzien')score-=10;else score+=8;
  }
  if(w.minDays&&shift.type==='dzien'&&wd>=1&&wd<=5){
    const cnt=weekOfficeCnt(wid,shift.date,sched);
    if(cnt<w.minDays)score-=3;
  }
  if(shift.slot){
    const prev=addD(shift.date,-1);
    const pe=sched.find(e=>e.wid===wid&&e.date===prev);
    if(pe&&pe.slot){
      if(shift.slot<pe.slot)score+=(pe.slot-shift.slot)*50;
      if(shift.slot===pe.slot)score-=0.3;
    }
  }
  return score; // bez szumu — deterministyczne testy
}

function prefillReqDays(shifts,y,m){
  const prefilled=[];const usedShifts=new Set();const n=dim(y,m);
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);const wd=dow(y,m,d);
    if(wd<1||wd>5)continue;
    const reqWorkers=workers.filter(w=>{
      if(!w.reqDays||!w.reqDays.length)return false;
      if(!w.reqDays.includes(wd))return false;
      const r=w.days[date];
      if(r==='vac'||r==='off'||r==='no-d'||r==='no-both')return false;
      return true;
    });
    if(!reqWorkers.length)continue;
    for(const w of reqWorkers){
      const si=shifts.findIndex((s,i)=>!usedShifts.has(i)&&s.date===date&&s.type==='dzien');
      if(si===-1)continue;
      const s=shifts[si];
      const prevDate=addD(date,-1);
      if(prefilled.some(e=>e.wid===w.id&&e.date===prevDate&&(e.type==='noc'||e.type==='24h')))continue;
      if(prefilled.some(e=>e.wid===w.id&&e.date===date))continue;
      prefilled.push({wid:w.id,date:s.date,type:s.type,hours:s.hours,slot:s.slot});
      usedShifts.add(si);
    }
  }
  return {prefilled,remaining:shifts.filter((_,i)=>!usedShifts.has(i))};
}

function canDo(action){
  if(!teamSession)return true;
  const role=teamSession.role||'worker';
  const perms={
    admin:  ['generate','edit','approve','revoke','manage_members','manage_workers','export'],
    editor: ['generate','edit','manage_workers','export'],
    worker: ['view','export']
  };
  return !!(perms[role]&&perms[role].includes(action));
}

function backtrack(shifts,idx,sched,results,limit,cfg){
  if(results.length>=limit)return;
  if(cfg._deadline&&Date.now()>cfg._deadline)return;
  if(idx===shifts.length){results.push([...sched]);return;}
  const shift=shifts[idx];
  const sorted=[...workers].sort((a,b)=>wScore(a,shift,sched,cfg)-wScore(b,shift,sched,cfg));
  for(const w of sorted){
    if(canAssign(w,shift,sched,cfg)){
      sched.push({wid:w.id,date:shift.date,type:shift.type,hours:shift.hours,slot:shift.slot});
      backtrack(shifts,idx+1,sched,results,limit,cfg);
      sched.pop();
      if(results.length>=limit||cfg._deadline&&Date.now()>cfg._deadline)return;
    }
  }
}

function genShiftsTest(y,m,shiftMode,minPerDay,we8=false){
  const is8=shiftMode==='8h';const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);const shifts=[];
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);const wd=dow(y,m,d);
    if(is8){
      if(wd>=1&&wd<=5||we8)for(let s=0;s<mpd;s++)shifts.push({date,type:'dzien',hours:8,slot:s+1});
    } else {
      if(wd>=1&&wd<=5){
        const avail=workers.filter(w=>{const r=w.days[date];return r!=='vac'&&r!=='off';});
        if(avail.length<=1)shifts.push({date,type:'24h',hours:24});
        else{shifts.push({date,type:'dzien',hours:12});shifts.push({date,type:'noc',hours:12});}
      } else {
        const satS=wd===6?date:dstr(y,m,d-1);
        const mo=weModes[satS]||'24h';
        if(mo==='24h')shifts.push({date,type:'24h',hours:24});
        else if(mo==='split'){shifts.push({date,type:'dzien',hours:12});shifts.push({date,type:'noc',hours:12});}
      }
    }
  }
  shifts.sort((a,b)=>a.date.localeCompare(b.date)||(a.slot||0)-(b.slot||0)||(a.type==='dzien'?-1:b.type==='dzien'?1:0));
  return shifts;
}

function buildQuotasTest(y,m,shiftMode,minPerDay,we8=false){
  const is8=shiftMode==='8h';const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);let wdayDzien=0,wdayNoc=0,weH=0;
  for(let d=1;d<=n;d++){
    const wd=dow(y,m,d);
    if(wd>=1&&wd<=5){wdayDzien++;if(!is8)wdayNoc++;}
    else if(we8){wdayDzien++;}
    else if(!is8){
      const satS=wd===6?dstr(y,m,d):dstr(y,m,d-1);
      const mo=weModes[satS]||'24h';
      if(mo==='24h'||mo==='split')weH+=24;
    }
  }
  const numW=workers.length;const dH=is8?8:12;
  const totalH=wdayDzien*mpd*dH+wdayNoc*12+weH;
  const targetH=totalH/numW;
  const totalDSlots=is8?wdayDzien*mpd:wdayDzien;
  const maxD=totalDSlots/numW;
  const maxNocWeH=is8?0:Math.max(0,targetH-maxD*12);
  const quotas={};
  workers.forEach(w=>{quotas[w.id]={maxDzienWday:maxD,maxNocWeH,target:targetH};});
  return quotas;
}

// ── HELPERS ───────────────────────────────────────────────────────
function mkW(id,days={},extra={}){return {id,name:'W'+id,color:'#fff',days,reqDays:[],minDays:0,...extra};}
function mkCfg(target,maxDzien,maxNocWeH,extra={}){
  const quotas={};
  workers.forEach(w=>{quotas[w.id]={target,maxDzienWday:maxDzien,maxNocWeH};});
  return {tol:0,maxN:false,maxD:false,maxSun:false,quotas,...extra};
}

// ══════════════════════════════════════════════════════════════════
//  1. NARZĘDZIA
// ══════════════════════════════════════════════════════════════════
suite('dim – liczba dni w miesiącu',()=>{
  ok('styczeń=31',      dim(2025,1), 31);
  ok('luty 2025=28',    dim(2025,2), 28);
  ok('luty 2024=29',    dim(2024,2), 29);
  ok('kwiecień=30',     dim(2025,4), 30);
  ok('grudzień=31',     dim(2025,12),31);
  ok('marzec=31',       dim(2025,3), 31);
});

suite('dstr – formatowanie daty',()=>{
  ok('rok-m-d',       dstr(2025,3,5), '2025-03-05');
  ok('padding 01',    dstr(2025,1,1), '2025-01-01');
  ok('grudzień 31',   dstr(2025,12,31),'2025-12-31');
});

suite('addD – dodawanie/odejmowanie dni',()=>{
  ok('+1',              addD('2025-03-01', 1), '2025-03-02');
  ok('+1 przez m-c',    addD('2025-01-31', 1), '2025-02-01');
  ok('+1 przez rok',    addD('2025-12-31', 1), '2026-01-01');
  ok('-1',              addD('2025-03-02',-1), '2025-03-01');
  ok('-1 przez m-c',    addD('2025-03-01',-1), '2025-02-28');
  ok('+7',              addD('2025-02-22', 7), '2025-03-01');
  ok('±0',              addD('2025-06-15', 0), '2025-06-15');
});

suite('dow – dzień tygodnia',()=>{
  ok('2025-02-03 = Pn(1)', dow(2025,2,3),  1);
  ok('2025-02-08 = Sb(6)', dow(2025,2,8),  6);
  ok('2025-02-09 = Nd(0)', dow(2025,2,9),  0);
  ok('2025-01-01 = Śr(3)', dow(2025,1,1),  3);
  ok('2025-12-25 = Cz(4)', dow(2025,12,25),4);
  ok('2024-02-29 = Cz(4)', dow(2024,2,29), 4);
});

suite('isWD – czy dzień roboczy',()=>{
  ok('Pn=true',  isWD(2025,2,3),  true);
  ok('Pt=true',  isWD(2025,2,7),  true);
  ok('Sb=false', isWD(2025,2,8),  false);
  ok('Nd=false', isWD(2025,2,9),  false);
});

// ══════════════════════════════════════════════════════════════════
//  2. canAssign – OGRANICZENIA
// ══════════════════════════════════════════════════════════════════
suite('canAssign – dostępność dni',()=>{
  const w=mkW('a'); workers=[w];
  const cfg=mkCfg(200,20,100);
  const d='2025-02-05';

  ok('vac → false',         canAssign({...w,days:{[d]:'vac'}},   {date:d,type:'dzien',hours:12},[],cfg),false);
  ok('off → false',         canAssign({...w,days:{[d]:'off'}},   {date:d,type:'dzien',hours:12},[],cfg),false);
  ok('brak + dzien → true', canAssign(w,                         {date:d,type:'dzien',hours:12},[],cfg),true);
  ok('brak + noc  → true',  canAssign(w,                         {date:d,type:'noc',  hours:12},[],cfg),true);
  ok('brak + 24h  → true',  canAssign(w,                         {date:d,type:'24h',  hours:24},[],cfg),true);

  const nd={...w,days:{[d]:'no-d'}};
  ok('no-d + dzien → false',canAssign(nd,{date:d,type:'dzien',hours:12},[],cfg),false);
  ok('no-d + noc  → true',  canAssign(nd,{date:d,type:'noc',  hours:12},[],cfg),true);
  ok('no-d + 24h  → false', canAssign(nd,{date:d,type:'24h',  hours:24},[],cfg),false);

  const nn={...w,days:{[d]:'no-n'}};
  ok('no-n + noc  → false', canAssign(nn,{date:d,type:'noc',  hours:12},[],cfg),false);
  ok('no-n + dzien→ true',  canAssign(nn,{date:d,type:'dzien',hours:12},[],cfg),true);
  ok('no-n + 24h  → false', canAssign(nn,{date:d,type:'24h',  hours:24},[],cfg),false);

  const nb={...w,days:{[d]:'no-both'}};
  ok('no-both + dzien → false',canAssign(nb,{date:d,type:'dzien',hours:12},[],cfg),false);
  ok('no-both + noc  → false', canAssign(nb,{date:d,type:'noc',  hours:12},[],cfg),false);
  ok('no-both + 24h  → false', canAssign(nb,{date:d,type:'24h',  hours:24},[],cfg),false);
});

suite('canAssign – podwójna zmiana',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(200,20,100);
  const already=[{wid:'a',date:'2025-02-05',type:'dzien',hours:12}];
  ok('już w tym dniu → false',    canAssign(w,{date:'2025-02-05',type:'noc',hours:12},already,cfg),false);
  ok('inny dzień → true',         canAssign(w,{date:'2025-02-06',type:'noc',hours:12},already,cfg),true);
});

suite('canAssign – sekwencje (dzień poprzedni)',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(400,30,200);

  const prevNoc=[{wid:'a',date:'2025-02-04',type:'noc',hours:12}];
  ok('dzien po noc  → false', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},prevNoc,cfg),false);
  ok('noc po noc    → true',  canAssign(w,{date:'2025-02-05',type:'noc', hours:12},prevNoc,cfg),true);
  ok('24h po noc    → false', canAssign(w,{date:'2025-02-05',type:'24h', hours:24},prevNoc,cfg),false);

  const prev24=[{wid:'a',date:'2025-02-04',type:'24h',hours:24}];
  ok('dzien po 24h  → false', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},prev24,cfg),false);
  ok('noc po 24h    → false', canAssign(w,{date:'2025-02-05',type:'noc', hours:12},prev24,cfg),false);
  ok('24h po 24h    → false', canAssign(w,{date:'2025-02-05',type:'24h', hours:24},prev24,cfg),false);

  const prevD=[{wid:'a',date:'2025-02-04',type:'dzien',hours:12}];
  ok('noc po dzien  → true',  canAssign(w,{date:'2025-02-05',type:'noc', hours:12},prevD,cfg),true);
  ok('dzien po dz   → true',  canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},prevD,cfg),true);
  ok('24h po dzien  → true',  canAssign(w,{date:'2025-02-05',type:'24h', hours:24},prevD,cfg),true);
});

suite('canAssign – sekwencje (dzień następny)',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(400,30,200);

  const nextD=[{wid:'a',date:'2025-02-06',type:'dzien',hours:12}];
  ok('noc przed dzien  → false',canAssign(w,{date:'2025-02-05',type:'noc', hours:12},nextD,cfg),false);
  ok('24h przed dzien  → false',canAssign(w,{date:'2025-02-05',type:'24h', hours:24},nextD,cfg),false);
  ok('dzien przed dz   → true', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},nextD,cfg),true);

  const next24=[{wid:'a',date:'2025-02-06',type:'24h',hours:24}];
  ok('noc przed 24h    → false',canAssign(w,{date:'2025-02-05',type:'noc', hours:12},next24,cfg),false);
  ok('24h przed 24h    → false',canAssign(w,{date:'2025-02-05',type:'24h', hours:24},next24,cfg),false);
  ok('dzien przed 24h  → true', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},next24,cfg),true);
});

suite('canAssign – max nocki z rzędu',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(400,30,400,{maxN:true,maxNVal:3});
  const s2=[{wid:'a',date:'2025-02-03',type:'noc',hours:12},{wid:'a',date:'2025-02-04',type:'noc',hours:12}];
  ok('2 nocki → 3. ok',         canAssign(w,{date:'2025-02-05',type:'noc',hours:12},s2,cfg),true);
  const s3=[...s2,{wid:'a',date:'2025-02-05',type:'noc',hours:12}];
  ok('3 nocki → 4. false',      canAssign(w,{date:'2025-02-06',type:'noc',hours:12},s3,cfg),false);
  ok('maxN=off: 3 nocki → ok',  canAssign(w,{date:'2025-02-06',type:'noc',hours:12},s3,{...cfg,maxN:false}),true);
  ok('maxNVal=2: 2 nocki → false',canAssign(w,{date:'2025-02-05',type:'noc',hours:12},s2,{...cfg,maxNVal:2}),false);
});

suite('canAssign – max dniówki z rzędu',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(400,30,200,{maxD:true,maxDVal:3});
  const s2=[{wid:'a',date:'2025-02-03',type:'dzien',hours:12},{wid:'a',date:'2025-02-04',type:'dzien',hours:12}];
  ok('2 dniówki → 3. ok',       canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},s2,cfg),true);
  const s3=[...s2,{wid:'a',date:'2025-02-05',type:'dzien',hours:12}];
  ok('3 dniówki → 4. false',    canAssign(w,{date:'2025-02-06',type:'dzien',hours:12},s3,cfg),false);
  ok('maxD=off: 3 dniówki → ok',canAssign(w,{date:'2025-02-06',type:'dzien',hours:12},s3,{...cfg,maxD:false}),true);
});

suite('canAssign – max niedziele (2 pod rząd)',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(600,30,400,{maxSun:true});
  const s=[{wid:'a',date:'2025-01-12',type:'dzien',hours:8},{wid:'a',date:'2025-01-19',type:'dzien',hours:8}];
  ok('2 nd pod rząd → 3. false',canAssign(w,{date:'2025-01-26',type:'dzien',hours:8},s,cfg),false);
  ok('1 nd → 2. ok',            canAssign(w,{date:'2025-01-19',type:'dzien',hours:8},[s[0]],cfg),true);
  ok('maxSun=off → ok',         canAssign(w,{date:'2025-01-26',type:'dzien',hours:8},s,{...cfg,maxSun:false}),true);
});

suite('canAssign – limit łącznych godzin',()=>{
  const w=mkW('a');workers=[w];
  // target=20, tol=0: już ma 12h, chce dodać 12h → 12+12=24 > 20 → false
  const cfg=mkCfg(20,3,100,{tol:0});
  const s=[{wid:'a',date:'2025-02-03',type:'dzien',hours:12}];
  ok('12+12=24 > target(20), tol=0 → false', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},s,cfg),false);
  // tol=4: 12+12=24 > 20+4=24 → 24>24 jest false → dozwolone (warunek ścisły >)
  const cfgTol4=mkCfg(20,3,100,{tol:4});
  ok('12+12=24, tol=4: 24 > 24 false (ścisły >) → true', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},s,cfgTol4),true);
  const cfgTol12=mkCfg(20,3,100,{tol:12});
  ok('12+12=24, tol=12: 24 > 32 → true', canAssign(w,{date:'2025-02-05',type:'dzien',hours:12},s,cfgTol12),true);
  // target=24, tol=0: 0+24=24 ≤ 24 → true (warunek to >, nie >=)
  const cfg24=mkCfg(24,3,100,{tol:0});
  ok('0+24 = target(24), tol=0 → true (nie przekracza)',canAssign(w,{date:'2025-02-05',type:'24h',hours:24},[],cfg24),true);
  // target=23: 0+24 > 23 → false
  const cfg23=mkCfg(23,3,100,{tol:0});
  ok('0+24 > target(23), tol=0 → false', canAssign(w,{date:'2025-02-05',type:'24h',hours:24},[],cfg23),false);
});

suite('canAssign – 24h blokowane przez restriccje dnia',()=>{
  const w=mkW('a');workers=[w];const cfg=mkCfg(400,30,200);
  const d='2025-02-05';
  ok('no-d  + 24h → false',  canAssign({...w,days:{[d]:'no-d'}}, {date:d,type:'24h',hours:24},[],cfg),false);
  ok('no-n  + 24h → false',  canAssign({...w,days:{[d]:'no-n'}}, {date:d,type:'24h',hours:24},[],cfg),false);
  ok('no-bo + 24h → false',  canAssign({...w,days:{[d]:'no-both'}},{date:d,type:'24h',hours:24},[],cfg),false);
  ok('brak  + 24h → true',   canAssign(w,                          {date:d,type:'24h',hours:24},[],cfg),true);
});

// ══════════════════════════════════════════════════════════════════
//  3. wScore – PUNKTACJA
// ══════════════════════════════════════════════════════════════════
suite('wScore – priorytety przydziału',()=>{
  const wa=mkW('a'),wb=mkW('b');workers=[wa,wb];
  const q={a:{target:100,maxDzienWday:10,maxNocWeH:50},b:{target:100,maxDzienWday:10,maxNocWeH:50}};
  const cfg={tol:0,quotas:q};

  // Mniej godzin → niższy score
  const schedA=[{wid:'a',date:'2025-02-03',type:'dzien',hours:48}];
  const shift={date:'2025-02-10',type:'dzien',hours:12};
  ok('mniej h → niższy score',wScore(wb,shift,[],cfg)<wScore(wa,shift,schedA,cfg),true);

  // reqDay + dzien → bonus -10
  const wReq={...wa,reqDays:[3]};// środa
  const shiftWed={date:'2025-02-05',type:'dzien',hours:12};
  const base=wScore({...wa},shiftWed,[],cfg);
  const req=wScore(wReq,shiftWed,[],cfg);
  ok('reqDay+dzien: score-=10',Math.abs(req-(base-10))<0.001,true);

  // reqDay + noc → kara +8
  const shiftNoc={date:'2025-02-05',type:'noc',hours:12};
  const baseN=wScore({...wa},shiftNoc,[],cfg);
  const reqN=wScore(wReq,shiftNoc,[],cfg);
  ok('reqDay+noc: score+=8',Math.abs(reqN-(baseN+8))<0.001,true);

  // reqDay + 24h → kara +8
  const shift24={date:'2025-02-05',type:'24h',hours:24};
  const base24=wScore({...wa},shift24,[],cfg);
  const req24=wScore({...wa,reqDays:[3]},shift24,[],cfg);
  ok('reqDay+24h: score+=8',Math.abs(req24-(base24+8))<0.001,true);

  // minDays niespełnione → bonus -3
  const wMin={...wa,minDays:3};
  const shiftMon={date:'2025-02-03',type:'dzien',hours:12};
  const baseM=wScore({...wa},shiftMon,[],cfg);
  const minS=wScore(wMin,shiftMon,[],cfg);
  ok('minDays niespełnione: score-=3',Math.abs(minS-(baseM-3))<0.001,true);

  // minDays spełnione → brak bonusu
  workers=[wa];const cfg1={tol:0,quotas:{a:{target:100,maxDzienWday:10,maxNocWeH:50}}};
  const fullWeek=[
    {wid:'a',date:'2025-02-03',type:'dzien',hours:12},
    {wid:'a',date:'2025-02-04',type:'dzien',hours:12},
    {wid:'a',date:'2025-02-05',type:'dzien',hours:12},
  ];
  const wMin3={...wa,minDays:3};
  const satS=wScore(wMin3,{date:'2025-02-06',type:'dzien',hours:12},fullWeek,cfg1); // cz, cnt=3 = minDays
  const satB=wScore({...wa},{date:'2025-02-06',type:'dzien',hours:12},fullWeek,cfg1);
  ok('minDays spełnione: brak bonusu',Math.abs(satS-satB)<0.001,true);

  // 8h slot regresja III→I: kara +100
  workers=[wa];
  const sSlot=[{wid:'a',date:'2025-02-03',type:'dzien',hours:8,slot:3}];
  const sShift1={date:'2025-02-04',type:'dzien',hours:8,slot:1};
  ok('slot III→I: kara>50',wScore(wa,sShift1,sSlot,cfg1)>50,true);

  // 8h ten sam slot → bonus -0.3
  const sSlot2=[{wid:'a',date:'2025-02-03',type:'dzien',hours:8,slot:2}];
  const sShift2={date:'2025-02-04',type:'dzien',hours:8,slot:2};
  ok('ten sam slot: score<0',wScore(wa,sShift2,sSlot2,cfg1)<0,true);
});

// ══════════════════════════════════════════════════════════════════
//  4. prefillReqDays
// ══════════════════════════════════════════════════════════════════
suite('prefillReqDays – obowiązkowe dniówki',()=>{
  const mkShifts=(dates,type='dzien')=>dates.map(d=>({date:d,type,hours:12,slot:undefined}));

  // reqDays=[1]: każdy poniedziałek marca (3,10,17,24,31)
  workers=[mkW('a',{},{reqDays:[1],minDays:0})];
  const shiftsMar=[
    ...mkShifts(['2025-03-03','2025-03-10','2025-03-17','2025-03-24','2025-03-31']), // pn
    ...mkShifts(['2025-03-04','2025-03-05','2025-03-06','2025-03-07']),               // wt-pt
  ];
  let r=prefillReqDays(shiftsMar,2025,3);
  ok('reqDays=[1]: 5 pn w marcu → 5 prefill', r.prefilled.length, 5);
  ok('remaining = total - 5', r.remaining.length, shiftsMar.length-5);
  ok('prefill dla wid a', r.prefilled.every(e=>e.wid==='a'), true);

  // reqDays=[1,3]: Pn + Śr — shifts2 zawiera 2025-03-03 (Pn), 2025-03-05 (Śr), 2025-03-10 (Pn)
  // Wszystkie 3 daty pasują do reqDays=[1,3] (Pn lub Śr) → prefill = 3
  workers=[mkW('a',{},{reqDays:[1,3],minDays:0})];
  const shifts2=mkShifts(['2025-03-03','2025-03-05','2025-03-10']);
  r=prefillReqDays(shifts2,2025,3);
  ok('reqDays=[1,3]: Pn(03)+Śr(05)+Pn(10) → 3 prefill',r.prefilled.length,3);
  ok('remaining = 0 (wszystkie zużyte)',r.remaining.length,0);
  // Tylko Śr: shifts zawiera tylko środy → 1 prefill
  const shifts2b=mkShifts(['2025-03-05']); // tylko środa
  r=prefillReqDays(shifts2b,2025,3);
  ok('reqDays=[1,3]: tylko Śr w shifts → 1 prefill',r.prefilled.length,1);

  // vac na reqDay → skip
  workers=[mkW('a',{'2025-03-03':'vac'},{reqDays:[1],minDays:0})];
  const shifts3=mkShifts(['2025-03-03','2025-03-10']);
  r=prefillReqDays(shifts3,2025,3);
  ok('vac na reqDay → skip',r.prefilled.length,1);

  // off → skip
  workers=[mkW('a',{'2025-03-03':'off'},{reqDays:[1],minDays:0})];
  r=prefillReqDays(shifts3,2025,3);
  ok('off na reqDay → skip',r.prefilled.length,1);

  // no-d → skip
  workers=[mkW('a',{'2025-03-03':'no-d'},{reqDays:[1],minDays:0})];
  r=prefillReqDays(shifts3,2025,3);
  ok('no-d na reqDay → skip',r.prefilled.length,1);

  // no-both → skip
  workers=[mkW('a',{'2025-03-03':'no-both'},{reqDays:[1],minDays:0})];
  r=prefillReqDays(shifts3,2025,3);
  ok('no-both na reqDay → skip',r.prefilled.length,1);

  // Brak dzien shiftu na reqDay → skip
  workers=[mkW('a',{},{reqDays:[2],minDays:0})]; // wtorek — shifts3 nie ma wtorku
  r=prefillReqDays(shifts3,2025,3);
  ok('brak dzien shiftu → 0 prefill',r.prefilled.length,0);

  // Dwa pracownicy: A bez reqDays, B z reqDays=[3]
  workers=[mkW('a',{},{reqDays:[],minDays:0}),mkW('b',{},{reqDays:[3],minDays:0})];
  const shifts4=mkShifts(['2025-03-05','2025-03-06']); // śr + cz
  r=prefillReqDays(shifts4,2025,3);
  ok('B dostaje dniówkę w środę',r.prefilled.some(e=>e.wid==='b'&&e.date==='2025-03-05'),true);
  ok('A nie jest prefillowany (brak reqDays)',r.prefilled.every(e=>e.wid!=='a'),true);

  // Prefill nie przypisuje tego samego dnia 2× temu samemu pracownikowi
  workers=[mkW('a',{},{reqDays:[1],minDays:0})];
  const shiftsDouble=mkShifts(['2025-03-03','2025-03-03']); // dwa dzien w tym samym dniu
  r=prefillReqDays(shiftsDouble,2025,3);
  ok('podwójne przypisanie niemożliwe: max 1',r.prefilled.length,1);
});

// ══════════════════════════════════════════════════════════════════
//  5. weekOfficeCnt
// ══════════════════════════════════════════════════════════════════
suite('weekOfficeCnt – dniówki Pn-Pt',()=>{
  ok('brak dniówek → 0',weekOfficeCnt('a','2025-02-05',[]),0);
  const s3=[
    {wid:'a',date:'2025-02-03',type:'dzien',hours:12},
    {wid:'a',date:'2025-02-04',type:'dzien',hours:12},
    {wid:'a',date:'2025-02-05',type:'dzien',hours:12},
  ];
  ok('3 dniówki → 3',weekOfficeCnt('a','2025-02-05',s3),3);
  ok('nocka nie liczona',weekOfficeCnt('a','2025-02-05',[{wid:'a',date:'2025-02-05',type:'noc',hours:12}]),0);
  ok('24h nie liczone',weekOfficeCnt('a','2025-02-05',[{wid:'a',date:'2025-02-05',type:'24h',hours:24}]),0);
  ok('inny wid nie liczony',weekOfficeCnt('a','2025-02-05',[{wid:'b',date:'2025-02-03',type:'dzien',hours:12}]),0);
  ok('z niedzieli: patrzy na tydzień', weekOfficeCnt('a','2025-02-09',s3),3);
});

// ══════════════════════════════════════════════════════════════════
//  6. canDo – ROLE
// ══════════════════════════════════════════════════════════════════
suite('canDo – uprawnienia ról',()=>{
  teamSession=null;
  ok('local: generate',    canDo('generate'),true);
  ok('local: approve',     canDo('approve'),true);
  ok('local: manage_m',    canDo('manage_members'),true);

  teamSession={role:'admin'};
  ['generate','edit','approve','revoke','manage_members','manage_workers','export']
    .forEach(a=>ok(`admin: ${a}`,canDo(a),true));

  teamSession={role:'editor'};
  ['generate','edit','manage_workers','export']
    .forEach(a=>ok(`editor: ${a}`,canDo(a),true));
  ['approve','revoke','manage_members']
    .forEach(a=>ok(`editor: ${a}=false`,canDo(a),false));

  teamSession={role:'worker'};
  ['view','export'].forEach(a=>ok(`worker: ${a}`,canDo(a),true));
  ['generate','edit','approve','revoke','manage_members','manage_workers']
    .forEach(a=>ok(`worker: ${a}=false`,canDo(a),false));

  teamSession={role:'unknown'};
  ok('nieznana rola → false',canDo('generate'),false);
  teamSession=null;
});

// ══════════════════════════════════════════════════════════════════
//  7. genShifts
// ══════════════════════════════════════════════════════════════════
suite('genShifts – tryb 8h',()=>{
  workers=[mkW('a'),mkW('b')];weModes={};
  const s=genShiftsTest(2025,2,'8h',1,false);
  ok('8h: tylko dzien',         s.every(x=>x.type==='dzien'),true);
  ok('8h: każdy=8h',            s.every(x=>x.hours===8),true);
  ok('8h: slot=1',              s.every(x=>x.slot===1),true);
  ok('8h: luty 2025 = 20 dni rob.',s.length,20);

  const s2=genShiftsTest(2025,2,'8h',2,false);
  ok('8h minPerDay=2: 40 slotów',s2.length,40);
  ok('8h: slot 1 = 20',         s2.filter(x=>x.slot===1).length,20);
  ok('8h: slot 2 = 20',         s2.filter(x=>x.slot===2).length,20);

  const s3=genShiftsTest(2025,2,'8h',1,true);
  ok('8h + weekendy: 28',        s3.length,28);
});

suite('genShifts – tryb 12h',()=>{
  workers=[mkW('a'),mkW('b'),mkW('c')];weModes={};
  const s=genShiftsTest(2025,2,'12h',1);
  ok('12h weekday: 40 (dzien+noc)', s.filter(x=>x.type!=='24h'&&isWD(...x.date.split('-').map((v,i)=>i>0?+v:+v))).length,40);
  ok('12h weekendy: 8×24h',         s.filter(x=>x.type==='24h').length,8);
  ok('12h godziny 24h',             s.filter(x=>x.type==='24h').every(x=>x.hours===24),true);

  // Awaryjne 24h: tylko 1 dostępny w poniedziałek
  workers=[mkW('a'),mkW('b',{'2025-02-03':'off'})];
  const sE=genShiftsTest(2025,2,'12h',1);
  const mon=sE.filter(x=>x.date==='2025-02-03');
  ok('awaryjne 24h: 1 shift typu 24h',mon.length===1&&mon[0].type==='24h',true);
});

suite('genShifts – weekend split',()=>{
  workers=[mkW('a'),mkW('b'),mkW('c')];
  weModes={'2025-02-01':'split'};
  const s=genShiftsTest(2025,2,'12h',1);
  const sat=s.filter(x=>x.date==='2025-02-01');
  ok('split: 2 shifty Sb',sat.length,2);
  ok('split: dzien+noc',sat.some(x=>x.type==='dzien')&&sat.some(x=>x.type==='noc'),true);
  weModes={};
});

// ══════════════════════════════════════════════════════════════════
//  8. buildQuotas
// ══════════════════════════════════════════════════════════════════
suite('buildQuotas – kwoty godzin',()=>{
  workers=[mkW('a'),mkW('b')];weModes={};
  // Luty 2025: wdayDzien=20, wdayNoc=20, weH=8×24=192 → totalH=20×12+20×12+192=672 / 2 = 336
  const q=buildQuotasTest(2025,2,'12h',1);
  ok('target = 336',         q['a'].target,336);
  ok('target b = target a',  q['b'].target,q['a'].target);
  ok('maxDzienWday = 10',    q['a'].maxDzienWday,10);
  ok('maxNocWeH > 0',        q['a'].maxNocWeH>0,true);

  const q8=buildQuotasTest(2025,2,'8h',1);
  ok('8h: maxNocWeH = 0',    q8['a'].maxNocWeH,0);
  ok('8h: target = 80',      q8['a'].target,80);  // 20×8/2

  workers=[mkW('a'),mkW('b'),mkW('c')];
  const q3=buildQuotasTest(2025,2,'12h',1);
  ok('3 workers: target=224',q3['a'].target,224); // 672/3
  ok('3 workers: maxD=20/3', Math.abs(q3['a'].maxDzienWday-20/3)<0.01,true);
});

// ══════════════════════════════════════════════════════════════════
//  9. backtrack
// ══════════════════════════════════════════════════════════════════
suite('backtrack – generowanie',()=>{
  workers=[mkW('a')];
  const q={a:{target:100,maxDzienWday:10,maxNocWeH:50}};
  const cfg={tol:0,maxN:false,maxD:false,maxSun:false,quotas:q};
  const sh1=[{date:'2025-02-03',type:'dzien',hours:12}];
  const r1=[];backtrack(sh1,0,[],r1,5,cfg);
  ok('1 worker 1 shift → 1 wynik',r1.length,1);
  ok('wynik.wid = a',r1[0][0].wid,'a');

  workers=[mkW('a'),mkW('b')];
  const q2={a:{target:100,maxDzienWday:10,maxNocWeH:50},b:{target:100,maxDzienWday:10,maxNocWeH:50}};
  const cfg2={...cfg,quotas:q2};
  const r2=[];backtrack(sh1,0,[],r2,1,cfg2);
  ok('limit=1: max 1 wynik',r2.length,1);

  const sh2=[{date:'2025-02-03',type:'dzien',hours:12},{date:'2025-02-03',type:'noc',hours:12}];
  const r3=[];backtrack(sh2,0,[],r3,10,cfg2);
  ok('2 workers 2 zmiany: ≥1 wynik',r3.length>=1,true);
  ok('każdy wynik ma 2 wpisy',r3.every(s=>s.length===2),true);

  // Deadline w przeszłości → 0 wyników
  const r4=[];backtrack(sh1,0,[],r4,100,{...cfg2,_deadline:Date.now()-1});
  ok('deadline przeszły → 0',r4.length,0);

  // Wszyscy na urlopie → 0
  workers=[mkW('a',{'2025-02-03':'vac'})];
  const q1={a:{target:100,maxDzienWday:10,maxNocWeH:50}};
  const r5=[];backtrack(sh1,0,[],r5,5,{...cfg,quotas:q1});
  ok('wszyscy vac → 0',r5.length,0);
});

// ══════════════════════════════════════════════════════════════════
//  10. genTeamId
// ══════════════════════════════════════════════════════════════════
suite('genTeamId – losowe ID',()=>{
  function genTeamId(){
    const c='abcdefghijklmnopqrstuvwxyz0123456789';
    let id='';for(let i=0;i<8;i++)id+=c[Math.floor(Math.random()*c.length)];
    return id;
  }
  const id=genTeamId();
  ok('długość = 8',         id.length,8);
  ok('tylko [a-z0-9]',      /^[a-z0-9]+$/.test(id),true);
  // Wywołaj wiele razy i sprawdź unikalność
  const ids=new Set(Array.from({length:50},()=>genTeamId()));
  ok('50 wywołań: co najmniej 45 unikatowych',ids.size>=45,true);
});

// ══════════════════════════════════════════════════════════════════
//  11. togReqDay
// ══════════════════════════════════════════════════════════════════
suite('togReqDay – przełączanie dni',()=>{
  function togReqDay(wid,wd,checked){
    const w=workers.find(x=>x.id===wid);if(!w)return;
    if(!w.reqDays)w.reqDays=[];
    if(checked){if(!w.reqDays.includes(wd))w.reqDays.push(wd);}
    else{w.reqDays=w.reqDays.filter(d=>d!==wd);}
    w.reqDays.sort((a,b)=>a-b);
  }
  workers=[{...mkW('a'),reqDays:[]}];
  togReqDay('a',1,true);  okDeep('dodaj Pn',workers[0].reqDays,[1]);
  togReqDay('a',3,true);  okDeep('dodaj Śr → [1,3]',workers[0].reqDays,[1,3]);
  togReqDay('a',1,false); ok('usuń Pn → [3]',JSON.stringify(workers[0].reqDays),'[3]');
  togReqDay('a',3,false); ok('usuń Śr → []',workers[0].reqDays.length,0);
  togReqDay('a',2,true);togReqDay('a',2,true);
  ok('duplikat: tylko 1',workers[0].reqDays.length,1);
  workers=[{...mkW('a'),reqDays:[]}];
  togReqDay('a',5,true);togReqDay('a',2,true);togReqDay('a',4,true);
  okDeep('sortowanie',[...workers[0].reqDays],[2,4,5]);
});

// ══════════════════════════════════════════════════════════════════
//  12. Walidacja rejestracji (bez Firebase)
// ══════════════════════════════════════════════════════════════════
suite('walidacja logowania/rejestracji',()=>{
  function valLogin(l){
    if(!l||l.length<3)return 'min3';
    if(!/^[a-z0-9_]+$/.test(l))return 'format';
    return null;
  }
  function valReg(l,dn,p,p2){
    const e=valLogin(l);if(e)return e;
    if(!dn)return 'noName';
    if(p.length<4)return 'pwShort';
    if(p!==p2)return 'pwMismatch';
    return null;
  }
  ok('login < 3 → min3',    valLogin('ab'),'min3');
  ok('login 3 → ok',        valLogin('abc'),null);
  ok('login wielkie → format',valLogin('Jan'),'format');
  ok('login spacja → format',valLogin('a b'),'format');
  ok('login _ ok',          valLogin('jan_k'),null);
  ok('login cyfry ok',      valLogin('user1'),null);
  ok('brak nazwy → noName', valReg('jan','','pass1','pass1'),'noName');
  ok('hasło < 4 → pwShort', valReg('jan','J','abc','abc'),'pwShort');
  ok('hasła ≠ → mismatch',  valReg('jan','J','pass1','pass2'),'pwMismatch');
  ok('wszystko ok → null',  valReg('jan','J','pass1','pass1'),null);
});

// ══════════════════════════════════════════════════════════════════
//  13. SYNCHRONIZACJA – kilku użytkowników na tym samym miesiącu
// ══════════════════════════════════════════════════════════════════

// Mock Firestore: operacje in-memory z obsługą onSnapshot
class MockFS{
  constructor(init={}){this._doc=JSON.parse(JSON.stringify(init));this._subs=[];}
  async get(){return {exists:true,data:()=>JSON.parse(JSON.stringify(this._doc))};}
  async update(patch){
    for(const [k,v] of Object.entries(patch)){
      if(v===null){
        const p=k.split('.');let o=this._doc;
        for(let i=0;i<p.length-1;i++){if(o[p[i]]===undefined)o[p[i]]={};o=o[p[i]];}
        delete o[p[p.length-1]];
      } else if(k.includes('.')){
        const p=k.split('.');let o=this._doc;
        for(let i=0;i<p.length-1;i++){if(o[p[i]]===undefined)o[p[i]]={};o=o[p[i]];}
        o[p[p.length-1]]=v;
      } else this._doc[k]=v;
    }
    this._notify();
  }
  onSnapshot(cb){
    this._subs.push(cb);
    cb({exists:true,data:()=>JSON.parse(JSON.stringify(this._doc))});
    return ()=>{this._subs=this._subs.filter(f=>f!==cb);};
  }
  _notify(){
    const snap={exists:true,data:()=>JSON.parse(JSON.stringify(this._doc))};
    this._subs.forEach(cb=>cb(snap));
  }
}

// Logika zatwierdzania bez DOM (zrefaktorowana)
async function approveLogic(db,mk,session,sched){
  const chk=await db.get();
  const ap=(chk.data().approvedSchedules||{})[mk];
  if(ap&&!ap.revoked){
    const canRevoke=(session.role==='admin')||(ap.approvedByLogin===session.login);
    if(!canRevoke)return {ok:false,reason:'already_approved_by_other'};
  }
  const doc=await db.get();const data=doc.data();
  const prevAp=(data.approvedSchedules||{})[mk];
  const history=(data.scheduleHistory&&data.scheduleHistory[mk])||[];
  if(prevAp)history.push({...prevAp});
  const ver=history.length+1;
  const upd={};
  upd[`approvedSchedules.${mk}`]={data:sched,version:ver,approvedBy:session.displayName,approvedByLogin:session.login,approvedAt:new Date().toISOString()};
  upd[`scheduleHistory.${mk}`]=history;
  await db.update(upd);
  return {ok:true,ver};
}

async function revokeLogic(db,mk,session){
  const doc=await db.get();const ap=doc.data().approvedSchedules?.[mk];
  if(!ap||ap.revoked)return {ok:false,reason:'not_approved'};
  const canRevoke=(session.role==='admin')||(ap.approvedByLogin===session.login);
  if(!canRevoke)return {ok:false,reason:'no_permission'};
  const upd={};
  upd[`approvedSchedules.${mk}.revoked`]=true;
  upd[`approvedSchedules.${mk}.revokedBy`]=session.displayName;
  upd[`approvedSchedules.${mk}.revokedByLogin`]=session.login;
  if(ap.data)upd[`pendingSchedules.${mk}`]=[{shifts:ap.data}];
  await db.update(upd);
  return {ok:true};
}

suite('sync – jednoczesne dołączanie do zespołu',()=>{
  (async()=>{
    const db=new MockFS({name:'Ochrona',members:{},workers:[]});
    // A i B dołączają jednocześnie (sekwencyjne update = merge pól)
    await db.update({'members.alice':{displayName:'Alice',role:'worker'}});
    await db.update({'members.bob':  {displayName:'Bob',  role:'worker'}});
    const d=await db.get();
    ok('SYNC: alice dołączyła', !!d.data().members.alice, true);
    ok('SYNC: bob dołączył',    !!d.data().members.bob,   true);
    ok('SYNC: oboje worker',
       d.data().members.alice.role==='worker'&&d.data().members.bob.role==='worker',true);
  })().catch(e=>{fail++;console.log(`  ${R}✗ async error: ${e.message}${X}`);});
});

suite('sync – race condition zatwierdzania',async()=>{
  const db=new MockFS({approvedSchedules:{},scheduleHistory:{},pendingSchedules:{}});
  const mk='2025-2';
  const sessA={login:'alice',displayName:'Alice',role:'admin'};
  const sessB={login:'bob',  displayName:'Bob',  role:'admin'};
  const sessC={login:'carol',displayName:'Carol',role:'worker'};
  const sessD={login:'dave', displayName:'Dave', role:'editor'};

  // 1. Pierwsze zatwierdzenie
  const r1=await approveLogic(db,mk,sessA,['shift_a']);
  ok('SYNC: pierwsze zatwierdzenie ok',r1.ok,true);
  ok('SYNC: wersja 1',r1.ver,1);

  // 2. Worker próbuje nadpisać → blokada
  const r2=await approveLogic(db,mk,sessC,['shift_c']);
  ok('SYNC: worker nie może nadpisać',r2.ok,false);
  ok('SYNC: reason = already_approved_by_other',r2.reason,'already_approved_by_other');

  // 3. Editor (nie-admin, nie-approver) → blokada
  const r3=await approveLogic(db,mk,sessD,['shift_d']);
  ok('SYNC: editor-niebędący-approverem nie może nadpisać',r3.ok,false);

  // 4. Admin B może nadpisać
  const r4=await approveLogic(db,mk,sessB,['shift_b']);
  ok('SYNC: admin może nadpisać',r4.ok,true);
  ok('SYNC: wersja rośnie do 2',r4.ver,2);

  // 5. Historia zawiera v1
  const doc=await db.get();
  ok('SYNC: historia: 1 poprzednia wersja',doc.data().scheduleHistory[mk].length,1);
  ok('SYNC: historia v1 = Alice',doc.data().scheduleHistory[mk][0].approvedBy,'Alice');

  // 6. Aktualny approvedBy = Bob
  ok('SYNC: aktualny approvedBy = Bob',doc.data().approvedSchedules[mk].approvedBy,'Bob');

  // 7. Alice jest adminką → może cofnąć zatwierdzenie Boba (mimo że sama nie zatwierdziła v2)
  const r5=await revokeLogic(db,mk,sessA);
  ok('SYNC: Alice (admin) może cofnąć zatwierdzenie Boba',r5.ok,true);

  // 8. Grafik już cofnięty przez Alice → Bob próbuje cofnąć → false (już cofnięty)
  const r6=await revokeLogic(db,mk,sessB);
  ok('SYNC: Bob nie może cofnąć – już cofnięte przez Alice',r6.ok,false);
  const doc2=await db.get();
  ok('SYNC: revoked=true',doc2.data().approvedSchedules[mk].revoked,true);
  ok('SYNC: pendingSchedules przywrócone',
     !!doc2.data().pendingSchedules[mk],true);
});

suite('sync – onSnapshot: propagacja zmian',()=>{
  const fs=new MockFS({workers:[],weModes:{},approvedSchedules:{}});
  const log=[];
  const unsub=fs.onSnapshot(snap=>{log.push(JSON.parse(JSON.stringify(snap.data())));});

  ok('SYNC: natychmiast wywołany przy subskrypcji',log.length,1);

  fs.update({workers:['jan']});
  ok('SYNC: workers zaktualizowane',log.length,2);
  ok('SYNC: workers zawiera jan',log[1].workers[0],'jan');

  fs.update({'weModes.2025-03-01':'split'});
  ok('SYNC: weModes zaktualizowane',log.length,3);
  ok('SYNC: weModes.2025-03-01 = split',log[2].weModes['2025-03-01'],'split');

  // Cofnięcie zatwierdzenia przez update
  fs.update({'approvedSchedules.2025-2':{version:1,approvedBy:'Alice'}});
  ok('SYNC: approvedSchedules zaktualizowane',log.length,4);

  // Unsubscribe: brak kolejnych notyfikacji
  unsub();
  fs.update({workers:['jan','anna']});
  ok('SYNC: po unsub: brak nowych logów',log.length,4);
});

suite('sync – pending schedules (last-write-wins)',()=>{
  const store={pendingSchedules:{}};

  function savePending(mk,sched,user){
    store.pendingSchedules[mk]=[{shifts:sched,savedBy:user,savedAt:Date.now()}];
  }

  savePending('2025-3',['a'],'alice');
  ok('SYNC: Alice zapisała pending',store.pendingSchedules['2025-3'][0].savedBy,'alice');
  savePending('2025-3',['b'],'bob');
  ok('SYNC: Bob nadpisał (last-write-wins)',store.pendingSchedules['2025-3'][0].savedBy,'bob');
  ok('SYNC: tylko 1 pending',store.pendingSchedules['2025-3'].length,1);

  // Różne miesiące: nie interferują
  savePending('2025-4',['c'],'carol');
  ok('SYNC: inny miesiąc nie nadpisuje',store.pendingSchedules['2025-3'][0].savedBy,'bob');
  ok('SYNC: kwiecień carol',store.pendingSchedules['2025-4'][0].savedBy,'carol');
});

suite('sync – zmiana roli w trakcie sesji',()=>{
  // canDo() opiera się na teamSession.role – sesja jest stale do refreshu
  teamSession={login:'alice',role:'editor',displayName:'Alice',teamId:'t1'};
  ok('SYNC: editor może generować',canDo('generate'),true);
  ok('SYNC: editor nie może zatwierdzać',canDo('approve'),false);

  // Admin degraduje Alice do worker (Firestore update)
  // Aplikacja nie pobiera nowej roli bez refreshu – dokumentujemy to zachowanie
  teamSession={...teamSession,role:'worker'}; // co stałoby się po refreshu
  ok('SYNC: po refresh z worker: generate=false',canDo('generate'),false);
  ok('SYNC: worker może view',canDo('view'),true);

  // Admin awansuje do admin
  teamSession={...teamSession,role:'admin'};
  ok('SYNC: po awansie: manage_members=true',canDo('manage_members'),true);
  teamSession=null;
});

suite('sync – cofnięcie zatwierdzenia: uprawnienia',()=>{
  function canRevoke(session,ap){
    if(!ap||ap.revoked)return false;
    return session.role==='admin'||(ap.approvedByLogin&&ap.approvedByLogin===session.login);
  }
  const ap={approvedBy:'Alice',approvedByLogin:'alice',version:1};

  ok('SYNC: admin może cofnąć czyjś',                     canRevoke({role:'admin',login:'bob'},ap),true);
  ok('SYNC: własny approver może cofnąć (editor)',        canRevoke({role:'editor',login:'alice'},ap),true);
  ok('SYNC: własny approver może cofnąć (worker-dwngrade)',canRevoke({role:'worker',login:'alice'},ap),true); // alice zatwierdziła = może cofnąć
  ok('SYNC: inny editor nie może cofnąć',                 canRevoke({role:'editor',login:'carol'},ap),false);
  ok('SYNC: worker nie-approver nie może cofnąć',         canRevoke({role:'worker',login:'dave'},ap),false);
  ok('SYNC: już cofnięty → false',          canRevoke({role:'admin',login:'bob'},{...ap,revoked:true}),false);
  ok('SYNC: brak ap → false',               canRevoke({role:'admin',login:'bob'},null),false);

  // Wersjonowanie: n cofnięć i zatwierdzeń
  const hist=[ap,{...ap,version:2},{...ap,version:3}];
  ok('SYNC: następna wersja = hist.length+1',hist.length+1,4);
});

suite('sync – równoległa edycja workers (merge vs nadpisanie)',()=>{
  function applyPatch(state,patch){
    const n=JSON.parse(JSON.stringify(state));
    for(const [k,v] of Object.entries(patch)){
      if(k.includes('.')){
        const p=k.split('.');let o=n;
        for(let i=0;i<p.length-1;i++){if(!o[p[i]])o[p[i]]={};o=o[p[i]];}
        o[p[p.length-1]]=v;
      } else n[k]=v;
    }
    return n;
  }
  let s={workers:['jan'],weModes:{}};

  // Admin A dodaje annę
  s=applyPatch(s,{workers:['jan','anna']});
  ok('SYNC: A dodał annę',s.workers.includes('anna'),true);

  // Admin B zmienia weModes (pole niezależne – brak konfliktu)
  s=applyPatch(s,{'weModes.2025-03-01':'split'});
  ok('SYNC: B zmienił weModes bez kolizji',s.weModes['2025-03-01'],'split');
  ok('SYNC: workers nienaruszone po B',s.workers.includes('anna'),true);

  // Konflikt na workers: last-write-wins
  const sA=applyPatch(s,{workers:['jan','anna','piotr']});
  const sB=applyPatch(s,{workers:['jan','marek']});       // B wygrywa
  ok('SYNC: last-write-wins: B ma tylko swoją listę',JSON.stringify(sB.workers),JSON.stringify(['jan','marek']));
  ok('SYNC: piotr z A nie jest w B',!sB.workers.includes('piotr'),true);

  // Natomiast pola zagnieżdżone (weModes) nie nadpisują workers
  const sC=applyPatch(sA,{'weModes.2025-04-01':'24h'});
  ok('SYNC: weModes update nie ruszył workers',sC.workers.includes('piotr'),true);
});

suite('sync – _skipSnap: ignorowanie własnych zapisów',()=>{
  // Przy zapisie do Firestore aplikacja ustawia _skipSnap=true żeby zignorować
  // natychmiast wracający snapshot (echo własnego zapisu)
  let _skipSnap=false;
  const received=[];

  const fs2=new MockFS({workers:[]});
  fs2.onSnapshot(snap=>{
    if(_skipSnap){_skipSnap=false;return;}
    received.push({...snap.data()});
  });

  // Natychmiast po subskrypcji: snapshots bez skip
  ok('SYNC: natychmiast wywołany',received.length,1);

  // Własny zapis: ustawiamy skip
  _skipSnap=true;
  fs2.update({workers:['jan']});
  ok('SYNC: własny zapis ignorowany (_skipSnap)',received.length,1);

  // Cudzy zapis: bez skip
  fs2.update({workers:['jan','anna']});
  ok('SYNC: cudzy zapis wyświetlony',received.length,2);
  ok('SYNC: anna widoczna',received[1].workers.includes('anna'),true);
});

// ══════════════════════════════════════════════════════════════════
//  PODSUMOWANIE
// ══════════════════════════════════════════════════════════════════
// Async testy wymagają chwili na ukończenie
setTimeout(()=>{
  console.log('\n'+'═'.repeat(60));
  const total=pass+fail;
  const pct=total>0?Math.round(pass/total*100):0;
  if(fail===0){
    console.log(`\x1b[32m✓ WSZYSTKIE TESTY PRZESZŁY\x1b[0m  \x1b[2m(${pass}/${total}, ${pct}%)\x1b[0m`);
  } else {
    console.log(`\x1b[31m✗ NIEPOWODZENIE\x1b[0m  ${pass} pass, \x1b[31m${fail} fail\x1b[0m, ${total} total (${pct}%)`);
  }
  console.log('═'.repeat(60)+'\n');
  process.exitCode=fail>0?1:0;
},50);
