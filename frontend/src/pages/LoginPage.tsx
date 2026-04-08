import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Flag } from "lucide-react";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
        <Flag size={17} className="text-white" />
      </div>
      <span className="text-xl font-bold text-gray-900 tracking-tight">ScanScorecards</span>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const initialEmail = ((location.state as { email?: string } | null)?.email ?? "").trim();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  const flashMessage = (() => {
    const state = location.state as { flash?: string } | null;
    return state?.flash ?? null;
  })();

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left hero panel */}
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-[#eef7f0] to-[#f8faf8] p-12 border-r border-gray-100">
        <div>
          <Logo />
          <div className="mt-16">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">
              Welcome back.<br />Your game awaits.
            </h1>
            <p className="mt-4 text-base text-gray-500 leading-relaxed">
              Pick up where you left off — track rounds, review stats, and keep improving.
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-400">© 2026 ScanScorecards</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-6 py-12 bg-white min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 md:hidden">
            <Logo />
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Sign In</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {flashMessage && (
              <div role="status" className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl px-4 py-3">
                {flashMessage}
              </div>
            )}
            {error && (
              <div role="alert" className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 transition-all duration-200 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-primary font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
