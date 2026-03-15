export type ColorBlindMode = "none" | "protanopia" | "deuteranopia" | "tritanopia";

export const COLORBLIND_PREF_KEY = "settings_colorblind_mode";

export function getStoredColorBlindMode(): ColorBlindMode {
  const value = localStorage.getItem(COLORBLIND_PREF_KEY);
  if (value === "protanopia" || value === "deuteranopia" || value === "tritanopia") {
    return value;
  }
  return "none";
}

export function setStoredColorBlindMode(mode: ColorBlindMode): void {
  localStorage.setItem(COLORBLIND_PREF_KEY, mode);
}
