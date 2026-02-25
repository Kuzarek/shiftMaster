// ── CONSTANTS ──────────────────────────────────────────────────────
const COLORS=['#6c63ff','#e11d48','#16a34a','#d97706','#0891b2','#7c3aed','#dc2626','#059669'];
const MONTHS=['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const MSHORT=['','Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
const DNS=['Nd','Pn','Wt','Śr','Cz','Pt','Sb'];
const LS='shiftmaster_v6';

// day value meanings:
// 'vac'   = urlop (Pn-Pt +8h, weekend 0h)
// 'off'   = niedostępny (0h, nie można przypisać)
// 'no-d'  = tylko noc (ograniczenie)
// 'no-n'  = tylko dzień (ograniczenie)
// 'no-both'= oba zablokowane

let wCtr=0, workers=[], weModes={}, cmode={}, schedules=[];

// ── UTILS ──────────────────────────────────────────────────────────
const dim=(y,m)=>new Date(y,m,0).getDate();
const dstr=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const addD=(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const dow=(y,m,d)=>new Date(y,m-1,d).getDay();
const isWD=(y,m,d)=>{const w=dow(y,m,d);return w>=1&&w<=5};
const ym=()=>({y:+document.getElementById('selY').value,m:+document.getElementById('selM').value});

// ── THEME ──────────────────────────────────────────────────────────
function togTheme(){
  const h=document.documentElement,d=h.dataset.theme==='dark';
  h.dataset.theme=d?'light':'dark';
  document.getElementById('thBtn').textContent=d?'🌙':'☀️';
  localStorage.setItem('sm_theme',h.dataset.theme);
}
(()=>{
  const s=localStorage.getItem('sm_theme')||'light';
  document.documentElement.dataset.theme=s;
  document.addEventListener('DOMContentLoaded',()=>{document.getElementById('thBtn').textContent=s==='dark'?'☀️':'🌙';});
})();

// ── MOBILE SIDEBAR TOGGLE ──────────────────────────────────────
function togSidebar(){
  const sb=document.getElementById('sidebar');
  const ov=document.getElementById('mobOverlay');
  const cl=document.getElementById('mobClose');
  const open=sb.classList.toggle('open');
  ov.style.display=open?'block':'none';
  cl.style.display=open?'block':'none';
  document.body.style.overflow=open?'hidden':'';
}

// ── SAVE / LOAD ────────────────────────────────────────────────────
function saveW(){
  if(teamSession&&db){saveToFirestore();return;}
  try{
    localStorage.setItem(LS,JSON.stringify({
      workers:workers.map(w=>({id:w.id,name:w.name,color:w.color,days:w.days||{},minDays2:!!w.minDays2})),
      ctr:wCtr
    }));
    toast('✓ Zapisano '+workers.length+' pracowników');
  }catch(e){toast('✗ Błąd zapisu');}
}
function loadW(){
  if(teamSession&&db){loadTeamData();return;}
  try{
    const raw=localStorage.getItem(LS);if(!raw){toast('Brak danych');return;}
    const d=JSON.parse(raw);
    workers=d.workers.map(w=>({...w,_open:false,days:w.days||{}}));
    wCtr=d.ctr||workers.length;
    workers.forEach(w=>{cmode[w.id]='vac';});
    renderWorkers();toast('✓ Wczytano '+workers.length+' pracowników');
  }catch(e){toast('✗ Błąd wczytywania');}
}
function clearSave(){localStorage.removeItem(LS);toast('✓ Wyczyszczono');}
function toast(msg){
  const el=document.getElementById('toast');el.textContent=msg;el.style.opacity='1';
  clearTimeout(el._t);el._t=setTimeout(()=>el.style.opacity='0',2500);
}

// ── SIDEBAR ────────────────────────────────────────────────────────
function showP(id,btn){
  document.querySelectorAll('.spanel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(b=>b.classList.remove('active'));
  document.getElementById(id).classList.add('active');btn.classList.add('active');
}

// ── MONTH / WEEKEND ────────────────────────────────────────────────
function onMC(){
  // Wyjdź z widoku zatwierdzonego przy zmianie miesiąca
  if(_approvedViewActive){_hideApprovedSchedule();}
  schedules=[];window._schedMeta=null;
  buildWeModes();renderWorkers();renderWEGrid();
  document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  renderApprovedBanner(_cachedAppSch);
  // Automatycznie pokaż zatwierdzony grafik dla nowego miesiąca
  const {y,m}=ym();const mk=y+'-'+m;
  const ap=_cachedAppSch&&_cachedAppSch[mk];
  if(ap&&!ap.revoked&&teamSession&&db){
    showApprovedSchedule(mk,'current');
  } else {
    const ps=_cachedPendSch&&_cachedPendSch[mk];
    if(ps&&ps.length&&teamSession){
      schedules=ps.map(s=>s.shifts||s);
      window._schedMeta=(_cachedSchedMeta&&_cachedSchedMeta[mk])||null;
      if(window._schedMeta){
        const {y:sy,m:sm,fallbackUsed,firstCount}=window._schedMeta;
        renderAll(sy,sm,fallbackUsed||false,firstCount||schedules.length);
      } else {
        document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
      }
    } else {
      document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
    }
  }
}
function buildWeModes(){
  const {y,m}=ym();const n=dim(y,m);const nx={};
  for(let d=1;d<=n;d++)if(dow(y,m,d)===6){const s=dstr(y,m,d);nx[s]=weModes[s]||'24h';}
  weModes=nx;
}
function setWEMode(s,mode){weModes[s]=mode;renderWEGrid();autoSave();}
function renderWEGrid(){
  const {y,m}=ym();const n=dim(y,m);const g=document.getElementById('wegrid');if(!g)return;
  let h='';
  for(let d=1;d<=n;d++){
    if(dow(y,m,d)!==6)continue;
    const s=dstr(y,m,d);const nd=d<n?d+1:null;const mo=weModes[s]||'24h';
    h+=`<div class="werow">
      <div class="wedate">${d}${nd?'/'+nd:''} ${MSHORT[m]} <span style="color:var(--muted2);font-size:7px">Sb${nd?'/Nd':''}</span></div>
      <div class="webtns">
        <button class="webtn ${mo==='24h'?'a24':''}" onclick="setWEMode('${s}','24h')">24h</button>
        <button class="webtn ${mo==='split'?'asp':''}" onclick="setWEMode('${s}','split')">D+N</button>
        <button class="webtn ${mo==='wolny'?'awol':''}" onclick="setWEMode('${s}','wolny')">Wolny</button>
      </div>
    </div>`;
  }
  g.innerHTML=h||'<p style="font-size:9px;color:var(--muted)">Brak weekendów</p>';
}

// ── WORKERS ────────────────────────────────────────────────────────
function addW(name){
  const id=wCtr++;
  workers.push({id,name:name||`Pracownik ${id+1}`,color:COLORS[workers.length%COLORS.length],_open:false,days:{},minDays2:false});
  cmode[id]='vac';renderWorkers();autoSave();
}
function delW(id){workers=workers.filter(w=>w.id!==id);renderWorkers();autoSave();}
function renderWorkers(){
  const {y,m}=ym();const list=document.getElementById('wlist');list.innerHTML='';
  workers.forEach(w=>{
    const div=document.createElement('div');
    div.className='wcard'+(w._open?' exp':'');div.id='wc'+w.id;
    div.innerHTML=buildWCard(w,y,m);list.appendChild(div);
  });
}
function buildWCard(w,y,m){
  const cnt=Object.keys(w.days).length;
  const badges=cnt?`<span class="wbadge bc">${cnt}×</span>`:'';
  const body=w._open?`<div class="wbody">${buildWOpts(w)}${buildCal(w,y,m)}</div>`:'';
  return `<div class="whead">
    <div class="wdot" style="background:${w.color}"></div>
    <input class="wname" value="${w.name}" oninput="workers.find(x=>x.id===${w.id}).name=this.value;autoSave()" placeholder="Imię">
    <div class="wbadges">${badges}</div>
    <button class="warr${w._open?' op':''}" onclick="togW(${w.id})">▾</button>
    <button class="wdel" onclick="delW(${w.id})">×</button>
  </div>${body}`;
}
function buildWOpts(w){
  return `<div class="wopts">
    <label class="chkr"><input type="checkbox" ${w.minDays2?'checked':''} onchange="workers.find(x=>x.id===${w.id}).minDays2=this.checked;autoSave()">
    <div><span class="chkl">Min. 2 dniówki Pn–Pt / tydzień</span>
    <div class="chkn">Algorytm priorytetowo przydzieli min. 2 dniówki tygodniowo</div></div></label>
  </div>`;
}

function togW(id){
  const w=workers.find(x=>x.id===id);if(!w)return;
  w._open=!w._open;const {y,m}=ym();
  const c=document.getElementById('wc'+id);
  c.className='wcard'+(w._open?' exp':'');c.innerHTML=buildWCard(w,y,m);
}

// ── MINI CALENDAR ─────────────────────────────────────────────────
const CM={
  vac:  {l:'🏖 Urlop',       h:'Urlop: Pn-Pt +8h; weekend 0h. Kliknij ponownie = odznacz'},
  off:  {l:'🚫 Niedostępny', h:'Niedostępny: nie można przypisać żadnej zmiany, 0h'},
  'no-d':{l:'🌙 Bez dniówki',h:'Blokada dniówki — pracownik może dostać tylko nocki. Kliknij ponownie = odznacz'},
  'no-n':{l:'☀ Bez nocki',   h:'Blokada nocki — pracownik może dostać tylko dniówki. Kliknij ponownie = odznacz'},
  clr:  {l:'✕ Wyczyść',     h:'Usuwa oznaczenie klikniętego dnia'},
};
function buildCal(w,y,m){
  const n=dim(y,m);const off=(dow(y,m,1)+6)%7;
  const cm=cmode[w.id]||'vac';const cnt=Object.keys(w.days).length;
  const btns=Object.entries(CM).map(([k,v])=>
    `<button class="cmbtn${cm===k?' on-'+k:''}" onclick="setCM(${w.id},'${k}')">${v.l}</button>`
  ).join('');
  let g=`<div class="calgrid">${['Pn','Wt','Śr','Cz','Pt','Sb','Nd'].map(x=>`<div class="caldn">${x}</div>`).join('')}${Array(off).fill('<div class="cald emp"></div>').join('')}`;
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);const wd=dow(y,m,d);const we=wd===0||wd===6;
    const r=w.days[date];
    let cls=we?'we':'';
    if(r==='vac')cls+=we?' rvw':' rv';
    else if(r==='off')cls+=' roff';
    else if(r==='no-d')cls+=' rnd';
    else if(r==='no-n')cls+=' rnn';
    else if(r==='no-both')cls+=' rnb';
    g+=`<div class="cald ${cls}" onclick="calClick(${w.id},'${date}')">${d}</div>`;
  }
  g+='</div>';
  return `<div class="cmodes">${btns}</div>
  <div class="mhint">${CM[cm].h}</div>
  <div class="calhead"><span class="caltit">${MONTHS[m]} ${y}</span><span class="calcnt">${cnt} oznaczeń</span></div>
  ${g}
  <div class="calleg">
    <div class="cli"><div class="clidot" style="background:var(--purple-bg);border-color:var(--purple)"></div>Urlop Pn-Pt</div>
    <div class="cli"><div class="clidot" style="background:var(--blue-bg);border-color:var(--blue)"></div>Urlop Sb-Nd</div>
    <div class="cli"><div class="clidot" style="background:var(--gray-bg);border-color:var(--gray)"></div>Niedostępny</div>
    <div class="cli"><div class="clidot" style="background:var(--yellow-bg);border-color:var(--yellow)"></div>Bez dniówki</div>
    <div class="cli"><div class="clidot" style="background:var(--orange-bg);border-color:var(--orange)"></div>Bez nocki</div>
  </div>`;
}
function setCM(wid,mode){
  cmode[wid]=mode;const w=workers.find(x=>x.id===wid);
  if(w&&w._open){const {y,m}=ym();document.getElementById('wc'+wid).innerHTML=buildWCard(w,y,m);}
}
function calClick(wid,date){
  const w=workers.find(x=>x.id===wid);if(!w)return;
  const cm=cmode[wid]||'vac';const cur=w.days[date];
  if(cm==='clr'){delete w.days[date];}
  else if(cm==='vac'){cur==='vac'?delete w.days[date]:w.days[date]='vac';}
  else if(cm==='off'){cur==='off'?delete w.days[date]:w.days[date]='off';}
  else if(cm==='no-d'){
    if(cur==='no-d')delete w.days[date];
    else if(cur==='no-n')w.days[date]='no-both';
    else if(cur==='no-both')w.days[date]='no-n';
    else w.days[date]='no-d';
  } else if(cm==='no-n'){
    if(cur==='no-n')delete w.days[date];
    else if(cur==='no-d')w.days[date]='no-both';
    else if(cur==='no-both')w.days[date]='no-d';
    else w.days[date]='no-n';
  }
  const {y,m}=ym();document.getElementById('wc'+wid).innerHTML=buildWCard(w,y,m);
  autoSave();
}

// ── SHIFT GENERATION ──────────────────────────────────────────────
function genShifts(y,m,shiftMode,minPerDay){
  const is8=shiftMode==='8h';
  const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);const shifts=[];
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);const wd=dow(y,m,d);
    if(is8){
      if(wd>=1&&wd<=5){
        for(let s=0;s<mpd;s++)shifts.push({date,type:'dzien',hours:8});
      }
    } else {
      if(wd>=1&&wd<=5){
        shifts.push({date,type:'dzien',hours:12});
        shifts.push({date,type:'noc',hours:12});
      } else {
        const satS=wd===6?date:dstr(y,m,d-1);
        const mo=weModes[satS]||'24h';
        if(mo==='24h')shifts.push({date,type:'24h',hours:24});
        else if(mo==='split'){
          shifts.push({date,type:'dzien',hours:12});
          shifts.push({date,type:'noc',hours:12});
        }
      }
    }
  }
  shifts.sort((a,b)=>a.date.localeCompare(b.date)||(a.type==='dzien'?-1:b.type==='dzien'?1:0));
  return shifts;
}

// ── KWOTY (pre-obliczone przed generowaniem) ──────────────────────
// Każdy pracownik dostaje równą kwotę dniówek Pn-Pt i nocek+weekendów.
// Wszystkie dniówki Pn-Pt traktowane jako biurowe (nie ma rozróżnienia B/D).

function buildQuotas(y,m,shiftMode,minPerDay){
  const is8=shiftMode==='8h';
  const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);
  let wdayDzien=0,wdayNoc=0,weH=0;
  for(let d=1;d<=n;d++){
    const wd=dow(y,m,d);
    if(wd>=1&&wd<=5){wdayDzien++;if(!is8)wdayNoc++;}
    else if(!is8){
      const satS=wd===6?dstr(y,m,d):dstr(y,m,d-1);
      const mo=weModes[satS]||'24h';
      if(mo==='24h')weH+=24;
      else if(mo==='split'){weH+=24;}
    }
  }
  const numW=workers.length;
  const dH=is8?8:12;
  const totalH=wdayDzien*mpd*dH+wdayNoc*12+weH;
  const targetH=totalH/numW;
  const totalDSlots=is8?wdayDzien*mpd:wdayDzien;
  const maxD=totalDSlots/numW;
  const maxNocWeH=is8?0:Math.max(0,targetH-maxD*12);
  const quotas={};
  workers.forEach(w=>{
    quotas[w.id]={maxDzienWday:maxD,maxNocWeH,target:targetH};
  });
  return quotas;
}

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

// ── CONSTRAINTS ───────────────────────────────────────────────────
function canAssign(w,shift,sched,cfg){
  const {date,type}=shift;const wid=w.id;const r=w.days[date];
  const q=cfg.quotas[wid];

  if(r==='vac'||r==='off')return false;
  if(type==='dzien'&&(r==='no-d'||r==='no-both'))return false;
  if(type==='noc'&&(r==='no-n'||r==='no-both'))return false;
  if(sched.some(e=>e.wid===wid&&e.date===date))return false;

  const prev=addD(date,-1),next=addD(date,1);
  const pe=sched.find(e=>e.wid===wid&&e.date===prev);
  const ne=sched.find(e=>e.wid===wid&&e.date===next);
  if(pe){
    if(type==='dzien'&&(pe.type==='noc'||pe.type==='24h'))return false;
    if(type==='noc'&&pe.type==='24h')return false;
    if(type==='24h'&&pe.type==='24h')return false;
  }
  if(ne){
    if((type==='noc'||type==='24h')&&ne.type==='dzien')return false;
    if(type==='24h'&&ne.type==='24h')return false;
  }
  if(cfg.maxN&&type==='noc'){
    const maxNVal=cfg.maxNVal||3;
    let c=0,ch=prev;
    for(let i=0;i<maxNVal;i++){const e=sched.find(x=>x.wid===wid&&x.date===ch);if(e&&e.type==='noc'){c++;ch=addD(ch,-1);}else break;}
    if(c>=maxNVal)return false;
  }
  if(cfg.maxD&&type==='dzien'){
    const maxDVal=cfg.maxDVal||3;
    let c=0,ch=prev;
    for(let i=0;i<maxDVal;i++){const e=sched.find(x=>x.wid===wid&&x.date===ch);if(e&&e.type==='dzien'){c++;ch=addD(ch,-1);}else break;}
    if(c>=maxDVal)return false;
  }

  // ── KWOTY – twarde limity ──────────────────────────────────────
  // Główny limit: łączne godziny pracownika nie mogą przekroczyć target + tol
  const myTotalH=sched.filter(e=>e.wid===wid).reduce((s,e)=>s+e.hours,0);
  if(myTotalH+shift.hours>q.target+cfg.tol)return false;

  const wd=new Date(date).getDay();const isWday=wd>=1&&wd<=5;

  if(type==='dzien'&&isWday){
    // Twardy limit dniówek weekday wg kwoty
    const myDzien=sched.filter(e=>e.wid===wid&&e.type==='dzien'&&
      (()=>{const w2=new Date(e.date).getDay();return w2>=1&&w2<=5;})()).length;
    if(myDzien>=q.maxDzienWday+cfg.tol/12)return false;
  }

  if(type==='noc'||type==='24h'||(type==='dzien'&&!isWday)){
    // Limit godzin nocek+weekendów
    const myNocWeH=sched.filter(e=>e.wid===wid&&(
      e.type==='noc'||e.type==='24h'||(e.type==='dzien'&&(()=>{const w2=new Date(e.date).getDay();return w2===0||w2===6;})())
    )).reduce((s,e)=>s+e.hours,0);
    if(myNocWeH+shift.hours>q.maxNocWeH+cfg.tol)return false;
  }

  return true;
}

function wScore(w,shift,sched,cfg){
  const wid=w.id;const q=cfg.quotas[wid];
  const myH=sched.filter(e=>e.wid===wid).reduce((s,e)=>s+e.hours,0);
  let score=myH/q.target; // 0..1, niższe = bardziej potrzebuje

  // minDays2: silny priorytet dla dniówek Pn-Pt gdy pracownik nie ma jeszcze 2 w tygodniu
  if(w.minDays2&&shift.type==='dzien'){
    const wd=new Date(shift.date).getDay();
    if(wd>=1&&wd<=5){
      const cnt=weekOfficeCnt(wid,shift.date,sched);
      if(cnt<2)score-=1.5;
    }
  }

  score+=(Math.random()-.5)*0.15;
  return score;
}

function backtrack(shifts,idx,sched,results,limit,cfg){
  if(results.length>=limit)return;
  if(cfg._deadline&&Date.now()>cfg._deadline)return;
  if(idx===shifts.length){results.push([...sched]);return;}
  const shift=shifts[idx];
  const sorted=[...workers].sort((a,b)=>wScore(a,shift,sched,cfg)-wScore(b,shift,sched,cfg));
  for(const w of sorted){
    if(canAssign(w,shift,sched,cfg)){
      sched.push({wid:w.id,date:shift.date,type:shift.type,hours:shift.hours});
      backtrack(shifts,idx+1,sched,results,limit,cfg);
      sched.pop();
      if(results.length>=limit)return;
      if(cfg._deadline&&Date.now()>cfg._deadline)return;
    }
  }
}

// ── RUNNER ────────────────────────────────────────────────────────
function runGen(){
  if(!workers.length){alert('Dodaj co najmniej 1 pracownika!');return;}
  const {y,m}=ym();const mk=y+'-'+m;
  if(_cachedAppSch&&_cachedAppSch[mk])return;
  function _doGen(){
  const btn=document.getElementById('genBtn');
  btn.disabled=true;btn.innerHTML='<span class="spinner"></span>Generowanie...';
  setTimeout(()=>{
    try{
      const {y,m}=ym();
      const tol=+document.getElementById('selT').value;
      const count=+document.getElementById('selC').value;
      const maxNVal=+document.getElementById('maxNVal').value||3;
      const maxDVal=+document.getElementById('maxDVal').value||3;
      const shiftMode=document.getElementById('selShiftMode').value;
      const baseCfg={
        maxN:document.getElementById('chkN').checked,
        maxNVal,
        maxD:document.getElementById('chkD').checked,
        maxDVal,
        count,tol,
      };

      // W trybie 8h nie ma nocek ani weekendów — bez strategii fallback
      const minPerDay=shiftMode==='8h'?(+document.getElementById('minPerDay').value||1):1;
      if(shiftMode==='8h'){
        let cfg1={...baseCfg,quotas:buildQuotas(y,m,shiftMode,minPerDay),_deadline:Date.now()+5000};
        const results1=[];
        backtrack(genShifts(y,m,shiftMode,minPerDay),0,[],results1,count,cfg1);
        schedules=results1;
      } else {
      // Strategia: najpierw próbuj z ustawieniami weekendów takimi jak są (domyślnie 24h).
      // Jeśli udało się znaleźć wystarczająco dużo grafików – gotowe.
      // Jeśli nie (lub za mało) – automatycznie przełącz wszystkie weekendy na split (D+N)
      // i wygeneruj więcej grafików żeby uzupełnić brakującą liczbę.

      const origWeModes={...weModes};

      let cfg1={...baseCfg,quotas:buildQuotas(y,m,shiftMode),_deadline:Date.now()+5000};
      const results1=[];
      backtrack(genShifts(y,m,shiftMode),0,[],results1,count,cfg1);

      let finalResults=results1;
      let fallbackUsed=false;

      if(results1.length<count){
        const splitModes={};
        Object.keys(origWeModes).forEach(k=>splitModes[k]='split');
        const savedModes=weModes;
        weModes=splitModes;

        const need=count-results1.length;
        let cfg2={...baseCfg,count:need+count,quotas:buildQuotas(y,m,shiftMode),_deadline:Date.now()+5000};
        const results2=[];
        backtrack(genShifts(y,m,shiftMode),0,[],results2,cfg2.count,cfg2);

        weModes=savedModes; // przywróć oryginalne

        if(results2.length>0){
          fallbackUsed=true;
          // Połącz: najpierw wyniki z 24h, potem z split
          finalResults=[...results1,...results2].slice(0,count+results2.length);
        }
      }

      schedules=finalResults;
      } // end else (12/24h mode)
      if(!schedules.length){
        document.getElementById('mainInner').innerHTML='<div class="alert">⚠ Nie udało się wygenerować grafiku w wyznaczonym czasie. Zwiększ odchylenie godzin lub zmniejsz ograniczenia.</div>';
      } else {
        renderAll(y,m,false,schedules.length);
        autoSave();
      }
    }catch(e){document.getElementById('mainInner').innerHTML=`<div class="alert">⚠ Błąd: ${e.message}</div>`;}
    btn.disabled=false;btn.innerHTML='⚡ Generuj Grafik';
    // Auto-close sidebar on mobile after generating
    if(window.innerWidth<=900){
      const sb=document.getElementById('sidebar');
      if(sb.classList.contains('open'))togSidebar();
    }
  },30);
  } // end _doGen

  _doGen();
}

// ── HOURS CALC ────────────────────────────────────────────────────
function vacH(w,y,m){
  let h=0;const n=dim(y,m);
  for(let d=1;d<=n;d++)if(w.days[dstr(y,m,d)]==='vac'&&isWD(y,m,d))h+=8;
  return h;
}

// ── RENDER ALL SCHEDULES (stacked) ────────────────────────────────
// firstCount = ile grafików pochodzi z oryginalnych ustawień (reszta = split fallback)
function renderAll(y,m,fallbackUsed=false,firstCount=schedules.length){
  const mi=document.getElementById('mainInner');
  let notice='';
  if(fallbackUsed){
    notice=`<div style="background:var(--yellow-bg);border:1px solid var(--yellow);border-radius:var(--r);padding:10px 14px;font-size:10px;font-family:'Fira Code',monospace;color:var(--yellow);margin-bottom:2px">
      ⚠ Część grafików (${schedules.length-firstCount} szt.) wygenerowana z podziałem weekendów na zmiany 12h zamiast 24h — oryginalne ustawienia dały tylko ${firstCount} wynik(ów).
    </div>`;
  }
  const exportAllBtn=`<div class="expall-wrap"><button class="expall-btn" onclick="exportXL(${y},${m})">⬇ Eksportuj wszystkie do Excel</button></div>`;
  let html=notice+exportAllBtn;
  schedules.forEach((_,i)=>{html+=`<div id="sb${i}"></div>`;});
  mi.innerHTML=html;
  // Store fallback info for renderSched badges
  window._schedMeta={firstCount,fallbackUsed,y,m};
  schedules.forEach((_,i)=>renderSched(i,y,m));
}

function renderSched(idx,y,m){
  const sched=schedules[idx];const n=dim(y,m);
  const hrs={};workers.forEach(w=>hrs[w.id]={d:0,n:0,t24:0,vac:vacH(w,y,m)});
  sched.forEach(e=>{
    if(!hrs[e.wid])hrs[e.wid]={d:0,n:0,t24:0,vac:0};
    if(e.type==='dzien')hrs[e.wid].d+=e.hours||12;
    else if(e.type==='noc')hrs[e.wid].n+=e.hours||12;
    else hrs[e.wid].t24+=e.hours||24;
  });
  const tots=workers.map(w=>{const h=hrs[w.id];return{w,total:h.d+h.n+h.t24+h.vac,...h};});
  const maxH=Math.max(...tots.map(t=>t.total),1);
  const minH=Math.min(...tots.map(t=>t.total));
  const avgH=Math.round(tots.reduce((s,t)=>s+t.total,0)/tots.length);
  const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e.type;});

  const meta=window._schedMeta||{};
  const isSplit=meta.fallbackUsed&&idx>=meta.firstCount;
  const modeBadge=isSplit
    ? `<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">WE: 12h split</span>`
    : `<span style="background:#d6eef8;border:1px solid #1a7fa8;color:#1a7fa8;font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">WE: 24h</span>`;
  const revokedBadge=(()=>{const {y:ry,m:rm}=ym();const rmk=ry+'-'+rm;const ap=_cachedAppSch&&_cachedAppSch[rmk];return ap&&ap.revoked?`<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">COFNIĘTY v${ap.version||1}</span><span style="background:var(--acc-dim);border:1px solid var(--acc);color:var(--acc);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">DO EDYCJI</span>`:'';})();
  const hdr=`<div class="sched-hdr">
    <span class="sched-num">Grafik ${idx+1}</span>
    ${revokedBadge}${modeBadge}
    <span class="sched-meta">${MONTHS[m]} ${y} · śr. ${avgH}h · odch. ${maxH-minH}h · ${sched.length} zmian</span>
    <button class="expbtn" onclick="exportXL(${y},${m},${idx})">⬇ Excel</button>
    ${(()=>{const {y:ry,m:rm}=ym();const rmk=ry+'-'+rm;const aa=_cachedAppSch&&_cachedAppSch[rmk]&&!_cachedAppSch[rmk].revoked;return teamSession&&!aa;})()
      ?`<button class="expbtn" style="border-color:var(--green);color:var(--green)" onclick="approveSchedule(${idx})">✓ Zatwierdź</button>`:''}
  </div>`;

  let bars=`<div class="hvis"><div class="sec" style="margin-bottom:3px">Godziny pracowników</div>`;
  tots.forEach(t=>{
    const pct=(t.total/maxH*100).toFixed(1);
    bars+=`<div class="hrow">
      <div class="hname" style="color:${t.w.color}">${t.w.name}</div>
      <div class="hbarw"><div class="hbar" style="width:${pct}%;background:${t.w.color}"></div></div>
      <div class="hnum">${t.total}h</div>
      <div class="hbk">D:${t.d} N:${t.n} 24:${t.t24}${t.vac?' U:+'+t.vac:''}</div>
    </div>`;
  });
  bars+='</div>';

  let thead=`<thead><tr><th class="wcol">Pracownik</th>`;
  for(let d=1;d<=n;d++){
    const wd=dow(y,m,d);const we=wd===0||wd===6;
    thead+=`<th${we?' class="weh"':''}><div>${d}</div><div style="font-size:6px;opacity:.7">${DNS[wd]}</div></th>`;
  }
  thead+=`<th class="scol">Suma</th></tr></thead>`;

  let tbody='<tbody>';
  workers.forEach(w=>{
    tbody+=`<tr><td class="wn"><span style="color:${w.color};margin-right:4px">●</span>${w.name}</td>`;
    let wt=0;
    for(let d=1;d<=n;d++){
      const date=dstr(y,m,d);const wd=dow(y,m,d);
      const we=wd===0||wd===6;const iswd=wd>=1&&wd<=5;
      const r=w.days[date];const type=lkp[`${w.id}_${date}`];
      let cls=we?'cwe':'';let lbl='';
      if(r==='vac'){
        if(we){cls='cuwe';lbl='U';}else{cls='cuwd';lbl='U';wt+=8;}
      } else if(r==='off'){
        cls='coff';lbl='—';
      } else if(type==='dzien'){
        const sh=sched.find(e=>e.wid===w.id&&e.date===date);
        const dh=sh?sh.hours:12;
        cls='cd';lbl='D';wt+=dh;
      } else if(type==='noc'){cls='cn';lbl='N';wt+=12;}
      else if(type==='24h'){cls='c24';lbl='24h';wt+=24;}
      else{
        cls='cr'+(we?' cwe':'');
        if(r==='no-d')lbl='·N';else if(r==='no-n')lbl='D·';else if(r==='no-both')lbl='✕';
      }
      tbody+=`<td><div class="cell ${cls}" onclick="openCellMenu(event,${idx},${w.id},'${date}')">${lbl}</div></td>`;
    }
    tbody+=`<td class="scol-td"><div class="sv" style="color:${w.color}">${wt}h</div></td></tr>`;
  });
  tbody+='</tbody>';

  const leg=`<div class="legrow">
    <div class="legitem"><div class="legdot" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)">D</div>Dzień</div>
    <div class="legitem"><div class="legdot" style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow)">N</div>Noc</div>
    <div class="legitem"><div class="legdot" style="background:#d6eef8;border:1px solid #1a7fa8;color:#1a7fa8;font-size:7px">24h</div>Weekend</div>
    <div class="legitem"><div class="legdot" style="background:var(--purple-bg);border:1px solid var(--purple);color:var(--purple)">U</div>Urlop Pn-Pt</div>
    <div class="legitem"><div class="legdot" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue)">U</div>Urlop Sb-Nd</div>
    <div class="legitem"><div class="legdot" style="background:var(--gray-bg);border:1px solid var(--gray);color:var(--gray)">—</div>Niedostępny</div>
  </div>`;

  document.getElementById('sb'+idx).innerHTML=`<div class="sched-block">${hdr}${bars}<div class="twrap"><table>${thead}${tbody}</table></div>${leg}</div>`;
}

// ── CELL CONTEXT MENU (manual edit) ──────────────────────────────
const CELL_TYPES=[
  {type:'dzien', lbl:'D — Dniówka 12h',    bg:'var(--green-bg)',  fg:'var(--green)',  h:12},
  {type:'noc',   lbl:'N — Nocka 12h',       bg:'var(--yellow-bg)', fg:'var(--yellow)', h:12},
  {type:'24h',   lbl:'24h — Weekend',        bg:'#d6eef8',          fg:'#1a7fa8',       h:24},
  {type:'vac',   lbl:'U — Urlop',            bg:'var(--purple-bg)', fg:'var(--purple)', h:0},
  {type:'off',   lbl:'— — Niedostępny',      bg:'var(--gray-bg)',   fg:'var(--gray)',   h:0},
  {type:'none',  lbl:'(puste)',               bg:'transparent',      fg:'var(--muted2)', h:0},
];

let _menuCtx=null;
function openCellMenu(evt,schedIdx,wid,date){
  evt.stopPropagation();
  const menu=document.getElementById('cellMenu');
  _menuCtx={schedIdx,wid,date};
  const {y,m}=ym();
  const wd=new Date(date).getDay();const iswd=wd>=1&&wd<=5;
  const w=workers.find(x=>x.id===wid);
  const is8=document.getElementById('selShiftMode').value==='8h';
  const types=is8?CELL_TYPES.filter(ct=>ct.type!=='noc'&&ct.type!=='24h'):CELL_TYPES;
  menu.innerHTML=types.map(ct=>{
    const lbl=is8&&ct.type==='dzien'?'D — Dniówka 8h':ct.lbl;
    return `<button class="cmitem" onclick="applyCellType('${ct.type}')">
      <div class="dot" style="background:${ct.bg};border:1px solid ${ct.fg}"></div>
      ${lbl}
    </button>`;}).join('');
  // position
  const r=evt.target.getBoundingClientRect();
  let left=r.left,top=r.bottom+2;
  if(left+140>window.innerWidth)left=window.innerWidth-144;
  if(top+200>window.innerHeight)top=r.top-2-200;
  menu.style.left=left+'px';menu.style.top=top+'px';menu.style.display='flex';
}
function applyCellType(type){
  if(!_menuCtx)return;
  const {schedIdx,wid,date}=_menuCtx;
  const sched=schedules[schedIdx];
  const {y,m}=ym();
  const w=workers.find(x=>x.id===wid);
  const wd=new Date(date).getDay();const iswd=wd>=1&&wd<=5;

  if(type==='none'||type==='off'||type==='vac'){
    // Remove shift from schedule
    schedules[schedIdx]=sched.filter(e=>!(e.wid===wid&&e.date===date));
    // Set day marker if vac/off
    if(type==='vac')w.days[date]='vac';
    else if(type==='off')w.days[date]='off';
    else if(w.days[date]==='vac'||w.days[date]==='off')delete w.days[date];
  } else {
    // Remove existing entry for this worker+date
    schedules[schedIdx]=sched.filter(e=>!(e.wid===wid&&e.date===date));
    // Also clear any vac/off marker
    if(w.days[date]==='vac'||w.days[date]==='off')delete w.days[date];
    const hrs=type==='24h'?24:12;
    schedules[schedIdx].push({wid,date,type,hours:hrs});
    schedules[schedIdx].sort((a,b)=>a.date.localeCompare(b.date));
  }
  document.getElementById('cellMenu').style.display='none';
  renderSched(schedIdx,y,m);
  autoSave();
}
document.addEventListener('click',()=>{document.getElementById('cellMenu').style.display='none';});

// ── EXCEL EXPORT — HTML-table format (kolory działają w Excel/LibreOffice) ──
function exportXL(y,m,onlyIdx){
  const n=dim(y,m);

  // Styl komórek – font
  const F='font-family:Calibri,Arial,sans-serif;font-size:10px;';
  const FS='font-family:Calibri,Arial,sans-serif;font-size:9px;';
  const B='border:1px solid #808080;';

  // Paleta kolorów
  const C={
    // Nagłówek tytułowy (ciemny oliwkowy/zielony)
    title:    {bg:'#4a5426',fg:'#ffffff'},
    // Nagłówek dni - zwykłe (jasne szare/beżowe)
    hdrDay:   {bg:'#d9d9d9',fg:'#000000'},
    // Nagłówek dni - sobota (czerwone tło)
    hdrSat:   {bg:'#ff0000',fg:'#ffffff'},
    // Nagłówek dni - niedziela (czerwone tło)
    hdrSun:   {bg:'#ff0000',fg:'#ffffff'},
    // Zmiana dzienna D
    dzien:    {bg:'#92d050',fg:'#000000'},  // zielony
    // Zmiana nocna N
    noc:      {bg:'#00b0f0',fg:'#000000'},  // niebieski
    // 24h weekend
    h24:      {bg:'#87CEEB',fg:'#000000'},  // błękitny (sky blue)
    // Urlop Pn-Pt (żółty z "U")
    vacWD:    {bg:'#ffff00',fg:'#000000'},
    // Urlop Sb-Nd (żółty z "U")
    vacWE:    {bg:'#ffff00',fg:'#000000'},
    // Niedostępny / wolne niepłatne (pomarańczowy)
    off:      {bg:'#ffc000',fg:'#000000'},
    // Chorobowe (fioletowy)
    sick:     {bg:'#7030a0',fg:'#ffffff'},
    // Puste komórki
    empty:    {bg:'#ffffff',fg:'#000000'},
    // Puste weekendowe
    emptyWE:  {bg:'#f2f2f2',fg:'#808080'},
    // Suma
    sum:      {bg:'#d9e2f3',fg:'#000000'},
    // Wiersz pracownika - tło normalne
    plain:    {bg:'#ffffff',fg:'#000000'},
    // Wiersz pracownika - tło naprzemienne
    alt:      {bg:'#f2f2f2',fg:'#000000'},
    // Wiersze podsumowań: Dniówki
    sumDzien: {bg:'#e2efda',fg:'#000000'},
    // Wiersze podsumowań: Nocki
    sumNoc:   {bg:'#dce6f1',fg:'#000000'},
    // SUMA kontrolna
    sumCtrl:  {bg:'#fce4d6',fg:'#000000'},
    // SKŁAD
    sumSklad: {bg:'#d9d9d9',fg:'#000000'},
    // Legenda CHOROBOWE
    legSick:  {bg:'#7030a0',fg:'#ffffff'},
    // Legenda WOLNE NIEPŁATNE
    legFree:  {bg:'#ffc000',fg:'#000000'},
    // Legenda URLOP PŁATNY
    legVac:   {bg:'#ffff00',fg:'#000000'},
  };

  function td(lbl,bg,fg,opts={}){
    const bold=opts.bold?'font-weight:700;':'';
    const ta=opts.align||'center';
    const w=opts.width?`width:${opts.width};min-width:${opts.width};max-width:${opts.width};`:'';
    const cs=opts.colspan?` colspan="${opts.colspan}"`:'';
    const rs=opts.rowspan?` rowspan="${opts.rowspan}"`:'';
    const extra=opts.extra||'';
    return `<td${cs}${rs} style="background:${bg};color:${fg};${bold}text-align:${ta};`+
           `${B}padding:1px 2px;white-space:nowrap;${w}${F}${extra}">${lbl}</td>`;
  }

  const toExport=onlyIdx!==undefined?[onlyIdx]:[...Array(schedules.length).keys()];
  let html=`<html xmlns:o="urn:schemas-microsoft-com:office:office" `+
           `xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>`;

  toExport.forEach(si=>{
    html+=`<x:ExcelWorksheet><x:Name>Grafik ${si+1}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`;
  });
  html+=`</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table{border-collapse:collapse;margin-bottom:24px}
  td{mso-number-format:\\@;}
</style></head><body>`;

  toExport.forEach(si=>{
    const sched=schedules[si];
    const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e.type;});
    const totalCols=3+n+1; // Lp + Imię + Nazwisko + days + SUMA

    html+=`<table>`;

    // === ROW 1: Title row — "GRAFIK - MIESIĄC ROK" ===
    html+=`<tr>`;
    html+=td(`GRAFIK ${si+1} — ${MONTHS[m].toUpperCase()} ${y}`,C.title.bg,C.title.fg,{colspan:totalCols,bold:true,align:'center'});
    html+=`</tr>`;

    // === ROW 2: Header row — Lp. | Imię | Nazwisko | 1..31 ===
    html+=`<tr>`;
    html+=td('Lp.',C.hdrDay.bg,C.hdrDay.fg,{bold:true,width:'25px'});
    html+=td('Imię',C.hdrDay.bg,C.hdrDay.fg,{bold:true,align:'left',width:'75px'});
    html+=td('Nazwisko',C.hdrDay.bg,C.hdrDay.fg,{bold:true,align:'left',width:'80px'});
    for(let d=1;d<=n;d++){
      const wd=dow(y,m,d);
      const isSat=wd===6, isSun=wd===0;
      let hBg=C.hdrDay.bg, hFg=C.hdrDay.fg;
      if(isSat||isSun){hBg=C.hdrSat.bg;hFg=C.hdrSat.fg;}
      html+=td(`${d}`,hBg,hFg,{bold:true,width:'26px'});
    }
    html+=td('',C.hdrDay.bg,C.hdrDay.fg,{bold:true,width:'35px'}); // SUMA header empty or "SUM"
    html+=`</tr>`;

    // === Worker rows ===
    workers.forEach((w,wi)=>{
      const rowBg=wi%2===0?C.plain.bg:C.alt.bg;
      // Split name into first/last name
      const parts=w.name.trim().split(/\s+/);
      const firstName=parts[0]||'';
      const lastName=parts.slice(1).join(' ')||'';

      html+=`<tr>`;
      html+=td(wi+1,rowBg,'#000000',{bold:false,width:'25px'});
      html+=td(firstName,rowBg,'#000000',{bold:true,align:'left',width:'75px'});
      html+=td(lastName,rowBg,'#000000',{bold:false,align:'left',width:'80px'});

      let total=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);const wd=dow(y,m,d);
        const iswe=wd===0||wd===6;const iswd=!iswe;
        const r=w.days[date];const type=lkp[`${w.id}_${date}`];
        let lbl='',cBg=iswe?C.emptyWE.bg:C.empty.bg,cFg=iswe?C.emptyWE.fg:C.empty.fg;

        if(r==='vac'){
          if(iswe){lbl='U';cBg=C.vacWE.bg;cFg=C.vacWE.fg;}
          else{lbl='U';cBg=C.vacWD.bg;cFg=C.vacWD.fg;total+=8;}
        } else if(r==='off'){
          lbl='WN';cBg=C.off.bg;cFg=C.off.fg;
        } else if(type==='dzien'){
          lbl='D';cBg=C.dzien.bg;cFg=C.dzien.fg;total+=12;
        } else if(type==='noc'){
          lbl='N';cBg=C.noc.bg;cFg=C.noc.fg;total+=12;
        } else if(type==='24h'){
          lbl='24';cBg=C.h24.bg;cFg=C.h24.fg;total+=24;
        }
        html+=td(lbl,cBg,cFg,{bold:!!lbl,width:'26px'});
      }
      html+=td(total>0?total:'',C.sum.bg,C.sum.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    });

    // === Empty separator row (like row 7 "5" empty in screenshot) ===
    html+=`<tr><td colspan="${totalCols}" style="height:4px;${B}background:#fff"></td></tr>`;

    // === Repeated day number header row (like row 11 in screenshot) ===
    html+=`<tr>`;
    html+=td('','#ffffff','#000000',{width:'25px'});
    html+=td('','#ffffff','#000000',{width:'75px'});
    html+=td('','#ffffff','#000000',{width:'80px'});
    for(let d=1;d<=n;d++){
      const wd=dow(y,m,d);
      const isSat=wd===6, isSun=wd===0;
      let hBg=C.hdrDay.bg, hFg=C.hdrDay.fg;
      if(isSat||isSun){hBg=C.hdrSat.bg;hFg=C.hdrSat.fg;}
      html+=td(`${d}`,hBg,hFg,{bold:true,width:'26px'});
    }
    html+=td('SUM',C.hdrDay.bg,C.hdrDay.fg,{bold:true,width:'35px'});
    html+=`</tr>`;

    // === Empty row ===
    html+=`<tr><td colspan="${totalCols}" style="height:4px;border:none;background:#fff"></td></tr>`;

    // === Summary rows: Dniówki count per day ===
    {
      html+=`<tr>`;
      html+=td('',C.sumDzien.bg,C.sumDzien.fg,{width:'25px'});
      html+=td('Dniówki',C.sumDzien.bg,C.sumDzien.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumD=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=lkp[`${w.id}_${date}`];
          if(type==='dzien')cnt++;
        });
        sumD+=cnt;
        html+=td(cnt||0,C.sumDzien.bg,C.sumDzien.fg,{width:'26px'});
      }
      html+=td(sumD,C.sumDzien.bg,C.sumDzien.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === Summary row: Nocki count per day ===
    {
      html+=`<tr>`;
      html+=td('',C.sumNoc.bg,C.sumNoc.fg,{width:'25px'});
      html+=td('Nocki',C.sumNoc.bg,C.sumNoc.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumN=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=lkp[`${w.id}_${date}`];
          if(type==='noc')cnt++;
        });
        sumN+=cnt;
        html+=td(cnt||0,C.sumNoc.bg,C.sumNoc.fg,{width:'26px'});
      }
      html+=td(sumN,C.sumNoc.bg,C.sumNoc.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === SUMA kontrolna (dzien+noc per day) ===
    {
      html+=`<tr>`;
      html+=td('',C.sumCtrl.bg,C.sumCtrl.fg,{width:'25px'});
      html+=td('SUMA kontrolna',C.sumCtrl.bg,C.sumCtrl.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumT=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=lkp[`${w.id}_${date}`];
          if(type==='dzien'||type==='noc'||type==='24h')cnt++;
        });
        sumT+=cnt;
        html+=td(cnt||0,C.sumCtrl.bg,C.sumCtrl.fg,{width:'26px'});
      }
      html+=td(sumT,C.sumCtrl.bg,C.sumCtrl.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === SKŁAD row — check if each day has proper staffing ===
    {
      html+=`<tr>`;
      html+=td('',C.sumSklad.bg,C.sumSklad.fg,{width:'25px'});
      html+=td('SKŁAD',C.sumSklad.bg,C.sumSklad.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);const wd=dow(y,m,d);
        const iswe=wd===0||wd===6;
        let hasD=false,hasN=false,has24=false;
        workers.forEach(w=>{
          const type=lkp[`${w.id}_${date}`];
          if(type==='dzien')hasD=true;
          if(type==='noc')hasN=true;
          if(type==='24h')has24=true;
        });
        let ok=false;
        if(iswe){ok=has24||(hasD&&hasN);}
        else{ok=hasD&&hasN;}
        const lbl=ok?'OK':'BŁĄD';
        const oBg=ok?'#c6efce':'#ffc7ce';
        const oFg=ok?'#006100':'#9c0006';
        html+=td(lbl,oBg,oFg,{bold:true,width:'26px',extra:'font-size:8px;'});
      }
      html+=td('',C.sumSklad.bg,C.sumSklad.fg,{width:'35px'});
      html+=`</tr>`;
    }

    // === Empty rows ===
    html+=`<tr><td colspan="${totalCols}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // === Title reference row ===
    html+=`<tr>`;
    html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
    html+=td(`GRAFIK ${si+1} — ${MONTHS[m].toUpperCase()} ${y}`,'#ffffff','#000000',{bold:true,align:'left',colspan:2});
    html+=td('','#ffffff','#000000',{colspan:n-1});
    html+=td('','#ffffff','#000000',{});
    html+=`</tr>`;

    // === Empty row ===
    html+=`<tr><td colspan="${totalCols}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // === Legend rows ===
    html+=`<tr>`;
    html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
    html+=td('CHOROBOWE',C.legSick.bg,C.legSick.fg,{bold:true,align:'left',colspan:2});
    html+=`<td colspan="${n-1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
    html+=`</tr>`;

    html+=`<tr>`;
    html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
    html+=td('WOLNE NIEPŁATNE',C.legFree.bg,C.legFree.fg,{bold:true,align:'left',colspan:2});
    html+=`<td colspan="${n-1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
    html+=`</tr>`;

    html+=`<tr>`;
    html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
    html+=td('URLOP PŁATNY',C.legVac.bg,C.legVac.fg,{bold:true,align:'left',colspan:2});
    html+=`<td colspan="${n-1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
    html+=`</tr>`;

    // === Additional info rows (staffing summary) ===
    html+=`<tr><td colspan="${totalCols}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // Per-shift-type staffing info
    const shiftTypes=['r','m','s','k'];
    const shiftLabels={r:'dzień (ranki)',m:'mieszane',s:'stabilne',k:'końcowe'};
    // Calculate day/night coverage
    let dTotal=0,nTotal=0;
    for(let d=1;d<=n;d++){
      const date=dstr(y,m,d);
      workers.forEach(w=>{
        const type=lkp[`${w.id}_${date}`];
        if(type==='dzien')dTotal++;
        if(type==='noc')nTotal++;
      });
    }

    html+=`<tr>`;
    html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
    html+=td('','#ffffff','#000000',{colspan:2});
    html+=td('','#ffffff','#000000',{colspan:2});
    html+=td('d','#d9d9d9','#000000',{bold:true});
    html+=td('n','#d9d9d9','#000000',{bold:true});
    html+=`<td colspan="${n-5}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
    html+=`</tr>`;

    // Workers stats (simplified from screenshot — shows d/n balance per worker)
    workers.forEach((w,wi)=>{
      const wShifts=sched.filter(e=>e.wid===w.id);
      const wD=wShifts.filter(e=>e.type==='dzien').length;
      const wN=wShifts.filter(e=>e.type==='noc').length;
      const parts=w.name.trim().split(/\s+/);
      const initial=(parts[0]||'')[0]||'';
      html+=`<tr>`;
      html+=td('',C.plain.bg,C.plain.fg,{width:'25px'});
      html+=td('','#ffffff','#000000',{colspan:2});
      html+=td('','#ffffff','#000000',{colspan:2});
      html+=td(wD,'#ffffff','#000000',{});
      html+=td(wN,'#ffffff','#000000',{});
      html+=`<td colspan="${n-5}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
      html+=`</tr>`;
    });

    html+=`</table>`;
  });

  html+='</body></html>';

  // Trigger download as .xls
  const blob=new Blob([html],{type:'application/vnd.ms-excel;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`grafik_${MONTHS[m].toLowerCase()}_${y}.xls`;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);URL.revokeObjectURL(url);
  toast('✓ Pobrano Excel (.xls z kolorami)');
}

// ══════════════════════════════════════════════════════════════════
// ██ FIREBASE BACKEND ██
// ══════════════════════════════════════════════════════════════════

// ── FIREBASE CONFIG ──────────────────────────────────────────────
// INSTRUKCJA:
// 1. Wejdź na https://console.firebase.google.com
// 2. Utwórz nowy projekt (wyłącz Google Analytics)
// 3. W panelu projektu → „Kompilacja" → „Firestore Database" → „Utwórz bazę danych" → tryb testowy
// 4. W panelu projektu → ⚙ → „Ustawienia projektu" → „Twoje aplikacje" → ikona </> (Web)
// 5. Zarejestruj aplikację i skopiuj wartości poniżej:
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyARwVG94FoE4QEMUV3PAj3-1mYsB_0_a1E",
  authDomain: "shiftmaster-f085b.firebaseapp.com",
  projectId: "shiftmaster-f085b",
  storageBucket: "shiftmaster-f085b.firebasestorage.app",
  messagingSenderId: "603019176306",
  appId: "1:603019176306:web:16dfd03258799497f9d5eb"
};

// ── FIREBASE STATE ───────────────────────────────────────────────
let db=null, teamSession=null, unsubscribe=null, _skipSnap=false;
let _approvedViewActive=null, _cachedAppSch=null, _cachedHistory=null;
let _cachedPendSch=null, _cachedSchedMeta=null;

function initFirebase(){
  if(FIREBASE_CONFIG.apiKey.startsWith('TWOJ')){return false;}
  try{firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore();return true;}
  catch(e){console.error('Firebase init:',e);return false;}
}

// ── HASH ─────────────────────────────────────────────────────────
async function hashPw(pw){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function genTeamId(){
  const c='abcdefghijklmnopqrstuvwxyz0123456789';
  let id='';for(let i=0;i<8;i++)id+=c[Math.floor(Math.random()*c.length)];return id;
}

// ── LOGIN UI ─────────────────────────────────────────────────────
function showLoginTab(tab){
  document.getElementById('loginJoin').style.display=tab==='join'?'':'none';
  document.getElementById('loginCreate').style.display=tab==='create'?'':'none';
  document.querySelectorAll('.login-tab').forEach((b,i)=>{
    b.classList.toggle('active',(tab==='join'&&i===0)||(tab==='create'&&i===1));
  });
}

async function doCreateTeam(){
  const name=document.getElementById('createTeamName').value.trim();
  const pw=document.getElementById('createPassword').value;
  const member=document.getElementById('createName').value.trim();
  const err=document.getElementById('createErr');
  if(!name){err.textContent='Podaj nazwę zespołu';return;}
  if(pw.length<4){err.textContent='Hasło min. 4 znaki';return;}
  if(!member){err.textContent='Podaj swoje imię';return;}
  err.textContent='Tworzenie...';
  try{
    const tid=genTeamId(), pwh=await hashPw(pw);
    const now=new Date();
    const nextM=new Date(now.getFullYear(),now.getMonth()+1,1);
    await db.collection('teams').doc(tid).set({
      name,passwordHash:pwh,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      workers:[],weModes:{},wCtr:0,
      settings:{month:nextM.getMonth()+1,year:nextM.getFullYear()},
      genSettings:{shiftMode:'12h',maxN:true,maxNVal:3,maxD:true,maxDVal:3,tol:24,minPerDay:1,count:1},
      approvedSchedules:{}
    });
    teamSession={teamId:tid,memberName:member,passwordHash:pwh};
    localStorage.setItem('sm_session',JSON.stringify(teamSession));
    window.location.hash='team='+tid;
    showApp();
    toast('✓ Zespół utworzony! Udostępnij link.');
    if(!localStorage.getItem('sm_tut_done'))showTutorial();
  }catch(e){err.textContent='Błąd: '+e.message;}
}

async function doJoinTeam(){
  let tid=document.getElementById('joinTeamId').value.trim().toLowerCase();
  const pw=document.getElementById('joinPassword').value;
  const member=document.getElementById('joinName').value.trim();
  const err=document.getElementById('joinErr');
  if(tid.includes('#team='))tid=tid.split('#team=').pop();
  if(tid.includes('team='))tid=tid.split('team=').pop();
  if(!tid){err.textContent='Podaj ID zespołu';return;}
  if(!pw){err.textContent='Podaj hasło';return;}
  if(!member){err.textContent='Podaj swoje imię';return;}
  err.textContent='Łączenie...';
  try{
    const doc=await db.collection('teams').doc(tid).get();
    if(!doc.exists){err.textContent='Zespół nie istnieje';return;}
    const pwh=await hashPw(pw);
    if(doc.data().passwordHash!==pwh){err.textContent='Błędne hasło';return;}
    teamSession={teamId:tid,memberName:member,passwordHash:pwh};
    localStorage.setItem('sm_session',JSON.stringify(teamSession));
    window.location.hash='team='+tid;
    showApp();
    if(!localStorage.getItem('sm_tut_done'))showTutorial();
  }catch(e){err.textContent='Błąd: '+e.message;}
}

function doLogout(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  teamSession=null;
  localStorage.removeItem('sm_session');
  window.location.hash='';
  workers=[];schedules=[];weModes={};wCtr=0;
  document.getElementById('loginOverlay').style.display='';
  document.getElementById('teamBar').style.display='none';
  document.getElementById('approvedBanner').innerHTML='';
  document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Zaloguj się do zespołu aby rozpocząć.</p></div>';
  document.getElementById('wlist').innerHTML='';
}

function copyTeamLink(){
  if(!teamSession)return;
  const link=window.location.origin+window.location.pathname+'#team='+teamSession.teamId;
  navigator.clipboard.writeText(link).then(()=>toast('✓ Link skopiowany!')).catch(()=>prompt('Skopiuj link:',link));
}

function startLocalMode(){
  document.getElementById('loginOverlay').style.display='none';
  // Pokaż pasek trybu lokalnego tylko gdy Firebase jest dostępny (jest do czego wracać)
  if(db)document.getElementById('localBar').style.display='';
  ['Anna','Bartosz','Celina','Dawid'].forEach(n=>addW(n));
  buildWeModes();renderWEGrid();
  if(!localStorage.getItem('sm_tut_done'))showTutorial();
}

function returnToLogin(){
  workers=[];schedules=[];weModes={};wCtr=0;
  document.getElementById('localBar').style.display='none';
  document.getElementById('approvedBanner').innerHTML='';
  document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  document.getElementById('wlist').innerHTML='';
  document.getElementById('loginOverlay').style.display='';
  buildWeModes();renderWEGrid();
}

// ── APP SHOW ─────────────────────────────────────────────────────
function showApp(){
  document.getElementById('loginOverlay').style.display='none';
  const tb=document.getElementById('teamBar');tb.style.display='';
  document.getElementById('teamNameDisp').textContent='';
  document.getElementById('teamMemberDisp').textContent='👤 '+teamSession.memberName;
  const asVal=localStorage.getItem('sm_autosave');
  if(asVal==='0'){const cb=document.getElementById('chkAutoSave');if(cb)cb.checked=false;}
  loadTeamData();
  startRealtimeSync();
}

// ── FIRESTORE SYNC ───────────────────────────────────────────────
async function loadTeamData(){
  if(!teamSession||!db)return;
  const ss=document.getElementById('syncStatus');
  ss.textContent='⟳ Ładowanie...';
  try{
    const doc=await db.collection('teams').doc(teamSession.teamId).get();
    if(!doc.exists){ss.textContent='✗ Brak danych';return;}
    const d=doc.data();
    document.getElementById('teamNameDisp').textContent='🏢 '+(d.name||teamSession.teamId);
    applyTeamData(d);
    ss.textContent='✓ Zsynchronizowano';
    setTimeout(()=>{if(ss.textContent==='✓ Zsynchronizowano')ss.textContent='';},2000);
  }catch(e){ss.textContent='✗ Błąd';console.error(e);}
}

function applyTeamData(d){
  _cachedAppSch=d.approvedSchedules||null;
  _cachedPendSch=d.pendingSchedules||null;
  _cachedSchedMeta=d.schedMeta||null;
  _cachedHistory=d.scheduleHistory||null;
  if(d.workers){
    workers=d.workers.map(w=>({...w,_open:false,days:w.days||{}}));
    workers.forEach(w=>{cmode[w.id]=cmode[w.id]||'vac';});
  }
  wCtr=d.wCtr||workers.length;
  if(d.weModes)weModes=d.weModes;
  if(d.genSettings){
    const g=d.genSettings;
    const sm=document.getElementById('selShiftMode');if(sm)sm.value=g.shiftMode||'12h';
    const chkN=document.getElementById('chkN');if(chkN)chkN.checked=g.maxN!==false;
    const mnv=document.getElementById('maxNVal');if(mnv)mnv.value=g.maxNVal||3;
    const chkD=document.getElementById('chkD');if(chkD)chkD.checked=g.maxD!==false;
    const mdv=document.getElementById('maxDVal');if(mdv)mdv.value=g.maxDVal||3;
    const selT=document.getElementById('selT');if(selT)selT.value=g.tol!=null?g.tol:24;
    const mpd=document.getElementById('minPerDay');if(mpd)mpd.value=g.minPerDay||1;
    const selC=document.getElementById('selC');if(selC)selC.value=g.count||1;
    const mpdw=document.getElementById('minPerDayWrap');if(mpdw)mpdw.style.display=(g.shiftMode==='8h')?'':'none';
  }
  const {y:cy,m:cm}=ym();const cmk=cy+'-'+cm;
  const curApproved=d.approvedSchedules&&d.approvedSchedules[cmk]&&!d.approvedSchedules[cmk].revoked;
  if(curApproved){
    schedules=[];window._schedMeta=null;
    buildWeModes();renderWorkers();renderWEGrid();
    document.getElementById('mainInner').innerHTML='';
  } else {
    const ps=d.pendingSchedules&&d.pendingSchedules[cmk];
    if(ps&&ps.length){
      schedules=ps.map(s=>s.shifts||s);
      window._schedMeta=(d.schedMeta&&d.schedMeta[cmk])||null;
    }
    buildWeModes();renderWorkers();renderWEGrid();
    if(ps&&ps.length&&window._schedMeta){
      const {y,m,fallbackUsed,firstCount}=window._schedMeta;
      renderAll(y,m,fallbackUsed||false,firstCount||schedules.length);
    } else if(ps&&ps.length){
      renderAll(cy,cm,false,schedules.length);
    }
  }
  renderApprovedBanner(d.approvedSchedules);
}

async function saveToFirestore(){
  if(!teamSession||!db)return;
  const ss=document.getElementById('syncStatus');
  ss.textContent='⟳ Zapis...';
  _skipSnap=true;
  try{
    const {y,m}=ym();const mk=y+'-'+m;
    const upd={
      workers:workers.map(w=>({id:w.id,name:w.name,color:w.color,days:w.days||{},minDays2:!!w.minDays2})),
      wCtr,weModes,settings:{month:m,year:y},
      genSettings:{
        shiftMode:document.getElementById('selShiftMode').value,
        maxN:document.getElementById('chkN').checked,
        maxNVal:+document.getElementById('maxNVal').value||3,
        maxD:document.getElementById('chkD').checked,
        maxDVal:+document.getElementById('maxDVal').value||3,
        tol:+document.getElementById('selT').value,
        minPerDay:+document.getElementById('minPerDay').value||1,
        count:+document.getElementById('selC').value
      }
    };
    if(schedules.length&&!_approvedViewActive){
      upd['pendingSchedules.'+mk]=schedules.map(s=>({shifts:s}));
      upd['schedMeta.'+mk]=window._schedMeta||null;
    }
    await db.collection('teams').doc(teamSession.teamId).update(upd);
    if(schedules.length&&!_approvedViewActive){
      if(!_cachedPendSch)_cachedPendSch={};
      _cachedPendSch[mk]=schedules.map(s=>({shifts:s}));
      if(!_cachedSchedMeta)_cachedSchedMeta={};
      _cachedSchedMeta[mk]=window._schedMeta||null;
    }
    ss.textContent='✓ Zapisano';
    setTimeout(()=>{if(ss.textContent==='✓ Zapisano')ss.textContent='';},2000);
  }catch(e){ss.textContent='✗ Błąd zapisu';console.error(e);_skipSnap=false;}
}

let _saveT=null;
function autoSave(){
  if(!teamSession)return;
  const autoOn=document.getElementById('chkAutoSave');
  if(autoOn&&!autoOn.checked)return;
  clearTimeout(_saveT);
  _saveT=setTimeout(()=>saveToFirestore(),1500);
}

// ── REALTIME SYNC ────────────────────────────────────────────────
function startRealtimeSync(){
  if(!teamSession||!db)return;
  if(unsubscribe)unsubscribe();
  unsubscribe=db.collection('teams').doc(teamSession.teamId).onSnapshot(doc=>{
    if(!doc.exists)return;
    if(_skipSnap){_skipSnap=false;return;}
    const d=doc.data();
    document.getElementById('teamNameDisp').textContent='🏢 '+(d.name||teamSession.teamId);
    applyTeamData(d);
    const ss=document.getElementById('syncStatus');
    ss.textContent='⟳ Aktualizacja';
    setTimeout(()=>{if(ss.textContent==='⟳ Aktualizacja')ss.textContent='';},1500);
  },e=>console.error('Sync error:',e));
}

// ── SCHEDULE APPROVAL ────────────────────────────────────────────
async function approveSchedule(idx){
  if(!teamSession||!db)return;
  const {y,m}=ym();const mk=y+'-'+m;
  try{
    const chk=await db.collection('teams').doc(teamSession.teamId).get();
    if(chk.exists){
      const ap=(chk.data().approvedSchedules||{})[mk];
      if(ap&&!ap.revoked&&ap.approvedBy!==teamSession.memberName){
        alert(`⚠ Grafik ${MONTHS[m]} ${y} jest już zatwierdzony przez ${ap.approvedBy}.\nTylko ta osoba może cofnąć lub zastąpić zatwierdzenie.`);
        return;
      }
    }
  }catch(e){console.error(e);}
  if(!confirm('Zatwierdź ten grafik? Będzie widoczny dla całego zespołu.'))return;
  const sched=schedules[idx];
  const ss=document.getElementById('syncStatus');
  ss.textContent='⟳ Zatwierdzanie...';
  try{
    const doc=await db.collection('teams').doc(teamSession.teamId).get();
    const data=doc.data();
    const prevAp=(data.approvedSchedules||{})[mk];
    const history=(data.scheduleHistory&&data.scheduleHistory[mk])||[];
    // Jeśli istnieje poprzednia wersja, przenieś ją do historii
    if(prevAp){history.push({...prevAp});}
    const ver=history.length+1;
    const upd={};
    upd['approvedSchedules.'+mk]={
      data:sched,version:ver,
      approvedBy:teamSession.memberName,
      approvedAt:new Date().toISOString(),
      workers:workers.map(w=>({id:w.id,name:w.name,color:w.color,days:w.days||{},minDays2:!!w.minDays2})),
      weModes:{...weModes},month:m,year:y
    };
    upd['scheduleHistory.'+mk]=history;
    upd['pendingSchedules.'+mk]=null;upd['schedMeta.'+mk]=null;
    await db.collection('teams').doc(teamSession.teamId).update(upd);
    toast(`✓ Grafik zatwierdzony (v${ver})!`);
    ss.textContent='✓ Zatwierdzono';
    schedules=[];
    document.getElementById('mainInner').innerHTML='<div class="empty" style="opacity:.75"><div class="empty-icon">✅</div><h2>Grafik zatwierdzony</h2><p>Kliknij „Pokaż" w banerze powyżej aby wyświetlić lub edytować zatwierdzony grafik.</p></div>';
    loadTeamData();
  }catch(e){ss.textContent='✗ Błąd';console.error(e);}
}

async function removeApproval(mk){
  if(!teamSession||!db)return;
  if(!confirm('Cofnąć zatwierdzenie? Dane grafiku zostaną zachowane (nie zostaną usunięte).'))return;
  try{
    const doc=await db.collection('teams').doc(teamSession.teamId).get();
    const ap=doc.exists&&doc.data().approvedSchedules?.[mk];
    const ver=ap&&ap.version||1;
    const upd={};
    upd['approvedSchedules.'+mk+'.revoked']=true;
    upd['approvedSchedules.'+mk+'.revokedBy']=teamSession.memberName;
    upd['approvedSchedules.'+mk+'.revokedAt']=new Date().toISOString();
    if(ap&&ap.data){
      upd['pendingSchedules.'+mk]=[{shifts:ap.data}];
    }
    await db.collection('teams').doc(teamSession.teamId).update(upd);
    _hideApprovedSchedule();
    toast(`✓ Zatwierdzenie v${ver} cofnięte (grafik przywrócony)`);loadTeamData();
  }catch(e){console.error(e);}
}

function updateGenBtn(){
  const btn=document.getElementById('genBtn');
  if(!btn)return;
  const {y,m}=ym();const mk=y+'-'+m;
  const wasApproved=_cachedAppSch&&_cachedAppSch[mk];
  btn.disabled=!!wasApproved;
  btn.title=wasApproved
    ?wasApproved.revoked
      ?`Grafik ${MONTHS[m]} ${y} był już zatwierdzony — generowanie nowego grafiku jest zablokowane.`
      :`Grafik ${MONTHS[m]} ${y} jest zatwierdzony — generowanie nowego grafiku jest zablokowane.`
    :'';
}

function renderApprovedBanner(appSch){
  updateGenBtn();
  const c=document.getElementById('approvedBanner');
  if(!c)return;
  if(!appSch||!Object.keys(appSch).length){c.innerHTML='';return;}
  const {y,m}=ym();
  const mk=y+'-'+m;
  const ap=appSch[mk];
  if(!ap){c.innerHTML='';return;}

  const ver=ap.version||1;
  const isShowing=_approvedViewActive===mk;
  const history=(_cachedHistory&&_cachedHistory[mk])||[];

  let html='<div style="padding:10px 20px 0">';

  if(ap.revoked){
    html+=`<div class="ap-banner" style="opacity:.65;background:var(--surface2);border-color:var(--border2)">
      <div class="ab-icon">🔓</div>
      <div class="ab-text">
        <div class="ab-title" style="color:var(--muted)">Cofnięty v${ver} — ${MONTHS[m]} ${y}</div>
        <div class="ab-meta">Cofnął: ${ap.revokedBy||ap.approvedBy} · Zatwierdził: ${ap.approvedBy}</div>
      </div>
      <button class="ab-btn" onclick="showApprovedSchedule('${mk}','current')">${isShowing?'👁 Ukryj':'👁 Pokaż (arch.)'}</button>
    </div>`;
  } else {
    const dt=new Date(ap.approvedAt);
    const isApprover=teamSession&&teamSession.memberName===ap.approvedBy;
    html+=`<div class="ap-banner">
      <div class="ab-icon">✅</div>
      <div class="ab-text">
        <div class="ab-title">Zatwierdzony v${ver} — ${MONTHS[m]} ${y}</div>
        <div class="ab-meta">Zatwierdził: ${ap.approvedBy} · ${dt.toLocaleDateString('pl-PL')} ${dt.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>
      <button class="ab-btn" onclick="showApprovedSchedule('${mk}','current')">${isShowing?'👁 Ukryj':'👁 Pokaż'}</button>
      <button class="ab-btn" onclick="exportApprovedXL('${mk}')">⬇ Excel</button>
      ${isApprover?`<button class="ab-btn" onclick="removeApproval('${mk}')" style="color:var(--red)">✕ Cofnij</button>`:''}
    </div>`;
  }

  // Starsze wersje z historii
  history.slice().reverse().forEach((h,i)=>{
    const hVer=h.version||history.length-i;
    const hIdx=history.length-1-i;
    const hKey=mk+'_h'+hIdx;
    const hShowing=_approvedViewActive===hKey;
    const hDt=new Date(h.approvedAt);
    const wasRevoked=!!h.revoked;
    html+=`<div class="ap-banner" style="opacity:.45;background:var(--surface2);border-color:var(--border);margin-top:4px;font-size:11px">
      <div class="ab-icon" style="font-size:14px">${wasRevoked?'🔓':'📋'}</div>
      <div class="ab-text">
        <div class="ab-title" style="color:var(--muted);font-size:11px">v${hVer} — ${MONTHS[h.month||m]} ${h.year||y}${wasRevoked?' (cofnięty)':''}</div>
        <div class="ab-meta">Zatwierdził: ${h.approvedBy} · ${hDt.toLocaleDateString('pl-PL')}</div>
      </div>
      <button class="ab-btn" style="font-size:10px" onclick="showApprovedSchedule('${mk}','h${hIdx}')">${hShowing?'👁 Ukryj':'👁 Pokaż'}</button>
    </div>`;
  });

  html+='</div>';
  c.innerHTML=html;
}

function showApprovedSchedule(mk,which){
  if(!teamSession||!db)return;
  which=which||'current';
  const viewKey=which==='current'?mk:mk+'_'+which;
  // Toggle: if already showing, hide it
  if(_approvedViewActive===viewKey){_hideApprovedSchedule();return;}
  db.collection('teams').doc(teamSession.teamId).get().then(doc=>{
    if(!doc.exists)return;
    let ap;
    if(which==='current'){
      ap=doc.data().approvedSchedules?.[mk];
    } else {
      const hIdx=parseInt(which.replace('h',''));
      const hist=(doc.data().scheduleHistory&&doc.data().scheduleHistory[mk])||[];
      ap=hist[hIdx];
    }
    if(!ap)return;
    _approvedViewActive=viewKey;
    // Render standalone read-only view into archivedInner (no global state changes)
    const aWorkers=ap.workers.map(w=>({...w,days:w.days||{}}));
    const sched=ap.data;
    const ay=ap.year,am=ap.month,n=dim(ay,am);
    const isRevoked=!!ap.revoked;
    const apVer=ap.version||1;
    const isOld=which!=='current';
    const statusBadge=isOld
      ?`<span style="background:var(--surface3);border:1px solid var(--border2);color:var(--muted);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">ARCHIWUM v${apVer}</span>`
      :isRevoked
      ?`<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">COFNIĘTY v${apVer}</span>`
      :`<span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">ZATWIERDZONY v${apVer}</span>`;

    const hrs={};aWorkers.forEach(w=>hrs[w.id]={d:0,n:0,t24:0,vac:0});
    // Calc vacation hours
    aWorkers.forEach(w=>{for(let d=1;d<=n;d++)if(w.days[dstr(ay,am,d)]==='vac'&&isWD(ay,am,d))hrs[w.id].vac+=8;});
    sched.forEach(e=>{
      if(!hrs[e.wid])hrs[e.wid]={d:0,n:0,t24:0,vac:0};
      if(e.type==='dzien')hrs[e.wid].d+=e.hours||12;
      else if(e.type==='noc')hrs[e.wid].n+=e.hours||12;
      else hrs[e.wid].t24+=e.hours||24;
    });
    const tots=aWorkers.map(w=>{const h=hrs[w.id];return{w,total:h.d+h.n+h.t24+h.vac,...h};});
    const maxH=Math.max(...tots.map(t=>t.total),1);
    const avgH=Math.round(tots.reduce((s,t)=>s+t.total,0)/tots.length);
    const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e.type;});

    const hdr=`<div class="sched-hdr">${statusBadge}<span class="sched-meta">${MONTHS[am]} ${ay} · śr. ${avgH}h · ${sched.length} zmian · Zatwierdził: ${ap.approvedBy}</span></div>`;

    let bars=`<div class="hvis"><div class="sec" style="margin-bottom:3px">Godziny pracowników</div>`;
    tots.forEach(t=>{
      const pct=(t.total/maxH*100).toFixed(1);
      bars+=`<div class="hrow"><div class="hname" style="color:${t.w.color}">${t.w.name}</div><div class="hbarw"><div class="hbar" style="width:${pct}%;background:${t.w.color}"></div></div><div class="hnum">${t.total}h</div><div class="hbk">D:${t.d} N:${t.n} 24:${t.t24}${t.vac?' U:+'+t.vac:''}</div></div>`;
    });
    bars+='</div>';

    let thead=`<thead><tr><th class="wcol">Pracownik</th>`;
    for(let d=1;d<=n;d++){const wd=dow(ay,am,d);thead+=`<th${wd===0||wd===6?' class="weh"':''}><div>${d}</div><div style="font-size:6px;opacity:.7">${DNS[wd]}</div></th>`;}
    thead+=`<th class="scol">Suma</th></tr></thead>`;

    let tbody='<tbody>';
    aWorkers.forEach(w=>{
      tbody+=`<tr><td class="wn"><span style="color:${w.color};margin-right:4px">●</span>${w.name}</td>`;
      let wt=0;
      for(let d=1;d<=n;d++){
        const date=dstr(ay,am,d);const wd=dow(ay,am,d);const we=wd===0||wd===6;
        const r=w.days[date];const type=lkp[`${w.id}_${date}`];
        let cls=we?'cwe':'';let lbl='';
        if(r==='vac'){if(we){cls='cuwe';lbl='U';}else{cls='cuwd';lbl='U';wt+=8;}}
        else if(r==='off'){cls='coff';lbl='—';}
        else if(type==='dzien'){const sh=sched.find(e=>e.wid===w.id&&e.date===date);const dh=sh?sh.hours:12;cls='cd';lbl='D';wt+=dh;}
        else if(type==='noc'){cls='cn';lbl='N';wt+=12;}
        else if(type==='24h'){cls='c24';lbl='24h';wt+=24;}
        else{cls='cr'+(we?' cwe':'');}
        tbody+=`<td><div class="cell ${cls}">${lbl}</div></td>`;
      }
      tbody+=`<td class="scol-td"><div class="sv" style="color:${w.color}">${wt}h</div></td></tr>`;
    });
    tbody+='</tbody>';

    let ai=document.getElementById('archivedInner');
    if(!ai){
      ai=document.createElement('div');ai.id='archivedInner';ai.className='main-inner';
      const mi=document.getElementById('mainInner');
      mi.parentNode.insertBefore(ai,mi);
    }
    const borderClr=isOld?'var(--border2)':isRevoked?'var(--yellow)':'var(--green)';
    ai.innerHTML=`<div class="sched-block" style="border-color:${borderClr}${isOld?';opacity:.7':''}">${hdr}${bars}<div class="twrap"><table>${thead}${tbody}</table></div></div>`;
    ai.style.display='';
    document.getElementById('mainInner').style.display='none';
    renderApprovedBanner(_cachedAppSch);
  });
}

function _hideApprovedSchedule(){
  _approvedViewActive=null;
  const ai=document.getElementById('archivedInner');
  if(ai){ai.innerHTML='';ai.style.display='none';}
  document.getElementById('mainInner').style.display='';
  renderApprovedBanner(_cachedAppSch);
}

function exportApprovedXL(mk){
  if(!teamSession||!db)return;
  db.collection('teams').doc(teamSession.teamId).get().then(doc=>{
    if(!doc.exists)return;
    const ap=doc.data().approvedSchedules?.[mk];
    if(!ap)return;
    const _w=workers,_s=schedules,_we=weModes,_wc=wCtr;
    workers=ap.workers.map(w=>({...w,_open:false,days:w.days||{}}));
    weModes=ap.weModes||{};wCtr=Math.max(...workers.map(w=>w.id),0)+1;
    schedules=[ap.data];
    exportXL(ap.year,ap.month,0);
    workers=_w;weModes=_we;schedules=_s;wCtr=_wc;
  });
}

// ══════════════════════════════════════════════════════════════════
// ██ TUTORIAL ██
// ══════════════════════════════════════════════════════════════════

const TUT_STEPS=[
  {icon:'👋',title:'Witaj w ShiftMaster!',
   desc:'ShiftMaster to generator grafików zmianowych dla zespołów. Każdy członek zespołu może wpisywać swoje preferencje, a lider zatwierdza gotowy grafik.\n\nTen tutorial przeprowadzi Cię przez wszystkie funkcje.'},
  {icon:'👥',title:'1. Utwórz lub dołącz do zespołu',
   desc:'<b>Lider zespołu</b> tworzy zespół podając nazwę i hasło, a następnie udostępnia wygenerowany link współpracownikom.\n\n<b>Członek zespołu</b> otwiera link, wpisuje hasło i swoje imię. Wszystkie zmiany synchronizują się w czasie rzeczywistym.\n\nMożesz też pracować <b>lokalnie</b> bez zespołu.'},
  {icon:'➕',title:'2. Dodaj pracowników',
   desc:'W panelu bocznym „Pracownicy" kliknij <b>+ Dodaj pracownika</b>.\n\nDla każdego pracownika możesz:\n• Zmienić imię (kliknij w pole nazwy)\n• Włączyć opcję <b>„Min. 2 dni w biurze"</b> — algorytm przydzieli co najmniej 2 dniówki Pn-Pt tygodniowo\n• Usunąć pracownika przyciskiem ×'},
  {icon:'📅',title:'3. Ustaw dostępność',
   desc:'Rozwiń kartę pracownika strzałką ▾. Zobaczysz mini-kalendarz.\n\nWybierz tryb oznaczania:\n• <b style="color:var(--purple)">🏖 Urlop</b> — Pn-Pt liczy +8h, weekend 0h\n• <b style="color:var(--gray)">🚫 Niedostępny</b> — brak zmian tego dnia\n• <b style="color:var(--yellow)">☽ Tylko noc</b> — blokada dniówki\n• <b style="color:var(--orange)">☀ Tylko dzień</b> — blokada nocki\n• <b>✕ Wyczyść</b> — usuwa oznaczenie\n\nKliknij dni w kalendarzu aby je oznaczyć.'},
  {icon:'📆',title:'4. Skonfiguruj weekendy',
   desc:'Przejdź do zakładki <b>📅 Weekendy</b> w panelu bocznym.\n\nDla każdego weekendu wybierz tryb:\n• <b style="color:#1a7fa8">24h</b> — jedna zmiana całodobowa\n• <b style="color:var(--green)">D+N</b> — dwie zmiany po 12h (dzień + noc)\n• <b>Wolny</b> — brak zmian w ten weekend'},
  {icon:'⚡',title:'5. Generuj grafik',
   desc:'Kliknij przycisk <b>„⚡ Generuj Grafik"</b> na dole panelu.\n\nW zakładce <b>⚙ Opcje</b> możesz ustawić:\n• Max 3 nocki/dniówki z rzędu\n• Liczbę wariantów grafiku (1-10)\n• Tolerancję odchylenia godzin\n\nAlgorytm wygeneruje optymalne grafiki z wyrównanymi godzinami.'},
  {icon:'✏️',title:'6. Edytuj ręcznie',
   desc:'Po wygenerowaniu kliknij <b>dowolną komórkę</b> w tabeli grafiku aby zmienić typ zmiany:\n• D — Dniówka 12h\n• N — Nocka 12h\n• 24h — Weekend całodobowy\n• U — Urlop\n• — — Niedostępny\n• (puste) — brak przypisania'},
  {icon:'✅',title:'7. Zatwierdź grafik',
   desc:'Gdy grafik jest gotowy, kliknij przycisk <b>„✓ Zatwierdź"</b> przy wybranym wariancie.\n\nZatwierdzony grafik:\n• Wyświetla się jako <b style="color:var(--green)">zielony baner</b> na górze strony\n• Jest widoczny dla <b>całego zespołu</b>\n• Można go pobrać jako Excel\n• Można cofnąć zatwierdzenie w razie potrzeby'},
  {icon:'📊',title:'8. Eksportuj do Excel',
   desc:'Kliknij <b>„⬇ Excel"</b> przy dowolnym grafiku lub <b>„⬇ Eksportuj wszystkie"</b> na górze.\n\nPlik .xls otwiera się w Excel/LibreOffice z kolorami komórek, podsumowaniami i kontrolą obsady.\n\n<b style="color:var(--acc)">Gotowe! Powodzenia z grafikami! 🎉</b>'}
];
let _tutStep=0;

function showTutorial(){
  _tutStep=0;
  renderTutStep();
  document.getElementById('tutOverlay').style.display='';
}

function closeTutorial(){
  document.getElementById('tutOverlay').style.display='none';
  localStorage.setItem('sm_tut_done','1');
}

function tutNext(){if(_tutStep<TUT_STEPS.length-1){_tutStep++;renderTutStep();}}
function tutPrev(){if(_tutStep>0){_tutStep--;renderTutStep();}}

function renderTutStep(){
  const s=TUT_STEPS[_tutStep];
  const isLast=_tutStep===TUT_STEPS.length-1;
  const isFirst=_tutStep===0;
  const dots=TUT_STEPS.map((_,i)=>`<div class="tut-dot${i===_tutStep?' active':''}"></div>`).join('');
  document.getElementById('tutOverlay').innerHTML=`<div class="tut-box">
    <button class="tut-close" onclick="closeTutorial()">✕</button>
    <div class="tut-step">
      <div class="tut-icon">${s.icon}</div>
      <div class="tut-title">${s.title}</div>
      <div class="tut-desc">${s.desc}</div>
      <div class="tut-dots">${dots}</div>
      <div class="tut-btns">
        ${isFirst?'':`<button class="tut-btn" onclick="tutPrev()">← Wstecz</button>`}
        ${isLast
          ?`<button class="tut-btn primary" onclick="closeTutorial()">Rozpocznij!</button>`
          :`<button class="tut-btn primary" onclick="tutNext()">Dalej →</button>`}
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
// ██ INIT ██
// ══════════════════════════════════════════════════════════════════

async function init(){
  const now=new Date();
  const next=new Date(now.getFullYear(),now.getMonth()+1,1);
  document.getElementById('selM').value=next.getMonth()+1;
  document.getElementById('selY').value=next.getFullYear();
  const saved=localStorage.getItem('sm_theme')||'light';
  document.documentElement.dataset.theme=saved;
  document.getElementById('thBtn').textContent=saved==='dark'?'☀️':'🌙';

  // Firebase init
  const fbOk=initFirebase();
  if(!fbOk){
    // Firebase nie skonfigurowany — tryb lokalny
    document.getElementById('loginOverlay').style.display='none';
    ['Anna','Bartosz','Celina','Dawid'].forEach(n=>addW(n));
    buildWeModes();renderWEGrid();
    if(!localStorage.getItem('sm_tut_done'))showTutorial();
    return;
  }

  // Sprawdź istniejącą sesję
  const ss=localStorage.getItem('sm_session');
  const hashTid=(window.location.hash.match(/team=([a-z0-9]+)/)||[])[1];
  if(ss){
    try{
      teamSession=JSON.parse(ss);
      const doc=await db.collection('teams').doc(teamSession.teamId).get();
      if(doc.exists&&doc.data().passwordHash===teamSession.passwordHash){
        if(hashTid&&hashTid!==teamSession.teamId){
          // Inny zespół w URL
          document.getElementById('joinTeamId').value=hashTid;
          teamSession=null;localStorage.removeItem('sm_session');
        } else {
          window.location.hash='team='+teamSession.teamId;
          showApp();return;
        }
      } else {teamSession=null;localStorage.removeItem('sm_session');}
    }catch(e){teamSession=null;localStorage.removeItem('sm_session');}
  }

  // Sprawdź hash URL
  if(hashTid)document.getElementById('joinTeamId').value=hashTid;

  // Pokaż login
  buildWeModes();renderWEGrid();
}
init();
