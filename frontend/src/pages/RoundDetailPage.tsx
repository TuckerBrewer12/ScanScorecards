import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Round } from "@/types/golf";
import { formatToPar } from "@/types/golf";
import { PageHeader } from "@/components/layout/PageHeader";
import { ScorecardGrid } from "@/components/round-detail/ScorecardGrid";

type EditedScores = Record<number, { strokes: number | null; putts: number | null }>;

export function RoundDetailPage() {
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

  useEffect(() => {
    if (!roundId) return;
    api.getRound(roundId).then((r) => {
      setRound(r);
      setLoading(false);
    });
  }, [roundId]);

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
          return {
            hole_number: s.hole_number!,
            strokes: edited?.strokes ?? s.strokes,
            putts: edited?.putts ?? s.putts,
            fairway_hit: s.fairway_hit,
            green_in_regulation: s.green_in_regulation,
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Score</div>
          <div className="text-3xl font-bold text-gray-900">{totalScore || "-"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">To Par</div>
          <div
            className={`text-3xl font-bold ${
              toPar !== null && toPar < 0
                ? "text-green-600"
                : toPar !== null && toPar > 0
                ? "text-red-500"
                : "text-gray-900"
            }`}
          >
            {formatToPar(toPar)}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Tee</div>
          <div className="text-lg font-semibold text-gray-900">
            {(editMode ? editedTeeBox : round.tee_box) || "-"}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Course Par</div>
          <div className="text-lg font-semibold text-gray-900">{coursePar ?? "-"}</div>
        </div>
      </div>

      <ScorecardGrid
        round={round}
        editMode={editMode}
        editedScores={editedScores}
        editedTeeBox={editedTeeBox}
        availableTees={availableTees}
        onScoreChange={handleScoreChange}
        onTeeBoxChange={setEditedTeeBox}
      />
    </div>
  );
}
