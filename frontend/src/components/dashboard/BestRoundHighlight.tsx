import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { SCORE_SYMBOL_COLORS } from "@/lib/scoreSymbol";
import type { RoundSummary, Round } from "@/types/golf";

interface BestRoundHighlightProps {
  rounds: RoundSummary[];
}

const CW = 30;
const CH = 22;
const ccx = CW / 2;
const ccy = CH / 2;
const CR = 9.5; // circle radius fits within CH

function MiniScoreSvg({ strokes, diff }: { strokes: number; diff: number }) {
  const { eagle, birdie, par, bogey, double: dbl, triple } = SCORE_SYMBOL_COLORS;

  let fg: string = par.fg;
  if (diff <= -2)       fg = eagle.fg;
  else if (diff === -1) fg = birdie.fg;
  else if (diff === 0)  fg = par.fg;
  else if (diff === 1)  fg = bogey.fg;
  else if (diff === 2)  fg = dbl.fg;
  else                  fg = triple.fg;

  return (
    <svg width={CW} height={CH} viewBox={`0 0 ${CW} ${CH}`} style={{ display: "block" }}>
      {diff <= -2 && (
        <>
          <circle cx={ccx} cy={ccy} r={5} fill={eagle.bg} />
          <circle cx={ccx} cy={ccy} r={CR} fill="none" stroke={eagle.bg} strokeWidth={1.5} />
        </>
      )}
      {diff === -1 && <circle cx={ccx} cy={ccy} r={CR} fill={birdie.bg} />}
      {diff === 0  && <rect x={0.5} y={0.5} width={CW - 1} height={CH - 1} rx={3} fill={par.bg} />}
      {diff === 1  && <rect x={0.5} y={0.5} width={CW - 1} height={CH - 1} rx={2} fill={bogey.bg} />}
      {diff === 2  && (
        <>
          <rect x={2.5} y={2.5} width={CW - 5} height={CH - 5} rx={1.5} fill={dbl.bg} />
          <rect x={0.5} y={0.5} width={CW - 1} height={CH - 1} rx={2.5} fill="none" stroke={dbl.bg} strokeWidth={1.25} />
        </>
      )}
      {diff >= 3 && (
        <>
          <rect x={0.5} y={0.5} width={CW - 1} height={CH - 1} rx={2} fill={triple.bg} />
          <line x1={0} y1={7}  x2={7}  y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={0} y1={18} x2={18} y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={0} y1={CH} x2={CW} y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={14} y1={CH} x2={CW} y2={8} stroke="rgba(255,255,255,0.38)" strokeWidth={1.5} strokeLinecap="round" />
        </>
      )}
      <text x={ccx} y={ccy} textAnchor="middle" dominantBaseline="central" fill={fg} fontSize={9} fontWeight="700" fontFamily="Inter, system-ui, sans-serif">
        {strokes}
      </text>
    </svg>
  );
}

function MiniScorecard({ round }: { round: Round }) {
  const holes = round.hole_scores.slice(0, 18);
  if (!holes.length) return null;

  const rows = [holes.slice(0, 9), holes.slice(9, 18)].filter((r) => r.length > 0);

  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((nine, rowIdx) => (
        <div key={rowIdx} className="flex gap-[3px]">
          {nine.map((h, i) => {
            const diff = h.strokes != null && h.par_played != null ? h.strokes - h.par_played : null;
            if (diff == null || h.strokes == null) {
              return (
                <div key={i} style={{ width: CW, height: CH, background: "#f3f4f6", borderRadius: 3 }} className="flex items-center justify-center">
                  <span className="text-[9px] text-gray-300 font-bold">·</span>
                </div>
              );
            }
            return (
              <div key={i} style={{ width: CW, height: CH }}>
                <MiniScoreSvg strokes={h.strokes} diff={diff} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BestRoundHighlight({ rounds }: BestRoundHighlightProps) {
  const validRounds = rounds.filter((r) => r.total_score != null);
  const [roundDetail, setRoundDetail] = useState<Round | null>(null);

  const best = validRounds.length > 0
    ? validRounds.reduce((prev, curr) => curr.total_score! < prev.total_score! ? curr : prev)
    : null;

  useEffect(() => {
    if (best?.id) {
      api.getRound(best.id).then(setRoundDetail).catch(() => {});
    }
  }, [best?.id]);

  if (!best) {
    return (
      <div className="text-center text-sm text-gray-500 p-4">
        Play a round to unlock highlights!
      </div>
    );
  }

  const parsedDate = best.date ? new Date(best.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const diffStr = best.to_par != null ? `To Par: ${best.to_par > 0 ? "+" + best.to_par : best.to_par}` : "";

  const skeleton = (
    <div className="flex flex-col gap-[3px]">
      {[0, 1].map((row) => (
        <div key={row} className="flex gap-[3px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded" style={{ width: CW, height: CH, background: "#f3f4f6" }} />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <Link to={`/rounds/${best.id}`} className="flex items-center gap-4 group">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shadow-sm border border-amber-200">
          <Trophy size={22} className="mt-0.5" />
        </div>
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
            Best Recent Round
          </div>
          <div className="font-bold text-gray-900 leading-tight group-hover:text-primary transition-colors">
            {best.course_name ?? "Unknown Course"}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {parsedDate} {diffStr ? `· ${diffStr}` : ""}
          </div>
        </div>
      </div>

      <div className="flex-1 flex justify-center">
        {roundDetail ? <MiniScorecard round={roundDetail} /> : skeleton}
      </div>

      <div className="shrink-0 text-right">
        <div className="text-4xl font-black text-gray-900 tracking-tighter group-hover:text-primary transition-colors">
          {best.total_score}
        </div>
      </div>
    </Link>
  );
}
