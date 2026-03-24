// ── THEME (dark / light mode) ──────────────────────────────────────

export function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.dataset.theme === 'dark';
  html.dataset.theme = isDark ? 'light' : 'dark';
  document.getElementById('thBtn').textContent = isDark ? '🌙' : '☀️';
  localStorage.setItem('sm_theme', html.dataset.theme);
}

// Stosuje zapisany motyw natychmiast (przed DOMContentLoaded)
export function applyStoredTheme() {
  const stored = localStorage.getItem('sm_theme') || 'light';
  document.documentElement.dataset.theme = stored;
  return stored;
}
