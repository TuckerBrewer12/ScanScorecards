const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";

function normalizeApiBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  // Railway env vars are often entered as a host only; default protocol safely.
  if (!/^https?:\/\//i.test(trimmed)) {
    const hostOnly = /^[a-z0-9.-]+(?::\d+)?$/i.test(trimmed);
    if (hostOnly) {
      const isLocal = /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(trimmed);
      return `${isLocal ? "http" : "https"}://${trimmed}`.replace(/\/+$/, "");
    }
  }

  return trimmed.replace(/\/+$/, "");
}

const normalizedApiBaseUrl = normalizeApiBaseUrl(rawApiBaseUrl);

export const API_BASE_URL = normalizedApiBaseUrl;

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}
