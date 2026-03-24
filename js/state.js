// ── GLOBAL APPLICATION STATE ────────────────────────────────────────
// Centralny obiekt stanu aplikacji. Wszystkie moduły importują ten plik
// i modyfikują pola przez eksportowane settery.

// Licznik ID pracowników (monotonicznie rosnący)
export let workerCounter = 0;

// Lista pracowników: Array<{id, name, color, _open, days, minDays, reqDays, login, disabled}>
export let workers = [];

// Tryby weekendowe dla sobotnich dat: { "YYYY-MM-DD": '24h'|'split'|'wolny' }
export let weekendModes = {};

// Tryb oznaczania w mini-kalendarzu: { [workerId]: 'vac'|'off'|'no-d'|'no-n'|'clr' }
export let calendarMode = {};

// Wygenerowane grafiki (każdy = tablica wpisów {wid, date, type, hours, slot})
export let schedules = [];

// Klucz miesiąca "Y-M" dla którego grafik jest nieaktualny, lub null
export let scheduleStaleKey = null;

// Zapamiętane nieaktualne grafiki pobrane z Firestore
export let cachedStaleSchedules = null;

// Publiczne święta: { "YYYY": Map<"YYYY-MM-DD", nazwaŚwięta> }
export let publicHolidays = {};

// Nadpisania trybu świątecznego: { "YYYY-MM-DD": true/false } — true = zmiana 24h
export let holidayModes = {};

// Dni wolne całego zespołu: { "YYYY-MM-DD": true }
export let teamDaysOff = {};

// Stan rozwinięcia panelu dni wolnych zespołu
export let teamDaysOffPanelOpen = false;

// Czy ukryć puste kolumny w tabeli dostępności
export let prefillHideEmpty = false;

// Czy zwinąć (schować) tabelę dostępności
export let prefillCollapsed = true;

// ── Firebase / sesja ────────────────────────────────────────────────
export let db = null;
export let teamSession = null;       // { teamId, login, displayName, role, passwordHash }
export let unsubscribeFirestore = null;
export let skipNextSnapshot = false;

// Zatwierdzony grafik (z Firestore): { "Y-M": { data, version, approvedBy, ... } }
export let cachedApprovedSchedules = null;

// Historia zatwierdzonych grafików: { "Y-M": [{...}] }
export let cachedScheduleHistory = null;

// Oczekujące grafiki (niezatwierdzone): { "Y-M": [{shifts:[...]}] }
export let cachedPendingSchedules = null;

// Metadane generatora dla oczekujących grafików: { "Y-M": {...} }
export let cachedScheduleMeta = null;

// Aktywny widok zatwierdzonego grafiku (klucz widoku lub null)
export let approvedViewActive = null;

// Indeks aktualnie wyświetlanego grafiku w trybie nawigacji strzałkami
export let activeScheduleIndex = 0;

// Zalogowany użytkownik: { login, displayName, passwordHash, teams:{} }
export let currentUser = null;

// Debounce timer dla zapisu do Firestore
export let autoSaveTimer = null;

// ── Settery ────────────────────────────────────────────────────────

export function setWorkerCounter(val) { workerCounter = val; }
export function setWorkers(val) { workers = val; }
export function setWeekendModes(val) { weekendModes = val; }
export function setCalendarMode(val) { calendarMode = val; }
export function setSchedules(val) { schedules = val; }
export function setScheduleStaleKey(val) { scheduleStaleKey = val; }
export function setCachedStaleSchedules(val) { cachedStaleSchedules = val; }
export function setPublicHolidays(val) { publicHolidays = val; }
export function setHolidayModes(val) { holidayModes = val; }
export function setTeamDaysOff(val) { teamDaysOff = val; }
export function setTeamDaysOffPanelOpen(val) { teamDaysOffPanelOpen = val; }
export function setPrefillHideEmpty(val) { prefillHideEmpty = val; }
export function setPrefillCollapsed(val) { prefillCollapsed = val; }
export function setDb(val) { db = val; }
export function setTeamSession(val) { teamSession = val; }
export function setUnsubscribeFirestore(val) { unsubscribeFirestore = val; }
export function setSkipNextSnapshot(val) { skipNextSnapshot = val; }
export function setCachedApprovedSchedules(val) { cachedApprovedSchedules = val; }
export function setCachedScheduleHistory(val) { cachedScheduleHistory = val; }
export function setCachedPendingSchedules(val) { cachedPendingSchedules = val; }
export function setCachedScheduleMeta(val) { cachedScheduleMeta = val; }
export function setApprovedViewActive(val) { approvedViewActive = val; }
export function setActiveScheduleIndex(val) { activeScheduleIndex = val; }
export function setCurrentUser(val) { currentUser = val; }
export function setAutoSaveTimer(val) { autoSaveTimer = val; }
