// ── TWORZENIE OBIEKTÓW ZMIAN ───────────────────────────────────────
// genShifts buduje listę wszystkich zmian do obsadzenia w danym miesiącu.
import * as state from '../state.js';
import { daysInMonth, dateString, dayOfWeek, isHoliday, isTeamDayOff } from '../utils.js';

/**
 * Generuje listę zmian do obsadzenia dla danego miesiąca.
 * @param {number} year
 * @param {number} month
 * @param {string} shiftMode  - '12h' lub '8h'
 * @param {number} shiftsPerDay - tylko dla trybu 8h: ile zmian na dzień
 * @returns {Array<{date, type, hours, slot?}>}
 */
export function genShifts(year, month, shiftMode, shiftsPerDay) {
  const is8h = shiftMode === '8h';
  const slotsPerDay = is8h ? (shiftsPerDay || 1) : 1;
  const days = daysInMonth(year, month);
  const shifts = [];

  for (let d = 1; d <= days; d++) {
    const date = dateString(year, month, d);
    const weekday = dayOfWeek(year, month, d);

    // Dni wolne zespołu — pomijamy całkowicie
    if (isTeamDayOff(date)) continue;

    if (is8h) {
      const weekendsEnabled =
        document.getElementById('chk8hWe') && document.getElementById('chk8hWe').checked;
      const isWorkingDay = (weekday >= 1 && weekday <= 5) || weekendsEnabled;
      if (isWorkingDay) {
        for (let slot = 1; slot <= slotsPerDay; slot++) {
          shifts.push({ date, type: 'dzien', hours: 8, slot });
        }
      }
    } else {
      if (weekday >= 1 && weekday <= 5) {
        // Dzień roboczy

        // Święto z trybem 24h
        if (isHoliday(date) && getHolidayMode(date)) {
          shifts.push({ date, type: '24h', hours: 24 });
        } else {
          // Awaryjny tryb 24h: gdy tylko 1 pracownik dostępny
          const availableWorkers = state.workers.filter(w => {
            if (state.teamSession && w.disabled) return false;
            const annotation = w.days[date];
            return annotation !== 'vac' && annotation !== 'off';
          });
          if (availableWorkers.length <= 1) {
            shifts.push({ date, type: '24h', hours: 24 });
          } else {
            shifts.push({ date, type: 'dzien', hours: 12 });
            shifts.push({ date, type: 'noc', hours: 12 });
          }
        }
      } else {
        // Weekend — tryb zależy od ustawień weekendów
        const saturdayDate = weekday === 6 ? date : dateString(year, month, d - 1);
        const weekendMode = state.weekendModes[saturdayDate] || '24h';
        if (weekendMode === '24h') {
          shifts.push({ date, type: '24h', hours: 24 });
        } else if (weekendMode === 'split') {
          shifts.push({ date, type: 'dzien', hours: 12 });
          shifts.push({ date, type: 'noc', hours: 12 });
        }
        // 'wolny' = brak zmian
      }
    }
  }

  // Sortowanie: po dacie, potem slot (8h), potem typ (dzień przed nocą)
  shifts.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    (a.slot || 0) - (b.slot || 0) ||
    (a.type === 'dzien' ? -1 : b.type === 'dzien' ? 1 : 0)
  );

  return shifts;
}

// Pobiera tryb dnia świątecznego (true = 24h, false = normalny dzień roboczy)
function getHolidayMode(date) {
  return state.holidayModes[date] !== false;
}
