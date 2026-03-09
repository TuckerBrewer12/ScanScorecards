import { createContext, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "golf_jwt";

interface AuthState {
  userId: string | null;
  name: string | null;
  email: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function callAuth(path: string, body: object) {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = `Error ${res.status}`;
    try { msg = JSON.parse(text).detail ?? msg; } catch { if (text) msg = text; }
    throw new Error(msg);
  }
  return res.json();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ userId: null, name: null, email: null });
  const [loading, setLoading] = useState(true);

  // On mount, try to re-hydrate from stored token
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("expired");
        return res.json();
      })
      .then((data) => {
        setState({ userId: data.user_id, name: data.name, email: data.email });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await callAuth("/login", { email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setState({ userId: data.user_id, name: data.name, email: data.email });
  };

  const register = async (name: string, email: string, password: string) => {
    const data = await callAuth("/register", { name, email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setState({ userId: data.user_id, name: data.name, email: data.email });
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ userId: null, name: null, email: null });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
