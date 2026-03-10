import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { ScoreTrendRow, NotableAchievements } from "@/types/analytics";
import type { Round } from "@/types/golf";

interface BestRoundCardProps {
  scoreTrend: ScoreTrendRow[];
  achievements: NotableAchievements;
}

function formatToPar(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

function scoreColor(strokes: number | null, par: number | null): string {
  if (strokes == null || par == null) return "rgba(255,255,255,0.08)";
  const d = strokes - par;
  if (d <= -2) return "#fbbf24"; // eagle+
  if (d === -1) return "#34d399"; // birdie
  if (d === 0)  return "rgba(255,255,255,0.22)"; // par
  if (d === 1)  return "#fca5a5"; // bogey
  return "#93c5fd"; // double+
}

function scoreTextColor(strokes: number | null, par: number | null): string {
  if (strokes == null || par == null) return "rgba(255,255,255,0.2)";
  const d = strokes - par;
  if (d <= -1) return "rgba(0,0,0,0.75)"; // dark on bright bg
  if (d === 0) return "rgba(255,255,255,0.7)"; // light on translucent
  return "rgba(0,0,0,0.65)";
}

function MiniScorecard({ round }: { round: Round }) {
  const holes = round.hole_scores.slice(0, 18);
  if (!holes.length) return null;

  const rows = [holes.slice(0, 9), holes.slice(9, 18)].filter((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((nine, rowIdx) => (
        <div key={rowIdx} className="flex gap-1">
          {nine.map((h, i) => {
            const par = h.par_played;
            const bg = scoreColor(h.strokes, par);
            const fg = scoreTextColor(h.strokes, par);
            return (
              <div
                key={i}
                className="flex-1 flex items-center justify-center rounded"
                style={{ height: 28, background: bg, minWidth: 18 }}
              >
                <span className="text-[10px] font-bold leading-none" style={{ color: fg }}>
                  {h.strokes ?? "·"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      {/* Legend */}
      <div className="flex items-center gap-3 mt-1">
        {[
          { color: "#fbbf24", label: "Eagle+" },
          { color: "#34d399", label: "Birdie" },
          { color: "rgba(255,255,255,0.22)", label: "Par" },
          { color: "#fca5a5", label: "Bogey" },
          { color: "#93c5fd", label: "Double+" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-[9px] text-white/40">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BestRoundCard({ scoreTrend, achievements }: BestRoundCardProps) {
  const [roundDetail, setRoundDetail] = useState<Round | null>(null);

  const best = useMemo(() => {
    const withScores = scoreTrend.filter((r) => r.to_par != null && r.total_score != null);
    if (!withScores.length) return null;
    return withScores.reduce((b, r) => (r.to_par! < b.to_par! ? r : b));
  }, [scoreTrend]);

  useEffect(() => {
    if (best?.round_id) {
      api.getRound(best.round_id).then(setRoundDetail).catch(() => {});
    }
  }, [best?.round_id]);

  if (!best) return null;

  const event = achievements?.scoring_records_events?.lifetime?.lowest_score;

  return (
    <motion.div
      whileHover={{ scale: 1.008 }}
      transition={{ type: "spring", stiffness: 350, damping: 28 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1e3d25] to-[#2d5a35] text-white p-6 shadow-lg"
    >
      {/* Background glow */}
      <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/5 blur-3xl pointer-events-none" />

      <div className="flex items-start justify-between gap-6">
        {/* Left — score info */}
        <div className="shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={13} className="text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Best Round
            </span>
          </div>
          <div className="text-6xl font-black tracking-tight leading-none">
            {best.total_score}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-xl font-bold text-amber-400">
              {formatToPar(best.to_par)}
            </span>
            {event && (
              <span className="text-xs text-white/40">
                {event.course}
                {event.date ? ` · ${new Date(event.date).toLocaleDateString()}` : ""}
              </span>
            )}
          </div>
          {best.round_id && (
            <Link
              to={`/rounds/${best.round_id}`}
              className="inline-flex items-center gap-1.5 mt-5 text-xs font-semibold text-white/50 hover:text-white transition-colors"
            >
              View scorecard <ArrowRight size={11} />
            </Link>
          )}
        </div>

        {/* Right — mini scorecard */}
        <div className="flex-1 min-w-0">
          {roundDetail ? (
            <MiniScorecard round={roundDetail} />
          ) : (
            <div className="flex flex-col gap-1.5">
              {[0, 1].map((row) => (
                <div key={row} className="flex gap-1">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded animate-pulse"
                      style={{ height: 28, background: "rgba(255,255,255,0.06)" }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
