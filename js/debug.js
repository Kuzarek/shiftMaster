// ── NARZĘDZIA DEBUGOWANIA ──────────────────────────────────────────
import * as state from './state.js';
import { MONTHS } from './constants.js';
import { daysInMonth, dateString, getSelectedYearMonth, calculateVacationHours, toast } from './utils.js';
import { buildWeModes, renderWEGrid, updateHolidayBar, updateTeamDaysOffBar } from './init.js';
import { renderWorkers } from './workers.js';
import { renderAll, renderPreFill } from './render/scheduleRenderer.js';

// ── TOGGLE TRYBU DEBUGOWANIA ──────────────────────────────────────

export function toggleDebugMode(enabled) {
  document.getElementById('debugPanel').style.display = enabled ? '' : 'none';
  localStorage.setItem('sm_debug', enabled ? '1' : '0');
}

// ── EKSPORT DANYCH DO SCHOWKA ─────────────────────────────────────

export function debugExport() {
  const { y, m } = getSelectedYearMonth();
  const days = daysInMonth(y, m);
  const shiftMode = document.getElementById('selShiftMode')?.value || '12/24h';

  const data = {
    month: MONTHS[m], year: y, days, shiftMode,
    settings: {
      tolerance: +document.getElementById('selT')?.value,
      maxConsecNights: document.getElementById('chkN')?.checked ? +document.getElementById('maxNVal')?.value : null,
      maxConsecDays: document.getElementById('chkD')?.checked ? +document.getElementById('maxDVal')?.value : null,
      maxConsecSundays: document.getElementById('chkMaxSun')?.checked || false,
      minPerDay: shiftMode === '8h' ? +document.getElementById('minPerDay')?.value : null,
      we8h: shiftMode === '8h' && document.getElementById('chk8hWe')?.checked,
    },
    weModes: { ...state.weekendModes },
    teamDaysOff: { ...state.teamDaysOff },
    workers: state.workers.map(w => {
      const days = {};
      for (let d = 1; d <= daysInMonth(y, m); d++) {
        const key = dateString(y, m, d);
        if (w.days[key]) days[key] = w.days[key];
      }
      return { id: w.id, name: w.name, minDays: w.minDays || 0, reqDays: w.reqDays || [], disabled: !!w.disabled, days };
    }),
    schedules: state.schedules.map((schedule, i) => {
      const hoursMap = {};
      state.workers.forEach(w => { hoursMap[w.id] = { d: 0, n: 0, t24: 0, vac: calculateVacationHours(w, y, m) }; });
      schedule.forEach(e => {
        if (!hoursMap[e.wid]) hoursMap[e.wid] = { d: 0, n: 0, t24: 0, vac: 0 };
        if (e.type === 'dzien') hoursMap[e.wid].d += e.hours || 12;
        else if (e.type === 'noc') hoursMap[e.wid].n += e.hours || 12;
        else hoursMap[e.wid].t24 += e.hours || 24;
      });
      const totals = {};
      for (const [id, h] of Object.entries(hoursMap)) totals[id] = { ...h, total: h.d + h.n + h.t24 + h.vac };
      const deviation = Math.max(...Object.values(totals).map(t => t.total)) - Math.min(...Object.values(totals).map(t => t.total));
      return { index: i, entries: schedule, totals, deviation };
    }),
  };

  const json = JSON.stringify(data, null, 2);
  navigator.clipboard.writeText(json)
    .then(() => toast('📋 Dane debugowania skopiowane do schowka'))
    .catch(() => {
      const win = window.open('', '_blank', 'width=800,height=600');
      if (win) win.document.write('<pre>' + json.replace(/</g, '&lt;') + '</pre>');
    });
}

// ── IMPORT DANYCH Z JSON ──────────────────────────────────────────

export function debugImport() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;width:90%;max-width:600px;box-shadow:0 8px 32px rgba(0,0,0,.3)';
  box.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:10px">📥 Importuj dane debugowania (JSON)</div>';

  const textarea = document.createElement('textarea');
  textarea.style.cssText = 'width:100%;height:200px;font-family:"Fira Code",monospace;font-size:10px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:8px;resize:vertical';
  textarea.placeholder = 'Wklej tutaj JSON z debugExport()...';
  box.appendChild(textarea);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;margin-top:10px;justify-content:flex-end';
  buttons.innerHTML = `<button class="genbtn" style="font-size:11px;padding:5px 14px;background:var(--surface2);border:1px solid var(--border);color:var(--text2)" id="dbgCancel">Anuluj</button>
    <button class="genbtn" style="font-size:11px;padding:5px 14px" id="dbgApply">Zastosuj</button>`;
  box.appendChild(buttons);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  box.querySelector('#dbgCancel').onclick = () => overlay.remove();
  box.querySelector('#dbgApply').onclick = () => {
    try {
      const data = JSON.parse(textarea.value);
      applyDebugImport(data);
      overlay.remove();
      toast('✓ Dane debugowania zaimportowane');
    } catch (e) {
      toast('✗ Błędny JSON: ' + e.message);
    }
  };
  textarea.focus();
}

function applyDebugImport(data) {
  if (data.year && data.month) {
    const monthIndex = typeof data.month === 'string' ? MONTHS.indexOf(data.month) : data.month;
    if (monthIndex > 0) document.getElementById('selM').value = monthIndex;
    document.getElementById('selY').value = data.year;
  }
  if (data.settings) {
    const s = data.settings;
    if (s.tolerance != null) document.getElementById('selT').value = s.tolerance;
if (s.maxConsecNights != null) {
      document.getElementById('chkN').checked = true;
      document.getElementById('maxNVal').value = s.maxConsecNights;
    } else {
      document.getElementById('chkN').checked = false;
    }
    if (s.maxConsecDays != null) {
      document.getElementById('chkD').checked = true;
      document.getElementById('maxDVal').value = s.maxConsecDays;
    } else {
      document.getElementById('chkD').checked = false;
    }
  }
  if (data.weModes) state.setWeekendModes({ ...data.weModes });
  if (data.teamDaysOff) state.setTeamDaysOff({ ...data.teamDaysOff });
  if (data.workers) {
    state.setWorkers(data.workers.map(w => ({
      id: w.id, name: w.name, color: w.color || COLORS[w.id % COLORS.length],
      _open: false, days: w.days || {}, minDays: w.minDays || 0, reqDays: w.reqDays || [],
      disabled: !!w.disabled,
    })));
    state.setWorkerCounter(Math.max(...state.workers.map(w => w.id), 0) + 1);
    state.workers.forEach(w => { state.calendarMode[w.id] = state.calendarMode[w.id] || 'vac'; });
  }
  if (data.schedules) {
    state.setSchedules(data.schedules.map(s => s.entries || s));
  }
  const { y, m } = getSelectedYearMonth();
  buildWeModes(); renderWorkers(); renderWEGrid();
  updateHolidayBar(y, m); updateTeamDaysOffBar(y, m);
  renderPreFill();
  if (state.schedules.length) {
    window._schedMeta = { y, m, fallbackUsed: false, firstCount: state.schedules.length };
    renderAll(y, m, false, state.schedules.length);
  }
}
