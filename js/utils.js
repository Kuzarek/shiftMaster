// ── UTILITY FUNCTIONS ──────────────────────────────────────────────
import * as state from './state.js';

// Liczba dni w danym miesiącu
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

// Formatuje datę jako "YYYY-MM-DD"
export const dateString = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Dodaje n dni do daty w formacie "YYYY-MM-DD", zwraca nową datę jako string
export const addDays = (dateStr, n) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Dzień tygodnia (0=Nd, 1=Pn, ..., 6=Sb)
export const dayOfWeek = (year, month, day) => new Date(year, month - 1, day).getDay();

// Czy dany dzień jest dniem roboczym (Pn–Pt)?
export const isWorkday = (year, month, day) => {
  const wd = dayOfWeek(year, month, day);
  return wd >= 1 && wd <= 5;
};

// Pobiera wybrany rok i miesiąc z selektorów w DOM
export const getSelectedYearMonth = () => ({
  y: +document.getElementById('selY').value,
  m: +document.getElementById('selM').value,
});

// ── ŚWIĘTA ─────────────────────────────────────────────────────────

export function isHoliday(date) {
  const year = date.slice(0, 4);
  return !!(state.publicHolidays[year] && state.publicHolidays[year].has(date));
}

export function getHolidayName(date) {
  const year = date.slice(0, 4);
  return (state.publicHolidays[year] && state.publicHolidays[year].get(date)) || '';
}

export async function fetchHolidays(year) {
  if (state.publicHolidays[year]) return;
  state.publicHolidays[year] = new Map();
  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PL`);
    if (!response.ok) return;
    const data = await response.json();
    data.forEach(h => state.publicHolidays[year].set(h.date, h.localName || h.name));
  } catch (e) {
    // Ignoruj błędy sieci — aplikacja działa bez świąt
  }
}

// ── DNI WOLNE ZESPOŁU ──────────────────────────────────────────────

export function isTeamDayOff(date) {
  return !!state.teamDaysOff[date];
}

// ── URLOPY — obliczenie godzin urlopowych pracownika w miesiącu ────

export function calculateVacationHours(worker, year, month) {
  let hours = 0;
  const days = daysInMonth(year, month);
  for (let d = 1; d <= days; d++) {
    if (worker.days[dateString(year, month, d)] === 'vac' && isWorkday(year, month, d)) {
      hours += 8;
    }
  }
  return hours;
}

// ── TOAST ──────────────────────────────────────────────────────────

export function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
}
