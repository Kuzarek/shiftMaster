// ── SIMULATED ANNEALING — generator grafiku ────────────────────────────
// Ulepszona wersja SA z ruchami zachowującymi feasibility.
//
// Kluczowe ulepszenia:
// 1. isHardFeasible — sprawdza ograniczenia PRZED ruchem, nie po
// 2. buildInitialSolution — zachłanna, feasibility-aware, O(n·w)
// 3. moveSmartReassign — celuje w przeciążonych pracowników
// 4. moveSwapValidated — zamienia pary over/underloaded, obie strony feasible
// 5. calculateEnergy — używa Map zamiast filter/find, O(n)
// 6. Vacation hours precomputed raz przed pętlą SA

import * as state from '../state.js';
import { addDays, calculateVacationHours } from '../utils.js';

function yieldToMain() { return new Promise(r => setTimeout(r, 0)); }

// ── PRÓG AKCEPTOWALNOŚCI (eksportowany do generator.js) ───────────────
export const ACCEPTABLE_ENERGY = 50;

// ── WAGI KAR ──────────────────────────────────────────────────────────
const P = {
  UNFILLED:     50_000,  // zmiana bez pracownika
  VACATION:        500,  // urlop / niedostępność naruszona
  DUPLICATE:       400,  // pracownik 2× w jednym dniu
  REST:            300,  // naruszenie odpoczynku (noc→dzień itp.)
  MAX24:           200,  // przekroczenie limitu zmian 24h per pracownik
  CONSECUTIVE:     150,  // za dużo nocek / dniówek z rzędu (per dzień)
  REQ_DAY:          80,  // brak dniówki w obowiązkowym dniu tygodnia
  MIN_DAYS:         40,  // za mało dniówek w tygodniu (per brakujący dzień)
  QUOTA:             8,  // przekroczenie target godzin (per godzina powyżej)
  DEVIATION:         2,  // odchylenie godzinowe max–min ← GŁÓWNY CEL
};

// ─────────────────────────────────────────────────────────────────────
// WERYFIKACJA HARD-FEASIBILITY
// Sprawdza twarde ograniczenia (bez limitu godzin/kwot).
// excludeIdx: wpis w schedule ignorowany przy sprawdzaniu
// (bo właśnie go zamieniamy — traktuj jako usuniętego)
// Przekaż -1 jeśli nie ma co wykluczać.
// ─────────────────────────────────────────────────────────────────────

function isHardFeasible(workerId, shiftDate, shiftType, schedule, excludeIdx, cfg) {
  const worker = state.workers.find(w => w.id === workerId);
  if (!worker) return false;

  const ann = worker.days[shiftDate];
  if (ann === 'vac' || ann === 'off') return false;
  if (shiftType === 'dzien' && (ann === 'no-d' || ann === 'no-both')) return false;
  if (shiftType === 'noc'   && (ann === 'no-n' || ann === 'no-both')) return false;
  if (shiftType === '24h'   && (ann === 'no-d' || ann === 'no-n' || ann === 'no-both')) return false;

  const prevDate = addDays(shiftDate, -1);
  const nextDate = addDays(shiftDate, 1);

  let hasThisDay = false;
  let count24h   = 0;
  let prevEntry  = null;
  let nextEntry  = null;

  for (let i = 0; i < schedule.length; i++) {
    if (i === excludeIdx) continue;
    const e = schedule[i];
    if (e.wid !== workerId) continue;
    if (e.date === shiftDate)  hasThisDay = true;
    if (e.type === '24h')      count24h++;
    if (e.date === prevDate)   prevEntry = e;
    if (e.date === nextDate)   nextEntry = e;
  }

  if (hasThisDay) return false;
  if (shiftType === '24h' && cfg.max24 && count24h >= cfg.max24Val) return false;

  if (prevEntry) {
    if (shiftType === 'dzien' && (prevEntry.type === 'noc' || prevEntry.type === '24h')) return false;
    if (shiftType === 'noc'   &&  prevEntry.type === '24h')                              return false;
    if (shiftType === '24h'   && (prevEntry.type === '24h' || prevEntry.type === 'noc')) return false;
  }
  if (nextEntry) {
    if ((shiftType === 'noc' || shiftType === '24h') && nextEntry.type === 'dzien') return false;
    if (shiftType === '24h' && (nextEntry.type === '24h' || nextEntry.type === 'noc')) return false;
    if (shiftType === 'noc' &&  nextEntry.type === '24h') return false;
  }

  if (cfg.maxN && shiftType === 'noc') {
    const maxN = cfg.maxNVal || 3;
    let streak = 0, d = prevDate;
    for (let k = 0; k < maxN; k++) {
      if (schedule.some((e, i) => i !== excludeIdx && e.wid === workerId && e.date === d && e.type === 'noc')) {
        streak++; d = addDays(d, -1);
      } else break;
    }
    if (streak >= maxN) return false;
  }

  if (cfg.maxD && shiftType === 'dzien') {
    const maxD = cfg.maxDVal || 3;
    let streak = 0, d = prevDate;
    for (let k = 0; k < maxD; k++) {
      if (schedule.some((e, i) => i !== excludeIdx && e.wid === workerId && e.date === d && e.type === 'dzien')) {
        streak++; d = addDays(d, -1);
      } else break;
    }
    if (streak >= maxD) return false;
  }

  if (cfg.maxSun && new Date(shiftDate).getDay() === 0) {
    let suns = 0;
    for (let w = 7; w <= 14; w += 7) {
      if (schedule.some((e, i) => i !== excludeIdx && e.wid === workerId && e.date === addDays(shiftDate, -w)))
        suns++;
      else break;
    }
    if (suns >= 2) return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────
// INICJALNE ROZWIĄZANIE (zachłanne, feasibility-aware)
// O(n·w) dzięki running total zamiast filter w pętli
// ─────────────────────────────────────────────────────────────────────

function buildInitialSolution(shifts, activeWorkers, cfg, vacationHours) {
  const schedule = [];
  const running  = {};
  for (const w of activeWorkers) running[w.id] = vacationHours[w.id] || 0;

  for (const shift of shifts) {
    let candidates = activeWorkers.filter(w =>
      isHardFeasible(w.id, shift.date, shift.type, schedule, -1, cfg)
    );

    if (!candidates.length) {
      // Fallback 1: tylko blokady kalendarza (bez ograniczeń odpoczynku)
      candidates = activeWorkers.filter(w => {
        const a = w.days[shift.date];
        if (a === 'vac' || a === 'off') return false;
        if (shift.type === 'dzien' && (a === 'no-d' || a === 'no-both')) return false;
        if (shift.type === 'noc'   && (a === 'no-n' || a === 'no-both')) return false;
        if (shift.type === '24h'   && (a === 'no-d' || a === 'no-n' || a === 'no-both')) return false;
        return true;
      });
    }

    if (!candidates.length) candidates = activeWorkers; // fallback absolutny

    // Wybierz z najmniejszą sumą godzin + mały szum dla różnorodności między restartami
    const chosen = candidates.reduce((best, w) => {
      const hW    = (running[w.id]    || 0) + Math.random() * 2;
      const hBest = (running[best.id] || 0) + Math.random() * 2;
      return hW < hBest ? w : best;
    });

    running[chosen.id] = (running[chosen.id] || 0) + shift.hours;
    schedule.push({
      wid:   chosen.id,
      date:  shift.date,
      type:  shift.type,
      hours: shift.hours,
      ...(shift.slot ? { slot: shift.slot } : {}),
    });
  }

  return schedule;
}

// ─────────────────────────────────────────────────────────────────────
// FUNKCJA ENERGII — używa Map dla O(1) lookup
// ─────────────────────────────────────────────────────────────────────

function calculateEnergy(schedule, shifts, cfg, year, month, activeWorkers, vacationHours) {
  let cost = 0;

  const byWorker    = new Map(); // workerId → [entries]
  const byDayWorker = new Map(); // "date|workerId" → [entries]
  const occupancy   = new Map(); // "date|type|slot" → count

  for (const e of schedule) {
    if (!byWorker.has(e.wid))    byWorker.set(e.wid, []);
    byWorker.get(e.wid).push(e);

    const dk = `${e.date}|${e.wid}`;
    if (!byDayWorker.has(dk))    byDayWorker.set(dk, []);
    byDayWorker.get(dk).push(e);

    const ok = `${e.date}|${e.type}|${e.slot ?? ''}`;
    occupancy.set(ok, (occupancy.get(ok) || 0) + 1);
  }

  // 1. Nieobsadzone / podwójne zmiany
  for (const s of shifts) {
    const cnt = occupancy.get(`${s.date}|${s.type}|${s.slot ?? ''}`) || 0;
    if (cnt === 0)    cost += P.UNFILLED;
    else if (cnt > 1) cost += P.UNFILLED * (cnt - 1);
  }

  // 2. Kary per wpis
  for (const entry of schedule) {
    const worker = state.workers.find(w => w.id === entry.wid);
    if (!worker) { cost += P.UNFILLED; continue; }

    const ann = worker.days[entry.date];
    if (ann === 'vac' || ann === 'off') cost += P.VACATION;
    if (entry.type === 'dzien' && (ann === 'no-d' || ann === 'no-both')) cost += P.VACATION;
    if (entry.type === 'noc'   && (ann === 'no-n' || ann === 'no-both')) cost += P.VACATION;
    if (entry.type === '24h'   && (ann === 'no-d' || ann === 'no-n' || ann === 'no-both')) cost += P.VACATION;

    if ((byDayWorker.get(`${entry.date}|${entry.wid}`) || []).length > 1)
      cost += P.DUPLICATE / 2;

    if (entry.type === '24h' && cfg.max24) {
      const c = (byWorker.get(entry.wid) || []).filter(e => e.type === '24h').length;
      if (c > cfg.max24Val) cost += P.MAX24;
    }

    const prevEntry = (byDayWorker.get(`${addDays(entry.date, -1)}|${entry.wid}`) || [])[0];
    if (prevEntry) {
      if (
        (entry.type === 'dzien' && (prevEntry.type === 'noc' || prevEntry.type === '24h')) ||
        (entry.type === 'noc'   &&  prevEntry.type === '24h') ||
        (entry.type === '24h'   && (prevEntry.type === '24h' || prevEntry.type === 'noc'))
      ) cost += P.REST;
    }
  }

  // 3. reqDays
  for (const worker of activeWorkers) {
    if (!worker.reqDays?.length) continue;
    const ws = byWorker.get(worker.id) || [];
    for (const s of shifts) {
      if (s.type !== 'dzien') continue;
      const wd = new Date(s.date).getDay();
      if (!worker.reqDays.includes(wd)) continue;
      if (!ws.some(e => e.date === s.date && e.type === 'dzien')) cost += P.REQ_DAY;
    }
  }

  // 4. minDays (grupowanie per tydzień)
  if (activeWorkers.some(w => (w.minDays || 0) > 0)) {
    const mondaySet = new Set();
    for (const s of shifts) {
      if (s.type !== 'dzien') continue;
      const d = new Date(s.date), wd = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1));
      mondaySet.add(mon.toISOString().slice(0, 10));
    }
    for (const worker of activeWorkers) {
      if (!worker.minDays) continue;
      const ws = byWorker.get(worker.id) || [];
      for (const monStr of mondaySet) {
        const mon = new Date(monStr);
        let dayShifts = 0, workdays = 0;
        for (let i = 0; i < 5; i++) {
          const day = new Date(mon);
          day.setDate(mon.getDate() + i);
          const ds = day.toISOString().slice(0, 10);
          if (day.getFullYear() !== year || day.getMonth() + 1 !== month) continue;
          if (!shifts.some(s => s.date === ds && s.type === 'dzien')) continue;
          workdays++;
          const a = worker.days[ds];
          if (a === 'vac' || a === 'off' || a === 'no-d' || a === 'no-both') continue;
          if (ws.some(e => e.date === ds && e.type === 'dzien')) dayShifts++;
        }
        const target = Math.min(worker.minDays, workdays);
        if (dayShifts < target) cost += P.MIN_DAYS * (target - dayShifts);
      }
    }
  }

  // 5. Nocki / dniówki z rzędu
  for (const worker of activeWorkers) {
    const ws = (byWorker.get(worker.id) || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    if (cfg.maxN) {
      let streak = 0, prev = null;
      for (const e of ws) {
        if (e.type === 'noc') {
          streak = (prev && addDays(prev, 1) === e.date) ? streak + 1 : 1;
          if (streak > (cfg.maxNVal || 3)) cost += P.CONSECUTIVE;
        } else streak = 0;
        prev = e.date;
      }
    }
    if (cfg.maxD) {
      let streak = 0, prev = null;
      for (const e of ws) {
        if (e.type === 'dzien') {
          streak = (prev && addDays(prev, 1) === e.date) ? streak + 1 : 1;
          if (streak > (cfg.maxDVal || 3)) cost += P.CONSECUTIVE;
        } else streak = 0;
        prev = e.date;
      }
    }
  }

  // 6. Przekroczenie docelowych godzin
  for (const worker of activeWorkers) {
    const quota = cfg.quotas[worker.id];
    if (!quota) continue;
    const total = (vacationHours[worker.id] || 0) +
      (byWorker.get(worker.id) || []).reduce((s, e) => s + e.hours, 0);
    if (total > quota.target + cfg.tol)
      cost += P.QUOTA * (total - quota.target - cfg.tol);
  }

  // 7. GŁÓWNY CEL: odchylenie godzinowe (max − min)
  const totals = activeWorkers.map(w =>
    (vacationHours[w.id] || 0) + (byWorker.get(w.id) || []).reduce((s, e) => s + e.hours, 0)
  );
  if (totals.length > 1)
    cost += P.DEVIATION * (Math.max(...totals) - Math.min(...totals));

  return cost;
}

// ─────────────────────────────────────────────────────────────────────
// RUCHY SA — feasibility-preserving
// ─────────────────────────────────────────────────────────────────────

/**
 * Ruch 1: Przypisz zmianę przeciążonego pracownika do niedociążonego.
 * workerHours: precomputed { [id]: totalHours }, odświeżane co N iteracji.
 */
function moveSmartReassign(schedule, shifts, activeWorkers, cfg, workerHours) {
  if (!schedule.length) return null;

  // Wybierz zmianę do podmiany: 60% — ze zbioru 25% najbardziej przeciążonych
  let shiftIdx;
  if (Math.random() < 0.6) {
    const topN   = Math.max(1, Math.ceil(schedule.length * 0.25));
    const sorted = schedule.map((e, i) => ({ i, h: workerHours[e.wid] || 0 }))
                           .sort((a, b) => b.h - a.h);
    shiftIdx = sorted[Math.floor(Math.random() * topN)].i;
  } else {
    shiftIdx = Math.floor(Math.random() * schedule.length);
  }

  const target   = schedule[shiftIdx];
  const shiftDef = shifts.find(s =>
    s.date === target.date && s.type === target.type && (s.slot ?? '') === (target.slot ?? '')
  );
  if (!shiftDef) return null;

  const feasible = activeWorkers.filter(w =>
    w.id !== target.wid &&
    isHardFeasible(w.id, target.date, target.type, schedule, shiftIdx, cfg)
  );
  if (!feasible.length) return null;

  // 70% — ten z najmniejszymi godzinami, 30% — losowy dla różnorodności
  const chosen = Math.random() < 0.7
    ? feasible.reduce((b, w) => (workerHours[w.id] || 0) < (workerHours[b.id] || 0) ? w : b)
    : feasible[Math.floor(Math.random() * feasible.length)];

  const newSchedule = schedule.slice();
  newSchedule[shiftIdx] = { ...target, wid: chosen.id };
  return newSchedule;
}

/**
 * Ruch 2: Zamień pracowników między dwiema zmianami.
 * Preferuje pary (przeciążony ↔ niedociążony). Obie strony muszą być feasible.
 */
function moveSwapValidated(schedule, shifts, activeWorkers, cfg, workerHours) {
  if (schedule.length < 2) return null;

  const sorted   = activeWorkers.slice().sort((a, b) => (workerHours[a.id] || 0) - (workerHours[b.id] || 0));
  const underW   = sorted[0];
  const overW    = sorted[sorted.length - 1];
  const targeted = underW.id !== overW.id && Math.random() < 0.6;

  for (let attempt = 0; attempt < 20; attempt++) {
    let i1, i2;

    if (targeted && attempt < 10) {
      const overS  = schedule.map((e, i) => ({ e, i })).filter(({ e }) => e.wid === overW.id);
      const underS = schedule.map((e, i) => ({ e, i })).filter(({ e }) => e.wid === underW.id);
      if (!overS.length || !underS.length) break;
      i1 = overS [Math.floor(Math.random() *  overS.length)].i;
      i2 = underS[Math.floor(Math.random() * underS.length)].i;
    } else {
      i1 = Math.floor(Math.random() * schedule.length);
      i2 = Math.floor(Math.random() * schedule.length);
    }

    if (i1 === i2) continue;
    const e1 = schedule[i1];
    const e2 = schedule[i2];
    if (e1.wid === e2.wid) continue;

    const s1 = shifts.find(s => s.date === e1.date && s.type === e1.type && (s.slot ?? '') === (e1.slot ?? ''));
    const s2 = shifts.find(s => s.date === e2.date && s.type === e2.type && (s.slot ?? '') === (e2.slot ?? ''));
    if (!s1 || !s2) continue;

    if (
      isHardFeasible(e2.wid, s1.date, s1.type, schedule, i1, cfg) &&
      isHardFeasible(e1.wid, s2.date, s2.type, schedule, i2, cfg)
    ) {
      const newSchedule = schedule.slice();
      newSchedule[i1] = { ...e1, wid: e2.wid };
      newSchedule[i2] = { ...e2, wid: e1.wid };
      return newSchedule;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────
// GŁÓWNA FUNKCJA SA — multi-start
// ─────────────────────────────────────────────────────────────────────

/**
 * @param {Array}    shifts       - zmiany do obsadzenia
 * @param {object}   cfg          - konfiguracja (quotas, tol, maxN, maxD, max24, ...)
 * @param {number}   year
 * @param {number}   month
 * @param {number}   timeLimitMs  - łączny limit czasu w ms
 * @param {number}   targetCount  - ile grafików zebrać
 * @param {Function} onProgress   - callback({ phase, iteration, energy, temperature, found })
 * @returns {{ solutions: Array[], bestEnergy: number }}
 */
export async function runSimulatedAnnealing(shifts, cfg, year, month, timeLimitMs, targetCount, onProgress) {
  const activeWorkers = state.teamSession
    ? state.workers.filter(w => !w.disabled)
    : [...state.workers];

  if (!activeWorkers.length || !shifts.length)
    return { solutions: [], bestEnergy: Infinity };

  // Precompute vacation hours — stałe przez cały czas działania SA
  const vacationHours = {};
  for (const w of activeWorkers)
    vacationHours[w.id] = calculateVacationHours(w, year, month);

  const INITIAL_TEMP  = 400;
  const COOLING_RATE  = 0.9997;
  const MIN_TEMP      = 0.1;

  const deadline           = Date.now() + timeLimitMs;
  const collectedSolutions = [];
  const seenKeys           = new Set();

  let globalBestSolution = null;
  let globalBestEnergy   = Infinity;

  const restartCount   = Math.max(3, targetCount + 1);
  const timePerRestart = Math.floor(timeLimitMs / restartCount);

  for (let restartIdx = 0; restartIdx < restartCount && Date.now() < deadline; restartIdx++) {
    const restartDeadline = Math.min(Date.now() + timePerRestart, deadline);

    let current       = buildInitialSolution(shifts, activeWorkers, cfg, vacationHours);
    let currentEnergy = calculateEnergy(current, shifts, cfg, year, month, activeWorkers, vacationHours);
    let localBest       = current.slice();
    let localBestEnergy = currentEnergy;

    let temp = INITIAL_TEMP;
    let iter = 0;

    // workerHours: precomputed, odświeżane co 50 iteracji
    const workerHours = {};
    const refreshWorkerHours = () => {
      for (const w of activeWorkers) {
        workerHours[w.id] = (vacationHours[w.id] || 0) +
          current.filter(e => e.wid === w.id).reduce((s, e) => s + e.hours, 0);
      }
    };
    refreshWorkerHours();

    while (temp > MIN_TEMP && Date.now() < restartDeadline) {
      iter++;
      if (iter % 50 === 0) refreshWorkerHours();

      const neighbor = Math.random() < 0.60
        ? moveSmartReassign(current, shifts, activeWorkers, cfg, workerHours)
        : moveSwapValidated(current, shifts, activeWorkers, cfg, workerHours);

      if (!neighbor) continue;

      const neighborEnergy = calculateEnergy(neighbor, shifts, cfg, year, month, activeWorkers, vacationHours);
      const delta = neighborEnergy - currentEnergy;

      if (delta < 0 || Math.random() < Math.exp(-delta / temp)) {
        current       = neighbor;
        currentEnergy = neighborEnergy;

        if (currentEnergy < localBestEnergy) {
          localBest       = current.slice();
          localBestEnergy = currentEnergy;
        }
      }

      temp *= COOLING_RATE;
    }

    if (localBestEnergy < globalBestEnergy) {
      globalBestEnergy   = localBestEnergy;
      globalBestSolution = localBest.slice();
    }

    const key = localBest.map(e => `${e.wid}:${e.date}:${e.type}`).sort().join('|');
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      collectedSolutions.push({ schedule: localBest.slice(), energy: localBestEnergy });
    }

    if (collectedSolutions.length >= targetCount) break;

    // Yield do głównego wątku — pozwala przeglądarce odmalować progress bar
    if (onProgress) onProgress({ phase: `restart ${restartIdx + 1}/${restartCount}`, energy: globalBestEnergy, found: collectedSolutions.length, restartIdx, restartCount });
    await yieldToMain();
  }

  collectedSolutions.sort((a, b) => a.energy - b.energy);
  const solutions = collectedSolutions.map(s => s.schedule);

  if (solutions.length === 0 && globalBestSolution)
    solutions.push(globalBestSolution);

  return { solutions, bestEnergy: globalBestEnergy };
}
