// ── OBLICZANIE KWOT GODZINOWYCH ────────────────────────────────────
// buildQuotas wyznacza dla każdego pracownika docelową liczbę godzin
// oraz limity dla dniówek i nocek/weekendów.
import * as state from '../state.js';
import { daysInMonth, dateString, dayOfWeek, isTeamDayOff } from '../utils.js';

/**
 * Oblicza kwoty godzinowe dla wszystkich aktywnych pracowników.
 * @param {number} year
 * @param {number} month
 * @param {string} shiftMode  - '12h' lub '8h'
 * @param {number} shiftsPerDay
 * @returns {{ [workerId]: { maxDzienWday, maxNocWeH, target } }}
 */
export function buildQuotas(year, month, shiftMode, shiftsPerDay) {
  const is8h = shiftMode === '8h';
  const slotsPerDay = is8h ? (shiftsPerDay || 1) : 1;
  const days = daysInMonth(year, month);
  const weekendsEnabled8h =
    is8h && document.getElementById('chk8hWe') && document.getElementById('chk8hWe').checked;

  // Zliczamy dostępne sloty dniówek, nocek i godzin weekendowych
  let weekdayDayShifts = 0;
  let weekdayNightShifts = 0;
  let weekendHours = 0;

  for (let d = 1; d <= days; d++) {
    const date = dateString(year, month, d);
    if (isTeamDayOff(date)) continue;
    const weekday = dayOfWeek(year, month, d);

    if (weekday >= 1 && weekday <= 5) {
      weekdayDayShifts++;
      if (!is8h) weekdayNightShifts++;
    } else if (weekendsEnabled8h) {
      weekdayDayShifts++;
    } else if (!is8h) {
      const saturdayDate = weekday === 6 ? dateString(year, month, d) : dateString(year, month, d - 1);
      const weekendMode = state.weekendModes[saturdayDate] || '24h';
      if (weekendMode === '24h') weekendHours += 24;
      else if (weekendMode === 'split') weekendHours += 24;
    }
  }

  // Aktywni pracownicy: nie wyłączeni, z co najmniej 1 dostępnym dniem
  const activeWorkers = (state.teamSession
    ? state.workers.filter(w => !w.disabled)
    : state.workers
  ).filter(worker => {
    for (let d = 1; d <= daysInMonth(year, month); d++) {
      const annotation = worker.days[dateString(year, month, d)];
      if (annotation !== 'off' && annotation !== 'vac') return true;
    }
    return false;
  });

  const workerCount = activeWorkers.length;
  const dayShiftHours = is8h ? 8 : 12;
  const totalHours = weekdayDayShifts * slotsPerDay * dayShiftHours + weekdayNightShifts * 12 + weekendHours;
  const targetHours = workerCount ? totalHours / workerCount : 0;

  const totalDaySlots = is8h ? weekdayDayShifts * slotsPerDay : weekdayDayShifts;
  const avgDayShifts = workerCount ? totalDaySlots / workerCount : 0;
  const avgNightWeekendHours = is8h ? 0 : Math.max(0, targetHours - avgDayShifts * 12);

  // Liczba tygodni nakładających się na miesiąc (dla skalowania minDays)
  const weekCount = (() => {
    let count = 0;
    for (let d = 1; d <= days; d++) {
      if (dayOfWeek(year, month, d) === 1 || (d === 1 && dayOfWeek(year, month, d) !== 1)) count++;
    }
    return count;
  })();

  const quotas = {};
  activeWorkers.forEach(worker => {
    // Pracownicy z minDays/reqDays mogą potrzebować wyższej kwoty dniówek
    const personalDayShifts = Math.max(avgDayShifts, (worker.minDays || 0) * weekCount);
    const personalNightWeekendHours = is8h
      ? 0
      : Math.max(0, targetHours - personalDayShifts * dayShiftHours);

    quotas[worker.id] = {
      maxDzienWday: personalDayShifts,
      maxNocWeH: personalNightWeekendHours,
      target: targetHours,
    };
  });

  return quotas;
}
