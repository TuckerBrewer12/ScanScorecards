import { useState } from "react";
import { Link } from "react-router-dom";
import { Flag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

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

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const msg = await forgotPassword(email.trim());
      setMessage(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-[#eef7f0] to-[#f8faf8] p-12 border-r border-gray-100">
        <div>
          <Logo />
          <div className="mt-16">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">
              Reset your password.<br />Get back in fast.
            </h1>
            <p className="mt-4 text-base text-gray-500 leading-relaxed">
              Enter your email and we&apos;ll send a secure reset link.
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-400">© 2026 ScanScorecards</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12 bg-white min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 md:hidden">
            <Logo />
            <p className="mt-1 text-sm text-gray-500">Reset password</p>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Forgot Password</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {message && (
              <div role="status" className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl px-4 py-3">
                {message}
              </div>
            )}
            {error && (
              <div role="alert" className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="forgot-email" className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary/90 transition-all duration-200 disabled:opacity-50"
            >
              {loading ? "Sending link…" : "Send Reset Link"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Remembered your password?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
