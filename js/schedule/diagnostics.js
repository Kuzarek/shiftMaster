// ── DIAGNOSTYKA BŁĘDÓW GENEROWANIA ────────────────────────────────
// diagNoSchedule analizuje dlaczego algorytm nie znalazł grafiku
// i zwraca HTML z listą wykrytych problemów i podpowiedzi.
import * as state from '../state.js';
import { MSHORT } from '../constants.js';
import { daysInMonth, dateString, dayOfWeek, isHoliday, isTeamDayOff } from '../utils.js';
import { genShifts } from './shifts.js';

/**
 * @param {number} year
 * @param {number} month
 * @param {string} shiftMode
 * @param {number} shiftsPerDay
 * @param {object} cfg          - ostatnia użyta konfiguracja ograniczeń
 * @param {number} elapsedMs    - czas trwania generowania w ms
 * @returns {string} HTML diagnostyki
 */
export function diagNoSchedule(year, month, shiftMode, shiftsPerDay, cfg, elapsedMs) {
  const days = daysInMonth(year, month);
  const is8h = shiftMode === '8h';
  const activeWorkers = state.workers.filter(w => !(state.teamSession && w.disabled));
  const issues = [];
  const hints = [];

  // 1. Brak aktywnych pracowników
  if (!activeWorkers.length) {
    issues.push('Brak aktywnych pracowników — wszyscy są wyłączeni lub lista jest pusta.');
    hints.push('Dodaj pracowników lub włącz wyłączonych (przycisk ◉/⊘).');
    return renderDiagnostics(issues, hints);
  }

  // 2. Analiza każdego dnia miesiąca
  const dayStats = [];
  for (let d = 1; d <= days; d++) {
    const date = dateString(year, month, d);
    const weekday = dayOfWeek(year, month, d);
    if (isTeamDayOff(date)) continue;
    const isWeekend = weekday === 0 || weekday === 6;

    let slotsNeeded = 0;
    if (is8h) {
      const weekendsEnabled = document.getElementById('chk8hWe') && document.getElementById('chk8hWe').checked;
      if (weekday >= 1 && weekday <= 5 || weekendsEnabled) slotsNeeded = shiftsPerDay || 1;
    } else {
      if (weekday >= 1 && weekday <= 5) {
        slotsNeeded = (isHoliday(date) && state.holidayModes[date] !== false) ? 1 : 2;
      } else {
        const satDate = weekday === 6 ? date : dateString(year, month, d - 1);
        const mode = state.weekendModes[satDate] || '24h';
        if (mode === '24h') slotsNeeded = 1;
        else if (mode === 'split') slotsNeeded = 2;
      }
    }
    if (!slotsNeeded) continue;

    const available = activeWorkers.filter(w => {
      const r = w.days[date];
      return r !== 'vac' && r !== 'off' && r !== 'no-both';
    });
    const availableForDay = activeWorkers.filter(w => {
      const r = w.days[date]; return r !== 'vac' && r !== 'off' && r !== 'no-d' && r !== 'no-both';
    });
    const availableForNight = activeWorkers.filter(w => {
      const r = w.days[date]; return r !== 'vac' && r !== 'off' && r !== 'no-n' && r !== 'no-both';
    });

    dayStats.push({ d, date, weekday, isWeekend, slotsNeeded, avail: available.length, availD: availableForDay.length, availN: availableForNight.length });
  }

  // 3. Dni z zerem dostępnych pracowników
  const zeroDays = dayStats.filter(s => s.avail === 0);
  if (zeroDays.length) {
    issues.push(`W ${zeroDays.length} dniu/dniach żaden pracownik nie jest dostępny: ${zeroDays.map(s => `<b>${s.d} ${MSHORT[month]}</b>`).join(', ')}.`);
    hints.push('Usuń urlopy/niedostępności w tych dniach lub oznacz je jako <b>dzień wolny zespołu</b>.');
  }

  // 4. Zbyt mało pracowników na sloty
  const shortDays = dayStats.filter(s => s.avail > 0 && s.avail < s.slotsNeeded);
  if (shortDays.length) {
    issues.push(`W ${shortDays.length} dniu/dniach jest za mało pracowników: ${shortDays.slice(0, 5).map(s => `<b>${s.d} ${MSHORT[month]}</b> (${s.avail} dostępnych, potrzeba ${s.slotsNeeded})`).join(', ')}${shortDays.length > 5 ? ' i więcej...' : ''}.`);
    hints.push('Zmniejsz liczbę zmian lub dodaj pracowników. W trybie 12/24h jeden pracownik może obsłużyć zmianę 24h automatycznie.');
  }

  // 5. Brak pracowników do dniówki / nocki (tryb 12/24h)
  if (!is8h) {
    const noDayShiftDays = dayStats.filter(s => !s.isWeekend && s.availD === 0 && s.slotsNeeded >= 2);
    if (noDayShiftDays.length) {
      issues.push(`Brak pracowników do dniówki: ${noDayShiftDays.slice(0, 5).map(s => `<b>${s.d} ${MSHORT[month]}</b>`).join(', ')}. Wszyscy mają oznaczenie „bez dniówki" lub są niedostępni.`);
      hints.push('Usuń ograniczenie „bez dniówki" (żółte) u co najmniej jednego pracownika.');
    }
    const noNightShiftDays = dayStats.filter(s => !s.isWeekend && s.availN === 0 && s.slotsNeeded >= 2);
    if (noNightShiftDays.length) {
      issues.push(`Brak pracowników do nocki: ${noNightShiftDays.slice(0, 5).map(s => `<b>${s.d} ${MSHORT[month]}</b>`).join(', ')}. Wszyscy mają oznaczenie „bez nocki" lub są niedostępni.`);
      hints.push('Usuń ograniczenie „bez nocki" (pomarańczowe) u co najmniej jednego pracownika.');
    }
  }

  // 6. Łączna pojemność vs zapotrzebowanie
  const allShifts = genShifts(year, month, shiftMode, shiftsPerDay);
  const totalShiftHours = allShifts.reduce((sum, s) => sum + s.hours, 0);
  const totalCapacity = activeWorkers.reduce((sum, worker) => {
    let cap = 0;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      if (isTeamDayOff(date)) continue;
      const r = worker.days[date];
      if (r !== 'vac' && r !== 'off' && r !== 'no-both') cap += is8h ? 8 : 24;
    }
    return sum + cap;
  }, 0);

  if (totalShiftHours > totalCapacity) {
    issues.push(`Łączna liczba godzin do obsadzenia (<b>${totalShiftHours}h</b>) przekracza sumaryczną dostępność pracowników (<b>${totalCapacity}h</b>).`);
    hints.push('Dodaj pracowników, zmniejsz liczbę zmian lub usuń urlopy/niedostępności.');
  }

  // 7. Zbyt niska tolerancja
  if (cfg.tol < 12 && activeWorkers.length > 1) {
    issues.push(`Odchylenie godzin ustawione na <b>${cfg.tol}h</b> — to bardzo niskie.`);
    hints.push(`Zwiększ „Max odchylenie godzin" do co najmniej <b>24h</b> (obecnie: ${cfg.tol}h).`);
  }

  // 8. Zbyt restrykcyjne limity z rzędu
  if (cfg.maxN && cfg.maxNVal <= 1) {
    issues.push(`Limit max nocek z rzędu = <b>${cfg.maxNVal}</b>. Przy małym zespole algorytm może nie znaleźć rozwiązania.`);
    hints.push('Zwiększ limit „Max nocek z rzędu" do 2–3 lub wyłącz to ograniczenie.');
  }
  if (cfg.maxD && cfg.maxDVal <= 1) {
    issues.push(`Limit max dniówek z rzędu = <b>${cfg.maxDVal}</b>. Przy małym zespole algorytm może nie znaleźć rozwiązania.`);
    hints.push('Zwiększ limit „Max dniówek z rzędu" do 2–3 lub wyłącz to ograniczenie.');
  }

  // 9. Konflikty reqDays z dostępnością
  const reqConflicts = [];
  activeWorkers.forEach(worker => {
    if (!worker.reqDays || !worker.reqDays.length) return;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      const weekday = dayOfWeek(year, month, d);
      if (!worker.reqDays.includes(weekday)) continue;
      const r = worker.days[date];
      if (r === 'vac' || r === 'off' || r === 'no-d' || r === 'no-both') {
        reqConflicts.push({ name: worker.name, d, reason: r });
      }
    }
  });
  if (reqConflicts.length) {
    const shown = reqConflicts.slice(0, 3);
    issues.push(`Konflikty wymaganych dni: ${shown.map(c => `<b>${c.name}</b> dzień ${c.d} (${c.reason === 'vac' ? 'urlop' : c.reason === 'off' ? 'niedostępny' : 'bez dniówki'})`).join(', ')}${reqConflicts.length > 3 ? ` i ${reqConflicts.length - 3} więcej` : ''}.`);
    hints.push('Usuń urlopy/niedostępności w dniach wymaganych lub zmień ustawienia „Wymagane dni".');
  }

  // 10. Limit zmian 24h zbyt niski
  if (cfg.max24) {
    const shifts24Count = dayStats.filter(s => s.slotsNeeded === 1).length;
    if (shifts24Count > 0 && activeWorkers.length > 0 && cfg.max24Val * activeWorkers.length < shifts24Count) {
      issues.push(`Limit max zmian 24h na pracownika (<b>${cfg.max24Val}</b>) przy ${activeWorkers.length} pracownikach daje max ${cfg.max24Val * activeWorkers.length} zmian 24h, a w miesiącu jest ich ~${shifts24Count}.`);
      hints.push('Zwiększ limit „Max zmian 24h na pracownika" lub wyłącz to ograniczenie. Fallback (podział 24h → D+N) też nie pomógł.');
    }
  }

  // Jeśli nie wykryto konkretnych problemów — komunikat ogólny
  if (!issues.length) {
    const elapsed = elapsedMs != null ? (elapsedMs / 1000).toFixed(1) + 's' : '~30s';
    issues.push(`Algorytm nie znalazł żadnego poprawnego grafiku (czas: ${elapsed}). Ograniczenia są zbyt ścisłe w kombinacji.`);
    hints.push('Zwiększ „Max odchylenie godzin", poluzuj limity nocek/dniówek z rzędu lub zmniejsz liczbę ograniczeń indywidualnych pracowników.');
  }

  return renderDiagnostics(issues, hints);
}

function renderDiagnostics(issues, hints) {
  const issueHtml = issues.map(i => `<li style="margin-bottom:4px">${i}</li>`).join('');
  const hintHtml = hints.map(h => `<li style="margin-bottom:4px">${h}</li>`).join('');
  return `<div class="diag-box">
    <div class="diag-hdr">⚠ Nie udało się wygenerować grafiku</div>
    <div class="diag-section">
      <div class="diag-label">Wykryte problemy:</div>
      <ul class="diag-list diag-issues">${issueHtml}</ul>
    </div>
    <div class="diag-section">
      <div class="diag-label">Co możesz zrobić:</div>
      <ul class="diag-list diag-hints">${hintHtml}</ul>
    </div>
  </div>`;
}
