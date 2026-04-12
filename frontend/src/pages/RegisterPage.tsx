import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { parseHandicapInput } from "@/lib/handicap";
import type { CourseSummary } from "@/types/golf";
import { Eye, EyeOff, Flag } from "lucide-react";

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

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [handicap, setHandicap] = useState("");
  const [homeCourseQuery, setHomeCourseQuery] = useState("");
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [courseResults, setCourseResults] = useState<CourseSummary[]>([]);
  const [searchingCourses, setSearchingCourses] = useState(false);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = homeCourseQuery.trim();
    if (q.length < 2) {
      setCourseResults([]);
      setSearchingCourses(false);
      return;
    }
    let active = true;
    setSearchingCourses(true);
    const handle = window.setTimeout(() => {
      api.searchCourses(q)
        .then((rows) => {
          if (active) setCourseResults(rows);
        })
        .catch(() => {
          if (active) setCourseResults([]);
        })
        .finally(() => {
          if (active) setSearchingCourses(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [homeCourseQuery]);

  const selectCourse = (course: CourseSummary) => {
    setHomeCourseId(course.id);
    setHomeCourseQuery(course.name ?? "");
    setShowCourseResults(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    const trimmedCourse = homeCourseQuery.trim();
    const shouldIgnoreUnmatchedHomeCourse = trimmedCourse.length > 0 && !homeCourseId;
    if (shouldIgnoreUnmatchedHomeCourse) {
      setHomeCourseQuery("");
      setShowCourseResults(false);
    }

    const { value: parsedHandicap, error: handicapError } = parseHandicapInput(handicap);
    if (handicapError) {
      setError(handicapError);
      return;
    }

    setLoading(true);
    try {
      const message = await register(name, email, password, {
        handicap: parsedHandicap,
        home_course_id: shouldIgnoreUnmatchedHomeCourse ? null : homeCourseId || null,
      });
      navigate(`/verify-pending?email=${encodeURIComponent(email.trim())}`, {
        state: { flash: message, email: email.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary";

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left hero panel */}
      <div className="hidden md:flex flex-col justify-between bg-gradient-to-b from-[#eef7f0] to-[#f8faf8] p-12 border-r border-gray-100">
        <div>
          <Logo />
          <div className="mt-16">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-tight">
              Elevate your game<br />with smart analytics.
            </h1>
            <p className="mt-4 text-base text-gray-500 leading-relaxed">
              Scan physical scorecards with AI, track every stat, and see exactly where your game improves.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-gray-600">
              {["AI scorecard scanning", "GIR, putts & scoring trends", "Course & handicap tracking"].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="text-xs text-gray-400">© 2026 BirdieEyeView</div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center px-6 py-12 bg-white min-h-screen md:min-h-0">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 md:hidden">
            <Logo />
            <p className="mt-1 text-sm text-gray-500">Create your account</p>
          </div>

          <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 mb-8">Create Account</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div role="alert" className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="reg-name" className="block text-xs font-semibold text-gray-500 mb-1.5">Name</label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                className={inputClass}
                placeholder="Tiger Woods"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
              <input
                id="reg-email"
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
              <label htmlFor="reg-password" className="block text-xs font-semibold text-gray-500 mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="reg-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={`${inputClass} pr-12`}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-confirm" className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  id="reg-confirm"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  aria-pressed={showConfirmPassword}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="reg-handicap" className="block text-xs font-semibold text-gray-500 mb-1.5">Handicap (optional)</label>
              <input
                id="reg-handicap"
                type="text"
                inputMode="decimal"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                className={inputClass}
                placeholder="e.g. +5.0"
              />
            </div>

            <div className="relative">
              <label htmlFor="reg-home-course" className="block text-xs font-semibold text-gray-500 mb-1.5">Home Course (optional)</label>
              <input
                id="reg-home-course"
                type="text"
                value={homeCourseQuery}
                onChange={(e) => {
                  setHomeCourseQuery(e.target.value);
                  setHomeCourseId("");
                  setShowCourseResults(true);
                }}
                onFocus={() => setShowCourseResults(true)}
                className={inputClass}
                placeholder="Type course name..."
              />
              {showCourseResults && homeCourseQuery.trim().length >= 2 ? (
                <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-100 bg-white shadow-lg shadow-gray-200/50 max-h-56 overflow-auto">
                  {searchingCourses ? (
                    <div className="px-4 py-2.5 text-sm text-gray-500">Searching courses...</div>
                  ) : courseResults.length > 0 ? (
                    courseResults.map((course) => (
                      <button
                        key={course.id}
                        type="button"
                        onMouseDown={() => selectCourse(course)}
                        className="w-full text-left px-4 py-2.5 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="text-gray-900">{course.name ?? "Unnamed Course"}</div>
                        {course.location ? <div className="text-xs text-gray-500">{course.location}</div> : null}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-2.5 text-sm text-gray-500">
                      No matching saved course found.
                    </div>
                  )}
                </div>
              ) : null}
              <p className="mt-1 text-xs text-gray-500">
                Select from suggestions if available. If not found, leave it blank and set it later in Settings.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 transition-all duration-200 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none"
            >
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-400 mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
