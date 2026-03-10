import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Link2 } from "lucide-react";
import type { CourseSummary } from "@/types/golf";
import { CourseLinkSearch } from "@/components/CourseLinkSearch";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { api } from "@/lib/api";
import type { Round } from "@/types/golf";
import { formatToPar, calcCourseHandicap, calcNetScore } from "@/types/golf";
import type { RoundComparison, ComparisonRow } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScorecardGrid } from "@/components/round-detail/ScorecardGrid";

type EditedScores = Record<number, { strokes: number | null; putts: number | null; gir?: boolean | null }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fmt = (v: any, name: any, props: any) => any;

function formatNumber(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function ComparisonChartCard({
  title,
  rows,
  primaryLabel,
}: {
  title: string;
  rows: ComparisonRow[];
  primaryLabel: string;
}) {
  const chartData = rows.map((row, i) => ({
    label: row.label,
    value: row.primary_value ?? 0,
    sampleSize: row.sample_size,
    isSelected: i === 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="text-sm font-semibold text-gray-700 mb-1">{title}</div>
      <div className="text-xs text-gray-500 mb-3">
        Selected: {formatNumber(rows[0]?.primary_value ?? null)} {primaryLabel}
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={((v: number, _name: string, props: { payload: { sampleSize: number } }) => [
              formatNumber(v),
              `${primaryLabel} (${props.payload.sampleSize} round${props.payload.sampleSize === 1 ? "" : "s"})`,
            ]) as Fmt}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.label} fill={d.isSelected ? "#2d7a3a" : "#9ca3af"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RoundDetailPage({ userId }: { userId: string }) {
  const { roundId } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedScores, setEditedScores] = useState<EditedScores>({});
  const [editedTeeBox, setEditedTeeBox] = useState("");
  const [availableTees, setAvailableTees] = useState<string[]>([]);
  const [comparison, setComparison] = useState<RoundComparison | null>(null);
  const [handicapIndex, setHandicapIndex] = useState<number | null>(null);
  const [showLinkCourse, setShowLinkCourse] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<CourseSummary[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!roundId) return;
    api.getRound(roundId).then((r) => {
      setRound(r);
      setLoading(false);
    });
    api.getRoundComparison(userId, roundId).then(setComparison).catch(() => {});
    api.getUserHandicap(userId).then((r) => setHandicapIndex(r.handicap_index)).catch(() => {});
  }, [roundId, userId]);


  const enterEditMode = useCallback(async () => {
    if (!round) return;
    const initial: EditedScores = {};
    for (const s of round.hole_scores) {
      if (s.hole_number != null) {
        initial[s.hole_number] = { strokes: s.strokes, putts: s.putts };
      }
    }
    setEditedScores(initial);
    setEditedTeeBox(round.tee_box ?? "");

    // Always fetch the full course fresh from the DB so we get every tee that
    // has been saved (including tees added by later scans via fill_course_gaps).
    // Fall back to whatever tees are already on the round object if the fetch fails.
    const fallbackColors = round.course?.tees
      .map((t) => t.color)
      .filter((c): c is string => !!c) ?? [];

    if (round.course?.id) {
      try {
        const full = await api.getCourse(String(round.course.id));
        setAvailableTees(full.tees.map((t) => t.color).filter((c): c is string => !!c));
      } catch {
        setAvailableTees(fallbackColors);
      }
    } else {
      setAvailableTees(fallbackColors);
    }

    setEditMode(true);
    setConfirmDelete(false);
  }, [round]);

  const cancelEdit = useCallback(() => {
    setEditMode(false);
    setEditedScores({});
  }, []);

  const handleSave = useCallback(async () => {
    if (!round || !roundId) return;
    setSaving(true);
    try {
      const holeScores = round.hole_scores
        .filter((s) => s.hole_number != null)
        .map((s) => {
          const edited = editedScores[s.hole_number!];
          const girValue = edited?.gir !== undefined ? edited.gir : s.green_in_regulation;
          return {
            hole_number: s.hole_number!,
            strokes: edited?.strokes ?? s.strokes,
            putts: edited?.putts ?? s.putts,
            fairway_hit: s.fairway_hit,
            green_in_regulation: girValue,
          };
        });
      const updated = await api.updateRound(roundId, {
        hole_scores: holeScores,
        tee_box: editedTeeBox || null,
      });
      setRound(updated);
      setEditMode(false);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [round, roundId, editedScores, editedTeeBox]);

  const handleDelete = useCallback(async () => {
    if (!roundId) return;
    await api.deleteRound(roundId);
    navigate("/rounds");
  }, [roundId, navigate]);

  const handleScoreChange = useCallback(
    (holeNumber: number, field: "strokes" | "putts", value: number | null) => {
      setEditedScores((prev) => ({
        ...prev,
        [holeNumber]: { ...prev[holeNumber], [field]: value },
      }));
    },
    []
  );

  const handleGirChange = useCallback(
    (holeNumber: number, value: boolean | null) => {
      setEditedScores((prev) => ({
        ...prev,
        [holeNumber]: { ...prev[holeNumber], gir: value },
      }));
    },
    []
  );

  const handleLinkQuery = useCallback((q: string) => {
    setLinkQuery(q);
    if (linkTimer.current) clearTimeout(linkTimer.current);
    if (q.trim().length < 2) { setLinkResults([]); return; }
    linkTimer.current = setTimeout(async () => {
      setLinkSearching(true);
      try {
        const results = await api.searchCourses(q.trim(), userId);
        setLinkResults(results);
      } catch { setLinkResults([]); }
      finally { setLinkSearching(false); }
    }, 300);
  }, [userId]);

  const handleSelectCourse = useCallback(async (course: CourseSummary) => {
    if (!roundId) return;
    setLinking(true);
    try {
      await api.linkCourse(roundId, course.id);
      // Reload the full round to get updated course/par data
      const updated = await api.getRound(roundId);
      setRound(updated);
      setShowLinkCourse(false);
      setLinkQuery("");
      setLinkResults([]);
    } catch (err) {
      console.error("Link failed:", err);
    } finally {
      setLinking(false);
    }
  }, [roundId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading round...</div>
      </div>
    );
  }

  if (!round) return <div>Round not found</div>;

  // Totals: use edited strokes in edit mode for live feedback.
  // Use key-existence so explicitly cleared scores (null) don't fall back to original.
  const totalScore = round.hole_scores.reduce((sum, s) => {
    const strokes =
      editMode && s.hole_number != null && s.hole_number in editedScores
        ? editedScores[s.hole_number].strokes
        : s.strokes;
    return sum + (strokes ?? 0);
  }, 0);
  const coursePar = round.course
    ? round.course.holes.reduce((sum, h) => sum + (h.par ?? 0), 0) || null
    : round.hole_scores.some((s) => s.par_played != null)
    ? round.hole_scores.reduce((sum, s) => sum + (s.par_played ?? 0), 0)
    : null;
  const toPar = coursePar !== null ? totalScore - coursePar : null;

  return (
    <div>
      <Link
        to="/rounds"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary mb-4"
      >
        <ArrowLeft size={16} />
        Back to Rounds
      </Link>

      <div className="flex items-start justify-between mb-2">
        <PageHeader
          title={round.course?.name ?? round.course_name_played ?? "Unknown Course"}
          subtitle={
            [
              round.date
                ? new Date(round.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : null,
              round.notes,
            ]
              .filter(Boolean)
              .join(" — ")
          }
        />

        <div className="flex items-center gap-2 mt-1 shrink-0">
          {!editMode ? (
            <>
              <button
                onClick={enterEditMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <Pencil size={14} />
                Edit
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                  <span className="text-sm text-red-700 font-medium">Delete this round?</span>
                  <button
                    onClick={handleDelete}
                    className="text-sm font-semibold text-red-700 hover:text-red-900"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      {(() => {
        const activeTeeBox = editMode ? editedTeeBox : round.tee_box;
        const tee = activeTeeBox
          ? round.course?.tees.find((t) => t.color?.toLowerCase() === activeTeeBox.toLowerCase()) ?? null
          : null;
        const courseHandicap =
          handicapIndex != null &&
          tee?.slope_rating != null &&
          tee?.course_rating != null &&
          coursePar != null
            ? calcCourseHandicap(handicapIndex, tee.slope_rating, tee.course_rating, coursePar)
            : null;
        const netScore = courseHandicap != null && totalScore > 0
          ? calcNetScore(totalScore, courseHandicap)
          : null;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 border-l-4 border-l-primary p-4 text-center shadow-sm">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Score</div>
              <div className="text-4xl font-bold text-gray-900">{totalScore || "-"}</div>
            </div>
            <div
              className={`bg-white rounded-xl border border-gray-200 border-l-4 p-4 text-center shadow-sm ${
                toPar !== null && toPar < 0 ? "border-l-birdie" : toPar !== null && toPar > 0 ? "border-l-bogey" : "border-l-gray-300"
              }`}
            >
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">To Par</div>
              <div className={`text-4xl font-bold ${toPar !== null && toPar < 0 ? "text-birdie" : toPar !== null && toPar > 0 ? "text-bogey" : "text-gray-900"}`}>
                {formatToPar(toPar)}
              </div>
            </div>
            <div className={`bg-white rounded-xl border border-gray-200 border-l-4 p-4 text-center shadow-sm ${netScore != null && coursePar != null ? netScore <= coursePar ? "border-l-birdie" : "border-l-bogey" : "border-l-gray-300"}`}>
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Net Score</div>
              <div className={`text-4xl font-bold ${netScore != null && coursePar != null ? netScore <= coursePar ? "text-birdie" : "text-bogey" : "text-gray-900"}`}>{netScore ?? "-"}</div>
              {courseHandicap != null && (
                <div className="text-xs text-gray-400 mt-0.5">HCP {courseHandicap < 0 ? `+${Math.abs(courseHandicap)}` : courseHandicap}</div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Tee</div>
              <div className="text-xl font-semibold text-gray-900">{activeTeeBox || "-"}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center shadow-sm">
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Course Par</div>
              <div className="text-xl font-semibold text-gray-900">{coursePar ?? "-"}</div>
            </div>
          </div>
        );
      })()}

      {/* Link-course banner — only for rounds with no linked course */}
      {!round.course && (
        <div className="mb-4">
          {!showLinkCourse ? (
            <button
              onClick={() => setShowLinkCourse(true)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors"
            >
              <Link2 size={14} />
              Link to a saved course
            </button>
          ) : (
            <CourseLinkSearch
              title="Link to a saved course"
              query={linkQuery}
              results={linkResults}
              searching={linkSearching}
              linking={linking}
              onQueryChange={handleLinkQuery}
              onSelectCourse={handleSelectCourse}
              onClose={() => { setShowLinkCourse(false); setLinkQuery(""); setLinkResults([]); }}
            />
          )}
        </div>
      )}

      <ScorecardGrid
        round={round}
        editMode={editMode}
        editedScores={editedScores}
        editedTeeBox={editedTeeBox}
        availableTees={availableTees}
        onScoreChange={handleScoreChange}
        onTeeBoxChange={setEditedTeeBox}
        onGirChange={handleGirChange}
      />

      {/* Round comparison */}
      {comparison && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-700 mb-4">Round Comparison</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ComparisonChartCard title="Score" rows={comparison.score} primaryLabel="score" />
            <ComparisonChartCard title="Putts" rows={comparison.putts} primaryLabel="putts" />
            <ComparisonChartCard title="GIR" rows={comparison.gir} primaryLabel="GIR" />
            <ComparisonChartCard title="3-Putts" rows={comparison.three_putts} primaryLabel="3-putts" />
            <ComparisonChartCard title="Putts per GIR" rows={comparison.putts_per_gir} primaryLabel="putts/GIR" />
            <ComparisonChartCard title="Scrambling" rows={comparison.scrambling} primaryLabel="scramble successes" />
          </div>
        </div>
      )}
    </div>
  );
}
