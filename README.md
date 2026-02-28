# ShiftMaster

Aplikacja do automatycznego generowania i zarządzania grafikami zmianowymi dla zespołów. Działa w przeglądarce — tryb lokalny (bez internetu) lub zespołowy z synchronizacją w czasie rzeczywistym przez Firebase.

**[Demo](https://kuzarek.github.io/shiftMaster/)**

---

## Funkcje

### Generowanie grafiku
- Algorytm z backtrackingiem generujący optymalne grafiki na wybrany miesiąc
- Dwa tryby zmianowe: **12/24h** (służby, ochrona) i **8h** (biuro)
- Konfigurowalne ograniczenia: max nocek/dniówek z rzędu, tolerancja godzinowa, min. osób na zmianę
- Generowanie wielu wariantów do wyboru (1–10)
- Automatyczny fallback z 24h na 12h gdy brak rozwiązań dla weekendów
- Wyłączeni pracownicy pomijani przy generowaniu

### Dostępność pracowników
- Urlop (Pn–Pt = +8h, weekend = 0h)
- Niedostępność (brak zmian)
- Blokada dniówki lub nocki na wybrany dzień
- Min. dni w biurze tygodniowo (tryb 8h)
- Wymagane dni pracy

### Tryb zespołowy (Firebase)
- Tworzenie i dołączanie do zespołów (ID lub link zaproszeniowy)
- Synchronizacja w czasie rzeczywistym — zmiany widoczne natychmiast u wszystkich
- Trzy role z różnymi uprawnieniami:
  - **Admin** — pełny dostęp (generowanie, edycja, zatwierdzanie, zarządzanie członkami)
  - **Edytor** — generowanie, edycja pracowników, eksport
  - **Pracownik** — podgląd, edycja własnej dostępności, eksport
- Rejestracja i logowanie użytkowników

### Zatwierdzanie grafiku
- Zatwierdzony grafik widoczny dla całego zespołu
- Wersjonowanie — historia poprzednich wersji
- Cofanie zatwierdzenia (admin lub osoba zatwierdzająca)
- Powiadomienie o nieaktualności grafiku po zmianach w kalendarzu (widoczne dla wszystkich)

### Ręczna edycja i eksport
- Edycja wygenerowanego grafiku kliknięciem w kafelek
- Eksport do Excel (.xls) z kolorami, statystykami i legendą

### Interfejs
- Jasny / ciemny motyw
- Responsywny layout (mobile + desktop)
- Interaktywny tutorial dla nowych użytkowników
- Auto-zapis do Firebase

---

## Typy zmian

### Tryb 12/24h

| Symbol | Opis | Godziny |
|--------|------|---------|
| D | Dniówka | 12h |
| N | Nocka | 12h |
| 24h | Zmiana całodobowa (weekend) | 24h |
| U | Urlop (dzień roboczy) | +8h |
| — | Niedostępny | 0h |

### Tryb 8h

| Symbol | Opis | Godziny |
|--------|------|---------|
| B | Biuro (zmiana dzienna) | 8h |
| R | Zmiana poranna | 8h |
| P | Zmiana popołudniowa | 8h |
| N | Zmiana nocna | 8h |
| U | Urlop (dzień roboczy) | +8h |
| — | Niedostępny | 0h |

---

## Uruchomienie

Otwórz `index.html` w przeglądarce. W trybie lokalnym dane zapisywane w localStorage — nie wymaga internetu.

Do trybu zespołowego potrzebna konfiguracja Firebase w `js/config.js`.

---

## Struktura projektu

```
index.html          — główna strona aplikacji
js/app.js           — logika aplikacji
js/config.js        — konfiguracja Firebase
css/styles.css      — style
firestore.rules     — reguły bezpieczeństwa Firestore
tests/test-logic.js — testy logiki
```

---

## Stack

- Vanilla JS (ES6+), HTML5, CSS3
- Firebase Firestore (synchronizacja, dane zespołów)
- SheetJS (eksport Excel)
