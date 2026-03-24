// ── CONSTANTS ──────────────────────────────────────────────────────
// Kolory przypisywane kolejnym pracownikom (cyklicznie)
export const COLORS = [
  '#6c63ff', '#e11d48', '#16a34a', '#d97706',
  '#0891b2', '#7c3aed', '#dc2626', '#059669',
];

// Pełne nazwy miesięcy (indeks 1–12, indeks 0 pusty)
export const MONTHS = [
  '', 'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
];

// Skrócone nazwy miesięcy (indeks 1–12, indeks 0 pusty)
export const MSHORT = [
  '', 'Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze',
  'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru',
];

// Skrócone nazwy dni tygodnia (indeks 0 = Niedziela, zgodnie z getDay())
export const DNS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

// Klucz localStorage dla trybu lokalnego
export const LOCAL_STORAGE_KEY = 'shiftmaster_v6';

/*
 * Znaczenia wartości w polu worker.days[date]:
 *   'vac'      = urlop (Pn-Pt +8h, weekend 0h)
 *   'off'      = niedostępny (0h, nie można przypisać)
 *   'no-d'     = tylko nocki (blokada dniówki)
 *   'no-n'     = tylko dniówki (blokada nocki)
 *   'no-both'  = obie blokady
 */
