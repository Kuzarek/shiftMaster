// ── SPRAWDZANIE OGRANICZEŃ PRZYDZIAŁU ──────────────────────────────
// canAssign sprawdza czy dany pracownik może otrzymać daną zmianę
// przy aktualnym stanie grafiku i konfiguracji ograniczeń.
import { addDays } from '../utils.js';

/**
 * Sprawdza czy pracownik `worker` może otrzymać zmianę `shift`.
 *
 * @param {object} worker   - obiekt pracownika
 * @param {object} shift    - { date, type, hours, slot? }
 * @param {Array}  schedule - aktualne wpisy grafiku [{wid, date, type, hours}]
 * @param {object} cfg      - konfiguracja ograniczeń:
 *   { quotas, tol, maxN, maxNVal, maxD, maxDVal, maxSun, max24, max24Val }
 * @returns {boolean}
 */
export function canAssign(worker, shift, schedule, cfg) {
  const { date, type } = shift;
  const workerId = worker.id;
  const annotation = worker.days[date];
  const quota = cfg.quotas[workerId];

  // Brak kwoty = pracownik nieaktywny w tym miesiącu
  if (!quota) return false;

  // ── Blokady z kalendarza pracownika ────────────────────────────
  if (annotation === 'vac' || annotation === 'off') return false;
  if (type === 'dzien' && (annotation === 'no-d' || annotation === 'no-both')) return false;
  if (type === 'noc'   && (annotation === 'no-n' || annotation === 'no-both')) return false;
  if (type === '24h'   && (annotation === 'no-d' || annotation === 'no-n' || annotation === 'no-both')) return false;

  // ── Jeden wpis na dzień ────────────────────────────────────────
  if (schedule.some(e => e.wid === workerId && e.date === date)) return false;

  // ── Limit zmian 24h ────────────────────────────────────────────
  if (type === '24h' && cfg.max24) {
    const count24h = schedule.filter(e => e.wid === workerId && e.type === '24h').length;
    if (count24h >= cfg.max24Val) return false;
  }

  // ── Odpoczynek między zmianami (poprzedni i następny dzień) ────
  const prevDate = addDays(date, -1);
  const nextDate = addDays(date, 1);
  const prevEntry = schedule.find(e => e.wid === workerId && e.date === prevDate);
  const nextEntry = schedule.find(e => e.wid === workerId && e.date === nextDate);

  if (prevEntry) {
    // Po nocce / 24h nie może być od razu dniówka
    if (type === 'dzien' && (prevEntry.type === 'noc' || prevEntry.type === '24h')) return false;
    // Po 24h nie może być nocka
    if (type === 'noc' && prevEntry.type === '24h') return false;
    // Po nocce / 24h nie może być 24h
    if (type === '24h' && (prevEntry.type === '24h' || prevEntry.type === 'noc')) return false;
  }
  if (nextEntry) {
    // Przed dniówką nie może być nocka / 24h (dnia następnego)
    if ((type === 'noc' || type === '24h') && nextEntry.type === 'dzien') return false;
    if (type === '24h' && nextEntry.type === '24h') return false;
    if (type === 'noc' && nextEntry.type === '24h') return false;
  }

  // ── Limit nocek z rzędu ────────────────────────────────────────
  if (cfg.maxN && type === 'noc') {
    const maxNights = cfg.maxNVal || 3;
    let consecutiveNights = 0;
    let checkDate = prevDate;
    for (let i = 0; i < maxNights; i++) {
      const entry = schedule.find(e => e.wid === workerId && e.date === checkDate);
      if (entry && entry.type === 'noc') {
        consecutiveNights++;
        checkDate = addDays(checkDate, -1);
      } else {
        break;
      }
    }
    if (consecutiveNights >= maxNights) return false;
  }

  // ── Limit dniówek z rzędu ──────────────────────────────────────
  if (cfg.maxD && type === 'dzien') {
    const maxDays = cfg.maxDVal || 3;
    let consecutiveDays = 0;
    let checkDate = prevDate;
    for (let i = 0; i < maxDays; i++) {
      const entry = schedule.find(e => e.wid === workerId && e.date === checkDate);
      if (entry && entry.type === 'dzien') {
        consecutiveDays++;
        checkDate = addDays(checkDate, -1);
      } else {
        break;
      }
    }
    if (consecutiveDays >= maxDays) return false;
  }

  // ── Limit consecutive niedziel (tryb 8h z weekendami) ─────────
  if (cfg.maxSun && new Date(date).getDay() === 0) {
    let sundaysInRow = 0;
    for (let weeks = 7; weeks <= 14; weeks += 7) {
      const prevSunday = addDays(date, -weeks);
      if (schedule.some(e => e.wid === workerId && e.date === prevSunday)) {
        sundaysInRow++;
      } else {
        break;
      }
    }
    if (sundaysInRow >= 2) return false;
  }

  // ── Limit łącznych godzin (tolerancja) ────────────────────────
  const totalWorkerHours = schedule
    .filter(e => e.wid === workerId)
    .reduce((sum, e) => sum + e.hours, 0);
  if (totalWorkerHours + shift.hours > quota.target + cfg.tol) return false;

  // ── Limit dniówek w tygodniu roboczym ─────────────────────────
  const weekday = new Date(date).getDay();
  const isRegularWorkday = weekday >= 1 && weekday <= 5;
  const is8hMode = !!shift.slot; // tryb 8h ma slot

  if (type === 'dzien' && (isRegularWorkday || is8hMode)) {
    const dayShiftCount = is8hMode
      ? schedule.filter(e => e.wid === workerId && e.type === 'dzien').length
      : schedule.filter(e => {
          if (e.wid !== workerId || e.type !== 'dzien') return false;
          const wd = new Date(e.date).getDay();
          return wd >= 1 && wd <= 5;
        }).length;
    if (dayShiftCount >= quota.maxDzienWday + cfg.tol / (shift.hours || 12)) return false;
  }

  // ── Limit godzin nocnych/weekendowych ─────────────────────────
  if (!is8hMode && (type === 'noc' || type === '24h' || (type === 'dzien' && !isRegularWorkday))) {
    const nightWeekendHours = schedule
      .filter(e => {
        if (e.wid !== workerId) return false;
        if (e.type === 'noc' || e.type === '24h') return true;
        if (e.type === 'dzien' && !e.slot) {
          const wd = new Date(e.date).getDay();
          return wd === 0 || wd === 6;
        }
        return false;
      })
      .reduce((sum, e) => sum + e.hours, 0);
    if (nightWeekendHours + shift.hours > quota.maxNocWeH + cfg.tol) return false;
  }

  return true;
}
