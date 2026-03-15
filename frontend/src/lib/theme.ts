export type AppTheme = "light" | "dark";

export const THEME_PREF_KEY = "settings_theme";

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function getStoredTheme(): AppTheme {
  const value = localStorage.getItem(THEME_PREF_KEY);
  return value === "dark" ? "dark" : "light";
}

export function setStoredTheme(theme: AppTheme): void {
  localStorage.setItem(THEME_PREF_KEY, theme);
}

export function initTheme(): AppTheme {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
