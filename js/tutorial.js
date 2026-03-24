// ── TUTORIAL ──────────────────────────────────────────────────────
// Interaktywny przewodnik po funkcjach aplikacji.

export const TUT_STEPS = [
  {
    icon: '👋',
    title: 'Witaj w ShiftMaster!',
    desc: 'ShiftMaster to generator grafików zmianowych dla zespołów. Każdy członek wpisuje swoje urlopy i nieobecności, a lider generuje i zatwierdza gotowy grafik.\n\nTen tutorial przeprowadzi Cię przez wszystkie funkcje aplikacji.',
  },
  {
    icon: '🔐',
    title: '1. Konto użytkownika',
    desc: 'Przy pierwszym uruchomieniu zarejestruj się podając:\n• <b>Login</b> — unikalny identyfikator (małe litery, cyfry, _)\n• <b>Wyświetlana nazwa</b> — imię i nazwisko widoczne w zespole\n• <b>Hasło</b> — min. 4 znaki\n\nPrzy kolejnych wejściach wystarczy login i hasło. Sesja jest zapamiętywana w przeglądarce.\n\nMożesz też kliknąć <b>„Tryb lokalny"</b> — dane zapisują się tylko u Ciebie.',
  },
  {
    icon: '👥',
    title: '2. Zespół — tworzenie i dołączanie',
    desc: 'Po zalogowaniu wybierasz zespół:\n\n<b>Utwórz zespół</b> (zostajesz adminem) — podaj nazwę, hasło i tryb zmian (12/24h lub 8h biurowy). Udostępnij link 📋 współpracownikom.\n\n<b>Dołącz do zespołu</b> — wklej link lub ID zespołu i podaj hasło. Zostajesz automatycznie dodany do listy pracowników jako wpis w grafiku.\n\nOtwierając link zaproszenia po raz pierwszy, formularz dołączenia wypełni się automatycznie.',
  },
  {
    icon: '👑',
    title: '3. Role i uprawnienia',
    desc: 'W zespole obowiązują trzy role:\n\n• <b style="color:var(--acc)">Admin</b> — pełny dostęp: dodaje/usuwa pracowników, generuje, zatwierdza, zarządza członkami i rolami\n• <b style="color:var(--green)">Edytor</b> — generuje grafik, edytuje dostępność wszystkich pracowników\n• <b style="color:var(--muted)">Pracownik</b> — wpisuje urlopy i nieobecności <b>tylko na swoim</b> wpisie, nie może generować\n\nAdmin zmienia role w zakładce <b>👑 Członkowie</b>.',
  },
  {
    icon: '📅',
    title: '4. Ustaw dostępność',
    desc: 'W zakładce <b>👥 Pracownicy</b> rozwiń swoją kartę strzałką ▾.\n\nWybierz tryb oznaczania i klikaj dni kalendarza:\n• <b style="color:var(--purple)">🏖 Urlop</b> — Pn–Pt liczy +8h, weekend 0h\n• <b style="color:var(--gray)">🚫 Niedostępny</b> — brak zmian tego dnia\n• <b style="color:var(--yellow)">🌙 Bez dniówki</b> — dostaje tylko nocki\n• <b style="color:var(--orange)">☀ Bez nocki</b> — dostaje tylko dniówki\n• <b>✕ Wyczyść</b> — usuwa oznaczenie\n\nUrlopy i nieobecności wszystkich widoczne są w panelu <b>Dostępność</b> nad grafikiem.',
  },
  {
    icon: '⚙',
    title: '5. Opcje i tryb weekendów',
    desc: 'Zakładka <b>⚙ Opcje</b> (widoczna dla admina i edytora) zawiera:\n\n<b>Tryb weekendów</b> — dla każdego weekendu:\n• <b style="color:#1a7fa8">24h</b> — jedna zmiana całodobowa\n• <b style="color:var(--green)">D+N</b> — dzień + noc po 12h\n• <b>Wolny</b> — brak zmian\n\n<b>Ustawienia generatora</b> — max nocki/dniówki z rzędu, liczba wariantów (1–10), tolerancja godzin.\n\n<b>Tryb zmian</b> ustawia się przy tworzeniu zespołu (12/24h lub 8h biurowy).',
  },
  {
    icon: '⚡',
    title: '6. Generuj grafik',
    desc: 'Kliknij <b>„⚡ Generuj Grafik"</b> na dole panelu (admin lub edytor).\n\nAlgorytm automatycznie:\n• Uwzględnia urlopy i nieobecności\n• Wyrównuje godziny między pracownikami\n• Generuje kilka wariantów do wyboru\n\nJeśli po wygenerowaniu zmienisz dostępność kogoś z pracowników, pojawi się ostrzeżenie <b>⚠ Grafik może być nieaktualny</b> z przyciskiem szybkiego generowania.\n\nWyłączony pracownik (◉/⊘) nie jest uwzględniany w generowaniu.',
  },
  {
    icon: '✏️',
    title: '7. Edytuj ręcznie',
    desc: 'Po wygenerowaniu kliknij <b>dowolną komórkę</b> w tabeli grafiku aby zmienić typ zmiany:\n• <b>D</b> — Dniówka 12h\n• <b>N</b> — Nocka 12h\n• <b>24h</b> — zmiana całodobowa\n• <b>U</b> — Urlop (+8h)\n• <b>—</b> — Niedostępny (0h)\n• (puste) — brak przypisania\n\nEdycja dostępna dla admina i edytora.',
  },
  {
    icon: '✅',
    title: '8. Zatwierdź grafik',
    desc: 'Gdy grafik jest gotowy, kliknij <b>„✓ Zatwierdź"</b> przy wybranym wariancie (admin lub osoba która zatwierdziła).\n\nZatwierdzony grafik:\n• Wyświetla baner <b style="color:var(--green)">✅ Zatwierdzone</b> widoczny dla całego zespołu\n• Blokuje generowanie nowego do czasu cofnięcia\n• Można pobrać jako Excel\n• Można cofnąć przyciskiem <b>✕ Cofnij</b>',
  },
  {
    icon: '📊',
    title: '9. Eksportuj do Excel',
    desc: 'Kliknij <b>„⬇ Excel"</b> przy dowolnym grafiku lub <b>„⬇ Eksportuj wszystkie"</b> na górze.\n\nPlik .xls zawiera kolorowe komórki, podsumowania godzin i kontrolę obsady na każdy dzień.\n\n<b style="color:var(--acc)">Gotowe! Powodzenia z grafikami! 🎉</b>\n\nW razie pytań lub błędów — kliknij <b>✉ Kontakt</b> w nagłówku.',
  },
];

let currentTutorialStep = 0;

export function showTutorial() {
  currentTutorialStep = 0;
  renderTutorialStep();
  document.getElementById('tutOverlay').style.display = '';
}

export function closeTutorial() {
  document.getElementById('tutOverlay').style.display = 'none';
  localStorage.setItem('sm_tut_done', '1');
}

export function tutorialNext() {
  if (currentTutorialStep < TUT_STEPS.length - 1) {
    currentTutorialStep++;
    renderTutorialStep();
  }
}

export function tutorialPrev() {
  if (currentTutorialStep > 0) {
    currentTutorialStep--;
    renderTutorialStep();
  }
}

function renderTutorialStep() {
  const step = TUT_STEPS[currentTutorialStep];
  const isLast = currentTutorialStep === TUT_STEPS.length - 1;
  const isFirst = currentTutorialStep === 0;
  const dots = TUT_STEPS.map((_, i) =>
    `<div class="tut-dot${i === currentTutorialStep ? ' active' : ''}"></div>`
  ).join('');

  document.getElementById('tutOverlay').innerHTML = `<div class="tut-box">
    <button class="tut-close" onclick="closeTutorial()">✕</button>
    <div class="tut-step">
      <div class="tut-icon">${step.icon}</div>
      <div class="tut-title">${step.title}</div>
      <div class="tut-desc">${step.desc}</div>
      <div class="tut-dots">${dots}</div>
      <div class="tut-btns">
        ${isFirst ? '' : `<button class="tut-btn" onclick="tutPrev()">← Wstecz</button>`}
        ${isLast
          ? `<button class="tut-btn primary" onclick="closeTutorial()">Rozpocznij!</button>`
          : `<button class="tut-btn primary" onclick="tutNext()">Dalej →</button>`}
      </div>
    </div>
  </div>`;
}
