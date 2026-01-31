/**
 * Dark Mode Module
 * Handles theme switching with localStorage persistence and system preference detection
 */

const STORAGE_KEY = 'jc-theme';

/**
 * Get the user's preferred theme
 * Priority: localStorage > light (default)
 */
function getPreferredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    return stored;
  }

  // Always default to light mode
  return 'light';
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

/**
 * Toggle between light and dark themes
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const newTheme = current === 'dark' ? 'light' : 'dark';

  applyTheme(newTheme);
  localStorage.setItem(STORAGE_KEY, newTheme);
}

/**
 * Initialize dark mode
 */
export function initDarkMode() {
  // Apply saved/preferred theme immediately
  const theme = getPreferredTheme();
  applyTheme(theme);

  // Set up toggle button
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.addEventListener('click', toggleTheme);
  }
}

// Auto-initialize when loaded as part of a bundle
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDarkMode);
} else {
  initDarkMode();
}
