# ⚡ ShiftMaster

**Narzędzie do automatycznego generowania grafików pracy dla małych zespołów.**

Jeden plik HTML — zero instalacji, zero serwera, działa w przeglądarce.

---

## Funkcje

- **Automatyczne generowanie** grafiku na wybrany miesiąc z backtrackingiem
- **Tryb biurowy** — wymóg min. 2 dni w biurze tygodniowo z zachowaniem równowagi godzin
- **Urlopy i niedostępność** — zaznaczane per-pracownik w kalendarzu (urlop Pn-Pt liczy +8h)
- **Weekendy 24h lub 12h** — preferuje zmiany całodobowe, automatyczny fallback na 12h gdy brak rozwiązań
- **Ręczna edycja** — kliknij dowolny kafelek w grafiku żeby zmienić typ zmiany
- **Eksport do Excel** z kolorami i legendą
- **Jasny / ciemny motyw**
- **Zapis pracowników** do localStorage (dane zostają po zamknięciu przeglądarki)

## Typy zmian

| Symbol | Opis | Godziny |
|--------|------|---------|
| D | Dniówka | 12h |
| N | Nocka | 12h |
| 24h | Weekend całodobowy | 24h |
| B | Biuro (dniówka z wymogiem biurowym) | 12h |
| U | Urlop dzień roboczy | +8h |
| U | Urlop weekend | 0h |
| — | Niedostępny | 0h |

## Użycie

Pobierz `grafik.html` i otwórz w przeglądarce. Nie wymaga internetu po załadowaniu.

Albo otwórz bezpośrednio: **[Demo →](https://twoj-link.netlify.app)**
