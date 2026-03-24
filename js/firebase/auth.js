// ── AUTORYZACJA FIREBASE ───────────────────────────────────────────
// Rejestracja, logowanie użytkowników, hashowanie haseł.
import * as state from '../state.js';
import { COLORS } from '../constants.js';
import { toast } from '../utils.js';

// ── INICJALIZACJA FIREBASE ─────────────────────────────────────────

export function initFirebase() {
  if (FIREBASE_CONFIG.apiKey.startsWith('TWOJ')) return false;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    state.setDb(firebase.firestore());
    return true;
  } catch (e) {
    console.error('Firebase init:', e);
    return false;
  }
}

// ── HASHOWANIE HASŁA (SHA-256) ─────────────────────────────────────

export async function hashPassword(password) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── GENEROWANIE ID ZESPOŁU ─────────────────────────────────────────

export function generateTeamId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

// ── ZAKŁADKI PANELU AUTH ───────────────────────────────────────────

export function showAuthTab(tab) {
  document.getElementById('authLogin').style.display = tab === 'login' ? '' : 'none';
  document.getElementById('authRegister').style.display = tab === 'register' ? '' : 'none';
  document.querySelectorAll('#authOverlay .login-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
}

// ── REJESTRACJA ───────────────────────────────────────────────────

export async function doRegister() {
  const login = document.getElementById('regUser').value.trim().toLowerCase();
  const displayName = document.getElementById('regName').value.trim();
  const password = document.getElementById('regPass').value;
  const password2 = document.getElementById('regPass2').value;
  const errorEl = document.getElementById('regErr');

  if (!login || login.length < 3 || !/^[a-z0-9_]+$/.test(login)) {
    errorEl.textContent = 'Login: min 3 znaki (a-z, 0-9, _)'; return;
  }
  if (!displayName) { errorEl.textContent = 'Podaj wyświetlaną nazwę'; return; }
  if (password.length < 4) { errorEl.textContent = 'Hasło min. 4 znaki'; return; }
  if (password !== password2) { errorEl.textContent = 'Hasła się nie zgadzają'; return; }

  errorEl.textContent = 'Rejestracja...';
  try {
    const existing = await state.db.collection('users').doc(login).get();
    if (existing.exists) { errorEl.textContent = 'Login "' + login + '" jest już zajęty'; return; }
    const passwordHash = await hashPassword(password);
    await state.db.collection('users').doc(login).set({
      login, displayName, passwordHash,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      teams: {},
    });
    state.setCurrentUser({ login, displayName, passwordHash, teams: {} });
    localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
    window.showTeamSelect(); // globalnie wyeksportowane przez init.js
  } catch (e) {
    errorEl.textContent = 'Błąd: ' + e.message;
  }
}

// ── LOGOWANIE ─────────────────────────────────────────────────────

export async function doLogin() {
  const login = document.getElementById('loginUser').value.trim().toLowerCase();
  const password = document.getElementById('loginPass').value;
  const errorEl = document.getElementById('loginErr');

  if (!login) { errorEl.textContent = 'Podaj login'; return; }
  if (!password) { errorEl.textContent = 'Podaj hasło'; return; }
  errorEl.textContent = 'Logowanie...';

  try {
    const doc = await state.db.collection('users').doc(login).get();
    if (!doc.exists) { errorEl.textContent = 'Użytkownik nie istnieje'; return; }
    const passwordHash = await hashPassword(password);
    const data = doc.data();
    if (data.passwordHash !== passwordHash) { errorEl.textContent = 'Błędne hasło'; return; }
    state.setCurrentUser({ login: data.login, displayName: data.displayName, passwordHash, teams: data.teams || {} });
    localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
    window.showTeamSelect();
  } catch (e) {
    errorEl.textContent = 'Błąd: ' + e.message;
  }
}

// ── WYLOGOWANIE UŻYTKOWNIKA ───────────────────────────────────────

export function doLogoutUser() {
  state.setCurrentUser(null);
  localStorage.removeItem('sm_user');
  localStorage.removeItem('sm_team');
  document.getElementById('teamSelectOverlay').style.display = 'none';
  document.getElementById('authOverlay').style.display = '';
}
