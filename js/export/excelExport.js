// ── EKSPORT DO EXCEL ────────────────────────────────────────────────
// Format HTML-table z kolorami — działa w Excel i LibreOffice Calc.
import * as state from '../state.js';
import { MONTHS } from '../constants.js';
import { daysInMonth, dateString, dayOfWeek } from '../utils.js';
import { toast } from '../utils.js';

/**
 * Eksportuje grafik(i) do pliku .xls.
 * @param {number} year
 * @param {number} month
 * @param {number|undefined} onlyIndex
 */
export function exportXL(year, month, onlyIndex) {
  const days = daysInMonth(year, month);

  // Czcionki
  const FONT = 'font-family:Calibri,Arial,sans-serif;font-size:10px;';
  const BORDER = 'border:1px solid #808080;';

  // Paleta kolorów
  const C = {
    title:    { bg: '#4a5426', fg: '#ffffff' },
    hdrDay:   { bg: '#d9d9d9', fg: '#000000' },
    hdrSat:   { bg: '#ff0000', fg: '#ffffff' },
    hdrSun:   { bg: '#ff0000', fg: '#ffffff' },
    dzien:    { bg: '#92d050', fg: '#000000' },
    noc:      { bg: '#00b0f0', fg: '#000000' },
    h24:      { bg: '#87CEEB', fg: '#000000' },
    vacWD:    { bg: '#ffff00', fg: '#000000' },
    vacWE:    { bg: '#ffff00', fg: '#000000' },
    off:      { bg: '#ffc000', fg: '#000000' },
    empty:    { bg: '#ffffff', fg: '#000000' },
    emptyWE:  { bg: '#f2f2f2', fg: '#808080' },
    sum:      { bg: '#d9e2f3', fg: '#000000' },
    plain:    { bg: '#ffffff', fg: '#000000' },
    alt:      { bg: '#f2f2f2', fg: '#000000' },
    sumDzien: { bg: '#e2efda', fg: '#000000' },
    sumNoc:   { bg: '#dce6f1', fg: '#000000' },
    sumCtrl:  { bg: '#fce4d6', fg: '#000000' },
    sumSklad: { bg: '#d9d9d9', fg: '#000000' },
    legSick:  { bg: '#7030a0', fg: '#ffffff' },
    legFree:  { bg: '#ffc000', fg: '#000000' },
    legVac:   { bg: '#ffff00', fg: '#000000' },
  };

  // Helper: buduje komórkę tabeli z stylami
  function td(label, bg, fg, opts = {}) {
    const bold = opts.bold ? 'font-weight:700;' : '';
    const align = opts.align || 'center';
    const width = opts.width ? `width:${opts.width};min-width:${opts.width};max-width:${opts.width};` : '';
    const colspan = opts.colspan ? ` colspan="${opts.colspan}"` : '';
    const rowspan = opts.rowspan ? ` rowspan="${opts.rowspan}"` : '';
    const extra = opts.extra || '';
    return `<td${colspan}${rowspan} style="background:${bg};color:${fg};${bold}text-align:${align};${BORDER}padding:1px 2px;white-space:nowrap;${width}${FONT}${extra}">${label}</td>`;
  }

  const indicesToExport = onlyIndex !== undefined
    ? [onlyIndex]
    : [...Array(state.schedules.length).keys()];
  const ROMAN = ['I', 'II', 'III'];
  const totalColumns = 3 + days + 1; // Lp. + Imię + Nazwisko + dni + Suma

  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>`;

  indicesToExport.forEach(si => {
    html += `<x:ExcelWorksheet><x:Name>Grafik ${si + 1}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>`;
  });

  html += `</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse:collapse; margin-bottom:24px }
  td { mso-number-format:\\@; }
</style></head><body>`;

  indicesToExport.forEach(si => {
    const schedule = state.schedules[si];
    const entryLookup = {};
    schedule.forEach(e => { entryLookup[`${e.wid}_${e.date}`] = e; });

    html += `<table>`;

    // Tytuł grafiku
    html += `<tr>${td(`GRAFIK ${si + 1} — ${MONTHS[month].toUpperCase()} ${year}`, C.title.bg, C.title.fg, { colspan: totalColumns, bold: true, align: 'center' })}</tr>`;

    // Nagłówek: Lp. | Imię | Nazwisko | dni...
    html += `<tr>`;
    html += td('Lp.', C.hdrDay.bg, C.hdrDay.fg, { bold: true, width: '25px' });
    html += td('Imię', C.hdrDay.bg, C.hdrDay.fg, { bold: true, align: 'left', width: '75px' });
    html += td('Nazwisko', C.hdrDay.bg, C.hdrDay.fg, { bold: true, align: 'left', width: '80px' });
    for (let d = 1; d <= days; d++) {
      const weekday = dayOfWeek(year, month, d);
      const isWeekend = weekday === 6 || weekday === 0;
      const hBg = isWeekend ? C.hdrSat.bg : C.hdrDay.bg;
      const hFg = isWeekend ? C.hdrSat.fg : C.hdrDay.fg;
      html += td(`${d}`, hBg, hFg, { bold: true, width: '26px' });
    }
    html += td('', C.hdrDay.bg, C.hdrDay.fg, { bold: true, width: '35px' });
    html += `</tr>`;

    // Wiersze pracowników
    state.workers.forEach((worker, workerIndex) => {
      const rowBg = workerIndex % 2 === 0 ? C.plain.bg : C.alt.bg;
      const nameParts = worker.name.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      html += `<tr>`;
      html += td(workerIndex + 1, rowBg, '#000000', { width: '25px' });
      html += td(firstName, rowBg, '#000000', { bold: true, align: 'left', width: '75px' });
      html += td(lastName, rowBg, '#000000', { align: 'left', width: '80px' });

      let total = 0;
      for (let d = 1; d <= days; d++) {
        const date = dateString(year, month, d);
        const weekday = dayOfWeek(year, month, d);
        const isWeekend = weekday === 0 || weekday === 6;
        const annotation = worker.days[date];
        const entry = entryLookup[`${worker.id}_${date}`];
        const shiftType = entry ? entry.type : undefined;

        let label = '';
        let cellBg = isWeekend ? C.emptyWE.bg : C.empty.bg;
        let cellFg = isWeekend ? C.emptyWE.fg : C.empty.fg;

        if (annotation === 'vac') {
          label = 'U';
          cellBg = isWeekend ? C.vacWE.bg : C.vacWD.bg;
          cellFg = isWeekend ? C.vacWE.fg : C.vacWD.fg;
          if (!isWeekend) total += 8;
        } else if (annotation === 'off') {
          label = 'WN'; cellBg = C.off.bg; cellFg = C.off.fg;
        } else if (shiftType === 'dzien') {
          label = entry.slot ? ROMAN[entry.slot - 1] : 'D';
          cellBg = C.dzien.bg; cellFg = C.dzien.fg;
          total += (entry.hours || 12);
        } else if (shiftType === 'noc') {
          label = 'N'; cellBg = C.noc.bg; cellFg = C.noc.fg; total += 12;
        } else if (shiftType === '24h') {
          label = '24'; cellBg = C.h24.bg; cellFg = C.h24.fg; total += 24;
        }

        html += td(label, cellBg, cellFg, { bold: !!label, width: '26px' });
      }
      html += td(total > 0 ? total : '', C.sum.bg, C.sum.fg, { bold: true, width: '35px' });
      html += `</tr>`;
    });

    // Pusta separacja
    html += `<tr><td colspan="${totalColumns}" style="height:4px;${BORDER}background:#fff"></td></tr>`;

    // Powtórzony nagłówek dni
    html += `<tr>`;
    html += td('', '#ffffff', '#000000', { width: '25px' });
    html += td('', '#ffffff', '#000000', { width: '75px' });
    html += td('', '#ffffff', '#000000', { width: '80px' });
    for (let d = 1; d <= days; d++) {
      const weekday = dayOfWeek(year, month, d);
      const isWeekend = weekday === 6 || weekday === 0;
      const hBg = isWeekend ? C.hdrSat.bg : C.hdrDay.bg;
      const hFg = isWeekend ? C.hdrSat.fg : C.hdrDay.fg;
      html += td(`${d}`, hBg, hFg, { bold: true, width: '26px' });
    }
    html += td('SUM', C.hdrDay.bg, C.hdrDay.fg, { bold: true, width: '35px' });
    html += `</tr>`;

    html += `<tr><td colspan="${totalColumns}" style="height:4px;border:none;background:#fff"></td></tr>`;

    // Wiersz podsumowania: liczba dniówek per dzień
    html += `<tr>`;
    html += td('', C.sumDzien.bg, C.sumDzien.fg, { width: '25px' });
    html += td('Dniówki', C.sumDzien.bg, C.sumDzien.fg, { bold: true, align: 'left', colspan: 2 });
    let totalDayShifts = 0;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      let cnt = 0;
      state.workers.forEach(w => { if ((entryLookup[`${w.id}_${date}`] || {}).type === 'dzien') cnt++; });
      totalDayShifts += cnt;
      html += td(cnt || 0, C.sumDzien.bg, C.sumDzien.fg, { width: '26px' });
    }
    html += td(totalDayShifts, C.sumDzien.bg, C.sumDzien.fg, { bold: true, width: '35px' });
    html += `</tr>`;

    // Wiersz podsumowania: liczba nocek per dzień
    html += `<tr>`;
    html += td('', C.sumNoc.bg, C.sumNoc.fg, { width: '25px' });
    html += td('Nocki', C.sumNoc.bg, C.sumNoc.fg, { bold: true, align: 'left', colspan: 2 });
    let totalNightShifts = 0;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      let cnt = 0;
      state.workers.forEach(w => { if ((entryLookup[`${w.id}_${date}`] || {}).type === 'noc') cnt++; });
      totalNightShifts += cnt;
      html += td(cnt || 0, C.sumNoc.bg, C.sumNoc.fg, { width: '26px' });
    }
    html += td(totalNightShifts, C.sumNoc.bg, C.sumNoc.fg, { bold: true, width: '35px' });
    html += `</tr>`;

    // SUMA kontrolna (D+N+24h per dzień)
    html += `<tr>`;
    html += td('', C.sumCtrl.bg, C.sumCtrl.fg, { width: '25px' });
    html += td('SUMA kontrolna', C.sumCtrl.bg, C.sumCtrl.fg, { bold: true, align: 'left', colspan: 2 });
    let totalAllShifts = 0;
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      let cnt = 0;
      state.workers.forEach(w => {
        const type = (entryLookup[`${w.id}_${date}`] || {}).type;
        if (type === 'dzien' || type === 'noc' || type === '24h') cnt++;
      });
      totalAllShifts += cnt;
      html += td(cnt || 0, C.sumCtrl.bg, C.sumCtrl.fg, { width: '26px' });
    }
    html += td(totalAllShifts, C.sumCtrl.bg, C.sumCtrl.fg, { bold: true, width: '35px' });
    html += `</tr>`;

    // Wiersz kontroli obsady (OK / BŁĄD)
    html += `<tr>`;
    html += td('', C.sumSklad.bg, C.sumSklad.fg, { width: '25px' });
    html += td('SKŁAD', C.sumSklad.bg, C.sumSklad.fg, { bold: true, align: 'left', colspan: 2 });
    for (let d = 1; d <= days; d++) {
      const date = dateString(year, month, d);
      const weekday = dayOfWeek(year, month, d);
      const isWeekend = weekday === 0 || weekday === 6;
      let hasDayShift = false, hasNightShift = false, has24h = false;
      state.workers.forEach(w => {
        const type = (entryLookup[`${w.id}_${date}`] || {}).type;
        if (type === 'dzien') hasDayShift = true;
        if (type === 'noc') hasNightShift = true;
        if (type === '24h') has24h = true;
      });
      const ok = isWeekend
        ? has24h || (hasDayShift && hasNightShift)
        : hasDayShift && hasNightShift;
      const okBg = ok ? '#c6efce' : '#ffc7ce';
      const okFg = ok ? '#006100' : '#9c0006';
      html += td(ok ? 'OK' : 'BŁĄD', okBg, okFg, { bold: true, width: '26px', extra: 'font-size:8px;' });
    }
    html += td('', C.sumSklad.bg, C.sumSklad.fg, { width: '35px' });
    html += `</tr>`;

    html += `<tr><td colspan="${totalColumns}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // Wiersz tytułowy (ref)
    html += `<tr>`;
    html += td('', C.plain.bg, C.plain.fg, { width: '25px' });
    html += td(`GRAFIK ${si + 1} — ${MONTHS[month].toUpperCase()} ${year}`, '#ffffff', '#000000', { bold: true, align: 'left', colspan: 2 });
    html += td('', '#ffffff', '#000000', { colspan: days - 1 });
    html += td('', '#ffffff', '#000000', {});
    html += `</tr>`;

    html += `<tr><td colspan="${totalColumns}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // Legenda
    html += `<tr>${td('', C.plain.bg, C.plain.fg, { width: '25px' })}${td('CHOROBOWE', C.legSick.bg, C.legSick.fg, { bold: true, align: 'left', colspan: 2 })}<td colspan="${days - 1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td></tr>`;
    html += `<tr>${td('', C.plain.bg, C.plain.fg, { width: '25px' })}${td('WOLNE NIEPŁATNE', C.legFree.bg, C.legFree.fg, { bold: true, align: 'left', colspan: 2 })}<td colspan="${days - 1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td></tr>`;
    html += `<tr>${td('', C.plain.bg, C.plain.fg, { width: '25px' })}${td('URLOP PŁATNY', C.legVac.bg, C.legVac.fg, { bold: true, align: 'left', colspan: 2 })}<td colspan="${days - 1}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td></tr>`;

    html += `<tr><td colspan="${totalColumns}" style="height:6px;border:none;background:#fff"></td></tr>`;

    // Statystyki D/N per pracownik
    html += `<tr>`;
    html += td('', C.plain.bg, C.plain.fg, { width: '25px' });
    html += td('', '#ffffff', '#000000', { colspan: 2 });
    html += td('', '#ffffff', '#000000', { colspan: 2 });
    html += td('d', '#d9d9d9', '#000000', { bold: true });
    html += td('n', '#d9d9d9', '#000000', { bold: true });
    html += `<td colspan="${days - 5}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
    html += `</tr>`;

    state.workers.forEach(worker => {
      const workerShifts = schedule.filter(e => e.wid === worker.id);
      const dayCount = workerShifts.filter(e => e.type === 'dzien').length;
      const nightCount = workerShifts.filter(e => e.type === 'noc').length;
      html += `<tr>`;
      html += td('', C.plain.bg, C.plain.fg, { width: '25px' });
      html += td('', '#ffffff', '#000000', { colspan: 2 });
      html += td('', '#ffffff', '#000000', { colspan: 2 });
      html += td(dayCount, '#ffffff', '#000000', {});
      html += td(nightCount, '#ffffff', '#000000', {});
      html += `<td colspan="${days - 5}" style="border:none;background:#fff"></td><td style="border:none;background:#fff"></td>`;
      html += `</tr>`;
    });

    html += `</table>`;
  });

  html += '</body></html>';

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `grafik_${MONTHS[month].toLowerCase()}_${year}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  toast('✓ Pobrano Excel (.xls z kolorami)');
}
