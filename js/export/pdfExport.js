// ── EKSPORT DO PDF ─────────────────────────────────────────────────
import * as state from '../state.js';
import { MONTHS, DNS } from '../constants.js';
import { daysInMonth, dateString, dayOfWeek } from '../utils.js';
import { toast } from '../utils.js';

/**
 * Eksportuje grafik(i) do pliku HTML zoptymalizowanego pod druk (A4 landscape).
 * @param {number} year
 * @param {number} month
 * @param {number|undefined} onlyIndex - indeks konkretnego grafiku lub undefined = wszystkie
 */
export function exportPDF(year, month, onlyIndex) {
  const indices = onlyIndex !== undefined
    ? [onlyIndex]
    : [...Array(state.schedules.length).keys()];
  const days = daysInMonth(year, month);
  const ROMAN = ['I', 'II', 'III'];

  let body = '';

  indices.forEach((scheduleIndex, positionInExport) => {
    const schedule = state.schedules[scheduleIndex];
    const entryLookup = {};
    schedule.forEach(e => { entryLookup[`${e.wid}_${e.date}`] = e; });

    let rows = '';
    state.workers.forEach(worker => {
      let workerHours = 0;
      let cells = '';
      for (let d = 1; d <= days; d++) {
        const date = dateString(year, month, d);
        const weekday = dayOfWeek(year, month, d);
        const isWeekend = weekday === 0 || weekday === 6;
        const annotation = worker.days[date];
        const entry = entryLookup[`${worker.id}_${date}`];
        const shiftType = entry ? entry.type : undefined;

        let bg = '';
        let label = '';

        if (annotation === 'vac') {
          label = 'U';
          bg = isWeekend ? '#e8e0ff' : '#ffff00';
          if (!isWeekend) workerHours += 8;
        } else if (annotation === 'off') {
          label = '—'; bg = '#ffc000';
        } else if (shiftType === 'dzien') {
          const shiftHours = entry.hours || 12;
          label = entry.slot ? ROMAN[entry.slot - 1] : 'D';
          bg = '#92d050';
          workerHours += shiftHours;
        } else if (shiftType === 'noc') {
          label = 'N'; bg = '#00b0f0'; workerHours += 12;
        } else if (shiftType === '24h') {
          label = '24h'; bg = '#87CEEB'; workerHours += 24;
        } else {
          label = '';
          bg = isWeekend ? '#f0f0f0' : '';
        }

        cells += `<td style="background:${bg};border:1px solid #aaa;padding:1px 2px;text-align:center;font-size:7pt;min-width:18px">${label}</td>`;
      }
      rows += `<tr>
        <td style="border:1px solid #aaa;padding:1px 4px;white-space:nowrap;font-size:8pt">${worker.name}</td>
        ${cells}
        <td style="border:1px solid #aaa;padding:1px 4px;text-align:center;font-weight:700;font-size:8pt">${workerHours}h</td>
      </tr>`;
    });

    let headerCols = '';
    for (let d = 1; d <= days; d++) {
      const weekday = dayOfWeek(year, month, d);
      const isWeekend = weekday === 0 || weekday === 6;
      headerCols += `<th style="border:1px solid #aaa;padding:1px 2px;text-align:center;background:${isWeekend ? '#cc0000' : '#d9d9d9'};color:${isWeekend ? '#fff' : '#000'};font-size:7pt;min-width:18px">
        ${d}<br><span style="font-size:5pt">${DNS[weekday]}</span>
      </th>`;
    }

    const pageBreak = positionInExport < indices.length - 1
      ? '<div style="page-break-after:always"></div>'
      : '';

    body += `<h2 style="background:#4a5426;color:#fff;font-family:Arial;font-size:11pt;padding:6px 10px;margin:0 0 4px;border-radius:3px">Grafik ${scheduleIndex + 1} — ${MONTHS[month]} ${year}</h2>
<table style="border-collapse:collapse;width:100%;font-family:Arial">
  <thead>
    <tr>
      <th style="border:1px solid #aaa;padding:1px 4px;background:#d9d9d9;text-align:left;font-size:8pt">Pracownik</th>
      ${headerCols}
      <th style="border:1px solid #aaa;padding:1px 4px;background:#d9d9d9;text-align:center;font-size:8pt">Suma</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>${pageBreak}`;
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Grafik ${MONTHS[month]} ${year}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 10mm }
  @page { size: A4 landscape; margin: 10mm }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important }
  @media print { body { padding: 0 } }
</style></head><body>${body}</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'width=900,height=700');
  if (!win) {
    URL.revokeObjectURL(url);
    toast('⚠ Zezwól na wyskakujące okna, aby eksportować PDF');
    return;
  }
  win.addEventListener('load', () => { win.print(); URL.revokeObjectURL(url); }, { once: true });
}
