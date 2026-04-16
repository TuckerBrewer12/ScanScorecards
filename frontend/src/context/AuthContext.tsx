import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setStoredColorBlindMode } from "@/lib/accessibility";
import { apiUrl } from "@/lib/apiBase";
import { applyTheme, setStoredPublicTheme, setStoredTheme } from "@/lib/theme";

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
  resendVerification: (email: string) => Promise<string>;
  verifyEmail: (token: string) => Promise<string>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<string>;
  refreshSession: () => Promise<AuthState | null>;
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

interface MessagePayload {
  message: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const EMPTY_AUTH_STATE: AuthState = {
  userId: null,
  name: null,
  email: null,
  emailVerified: false,
};

async function getErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  const fallback = `Error ${res.status}`;
  if (!text) return fallback;

  try {
    return JSON.parse(text).detail ?? fallback;
  } catch {
    const looksLikeHtml = /^\s*</.test(text);
    if (looksLikeHtml) {
      return "API returned HTML instead of JSON. Check VITE_API_BASE_URL points to your backend (include https://).";
    }
    return text;
  }
}

async function parseJsonPayload<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const looksLikeHtml = /^\s*</.test(text);
    if (looksLikeHtml) {
      throw new Error("API returned HTML instead of JSON. Check VITE_API_BASE_URL points to your backend (include https://).");
    }
    throw new Error("API returned an invalid JSON payload.");
  }
}

async function callAuth<T>(path: string, body: object): Promise<T> {
  const res = await fetch(apiUrl(`/api/auth${path}`), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await getErrorMessage(res));
  }
  return parseJsonPayload<T>(res);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_AUTH_STATE);
  const latestStateRef = useRef<AuthState>(EMPTY_AUTH_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  const refreshSession = useCallback(async (): Promise<AuthState | null> => {
    try {
      const res = await fetch(apiUrl("/api/auth/me"), { credentials: "include" });
      if (res.status === 401 || res.status === 403) {
        setState((prev) =>
          prev.userId === null && prev.name === null && prev.email === null && prev.emailVerified === false
            ? prev
            : EMPTY_AUTH_STATE
        );
        return null;
      }
      if (!res.ok) {
        // Don't force-logout users on transient infra/network errors.
        return latestStateRef.current.userId ? latestStateRef.current : null;
      }
      const data = await parseJsonPayload<AuthUserPayload>(res);
      const nextState: AuthState = {
        userId: data.user_id,
        name: data.name,
        email: data.email,
        emailVerified: !!data.email_verified,
      };
      setState((prev) =>
        prev.userId === nextState.userId &&
        prev.name === nextState.name &&
        prev.email === nextState.email &&
        prev.emailVerified === nextState.emailVerified
          ? prev
          : nextState
      );
      return nextState;
    } catch {
      // Network/CORS/parser issues should not immediately clear a valid session.
      return latestStateRef.current.userId ? latestStateRef.current : null;
    }
  }, []);

  // On mount, try to re-hydrate from session cookie.
  useEffect(() => {
    refreshSession().finally(() => setLoading(false));
  }, [refreshSession]);

  // Keep auth state in sync when user returns to a tab after actions in another tab.
  useEffect(() => {
    const handleFocus = () => {
      void refreshSession();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshSession();
      }
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshSession]);

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
    // New accounts should always start with light mode and no color filter.
    setStoredTheme("light");
    setStoredPublicTheme("light");
    setStoredColorBlindMode("none");
    applyTheme("light");
    return data.message;
  };

  const resendVerification = async (email: string) => {
    const data = await callAuth<MessagePayload>("/resend-verification", { email });
    return data.message;
  };

  const verifyEmail = async (token: string) => {
    const data = await callAuth<MessagePayload>("/verify-email", { token });
    return data.message;
  };

  const forgotPassword = async (email: string) => {
    const data = await callAuth<MessagePayload>("/forgot-password", { email });
    return data.message;
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const data = await callAuth<MessagePayload>("/reset-password", { token, new_password: newPassword });
    return data.message;
  };

  const logout = async () => {
    try {
      await callAuth<{ message: string }>("/logout", {});
    } finally {
      setState(EMPTY_AUTH_STATE);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        resendVerification,
        verifyEmail,
        forgotPassword,
        resetPassword,
        refreshSession,
        logout,
        loading,
      }}
    >
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
