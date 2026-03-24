// ── PUNKTACJA PRACOWNIKÓW ─────────────────────────────────────────
// workerScore oblicza priorytet przydziału pracownika do zmiany.
// Niższy wynik = wyższy priorytet (pracownik "potrzebuje" więcej godzin).
import { addDays } from '../utils.js';

/**
 * Oblicza wynik priorytetu dla danego pracownika i zmiany.
 * Niższy wynik = pracownik powinien dostać tę zmianę w pierwszej kolejności.
 *
 * @param {object} worker   - obiekt pracownika
 * @param {object} shift    - { date, type, hours, slot? }
 * @param {Array}  schedule - aktualny stan grafiku
 * @param {object} cfg      - konfiguracja (zawiera quotas)
 * @returns {number}
 */
export function workerScore(worker, shift, schedule, cfg) {
  const workerId = worker.id;
  const quota = cfg.quotas[workerId];
  if (!quota) return 9999;

  // Bazowy wynik: stosunek aktualnych godzin do celu (0..1, niższy = potrzebuje więcej)
  const workerHours = schedule
    .filter(e => e.wid === workerId)
    .reduce((sum, e) => sum + e.hours, 0);
  let score = workerHours / quota.target;

  const weekday = new Date(shift.date).getDay();

  // ── reqDays: obowiązkowe dniówki ───────────────────────────────
  // Silny bonus za dniówkę w wymaganym dniu, kara za nocną/24h
  if (worker.reqDays && worker.reqDays.length && worker.reqDays.includes(weekday)) {
    if (shift.type === 'dzien') {
      score -= 10; // bardzo silny bonus — chcemy tego pracownika na dniówce
    } else {
      score += 8;  // kara — nie powinien dostać nocki w obowiązkowym dniu
    }
  }

  // ── minDays: priorytet dniówek Pn–Pt ──────────────────────────
  // Bonus gdy pracownik nie osiągnął jeszcze tygodniowego minimum
  if (worker.minDays && shift.type === 'dzien' && weekday >= 1 && weekday <= 5) {
    const weekdayDayShifts = countWeekdayDayShifts(workerId, shift.date, schedule);
    if (weekdayDayShifts < worker.minDays) score -= 7;
  }

  // ── Tryb 8h: penalizacja za "skok w dół" slotu ────────────────
  // Zmiana z wyższego slotu na niższy = mniej odpoczynku
  if (shift.slot) {
    const prevDate = addDays(shift.date, -1);
    const prevEntry = schedule.find(e => e.wid === workerId && e.date === prevDate);
    if (prevEntry && prevEntry.slot && shift.slot < prevEntry.slot) {
      const slotDrop = prevEntry.slot - shift.slot; // 1 lub 2
      score += slotDrop * 50; // bardzo wysoka kara — prawie nigdy nie wybierany
    }
  }

  // ── Tryb 8h: bonus za kontynuację tego samego slotu ──────────
  if (shift.slot) {
    const prevDate = addDays(shift.date, -1);
    const prevEntry = schedule.find(e => e.wid === workerId && e.date === prevDate);
    if (prevEntry && prevEntry.slot && shift.slot === prevEntry.slot) {
      score -= 0.3; // mały bonus za stabilność grafiku
    }
  }

  // Losowy szum zapobiega deterministycznym wzorcom
  score += (Math.random() - 0.5) * 0.15;

  return score;
}

/**
 * Zlicza dniówki Pn–Pt danego pracownika w tygodniu zawierającym `date`.
 */
function countWeekdayDayShifts(workerId, date, schedule) {
  const d = new Date(date);
  const weekday = d.getDay();
  // Przejdź do poniedziałku tego tygodnia
  const monday = new Date(d);
  monday.setDate(d.getDate() - (weekday === 0 ? 6 : weekday - 1));

  let count = 0;
  for (let i = 0; i < 5; i++) {
    const dayDate = new Date(monday);
    dayDate.setDate(monday.getDate() + i);
    const dateStr = dayDate.toISOString().slice(0, 10);
    if (schedule.some(e => e.wid === workerId && e.date === dateStr && e.type === 'dzien')) {
      count++;
    }
  }
  return count;
}
