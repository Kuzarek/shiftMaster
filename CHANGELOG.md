# Changelog

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
