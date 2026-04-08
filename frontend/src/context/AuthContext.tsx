import { createContext, useContext, useEffect, useState } from "react";

interface AuthState {
  userId: string | null;
  name: string | null;
  email: string | null;
  emailVerified: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    options?: { handicap?: number | null; home_course_id?: string | null },
  ) => Promise<string>;
  logout: () => Promise<void>;
  loading: boolean;
}

interface AuthUserPayload {
  user_id: string;
  name: string;
  email: string;
  email_verified: boolean;
}

interface RegisterPayload {
  message: string;
  requires_email_verification: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function callAuth<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    credentials: "include",
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
  const [state, setState] = useState<AuthState>({
    userId: null,
    name: null,
    email: null,
    emailVerified: false,
  });
  const [loading, setLoading] = useState(true);

  // On mount, try to re-hydrate from session cookie.
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("unauthenticated");
        return res.json() as Promise<AuthUserPayload>;
      })
      .then((data) => {
        setState({
          userId: data.user_id,
          name: data.name,
          email: data.email,
          emailVerified: !!data.email_verified,
        });
      })
      .catch(() => {
        setState({ userId: null, name: null, email: null, emailVerified: false });
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const data = await callAuth<AuthUserPayload>("/login", { email, password });
    setState({
      userId: data.user_id,
      name: data.name,
      email: data.email,
      emailVerified: !!data.email_verified,
    });
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    options?: { handicap?: number | null; home_course_id?: string | null },
  ) => {
    const data = await callAuth<RegisterPayload>("/register", {
      name,
      email,
      password,
      handicap: options?.handicap ?? null,
      home_course_id: options?.home_course_id ?? null,
    });
    return data.message;
  };

  const logout = async () => {
    try {
      await callAuth<{ message: string }>("/logout", {});
    } finally {
      setState({ userId: null, name: null, email: null, emailVerified: false });
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

