const ACCESS_TOKEN_KEY = "bev_access_token";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const token = storage.getItem(ACCESS_TOKEN_KEY)?.trim() ?? "";
  return token || null;
}

export function setSessionToken(token: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (!token) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    return;
  }
  storage.setItem(ACCESS_TOKEN_KEY, token);
}

export function withAuthHeaders(init: HeadersInit = {}): Headers {
  const headers = new Headers(init);
  const token = getSessionToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}
