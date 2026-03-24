// ── ZARZĄDZANIE ZESPOŁAMI ─────────────────────────────────────────
// Tworzenie, dołączanie, opuszczanie i usuwanie zespołów.
import * as state from '../state.js';
import { COLORS } from '../constants.js';
import { toast } from '../utils.js';
import { hashPassword, generateTeamId } from './auth.js';
import { showApp } from '../sync/firestore.js';

// ── EKRAN WYBORU ZESPOŁU ─────────────────────────────────────────

export function showTeamSelect() {
  document.getElementById('authOverlay').style.display = 'none';
  document.getElementById('teamSelectOverlay').style.display = '';
  document.getElementById('tsWelcome').textContent = 'Witaj, ' + state.currentUser.displayName + '!';
  document.getElementById('tsCreateForm').style.display = 'none';
  document.getElementById('tsJoinForm').style.display = 'none';
  renderTeamList();

  // Jeśli URL zawiera ID zespołu i użytkownik nie jest jego członkiem — otwórz formularz dołączenia
  const hashTeamId = (window.location.hash.match(/team=([a-z0-9]+)/) || [])[1];
  if (hashTeamId && !(state.currentUser.teams && state.currentUser.teams[hashTeamId])) {
    document.getElementById('tsJoinId').value = hashTeamId;
    document.getElementById('tsJoinForm').style.display = '';
  }
}

export function renderTeamList() {
  const list = document.getElementById('tsTeamList');
  const emptyMsg = document.getElementById('tsEmpty');
  const teams = state.currentUser.teams || {};
  const teamIds = Object.keys(teams);

  if (!teamIds.length) {
    list.innerHTML = '';
    emptyMsg.style.display = '';
    return;
  }
  emptyMsg.style.display = 'none';

  const ROLE_PL = { admin: 'admin', editor: 'edytor', worker: 'pracownik' };
  list.innerHTML = teamIds.map(tid => {
    const team = teams[tid];
    const role = team.role || 'worker';
    const deleteBtn = role === 'admin'
      ? `<button class="ts-del-btn" onclick="event.stopPropagation();showDelTeamModal('${tid}','${(team.teamName || tid).replace(/'/g, "\\'")}')">🗑</button>`
      : '';
    return `<div class="ts-team-item" onclick="enterTeam('${tid}')">
      <span class="ts-team-name">${team.teamName || tid}</span>
      <span class="ts-team-role ts-role-${role}">${ROLE_PL[role] || role}</span>
      ${deleteBtn}
    </div>`;
  }).join('');
}

export function showTsCreate() {
  const form = document.getElementById('tsCreateForm');
  form.style.display = form.style.display === 'none' ? '' : 'none';
  document.getElementById('tsJoinForm').style.display = 'none';
}

export function showTsJoin() {
  const form = document.getElementById('tsJoinForm');
  form.style.display = form.style.display === 'none' ? '' : 'none';
  document.getElementById('tsCreateForm').style.display = 'none';
}

// ── TWORZENIE ZESPOŁU ────────────────────────────────────────────

export async function doCreateTeamNew() {
  const name = document.getElementById('tsCreateName').value.trim();
  const password = document.getElementById('tsCreatePw').value;
  const errorEl = document.getElementById('tsCreateErr');

  if (!name) { errorEl.textContent = 'Podaj nazwę zespołu'; return; }
  if (password.length < 4) { errorEl.textContent = 'Hasło min. 4 znaki'; return; }
  errorEl.textContent = 'Tworzenie...';

  try {
    const teamId = generateTeamId();
    const passwordHash = await hashPassword(password);
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const shiftMode = (document.getElementById('tsCreateMode') && document.getElementById('tsCreateMode').value) || '12h';

    await state.db.collection('teams').doc(teamId).set({
      name, passwordHash,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      workers: [], weModes: {}, teamDaysOff: {}, wCtr: 0,
      settings: { month: nextMonth.getMonth() + 1, year: nextMonth.getFullYear() },
      genSettings: { shiftMode, maxN: true, maxNVal: 3, maxD: true, maxDVal: 3, tol: 24, minPerDay: 1, count: 1 },
      approvedSchedules: {},
      members: { [state.currentUser.login]: { displayName: state.currentUser.displayName, role: 'admin' } },
    });

    state.currentUser.teams[teamId] = { role: 'admin', teamName: name };
    await state.db.collection('users').doc(state.currentUser.login).update({
      ['teams.' + teamId]: { role: 'admin', teamName: name },
    });
    localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
    enterTeam(teamId);
    toast('✓ Zespół utworzony! Udostępnij link.');
  } catch (e) {
    errorEl.textContent = 'Błąd: ' + e.message;
  }
}

// ── DOŁĄCZENIE DO ZESPOŁU ────────────────────────────────────────

export async function doJoinTeamNew() {
  let teamId = document.getElementById('tsJoinId').value.trim().toLowerCase();
  const password = document.getElementById('tsJoinPw').value;
  const errorEl = document.getElementById('tsJoinErr');

  // Obsługa wklejenia pełnego linku
  if (teamId.includes('#team=')) teamId = teamId.split('#team=').pop();
  if (teamId.includes('team=')) teamId = teamId.split('team=').pop();

  if (!teamId) { errorEl.textContent = 'Podaj ID zespołu'; return; }
  if (!password) { errorEl.textContent = 'Podaj hasło'; return; }
  errorEl.textContent = 'Łączenie...';

  try {
    const doc = await state.db.collection('teams').doc(teamId).get();
    if (!doc.exists) { errorEl.textContent = 'Zespół nie istnieje'; return; }
    const passwordHash = await hashPassword(password);
    if (doc.data().passwordHash !== passwordHash) { errorEl.textContent = 'Błędne hasło'; return; }

    const data = doc.data();
    const teamName = data.name || teamId;
    const members = data.members || {};
    let role = members[state.currentUser.login] ? members[state.currentUser.login].role : 'worker';

    // Pierwsze dołączenie do pustego zespołu = admin
    if (!data.members || !Object.keys(data.members).length) role = 'admin';

    await state.db.collection('teams').doc(teamId).update({
      ['members.' + state.currentUser.login]: { displayName: state.currentUser.displayName, role },
    });
    state.currentUser.teams[teamId] = { role, teamName };
    await state.db.collection('users').doc(state.currentUser.login).update({
      ['teams.' + teamId]: { role, teamName },
    });
    localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
    enterTeam(teamId);
  } catch (e) {
    errorEl.textContent = 'Błąd: ' + e.message;
  }
}

// ── WEJŚCIE DO ZESPOŁU ────────────────────────────────────────────

export async function enterTeam(tid) {
  const teamData = state.currentUser.teams[tid];
  if (!teamData) return;

  state.setTeamSession({
    teamId: tid,
    login: state.currentUser.login,
    displayName: state.currentUser.displayName,
    role: teamData.role || 'worker',
    passwordHash: null,
  });

  // Pobierz hasło zespołu + auto-dodaj użytkownika do listy pracowników
  try {
    const doc = await state.db.collection('teams').doc(tid).get();
    if (doc.exists) {
      const ts = state.teamSession;
      ts.passwordHash = doc.data().passwordHash;
      state.setTeamSession(ts);

      const existingWorkers = doc.data().workers || [];
      if (!existingWorkers.some(w => w.login === state.currentUser.login)) {
        const color = COLORS[existingWorkers.length % COLORS.length];
        const newId = doc.data().wCtr != null ? doc.data().wCtr : existingWorkers.length;
        const newWorker = {
          id: newId,
          name: state.currentUser.displayName,
          color,
          days: {}, minDays: 0, reqDays: [],
          login: state.currentUser.login,
          disabled: false,
        };
        await state.db.collection('teams').doc(tid).update({
          workers: [...existingWorkers, newWorker],
          wCtr: newId + 1,
        });
      }
    }
  } catch (e) { /* ignoruj */ }

  localStorage.setItem('sm_team', JSON.stringify({ teamId: tid, role: teamData.role }));
  window.location.hash = 'team=' + tid;
  showApp();
  if (!localStorage.getItem('sm_tut_done')) window.showTutorial();
}

// ── WYLOGOWANIE Z ZESPOŁU ─────────────────────────────────────────

export function doLogout() {
  if (state.unsubscribeFirestore) state.unsubscribeFirestore();
  state.setUnsubscribeFirestore(null);
  state.setTeamSession(null);
  localStorage.removeItem('sm_team');
  window.location.hash = '';

  // Resetuj stan aplikacji
  state.setWorkers([]);
  state.setSchedules([]);
  state.setWeekendModes({});
  state.setTeamDaysOff({});
  state.setWorkerCounter(0);

  document.getElementById('teamBar').style.display = 'none';
  document.getElementById('approvedBanner').innerHTML = '';
  document.getElementById('mainInner').innerHTML = '';
  document.getElementById('wlist').innerHTML = '';
  document.getElementById('tabMembers').style.display = 'none';

  if (state.currentUser) {
    state.db.collection('users').doc(state.currentUser.login).get()
      .then(doc => {
        if (doc.exists) state.currentUser.teams = doc.data().teams || {};
        localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
        showTeamSelect();
      })
      .catch(() => showTeamSelect());
  } else {
    document.getElementById('authOverlay').style.display = '';
  }
}

export function copyTeamLink() {
  if (!state.teamSession) return;
  const link = window.location.origin + window.location.pathname + '#team=' + state.teamSession.teamId;
  navigator.clipboard.writeText(link)
    .then(() => toast('✓ Link skopiowany!'))
    .catch(() => prompt('Skopiuj link:', link));
}

// ── USUWANIE ZESPOŁU ─────────────────────────────────────────────

let pendingTeamDeletion = null;

export function showDelTeamModal(tid, teamName) {
  pendingTeamDeletion = { tid, teamName };
  document.getElementById('delTeamName').textContent = teamName;
  document.getElementById('delTeamModal').style.display = 'flex';
}

export function closeDelTeamModal() {
  pendingTeamDeletion = null;
  document.getElementById('delTeamModal').style.display = 'none';
}

export async function confirmDeleteTeam() {
  if (!pendingTeamDeletion) return;
  const { tid } = pendingTeamDeletion;
  const btn = document.getElementById('delTeamConfirmBtn');
  btn.disabled = true; btn.textContent = 'Usuwanie...';

  try {
    const teamDoc = await state.db.collection('teams').doc(tid).get();
    const batch = state.db.batch();
    if (teamDoc.exists) {
      const members = teamDoc.data().members || {};
      Object.keys(members).forEach(login => {
        batch.update(
          state.db.collection('users').doc(login),
          { [`teams.${tid}`]: firebase.firestore.FieldValue.delete() }
        );
      });
    }
    batch.delete(state.db.collection('teams').doc(tid));
    await batch.commit();

    if (state.currentUser.teams) delete state.currentUser.teams[tid];
    localStorage.setItem('sm_user', JSON.stringify(state.currentUser));
    closeDelTeamModal();
    renderTeamList();
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'Tak, usuń';
    document.getElementById('delTeamErr').textContent = 'Błąd: ' + e.message;
  }
}

// ── ZARZĄDZANIE CZŁONKAMI ────────────────────────────────────────

export async function renderMembers() {
  const list = document.getElementById('membersList');
  if (!list || !state.teamSession || !state.db) return;
  try {
    const doc = await state.db.collection('teams').doc(state.teamSession.teamId).get();
    if (!doc.exists) return;
    const members = doc.data().members || {};
    const keys = Object.keys(members);
    if (!keys.length) {
      list.innerHTML = '<div style="font-size:11px;color:var(--muted)">Brak członków</div>';
      return;
    }
    const { canDo } = window;
    const isAdmin = canDo('manage_members');
    const ROLE_PL = { admin: 'admin', editor: 'edytor', worker: 'pracownik' };
    list.innerHTML = keys.map(login => {
      const member = members[login];
      const isSelf = login === state.currentUser.login;
      let roleHtml;
      if (isAdmin && !isSelf) {
        roleHtml = `<select class="member-role-sel" onchange="changeMemberRole('${login}',this.value)">
          <option value="admin"${member.role === 'admin' ? ' selected' : ''}>Admin</option>
          <option value="editor"${member.role === 'editor' ? ' selected' : ''}>Edytor</option>
          <option value="worker"${member.role === 'worker' || !member.role ? ' selected' : ''}>Pracownik</option>
        </select>`;
      } else {
        roleHtml = `<span class="ts-team-role ts-role-${member.role || 'worker'}">${ROLE_PL[member.role || 'worker']}</span>`;
      }
      const deleteHtml = isAdmin && !isSelf
        ? `<button class="member-del" onclick="removeMember('${login}')" title="Usuń z zespołu">✕</button>`
        : '';
      return `<div class="member-card">
        <span class="member-name">${member.displayName || login}${isSelf ? ' (ty)' : ''}</span>
        ${roleHtml}${deleteHtml}
      </div>`;
    }).join('');
  } catch (e) {
    console.error('renderMembers error:', e);
  }
}

export async function changeMemberRole(login, newRole) {
  const { canDo } = window;
  if (!state.teamSession || !state.db || !canDo('manage_members')) return;
  try {
    await state.db.collection('teams').doc(state.teamSession.teamId).update({ ['members.' + login + '.role']: newRole });
    await state.db.collection('users').doc(login).update({ ['teams.' + state.teamSession.teamId + '.role']: newRole });
    toast('✓ Rola zmieniona');
    renderMembers();
  } catch (e) {
    toast('✗ Błąd: ' + e.message);
  }
}

export async function removeMember(login) {
  const { canDo } = window;
  if (!state.teamSession || !state.db || !canDo('manage_members')) return;
  if (!confirm('Usunąć ' + login + ' z zespołu?')) return;
  try {
    await state.db.collection('teams').doc(state.teamSession.teamId).update({
      ['members.' + login]: firebase.firestore.FieldValue.delete(),
    });
    await state.db.collection('users').doc(login).update({
      ['teams.' + state.teamSession.teamId]: firebase.firestore.FieldValue.delete(),
    });
    toast('✓ Członek usunięty');
    renderMembers();
  } catch (e) {
    toast('✗ Błąd: ' + e.message);
  }
}
