// ── WORKERS — zarządzanie pracownikami ─────────────────────────────
import { COLORS, MONTHS, MSHORT } from './constants.js';
import * as state from './state.js';
import {
  daysInMonth, dateString, dayOfWeek, isWorkday,
  getSelectedYearMonth, isHoliday, getHolidayName, isTeamDayOff, toast,
} from './utils.js';
import { autoSave } from './sync/firestore.js';
import { renderPreFill, markStale } from './render/scheduleRenderer.js';

// ── DODAJ / USUŃ ───────────────────────────────────────────────────

export function addWorker(name) {
  const id = state.workerCounter;
  state.setWorkerCounter(state.workerCounter + 1);
  state.workers.push({
    id,
    name: name || `Pracownik ${id + 1}`,
    color: COLORS[state.workers.length % COLORS.length],
    _open: false,
    days: {},
    minDays: 0,
    reqDays: [],
    login: null,
    disabled: false,
  });
  state.calendarMode[id] = 'vac';
  renderWorkers();
  autoSave();
}

export function deleteWorker(id) {
  state.setWorkers(state.workers.filter(w => w.id !== id));
  renderWorkers();
  autoSave();
}

// ── RENDER LISTY PRACOWNIKÓW ───────────────────────────────────────

export function renderWorkers() {
  const { y, m } = getSelectedYearMonth();
  const list = document.getElementById('wlist');
  list.innerHTML = '';

  state.workers.forEach(worker => {
    const div = document.createElement('div');
    div.className =
      'wcard' +
      (worker._open ? ' exp' : '') +
      (worker.disabled && state.teamSession ? ' wdis' : '');
    div.id = 'wc' + worker.id;
    div.dataset.wid = worker.id;
    div.draggable = false; // włączane tylko przez uchwyt drag

    div.innerHTML = buildWorkerCard(worker, y, m);
    div.addEventListener('dragstart', onWorkerDragStart);
    div.addEventListener('dragover', onWorkerDragOver);
    div.addEventListener('dragleave', onWorkerDragLeave);
    div.addEventListener('drop', onWorkerDrop);
    div.addEventListener('dragend', onWorkerDragEnd);
    list.appendChild(div);

    // Drag inicjowany tylko przez uchwyt
    const handle = div.querySelector('.wdrag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => { div.draggable = true; });
      handle.addEventListener('mouseup', () => { div.draggable = false; });
    }
  });
}

// ── BUDOWANIE HTML KARTY PRACOWNIKA ───────────────────────────────

export function buildWorkerCard(worker, year, month) {
  const annotationCount = Object.keys(worker.days).length;
  const badges = annotationCount
    ? `<span class="wbadge bc">${annotationCount}×</span>`
    : '';
  const body = worker._open
    ? `<div class="wbody">${buildWorkerOptions(worker)}${buildWorkerCalendar(worker, year, month)}</div>`
    : '';
  const initials = worker.name.trim().split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  const hex = worker.color;
  const canEdit = canEditWorker(worker);
  const isAdmin = !state.teamSession || state.teamSession.role === 'admin';
  const disableBtn = (state.teamSession && canDo('generate'))
    ? `<button class="wdisbtn${worker.disabled ? ' dis' : ''}" onclick="togWDis(${worker.id})" title="${worker.disabled ? 'Włącz do grafiku' : 'Wyklucz z grafiku'}">${worker.disabled ? '⊘' : '◉'}</button>`
    : '';
  const deleteBtn = isAdmin
    ? `<button class="wdel" onclick="deleteWorker(${worker.id})">×</button>`
    : '';

  return `<div class="whead">
    <div class="wdrag-handle" title="Przeciągnij aby zmienić kolejność">⠿</div>
    <div class="wavatar" style="background:${hex}22;border:1.5px solid ${hex}88;color:${hex}">${initials}</div>
    ${canEdit
      ? `<input class="wname" value="${worker.name}" oninput="workers.find(x=>x.id===${worker.id}).name=this.value;autoSave()" placeholder="Imię">`
      : `<span class="wname" style="cursor:default;color:var(--text2)">${worker.name}</span>`}
    <div class="wbadges">${badges}</div>
    ${disableBtn}<button class="warr${worker._open ? ' op' : ''}" onclick="togW(${worker.id})">▾</button>
    ${deleteBtn}
  </div>${body}`;
}

function buildWorkerOptions(worker) {
  const minDaysValue = worker.minDays || 0;
  const requiredDays = worker.reqDays || [];
  const WEEKDAY_NAMES = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt'];
  const canEdit = canEditWorker(worker);

  const dayCheckboxes = WEEKDAY_NAMES.map((dayName, i) => {
    const weekdayNumber = i + 1; // 1=Pon..5=Pt
    const checked = requiredDays.includes(weekdayNumber) ? 'checked' : '';
    return `<label style="display:flex;align-items:center;gap:2px;cursor:${canEdit ? 'pointer' : 'default'};font-family:'Fira Code',monospace;font-size:10px;color:var(--text2)">
      <input type="checkbox" ${checked} ${canEdit ? '' : 'disabled'} style="width:12px;height:12px;accent-color:var(--acc)"
        ${canEdit ? `onchange="togReqDay(${worker.id},${weekdayNumber},this.checked)"` : ''}>${dayName}</label>`;
  }).join('');

  return `<div class="wopts">
    <div style="display:flex;align-items:center;gap:8px">
      <span class="chkl" style="flex:1">Min. dniówek Pn–Pt / tydzień</span>
      <select style="width:50px" ${canEdit ? `onchange="workers.find(x=>x.id===${worker.id}).minDays=+this.value;renderWorkers();autoSave()"` : ''} ${canEdit ? '' : 'disabled'}>
        ${[0,1,2,3,4,5].map(v => `<option value="${v}"${minDaysValue === v ? ' selected' : ''}>${v}</option>`).join('')}
      </select>
    </div>
    ${minDaysValue > 0
      ? `<div style="display:flex;gap:6px;margin-top:4px;align-items:center;flex-wrap:wrap">
          <span style="font-size:9px;color:var(--muted);font-family:'Fira Code',monospace">Obowiązkowe:</span>
          ${dayCheckboxes}
        </div>
        <div class="chkn">Zaznaczone dni = obowiązkowa dniówka. Reszta min. ${minDaysValue} wypełniona dowolnie.</div>`
      : `<div class="chkn">Algorytm priorytetowo przydzieli min. tyle dniówek tygodniowo (0 = wył.)</div>`}
  </div>`;
}

// ── MINI-KALENDARZ ─────────────────────────────────────────────────

// Opisy trybów oznaczania komórek kalendarza
const CALENDAR_MODE_INFO = {
  vac:      { label: '🏖 Urlop',        hint: 'Urlop: Pn-Pt +8h; weekend 0h. Kliknij ponownie = odznacz' },
  off:      { label: '🚫 Niedostępny',  hint: 'Niedostępny: nie można przypisać żadnej zmiany, 0h' },
  'no-d':   { label: '🌙 Bez dniówki',  hint: 'Blokada dniówki — pracownik może dostać tylko nocki. Kliknij ponownie = odznacz' },
  'no-n':   { label: '☀ Bez nocki',    hint: 'Blokada nocki — pracownik może dostać tylko dniówki. Kliknij ponownie = odznacz' },
  clr:      { label: '✕ Wyczyść',      hint: 'Usuwa oznaczenie klikniętego dnia' },
};

function buildWorkerCalendar(worker, year, month) {
  const days = daysInMonth(year, month);
  // Offset: ile pustych komórek przed 1-szym dniem miesiąca (Pn=0, Sb=5, Nd=6)
  const startOffset = (dayOfWeek(year, month, 1) + 6) % 7;
  const currentMode = state.calendarMode[worker.id] || 'vac';
  const annotationCount = Object.keys(worker.days).length;
  const canEdit = canEditWorker(worker);

  const modeButtons = canEdit
    ? Object.entries(CALENDAR_MODE_INFO).map(([key, info]) =>
        `<button class="cmbtn${currentMode === key ? ' on-' + key : ''}" onclick="setCM(${worker.id},'${key}')">${info.label}</button>`
      ).join('')
    : '';

  let grid = `<div class="calgrid">
    ${['Pn','Wt','Śr','Cz','Pt','Sb','Nd'].map(d => `<div class="caldn">${d}</div>`).join('')}
    ${Array(startOffset).fill('<div class="cald emp"></div>').join('')}`;

  for (let d = 1; d <= days; d++) {
    const date = dateString(year, month, d);
    const weekday = dayOfWeek(year, month, d);
    const isWeekend = weekday === 0 || weekday === 6;
    const annotation = worker.days[date];
    const holiday = isHoliday(date);
    const teamOff = isTeamDayOff(date);

    let cellClass = isWeekend ? 'we' : '';
    if (holiday) cellClass += ' rhol';
    if (teamOff) cellClass += ' rtdo';
    if (annotation === 'vac') cellClass += isWeekend ? ' rvw' : ' rv';
    else if (annotation === 'off') cellClass += ' roff';
    else if (annotation === 'no-d') cellClass += ' rnd';
    else if (annotation === 'no-n') cellClass += ' rnn';
    else if (annotation === 'no-both') cellClass += ' rnb';

    const holidayTitle = holiday ? ` title="${getHolidayName(date)}"` : '';
    grid += `<div class="cald ${cellClass}"${holidayTitle} onclick="calClick(${worker.id},'${date}')">${d}</div>`;
  }
  grid += '</div>';

  return `${canEdit
    ? `<div class="cmodes">${modeButtons}</div><div class="mhint">${CALENDAR_MODE_INFO[currentMode].hint}</div>`
    : ''}
  <div class="calhead">
    <span class="caltit">${MONTHS[month]} ${year}</span>
    <span class="calcnt">${annotationCount} oznaczeń</span>
  </div>
  ${grid}
  <div class="calleg">
    <div class="cli"><div class="clidot" style="background:var(--purple-bg);border-color:var(--purple)"></div>Urlop Pn-Pt</div>
    <div class="cli"><div class="clidot" style="background:var(--blue-bg);border-color:var(--blue)"></div>Urlop Sb-Nd</div>
    <div class="cli"><div class="clidot" style="background:var(--gray-bg);border-color:var(--gray)"></div>Niedostępny</div>
    <div class="cli"><div class="clidot" style="background:var(--yellow-bg);border-color:var(--yellow)"></div>Bez dniówki</div>
    <div class="cli"><div class="clidot" style="background:var(--orange-bg);border-color:var(--orange)"></div>Bez nocki</div>
    <div class="cli"><div class="clidot rhol-dot"></div>Święto</div>
    <div class="cli"><div class="clidot rtdo-dot"></div>Wolne zespołu</div>
  </div>`;
}

// ── INTERAKCJE KALENDARZA ─────────────────────────────────────────

export function setCalendarMode(workerId, mode) {
  const worker = state.workers.find(w => w.id === workerId);
  if (!worker || !canEditWorker(worker)) return;
  state.calendarMode[workerId] = mode;
  if (worker._open) {
    const { y, m } = getSelectedYearMonth();
    document.getElementById('wc' + workerId).innerHTML = buildWorkerCard(worker, y, m);
  }
}

export function calendarDayClick(workerId, date) {
  const worker = state.workers.find(w => w.id === workerId);
  if (!worker || !canEditWorker(worker)) return;
  const mode = state.calendarMode[workerId] || 'vac';
  const current = worker.days[date];

  if (mode === 'clr') {
    delete worker.days[date];
  } else if (mode === 'vac') {
    current === 'vac' ? delete worker.days[date] : (worker.days[date] = 'vac');
  } else if (mode === 'off') {
    current === 'off' ? delete worker.days[date] : (worker.days[date] = 'off');
  } else if (mode === 'no-d') {
    if (current === 'no-d') delete worker.days[date];
    else if (current === 'no-n') worker.days[date] = 'no-both';
    else if (current === 'no-both') worker.days[date] = 'no-n';
    else worker.days[date] = 'no-d';
  } else if (mode === 'no-n') {
    if (current === 'no-n') delete worker.days[date];
    else if (current === 'no-d') worker.days[date] = 'no-both';
    else if (current === 'no-both') worker.days[date] = 'no-d';
    else worker.days[date] = 'no-n';
  }

  const { y, m } = getSelectedYearMonth();
  document.getElementById('wc' + workerId).innerHTML = buildWorkerCard(worker, y, m);
  renderPreFill();
  markStale();
  autoSave();
}

// ── TOGGLE ROZWINIĘCIA KARTY ─────────────────────────────────────

export function toggleWorkerCard(id) {
  const worker = state.workers.find(w => w.id === id);
  if (!worker) return;
  worker._open = !worker._open;
  const { y, m } = getSelectedYearMonth();
  const card = document.getElementById('wc' + id);
  card.className =
    'wcard' +
    (worker._open ? ' exp' : '') +
    (worker.disabled && state.teamSession ? ' wdis' : '');
  card.innerHTML = buildWorkerCard(worker, y, m);
}

// ── TOGGLE WYŁĄCZENIA PRACOWNIKA Z GRAFIKU ─────────────────────────

export function toggleWorkerDisabled(id) {
  if (!canDo('generate')) return;
  const worker = state.workers.find(w => w.id === id);
  if (!worker) return;
  worker.disabled = !worker.disabled;
  renderWorkers();
  renderPreFill();
  markStale();
  autoSave();
}

// ── WYMAGANE DNI TYGODNIA ─────────────────────────────────────────

export function toggleRequiredDay(workerId, weekday, checked) {
  const worker = state.workers.find(w => w.id === workerId);
  if (!worker) return;
  if (!worker.reqDays) worker.reqDays = [];
  if (checked) {
    if (!worker.reqDays.includes(weekday)) worker.reqDays.push(weekday);
  } else {
    worker.reqDays = worker.reqDays.filter(d => d !== weekday);
  }
  worker.reqDays.sort();
  markStale();
  autoSave();
}

// ── DRAG & DROP PRACOWNIKÓW ───────────────────────────────────────

let dragSourceWorkerId = null;

function onWorkerDragStart(e) {
  dragSourceWorkerId = +this.dataset.wid;
  this.classList.add('wdrag-src');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', this.dataset.wid);
}

function onWorkerDragOver(e) {
  if (dragSourceWorkerId === null || +this.dataset.wid === dragSourceWorkerId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('wdrag-over');
}

function onWorkerDragLeave(e) {
  if (!e.relatedTarget || !this.contains(e.relatedTarget)) {
    this.classList.remove('wdrag-over');
  }
}

function onWorkerDrop(e) {
  e.preventDefault();
  this.classList.remove('wdrag-over');
  const targetIndex = state.workers.findIndex(w => w.id === +this.dataset.wid);
  const sourceIndex = state.workers.findIndex(w => w.id === dragSourceWorkerId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [moved] = state.workers.splice(sourceIndex, 1);
  state.workers.splice(targetIndex, 0, moved);
  renderWorkers();
  renderPreFill();
  autoSave();
}

function onWorkerDragEnd() {
  dragSourceWorkerId = null;
  document.querySelectorAll('.wcard').forEach(el => {
    el.classList.remove('wdrag-src', 'wdrag-over');
    el.draggable = false;
  });
}

// ── UPRAWNIENIA ────────────────────────────────────────────────────

export function canDo(action) {
  if (!state.teamSession) return true; // tryb lokalny = pełny dostęp
  const role = state.teamSession.role || 'worker';
  const permissions = {
    admin:  ['generate', 'edit', 'approve', 'revoke', 'manage_members', 'manage_workers', 'export'],
    editor: ['generate', 'edit', 'manage_workers', 'export'],
    worker: ['view', 'export'],
  };
  return !!(permissions[role] && permissions[role].includes(action));
}

export function canEditWorker(worker) {
  if (!state.teamSession) return true;
  if (state.teamSession.role === 'admin' || state.teamSession.role === 'editor') return true;
  return worker.login === state.teamSession.login;
}
