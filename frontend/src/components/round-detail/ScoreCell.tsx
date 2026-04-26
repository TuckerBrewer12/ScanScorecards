import { SCORE_SYMBOL_COLORS } from "@/lib/scoreSymbol";
import type { ChartPalette } from "@/lib/chartPalettes";

interface ScoreCellProps {
  strokes: number | null;
  par: number | null;
  palette?: ChartPalette | null;
}

const S = 28;
const cx = S / 2;

function ScoreSvg({ strokes, diff }: { strokes: number; diff: number }) {
  const { eagle, birdie, par, bogey, double: dbl, triple } = SCORE_SYMBOL_COLORS;

  let bg: string = par.bg;
  let fg: string = par.fg;
  if (diff <= -2) { bg = eagle.bg;  fg = eagle.fg; }
  else if (diff === -1) { bg = birdie.bg; fg = birdie.fg; }
  else if (diff === 0)  { bg = par.bg;    fg = par.fg; }
  else if (diff === 1)  { bg = bogey.bg;  fg = bogey.fg; }
  else if (diff === 2)  { bg = dbl.bg;    fg = dbl.fg; }
  else                  { bg = triple.bg; fg = triple.fg; }

  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: "block", margin: "0 auto" }}>
      {/* Eagle — double circle */}
      {diff <= -2 && (
        <>
          <circle cx={cx} cy={cx} r={7.5} fill={bg} />
          <circle cx={cx} cy={cx} r={12.5} fill="none" stroke={bg} strokeWidth={1.75} />
        </>
      )}

      {/* Birdie — single circle */}
      {diff === -1 && <circle cx={cx} cy={cx} r={12.5} fill={bg} />}

      {/* Par — subtle neutral square, no symbol */}
      {diff === 0 && <rect x={0.5} y={0.5} width={S - 1} height={S - 1} rx={4} fill={bg} />}

      {/* Bogey — single square */}
      {diff === 1 && <rect x={0.5} y={0.5} width={S - 1} height={S - 1} rx={2.5} fill={bg} />}

      {/* Double bogey — double square */}
      {diff === 2 && (
        <>
          <rect x={3.5} y={3.5} width={S - 7} height={S - 7} rx={2} fill={bg} />
          <rect x={0.5} y={0.5} width={S - 1} height={S - 1} rx={3.5} fill="none" stroke={bg} strokeWidth={1.5} />
        </>
      )}

      {/* Triple+ — square with /// slashes, number on top */}
      {diff >= 3 && (
        <>
          <rect x={0.5} y={0.5} width={S - 1} height={S - 1} rx={2.5} fill={bg} />
          <line x1={0}  y1={9}  x2={9}  y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.75} strokeLinecap="round" />
          <line x1={0}  y1={20} x2={20} y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.75} strokeLinecap="round" />
          <line x1={0}  y1={28} x2={28} y2={0}  stroke="rgba(255,255,255,0.38)" strokeWidth={1.75} strokeLinecap="round" />
          <line x1={14} y1={28} x2={28} y2={14} stroke="rgba(255,255,255,0.38)" strokeWidth={1.75} strokeLinecap="round" />
        </>
      )}

      {/* Score number — always on top */}
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fill={fg}
        fontSize={12}
        fontWeight="700"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {strokes}
      </text>
    </svg>
  );
}

export function ScoreCell({ strokes, par, palette }: ScoreCellProps) {
  if (strokes === null || par === null) {
    return <td className="px-2 py-1.5 text-center text-sm text-gray-300">-</td>;
  }

  const diff = strokes - par;

  // Colour-blind palette override: fall back to coloured SVG only when no palette active
  if (palette) {
    const paletteBackground =
      diff <= -2 ? palette.score.eagle
      : diff === -1 ? palette.score.birdie
      : diff === 0  ? palette.score.par
      : diff === 1  ? palette.score.bogey
      : diff === 2  ? palette.score.double_bogey
      : palette.score.triple_bogey;
    return (
      <td className="px-1 py-1 text-center">
        <span
          className="inline-flex items-center justify-center w-7 h-7 text-sm font-semibold"
          style={{
            backgroundColor: paletteBackground,
            color: diff === 0 ? "#111827" : "#ffffff",
            borderRadius: diff <= -1 ? "50%" : diff >= 1 ? "2px" : "4px",
            boxShadow: diff <= -2 || diff === 2 ? `0 0 0 2px #fff, 0 0 0 4px ${paletteBackground}` : undefined,
          }}
        >
          {strokes}
        </span>
      </td>
    );
  }

  return (
    <td className="px-1 py-1 text-center">
      <ScoreSvg strokes={strokes} diff={diff} />
    </td>
  );
}
