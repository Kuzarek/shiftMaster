// ── CONSTANTS ──────────────────────────────────────────────────────
const COLORS=['#6c63ff','#e11d48','#16a34a','#d97706','#0891b2','#7c3aed','#dc2626','#059669'];
const MONTHS=['','Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const MSHORT=['','Sty','Lut','Mar','Kwi','Maj','Cze','Lip','Sie','Wrz','Paź','Lis','Gru'];
const DNS=['Nd','Pn','Wt','Śr','Cz','Pt','Sb'];
const LS='shiftmaster_v6';

// day value meanings:
// 'vac'   = vacation (Mon-Fri +8h, weekend 0h)
// 'off'   = unavailable (0h, cannot assign)
// 'no-d'  = night only (restriction)
// 'no-n'  = day only (restriction)
// 'no-both'= both blocked

let wCtr=0, workers=[], weModes={}, cmode={}, schedules=[];
let _scheduleStale=null; // month key "Y-M" or null
let _cachedStaleSchedules=null;

// ── UTILS ──────────────────────────────────────────────────────────
const dim=(y,m)=>new Date(y,m,0).getDate();
const dstr=(y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const addD=(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
const dow=(y,m,d)=>new Date(y,m-1,d).getDay();
const isWD=(y,m,d)=>{const w=dow(y,m,d);return w>=1&&w<=5};
const ym=()=>({y:+document.getElementById('selY').value,m:+document.getElementById('selM').value});

function showContact(){document.getElementById('contactModal').style.display='flex';}
function hideContact(){document.getElementById('contactModal').style.display='none';}

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
      workers:workers.map(w=>({id:w.id,name:w.name,color:w.color,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[]})),
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
    workers=d.workers.map(w=>({...w,_open:false,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[]}));
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
  if(id==='pm')renderMembers();
}

// ── MONTH / WEEKEND ────────────────────────────────────────────────
function onMC(){
  // Exit approved view when changing month
  if(_approvedViewActive){_hideApprovedSchedule();}
  schedules=[];window._schedMeta=null;
  buildWeModes();renderWorkers();renderWEGrid();
  document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  renderApprovedBanner(_cachedAppSch);
  // Auto-show approved schedule for the new month
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
  renderStaleNotice();
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
  workers.push({id,name:name||`Pracownik ${id+1}`,color:COLORS[workers.length%COLORS.length],_open:false,days:{},minDays:0,reqDays:[],login:null,disabled:false});
  cmode[id]='vac';renderWorkers();autoSave();
}
function delW(id){workers=workers.filter(w=>w.id!==id);renderWorkers();autoSave();}
function renderWorkers(){
  const {y,m}=ym();const list=document.getElementById('wlist');list.innerHTML='';
  workers.forEach(w=>{
    const div=document.createElement('div');
    div.className='wcard'+(w._open?' exp':'')+(w.disabled&&teamSession?' wdis':'');div.id='wc'+w.id;
    div.innerHTML=buildWCard(w,y,m);list.appendChild(div);
  });
}
function buildWCard(w,y,m){
  const cnt=Object.keys(w.days).length;
  const badges=cnt?`<span class="wbadge bc">${cnt}×</span>`:'';
  const body=w._open?`<div class="wbody">${buildWOpts(w)}${buildCal(w,y,m)}</div>`:'';
  const initials=w.name.trim().split(/\s+/).map(p=>p[0]||'').join('').slice(0,2).toUpperCase()||'?';
  const hex=w.color;
  const canEdit=canEditWorker(w);
  const isAdmin=!teamSession||teamSession.role==='admin';
  const disBtn=(teamSession&&canDo('generate'))?`<button class="wdisbtn${w.disabled?' dis':''}" onclick="togWDis(${w.id})" title="${w.disabled?'Włącz do grafiku':'Wyklucz z grafiku'}">${w.disabled?'⊘':'◉'}</button>`:'';
  const delBtn=isAdmin?`<button class="wdel" onclick="delW(${w.id})">×</button>`:'';
  return `<div class="whead">
    <div class="wavatar" style="background:${hex}22;border:1.5px solid ${hex}88;color:${hex}">${initials}</div>
    ${canEdit
      ?`<input class="wname" value="${w.name}" oninput="workers.find(x=>x.id===${w.id}).name=this.value;autoSave()" placeholder="Imię">`
      :`<span class="wname" style="cursor:default;color:var(--text2)">${w.name}</span>`}
    <div class="wbadges">${badges}</div>
    ${disBtn}<button class="warr${w._open?' op':''}" onclick="togW(${w.id})">▾</button>
    ${delBtn}
  </div>${body}`;
}
function buildWOpts(w){
  const v=w.minDays||0;
  const rd=w.reqDays||[];
  const DAYS=['Pn','Wt','Śr','Cz','Pt'];
  const canEdit=canEditWorker(w);
  const dayChks=DAYS.map((d,i)=>{
    const wd=i+1; // 1=Mon..5=Fri
    const chk=rd.includes(wd)?'checked':'';
    return `<label style="display:flex;align-items:center;gap:2px;cursor:${canEdit?'pointer':'default'};font-family:'Fira Code',monospace;font-size:10px;color:var(--text2)"><input type="checkbox" ${chk} ${canEdit?'':`disabled`} style="width:12px;height:12px;accent-color:var(--acc)" ${canEdit?`onchange="togReqDay(${w.id},${wd},this.checked)"`:''}">${d}</label>`;
  }).join('');
  return `<div class="wopts">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="chkl" style="flex:1">Min. dniówek Pn–Pt / tydzień</span>
      <select style="width:50px" ${canEdit?`onchange="workers.find(x=>x.id===${w.id}).minDays=+this.value;renderWorkers();autoSave()"`:''} ${canEdit?'':'disabled'}>
        <option value="0"${v===0?' selected':''}>0</option>
        <option value="1"${v===1?' selected':''}>1</option>
        <option value="2"${v===2?' selected':''}>2</option>
        <option value="3"${v===3?' selected':''}>3</option>
        <option value="4"${v===4?' selected':''}>4</option>
        <option value="5"${v===5?' selected':''}>5</option>
      </select>
    </div>
    ${v>0?`<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">
      <span style="font-size:9px;color:var(--muted);font-family:'Fira Code',monospace">Obowiązkowe:</span>
      ${dayChks}
    </div>
    <div class="chkn">Zaznaczone dni = obowiązkowa dniówka. Reszta min. ${v} wypełniona dowolnie.</div>`
    :`<div class="chkn">Algorytm priorytetowo przydzieli min. tyle dniówek tygodniowo (0 = wył.)</div>`}
  </div>`;
}

function togReqDay(wid,wd,checked){
  const w=workers.find(x=>x.id===wid);if(!w)return;
  if(!w.reqDays)w.reqDays=[];
  if(checked){if(!w.reqDays.includes(wd))w.reqDays.push(wd);}
  else{w.reqDays=w.reqDays.filter(d=>d!==wd);}
  w.reqDays.sort();markStale();
  autoSave();
}

function togW(id){
  const w=workers.find(x=>x.id===id);if(!w)return;
  w._open=!w._open;const {y,m}=ym();
  const c=document.getElementById('wc'+id);
  c.className='wcard'+(w._open?' exp':'')+(w.disabled&&teamSession?' wdis':'');c.innerHTML=buildWCard(w,y,m);
}

function togWDis(id){
  if(!canDo('generate'))return;
  const w=workers.find(x=>x.id===id);if(!w)return;
  w.disabled=!w.disabled;renderWorkers();markStale();autoSave();
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
  const canEdit=canEditWorker(w);
  const btns=canEdit?Object.entries(CM).map(([k,v])=>
    `<button class="cmbtn${cm===k?' on-'+k:''}" onclick="setCM(${w.id},'${k}')">${v.l}</button>`
  ).join(''):'';
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
  return `${canEdit?`<div class="cmodes">${btns}</div><div class="mhint">${CM[cm].h}</div>`:''}
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
  const w=workers.find(x=>x.id===wid);if(!w||!canEditWorker(w))return;
  cmode[wid]=mode;
  if(w&&w._open){const {y,m}=ym();document.getElementById('wc'+wid).innerHTML=buildWCard(w,y,m);}
}
function calClick(wid,date){
  const w=workers.find(x=>x.id===wid);if(!w||!canEditWorker(w))return;
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
  renderPreFill();markStale();autoSave();
}

// ── SHIFT GENERATION ──────────────────────────────────────────────
function genShifts(y,m,shiftMode,minPerDay){
  const is8=shiftMode==='8h';
  const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);const shifts=[];
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);const wd=dow(y,m,d);
    if(is8){
      const we8=document.getElementById('chk8hWe')&&document.getElementById('chk8hWe').checked;
      if(wd>=1&&wd<=5||we8){
        for(let s=0;s<mpd;s++)shifts.push({date,type:'dzien',hours:8,slot:s+1});
      }
    } else {
      if(wd>=1&&wd<=5){
        // Emergency 24h: if only 1 worker available on a workday
        const avail=workers.filter(w=>{const r=w.days[date];return !(teamSession&&w.disabled)&&r!=='vac'&&r!=='off';});
        if(avail.length<=1){
          shifts.push({date,type:'24h',hours:24});
        } else {
          shifts.push({date,type:'dzien',hours:12});
          shifts.push({date,type:'noc',hours:12});
        }
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
  shifts.sort((a,b)=>a.date.localeCompare(b.date)||(a.slot||0)-(b.slot||0)||(a.type==='dzien'?-1:b.type==='dzien'?1:0));
  return shifts;
}

// ── QUOTAS (pre-computed before generation) ──────────────────────
// Each worker gets an equal quota of weekday day-shifts and night+weekend shifts.
// All Mon-Fri day-shifts treated as office shifts (no B/D distinction).

function buildQuotas(y,m,shiftMode,minPerDay){
  const is8=shiftMode==='8h';
  const mpd=is8?(minPerDay||1):1;
  const n=dim(y,m);
  const we8=is8&&document.getElementById('chk8hWe')&&document.getElementById('chk8hWe').checked;
  let wdayDzien=0,wdayNoc=0,weH=0;
  for(let d=1;d<=n;d++){
    const wd=dow(y,m,d);
    if(wd>=1&&wd<=5){wdayDzien++;if(!is8)wdayNoc++;}
    else if(we8){wdayDzien++;}
    else if(!is8){
      const satS=wd===6?dstr(y,m,d):dstr(y,m,d-1);
      const mo=weModes[satS]||'24h';
      if(mo==='24h')weH+=24;
      else if(mo==='split'){weH+=24;}
    }
  }
  const activeW=teamSession?workers.filter(w=>!w.disabled):workers;
  const numW=activeW.length;
  const dH=is8?8:12;
  const totalH=wdayDzien*mpd*dH+wdayNoc*12+weH;
  const targetH=numW?totalH/numW:0;
  const totalDSlots=is8?wdayDzien*mpd:wdayDzien;
  const maxD=numW?totalDSlots/numW:0;
  const maxNocWeH=is8?0:Math.max(0,targetH-maxD*12);
  const quotas={};
  activeW.forEach(w=>{
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

  // Max 2 consecutive Sundays (8h mode with weekends)
  if(cfg.maxSun&&new Date(date).getDay()===0){
    let c=0;
    for(let w7=7;w7<=14;w7+=7){
      const prevSun=addD(date,-w7);
      if(sched.some(e=>e.wid===wid&&e.date===prevSun))c++;else break;
    }
    if(c>=2)return false;
  }

  // ── QUOTAS – hard limits ──────────────────────────────────────
  // Main limit: worker's total hours cannot exceed target + tolerance
  const myTotalH=sched.filter(e=>e.wid===wid).reduce((s,e)=>s+e.hours,0);
  if(myTotalH+shift.hours>q.target+cfg.tol)return false;

  const wd=new Date(date).getDay();const isWday=wd>=1&&wd<=5;
  const is8all=!!shift.slot; // 8h mode (has slot) — all dzien treated equally

  if(type==='dzien'&&(isWday||is8all)){
    // Hard day-shift limit per quota (in 8h mode count all dzien, not just weekday)
    const myDzien=is8all
      ? sched.filter(e=>e.wid===wid&&e.type==='dzien').length
      : sched.filter(e=>e.wid===wid&&e.type==='dzien'&&(()=>{const w2=new Date(e.date).getDay();return w2>=1&&w2<=5;})()).length;
    if(myDzien>=q.maxDzienWday+cfg.tol/(shift.hours||12))return false;
  }

  if(!is8all&&(type==='noc'||type==='24h'||(type==='dzien'&&!isWday))){
    // Night+weekend hours limit (does not apply to 8h mode)
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
  let score=myH/q.target; // 0..1, lower = needs more hours

  // reqDays: mandatory days — very strong day-shift priority + penalty for night on reqDay
  const wd=new Date(shift.date).getDay();
  if(w.reqDays&&w.reqDays.length&&w.reqDays.includes(wd)){
    if(shift.type==='dzien'){
      // Very strong bonus — we want this worker on day shift this day
      score-=10;
    } else {
      // Penalty for assigning night/24h on a day that should be a day-shift
      score+=8;
    }
  }

  // minDays: priority for Mon-Fri day-shifts when worker hasn't met weekly minimum
  if(w.minDays&&shift.type==='dzien'){
    if(wd>=1&&wd<=5){
      const cnt=weekOfficeCnt(wid,shift.date,sched);
      if(cnt<w.minDays)score-=3;
    }
  }

  // 8h: prefer maintaining 12h rest (next day's slot >= previous day's slot)
  // Penalty proportional to "downward jump" — III→I (jump 2) worse than II→I (jump 1)
  if(shift.slot){
    const prev=addD(shift.date,-1);
    const pe=sched.find(e=>e.wid===wid&&e.date===prev);
    if(pe&&pe.slot&&shift.slot<pe.slot){
      const gap=pe.slot-shift.slot; // 1 or 2
      score+=gap*50; // very high penalty — almost never picked
    }
  }

  // 8h: bonus for continuing same or higher slot (schedule stability)
  if(shift.slot){
    const prev=addD(shift.date,-1);
    const pe=sched.find(e=>e.wid===wid&&e.date===prev);
    if(pe&&pe.slot&&shift.slot===pe.slot)score-=0.3; // bonus for same slot
  }

  score+=(Math.random()-.5)*0.15;
  return score;
}

// Pre-fill: insert mandatory day-shifts (reqDays) into schedule before backtracking
function prefillReqDays(shifts,y,m){
  const prefilled=[];
  const usedShifts=new Set(); // indices of shifts consumed by prefill
  const n=dim(y,m);
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);
    const wd=dow(y,m,d);
    if(wd<1||wd>5)continue; // Mon-Fri only
    // Collect workers who have a reqDay on this weekday
    const reqWorkers=workers.filter(w=>{
      if(teamSession&&w.disabled)return false;
      if(!w.reqDays||!w.reqDays.length)return false;
      if(!w.reqDays.includes(wd))return false;
      const r=w.days[date];
      if(r==='vac'||r==='off'||r==='no-d'||r==='no-both')return false;
      return true;
    });
    if(!reqWorkers.length)continue;
    // Find a dzien shift for this date
    for(const w of reqWorkers){
      // Look for a free dzien shift on this date
      const si=shifts.findIndex((s,i)=>!usedShifts.has(i)&&s.date===date&&s.type==='dzien');
      if(si===-1)continue; // no dzien shift available — may be a 24h weekend
      const s=shifts[si];
      // Check for conflict with previous day (night/24h)
      const prevDate=addD(date,-1);
      if(prefilled.some(e=>e.wid===w.id&&e.date===prevDate&&(e.type==='noc'||e.type==='24h')))continue;
      // Check if this worker already has an assignment on this date
      if(prefilled.some(e=>e.wid===w.id&&e.date===date))continue;
      prefilled.push({wid:w.id,date:s.date,type:s.type,hours:s.hours,slot:s.slot});
      usedShifts.add(si);
    }
  }
  // Return pre-filled schedule and remaining shifts
  const remaining=shifts.filter((_,i)=>!usedShifts.has(i));
  return {prefilled,remaining};
}

function backtrack(shifts,idx,sched,results,limit,cfg){
  if(results.length>=limit)return;
  if(cfg._deadline&&Date.now()>cfg._deadline)return;
  if(idx===shifts.length){results.push([...sched]);return;}
  const shift=shifts[idx];
  const sorted=(teamSession?workers.filter(w=>!w.disabled):[...workers]).sort((a,b)=>wScore(a,shift,sched,cfg)-wScore(b,shift,sched,cfg));
  for(const w of sorted){
    if(canAssign(w,shift,sched,cfg)){
      sched.push({wid:w.id,date:shift.date,type:shift.type,hours:shift.hours,slot:shift.slot});
      backtrack(shifts,idx+1,sched,results,limit,cfg);
      sched.pop();
      if(results.length>=limit)return;
      if(cfg._deadline&&Date.now()>cfg._deadline)return;
    }
  }
}

// ── RUNNER ────────────────────────────────────────────────────────
function runGen(){
  const {y,m}=ym();const mk=y+'-'+m;
  clearStale(mk);
  if(!canDo('generate')){toast('Brak uprawnień do generowania');return;}
  if(!workers.length){alert('Dodaj co najmniej 1 pracownika!');return;}
  if(_cachedAppSch&&_cachedAppSch[mk]&&!_cachedAppSch[mk].revoked)return;
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
        maxSun:!!(document.getElementById('chkMaxSun')&&document.getElementById('chkMaxSun').checked),
        count,tol,
      };

      // In 8h mode there are no nights or weekends — no fallback strategy
      const minPerDay=shiftMode==='8h'?(+document.getElementById('minPerDay').value||1):1;
      if(shiftMode==='8h'){
        const deadline8=5000*Math.max(1,minPerDay);
        const allShifts=genShifts(y,m,shiftMode,minPerDay);
        const {prefilled,remaining}=prefillReqDays(allShifts,y,m);
        let cfg1={...baseCfg,quotas:buildQuotas(y,m,shiftMode,minPerDay),_deadline:Date.now()+deadline8};
        const results1=[];
        backtrack(remaining,0,[...prefilled],results1,count,cfg1);
        schedules=results1;
      } else {
      // Strategy: first try with current weekend settings (default 24h).
      // If enough schedules found — done.
      // If not (or too few) — auto-switch all weekends to split (D+N)
      // and generate more schedules to fill the remaining count.

      const origWeModes={...weModes};

      const allShifts12=genShifts(y,m,shiftMode);
      const {prefilled:pf12,remaining:rem12}=prefillReqDays(allShifts12,y,m);
      let cfg1={...baseCfg,quotas:buildQuotas(y,m,shiftMode),_deadline:Date.now()+5000};
      const results1=[];
      backtrack(rem12,0,[...pf12],results1,count,cfg1);

      let finalResults=results1;
      let fallbackUsed=false;

      if(results1.length<count){
        const splitModes={};
        Object.keys(origWeModes).forEach(k=>splitModes[k]='split');
        const savedModes=weModes;
        weModes=splitModes;

        const need=count-results1.length;
        const allShiftsFb=genShifts(y,m,shiftMode);
        const {prefilled:pfFb,remaining:remFb}=prefillReqDays(allShiftsFb,y,m);
        let cfg2={...baseCfg,count:need+count,quotas:buildQuotas(y,m,shiftMode),_deadline:Date.now()+5000};
        const results2=[];
        backtrack(remFb,0,[...pfFb],results2,cfg2.count,cfg2);

        weModes=savedModes; // restore original

        if(results2.length>0){
          fallbackUsed=true;
          // Merge: first results from 24h, then from split
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

// ── STALE NOTICE ──────────────────────────────────────────────────
function markStale(){
  if(!schedules.length)return;
  const {y,m}=ym();const mk=y+'-'+m;
  _scheduleStale=mk;
  renderStaleNotice();
  // Sync to Firebase so other users see the stale notice
  if(teamSession&&db){
    _skipSnap=true;
    db.collection('teams').doc(teamSession.teamId).update({['staleSchedules.'+mk]:true}).catch(()=>{_skipSnap=false;});
  }
}
function clearStale(mk){
  if(_scheduleStale===mk)_scheduleStale=null;
  if(_cachedStaleSchedules)delete _cachedStaleSchedules[mk];
  renderStaleNotice();
  if(teamSession&&db){
    _skipSnap=true;
    db.collection('teams').doc(teamSession.teamId).update({['staleSchedules.'+mk]:firebase.firestore.FieldValue.delete()}).catch(()=>{_skipSnap=false;});
  }
}
function renderStaleNotice(){
  const el=document.getElementById('staleNotice');if(!el)return;
  const {y,m}=ym();const mk=y+'-'+m;
  const isStale=_scheduleStale===mk||(_cachedStaleSchedules&&_cachedStaleSchedules[mk]);
  if(isStale&&schedules.length){
    const regenBtn=canDo('generate')?`<button class="stale-btn" onclick="runGen()">↻ Generuj ponownie</button>`:'';
    el.innerHTML=`<div class="stale-notice">⚠ Grafik może być nieaktualny — wprowadzono zmiany w kalendarzu${regenBtn}</div>`;
  } else {
    el.innerHTML='';
  }
}

// ── PRE-FILL (worker availability — read only) ────────────────────
function renderPreFill(){
  const c=document.getElementById('preFillSection');if(!c)return;
  const {y,m}=ym();
  // Hide when approved (and not revoked)
  const mk=y+'-'+m;
  const ap=_cachedAppSch&&_cachedAppSch[mk];
  if(ap&&!ap.revoked){c.innerHTML='';return;}

  const DOW=['Pn','Wt','Śr','Cz','Pt','Sb','Nd'];
  const CELL={
    vac:{cls:'pf-vac',l:'U'},
    off:{cls:'pf-off',l:'✕'},
  };
  const showDay=r=>r==='vac'||r==='off';
  const n=dim(y,m);
  // Active workers only
  const ws=teamSession?workers.filter(w=>!w.disabled):workers;
  if(!ws.length){c.innerHTML='';return;}

  // Collect only days with at least one marking
  const markedDays=[];
  for(let d=1;d<=n;d++){
    const date=dstr(y,m,d);
    if(ws.some(w=>showDay(w.days[date])))markedDays.push({d,date,wd:dow(y,m,d)});
  }
  if(!markedDays.length){c.innerHTML='';return;}

  // Header: dates
  const dateHdrs=markedDays.map(({d,wd})=>{
    const dowIdx=wd===0?6:wd-1;
    const isWe=wd===0||wd===6;
    return `<th class="${isWe?'pf-col-we':''}"><div class="pf-dnum">${d}</div><div class="pf-ddow">${DOW[dowIdx]}</div></th>`;
  }).join('');

  // Rows: workers
  const rows=ws.map(w=>{
    const ini=w.name.trim().split(/\s+/).map(p=>p[0]||'').join('').slice(0,2).toUpperCase()||'?';
    const wCell=`<td class="pf-wcell"><div class="pf-av" style="background:${w.color}22;color:${w.color};border-color:${w.color}88">${ini}</div><span class="pf-wname">${w.name.split(' ')[0]}</span></td>`;
    const cells=markedDays.map(({date,wd})=>{
      const r=w.days[date];
      const isWe=wd===0||wd===6;
      const cls=isWe?'pf-col-we':'';
      if(!r||!showDay(r))return `<td class="${cls}"></td>`;
      const isWeVac=r==='vac'&&isWe;
      const s=isWeVac?{cls:'pf-vac-w',l:'U'}:(CELL[r]||{cls:'',l:r});
      return `<td class="${cls}"><span class="pf-cell ${s.cls}">${s.l}</span></td>`;
    }).join('');
    return `<tr>${wCell}${cells}</tr>`;
  }).join('');

  c.innerHTML=`<div class="prefill-wrap">
    <div class="prefill-hdr">
      <span class="prefill-title">Dostępność — ${MONTHS[m]} ${y}</span>
      <span class="prefill-ro">tylko odczyt</span>
    </div>
    <div class="prefill-scroll">
      <table class="prefill-table">
        <thead><tr><th></th>${dateHdrs}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

// ── RENDER ALL SCHEDULES (stacked) ────────────────────────────────
// firstCount = how many schedules come from original settings (rest = split fallback)
function renderAll(y,m,fallbackUsed=false,firstCount=schedules.length){
  renderPreFill();
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
  const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e;});
  const ROMAN=['I','II','III'];

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
    ${(()=>{const {y:ry,m:rm}=ym();const rmk=ry+'-'+rm;const aa=_cachedAppSch&&_cachedAppSch[rmk]&&!_cachedAppSch[rmk].revoked;return teamSession&&!aa&&canDo('approve');})()
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
      const r=w.days[date];const ent=lkp[`${w.id}_${date}`];const type=ent?ent.type:undefined;
      let cls=we?'cwe':'';let lbl='';
      if(r==='vac'){
        if(we){cls='cuwe';lbl='U';}else{cls='cuwd';lbl='U';wt+=8;}
      } else if(r==='off'){
        cls='coff';lbl='—';
      } else if(type==='dzien'){
        const dh=ent.hours||12;
        cls='cd';lbl=ent.slot?ROMAN[ent.slot-1]:'D';wt+=dh;
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

  const is8mode=document.getElementById('selShiftMode').value==='8h';
  const mpd8=is8mode?(+document.getElementById('minPerDay').value||1):1;
  let legShifts='';
  if(is8mode){
    for(let s=1;s<=mpd8;s++) legShifts+=`<div class="legitem"><div class="legdot" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)">${ROMAN[s-1]}</div>Zmiana ${s}</div>`;
  } else {
    legShifts=`<div class="legitem"><div class="legdot" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)">D</div>Dzień</div>
    <div class="legitem"><div class="legdot" style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow)">N</div>Noc</div>
    <div class="legitem"><div class="legdot" style="background:#d6eef8;border:1px solid #1a7fa8;color:#1a7fa8;font-size:7px">24h</div>Weekend</div>`;
  }
  const leg=`<div class="legrow">
    ${legShifts}
    <div class="legitem"><div class="legdot" style="background:var(--purple-bg);border:1px solid var(--purple);color:var(--purple)">U</div>Urlop Pn-Pt</div>
    <div class="legitem"><div class="legdot" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue)">U</div>Urlop Sb-Nd</div>
    <div class="legitem"><div class="legdot" style="background:var(--gray-bg);border:1px solid var(--gray);color:var(--gray)">—</div>Niedostępny</div>
  </div>`;

  document.getElementById('sb'+idx).innerHTML=`<div class="sched-block" style="animation-delay:${idx*0.07}s">${hdr}${bars}<div class="twrap"><table>${thead}${tbody}</table></div>${leg}</div>`;
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
  if(!canDo('edit'))return;
  const menu=document.getElementById('cellMenu');
  _menuCtx={schedIdx,wid,date};
  const {y,m}=ym();
  const wd=new Date(date).getDay();const iswd=wd>=1&&wd<=5;
  const w=workers.find(x=>x.id===wid);
  const is8=document.getElementById('selShiftMode').value==='8h';
  const mpd=is8?(+document.getElementById('minPerDay').value||1):1;
  let items='';
  if(is8){
    const ROMAN=['I','II','III'];
    for(let s=1;s<=mpd;s++){
      items+=`<button class="cmitem" onclick="applyCellType('dzien',${s})">
        <div class="dot" style="background:var(--green-bg);border:1px solid var(--green)"></div>
        ${ROMAN[s-1]} — Zmiana ${s} (8h)
      </button>`;
    }
    CELL_TYPES.filter(ct=>ct.type!=='dzien'&&ct.type!=='noc'&&ct.type!=='24h').forEach(ct=>{
      items+=`<button class="cmitem" onclick="applyCellType('${ct.type}')">
        <div class="dot" style="background:${ct.bg};border:1px solid ${ct.fg}"></div>
        ${ct.lbl}
      </button>`;
    });
  } else {
    CELL_TYPES.forEach(ct=>{
      items+=`<button class="cmitem" onclick="applyCellType('${ct.type}')">
        <div class="dot" style="background:${ct.bg};border:1px solid ${ct.fg}"></div>
        ${ct.lbl}
      </button>`;
    });
  }
  menu.innerHTML=items;
  // position
  const r=evt.target.getBoundingClientRect();
  let left=r.left,top=r.bottom+2;
  if(left+140>window.innerWidth)left=window.innerWidth-144;
  if(top+200>window.innerHeight)top=r.top-2-200;
  menu.style.left=left+'px';menu.style.top=top+'px';menu.style.display='flex';
}
function applyCellType(type,slot){
  if(!_menuCtx)return;
  const {schedIdx,wid,date}=_menuCtx;
  const sched=schedules[schedIdx];
  const {y,m}=ym();
  const w=workers.find(x=>x.id===wid);
  const wd=new Date(date).getDay();const iswd=wd>=1&&wd<=5;

  if(type==='none'||type==='off'||type==='vac'){
    schedules[schedIdx]=sched.filter(e=>!(e.wid===wid&&e.date===date));
    if(type==='vac')w.days[date]='vac';
    else if(type==='off')w.days[date]='off';
    else if(w.days[date]==='vac'||w.days[date]==='off')delete w.days[date];
  } else {
    schedules[schedIdx]=sched.filter(e=>!(e.wid===wid&&e.date===date));
    if(w.days[date]==='vac'||w.days[date]==='off')delete w.days[date];
    const is8=document.getElementById('selShiftMode').value==='8h';
    const hrs=type==='24h'?24:(is8?8:12);
    const entry={wid,date,type,hours:hrs};
    if(slot)entry.slot=slot;
    schedules[schedIdx].push(entry);
    schedules[schedIdx].sort((a,b)=>a.date.localeCompare(b.date));
  }
  document.getElementById('cellMenu').style.display='none';
  renderSched(schedIdx,y,m);
  autoSave();
}
document.addEventListener('click',()=>{document.getElementById('cellMenu').style.display='none';});

// ── EXCEL EXPORT — HTML-table format (colors work in Excel/LibreOffice) ──
function exportXL(y,m,onlyIdx){
  const n=dim(y,m);

  // Cell style – font
  const F='font-family:Calibri,Arial,sans-serif;font-size:10px;';
  const FS='font-family:Calibri,Arial,sans-serif;font-size:9px;';
  const B='border:1px solid #808080;';

  // Color palette
  const C={
    // Title header (dark olive/green)
    title:    {bg:'#4a5426',fg:'#ffffff'},
    // Day header - regular (light gray/beige)
    hdrDay:   {bg:'#d9d9d9',fg:'#000000'},
    // Day header - Saturday (red background)
    hdrSat:   {bg:'#ff0000',fg:'#ffffff'},
    // Day header - Sunday (red background)
    hdrSun:   {bg:'#ff0000',fg:'#ffffff'},
    // Day shift D
    dzien:    {bg:'#92d050',fg:'#000000'},  // green
    // Night shift N
    noc:      {bg:'#00b0f0',fg:'#000000'},  // blue
    // 24h weekend
    h24:      {bg:'#87CEEB',fg:'#000000'},  // sky blue
    // Vacation Mon-Fri (yellow with "U")
    vacWD:    {bg:'#ffff00',fg:'#000000'},
    // Vacation Sat-Sun (yellow with "U")
    vacWE:    {bg:'#ffff00',fg:'#000000'},
    // Unavailable / unpaid leave (orange)
    off:      {bg:'#ffc000',fg:'#000000'},
    // Sick leave (purple)
    sick:     {bg:'#7030a0',fg:'#ffffff'},
    // Empty cells
    empty:    {bg:'#ffffff',fg:'#000000'},
    // Empty weekend cells
    emptyWE:  {bg:'#f2f2f2',fg:'#808080'},
    // Sum
    sum:      {bg:'#d9e2f3',fg:'#000000'},
    // Worker row - normal background
    plain:    {bg:'#ffffff',fg:'#000000'},
    // Worker row - alternating background
    alt:      {bg:'#f2f2f2',fg:'#000000'},
    // Summary rows: day shifts
    sumDzien: {bg:'#e2efda',fg:'#000000'},
    // Summary rows: night shifts
    sumNoc:   {bg:'#dce6f1',fg:'#000000'},
    // Control sum
    sumCtrl:  {bg:'#fce4d6',fg:'#000000'},
    // Staffing check
    sumSklad: {bg:'#d9d9d9',fg:'#000000'},
    // Legend: sick leave
    legSick:  {bg:'#7030a0',fg:'#ffffff'},
    // Legend: unpaid leave
    legFree:  {bg:'#ffc000',fg:'#000000'},
    // Legend: paid vacation
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
    const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e;});
    const ROMAN=['I','II','III'];
    const totalCols=3+n+1; // No. + First name + Last name + days + SUM

    html+=`<table>`;

    // === ROW 1: Title row — "SCHEDULE - MONTH YEAR" ===
    html+=`<tr>`;
    html+=td(`GRAFIK ${si+1} — ${MONTHS[m].toUpperCase()} ${y}`,C.title.bg,C.title.fg,{colspan:totalCols,bold:true,align:'center'});
    html+=`</tr>`;

    // === ROW 2: Header row — No. | First name | Last name | 1..31 ===
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
    html+=td('',C.hdrDay.bg,C.hdrDay.fg,{bold:true,width:'35px'}); // SUM header
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
        const r=w.days[date];const ent=lkp[`${w.id}_${date}`];const type=ent?ent.type:undefined;
        let lbl='',cBg=iswe?C.emptyWE.bg:C.empty.bg,cFg=iswe?C.emptyWE.fg:C.empty.fg;

        if(r==='vac'){
          if(iswe){lbl='U';cBg=C.vacWE.bg;cFg=C.vacWE.fg;}
          else{lbl='U';cBg=C.vacWD.bg;cFg=C.vacWD.fg;total+=8;}
        } else if(r==='off'){
          lbl='WN';cBg=C.off.bg;cFg=C.off.fg;
        } else if(type==='dzien'){
          lbl=ent.slot?ROMAN[ent.slot-1]:'D';cBg=C.dzien.bg;cFg=C.dzien.fg;total+=(ent.hours||12);
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

    // === Summary rows: day-shift count per day ===
    {
      html+=`<tr>`;
      html+=td('',C.sumDzien.bg,C.sumDzien.fg,{width:'25px'});
      html+=td('Dniówki',C.sumDzien.bg,C.sumDzien.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumD=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=(lkp[`${w.id}_${date}`]||{}).type;
          if(type==='dzien')cnt++;
        });
        sumD+=cnt;
        html+=td(cnt||0,C.sumDzien.bg,C.sumDzien.fg,{width:'26px'});
      }
      html+=td(sumD,C.sumDzien.bg,C.sumDzien.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === Summary row: night-shift count per day ===
    {
      html+=`<tr>`;
      html+=td('',C.sumNoc.bg,C.sumNoc.fg,{width:'25px'});
      html+=td('Nocki',C.sumNoc.bg,C.sumNoc.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumN=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=(lkp[`${w.id}_${date}`]||{}).type;
          if(type==='noc')cnt++;
        });
        sumN+=cnt;
        html+=td(cnt||0,C.sumNoc.bg,C.sumNoc.fg,{width:'26px'});
      }
      html+=td(sumN,C.sumNoc.bg,C.sumNoc.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === Control sum (day+night per day) ===
    {
      html+=`<tr>`;
      html+=td('',C.sumCtrl.bg,C.sumCtrl.fg,{width:'25px'});
      html+=td('SUMA kontrolna',C.sumCtrl.bg,C.sumCtrl.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      let sumT=0;
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);
        let cnt=0;
        workers.forEach(w=>{
          const type=(lkp[`${w.id}_${date}`]||{}).type;
          if(type==='dzien'||type==='noc'||type==='24h')cnt++;
        });
        sumT+=cnt;
        html+=td(cnt||0,C.sumCtrl.bg,C.sumCtrl.fg,{width:'26px'});
      }
      html+=td(sumT,C.sumCtrl.bg,C.sumCtrl.fg,{bold:true,width:'35px'});
      html+=`</tr>`;
    }

    // === Staffing row — check if each day has proper staffing ===
    {
      html+=`<tr>`;
      html+=td('',C.sumSklad.bg,C.sumSklad.fg,{width:'25px'});
      html+=td('SKŁAD',C.sumSklad.bg,C.sumSklad.fg,{bold:true,align:'left',colspan:2,width:'155px'});
      for(let d=1;d<=n;d++){
        const date=dstr(y,m,d);const wd=dow(y,m,d);
        const iswe=wd===0||wd===6;
        let hasD=false,hasN=false,has24=false;
        workers.forEach(w=>{
          const type=(lkp[`${w.id}_${date}`]||{}).type;
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
        const type=(lkp[`${w.id}_${date}`]||{}).type;
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

// ── AUTH UI (ekran 1) ────────────────────────────────────────────
let currentUser=null; // {login, displayName, passwordHash, teams:{}}

function showAuthTab(tab){
  document.getElementById('authLogin').style.display=tab==='login'?'':'none';
  document.getElementById('authRegister').style.display=tab==='register'?'':'none';
  const tabs=document.querySelectorAll('#authOverlay .login-tab');
  tabs.forEach((b,i)=>{
    b.classList.toggle('active',(tab==='login'&&i===0)||(tab==='register'&&i===1));
  });
}

async function doRegister(){
  const login=document.getElementById('regUser').value.trim().toLowerCase();
  const name=document.getElementById('regName').value.trim();
  const pw=document.getElementById('regPass').value;
  const pw2=document.getElementById('regPass2').value;
  const err=document.getElementById('regErr');
  if(!login||login.length<3||!/^[a-z0-9_]+$/.test(login)){err.textContent='Login: min 3 znaki (a-z, 0-9, _)';return;}
  if(!name){err.textContent='Podaj wyświetlaną nazwę';return;}
  if(pw.length<4){err.textContent='Hasło min. 4 znaki';return;}
  if(pw!==pw2){err.textContent='Hasła się nie zgadzają';return;}
  err.textContent='Rejestracja...';
  try{
    const existing=await db.collection('users').doc(login).get();
    if(existing.exists){err.textContent='Login "'+login+'" jest już zajęty';return;}
    const pwh=await hashPw(pw);
    await db.collection('users').doc(login).set({
      login,displayName:name,passwordHash:pwh,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      teams:{}
    });
    currentUser={login,displayName:name,passwordHash:pwh,teams:{}};
    localStorage.setItem('sm_user',JSON.stringify(currentUser));
    showTeamSelect();
  }catch(e){err.textContent='Błąd: '+e.message;}
}

async function doLogin(){
  const login=document.getElementById('loginUser').value.trim().toLowerCase();
  const pw=document.getElementById('loginPass').value;
  const err=document.getElementById('loginErr');
  if(!login){err.textContent='Podaj login';return;}
  if(!pw){err.textContent='Podaj hasło';return;}
  err.textContent='Logowanie...';
  try{
    const doc=await db.collection('users').doc(login).get();
    if(!doc.exists){err.textContent='Użytkownik nie istnieje';return;}
    const pwh=await hashPw(pw);
    const data=doc.data();
    if(data.passwordHash!==pwh){err.textContent='Błędne hasło';return;}
    currentUser={login:data.login,displayName:data.displayName,passwordHash:pwh,teams:data.teams||{}};
    localStorage.setItem('sm_user',JSON.stringify(currentUser));
    showTeamSelect();
  }catch(e){err.textContent='Błąd: '+e.message;}
}

function doLogoutUser(){
  currentUser=null;
  localStorage.removeItem('sm_user');
  localStorage.removeItem('sm_team');
  document.getElementById('teamSelectOverlay').style.display='none';
  document.getElementById('authOverlay').style.display='';
}

// ── TEAM SELECT UI (ekran 2) ────────────────────────────────────
function showTeamSelect(){
  document.getElementById('authOverlay').style.display='none';
  document.getElementById('teamSelectOverlay').style.display='';
  document.getElementById('tsWelcome').textContent='Witaj, '+currentUser.displayName+'!';
  document.getElementById('tsCreateForm').style.display='none';
  document.getElementById('tsJoinForm').style.display='none';
  renderTeamList();
  // If URL hash contains a team ID and user is not a member yet — open join form
  const hashTid=(window.location.hash.match(/team=([a-z0-9]+)/)||[])[1];
  if(hashTid&&!(currentUser.teams&&currentUser.teams[hashTid])){
    document.getElementById('tsJoinId').value=hashTid;
    document.getElementById('tsJoinForm').style.display='';
  }
}

function renderTeamList(){
  const list=document.getElementById('tsTeamList');
  const empty=document.getElementById('tsEmpty');
  const teams=currentUser.teams||{};
  const keys=Object.keys(teams);
  if(!keys.length){list.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  const ROLE_PL={admin:'admin',editor:'edytor',worker:'pracownik'};
  list.innerHTML=keys.map(tid=>{
    const t=teams[tid];
    const role=t.role||'worker';
    return `<div class="ts-team-item" onclick="enterTeam('${tid}')">
      <span class="ts-team-name">${t.teamName||tid}</span>
      <span class="ts-team-role ts-role-${role}">${ROLE_PL[role]||role}</span>
    </div>`;
  }).join('');
}

function showTsCreate(){
  const f=document.getElementById('tsCreateForm');
  f.style.display=f.style.display==='none'?'':'none';
  document.getElementById('tsJoinForm').style.display='none';
}
function showTsJoin(){
  const f=document.getElementById('tsJoinForm');
  f.style.display=f.style.display==='none'?'':'none';
  document.getElementById('tsCreateForm').style.display='none';
}

async function doCreateTeamNew(){
  const name=document.getElementById('tsCreateName').value.trim();
  const pw=document.getElementById('tsCreatePw').value;
  const err=document.getElementById('tsCreateErr');
  if(!name){err.textContent='Podaj nazwę zespołu';return;}
  if(pw.length<4){err.textContent='Hasło min. 4 znaki';return;}
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
      genSettings:{shiftMode:(document.getElementById('tsCreateMode')&&document.getElementById('tsCreateMode').value)||'12h',maxN:true,maxNVal:3,maxD:true,maxDVal:3,tol:24,minPerDay:1,count:1},
      approvedSchedules:{},
      members:{[currentUser.login]:{displayName:currentUser.displayName,role:'admin'}}
    });
    // Update user.teams
    currentUser.teams[tid]={role:'admin',teamName:name};
    await db.collection('users').doc(currentUser.login).update({['teams.'+tid]:{role:'admin',teamName:name}});
    localStorage.setItem('sm_user',JSON.stringify(currentUser));
    enterTeam(tid);
    toast('✓ Zespół utworzony! Udostępnij link.');
  }catch(e){err.textContent='Błąd: '+e.message;}
}

async function doJoinTeamNew(){
  let tid=document.getElementById('tsJoinId').value.trim().toLowerCase();
  const pw=document.getElementById('tsJoinPw').value;
  const err=document.getElementById('tsJoinErr');
  if(tid.includes('#team='))tid=tid.split('#team=').pop();
  if(tid.includes('team='))tid=tid.split('team=').pop();
  if(!tid){err.textContent='Podaj ID zespołu';return;}
  if(!pw){err.textContent='Podaj hasło';return;}
  err.textContent='Łączenie...';
  try{
    const doc=await db.collection('teams').doc(tid).get();
    if(!doc.exists){err.textContent='Zespół nie istnieje';return;}
    const pwh=await hashPw(pw);
    if(doc.data().passwordHash!==pwh){err.textContent='Błędne hasło';return;}
    const data=doc.data();
    const teamName=data.name||tid;
    // Check if user is already a member
    const members=data.members||{};
    let role=members[currentUser.login]?members[currentUser.login].role:'worker';
    // Legacy team without members — first user becomes admin
    if(!data.members||!Object.keys(data.members).length){role='admin';}
    // Add member to team
    await db.collection('teams').doc(tid).update({
      ['members.'+currentUser.login]:{displayName:currentUser.displayName,role}
    });
    // Update user.teams
    currentUser.teams[tid]={role,teamName};
    await db.collection('users').doc(currentUser.login).update({['teams.'+tid]:{role,teamName}});
    localStorage.setItem('sm_user',JSON.stringify(currentUser));
    enterTeam(tid);
  }catch(e){err.textContent='Błąd: '+e.message;}
}

async function enterTeam(tid){
  const t=currentUser.teams[tid];
  if(!t)return;
  teamSession={
    teamId:tid,
    login:currentUser.login,
    displayName:currentUser.displayName,
    role:t.role||'worker',
    passwordHash:null // not needed — auth is per user
  };
  // Fetch team passwordHash + auto-add user as worker
  try{
    const doc=await db.collection('teams').doc(tid).get();
    if(doc.exists){
      teamSession.passwordHash=doc.data().passwordHash;
      const existing=doc.data().workers||[];
      if(!existing.some(w=>w.login===currentUser.login)){
        const color=COLORS[existing.length%COLORS.length];
        const nid=doc.data().wCtr!=null?doc.data().wCtr:existing.length;
        const newW={id:nid,name:currentUser.displayName,color,days:{},minDays:0,reqDays:[],login:currentUser.login,disabled:false};
        await db.collection('teams').doc(tid).update({workers:[...existing,newW],wCtr:nid+1});
      }
    }
  }catch(e){}
  localStorage.setItem('sm_team',JSON.stringify({teamId:tid,role:t.role}));
  window.location.hash='team='+tid;
  showApp();
  if(!localStorage.getItem('sm_tut_done'))showTutorial();
}

// ── LOGOUT / SWITCH TEAM ────────────────────────────────────────
function doLogout(){
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  teamSession=null;
  localStorage.removeItem('sm_team');
  window.location.hash='';
  workers=[];schedules=[];weModes={};wCtr=0;
  document.getElementById('teamBar').style.display='none';
  document.getElementById('approvedBanner').innerHTML='';
  document.getElementById('mainInner').innerHTML='';
  document.getElementById('wlist').innerHTML='';
  document.getElementById('tabMembers').style.display='none';
  // Return to team selection screen
  if(currentUser){
    // Refresh user's team list from Firestore
    db.collection('users').doc(currentUser.login).get().then(doc=>{
      if(doc.exists)currentUser.teams=doc.data().teams||{};
      localStorage.setItem('sm_user',JSON.stringify(currentUser));
      showTeamSelect();
    }).catch(()=>showTeamSelect());
  } else {
    document.getElementById('authOverlay').style.display='';
  }
}

function copyTeamLink(){
  if(!teamSession)return;
  const link=window.location.origin+window.location.pathname+'#team='+teamSession.teamId;
  navigator.clipboard.writeText(link).then(()=>toast('✓ Link skopiowany!')).catch(()=>prompt('Skopiuj link:',link));
}

function startLocalMode(){
  document.getElementById('authOverlay').style.display='none';
  document.getElementById('teamSelectOverlay').style.display='none';
  if(db)document.getElementById('localBar').style.display='';
  const cb=document.getElementById('clearBtn');if(cb)cb.style.display='';
  const lb=document.getElementById('loadBtn');if(lb)lb.style.display='';
  ['Anna','Bartosz','Celina','Dawid'].forEach(n=>addW(n));
  buildWeModes();renderWEGrid();
  if(!localStorage.getItem('sm_tut_done'))showTutorial();
}

function returnToLogin(){
  workers=[];schedules=[];weModes={};wCtr=0;
  document.getElementById('localBar').style.display='none';
  const cb2=document.getElementById('clearBtn');if(cb2)cb2.style.display='none';
  const lb2=document.getElementById('loadBtn');if(lb2)lb2.style.display='none';
  document.getElementById('approvedBanner').innerHTML='';
  document.getElementById('mainInner').innerHTML='<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  document.getElementById('wlist').innerHTML='';
  if(currentUser){showTeamSelect();}
  else{document.getElementById('authOverlay').style.display='';}
  buildWeModes();renderWEGrid();
}

// ── ROLES / PERMISSIONS ─────────────────────────────────────────
function canDo(action){
  if(!teamSession)return true; // local mode = full access
  const role=teamSession.role||'worker';
  const perms={
    admin:  ['generate','edit','approve','revoke','manage_members','manage_workers','export'],
    editor: ['generate','edit','manage_workers','export'],
    worker: ['view','export']
  };
  return perms[role]&&perms[role].includes(action);
}
// Whether the current user can edit this worker's data
function canEditWorker(w){
  if(!teamSession)return true; // local mode — full access
  if(teamSession.role==='admin'||teamSession.role==='editor')return true; // admin and editor edit everyone
  return w.login===teamSession.login; // worker — own entry only
}

function shiftModeStartEdit(){
  // Admin clicks ✎ → shows select instead of text
  const smSel=document.getElementById('selShiftMode');
  const smDisp=document.getElementById('shiftModeDisp');
  const smChg=document.getElementById('shiftModeChgBtn');
  if(smSel)smSel.style.display='';
  if(smDisp)smDisp.style.display='none';
  if(smChg)smChg.style.display='none';
  // On value change: autoSave will persist the new mode to Firestore
}

function applyRoleUI(){
  // Generate button
  const genBtn=document.getElementById('genBtn');
  if(genBtn&&teamSession){
    if(!canDo('generate')){genBtn.style.display='none';}
  }
  // Add worker button — admin only
  const addBtn=document.querySelector('.addwbtn');
  if(addBtn)addBtn.style.display=(!teamSession||teamSession.role==='admin')?'':'none';
  // Options tab — admin and editor only
  const tabOpts=document.getElementById('tabOptions');
  if(tabOpts&&teamSession)tabOpts.style.display=canDo('generate')?'':'none';
  // Members tab
  const tabM=document.getElementById('tabMembers');
  if(tabM)tabM.style.display=(teamSession&&canDo('manage_members'))?'':'none';
  // Role badge in team bar
  const rd=document.getElementById('teamRoleDisp');
  if(rd&&teamSession){
    const ROLE_PL={admin:'admin',editor:'edytor',worker:'pracownik'};
    const r=teamSession.role||'worker';
    rd.textContent=ROLE_PL[r];
    rd.className='trole ts-role-'+r;
  }
  // Shift mode: in team mode show as text, admin can change it
  const smSel=document.getElementById('selShiftMode');
  const smDisp=document.getElementById('shiftModeDisp');
  const smChg=document.getElementById('shiftModeChgBtn');
  if(teamSession){
    if(smSel)smSel.style.display='none';
    if(smDisp)smDisp.style.display='';
    if(smChg)smChg.style.display=canDo('manage_members')?'':'none';
  } else {
    if(smSel)smSel.style.display='';
    if(smDisp)smDisp.style.display='none';
    if(smChg)smChg.style.display='none';
  }
}

// ── MEMBERS PANEL (admin) ───────────────────────────────────────
async function renderMembers(){
  const list=document.getElementById('membersList');
  if(!list||!teamSession||!db)return;
  try{
    const doc=await db.collection('teams').doc(teamSession.teamId).get();
    if(!doc.exists)return;
    const members=doc.data().members||{};
    const keys=Object.keys(members);
    if(!keys.length){list.innerHTML='<div style="font-size:11px;color:var(--muted)">Brak członków</div>';return;}
    const isAdmin=canDo('manage_members');
    list.innerHTML=keys.map(login=>{
      const m=members[login];
      const isSelf=login===currentUser.login;
      let roleHtml;
      if(isAdmin&&!isSelf){
        roleHtml=`<select class="member-role-sel" onchange="changeMemberRole('${login}',this.value)">
          <option value="admin"${m.role==='admin'?' selected':''}>Admin</option>
          <option value="editor"${m.role==='editor'?' selected':''}>Edytor</option>
          <option value="worker"${m.role==='worker'||!m.role?' selected':''}>Pracownik</option>
        </select>`;
      }else{
        const ROLE_PL={admin:'admin',editor:'edytor',worker:'pracownik'};
        roleHtml=`<span class="ts-team-role ts-role-${m.role||'worker'}">${ROLE_PL[m.role||'worker']}</span>`;
      }
      const delHtml=isAdmin&&!isSelf?`<button class="member-del" onclick="removeMember('${login}')" title="Usuń z zespołu">✕</button>`:'';
      return `<div class="member-card">
        <span class="member-name">${m.displayName||login}${isSelf?' (ty)':''}</span>
        ${roleHtml}${delHtml}
      </div>`;
    }).join('');
  }catch(e){console.error('renderMembers error:',e);}
}

async function changeMemberRole(login,newRole){
  if(!teamSession||!db||!canDo('manage_members'))return;
  try{
    // Update team.members
    await db.collection('teams').doc(teamSession.teamId).update({
      ['members.'+login+'.role']:newRole
    });
    // Update user.teams
    await db.collection('users').doc(login).update({
      ['teams.'+teamSession.teamId+'.role']:newRole
    });
    toast('✓ Rola zmieniona');
    renderMembers();
  }catch(e){toast('✗ Błąd: '+e.message);}
}

async function removeMember(login){
  if(!teamSession||!db||!canDo('manage_members'))return;
  if(!confirm('Usunąć '+login+' z zespołu?'))return;
  try{
    await db.collection('teams').doc(teamSession.teamId).update({
      ['members.'+login]:firebase.firestore.FieldValue.delete()
    });
    await db.collection('users').doc(login).update({
      ['teams.'+teamSession.teamId]:firebase.firestore.FieldValue.delete()
    });
    toast('✓ Członek usunięty');
    renderMembers();
  }catch(e){toast('✗ Błąd: '+e.message);}
}

// ── APP SHOW ─────────────────────────────────────────────────────
function showApp(){
  document.getElementById('authOverlay').style.display='none';
  document.getElementById('teamSelectOverlay').style.display='none';
  const tb=document.getElementById('teamBar');tb.style.display='';
  document.getElementById('teamNameDisp').textContent='';
  document.getElementById('teamMemberDisp').textContent='👤 '+(teamSession.displayName||teamSession.login);
  applyRoleUI();
  const asVal=localStorage.getItem('sm_autosave');
  if(asVal==='0'){const cb=document.getElementById('chkAutoSave');if(cb)cb.checked=false;}
  loadTeamData();
  startRealtimeSync();
  if(canDo('manage_members'))renderMembers();
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
  _cachedStaleSchedules=d.staleSchedules||null;
  if(d.workers){
    workers=d.workers.map(w=>({...w,_open:false,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[]}));
    workers.forEach(w=>{cmode[w.id]=cmode[w.id]||'vac';});
  }
  wCtr=d.wCtr||workers.length;
  if(d.weModes)weModes=d.weModes;
  if(d.genSettings){
    const g=d.genSettings;
    const sm=document.getElementById('selShiftMode');if(sm)sm.value=g.shiftMode||'12h';
    const smd=document.getElementById('shiftModeDisp');if(smd)smd.textContent=(g.shiftMode==='8h')?'8h':'12/24h';
    const chkN=document.getElementById('chkN');if(chkN)chkN.checked=g.maxN!==false;
    const mnv=document.getElementById('maxNVal');if(mnv)mnv.value=g.maxNVal||3;
    const chkD=document.getElementById('chkD');if(chkD)chkD.checked=g.maxD!==false;
    const mdv=document.getElementById('maxDVal');if(mdv)mdv.value=g.maxDVal||3;
    const selT=document.getElementById('selT');if(selT)selT.value=g.tol!=null?g.tol:24;
    const mpd=document.getElementById('minPerDay');if(mpd)mpd.value=g.minPerDay||1;
    const selC=document.getElementById('selC');if(selC)selC.value=g.count||1;
    const mpdw=document.getElementById('minPerDayWrap');if(mpdw)mpdw.style.display=(g.shiftMode==='8h')?'':'none';
    const chk8w=document.getElementById('chk8hWe');if(chk8w)chk8w.checked=!!g.we8h;
    const chkMs=document.getElementById('chkMaxSun');if(chkMs)chkMs.checked=g.maxSun!==false;
    const msw=document.getElementById('maxSunWrap');if(msw)msw.style.display=g.we8h?'':'none';
    const wew=document.getElementById('weWrap8h');if(wew)wew.style.display=(g.shiftMode==='8h')?'':'none';
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
  renderPreFill();
  renderStaleNotice();
}

async function saveToFirestore(){
  if(!teamSession||!db)return;
  const ss=document.getElementById('syncStatus');
  ss.textContent='⟳ Zapis...';
  _skipSnap=true;
  try{
    const {y,m}=ym();const mk=y+'-'+m;
    const upd={
      workers:workers.map(w=>({id:w.id||null,name:w.name||null,color:w.color||null,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[],login:w.login||null,disabled:!!w.disabled})),
      wCtr,weModes,settings:{month:m,year:y},
      genSettings:{
        shiftMode:document.getElementById('selShiftMode').value,
        maxN:document.getElementById('chkN').checked,
        maxNVal:+document.getElementById('maxNVal').value||3,
        maxD:document.getElementById('chkD').checked,
        maxDVal:+document.getElementById('maxDVal').value||3,
        tol:+document.getElementById('selT').value,
        minPerDay:+document.getElementById('minPerDay').value||1,
        we8h:!!(document.getElementById('chk8hWe')&&document.getElementById('chk8hWe').checked),
        maxSun:!!(document.getElementById('chkMaxSun')&&document.getElementById('chkMaxSun').checked),
        count:+document.getElementById('selC').value
      }
    };
    if(schedules.length&&!_approvedViewActive){
      upd['pendingSchedules.'+mk]=schedules.map(s=>({shifts:s}));
      upd['schedMeta.'+mk]=window._schedMeta||null;
    }
    await db.collection('teams').doc(teamSession.teamId).update(JSON.parse(JSON.stringify(upd)));
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
      if(ap){
        const approverLogin=ap.approvedByLogin||null;
        const canRevoke=canDo('revoke')||(approverLogin&&approverLogin===teamSession.login);
        if(!ap.revoked&&!canRevoke){
          alert(`⚠ Grafik ${MONTHS[m]} ${y} jest już zatwierdzony przez ${ap.approvedBy}.\nTylko admin lub ta osoba może cofnąć zatwierdzenie.`);
          return;
        }
      }
    }
  }catch(e){console.error(e);}
  if(!confirm('Zatwierdź ten grafik? Będzie widoczny dla całego zespołu.'))return;
  const sched=schedules[idx];
  if(!sched){toast('✗ Brak grafiku do zatwierdzenia');return;}
  const ss=document.getElementById('syncStatus');
  ss.textContent='⟳ Zatwierdzanie...';
  try{
    const doc=await db.collection('teams').doc(teamSession.teamId).get();
    const data=doc.data();
    const prevAp=(data.approvedSchedules||{})[mk];
    const history=(data.scheduleHistory&&data.scheduleHistory[mk])||[];
    // If a previous version exists, move it to history
    if(prevAp){history.push(JSON.parse(JSON.stringify(prevAp)));}
    const ver=history.length+1;
    const upd={};
    upd['approvedSchedules.'+mk]={
      data:sched,version:ver,
      approvedBy:teamSession.displayName||teamSession.login||'unknown',
      approvedByLogin:teamSession.login||null,
      approvedAt:new Date().toISOString(),
      workers:workers.map(w=>({id:w.id||null,name:w.name||null,color:w.color||null,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[]})),
      weModes:{...weModes},month:m,year:y
    };
    upd['scheduleHistory.'+mk]=history;
    upd['pendingSchedules.'+mk]=null;upd['schedMeta.'+mk]=null;
    const cleanUpd=JSON.parse(JSON.stringify(upd));
    cleanUpd['staleSchedules.'+mk]=firebase.firestore.FieldValue.delete();
    await db.collection('teams').doc(teamSession.teamId).update(cleanUpd);
    toast(`✓ Grafik zatwierdzony (v${ver})!`);
    ss.textContent='✓ Zatwierdzono';
    schedules=[];_scheduleStale=null;renderStaleNotice();
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
    upd['approvedSchedules.'+mk+'.revokedBy']=teamSession.displayName||teamSession.login||'unknown';
    upd['approvedSchedules.'+mk+'.revokedByLogin']=teamSession.login||null;
    upd['approvedSchedules.'+mk+'.revokedAt']=new Date().toISOString();
    if(ap&&ap.data){
      upd['pendingSchedules.'+mk]=[{shifts:ap.data}];
    }
    await db.collection('teams').doc(teamSession.teamId).update(JSON.parse(JSON.stringify(upd)));
    _hideApprovedSchedule();
    toast(`✓ Zatwierdzenie v${ver} cofnięte (grafik przywrócony)`);loadTeamData();
  }catch(e){console.error(e);}
}

function updateGenBtn(){
  const btn=document.getElementById('genBtn');
  if(!btn)return;
  const {y,m}=ym();const mk=y+'-'+m;
  const wasApproved=_cachedAppSch&&_cachedAppSch[mk];
  const isLocked=wasApproved&&!wasApproved.revoked;
  btn.disabled=!!isLocked;
  btn.title=isLocked?`Grafik ${MONTHS[m]} ${y} jest zatwierdzony — generowanie nowego grafiku jest zablokowane.`:'';
}

function renderApprovedBanner(appSch){
  updateGenBtn();
  renderPreFill();
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
    const isApprover=teamSession&&(canDo('revoke')||(ap.approvedByLogin&&ap.approvedByLogin===teamSession.login));
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

  // Older versions from history
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
    const lkp={};sched.forEach(e=>{lkp[`${e.wid}_${e.date}`]=e;});
    const ROMAN=['I','II','III'];

    const hdr=`<div class="sched-hdr">${statusBadge}<span class="sched-meta">${MONTHS[am]} ${ay} · śr. ${avgH}h · ${sched.length} zmian · Zatwierdził: ${ap.approvedBy}</span></div>`;

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
    for(let d=1;d<=n;d++){const wd=dow(ay,am,d);thead+=`<th${wd===0||wd===6?' class="weh"':''}><div>${d}</div><div style="font-size:6px;opacity:.7">${DNS[wd]}</div></th>`;}
    thead+=`<th class="scol">Suma</th></tr></thead>`;

    let tbody='<tbody>';
    aWorkers.forEach(w=>{
      tbody+=`<tr><td class="wn"><span style="color:${w.color};margin-right:4px">●</span>${w.name}</td>`;
      let wt=0;
      for(let d=1;d<=n;d++){
        const date=dstr(ay,am,d);const wd=dow(ay,am,d);const we=wd===0||wd===6;
        const r=w.days[date];const ent=lkp[`${w.id}_${date}`];const type=ent?ent.type:undefined;
        let cls=we?'cwe':'';let lbl='';
        if(r==='vac'){if(we){cls='cuwe';lbl='U';}else{cls='cuwd';lbl='U';wt+=8;}}
        else if(r==='off'){cls='coff';lbl='—';}
        else if(type==='dzien'){const dh=ent.hours||12;cls='cd';lbl=ent.slot?ROMAN[ent.slot-1]:'D';wt+=dh;}
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
    workers=ap.workers.map(w=>({...w,_open:false,days:w.days||{},minDays:w.minDays||0,reqDays:w.reqDays||[]}));
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
   desc:'ShiftMaster to generator grafików zmianowych dla zespołów. Każdy członek wpisuje swoje urlopy i nieobecności, a lider generuje i zatwierdza gotowy grafik.\n\nTen tutorial przeprowadzi Cię przez wszystkie funkcje aplikacji.'},
  {icon:'🔐',title:'1. Konto użytkownika',
   desc:'Przy pierwszym uruchomieniu zarejestruj się podając:\n• <b>Login</b> — unikalny identyfikator (małe litery, cyfry, _)\n• <b>Wyświetlana nazwa</b> — imię i nazwisko widoczne w zespole\n• <b>Hasło</b> — min. 4 znaki\n\nPrzy kolejnych wejściach wystarczy login i hasło. Sesja jest zapamiętywana w przeglądarce.\n\nMożesz też kliknąć <b>„Tryb lokalny"</b> — dane zapisują się tylko u Ciebie.'},
  {icon:'👥',title:'2. Zespół — tworzenie i dołączanie',
   desc:'Po zalogowaniu wybierasz zespół:\n\n<b>Utwórz zespół</b> (zostajesz adminem) — podaj nazwę, hasło i tryb zmian (12/24h lub 8h biurowy). Udostępnij link 📋 współpracownikom.\n\n<b>Dołącz do zespołu</b> — wklej link lub ID zespołu i podaj hasło. Zostajesz automatycznie dodany do listy pracowników jako wpis w grafiku.\n\nOtwierając link zaproszenia po raz pierwszy, formularz dołączenia wypełni się automatycznie.'},
  {icon:'👑',title:'3. Role i uprawnienia',
   desc:'W zespole obowiązują trzy role:\n\n• <b style="color:var(--acc)">Admin</b> — pełny dostęp: dodaje/usuwa pracowników, generuje, zatwierdza, zarządza członkami i rolami\n• <b style="color:var(--green)">Edytor</b> — generuje grafik, edytuje dostępność wszystkich pracowników\n• <b style="color:var(--muted)">Pracownik</b> — wpisuje urlopy i nieobecności <b>tylko na swoim</b> wpisie, nie może generować\n\nAdmin zmienia role w zakładce <b>👑 Członkowie</b>.'},
  {icon:'📅',title:'4. Ustaw dostępność',
   desc:'W zakładce <b>👥 Pracownicy</b> rozwiń swoją kartę strzałką ▾.\n\nWybierz tryb oznaczania i klikaj dni kalendarza:\n• <b style="color:var(--purple)">🏖 Urlop</b> — Pn–Pt liczy +8h, weekend 0h\n• <b style="color:var(--gray)">🚫 Niedostępny</b> — brak zmian tego dnia\n• <b style="color:var(--yellow)">🌙 Bez dniówki</b> — dostaje tylko nocki\n• <b style="color:var(--orange)">☀ Bez nocki</b> — dostaje tylko dniówki\n• <b>✕ Wyczyść</b> — usuwa oznaczenie\n\nUrlopy i nieobecności wszystkich widoczne są w panelu <b>Dostępność</b> nad grafikiem.'},
  {icon:'⚙',title:'5. Opcje i tryb weekendów',
   desc:'Zakładka <b>⚙ Opcje</b> (widoczna dla admina i edytora) zawiera:\n\n<b>Tryb weekendów</b> — dla każdego weekendu:\n• <b style="color:#1a7fa8">24h</b> — jedna zmiana całodobowa\n• <b style="color:var(--green)">D+N</b> — dzień + noc po 12h\n• <b>Wolny</b> — brak zmian\n\n<b>Ustawienia generatora</b> — max nocki/dniówki z rzędu, liczba wariantów (1–10), tolerancja godzin.\n\n<b>Tryb zmian</b> ustawia się przy tworzeniu zespołu (12/24h lub 8h biurowy).'},
  {icon:'⚡',title:'6. Generuj grafik',
   desc:'Kliknij <b>„⚡ Generuj Grafik"</b> na dole panelu (admin lub edytor).\n\nAlgorytm automatycznie:\n• Uwzględnia urlopy i nieobecności\n• Wyrównuje godziny między pracownikami\n• Generuje kilka wariantów do wyboru\n\nJeśli po wygenerowaniu zmienisz dostępność kogoś z pracowników, pojawi się ostrzeżenie <b>⚠ Grafik może być nieaktualny</b> z przyciskiem szybkiego generowania.\n\nWyłączony pracownik (◉/⊘) nie jest uwzględniany w generowaniu.'},
  {icon:'✏️',title:'7. Edytuj ręcznie',
   desc:'Po wygenerowaniu kliknij <b>dowolną komórkę</b> w tabeli grafiku aby zmienić typ zmiany:\n• <b>D</b> — Dniówka 12h\n• <b>N</b> — Nocka 12h\n• <b>24h</b> — zmiana całodobowa\n• <b>U</b> — Urlop (+8h)\n• <b>—</b> — Niedostępny (0h)\n• (puste) — brak przypisania\n\nEdycja dostępna dla admina i edytora.'},
  {icon:'✅',title:'8. Zatwierdź grafik',
   desc:'Gdy grafik jest gotowy, kliknij <b>„✓ Zatwierdź"</b> przy wybranym wariancie (admin lub osoba która zatwierdziła).\n\nZatwierdzony grafik:\n• Wyświetla baner <b style="color:var(--green)">✅ Zatwierdzone</b> widoczny dla całego zespołu\n• Blokuje generowanie nowego do czasu cofnięcia\n• Można pobrać jako Excel\n• Można cofnąć przyciskiem <b>✕ Cofnij</b>'},
  {icon:'📊',title:'9. Eksportuj do Excel',
   desc:'Kliknij <b>„⬇ Excel"</b> przy dowolnym grafiku lub <b>„⬇ Eksportuj wszystkie"</b> na górze.\n\nPlik .xls zawiera kolorowe komórki, podsumowania godzin i kontrolę obsady na każdy dzień.\n\n<b style="color:var(--acc)">Gotowe! Powodzenia z grafikami! 🎉</b>\n\nW razie pytań lub błędów — kliknij <b>✉ Kontakt</b> w nagłówku.'}
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
    // Firebase not configured — local mode
    document.getElementById('authOverlay').style.display='none';
    ['Anna','Bartosz','Celina','Dawid'].forEach(n=>addW(n));
    buildWeModes();renderWEGrid();
    if(!localStorage.getItem('sm_tut_done'))showTutorial();
    return;
  }

  const hashTid=(window.location.hash.match(/team=([a-z0-9]+)/)||[])[1];

  // 1. Check user session (sm_user)
  const userRaw=localStorage.getItem('sm_user');
  if(userRaw){
    try{
      currentUser=JSON.parse(userRaw);
      // Validate user in Firestore
      const uDoc=await db.collection('users').doc(currentUser.login).get();
      if(uDoc.exists&&uDoc.data().passwordHash===currentUser.passwordHash){
        currentUser.teams=uDoc.data().teams||{};
        localStorage.setItem('sm_user',JSON.stringify(currentUser));
      } else {
        currentUser=null;localStorage.removeItem('sm_user');localStorage.removeItem('sm_team');
      }
    }catch(e){currentUser=null;localStorage.removeItem('sm_user');localStorage.removeItem('sm_team');}
  }

  // 2. If user is logged in — check active team (sm_team)
  if(currentUser){
    const teamRaw=localStorage.getItem('sm_team');
    if(teamRaw){
      try{
        const ts=JSON.parse(teamRaw);
        const tid=ts.teamId;
        // Check if user is still a member of this team
        if(currentUser.teams[tid]){
          // If URL points to a different team — enter that one
          if(hashTid&&hashTid!==tid&&currentUser.teams[hashTid]){
            await enterTeam(hashTid);return;
          }
          await enterTeam(tid);return;
        }
      }catch(e){}
      localStorage.removeItem('sm_team');
    }

    showTeamSelect();
  } else {
    // No user session — show auth overlay
  }

  // Backwards compatibility: old sm_session
  if(!currentUser){
    const oldSs=localStorage.getItem('sm_session');
    if(oldSs){
      // Old session — clear and show auth overlay
      localStorage.removeItem('sm_session');
    }
  }

  buildWeModes();renderWEGrid();
}
init();
