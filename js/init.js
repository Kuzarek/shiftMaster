// ── INICJALIZACJA APLIKACJI ────────────────────────────────────────
// Punkt wejściowy modułów ES. Inicjalizuje aplikację i eksponuje
// funkcje wywoływane z HTML (onclick) do globalnego scope (window.*).

import * as state from './state.js';
import { MONTHS, MSHORT, DNS, LOCAL_STORAGE_KEY } from './constants.js';
import {
  daysInMonth, dateString, dayOfWeek, isWorkday, getSelectedYearMonth,
  isHoliday, getHolidayName, fetchHolidays, isTeamDayOff, calculateVacationHours, toast,
} from './utils.js';
import { toggleTheme, applyStoredTheme } from './theme.js';
import {
  addWorker, deleteWorker, renderWorkers,
  toggleWorkerCard, toggleWorkerDisabled, toggleRequiredDay,
  setCalendarMode, calendarDayClick, canDo, canEditWorker,
} from './workers.js';
import { runGen } from './schedule/generator.js';
import { renderAll, renderSched, renderPreFill, renderStaleNotice, markStale, prevSchedule, nextSchedule } from './render/scheduleRenderer.js';
import { openCellMenu, applyCellType, initContextMenuCloseHandler } from './render/contextMenu.js';
import { exportPDF } from './export/pdfExport.js';
import { exportXL } from './export/excelExport.js';
import { initFirebase } from './firebase/auth.js';
import { doRegister, doLogin, doLogoutUser, showAuthTab } from './firebase/auth.js';
import {
  showTeamSelect, showTsCreate, showTsJoin,
  doCreateTeamNew, doJoinTeamNew, enterTeam, doLogout, copyTeamLink,
  showDelTeamModal, closeDelTeamModal, confirmDeleteTeam,
  renderMembers, changeMemberRole, removeMember,
} from './firebase/teams.js';
import {
  loadTeamData, saveToFirestore, autoSave,
  approveSchedule, removeApproval,
  renderApprovedBanner, showApprovedSchedule, exportApprovedXL,
  shiftModeStartEdit,
} from './sync/firestore.js';
import { toggleDebugMode, debugExport, debugImport } from './debug.js';
import {
  showTutorial, closeTutorial, tutorialNext, tutorialPrev,
} from './tutorial.js';

// ── LOKALNE UTILS (wymagane w kilku miejscach) ───────────────────
// Udostępniamy przez window._utils żeby moduły sync/firestore.js
// (showApprovedSchedule) mogły z nich korzystać bez re-importu.
window._utils = { daysInMonth, dateString, dayOfWeek, isWorkday, calculateVacationHours };
window._constants = { DNS, MONTHS };

// ── CONTACT MODAL ────────────────────────────────────────────────

function showContact(tab) {
  document.getElementById('contactModal').style.display = 'flex';
  showContactTab(tab || 'contact');
}
function hideContact() { document.getElementById('contactModal').style.display = 'none'; }
function showContactTab(tab) {
  document.getElementById('ctab-contact').style.display = tab === 'contact' ? '' : 'none';
  document.getElementById('ctab-changelog').style.display = tab === 'changelog' ? '' : 'none';
  document.querySelectorAll('#contactModal .ctab-btn').forEach((b, i) => {
    b.classList.toggle('active', (i === 0 ? 'contact' : 'changelog') === tab);
  });
}

// ── SIDEBAR MOBILE ───────────────────────────────────────────────

function togSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobOverlay');
  const closeBtn = document.getElementById('mobClose');
  const isOpen = sidebar.classList.toggle('open');
  overlay.style.display = isOpen ? 'block' : 'none';
  closeBtn.style.display = isOpen ? 'block' : 'none';
  document.body.style.overflow = isOpen ? 'hidden' : '';
}

// ── SAVE / LOAD (tryb lokalny) ───────────────────────────────────

function saveW() {
  if (state.teamSession && state.db) { saveToFirestore(); return; }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
      workers: state.workers.map(w => ({
        id: w.id, name: w.name, color: w.color,
        days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [],
      })),
      ctr: state.workerCounter,
      teamDaysOff: state.teamDaysOff,
    }));
    toast('✓ Zapisano ' + state.workers.length + ' pracowników');
  } catch (e) { toast('✗ Błąd zapisu'); }
}

function loadW() {
  if (state.teamSession && state.db) { loadTeamData(); return; }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) { toast('Brak danych'); return; }
    const data = JSON.parse(raw);
    state.setWorkers(data.workers.map(w => ({
      ...w, _open: false, days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [],
    })));
    state.setWorkerCounter(data.ctr || state.workers.length);
    if (data.teamDaysOff) state.setTeamDaysOff(data.teamDaysOff);
    state.workers.forEach(w => { state.calendarMode[w.id] = 'vac'; });
    const { y: ly, m: lm } = getSelectedYearMonth();
    updateTeamDaysOffBar(ly, lm);
    renderWorkers();
    toast('✓ Wczytano ' + state.workers.length + ' pracowników');
  } catch (e) { toast('✗ Błąd wczytywania'); }
}

function clearSave() { localStorage.removeItem(LOCAL_STORAGE_KEY); toast('✓ Wyczyszczono'); }

// ── SIDEBAR PANELS ───────────────────────────────────────────────

function showP(panelId, btn) {
  document.querySelectorAll('.spanel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
  btn.classList.add('active');
  if (panelId === 'pm') renderMembers();
}

// ── ZMIANA MIESIĄCA ──────────────────────────────────────────────

function onMC() {
  // Wyjdź z widoku zatwierdzonego gdy zmieniamy miesiąc
  if (state.approvedViewActive) {
    const ai = document.getElementById('archivedInner');
    if (ai) { ai.innerHTML = ''; ai.style.display = 'none'; }
    document.getElementById('mainInner').style.display = '';
    state.setApprovedViewActive(null);
  }
  state.setSchedules([]);
  window._schedMeta = null;
  buildWeModes();
  renderWorkers();
  renderWEGrid();
  document.getElementById('mainInner').innerHTML = '<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  renderApprovedBanner(state.cachedApprovedSchedules);

  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;
  updateHolidayBar(y, m);
  updateTeamDaysOffBar(y, m);

  if (!state.publicHolidays[y]) {
    fetchHolidays(y).then(() => { updateHolidayBar(y, m); renderWorkers(); });
  }

  // Pokaż zatwierdzony grafik dla nowego miesiąca (jeśli istnieje)
  const approved = state.cachedApprovedSchedules && state.cachedApprovedSchedules[monthKey];
  if (approved && !approved.revoked && state.teamSession && state.db) {
    showApprovedSchedule(monthKey, 'current');
  } else {
    const pending = state.cachedPendingSchedules && state.cachedPendingSchedules[monthKey];
    if (pending && pending.length && state.teamSession) {
      state.setSchedules(pending.map(s => s.shifts || s));
      window._schedMeta = (state.cachedScheduleMeta && state.cachedScheduleMeta[monthKey]) || null;
      if (window._schedMeta) {
        const { y: sy, m: sm, fallbackUsed, firstCount, split24Dates: s24d } = window._schedMeta;
        renderAll(sy, sm, fallbackUsed || false, firstCount || state.schedules.length, s24d || null);
      } else {
        document.getElementById('mainInner').innerHTML = '<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
      }
    } else {
      document.getElementById('mainInner').innerHTML = '<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
    }
  }
  renderStaleNotice();
}

// ── WEEKENDY ─────────────────────────────────────────────────────

export function buildWeModes() {
  const { y, m } = getSelectedYearMonth();
  const days = daysInMonth(y, m);
  const newModes = {};
  for (let d = 1; d <= days; d++) {
    if (dayOfWeek(y, m, d) === 6) {
      const date = dateString(y, m, d);
      newModes[date] = state.weekendModes[date] || '24h';
    }
  }
  state.setWeekendModes(newModes);
}

function setWEMode(date, mode) {
  state.weekendModes[date] = mode;
  renderWEGrid();
  autoSave();
}

export function renderWEGrid() {
  const { y, m } = getSelectedYearMonth();
  const days = daysInMonth(y, m);
  const grid = document.getElementById('wegrid');
  if (!grid) return;
  let html = '';
  for (let d = 1; d <= days; d++) {
    if (dayOfWeek(y, m, d) !== 6) continue;
    const date = dateString(y, m, d);
    const nextDay = d < days ? d + 1 : null;
    const mode = state.weekendModes[date] || '24h';
    html += `<div class="werow">
      <div class="wedate">${d}${nextDay ? '/' + nextDay : ''} ${MSHORT[m]} <span style="color:var(--muted2);font-size:7px">Sb${nextDay ? '/Nd' : ''}</span></div>
      <div class="webtns">
        <button class="webtn ${mode === '24h' ? 'a24' : ''}" onclick="setWEMode('${date}','24h')">24h</button>
        <button class="webtn ${mode === 'split' ? 'asp' : ''}" onclick="setWEMode('${date}','split')">D+N</button>
        <button class="webtn ${mode === 'wolny' ? 'awol' : ''}" onclick="setWEMode('${date}','wolny')">Wolny</button>
      </div>
    </div>`;
  }
  grid.innerHTML = html || '<p style="font-size:9px;color:var(--muted)">Brak weekendów</p>';
}

// ── ŚWIĘTA ───────────────────────────────────────────────────────

function setHolMode(date, val) { state.holidayModes[date] = val; }
function getHolMode(date) { return state.holidayModes[date] !== false; }

export function updateHolidayBar(y, m) {
  const section = document.getElementById('holSection');
  if (!section) return;
  const days = daysInMonth(y, m);
  const holidays = [];
  for (let d = 1; d <= days; d++) {
    const date = dateString(y, m, d);
    if (isHoliday(date)) holidays.push({ d, date, name: getHolidayName(date) });
  }
  if (!holidays.length) { section.innerHTML = ''; return; }
  const rows = holidays.map(h => {
    const checked = getHolMode(h.date);
    return `<label class="chkr"><input type="checkbox" ${checked ? 'checked' : ''} onchange="setHolMode('${h.date}',this.checked)"><span class="chkl">${h.d} ${MSHORT[m]} — ${h.name}</span></label>`;
  }).join('');
  section.innerHTML = `<div><div class="sec">Święta <span style="font-family:'Fira Code',monospace;font-size:8px;font-weight:400;color:var(--muted)">→ zmiana 24h</span></div><div style="display:flex;flex-direction:column;gap:4px">${rows}</div><div class="chkn" style="margin-top:3px">Odznacz aby traktować jako zwykły dzień roboczy</div></div>`;
}

// ── DNI WOLNE ZESPOŁU ────────────────────────────────────────────

function toggleTeamDayOff(date) {
  if (state.teamDaysOff[date]) delete state.teamDaysOff[date];
  else state.teamDaysOff[date] = true;
  const { y, m } = getSelectedYearMonth();
  updateTeamDaysOffBar(y, m);
  markStale();
  autoSave();
}

export function updateTeamDaysOffBar(y, m) {
  const section = document.getElementById('tdoSection');
  if (!section) return;
  const days = daysInMonth(y, m);
  const startOffset = (dayOfWeek(y, m, 1) + 6) % 7;
  const count = Object.keys(state.teamDaysOff).filter(d => {
    const [dy, dm] = d.split('-');
    return +dy === y && +dm === m;
  }).length;

  let grid = `<div class="calgrid">
    ${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map(x => `<div class="caldn">${x}</div>`).join('')}
    ${Array(startOffset).fill('<div class="cald emp"></div>').join('')}`;

  for (let d = 1; d <= days; d++) {
    const date = dateString(y, m, d);
    const weekday = dayOfWeek(y, m, d);
    const isWeekend = weekday === 0 || weekday === 6;
    const selected = isTeamDayOff(date);
    const holiday = isHoliday(date);
    let cls = isWeekend ? 'we' : '';
    if (holiday) cls += ' rhol';
    if (selected) cls += ' rtdo';
    grid += `<div class="cald ${cls}" onclick="toggleTeamDayOff('${date}')">${d}</div>`;
  }
  grid += '</div>';

  const arrow = state.teamDaysOffPanelOpen ? '▾' : '▸';
  section.innerHTML = `<div>
    <div class="sec tdo-toggle" onclick="toggleTeamDaysOffPanel()" style="cursor:pointer;user-select:none">
      ${arrow} Dni wolne zespołu <span style="font-family:'Fira Code',monospace;font-size:8px;font-weight:400;color:var(--muted)">${count ? count + ' zaznaczonych' : ''}</span>
    </div>
    ${state.teamDaysOffPanelOpen
      ? `<div style="margin-top:4px">${grid}</div>
         <div class="chkn" style="margin-top:3px">Kliknij dzień, aby oznaczyć jako wolny — grafik pominie te dni</div>`
      : ''}
  </div>`;
}

function toggleTeamDaysOffPanel() {
  state.setTeamDaysOffPanelOpen(!state.teamDaysOffPanelOpen);
  const { y, m } = getSelectedYearMonth();
  updateTeamDaysOffBar(y, m);
}

// ── TRYB LOKALNY ─────────────────────────────────────────────────

function startLocalMode() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('teamSelectOverlay').style.display = 'none';
  if (state.db) document.getElementById('localBar').style.display = '';
  const clearBtn = document.getElementById('clearBtn'); if (clearBtn) clearBtn.style.display = '';
  const loadBtn = document.getElementById('loadBtn'); if (loadBtn) loadBtn.style.display = '';
  ['Anna', 'Bartosz', 'Celina', 'Dawid'].forEach(n => addWorker(n));
  buildWeModes(); renderWEGrid();
  if (!localStorage.getItem('sm_tut_done')) showTutorial();
}

function returnToLogin() {
  state.setWorkers([]); state.setSchedules([]); state.setWeekendModes({});
  state.setTeamDaysOff({}); state.setWorkerCounter(0);
  document.getElementById('localBar').style.display = 'none';
  const clearBtn = document.getElementById('clearBtn'); if (clearBtn) clearBtn.style.display = 'none';
  const loadBtn = document.getElementById('loadBtn'); if (loadBtn) loadBtn.style.display = 'none';
  document.getElementById('approvedBanner').innerHTML = '';
  document.getElementById('mainInner').innerHTML = '<div class="empty"><div class="empty-icon">📅</div><h2>Brak grafiku</h2><p>Skonfiguruj pracowników, oznacz urlopy i kliknij „Generuj Grafik"</p></div>';
  document.getElementById('wlist').innerHTML = '';
  if (state.currentUser) { showTeamSelect(); }
  else { document.getElementById('authOverlay').style.display = ''; }
  buildWeModes(); renderWEGrid();
}

// ── PREFILL HIDE TOGGLE ──────────────────────────────────────────

function setPrefillHideEmpty(val) {
  state.setPrefillHideEmpty(val);
  renderPreFill();
}

function setPrefillCollapsed(val) {
  state.setPrefillCollapsed(val);
  renderPreFill();
}

// ── INIT ─────────────────────────────────────────────────────────

async function init() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  document.getElementById('selM').value = nextMonth.getMonth() + 1;
  document.getElementById('selY').value = nextMonth.getFullYear();

  // Zastosuj motyw
  const storedTheme = applyStoredTheme();
  document.getElementById('thBtn').textContent = storedTheme === 'dark' ? '☀️' : '🌙';

  // Inicjalizacja Firebase
  const firebaseOk = initFirebase();
  if (!firebaseOk) {
    // Brak konfiguracji Firebase — uruchom tryb lokalny
    document.getElementById('authOverlay').style.display = 'none';
    ['Anna', 'Bartosz', 'Celina', 'Dawid'].forEach(n => addWorker(n));
    buildWeModes(); renderWEGrid();
    if (!localStorage.getItem('sm_tut_done')) showTutorial();
    return;
  }

  const hashTeamId = (window.location.hash.match(/team=([a-z0-9]+)/) || [])[1];

  // 1. Sprawdź sesję użytkownika (sm_user)
  const userRaw = localStorage.getItem('sm_user');
  if (userRaw) {
    try {
      state.setCurrentUser(JSON.parse(userRaw));
      const userDoc = await state.db.collection('users').doc(state.currentUser.login).get();
      if (userDoc.exists && userDoc.data().passwordHash === state.currentUser.passwordHash) {
        state.currentUser.teams = userDoc.data().teams || {};
        localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
      } else {
        state.setCurrentUser(null);
        localStorage.removeItem('sm_user');
        localStorage.removeItem('sm_team');
      }
    } catch (e) {
      state.setCurrentUser(null);
      localStorage.removeItem('sm_user');
      localStorage.removeItem('sm_team');
    }
  }

  // 2. Jeśli zalogowany — sprawdź aktywny zespół (sm_team)
  if (state.currentUser) {
    const teamRaw = localStorage.getItem('sm_team');
    if (teamRaw) {
      try {
        const teamStored = JSON.parse(teamRaw);
        const tid = teamStored.teamId;
        if (state.currentUser.teams[tid]) {
          // Jeśli URL wskazuje inny zespół — wejdź do tamtego
          if (hashTeamId && hashTeamId !== tid && state.currentUser.teams[hashTeamId]) {
            await enterTeam(hashTeamId); return;
          }
          await enterTeam(tid); return;
        }
      } catch (e) {}
      localStorage.removeItem('sm_team');
    }
    showTeamSelect();
  }
  // else: brak sesji — pokaż formularz logowania (domyślny stan HTML)

  // Backwards compatibility: stare sm_session
  if (!state.currentUser) {
    const oldSession = localStorage.getItem('sm_session');
    if (oldSession) localStorage.removeItem('sm_session');
  }

  buildWeModes(); renderWEGrid();
}

// ── INICJALIZACJA PRZED DOMContentLoaded ─────────────────────────
// (motyw jest już stosowany przez applyStoredTheme() powyżej)
applyStoredTheme();

// Po załadowaniu DOM
document.addEventListener('DOMContentLoaded', () => {
  const { y, m } = getSelectedYearMonth();
  fetchHolidays(y).then(() => {
    updateHolidayBar(y, m);
    updateTeamDaysOffBar(y, m);
    renderWorkers();
    renderPreFill();
  });

  const debugStored = localStorage.getItem('sm_debug');
  if (debugStored === '1') {
    const cb = document.getElementById('chkDebug');
    if (cb) { cb.checked = true; toggleDebugMode(true); }
  }

  initContextMenuCloseHandler();
});

// ── EKSPORTUJ FUNKCJE DO GLOBALNEGO SCOPE (wymagane przez onclick w HTML) ──

// Temat
window.togTheme = toggleTheme;

// Contact
window.showContact = showContact;
window.hideContact = hideContact;
window.showContactTab = showContactTab;

// Sidebar
window.togSidebar = togSidebar;
window.showP = showP;

// Save/load
window.saveW = saveW;
window.loadW = loadW;
window.clearSave = clearSave;

// Miesiąc i weekendy
window.onMC = onMC;
window.setWEMode = setWEMode;

// Święta
window.setHolMode = setHolMode;

// Dni wolne zespołu
window.toggleTeamDayOff = toggleTeamDayOff;
window.toggleTeamDaysOffPanel = toggleTeamDaysOffPanel;

// Pracownicy
window.addW = addWorker;
window.deleteWorker = deleteWorker;
window.renderWorkers = renderWorkers;
window.togW = toggleWorkerCard;
window.togWDis = toggleWorkerDisabled;
window.togReqDay = toggleRequiredDay;
window.setCM = setCalendarMode;
window.calClick = calendarDayClick;
window.canDo = canDo;
window.canEditWorker = canEditWorker;
// Direct state access for workers (wymagane przez buildWorkerCard inline handlers)
window.workers = state.workers;
window.autoSave = autoSave;

// Generowanie
window.runGen = runGen;
window.renderAll = renderAll;
window.renderSched = renderSched;

// Nawigacja między grafikami
window.prevSchedule = prevSchedule;
window.nextSchedule = nextSchedule;

// Menu kontekstowe
window.openCellMenu = openCellMenu;
window.applyCellType = applyCellType;

// Eksport
window.exportPDF = exportPDF;
window.exportXL = exportXL;

// Stale notice
window.renderStaleNotice = renderStaleNotice;

// Prefill
window.renderPreFill = renderPreFill;
window.setPrefillHideEmpty = setPrefillHideEmpty;
window.setPrefillCollapsed = setPrefillCollapsed;

// Debug
window.toggleDebugMode = toggleDebugMode;
window.debugExport = debugExport;
window.debugImport = debugImport;

// Tutorial
window.showTutorial = showTutorial;
window.closeTutorial = closeTutorial;
window.tutNext = tutorialNext;
window.tutPrev = tutorialPrev;

// Firebase auth
window.showAuthTab = showAuthTab;
window.doRegister = doRegister;
window.doLogin = doLogin;
window.doLogoutUser = doLogoutUser;

// Zespoły
window.showTeamSelect = showTeamSelect;
window.showTsCreate = showTsCreate;
window.showTsJoin = showTsJoin;
window.doCreateTeamNew = doCreateTeamNew;
window.doJoinTeamNew = doJoinTeamNew;
window.enterTeam = enterTeam;
window.doLogout = doLogout;
window.copyTeamLink = copyTeamLink;
window.showDelTeamModal = showDelTeamModal;
window.closeDelTeamModal = closeDelTeamModal;
window.confirmDeleteTeam = confirmDeleteTeam;
window.renderMembers = renderMembers;
window.changeMemberRole = changeMemberRole;
window.removeMember = removeMember;

// Zatwierdzanie grafiku
window.approveSchedule = approveSchedule;
window.removeApproval = removeApproval;
window.showApprovedSchedule = showApprovedSchedule;
window.exportApprovedXL = exportApprovedXL;

// Tryb zmian (edit button)
window.shiftModeStartEdit = shiftModeStartEdit;

// Tryb lokalny
window.startLocalMode = startLocalMode;
window.returnToLogin = returnToLogin;

// buildWeModes i inne eksportowane z init.js (używane przez inne moduły)
window.buildWeModes = buildWeModes;
window.renderWEGrid = renderWEGrid;
window.updateHolidayBar = updateHolidayBar;
window.updateTeamDaysOffBar = updateTeamDaysOffBar;

// Uruchom aplikację
init();
