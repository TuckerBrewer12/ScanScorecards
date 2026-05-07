import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette, type ChartPalette } from "@/lib/chartPalettes";
import { SCORE_COLORS } from "@/lib/colors";
import { formatToPar } from "@/types/golf";
import type { ScoreTrendRow, NotableAchievements, NetScoreTrendRow } from "@/types/analytics";
import type { Round } from "@/types/golf";

interface BestRoundCardProps {
  scoreTrend: ScoreTrendRow[];
  netScoreTrend: NetScoreTrendRow[];
  achievements: NotableAchievements;
  compact?: boolean;
}

function scoreColor(strokes: number | null, par: number | null, palette?: ChartPalette | null): string {
  if (strokes == null || par == null) return "#f3f4f6";
  const d = strokes - par;
  if (d <= -2) return palette?.score.eagle    ?? SCORE_COLORS.eagle;
  if (d === -1) return palette?.score.birdie  ?? SCORE_COLORS.birdie;
  if (d === 0)  return palette?.score.par     ?? SCORE_COLORS.par;
  if (d === 1)  return palette?.score.bogey   ?? SCORE_COLORS.bogey;
  return palette?.score.double_bogey ?? SCORE_COLORS.double_bogey;
}

function scoreTextColor(strokes: number | null, par: number | null): string {
  if (strokes == null || par == null) return "rgba(0,0,0,0.2)";
  const d = strokes - par;
  if (d <= -1) return "rgba(0,0,0,0.75)"; // dark on bright bg
  if (d === 0) return "rgba(0,0,0,0.45)"; // muted on light gray
  return "rgba(0,0,0,0.65)";
}

function MiniScorecard({ round, palette }: { round: Round; palette?: ChartPalette | null }) {
  const holes = round.hole_scores.slice(0, 18);
  if (!holes.length) return null;

  const rows = [holes.slice(0, 9), holes.slice(9, 18)].filter((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-1">
      {rows.map((nine, rowIdx) => (
        <div key={rowIdx} className="flex gap-1">
          {nine.map((h, i) => {
            const par = h.par_played;
            const bg = scoreColor(h.strokes, par, palette);
            const fg = scoreTextColor(h.strokes, par);
            return (
              <div
                key={i}
                className="flex-1 flex items-center justify-center rounded"
                style={{ height: 22, background: bg, minWidth: 18 }}
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
      <div className="flex items-center gap-3 mt-0.5">
        {[
          { color: palette?.score.eagle        ?? SCORE_COLORS.eagle,        label: "Eagle+" },
          { color: palette?.score.birdie       ?? SCORE_COLORS.birdie,       label: "Birdie" },
          { color: palette?.score.par          ?? SCORE_COLORS.par,          label: "Par" },
          { color: palette?.score.bogey        ?? SCORE_COLORS.bogey,        label: "Bogey" },
          { color: palette?.score.double_bogey ?? SCORE_COLORS.double_bogey, label: "Double+" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-[9px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BestRoundCard({ scoreTrend, netScoreTrend, achievements, compact = false }: BestRoundCardProps) {
  const [roundDetail, setRoundDetail] = useState<Round | null>(null);
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);

  const best = useMemo(() => {
    const withScores = scoreTrend.filter((r) => r.to_par != null && r.total_score != null);
    if (!withScores.length) return null;
    return withScores.reduce((b, r) => (r.to_par! < b.to_par! ? r : b));
  }, [scoreTrend]);

  const bestNet = useMemo(() => {
    if (!best?.round_id) return null;
    return netScoreTrend.find((r) => r.round_id === best.round_id) ?? null;
  }, [best, netScoreTrend]);

  const scoreCounts = useMemo(() => {
    if (!roundDetail) return null;
    const holes = roundDetail.hole_scores.filter((h) => h.strokes != null && h.par_played != null);
    const eagles  = holes.filter((h) => h.strokes! - h.par_played! <= -2).length;
    const birdies = holes.filter((h) => h.strokes! - h.par_played! === -1).length;
    const pars    = holes.filter((h) => h.strokes! - h.par_played! === 0).length;
    const bogeys  = holes.filter((h) => h.strokes! - h.par_played! === 1).length;
    const doubles = holes.filter((h) => h.strokes! - h.par_played! === 2).length;
    const triples = holes.filter((h) => h.strokes! - h.par_played! >= 3).length;
    return [
      ...(eagles  > 0 ? [{ n: eagles,  label: "Eagle+",  color: SCORE_COLORS.eagle        }] : []),
      ...(birdies > 0 ? [{ n: birdies, label: "Birdie",  color: SCORE_COLORS.birdie       }] : []),
      ...(pars    > 0 ? [{ n: pars,    label: "Par",     color: SCORE_COLORS.par          }] : []),
      ...(bogeys  > 0 ? [{ n: bogeys,  label: "Bogey",   color: SCORE_COLORS.bogey        }] : []),
      ...(doubles > 0 ? [{ n: doubles, label: "Double",  color: SCORE_COLORS.double_bogey }] : []),
      ...(triples > 0 ? [{ n: triples, label: "Triple+", color: SCORE_COLORS.triple_bogey }] : []),
    ];
  }, [roundDetail]);

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
      className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 text-gray-900 p-4 shadow-sm"
    >

      {compact ? (
        <div className="flex flex-col gap-3">
          {/* Top row: score left, chips + net/hdcp right */}
          <div className="flex items-start justify-between gap-3">
            {/* Left: score */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Trophy size={13} className="text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Best Round
                </span>
              </div>
              <div className="text-3xl font-black tracking-tight leading-none">{best.total_score}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-base font-bold ${(best.to_par ?? 0) <= 0 ? "text-primary" : ""}`}
                  style={(best.to_par ?? 0) > 0 ? { color: colorBlindPalette?.score.bogey ?? "#ef4444" } : undefined}
                >
                  {formatToPar(best.to_par)}
                </span>
                {event?.course && (
                  <span className="text-xs text-gray-400 truncate max-w-[90px]">{event.course}</span>
                )}
              </div>
              {best.round_id && (
                <Link
                  to={`/rounds/${best.round_id}`}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-gray-400 hover:text-primary transition-colors"
                >
                  View <ArrowRight size={10} />
                </Link>
              )}
            </div>

            {/* Right: chips + net/hdcp */}
            <div className="flex flex-col items-end gap-2">
              {scoreCounts && scoreCounts.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1">
                  {scoreCounts.map((chip) => (
                    <div
                      key={chip.label}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md"
                      style={{ background: chip.color }}
                    >
                      <span className="text-xs font-black text-white leading-none">{chip.n}</span>
                      <span className="text-[9px] font-bold text-white/80 uppercase tracking-wide leading-none">
                        {chip.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {bestNet?.net_score != null && (
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-semibold text-gray-700">{bestNet.net_score}</span>
                  <span className="text-xs text-gray-400">net</span>
                  {bestNet.course_handicap != null && (
                    <span className="text-xs text-gray-400">· hdcp {bestNet.course_handicap}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Hole grid */}
          {roundDetail ? (
            <MiniScorecard round={roundDetail} palette={colorBlindPalette} />
          ) : (
            <div className="flex flex-col gap-1">
              {[0, 1].map((row) => (
                <div key={row} className="flex gap-1">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="flex-1 rounded animate-pulse" style={{ height: 22, background: "#f3f4f6" }} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          {/* Score info */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Trophy size={13} className="text-amber-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Best Round
              </span>
            </div>
            <div className="text-5xl font-black tracking-tight leading-none">{best.total_score}</div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span
                className={`text-xl font-bold ${(best.to_par ?? 0) <= 0 ? "text-primary" : ""}`}
                style={(best.to_par ?? 0) > 0 ? { color: colorBlindPalette?.score.bogey ?? "#ef4444" } : undefined}
              >
                {formatToPar(best.to_par)}
              </span>
              {event && (
                <span className="text-xs text-gray-400">
                  {event.course}
                  {event.date ? ` · ${new Date(event.date).toLocaleDateString()}` : ""}
                </span>
              )}
            </div>
            {bestNet?.net_score != null && (
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-sm font-semibold text-gray-700">{bestNet.net_score}</span>
                <span className="text-xs text-gray-400">net</span>
                {bestNet.course_handicap != null && (
                  <span className="text-xs text-gray-400">· hdcp {bestNet.course_handicap}</span>
                )}
              </div>
            )}
            {best.round_id && (
              <Link
                to={`/rounds/${best.round_id}`}
                className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-gray-400 hover:text-primary transition-colors"
              >
                View scorecard <ArrowRight size={11} />
              </Link>
            )}
          </div>

          {/* Mini scorecard */}
          <div className="flex-1 min-w-0">
            {roundDetail ? (
              <MiniScorecard round={roundDetail} palette={colorBlindPalette} />
            ) : (
              <div className="flex flex-col gap-1">
                {[0, 1].map((row) => (
                  <div key={row} className="flex gap-1">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="flex-1 rounded animate-pulse" style={{ height: 22, background: "#f3f4f6" }} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
