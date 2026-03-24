// ── RENDEROWANIE GRAFIKU ────────────────────────────────────────────
import * as state from '../state.js';
import { MONTHS, MSHORT, DNS } from '../constants.js';
import {
  daysInMonth, dateString, dayOfWeek, isWorkday,
  getSelectedYearMonth, isHoliday, getHolidayName, isTeamDayOff, calculateVacationHours,
} from '../utils.js';

// ── STALE NOTICE ────────────────────────────────────────────────────

export function markStale() {
  if (!state.schedules.length) return;
  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;
  state.setScheduleStaleKey(monthKey);
  renderStaleNotice();
  // Zsynchronizuj z Firestore aby inni użytkownicy też widzieli ostrzeżenie
  if (state.teamSession && state.db) {
    state.setSkipNextSnapshot(true);
    state.db.collection('teams').doc(state.teamSession.teamId)
      .update({ ['staleSchedules.' + monthKey]: true })
      .catch(() => { state.setSkipNextSnapshot(false); });
  }
}

export function renderStaleNotice() {
  const el = document.getElementById('staleNotice');
  if (!el) return;
  const { y, m } = getSelectedYearMonth();
  const monthKey = y + '-' + m;
  const isStale =
    state.scheduleStaleKey === monthKey ||
    (state.cachedStaleSchedules && state.cachedStaleSchedules[monthKey]);

  if (isStale && state.schedules.length) {
    const { canDo } = window; // dostępna globalnie przez init.js
    const regenButton = canDo('generate')
      ? `<button class="stale-btn" onclick="runGen()">↻ Generuj ponownie</button>`
      : '';
    el.innerHTML = `<div class="stale-notice">⚠ Grafik może być nieaktualny — wprowadzono zmiany w kalendarzu${regenButton}</div>`;
  } else {
    el.innerHTML = '';
  }
}

// ── PREFILL — tabela dostępności ────────────────────────────────────

export function renderPreFill() {
  const container = document.getElementById('preFillSection');
  if (!container) return;
  const { y, m } = getSelectedYearMonth();

  // Ukryj gdy jest aktywny zatwierdzony grafik
  const monthKey = y + '-' + m;
  const approved = state.cachedApprovedSchedules && state.cachedApprovedSchedules[monthKey];
  if (approved && !approved.revoked) { container.innerHTML = ''; return; }
  if (!state.workers.length) { container.innerHTML = ''; return; }

  const DOW = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
  const CELL_DISPLAY = {
    vac:      { cls: 'pf-vac',  label: 'U' },
    off:      { cls: 'pf-off',  label: '✕' },
    'no-d':   { cls: 'pf-nod',  label: '-D' },
    'no-n':   { cls: 'pf-non',  label: '-N' },
    'no-both':{ cls: 'pf-nob',  label: '✕✕' },
  };
  const hasAnnotation = r => r === 'vac' || r === 'off' || r === 'no-d' || r === 'no-n' || r === 'no-both';
  const days = daysInMonth(y, m);
  const activeWorkers = state.workers.filter(w => !w.disabled);

  // Filtruj puste dni gdy włączona opcja "ukryj puste"
  const allDays = [];
  for (let d = 1; d <= days; d++) {
    const date = dateString(y, m, d);
    if (state.prefillHideEmpty && !activeWorkers.some(w => hasAnnotation(w.days[date]))) continue;
    allDays.push({ d, date, wd: dayOfWeek(y, m, d) });
  }

  const dateHeaders = allDays.map(({ d, wd, date }) => {
    const dowIndex = wd === 0 ? 6 : wd - 1;
    const isWeekend = wd === 0 || wd === 6;
    const holiday = isHoliday(date);
    const teamOff = isTeamDayOff(date);
    const cls = [isWeekend ? 'pf-col-we' : '', holiday ? 'pf-col-hol' : '', teamOff ? 'pf-col-tdo' : ''].filter(Boolean).join(' ');
    return `<th${cls ? ' class="' + cls + '"' : ''}><div class="pf-dnum">${d}${holiday ? '<span class="pf-hol-star">★</span>' : ''}${teamOff ? '<span class="pf-tdo-mark">✕</span>' : ''}</div><div class="pf-ddow">${DOW[dowIndex]}</div></th>`;
  }).join('');

  const rows = state.workers.map(worker => {
    const initials = worker.name.trim().split(/\s+/).map(p => p[0] || '').join('').slice(0, 2).toUpperCase() || '?';
    const workerCell = `<td class="pf-wcell"${worker.disabled ? ' style="opacity:.55"' : ''}>
      <div class="pf-av" style="background:${worker.color}22;color:${worker.color};border-color:${worker.color}88">${initials}</div>
      <span class="pf-wname">${worker.name.split(' ')[0]}</span>
      ${worker.disabled ? '<span class="pf-dis-tag">⊘</span>' : ''}
    </td>`;
    const cells = allDays.map(({ date, wd }) => {
      const isWeekend = wd === 0 || wd === 6;
      const cls = isWeekend ? 'pf-col-we' : '';
      if (worker.disabled) return `<td class="${cls}"><span class="pf-cell pf-off">✕</span></td>`;
      const annotation = worker.days[date];
      if (!annotation || !hasAnnotation(annotation)) return `<td class="${cls}"></td>`;
      const isWeekendVacation = annotation === 'vac' && isWeekend;
      const display = isWeekendVacation
        ? { cls: 'pf-vac-w', label: 'U' }
        : (CELL_DISPLAY[annotation] || { cls: '', label: annotation });
      return `<td class="${cls}"><span class="pf-cell ${display.cls}">${display.label}</span></td>`;
    }).join('');
    return `<tr>${workerCell}${cells}</tr>`;
  }).join('');

  const collapsed = state.prefillCollapsed;
  const arrow = collapsed ? '▸' : '▾';
  const tableHtml = collapsed ? '' : `
    <div class="prefill-body">
      <div class="prefill-legend">
        <span class="prefill-ro">tylko odczyt</span>
        <span class="pf-leg"><span class="pf-cell pf-vac">U</span>Urlop</span>
        <span class="pf-leg"><span class="pf-cell pf-off">✕</span>Niedostępny</span>
        <span class="pf-leg"><span class="pf-cell pf-nod">-D</span>Bez dniówki</span>
        <span class="pf-leg"><span class="pf-cell pf-non">-N</span>Bez nocki</span>
        <span class="pf-leg"><span class="pf-cell pf-nob">✕✕</span>Obie blokady</span>
        <label class="pf-hide-chk"><input type="checkbox" ${state.prefillHideEmpty ? 'checked' : ''} onchange="setPrefillHideEmpty(this.checked)"><span>Ukryj puste dni</span></label>
      </div>
      <div class="prefill-scroll">
        <table class="prefill-table">
          <thead><tr><th></th>${dateHeaders}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  container.innerHTML = `<div class="prefill-wrap">
    <div class="prefill-hdr pf-collapsible" onclick="setPrefillCollapsed(${!collapsed})" style="cursor:pointer;user-select:none${collapsed ? ';border-bottom:none' : ''}">
      <span class="pf-collapse-arrow">${arrow}</span>
      <span class="prefill-title">Dostępność — ${MONTHS[m]} ${y}</span>
    </div>
    ${tableHtml}
  </div>`;
}

// ── NAWIGACJA MIĘDZY GRAFIKAMI ───────────────────────────────────────

/**
 * Renderuje pasek nawigacji (strzałki ← Grafik N/Total →) nad grafikiem.
 */
function renderScheduleNav(year, month) {
  const navEl = document.getElementById('schedNav');
  if (!navEl) return;

  const total = state.schedules.length;
  const idx   = state.activeScheduleIndex;

  const debugEnabled = document.getElementById('chkDebug')?.checked;
  const debugButtons = debugEnabled
    ? `<button class="expall-btn" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:10px;padding:5px 10px" onclick="debugExport()">🐛 JSON</button>
       <button class="expall-btn" style="background:var(--surface2);border:1px solid var(--border);color:var(--muted);font-size:10px;padding:5px 10px" onclick="debugImport()">📥 Wklej</button>`
    : '';

  navEl.innerHTML = `
    <div class="sched-nav-bar">
      <div class="sched-nav-arrows">
        <button class="sched-arrow-btn" onclick="prevSchedule()" ${idx === 0 ? 'disabled' : ''}>&#8592;</button>
        <span class="sched-nav-counter">Grafik <strong>${idx + 1}</strong> / ${total}</span>
        <button class="sched-arrow-btn" onclick="nextSchedule()" ${idx >= total - 1 ? 'disabled' : ''}>&#8594;</button>
      </div>
      <div class="sched-nav-exports">
        ${debugButtons}
        <button class="expall-btn" onclick="exportXL(${year},${month})">⬇ Excel (wszystkie)</button>
        <button class="expall-btn" style="background:#c0392b;border-color:#c0392b;color:#fff" onclick="exportPDF(${year},${month})">⬇ PDF (wszystkie)</button>
      </div>
    </div>`;
}

/**
 * Przechodzi do poprzedniego grafiku.
 */
export function prevSchedule() {
  if (state.activeScheduleIndex <= 0) return;
  state.setActiveScheduleIndex(state.activeScheduleIndex - 1);
  const { y, m } = window._schedMeta || {};
  renderScheduleNav(y, m);
  _renderActiveSched(y, m);
}

/**
 * Przechodzi do następnego grafiku.
 */
export function nextSchedule() {
  if (state.activeScheduleIndex >= state.schedules.length - 1) return;
  state.setActiveScheduleIndex(state.activeScheduleIndex + 1);
  const { y, m } = window._schedMeta || {};
  renderScheduleNav(y, m);
  _renderActiveSched(y, m);
}

/** Renderuje aktualnie aktywny grafik do kontenera #schedSingle. */
function _renderActiveSched(year, month) {
  const container = document.getElementById('schedSingle');
  if (!container) return;
  container.innerHTML = '<div id="sb0"></div>';
  renderSched(state.activeScheduleIndex, year, month, 'sb0');
}

// ── RENDEROWANIE WSZYSTKICH GRAFIKÓW ────────────────────────────────

/**
 * Inicjalizuje widok grafiku — pokazuje nawigację i pierwszy grafik.
 * Użytkownik przełącza się między grafikami strzałkami ← →.
 *
 * @param {number}     year
 * @param {number}     month
 * @param {boolean}    fallbackUsed    - czy użyto fallbacku weekendów D+N
 * @param {number}     firstCount      - ile grafików pochodzi z fazy 1
 * @param {Array|null} split24Dates    - daty zmian 24h które podzielono
 */
export function renderAll(year, month, fallbackUsed = false, firstCount = state.schedules.length, split24Dates = null) {
  renderPreFill();

  // Reset do pierwszego grafiku przy każdym nowym generowaniu
  state.setActiveScheduleIndex(0);

  const mainInner = document.getElementById('mainInner');

  // Ostrzeżenia (fallback, podział 24h)
  let notices = '';

  if (split24Dates && split24Dates.length) {
    const dayList = split24Dates.map(d => {
      const dd = +d.slice(8, 10);
      return `<b>${dd} ${MSHORT[+d.slice(5, 7)]}</b>`;
    }).join(', ');
    notices += `<div class="gen-notice gen-notice-warn">
      ⚠ Limit zmian 24h uniemożliwił oryginalne ustawienia. Dni ${dayList} podzielono na D+N (12h+12h).
    </div>`;
  }

  if (fallbackUsed) {
    const fallbackStart = firstCount + 1;
    const fallbackInfo = firstCount > 0
      ? ` Grafiki 1–${firstCount} mają weekendy 24h; od grafiku ${fallbackStart} — D+N.`
      : '';
    notices += `<div class="gen-notice gen-notice-warn">
      ⚠ Część grafików wygenerowana z weekendami D+N (fallback) — oryginalne ustawienia dały zbyt mało wyników.${fallbackInfo}
    </div>`;
  }

  mainInner.innerHTML = `
    ${notices}
    <div id="schedNav"></div>
    <div id="schedSingle"><div id="sb0"></div></div>`;

  // Zapisz metadane dla nawigacji i renderSched
  window._schedMeta = { firstCount, fallbackUsed, y: year, m: month, split24Dates: split24Dates || null };

  renderScheduleNav(year, month);
  renderSched(0, year, month, 'sb0');
}

// ── RENDEROWANIE POJEDYNCZEGO GRAFIKU ───────────────────────────────

export function renderSched(idx, year, month, targetId = 'sb' + idx) {
  const schedule = state.schedules[idx];
  const days = daysInMonth(year, month);

  // Oblicz godziny per pracownik
  const hoursByWorker = {};
  state.workers.forEach(w => {
    hoursByWorker[w.id] = { d: 0, n: 0, t24: 0, vac: calculateVacationHours(w, year, month) };
  });
  schedule.forEach(entry => {
    if (!hoursByWorker[entry.wid]) hoursByWorker[entry.wid] = { d: 0, n: 0, t24: 0, vac: 0 };
    if (entry.type === 'dzien') hoursByWorker[entry.wid].d += entry.hours || 12;
    else if (entry.type === 'noc') hoursByWorker[entry.wid].n += entry.hours || 12;
    else hoursByWorker[entry.wid].t24 += entry.hours || 24;
  });

  const totals = state.workers.map(w => {
    const h = hoursByWorker[w.id];
    return { w, total: h.d + h.n + h.t24 + h.vac, ...h };
  });
  const maxHours = Math.max(...totals.map(t => t.total), 1);
  const minHours = Math.min(...totals.map(t => t.total));
  const activeTotals = totals.filter(t => t.total > 0);
  const avgHours = activeTotals.length
    ? Math.round(activeTotals.reduce((sum, t) => sum + t.total, 0) / activeTotals.length)
    : 0;

  // Szybkie wyszukiwanie wpisu po kluczu "wid_date"
  const entryLookup = {};
  schedule.forEach(e => { entryLookup[`${e.wid}_${e.date}`] = e; });

  const ROMAN = ['I', 'II', 'III'];
  const meta = window._schedMeta || {};
  const isSplitFallback = meta.fallbackUsed && idx >= meta.firstCount;

  const modeBadge = isSplitFallback
    ? `<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">WE: 12h split</span>`
    : `<span style="background:#d6eef8;border:1px solid #1a7fa8;color:#1a7fa8;font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">WE: 24h</span>`;

  const revokedBadge = (() => {
    const { y: ry, m: rm } = getSelectedYearMonth();
    const mk = ry + '-' + rm;
    const ap = state.cachedApprovedSchedules && state.cachedApprovedSchedules[mk];
    return ap && ap.revoked
      ? `<span style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">COFNIĘTY v${ap.version || 1}</span>
         <span style="background:var(--acc-dim);border:1px solid var(--acc);color:var(--acc);font-family:'Fira Code',monospace;font-size:7px;padding:2px 5px;border-radius:3px;font-weight:700">DO EDYCJI</span>`
      : '';
  })();

  const { canDo } = window;
  const approveButton = (() => {
    const { y: ry, m: rm } = getSelectedYearMonth();
    const mk = ry + '-' + rm;
    const alreadyApproved = state.cachedApprovedSchedules && state.cachedApprovedSchedules[mk] && !state.cachedApprovedSchedules[mk].revoked;
    return state.teamSession && !alreadyApproved && canDo('approve')
      ? `<button class="expbtn" style="border-color:var(--green);color:var(--green)" onclick="approveSchedule(${idx})">✓ Zatwierdź</button>`
      : '';
  })();

  const header = `<div class="sched-hdr">
    <span class="sched-num">Grafik ${idx + 1}</span>
    ${revokedBadge}${modeBadge}
    <span class="sched-meta">${MONTHS[month]} ${year} · śr. ${avgHours}h · odch. ${maxHours - minHours}h · ${schedule.length} zmian</span>
    <button class="expbtn" onclick="exportXL(${year},${month},${idx})">⬇ Excel</button>
    <button class="expbtn" style="border-color:#c0392b;color:#c0392b" onclick="exportPDF(${year},${month},${idx})">⬇ PDF</button>
    ${approveButton}
  </div>`;

  // Wykres słupkowy godzin
  let hoursBar = `<div class="hvis"><div class="sec" style="margin-bottom:3px">Godziny pracowników</div>`;
  totals.forEach(t => {
    const pct = (t.total / maxHours * 100).toFixed(1);
    hoursBar += `<div class="hrow">
      <div class="hname" style="color:${t.w.color}">${t.w.name}</div>
      <div class="hbarw"><div class="hbar" style="width:${pct}%;background:${t.w.color}"></div></div>
      <div class="hnum">${t.total}h</div>
      <div class="hbk">D:${t.d} N:${t.n} 24:${t.t24}${t.vac ? ' U:+' + t.vac : ''}</div>
    </div>`;
  });
  hoursBar += '</div>';

  // Nagłówek tabeli
  let thead = `<thead><tr><th class="wcol">Pracownik</th>`;
  for (let d = 1; d <= days; d++) {
    const weekday = dayOfWeek(year, month, d);
    const isWeekend = weekday === 0 || weekday === 6;
    const date = dateString(year, month, d);
    const holiday = isHoliday(date);
    const teamOff = isTeamDayOff(date);
    const cls = [isWeekend ? 'weh' : '', holiday ? 'holh' : '', teamOff ? 'tdoh' : ''].filter(Boolean).join(' ');
    const title = [holiday ? getHolidayName(date) : '', teamOff ? 'Dzień wolny zespołu' : ''].filter(Boolean).join(' · ');
    thead += `<th${cls ? ' class="' + cls + '"' : ''}${title ? ' title="' + title + '"' : ''}>
      <div>${d}${holiday ? '<span class="hol-star">★</span>' : ''}${teamOff ? '<span class="tdo-mark">✕</span>' : ''}</div>
      <div style="font-size:6px;opacity:.7">${DNS[weekday]}</div>
    </th>`;
  }
  thead += `<th class="scol">Suma</th></tr></thead>`;

  // Wiersze pracowników
  let tbody = '<tbody>';
  state.workers.forEach(worker => {
    tbody += `<tr><td class="wn"><span style="color:${worker.color};margin-right:4px">●</span>${worker.name}</td>`;
    let workerHours = 0;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      const weekday = dayOfWeek(year, month, d);
      const isWeekend = weekday === 0 || weekday === 6;
      const annotation = worker.days[date];
      const entry = entryLookup[`${worker.id}_${date}`];
      const shiftType = entry ? entry.type : undefined;

      let cellClass = isWeekend ? 'cwe' : '';
      let label = '';

      if (annotation === 'vac') {
        if (isWeekend) { cellClass = 'cuwe'; label = 'U'; }
        else { cellClass = 'cuwd'; label = 'U'; workerHours += 8; }
      } else if (annotation === 'off') {
        cellClass = 'coff'; label = '—';
      } else if (shiftType === 'dzien') {
        const shiftHours = entry.hours || 12;
        cellClass = 'cd';
        label = entry.slot ? ROMAN[entry.slot - 1] : 'D';
        workerHours += shiftHours;
      } else if (shiftType === 'noc') {
        cellClass = 'cn'; label = 'N'; workerHours += 12;
      } else if (shiftType === '24h') {
        cellClass = 'c24'; label = '24h'; workerHours += 24;
      } else {
        cellClass = 'cr' + (isWeekend ? ' cwe' : '');
        if (annotation === 'no-d') label = '-D';
        else if (annotation === 'no-n') label = '-N';
        else if (annotation === 'no-both') label = '✕';
      }

      tbody += `<td><div class="cell ${cellClass}" onclick="openCellMenu(event,${idx},${worker.id},'${date}')">${label}</div></td>`;
    }
    tbody += `<td class="scol-td"><div class="sv" style="color:${worker.color}">${workerHours}h</div></td></tr>`;
  });
  tbody += '</tbody>';

  // Legenda
  const is8hMode = document.getElementById('selShiftMode').value === '8h';
  const shiftsPerDay8h = is8hMode ? (+document.getElementById('minPerDay').value || 1) : 1;
  let legendShifts = '';
  if (is8hMode) {
    for (let s = 1; s <= shiftsPerDay8h; s++) {
      legendShifts += `<div class="legitem"><div class="legdot" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)">${ROMAN[s - 1]}</div>Zmiana ${s}</div>`;
    }
  } else {
    legendShifts = `
      <div class="legitem"><div class="legdot" style="background:var(--green-bg);border:1px solid var(--green);color:var(--green)">D</div>Dzień</div>
      <div class="legitem"><div class="legdot" style="background:var(--yellow-bg);border:1px solid var(--yellow);color:var(--yellow)">N</div>Noc</div>
      <div class="legitem"><div class="legdot" style="background:#d6eef8;border:1px solid #1a7fa8;color:#1a7fa8;font-size:7px">24h</div>Weekend</div>`;
  }
  const legend = `<div class="legrow">
    ${legendShifts}
    <div class="legitem"><div class="legdot" style="background:var(--purple-bg);border:1px solid var(--purple);color:var(--purple)">U</div>Urlop Pn-Pt</div>
    <div class="legitem"><div class="legdot" style="background:var(--blue-bg);border:1px solid var(--blue);color:var(--blue)">U</div>Urlop Sb-Nd</div>
    <div class="legitem"><div class="legdot" style="background:var(--gray-bg);border:1px solid var(--gray);color:var(--gray)">—</div>Niedostępny</div>
  </div>`;

  document.getElementById(targetId).innerHTML =
    `<div class="sched-block">${header}${hoursBar}<div class="twrap"><table>${thead}${tbody}</table></div>${legend}</div>`;
}
