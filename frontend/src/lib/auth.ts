export function withSession(init: RequestInit = {}): RequestInit {
  return { ...init, credentials: "include" };
}
