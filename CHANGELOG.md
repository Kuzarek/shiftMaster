# Changelog

## [1.2] — 2026-03-24

### Nowe funkcje

- **Dni wolne dla zespołu** — możliwość oznaczania dni wolnych na poziomie całego zespołu (team days off), które są respektowane podczas generowania grafiku.

- **Tryb debugowania** — włączany z panelu opcji, wyświetla szczegółowe diagnostyki przebiegu generowania (logi, powody odrzuceń, statystyki iteracji).

- **Limit max 24h** — nowa opcja ograniczająca maksymalną liczbę zmian 24h przydzielanych jednemu pracownikowi w miesiącu.

- **Diagnostyki generowania** — po generowaniu dostępny jest rozszerzony raport z przyczyn niepowodzeń i ostrzeżeń.

- **Tab „Zmiany" w modalu kontaktu** — historia wersji dostępna bezpośrednio w aplikacji.

### Naprawione błędy

- **Podział zmian 24h przy max24** — przy przekroczeniu limitu dzielono wszystkie zmiany 24h zamiast tylko nadmiarowych. Naprawiono na podział wyłącznie tych powyżej limitu.

### Refaktoryzacja

- **Podział kodu na moduły** — monolityczny `app.js` podzielony na osobne pliki: `schedule/` (generator, kwoty, punktacja, ograniczenia, symulowane wyżarzanie, diagnostyki), `render/` (renderer grafiku, menu kontekstowe), `export/` (Excel, PDF), `firebase/` (auth, teams), `sync/` (Firestore), oraz `state.js`, `workers.js`, `utils.js`, `theme.js`, `tutorial.js`, `debug.js`, `constants.js`, `init.js`.

---

## [1.1.1] — 2026-03-23

### Naprawione błędy

- **Przeciąganie pracowników** — pierwszy pracownik (ID=0) nie mógł być przeciągany z powodu błędu sprawdzania wartości fałszywej (`!_wDragSrc` = true gdy ID=0). Zmieniono na jawne porównanie `_wDragSrc===null`.

- **Liczba grafików po ponownym generowaniu** — po zmianie liczby grafików w opcjach, ponowne generowanie mogło zwracać więcej grafików niż wybrana wartość (błąd w `slice(0, count+results2.length)`). Naprawiono na `slice(0, count)`.

- **Generowanie grafiku przy całkowicie niedostępnych pracownikach** — gdy dwóch lub więcej pracowników miało wszystkie dni miesiąca oznaczone jako „Niedostępny", obliczanie kwot uwzględniało ich w dzieleniu godzin. Dostępni pracownicy przekraczali swój limit kwoty przed pokryciem wszystkich zmian, powodując niepowodzenie generowania. Teraz pracownicy bez ani jednego dostępnego dnia są wykluczeni z obliczania kwot.

- **Statystyki: średnia godzin zmian** — pracownicy z 0 godzinami (np. cały miesiąc na urlopie) byli uwzględniani w obliczaniu średniej, zaniżając ją. Teraz średnia liczy tylko pracowników z co najmniej 1 godziną.

- **Dniówki (minDays + reqDays)** — gdy ustawiono `minDays=2` i zaznaczono tylko poniedziałek jako obowiązkowy, system nie przydzielał niezawodnie drugiej dniówki w tygodniu. Naprawiono przez:
  - Dodanie drugiego przebiegu w `prefillReqDays`, który pre-wypełnia dodatkowe dniówki do osiągnięcia wartości `minDays`.
  - Zwiększenie premii punktacji dla niespełnionych `minDays` z -3 do -7.

- **Scrollowanie zatwierdzonego grafiku na małych ekranach** — dodano `min-height:0` do `.main-inner` (standardowa poprawka dla flex overflow), a do `.twrap` na urządzeniach mobilnych dodano `overflow-x:auto` i `touch-action:pan-x pan-y`.

### Nowe funkcje

- **Sortowanie grafików według odchylenia** — po generowaniu, grafiki są automatycznie sortowane rosnąco według odchylenia godzinowego (maksimum − minimum), dzięki czemu najbardziej wyważony grafik pojawia się pierwszy.

- **Eksport do PDF** — dodano funkcję `exportPDF()` generującą stronę HTML zoptymalizowaną do druku (A4 poziomo, kolorowe tabele). Przyciski „⬇ PDF" dostępne przy każdym grafiku i w nagłówku listy. Otwiera nową kartę z automatycznym oknem drukowania. Używa Blob URL zamiast przestarzałego `document.write`.

---

## [1.1.0]

- Zarządzanie świętami z API publicznego
- Tryb zatwierdzania grafiku (dla teamów)
- Historia zatwierdzonych grafików
- Tryb 8h z wieloma zmianami
- Funkcja „Wymagane dni" (reqDays)
- Eksport do Excel z kolorami i statystykami
- Obsługa wielu teamów (Firebase)
