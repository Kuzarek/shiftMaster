// ── GŁÓWNY GENERATOR GRAFIKU ───────────────────────────────────────
// runGen — punkt wejściowy generatora opartego na Simulated Annealing.
//
// SA iteracyjnie OPTYMALIZUJE rozwiązanie:
// minimalizuje odchylenie godzin między pracownikami przy zachowaniu
// wszystkich ograniczeń (urlopy, odpoczynki, limity nocek itp.)
//
// Fazy generowania:
//   Faza 1: SA z oryginalnymi ustawieniami weekendów
//   Faza 2: SA z weekendami D+N (fallback gdy faza 1 nie daje 0 naruszeń)
//   Faza 3: podział zmian 24h (gdy aktywny limit max24h i dalej za dużo naruszeń)

import * as state from '../state.js';
import { getSelectedYearMonth, toast, calculateVacationHours } from '../utils.js';
import { genShifts } from './shifts.js';
import { buildQuotas } from './quotas.js';
import { runSimulatedAnnealing } from './simAnnealing.js';
import { diagNoSchedule } from './diagnostics.js';
import { renderAll } from '../render/scheduleRenderer.js';
import { autoSave, saveToFirestore } from '../sync/firestore.js';
import { canDo } from '../workers.js';

// Próg energii poniżej którego rozwiązanie uznajemy za "wystarczająco dobre"
const ACCEPTABLE_ENERGY_THRESHOLD = 50;

// Ile różnych grafików SA stara się znaleźć (użytkownik przegląda je strzałkami)
const TARGET_SCHEDULE_COUNT = 25;

/**
 * Oblicza odchylenie godzinowe (max - min) dla danego grafiku.
 * Używane do sortowania wyników.
 */
function scheduleHourDeviation(schedule, year, month) {
  const hoursByWorker = {};
  state.workers.forEach(worker => {
    hoursByWorker[worker.id] = calculateVacationHours(worker, year, month);
  });
  schedule.forEach(entry => {
    if (hoursByWorker[entry.wid] !== undefined) {
      hoursByWorker[entry.wid] += entry.hours;
    }
  });
  const values = Object.values(hoursByWorker);
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

// ─────────────────────────────────────────────────────────────────────
// PUNKT WEJŚCIOWY
// ─────────────────────────────────────────────────────────────────────

/**
 * Uruchamia generowanie grafiku.
 * Wywoływana po kliknięciu "⚡ Generuj Grafik".
 */
export function runGen() {
  const { y, m } = getSelectedYearMonth();
  const monthKey = `${y}-${m}`;

  clearStaleSchedule(monthKey);

  if (!canDo('generate')) { toast('Brak uprawnień do generowania'); return; }
  if (!state.workers.length) { alert('Dodaj co najmniej 1 pracownika!'); return; }
  if (state.cachedApprovedSchedules?.[monthKey] && !state.cachedApprovedSchedules[monthKey].revoked) return;

  // Zapisz natychmiast oczekujący zapis i zablokuj snapshoty podczas generowania
  if (state.autoSaveTimer) {
    clearTimeout(state.autoSaveTimer);
    state.setAutoSaveTimer(null);
    saveToFirestore();
  }
  if (state.teamSession) state.setSkipNextSnapshot(true);

  _doGen();
}

// ─────────────────────────────────────────────────────────────────────
// LOGIKA GENEROWANIA
// ─────────────────────────────────────────────────────────────────────

async function _doGen() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  const genStartTime = Date.now();

  // ── Overlay podczas generowania ──────────────────────────────────
  function showOverlay() {
    const el = document.getElementById('genOverlay');
    if (el) el.style.display = 'flex';
  }
  function hideOverlay() {
    const el = document.getElementById('genOverlay');
    if (el) el.style.display = 'none';
  }
  function updateOverlayProgress(phaseName, restartIdx, restartCount, found) {
    const phaseEl = document.getElementById('genOlPhase');
    const fillEl  = document.getElementById('genProgressFill');
    const statsEl = document.getElementById('genOlStats');
    if (!phaseEl || !fillEl || !statsEl) return;
    phaseEl.textContent = phaseName;
    const pct = restartCount > 0 ? Math.round((restartIdx + 1) / restartCount * 100) : 0;
    fillEl.style.width = pct + '%';
    statsEl.textContent = `${found} / ${TARGET_SCHEDULE_COUNT} grafików`;
  }

  // ── Aktualizacja etykiety przycisku podczas generowania ──────────
  function setPhaseLabel(phaseName, energy, foundCount, restartIdx, restartCount) {
    const elapsedSeconds = ((Date.now() - genStartTime) / 1000).toFixed(1);
    const energyLabel = energy < Infinity ? ` · energia: ${Math.round(energy)}` : '';
    const foundLabel = foundCount ? ` · ${foundCount} grafik${foundCount > 1 ? 'ów' : ''}` : '';
    btn.innerHTML = `<span class="spinner"></span>${phaseName} · ${elapsedSeconds}s${energyLabel}${foundLabel}`;
    if (restartIdx !== undefined) updateOverlayProgress(phaseName, restartIdx, restartCount, foundCount || 0);
  }

  // ── Finalizacja po zakończeniu wszystkich faz ────────────────────
  function finish(errorMessage) {
    try {
      const { y, m } = getSelectedYearMonth();

      if (errorMessage) {
        document.getElementById('mainInner').innerHTML =
          `<div class="alert">⚠ Błąd: ${errorMessage}</div>`;

      } else if (!state.schedules.length) {
        // Żadne rozwiązanie nie zostało znalezione
        const shiftMode = document.getElementById('selShiftMode').value;
        const shiftsPerDay = shiftMode === '8h'
          ? (+document.getElementById('minPerDay').value || 1) : 1;
        document.getElementById('mainInner').innerHTML =
          diagNoSchedule(y, m, shiftMode, shiftsPerDay, lastCfg || {}, Date.now() - genStartTime);

      } else {
        // Sortuj: najniższe odchylenie godzinowe = najlepszy grafik
        // (pomijamy gdy grafiki już posortowane w grupach przez logikę fazy 2)
        if (!skipFinalSort) {
          state.schedules.sort((a, b) =>
            scheduleHourDeviation(a, y, m) - scheduleHourDeviation(b, y, m)
          );
          state.setSchedules(state.schedules.slice(0, TARGET_SCHEDULE_COUNT));
        }
        renderAll(y, m, fallbackUsed, firstPhaseCount, split24Dates.length ? split24Dates : null);
        autoSave();
      }
    } catch (err) {
      console.error('Błąd w finish():', err);
      document.getElementById('mainInner').innerHTML =
        `<div class="alert">⚠ Błąd: ${err.message}</div>`;
    }

    hideOverlay();
    btn.disabled = false;
    btn.innerHTML = '⚡ Generuj Grafik';

    // Zamknij panel boczny na mobilnych
    if (window.innerWidth <= 900) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar?.classList.contains('open')) window.togSidebar();
    }
  }

  // ── Stan między fazami (domknięcie) ─────────────────────────────
  let lastCfg = null;
  let fallbackUsed = false;
  let split24Dates = [];
  let firstPhaseCount = 0;
  let skipFinalSort = false; // gdy grafiki już ręcznie posortowane w grupach

  // ── FAZA 3: podział zmian 24h (gdy limit max24h aktywny) ────────
  async function runPhase3IfNeeded(y, m, cfg, currentSolutions, originalWeekendModes) {
    const hasSolutions = currentSolutions.length > 0;
    const max24Active = cfg.max24;

    if (!max24Active) { finish(null); return; }
    if (!hasSolutions) { finish(null); return; }

    const activeWorkerCount = (state.teamSession
      ? state.workers.filter(w => !w.disabled)
      : state.workers
    ).length;
    const totalAllowed24h = cfg.max24Val * activeWorkerCount;
    const originalShifts = genShifts(y, m, '12h');
    const all24hShifts = originalShifts.filter(s => s.type === '24h');

    if (all24hShifts.length <= totalAllowed24h) { finish(null); return; }

    const minSplitCount = all24hShifts.length - totalAllowed24h;
    const phase3Deadline = Date.now() + 25_000;

    const ranked24hShifts = [...all24hShifts]
      .map(shift => {
        const availableCount = state.workers.filter(w => {
          if (state.teamSession && w.disabled) return false;
          const annotation = w.days[shift.date];
          return annotation !== 'vac' && annotation !== 'off' && annotation !== 'no-both';
        }).length;
        return { ...shift, availableCount };
      })
      .sort((a, b) => b.availableCount - a.availableCount);

    const totalAttempts = all24hShifts.length - minSplitCount + 1;

    for (let splitCount = minSplitCount; splitCount <= all24hShifts.length; splitCount++) {
      if (Date.now() >= phase3Deadline) break;

      setPhaseLabel(`Faza 3/3: podział 24h (${splitCount - minSplitCount + 1}/${totalAttempts})`, Infinity, 0);
      await sleep(0);

      try {
        const datesToSplit = new Set(ranked24hShifts.slice(0, splitCount).map(s => s.date));
        const modifiedShifts = [];
        originalShifts.forEach(shift => {
          if (shift.type === '24h' && datesToSplit.has(shift.date)) {
            modifiedShifts.push({ date: shift.date, type: 'dzien', hours: 12 });
            modifiedShifts.push({ date: shift.date, type: 'noc',   hours: 12 });
          } else {
            modifiedShifts.push(shift);
          }
        });
        modifiedShifts.sort((a, b) =>
          a.date.localeCompare(b.date) ||
          (a.type === 'dzien' ? -1 : b.type === 'dzien' ? 1 : 0)
        );

        const cfgSplit = { ...cfg, quotas: buildQuotas(y, m, '12h') };
        const remainingTime = Math.max(5000, phase3Deadline - Date.now());

        const { solutions: splitSolutions, bestEnergy: splitEnergy } = await runSimulatedAnnealing(
          modifiedShifts, cfgSplit, y, m,
          remainingTime, TARGET_SCHEDULE_COUNT,
          ({ phase, energy, found, restartIdx, restartCount }) =>
            setPhaseLabel(`Faza 3/3 · ${phase}`, energy, found, restartIdx, restartCount),
        );

        if (splitEnergy <= ACCEPTABLE_ENERGY_THRESHOLD && splitSolutions.length) {
          split24Dates = [...datesToSplit];
          state.setSchedules(splitSolutions);
          setPhaseLabel('Faza 3/3 gotowa', splitEnergy, splitSolutions.length);
          finish(null);
          return;
        }
      } catch (err) { console.error(err); finish(err.message); return; }
    }

    finish(null);
  }

  // Opóźnienie 30ms żeby przeglądarka zdążyła odświeżyć przycisk
  showOverlay();
  await sleep(30);

  try {
    const { y, m } = getSelectedYearMonth();
    const shiftMode = document.getElementById('selShiftMode').value;
    const shiftsPerDay = shiftMode === '8h'
      ? (+document.getElementById('minPerDay').value || 1) : 1;

    const cfg = {
      maxN:     document.getElementById('chkN').checked,
      maxNVal:  +document.getElementById('maxNVal').value || 3,
      maxD:     document.getElementById('chkD').checked,
      maxDVal:  +document.getElementById('maxDVal').value || 3,
      maxSun:   !!(document.getElementById('chkMaxSun')?.checked),
      max24:    !!(document.getElementById('chkMax24')?.checked),
      max24Val: +(document.getElementById('max24Val')?.value) || 4,
      tol:      +document.getElementById('selT').value,
    };
    lastCfg = cfg;

    // ── Tryb 8h — prosta pojedyncza faza ─────────────────────
    if (shiftMode === '8h') {
      setPhaseLabel('Generowanie (8h)', Infinity, 0);
      await sleep(0);
      try {
        const allShifts = genShifts(y, m, shiftMode, shiftsPerDay);
        const cfgWithQuotas = { ...cfg, quotas: buildQuotas(y, m, shiftMode, shiftsPerDay) };

        const timeLimitMs = 25_000 * Math.max(1, shiftsPerDay);
        const { solutions, bestEnergy } = await runSimulatedAnnealing(
          allShifts, cfgWithQuotas, y, m, timeLimitMs, TARGET_SCHEDULE_COUNT,
          ({ phase, energy, found, restartIdx, restartCount }) =>
            setPhaseLabel(`8h · ${phase}`, energy, found, restartIdx, restartCount),
        );

        state.setSchedules(solutions);
        setPhaseLabel('Gotowe (8h)', bestEnergy, solutions.length);
        finish(null);
      } catch (err) { console.error(err); finish(err.message); }
      return;
    }

    // ── Tryb 12/24h — fazy 1–3 ───────────────────────────────

    // FAZA 1: oryginalne ustawienia weekendów
    setPhaseLabel('Faza 1/3', Infinity, 0);
    await sleep(0);
    try {
      const originalWeekendModes = { ...state.weekendModes };
      const allShifts = genShifts(y, m, shiftMode);
      const cfgWithQuotas = { ...cfg, quotas: buildQuotas(y, m, shiftMode) };

      const { solutions: phase1Solutions, bestEnergy: phase1Energy } = await runSimulatedAnnealing(
        allShifts, cfgWithQuotas, y, m,
        20_000, TARGET_SCHEDULE_COUNT,
        ({ phase, energy, found, restartIdx, restartCount }) =>
          setPhaseLabel(`Faza 1/3 · ${phase}`, energy, found, restartIdx, restartCount),
      );

      setPhaseLabel('Faza 1/3 gotowa', phase1Energy, phase1Solutions.length);
      firstPhaseCount = phase1Solutions.length;

      // FAZA 2: fallback weekendy D+N (gdy faza 1 dała naruszenia hard constraints)
      await sleep(0);
      try {
        const acceptablePhase1 = phase1Solutions.filter(s => {
          // Przyjmij rozwiązania z niską energią (brak hard violations)
          // Nie możemy tu łatwo sprawdzić energii, więc filtrujemy po odchyleniu
          return scheduleHourDeviation(s, y, m) <= cfg.tol * 2;
        });

        if (acceptablePhase1.length >= TARGET_SCHEDULE_COUNT || phase1Energy <= ACCEPTABLE_ENERGY_THRESHOLD) {
          // Faza 1 wystarczyła
          state.setSchedules(phase1Solutions);
          await runPhase3IfNeeded(y, m, cfg, phase1Solutions, originalWeekendModes);
          return;
        }

        // Faza 1 nie dała wystarczająco dobrych wyników — spróbuj z D+N
        setPhaseLabel('Faza 2/3: fallback D+N', Infinity, 0);
        const splitModes = {};
        Object.keys(originalWeekendModes).forEach(k => { splitModes[k] = 'split'; });
        state.setWeekendModes(splitModes);

        const fallbackShifts = genShifts(y, m, shiftMode);
        const cfgFallback = { ...cfg, quotas: buildQuotas(y, m, shiftMode) };

        const { solutions: phase2Solutions, bestEnergy: phase2Energy } = await runSimulatedAnnealing(
          fallbackShifts, cfgFallback, y, m,
          25_000, TARGET_SCHEDULE_COUNT,
          ({ phase, energy, found, restartIdx, restartCount }) =>
            setPhaseLabel(`Faza 2/3 · ${phase}`, energy, found, restartIdx, restartCount),
        );

        state.setWeekendModes(originalWeekendModes);
        setPhaseLabel('Faza 2/3 gotowa', phase2Energy, phase2Solutions.length);

        // Zawsze preferuj wyniki fazy 1 (24h weekendy).
        // Faza 2 (D+N) doklejana jest tylko gdy faza 1 nie dała żadnych wyników
        // lub nie wypełniła limitu — i tylko na końcu listy (po wszystkich 24h).
        const sortByDev = arr => [...arr].sort(
          (a, b) => scheduleHourDeviation(a, y, m) - scheduleHourDeviation(b, y, m)
        );

        if (phase1Solutions.length) {
          const sorted1 = sortByDev(phase1Solutions);
          let combined = sorted1.slice(0, TARGET_SCHEDULE_COUNT);
          if (combined.length < TARGET_SCHEDULE_COUNT && phase2Solutions.length) {
            const sorted2 = sortByDev(phase2Solutions);
            combined = [...combined, ...sorted2.slice(0, TARGET_SCHEDULE_COUNT - combined.length)];
            fallbackUsed = true;
          }
          firstPhaseCount = phase1Solutions.length;
          skipFinalSort = true;
          state.setSchedules(combined);
          await runPhase3IfNeeded(y, m, cfg, combined, originalWeekendModes);
        } else {
          fallbackUsed = phase2Solutions.length > 0;
          firstPhaseCount = 0;
          state.setSchedules(phase2Solutions);
          await runPhase3IfNeeded(y, m, cfg, phase2Solutions, originalWeekendModes);
        }
      } catch (err) { console.error(err); finish(err.message); }
    } catch (err) { console.error(err); finish(err.message); }

  } catch (err) { console.error(err); finish(err.message); }
}

// ─────────────────────────────────────────────────────────────────────
// POMOCNICZE
// ─────────────────────────────────────────────────────────────────────

/**
 * Czyści flagę "grafik nieaktualny" dla danego klucza miesiąca.
 */
function clearStaleSchedule(monthKey) {
  if (state.scheduleStaleKey === monthKey) state.setScheduleStaleKey(null);
  if (state.cachedStaleSchedules) delete state.cachedStaleSchedules[monthKey];

  if (state.teamSession && state.db) {
    state.setSkipNextSnapshot(true);
    state.db.collection('teams').doc(state.teamSession.teamId)
      .update({ [`staleSchedules.${monthKey}`]: firebase.firestore.FieldValue.delete() })
      .catch(() => { state.setSkipNextSnapshot(false); });
  }

  if (typeof window.renderStaleNotice === 'function') window.renderStaleNotice();
}
