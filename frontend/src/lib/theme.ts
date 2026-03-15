export type AppTheme = "light" | "dark";

export const THEME_PREF_KEY = "settings_theme";
export const PUBLIC_THEME_PREF_KEY = "public_theme";
const TOKEN_KEY = "golf_jwt";

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

export function getStoredPublicTheme(): AppTheme {
  const value = localStorage.getItem(PUBLIC_THEME_PREF_KEY);
  return value === "dark" ? "dark" : "light";
}

export function setStoredTheme(theme: AppTheme): void {
  localStorage.setItem(THEME_PREF_KEY, theme);
}

export function setStoredPublicTheme(theme: AppTheme): void {
  localStorage.setItem(PUBLIC_THEME_PREF_KEY, theme);
}

export function initTheme(): AppTheme {
  const hasAuthToken = !!localStorage.getItem(TOKEN_KEY);
  const theme = hasAuthToken ? getStoredTheme() : getStoredPublicTheme();
  applyTheme(theme);
  return theme;
}
