import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Link2, CalendarDays } from "lucide-react";
import type { CourseSummary } from "@/types/golf";
import { CourseLinkSearch } from "@/components/CourseLinkSearch";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette, type ChartPalette } from "@/lib/chartPalettes";
import type { Round } from "@/types/golf";
import { formatToPar, calcCourseHandicap, calcNetScore } from "@/types/golf";
import type { RoundComparison, ComparisonRow } from "@/types/analytics";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScorecardGrid } from "@/components/round-detail/ScorecardGrid";
import { RoundStory } from "@/components/round-detail/RoundStory";
import { RoundFlowTimeline } from "@/components/analytics/RoundFlowTimeline";

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 12,
  border: "1px solid #f1f5f9",
  boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
  background: "rgba(255,255,255,0.97)",
};

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="h-px w-8 bg-primary/30 rounded-full" />
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  );
}

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
  palette,
}: {
  title: string;
  rows: ComparisonRow[];
  primaryLabel: string;
  palette?: ChartPalette | null;
}) {
  const chartData = rows.map((row, i) => ({
    label: row.label,
    value: row.primary_value ?? 0,
    sampleSize: row.sample_size,
    isSelected: i === 0,
  }));
  const selectedFill = palette ? (palette.trend.primary ?? "#2563EB") : "url(#selectedBarGrad)";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50">
      <div className="text-sm font-bold text-gray-900 mb-1">{title}</div>
      <div className="text-xs text-gray-400 mb-3">
        <span className="font-bold text-primary">{formatNumber(rows[0]?.primary_value ?? null)}</span>
        {" "}{primaryLabel} this round
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="selectedBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette?.trend.secondary ?? "#4ade80"} stopOpacity={1} />
              <stop offset="100%" stopColor={palette?.trend.primary ?? "#2d7a3a"} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={((v: number, _name: string, props: { payload: { sampleSize: number } }) => [
              formatNumber(v),
              `${primaryLabel} (${props.payload.sampleSize} round${props.payload.sampleSize === 1 ? "" : "s"})`,
            ]) as Fmt}
            contentStyle={tooltipStyle}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.map((d) => (
              <Cell key={d.label} fill={d.isSelected ? selectedFill : (palette?.ui.mutedFill ?? "#e5e7eb")} />
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
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedScores, setEditedScores] = useState<EditedScores>({});
  const [editedTeeBox, setEditedTeeBox] = useState("");
  const [availableTees, setAvailableTees] = useState<string[]>([]);
  const [showLinkCourse, setShowLinkCourse] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<CourseSummary[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);

  const { data: round } = useQuery({
    queryKey: ["round", roundId],
    queryFn: () => api.getRound(roundId!),
    enabled: !!roundId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: comparison } = useQuery({
    queryKey: ["round-comparison", userId, roundId],
    queryFn: () => api.getRoundComparison(userId, roundId!),
    enabled: !!roundId,
  });
  const { data: handicapData } = useQuery({
    queryKey: ["handicap", userId],
    queryFn: () => api.getUserHandicap(userId),
  });
  const handicapIndex = handicapData?.handicap_index ?? null;


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
      queryClient.setQueryData(["round", roundId], updated);
      queryClient.invalidateQueries({ queryKey: ["round-comparison", userId, roundId] });
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
      await queryClient.invalidateQueries({ queryKey: ["round", roundId] });
      setShowLinkCourse(false);
      setLinkQuery("");
      setLinkResults([]);
    } catch (err) {
      console.error("Link failed:", err);
    } finally {
      setLinking(false);
    }
  }, [roundId]);

  if (!round) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading round...</div>
      </div>
    );
  }

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

      <PageHeader
        title={round.course?.name ?? round.course_name_played ?? "Unknown Course"}
        subtitle={
          round.date
            ? new Date(round.date).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })
            : undefined
        }
      />

      {/* ── Inline Hero Header ── */}
      <div className="py-2 mb-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left: identity */}
          <div className="min-w-0">
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 leading-tight truncate">
              {round.course?.name ?? round.course_name_played ?? "Unknown Course"}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {round.date && (
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <CalendarDays size={13} />
                  <span>
                    {new Date(round.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}
              {!round.course && !showLinkCourse && (
                <button
                  onClick={() => setShowLinkCourse(true)}
                  className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
                >
                  <Link2 size={12} />
                  Link course
                </button>
              )}
            </div>
            {showLinkCourse && (
              <div className="mt-3">
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
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 shrink-0">
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
                    <button onClick={handleDelete} className="text-sm font-semibold text-red-700 hover:text-red-900">Yes</button>
                    <button onClick={() => setConfirmDelete(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
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
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-6">
            <div className="flex items-stretch divide-x divide-gray-100">
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Score</div>
                <div className="text-4xl font-bold text-gray-900">{totalScore || "–"}</div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">To Par</div>
                <div className={`text-4xl font-bold ${toPar !== null && toPar < 0 ? "text-emerald-600" : toPar !== null && toPar > 0 ? "text-red-500" : "text-gray-900"}`}>
                  {formatToPar(toPar)}
                </div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Net</div>
                <div className={`text-4xl font-bold ${netScore != null && coursePar != null ? netScore <= coursePar ? "text-emerald-600" : "text-red-500" : "text-gray-900"}`}>
                  {netScore ?? "–"}
                </div>
                {courseHandicap != null && (
                  <div className="text-[11px] text-gray-400 mt-0.5">HCP {courseHandicap < 0 ? `+${Math.abs(courseHandicap)}` : courseHandicap}</div>
                )}
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Tee</div>
                <div className="text-4xl font-bold text-gray-900">{activeTeeBox || "–"}</div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center px-4 py-4">
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Par</div>
                <div className="text-4xl font-bold text-gray-900">{coursePar ?? "–"}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Story view (normal) / Scorecard grid (edit) */}
      {!editMode && <RoundStory round={round} />}

      <div className={!editMode ? "mt-5" : ""}>
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
      </div>

      {/* Round Flow */}
      {round.hole_scores.filter((s) => s.strokes != null).length >= 3 && (
        <div className="mt-6">
          <SectionLabel>Momentum</SectionLabel>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <RoundFlowTimeline round={round} />
          </div>
        </div>
      )}

      {/* Round comparison */}
      {comparison && (
        <div className="mt-8">
          <SectionLabel>Round Comparison</SectionLabel>
          <ScrollSection>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <ComparisonChartCard title="Score" rows={comparison.score} primaryLabel="score" palette={colorBlindPalette} />
              <ComparisonChartCard title="Putts" rows={comparison.putts} primaryLabel="putts" palette={colorBlindPalette} />
              <ComparisonChartCard title="GIR" rows={comparison.gir} primaryLabel="GIR" palette={colorBlindPalette} />
              <ComparisonChartCard title="3-Putts" rows={comparison.three_putts} primaryLabel="3-putts" palette={colorBlindPalette} />
              <ComparisonChartCard title="Putts per GIR" rows={comparison.putts_per_gir} primaryLabel="putts/GIR" palette={colorBlindPalette} />
              <ComparisonChartCard title="Scrambling" rows={comparison.scrambling} primaryLabel="scramble successes" palette={colorBlindPalette} />
            </div>
          </ScrollSection>
        </div>
      )}
    </div>
  );
}
