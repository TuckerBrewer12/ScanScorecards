import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Flag, MailCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
        <Flag size={17} className="text-white" />
      </div>
      <span className="text-xl font-bold text-gray-900 tracking-tight">BirdieEyeView</span>
    </div>
  );
}

export function VerifyPendingPage() {
  const { resendVerification } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = location.state as { email?: string; flash?: string } | null;
  const [emailInput, setEmailInput] = useState((state?.email ?? searchParams.get("email") ?? "").trim());
  const [message, setMessage] = useState<string | null>(state?.flash ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const normalizedEmail = useMemo(() => emailInput.trim(), [emailInput]);

  const handleResend = async () => {
    if (!normalizedEmail) {
      setError("Enter your email to resend the verification link.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const apiMessage = await resendVerification(normalizedEmail);
      setMessage(apiMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend verification email.");
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
              Check your inbox.<br />Almost done.
            </h1>
            <p className="mt-4 text-base text-gray-500 leading-relaxed">
              We sent you a verification link. Open it to activate your account, then sign in.
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-400">© 2026 BirdieEyeView</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12 bg-white min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 md:hidden">
            <Logo />
            <p className="mt-1 text-sm text-gray-500">Verify your account</p>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <MailCheck size={18} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Verify Your Email</h2>
          </div>

          {message && (
            <div role="status" className="mb-4 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm rounded-xl px-4 py-3">
              {message}
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="verify-email" className="block text-xs font-semibold text-gray-500 mb-1.5">
                Email
              </label>
              <input
                id="verify-email"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                autoComplete="email"
                className={inputClass}
                placeholder="you@example.com"
              />
            </div>

            <button
              type="button"
              onClick={handleResend}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary/90 transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Sending…" : "Send Another Confirmation Email"}
            </button>

            <div className="text-center text-sm text-gray-500">
              Already verified?{" "}
              <Link to="/login" state={{ email: normalizedEmail }} className="text-primary font-semibold hover:underline">
                Go to Sign In
              </Link>
            </div>
            <div className="text-center text-sm text-gray-400">
              Need a different account?{" "}
              <Link to="/register" className="text-primary font-semibold hover:underline">
                Create one
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
