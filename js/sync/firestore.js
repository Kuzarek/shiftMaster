// ── SYNCHRONIZACJA Z FIRESTORE ─────────────────────────────────────
// Ładowanie, zapisywanie i nasłuchiwanie zmian w danych zespołu.
import * as state from '../state.js';
import { MONTHS } from '../constants.js';
import { getSelectedYearMonth, fetchHolidays, toast } from '../utils.js';
import { renderWorkers, canDo } from '../workers.js';
import { renderAll, renderSched, renderPreFill, renderStaleNotice } from '../render/scheduleRenderer.js';
import { renderMembers } from '../firebase/teams.js';

// ── WCZYTYWANIE DANYCH ZESPOŁU ─────────────────────────────────────

export async function loadTeamData() {
  if (!state.teamSession || !state.db) return;
  const syncStatus = document.getElementById('syncStatus');
  syncStatus.textContent = '⟳ Ładowanie...';
  try {
    const doc = await state.db.collection('teams').doc(state.teamSession.teamId).get();
    if (!doc.exists) { syncStatus.textContent = '✗ Brak danych'; return; }
    const data = doc.data();
    document.getElementById('teamNameDisp').textContent = '🏢 ' + (data.name || state.teamSession.teamId);
    applyTeamData(data);
    syncStatus.textContent = '✓ Zsynchronizowano';
    setTimeout(() => { if (syncStatus.textContent === '✓ Zsynchronizowano') syncStatus.textContent = ''; }, 2000);
  } catch (e) {
    syncStatus.textContent = '✗ Błąd'; console.error(e);
  }
}

// ── APLIKOWANIE DANYCH ZESPOŁU DO STANU ──────────────────────────

export function applyTeamData(data) {
  state.setCachedApprovedSchedules(data.approvedSchedules || null);
  state.setCachedPendingSchedules(data.pendingSchedules || null);
  state.setCachedScheduleMeta(data.schedMeta || null);
  state.setCachedScheduleHistory(data.scheduleHistory || null);
  state.setCachedStaleSchedules(data.staleSchedules || null);

  if (data.workers) {
    state.setWorkers(data.workers.map(w => ({
      ...w, _open: false, days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [],
    })));
    state.workers.forEach(w => { state.calendarMode[w.id] = state.calendarMode[w.id] || 'vac'; });
  }

  state.setWorkerCounter(data.wCtr || state.workers.length);
  if (data.weModes) state.setWeekendModes(data.weModes);
  if (data.teamDaysOff) state.setTeamDaysOff(data.teamDaysOff);

  // Zastosuj ustawienia generatora z Firestore do UI
  if (data.genSettings) {
    const g = data.genSettings;
    const sm = document.getElementById('selShiftMode'); if (sm) sm.value = g.shiftMode || '12h';
    const smd = document.getElementById('shiftModeDisp'); if (smd) smd.textContent = g.shiftMode === '8h' ? '8h' : '12/24h';
    const chkN = document.getElementById('chkN'); if (chkN) chkN.checked = g.maxN !== false;
    const mnv = document.getElementById('maxNVal'); if (mnv) mnv.value = g.maxNVal || 3;
    const chkD = document.getElementById('chkD'); if (chkD) chkD.checked = g.maxD !== false;
    const mdv = document.getElementById('maxDVal'); if (mdv) mdv.value = g.maxDVal || 3;
    const selT = document.getElementById('selT'); if (selT) selT.value = g.tol != null ? g.tol : 24;
    const mpd = document.getElementById('minPerDay'); if (mpd) mpd.value = g.minPerDay || 1;
    const mpdw = document.getElementById('minPerDayWrap'); if (mpdw) mpdw.style.display = g.shiftMode === '8h' ? '' : 'none';
    const chk8w = document.getElementById('chk8hWe'); if (chk8w) chk8w.checked = !!g.we8h;
    const chkMs = document.getElementById('chkMaxSun'); if (chkMs) chkMs.checked = g.maxSun !== false;
    const msw = document.getElementById('maxSunWrap'); if (msw) msw.style.display = g.we8h ? '' : 'none';
    const wew = document.getElementById('weWrap8h'); if (wew) wew.style.display = g.shiftMode === '8h' ? '' : 'none';
    const chk24 = document.getElementById('chkMax24');
    if (chk24) { chk24.checked = !!g.max24; document.getElementById('max24Wrap').style.display = g.max24 ? '' : 'none'; }
    const m24v = document.getElementById('max24Val'); if (m24v) m24v.value = g.max24Val || 4;
  }

  const { y: cy, m: cm } = getSelectedYearMonth();
  const monthKey = cy + '-' + cm;
  const currentApproved = data.approvedSchedules && data.approvedSchedules[monthKey] && !data.approvedSchedules[monthKey].revoked;

  if (currentApproved) {
    state.setSchedules([]);
    window._schedMeta = null;
    buildWeModes(); renderWorkers(); renderWEGrid();
    document.getElementById('mainInner').innerHTML = '';
  } else {
    const pendingSchedules = data.pendingSchedules && data.pendingSchedules[monthKey];
    if (pendingSchedules && pendingSchedules.length) {
      state.setSchedules(pendingSchedules.map(s => s.shifts || s));
      window._schedMeta = (data.schedMeta && data.schedMeta[monthKey]) || null;
    }
    buildWeModes(); renderWorkers(); renderWEGrid();
    if (pendingSchedules && pendingSchedules.length && window._schedMeta) {
      const { y, m, fallbackUsed, firstCount, split24Dates: s24d } = window._schedMeta;
      renderAll(y, m, fallbackUsed || false, firstCount || state.schedules.length, s24d || null);
    } else if (pendingSchedules && pendingSchedules.length) {
      renderAll(cy, cm, false, state.schedules.length);
    }
  }

  renderApprovedBanner(data.approvedSchedules);
  renderPreFill();
  renderStaleNotice();

  const { y: hy, m: hm } = getSelectedYearMonth();
  fetchHolidays(hy).then(() => { updateHolidayBar(hy, hm); renderPreFill(); });
  updateHolidayBar(hy, hm);
  updateTeamDaysOffBar(hy, hm);
}

// ── ZAPIS DO FIRESTORE ────────────────────────────────────────────

export async function saveToFirestore() {
  if (!state.teamSession || !state.db) return;
  const syncStatus = document.getElementById('syncStatus');
  syncStatus.textContent = '⟳ Zapis...';
  state.setSkipNextSnapshot(true);

  try {
    const { y, m } = getSelectedYearMonth();
    const monthKey = y + '-' + m;
    const update = {
      workers: state.workers.map(w => ({
        id: w.id || null, name: w.name || null, color: w.color || null,
        days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [],
        login: w.login || null, disabled: !!w.disabled,
      })),
      wCtr: state.workerCounter,
      weModes: state.weekendModes,
      teamDaysOff: state.teamDaysOff,
      settings: { month: m, year: y },
      genSettings: {
        shiftMode: document.getElementById('selShiftMode').value,
        maxN: document.getElementById('chkN').checked,
        maxNVal: +document.getElementById('maxNVal').value || 3,
        maxD: document.getElementById('chkD').checked,
        maxDVal: +document.getElementById('maxDVal').value || 3,
        tol: +document.getElementById('selT').value,
        minPerDay: +document.getElementById('minPerDay').value || 1,
        we8h: !!(document.getElementById('chk8hWe') && document.getElementById('chk8hWe').checked),
        maxSun: !!(document.getElementById('chkMaxSun') && document.getElementById('chkMaxSun').checked),
        max24: !!(document.getElementById('chkMax24') && document.getElementById('chkMax24').checked),
        max24Val: +(document.getElementById('max24Val') && document.getElementById('max24Val').value) || 4,
      },
    };

    if (state.schedules.length && !state.approvedViewActive) {
      update['pendingSchedules.' + monthKey] = state.schedules.map(s => ({ shifts: s }));
      update['schedMeta.' + monthKey] = window._schedMeta || null;
    }

    await state.db.collection('teams').doc(state.teamSession.teamId).update(JSON.parse(JSON.stringify(update)));

    if (state.schedules.length && !state.approvedViewActive) {
      if (!state.cachedPendingSchedules) state.setCachedPendingSchedules({});
      state.cachedPendingSchedules[monthKey] = state.schedules.map(s => ({ shifts: s }));
      if (!state.cachedScheduleMeta) state.setCachedScheduleMeta({});
      state.cachedScheduleMeta[monthKey] = window._schedMeta || null;
    }

    syncStatus.textContent = '✓ Zapisano';
    setTimeout(() => { if (syncStatus.textContent === '✓ Zapisano') syncStatus.textContent = ''; }, 2000);
  } catch (e) {
    syncStatus.textContent = '✗ Błąd zapisu';
    console.error(e);
    state.setSkipNextSnapshot(false);
  }
}

// ── AUTOZAPIS (debounce) ──────────────────────────────────────────

export function autoSave() {
  if (!state.teamSession) return;
  const autoSaveCheckbox = document.getElementById('chkAutoSave');
  if (autoSaveCheckbox && !autoSaveCheckbox.checked) return;
  clearTimeout(state.autoSaveTimer);
  state.setAutoSaveTimer(setTimeout(() => saveToFirestore(), 600));
}

// ── SYNCHRONIZACJA CZASU RZECZYWISTEGO ───────────────────────────

export function startRealtimeSync() {
  if (!state.teamSession || !state.db) return;
  if (state.unsubscribeFirestore) state.unsubscribeFirestore();

  const unsubscribe = state.db.collection('teams').doc(state.teamSession.teamId)
    .onSnapshot(doc => {
      if (!doc.exists) return;
      if (state.skipNextSnapshot) { state.setSkipNextSnapshot(false); return; }
      const data = doc.data();
      document.getElementById('teamNameDisp').textContent = '🏢 ' + (data.name || state.teamSession.teamId);
      applyTeamData(data);
      const syncStatus = document.getElementById('syncStatus');
      syncStatus.textContent = '⟳ Aktualizacja';
      setTimeout(() => { if (syncStatus.textContent === '⟳ Aktualizacja') syncStatus.textContent = ''; }, 1500);
    }, e => console.error('Sync error:', e));

  state.setUnsubscribeFirestore(unsubscribe);
}

// ── WYŚWIETLANIE APLIKACJI PO ZALOGOWANIU ─────────────────────────

export function showApp() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('teamSelectOverlay').style.display = 'none';
  const teamBar = document.getElementById('teamBar');
  teamBar.style.display = '';
  document.getElementById('teamNameDisp').textContent = '';
  document.getElementById('teamMemberDisp').textContent = '👤 ' + (state.teamSession.displayName || state.teamSession.login);

  applyRoleUI();

  const autoSaveValue = localStorage.getItem('sm_autosave');
  if (autoSaveValue === '0') {
    const cb = document.getElementById('chkAutoSave');
    if (cb) cb.checked = false;
  }

  loadTeamData();
  startRealtimeSync();
  if (canDo('manage_members')) renderMembers();
}

// ── UPRAWNIENIA UI ────────────────────────────────────────────────

function applyRoleUI() {
  const genBtn = document.getElementById('genBtn');
  if (genBtn && state.teamSession && !canDo('generate')) genBtn.style.display = 'none';

  const addWorkerBtn = document.querySelector('.addwbtn');
  if (addWorkerBtn) addWorkerBtn.style.display = (!state.teamSession || state.teamSession.role === 'admin') ? '' : 'none';

  const tabOptions = document.getElementById('tabOptions');
  if (tabOptions && state.teamSession) tabOptions.style.display = canDo('generate') ? '' : 'none';

  const tabMembers = document.getElementById('tabMembers');
  if (tabMembers) tabMembers.style.display = (state.teamSession && canDo('manage_members')) ? '' : 'none';

  const roleDisplay = document.getElementById('teamRoleDisp');
  if (roleDisplay && state.teamSession) {
    const ROLE_PL = { admin: 'admin', editor: 'edytor', worker: 'pracownik' };
    const role = state.teamSession.role || 'worker';
    roleDisplay.textContent = ROLE_PL[role];
    roleDisplay.className = 'trole ts-role-' + role;
  }

  // Tryb zmian: w trybie zespołu — tekst (admin może zmieniać)
  const shiftModeSelect = document.getElementById('selShiftMode');
  const shiftModeDisplay = document.getElementById('shiftModeDisp');
  const shiftModeChangeBtn = document.getElementById('shiftModeChgBtn');
  if (state.teamSession) {
    if (shiftModeSelect) shiftModeSelect.style.display = 'none';
    if (shiftModeDisplay) shiftModeDisplay.style.display = '';
    if (shiftModeChangeBtn) shiftModeChangeBtn.style.display = canDo('manage_members') ? '' : 'none';
  } else {
    if (shiftModeSelect) shiftModeSelect.style.display = '';
    if (shiftModeDisplay) shiftModeDisplay.style.display = 'none';
    if (shiftModeChangeBtn) shiftModeChangeBtn.style.display = 'none';
  }
}

export function shiftModeStartEdit() {
  const shiftModeSelect = document.getElementById('selShiftMode');
  const shiftModeDisplay = document.getElementById('shiftModeDisp');
  const shiftModeChangeBtn = document.getElementById('shiftModeChgBtn');
  if (shiftModeSelect) shiftModeSelect.style.display = '';
  if (shiftModeDisplay) shiftModeDisplay.style.display = 'none';
  if (shiftModeChangeBtn) shiftModeChangeBtn.style.display = 'none';
}

// ── ZATWIERDZANIE GRAFIKU ─────────────────────────────────────────

export async function approveSchedule(idx) {
  if (!state.teamSession || !state.db) return;
  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;

  try {
    const check = await state.db.collection('teams').doc(state.teamSession.teamId).get();
    if (check.exists) {
      const ap = (check.data().approvedSchedules || {})[monthKey];
      if (ap) {
        const approverLogin = ap.approvedByLogin || null;
        const canRevoke = canDo('revoke') || (approverLogin && approverLogin === state.teamSession.login);
        if (!ap.revoked && !canRevoke) {
          alert(`⚠ Grafik ${MONTHS[m]} ${y} jest już zatwierdzony przez ${ap.approvedBy}.\nTylko admin lub ta osoba może cofnąć zatwierdzenie.`);
          return;
        }
      }
    }
  } catch (e) { console.error(e); }

  if (!confirm('Zatwierdź ten grafik? Będzie widoczny dla całego zespołu.')) return;

  const schedule = state.schedules[idx];
  if (!schedule) { toast('✗ Brak grafiku do zatwierdzenia'); return; }

  const syncStatus = document.getElementById('syncStatus');
  syncStatus.textContent = '⟳ Zatwierdzanie...';

  try {
    const doc = await state.db.collection('teams').doc(state.teamSession.teamId).get();
    const data = doc.data();
    const prevApproved = (data.approvedSchedules || {})[monthKey];
    const history = (data.scheduleHistory && data.scheduleHistory[monthKey]) || [];
    if (prevApproved) history.push(JSON.parse(JSON.stringify(prevApproved)));
    const version = history.length + 1;

    const update = {};
    update['approvedSchedules.' + monthKey] = {
      data: schedule, version,
      approvedBy: state.teamSession.displayName || state.teamSession.login || 'unknown',
      approvedByLogin: state.teamSession.login || null,
      approvedAt: new Date().toISOString(),
      workers: state.workers.map(w => ({ id: w.id || null, name: w.name || null, color: w.color || null, days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [] })),
      weModes: { ...state.weekendModes }, month: m, year: y,
    };
    update['scheduleHistory.' + monthKey] = history;
    update['pendingSchedules.' + monthKey] = null;
    update['schedMeta.' + monthKey] = null;
    const cleanUpdate = JSON.parse(JSON.stringify(update));
    cleanUpdate['staleSchedules.' + monthKey] = firebase.firestore.FieldValue.delete();

    await state.db.collection('teams').doc(state.teamSession.teamId).update(cleanUpdate);
    toast(`✓ Grafik zatwierdzony (v${version})!`);
    syncStatus.textContent = '✓ Zatwierdzono';
    state.setSchedules([]);
    state.setScheduleStaleKey(null);
    renderStaleNotice();
    document.getElementById('mainInner').innerHTML = '<div class="empty" style="opacity:.75"><div class="empty-icon">✅</div><h2>Grafik zatwierdzony</h2><p>Kliknij „Pokaż" w banerze powyżej aby wyświetlić lub edytować zatwierdzony grafik.</p></div>';
    loadTeamData();
  } catch (e) {
    syncStatus.textContent = '✗ Błąd'; console.error(e);
  }
}

export async function removeApproval(monthKey) {
  if (!state.teamSession || !state.db) return;
  if (!confirm('Cofnąć zatwierdzenie? Dane grafiku zostaną zachowane (nie zostaną usunięte).')) return;

  try {
    const doc = await state.db.collection('teams').doc(state.teamSession.teamId).get();
    const ap = doc.exists && doc.data().approvedSchedules?.[monthKey];
    const version = (ap && ap.version) || 1;
    const update = {};
    update['approvedSchedules.' + monthKey + '.revoked'] = true;
    update['approvedSchedules.' + monthKey + '.revokedBy'] = state.teamSession.displayName || state.teamSession.login || 'unknown';
    update['approvedSchedules.' + monthKey + '.revokedByLogin'] = state.teamSession.login || null;
    update['approvedSchedules.' + monthKey + '.revokedAt'] = new Date().toISOString();
    if (ap && ap.data) update['pendingSchedules.' + monthKey] = [{ shifts: ap.data }];
    await state.db.collection('teams').doc(state.teamSession.teamId).update(JSON.parse(JSON.stringify(update)));
    hideApprovedSchedule();
    toast(`✓ Zatwierdzenie v${version} cofnięte (grafik przywrócony)`);
    loadTeamData();
  } catch (e) { console.error(e); }
}

// ── WYŚWIETLANIE ZATWIERDZONEGO GRAFIKU ───────────────────────────

export function renderApprovedBanner(approvedSchedules) {
  updateGenBtn();
  renderPreFill();
  const container = document.getElementById('approvedBanner');
  if (!container) return;
  if (!approvedSchedules || !Object.keys(approvedSchedules).length) { container.innerHTML = ''; return; }

  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;
  const ap = approvedSchedules[monthKey];
  if (!ap) { container.innerHTML = ''; return; }

  const version = ap.version || 1;
  const isShowing = state.approvedViewActive === monthKey;
  const history = (state.cachedScheduleHistory && state.cachedScheduleHistory[monthKey]) || [];

  let html = '<div style="padding:10px 20px 0">';

  if (ap.revoked) {
    html += `<div class="ap-banner" style="opacity:.65;background:var(--surface2);border-color:var(--border2)">
      <div class="ab-icon">🔓</div>
      <div class="ab-text">
        <div class="ab-title" style="color:var(--muted)">Cofnięty v${version} — ${MONTHS[m]} ${y}</div>
        <div class="ab-meta">Cofnął: ${ap.revokedBy || ap.approvedBy} · Zatwierdził: ${ap.approvedBy}</div>
      </div>
      <button class="ab-btn" onclick="showApprovedSchedule('${monthKey}','current')">${isShowing ? '👁 Ukryj' : '👁 Pokaż (arch.)'}</button>
    </div>`;
  } else {
    const dt = new Date(ap.approvedAt);
    const isApprover = state.teamSession && (canDo('revoke') || (ap.approvedByLogin && ap.approvedByLogin === state.teamSession.login));
    html += `<div class="ap-banner">
      <div class="ab-icon">✅</div>
      <div class="ab-text">
        <div class="ab-title">Zatwierdzony v${version} — ${MONTHS[m]} ${y}</div>
        <div class="ab-meta">Zatwierdził: ${ap.approvedBy} · ${dt.toLocaleDateString('pl-PL')} ${dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <button class="ab-btn" onclick="showApprovedSchedule('${monthKey}','current')">${isShowing ? '👁 Ukryj' : '👁 Pokaż'}</button>
      <button class="ab-btn" onclick="exportApprovedXL('${monthKey}')">⬇ Excel</button>
      ${isApprover ? `<button class="ab-btn" onclick="removeApproval('${monthKey}')" style="color:var(--red)">✕ Cofnij</button>` : ''}
    </div>`;
  }

  // Starsze wersje z historii
  history.slice().reverse().forEach((histEntry, i) => {
    const histVersion = histEntry.version || history.length - i;
    const histIndex = history.length - 1 - i;
    const histKey = monthKey + '_h' + histIndex;
    const histShowing = state.approvedViewActive === histKey;
    const histDate = new Date(histEntry.approvedAt);
    const wasRevoked = !!histEntry.revoked;
    html += `<div class="ap-banner" style="opacity:.45;background:var(--surface2);border-color:var(--border);margin-top:4px;font-size:11px">
      <div class="ab-icon" style="font-size:14px">${wasRevoked ? '🔓' : '📋'}</div>
      <div class="ab-text">
        <div class="ab-title" style="color:var(--muted);font-size:11px">v${histVersion} — ${MONTHS[histEntry.month || m]} ${histEntry.year || y}${wasRevoked ? ' (cofnięty)' : ''}</div>
        <div class="ab-meta">Zatwierdził: ${histEntry.approvedBy} · ${histDate.toLocaleDateString('pl-PL')}</div>
      </div>
      <button class="ab-btn" style="font-size:10px" onclick="showApprovedSchedule('${monthKey}','h${histIndex}')">${histShowing ? '👁 Ukryj' : '👁 Pokaż'}</button>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function showApprovedSchedule(monthKey, which) {
  if (!state.teamSession || !state.db) return;
  which = which || 'current';
  const viewKey = which === 'current' ? monthKey : monthKey + '_' + which;

  // Toggle: kliknięcie na aktywny widok go ukrywa
  if (state.approvedViewActive === viewKey) { hideApprovedSchedule(); return; }

  state.db.collection('teams').doc(state.teamSession.teamId).get().then(doc => {
    if (!doc.exists) return;
    let ap;
    if (which === 'current') {
      ap = doc.data().approvedSchedules?.[monthKey];
    } else {
      const histIndex = parseInt(which.replace('h', ''));
      const history = (doc.data().scheduleHistory && doc.data().scheduleHistory[monthKey]) || [];
      ap = history[histIndex];
    }
    if (!ap) return;

    state.setApprovedViewActive(viewKey);

    const { daysInMonth, dateString, dayOfWeek, isWorkday, calculateVacationHours } = window._utils;
    const { DNS, MONTHS } = window._constants;

    const approvedWorkers = ap.workers.map(w => ({ ...w, days: w.days || {} }));
    const schedule = ap.data;
    const ay = ap.year, am = ap.month;
    const days = daysInMonth(ay, am);
    const isRevoked = !!ap.revoked;
    const apVersion = ap.version || 1;
    const isOldVersion = which !== 'current';
    const ROMAN = ['I', 'II', 'III'];

    const statusBadge = isOldVersion
      ? `<span style="background:var(--surface3);border:1px solid var(--border2);color:var(--muted);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">ARCHIWUM v${apVersion}</span>`
      : isRevoked
      ? `<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">COFNIĘTY v${apVersion}</span>`
      : `<span style="background:var(--green-bg);border:1px solid var(--green);color:var(--green);font-family:'Fira Code',monospace;font-size:8px;padding:2px 6px;border-radius:3px;font-weight:700">ZATWIERDZONY v${apVersion}</span>`;

    const hoursByWorker = {};
    approvedWorkers.forEach(w => { hoursByWorker[w.id] = { d: 0, n: 0, t24: 0, vac: 0 }; });
    approvedWorkers.forEach(w => {
      for (let d = 1; d <= days; d++) {
        if (w.days[dateString(ay, am, d)] === 'vac' && isWorkday(ay, am, d)) hoursByWorker[w.id].vac += 8;
      }
    });
    schedule.forEach(e => {
      if (!hoursByWorker[e.wid]) hoursByWorker[e.wid] = { d: 0, n: 0, t24: 0, vac: 0 };
      if (e.type === 'dzien') hoursByWorker[e.wid].d += e.hours || 12;
      else if (e.type === 'noc') hoursByWorker[e.wid].n += e.hours || 12;
      else hoursByWorker[e.wid].t24 += e.hours || 24;
    });
    const totals = approvedWorkers.map(w => {
      const h = hoursByWorker[w.id];
      return { w, total: h.d + h.n + h.t24 + h.vac, ...h };
    });
    const maxHours = Math.max(...totals.map(t => t.total), 1);
    const activeTotals = totals.filter(t => t.total > 0);
    const avgHours = activeTotals.length
      ? Math.round(activeTotals.reduce((sum, t) => sum + t.total, 0) / activeTotals.length)
      : 0;
    const entryLookup = {};
    schedule.forEach(e => { entryLookup[`${e.wid}_${e.date}`] = e; });

    const header = `<div class="sched-hdr">${statusBadge}<span class="sched-meta">${MONTHS[am]} ${ay} · śr. ${avgHours}h · ${schedule.length} zmian · Zatwierdził: ${ap.approvedBy}</span></div>`;

    let hoursBar = `<div class="hvis"><div class="sec" style="margin-bottom:3px">Godziny pracowników</div>`;
    totals.forEach(t => {
      const pct = (t.total / maxHours * 100).toFixed(1);
      hoursBar += `<div class="hrow"><div class="hname" style="color:${t.w.color}">${t.w.name}</div><div class="hbarw"><div class="hbar" style="width:${pct}%;background:${t.w.color}"></div></div><div class="hnum">${t.total}h</div><div class="hbk">D:${t.d} N:${t.n} 24:${t.t24}${t.vac ? ' U:+' + t.vac : ''}</div></div>`;
    });
    hoursBar += '</div>';

    let thead = `<thead><tr><th class="wcol">Pracownik</th>`;
    for (let d = 1; d <= days; d++) {
      const wd = dayOfWeek(ay, am, d);
      thead += `<th${wd === 0 || wd === 6 ? ' class="weh"' : ''}><div>${d}</div><div style="font-size:6px;opacity:.7">${DNS[wd]}</div></th>`;
    }
    thead += `<th class="scol">Suma</th></tr></thead>`;

    let tbody = '<tbody>';
    approvedWorkers.forEach(w => {
      tbody += `<tr><td class="wn"><span style="color:${w.color};margin-right:4px">●</span>${w.name}</td>`;
      let wt = 0;
      for (let d = 1; d <= days; d++) {
        const date = dateString(ay, am, d);
        const wd = dayOfWeek(ay, am, d);
        const isWeekend = wd === 0 || wd === 6;
        const annotation = w.days[date];
        const entry = entryLookup[`${w.id}_${date}`];
        const shiftType = entry ? entry.type : undefined;
        let cls = isWeekend ? 'cwe' : '';
        let label = '';
        if (annotation === 'vac') { if (isWeekend) { cls = 'cuwe'; label = 'U'; } else { cls = 'cuwd'; label = 'U'; wt += 8; } }
        else if (annotation === 'off') { cls = 'coff'; label = '—'; }
        else if (shiftType === 'dzien') { const dh = entry.hours || 12; cls = 'cd'; label = entry.slot ? ROMAN[entry.slot - 1] : 'D'; wt += dh; }
        else if (shiftType === 'noc') { cls = 'cn'; label = 'N'; wt += 12; }
        else if (shiftType === '24h') { cls = 'c24'; label = '24h'; wt += 24; }
        else { cls = 'cr' + (isWeekend ? ' cwe' : ''); }
        tbody += `<td><div class="cell ${cls}">${label}</div></td>`;
      }
      tbody += `<td class="scol-td"><div class="sv" style="color:${w.color}">${wt}h</div></td></tr>`;
    });
    tbody += '</tbody>';

    let archivedInner = document.getElementById('archivedInner');
    if (!archivedInner) {
      archivedInner = document.createElement('div');
      archivedInner.id = 'archivedInner';
      archivedInner.className = 'main-inner';
      const mainInner = document.getElementById('mainInner');
      mainInner.parentNode.insertBefore(archivedInner, mainInner);
    }

    const borderColor = isOldVersion ? 'var(--border2)' : isRevoked ? 'var(--yellow)' : 'var(--green)';
    archivedInner.innerHTML = `<div class="sched-block" style="border-color:${borderColor}${isOldVersion ? ';opacity:.7' : ''}">${header}${hoursBar}<div class="twrap"><table>${thead}${tbody}</table></div></div>`;
    archivedInner.style.display = '';
    document.getElementById('mainInner').style.display = 'none';
    renderApprovedBanner(state.cachedApprovedSchedules);
  });
}

function hideApprovedSchedule() {
  state.setApprovedViewActive(null);
  const archivedInner = document.getElementById('archivedInner');
  if (archivedInner) { archivedInner.innerHTML = ''; archivedInner.style.display = 'none'; }
  document.getElementById('mainInner').style.display = '';
  renderApprovedBanner(state.cachedApprovedSchedules);
}

export function exportApprovedXL(monthKey) {
  if (!state.teamSession || !state.db) return;
  state.db.collection('teams').doc(state.teamSession.teamId).get().then(doc => {
    if (!doc.exists) return;
    const ap = doc.data().approvedSchedules?.[monthKey];
    if (!ap) return;
    // Tymczasowo podmień stan globalny, wywołaj eksport, przywróć
    const savedWorkers = state.workers;
    const savedSchedules = state.schedules;
    const savedWeModes = state.weekendModes;
    const savedCounter = state.workerCounter;
    state.setWorkers(ap.workers.map(w => ({ ...w, _open: false, days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [] })));
    state.setWeekendModes(ap.weModes || {});
    state.setWorkerCounter(Math.max(...state.workers.map(w => w.id), 0) + 1);
    state.setSchedules([ap.data]);
    window.exportXL(ap.year, ap.month, 0);
    state.setWorkers(savedWorkers);
    state.setWeekendModes(savedWeModes);
    state.setSchedules(savedSchedules);
    state.setWorkerCounter(savedCounter);
  });
}

function updateGenBtn() {
  const btn = document.getElementById('genBtn');
  if (!btn) return;
  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;
  const wasApproved = state.cachedApprovedSchedules && state.cachedApprovedSchedules[monthKey];
  const isLocked = wasApproved && !wasApproved.revoked;
  btn.disabled = !!isLocked;
  btn.title = isLocked ? `Grafik ${MONTHS[m]} ${y} jest zatwierdzony — generowanie nowego grafiku jest zablokowane.` : '';
}

// Funkcje importowane do globalnego kontekstu przez init.js:
// buildWeModes, renderWEGrid, updateHolidayBar, updateTeamDaysOffBar
// są zdefiniowane w init.js i wywoływane przez window.*
