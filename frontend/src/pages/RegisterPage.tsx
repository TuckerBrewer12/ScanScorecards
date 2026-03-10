import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { CourseSummary } from "@/types/golf";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [handicap, setHandicap] = useState("");
  const [homeCourseQuery, setHomeCourseQuery] = useState("");
  const [homeCourseId, setHomeCourseId] = useState<string>("");
  const [courseResults, setCourseResults] = useState<CourseSummary[]>([]);
  const [showCourseResults, setShowCourseResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = homeCourseQuery.trim();
    if (q.length < 2) {
      setCourseResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      api.searchCourses(q)
        .then((rows) => setCourseResults(rows))
        .catch(() => setCourseResults([]));
    }, 250);
    return () => window.clearTimeout(handle);
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
    if (trimmedCourse.length > 0 && !homeCourseId) {
      setError("Select a home course from the list, or leave it blank.");
      return;
    }

    let parsedHandicap: number | null = null;
    if (handicap.trim() !== "") {
      parsedHandicap = Number(handicap);
      if (Number.isNaN(parsedHandicap) || parsedHandicap < -10 || parsedHandicap > 54) {
        setError("Handicap must be between -10 and 54.");
        return;
      }
    }

    setLoading(true);
    try {
      await register(name, email, password, {
        handicap: parsedHandicap,
        home_course_id: homeCourseId || null,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-primary mb-1">⛳ GolfLog</div>
          <div className="text-sm text-gray-500">Create your account</div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Tiger Woods"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Handicap (optional)</label>
            <input
              type="number"
              value={handicap}
              onChange={(e) => setHandicap(e.target.value)}
              min={-10}
              max={54}
              step="0.1"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="e.g. 14.2"
            />
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">Home Course (optional)</label>
            <input
              type="text"
              value={homeCourseQuery}
              onChange={(e) => {
                setHomeCourseQuery(e.target.value);
                setHomeCourseId("");
                setShowCourseResults(true);
              }}
              onFocus={() => setShowCourseResults(true)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Type course name..."
            />
            {showCourseResults && courseResults.length > 0 ? (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-auto">
                {courseResults.map((course) => (
                  <button
                    key={course.id}
                    type="button"
                    onMouseDown={() => selectCourse(course)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="text-gray-900">{course.name ?? "Unnamed Course"}</div>
                    {course.location ? <div className="text-xs text-gray-500">{course.location}</div> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <p className="mt-1 text-xs text-gray-500">
              Must be selected from existing courses. If it is not in the DB yet, set it later in Settings.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
