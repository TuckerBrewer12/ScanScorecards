import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Flag } from "lucide-react";
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

export function VerifyEmailPage() {
  const { verifyEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);
  const [result, setResult] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const verificationRef = useRef<{ token: string; promise: Promise<string> } | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setResult(null);
    if (!verificationRef.current || verificationRef.current.token !== token) {
      verificationRef.current = { token, promise: verifyEmail(token) };
    }

    let active = true;
    verificationRef.current.promise
      .then((msg) => {
        if (!active) return;
        setResult({ kind: "success", message: msg });
      })
      .catch((err) => {
        if (!active) return;
        setResult({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not verify email.",
        });
      });
    return () => {
      active = false;
    };
  }, [token, verifyEmail]);

  const status: "idle" | "verifying" | "success" | "error" =
    !token ? "idle" : result ? result.kind : "verifying";
  const message = !token
    ? "Missing verification token. Use the link from your email."
    : result
      ? result.message
      : "Verifying your email…";

  const panelClass =
    status === "success"
      ? "bg-emerald-50 border border-emerald-100 text-emerald-700"
      : status === "error" || status === "idle"
        ? "bg-red-50 border border-red-100 text-red-600"
        : "bg-blue-50 border border-blue-100 text-blue-700";

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-[#eef7f0] to-[#f8faf8] p-12 border-r border-gray-100">
        <div>
          <Logo />
          <div className="mt-16">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">
              Verifying account.<br />One moment.
            </h1>
            <p className="mt-4 text-base text-gray-500 leading-relaxed">
              Once verified, you can sign in and continue using BirdieEyeView.
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-400">© 2026 BirdieEyeView</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12 bg-white min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 md:hidden">
            <Logo />
            <p className="mt-1 text-sm text-gray-500">Verify email</p>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-6">Email Verification</h2>

          <div role="status" className={`text-sm rounded-xl px-4 py-3 ${panelClass}`}>
            {message}
          </div>

          <div className="text-center text-sm text-gray-400 mt-6 space-y-2">
            <div>
              <Link to="/login" className="text-primary font-semibold hover:underline">
                Go to Sign In
              </Link>
            </div>
            <div>
              <Link to="/verify-pending" className="text-primary font-semibold hover:underline">
                Need another confirmation email?
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
