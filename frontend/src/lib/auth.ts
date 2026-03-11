const TOKEN_KEY = "golf_jwt";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
