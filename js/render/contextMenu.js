// ── MENU KONTEKSTOWE KOMÓREK GRAFIKU ──────────────────────────────
// Pozwala ręcznie zmienić typ zmiany w wybranej komórce.
import * as state from '../state.js';
import { getSelectedYearMonth } from '../utils.js';
import { renderSched } from './scheduleRenderer.js';
import { autoSave } from '../sync/firestore.js';
import { canDo } from '../workers.js';

// Typy zmian dostępne w menu kontekstowym
const SHIFT_TYPES = [
  { type: 'dzien', label: 'D — Dniówka 12h',     bg: 'var(--green-bg)',  fg: 'var(--green)',  hours: 12 },
  { type: 'noc',   label: 'N — Nocka 12h',        bg: 'var(--yellow-bg)', fg: 'var(--yellow)', hours: 12 },
  { type: '24h',   label: '24h — Weekend',         bg: '#d6eef8',          fg: '#1a7fa8',       hours: 24 },
  { type: 'vac',   label: 'U — Urlop',             bg: 'var(--purple-bg)', fg: 'var(--purple)', hours: 0 },
  { type: 'off',   label: '— — Niedostępny',       bg: 'var(--gray-bg)',   fg: 'var(--gray)',   hours: 0 },
  { type: 'none',  label: '(puste)',                bg: 'transparent',      fg: 'var(--muted2)', hours: 0 },
];

// Kontekst aktualnie otwartego menu
let menuContext = null;

/**
 * Otwiera menu kontekstowe przy klikniętej komórce.
 */
export function openCellMenu(event, scheduleIndex, workerId, date) {
  event.stopPropagation();
  if (!canDo('edit')) return;

  const menu = document.getElementById('cellMenu');
  menuContext = { scheduleIndex, workerId, date };

  const is8hMode = document.getElementById('selShiftMode').value === '8h';
  const shiftsPerDay = is8hMode ? (+document.getElementById('minPerDay').value || 1) : 1;

  const ROMAN = ['I', 'II', 'III'];
  let items = '';

  if (is8hMode) {
    // W trybie 8h: sloty I, II, III zamiast D/N/24h
    for (let slot = 1; slot <= shiftsPerDay; slot++) {
      items += `<button class="cmitem" onclick="applyCellType('dzien',${slot})">
        <div class="dot" style="background:var(--green-bg);border:1px solid var(--green)"></div>
        ${ROMAN[slot - 1]} — Zmiana ${slot} (8h)
      </button>`;
    }
    // Pozostałe opcje (urlop, niedostępny, puste) — bez D/N/24h
    SHIFT_TYPES.filter(st => st.type !== 'dzien' && st.type !== 'noc' && st.type !== '24h').forEach(st => {
      items += `<button class="cmitem" onclick="applyCellType('${st.type}')">
        <div class="dot" style="background:${st.bg};border:1px solid ${st.fg}"></div>
        ${st.label}
      </button>`;
    });
  } else {
    // Tryb 12/24h: pełna lista typów
    SHIFT_TYPES.forEach(st => {
      items += `<button class="cmitem" onclick="applyCellType('${st.type}')">
        <div class="dot" style="background:${st.bg};border:1px solid ${st.fg}"></div>
        ${st.label}
      </button>`;
    });
  }

  menu.innerHTML = items;

  // Pozycjonuj menu blisko klikniętej komórki
  const rect = event.target.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 2;
  if (left + 140 > window.innerWidth) left = window.innerWidth - 144;
  if (top + 200 > window.innerHeight) top = rect.top - 2 - 200;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.display = 'flex';
}

/**
 * Zastosowuje wybrany typ zmiany do komórki.
 * @param {string} type  - typ zmiany ('dzien','noc','24h','vac','off','none')
 * @param {number} [slot] - numer slotu (tylko tryb 8h)
 */
export function applyCellType(type, slot) {
  if (!menuContext) return;
  const { scheduleIndex, workerId, date } = menuContext;
  const schedule = state.schedules[scheduleIndex];
  const { y, m } = getSelectedYearMonth();
  const worker = state.workers.find(w => w.id === workerId);

  if (type === 'none' || type === 'off' || type === 'vac') {
    // Usuń istniejący wpis i opcjonalnie ustaw adnotację
    state.schedules[scheduleIndex] = schedule.filter(e => !(e.wid === workerId && e.date === date));
    if (type === 'vac') worker.days[date] = 'vac';
    else if (type === 'off') worker.days[date] = 'off';
    else if (worker.days[date] === 'vac' || worker.days[date] === 'off') delete worker.days[date];
  } else {
    // Zastąp istniejący wpis nowym
    state.schedules[scheduleIndex] = schedule.filter(e => !(e.wid === workerId && e.date === date));
    if (worker.days[date] === 'vac' || worker.days[date] === 'off') delete worker.days[date];

    const is8hMode = document.getElementById('selShiftMode').value === '8h';
    const hours = type === '24h' ? 24 : (is8hMode ? 8 : 12);
    const newEntry = { wid: workerId, date, type, hours };
    if (slot) newEntry.slot = slot;
    state.schedules[scheduleIndex].push(newEntry);
    state.schedules[scheduleIndex].sort((a, b) => a.date.localeCompare(b.date));
  }

  document.getElementById('cellMenu').style.display = 'none';
  renderSched(scheduleIndex, y, m);
  autoSave();
}

// Zamknij menu po kliknięciu gdziekolwiek indziej
export function initContextMenuCloseHandler() {
  document.addEventListener('click', () => {
    document.getElementById('cellMenu').style.display = 'none';
  });
}
