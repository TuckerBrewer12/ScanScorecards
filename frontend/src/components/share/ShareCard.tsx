import { forwardRef } from "react";
import type { Round } from "@/types/golf";
import { getScoreType } from "@/types/golf";

interface ShareCardProps {
  round: Round;
  courseName: string;
}

type ScoreKey = "eagle" | "birdie" | "par" | "bogey" | "double-bogey" | "worse";

const COLORS: Record<ScoreKey, { bg: string; fg: string }> = {
  eagle:          { bg: "#a16207", fg: "#fff" },
  birdie:         { bg: "#0b8a5e", fg: "#fff" },
  par:            { bg: "#e5e7eb", fg: "#4b5563" },
  bogey:          { bg: "#d94040", fg: "#fff" },
  "double-bogey": { bg: "#3b78e0", fg: "#fff" },
  worse:          { bg: "#7c52e0", fg: "#fff" },
};

// SVG cell using traditional golf scorecard symbols
function HoleCell({ strokes, type }: { strokes: number | null; type: ScoreKey | null }) {
  const S = 33;
  const cx = S / 2;
  const label = strokes != null ? `${strokes}` : "·";
  const color = type ? COLORS[type].bg : "#e5e7eb";
  const fg = type ? COLORS[type].fg : "#9ca3af";

  return (
    <svg
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      style={{ display: "block" }}
    >
      {/* Eagle — double circle */}
      {type === "eagle" && (
        <>
          <circle cx={cx} cy={cx} r={9} fill={color} />
          <circle cx={cx} cy={cx} r={14.5} fill="none" stroke={color} strokeWidth={2} />
        </>
      )}

      {/* Birdie — single circle */}
      {type === "birdie" && (
        <circle cx={cx} cy={cx} r={14.5} fill={color} />
      )}

      {/* Par — no symbol, subtle neutral square */}
      {type === "par" && (
        <rect x={1} y={1} width={S - 2} height={S - 2} rx={5} fill="#ebebed" />
      )}

      {/* Bogey — single square */}
      {type === "bogey" && (
        <rect x={1} y={1} width={S - 2} height={S - 2} rx={3} fill={color} />
      )}

      {/* Double bogey — double square */}
      {type === "double-bogey" && (
        <>
          <rect x={4.5} y={4.5} width={S - 9} height={S - 9} rx={2} fill={color} />
          <rect x={1} y={1} width={S - 2} height={S - 2} rx={4} fill="none" stroke={color} strokeWidth={1.5} />
        </>
      )}

      {/* Triple+ — hatched square with /// slashes behind the number */}
      {type === "worse" && (
        <>
          <rect x={1} y={1} width={S - 2} height={S - 2} rx={3} fill={color} />
          {/* Four parallel "/" slashes, evenly distributed across the cell */}
          <line x1={0}  y1={11} x2={11} y2={0}  stroke="rgba(255,255,255,0.40)" strokeWidth={2} strokeLinecap="round" />
          <line x1={0}  y1={24} x2={24} y2={0}  stroke="rgba(255,255,255,0.40)" strokeWidth={2} strokeLinecap="round" />
          <line x1={4}  y1={33} x2={33} y2={4}  stroke="rgba(255,255,255,0.40)" strokeWidth={2} strokeLinecap="round" />
          <line x1={17} y1={33} x2={33} y2={17} stroke="rgba(255,255,255,0.40)" strokeWidth={2} strokeLinecap="round" />
        </>
      )}

      {/* No data */}
      {type === null && (
        <rect x={1} y={1} width={S - 2} height={S - 2} rx={5} fill="#ebebed" />
      )}

      {/* Score number */}
      <text
        x={cx}
        y={cx}
        textAnchor="middle"
        dominantBaseline="central"
        fill={type === "par" ? "#4b5563" : type === null ? "#9ca3af" : fg}
        fontSize={13}
        fontWeight="800"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}

// Avoid Date constructor timezone issues — parse manually
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const m = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m[2]) - 1]} ${parseInt(m[3])}, ${m[1]}`;
}

function formatToPar(toPar: number | null): string {
  if (toPar === null) return "";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ round, courseName }, ref) => {
    const scores = [...round.hole_scores].sort(
      (a, b) => (a.hole_number ?? 0) - (b.hole_number ?? 0)
    );

    const getHolePar = (s: typeof scores[0]) =>
      s.par_played ??
      round.course?.holes.find((h) => h.number === s.hole_number)?.par ??
      null;

    const totalScore = scores.reduce((s, h) => s + (h.strokes ?? 0), 0);
    const coursePar = round.course
      ? round.course.holes.reduce((s, h) => s + (h.par ?? 0), 0) || null
      : scores.some((s) => s.par_played != null)
      ? scores.reduce((s, h) => s + (h.par_played ?? 0), 0)
      : null;
    const toPar = coursePar !== null && totalScore > 0 ? totalScore - coursePar : null;

    // Yardage
    const matchedTee = round.tee_box
      ? round.course?.tees.find(
          (t) => t.color?.toLowerCase() === round.tee_box!.toLowerCase()
        ) ?? null
      : null;
    const totalYardage =
      matchedTee?.total_yardage ??
      (matchedTee?.hole_yardages && Object.keys(matchedTee.hole_yardages).length > 0
        ? Object.values(matchedTee.hole_yardages).reduce((s, y) => s + (y as number), 0)
        : null) ??
      (round.user_tee?.hole_yardages && Object.keys(round.user_tee.hole_yardages).length > 0
        ? Object.values(round.user_tee.hole_yardages).reduce((s, y) => s + (y as number), 0)
        : null);

    // Putts
    const puttHoles = scores.filter((s) => s.putts != null);
    const displayPutts =
      round.total_putts ??
      (puttHoles.length > 0 ? puttHoles.reduce((s, h) => s + (h.putts ?? 0), 0) : null);

    // GIR
    const girHoles = scores.filter((s) => s.green_in_regulation != null);
    const girCount = girHoles.filter((s) => s.green_in_regulation === true).length;
    const displayGir =
      round.total_gir != null
        ? `${round.total_gir}/${scores.filter((s) => s.strokes != null).length}`
        : girHoles.length > 0
        ? `${girCount}/${girHoles.length}`
        : null;

    // Score type counts
    const counts: Record<ScoreKey, number> = {
      eagle: 0, birdie: 0, par: 0, bogey: 0, "double-bogey": 0, worse: 0,
    };
    for (const s of scores) {
      if (s.strokes == null) continue;
      const p = getHolePar(s);
      if (p != null) counts[getScoreType(s.strokes, p) as ScoreKey]++;
    }
    const chips: { key: ScoreKey; label: string; n: number }[] = [
      { key: "eagle",         label: counts.eagle  === 1 ? "Eagle"  : "Eagles",  n: counts.eagle },
      { key: "birdie",        label: counts.birdie === 1 ? "Birdie" : "Birdies", n: counts.birdie },
      { key: "par",           label: "Pars",                                       n: counts.par },
      { key: "bogey",         label: "Bogeys",                                     n: counts.bogey },
      { key: "double-bogey",  label: "Doubles",                                    n: counts["double-bogey"] },
      { key: "worse",         label: "Triple+",                                    n: counts.worse },
    ].filter((c) => c.n > 0 || c.key === "par") as { key: ScoreKey; label: string; n: number }[];

    const toParStr = formatToPar(toPar);
    const toParColor =
      toPar === null ? "#111827" : toPar < 0 ? "#0b8a5e" : toPar > 0 ? "#d94040" : "#111827";

    return (
      <div
        ref={ref}
        style={{
          width: 390,
          background: "#f9fafb",
          fontFamily: '"Inter", system-ui, -apple-system, sans-serif',
          WebkitFontSmoothing: "antialiased",
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(180deg, #1e3d25 0%, #152d1b 100%)",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <span style={{ fontSize: 16 }}>⛳</span>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" }}>
            BirdieEyeView
          </span>
        </div>

        {/* Course + score */}
        <div style={{ padding: "18px 20px 16px" }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              marginBottom: 3,
            }}
          >
            {courseName}
          </div>
          {round.date && (
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 14 }}>
              {formatDate(round.date)}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <div
              style={{
                fontSize: 68,
                fontWeight: 900,
                color: "#111827",
                letterSpacing: "-0.045em",
                lineHeight: 1,
              }}
            >
              {totalScore || "—"}
            </div>
            <div style={{ paddingBottom: 8 }}>
              {toParStr && (
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 800,
                    color: toParColor,
                    letterSpacing: "-0.03em",
                    lineHeight: 1,
                  }}
                >
                  {toParStr}
                </div>
              )}
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  marginTop: 3,
                  display: "flex",
                  gap: 5,
                  alignItems: "center",
                }}
              >
                {coursePar && <span>par {coursePar}</span>}
                {coursePar && totalYardage && <span style={{ color: "#d1d5db" }}>·</span>}
                {totalYardage && <span>{totalYardage.toLocaleString()} yds</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Hole grid */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid #e9eaec",
            borderBottom: "1px solid #e9eaec",
          }}
        >
          {[0, 9].map((offset) => (
            <div key={offset} style={{ marginBottom: offset === 0 ? 7 : 0 }}>
              {/* Hole numbers */}
              <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                {scores.slice(offset, offset + 9).map((s) => (
                  <div
                    key={s.hole_number}
                    style={{
                      width: 33,
                      textAlign: "center",
                      fontSize: 9,
                      color: "#9ca3af",
                      fontWeight: 600,
                    }}
                  >
                    {s.hole_number}
                  </div>
                ))}
              </div>
              {/* Score cells */}
              <div style={{ display: "flex", gap: 3 }}>
                {scores.slice(offset, offset + 9).map((s) => {
                  const p = getHolePar(s);
                  const type =
                    s.strokes != null && p != null
                      ? (getScoreType(s.strokes, p) as ScoreKey)
                      : null;
                  return (
                    <HoleCell key={s.hole_number} strokes={s.strokes} type={type} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Score chips */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "12px 20px",
            borderBottom: "1px solid #e9eaec",
          }}
        >
          {chips.map((chip) => {
            const { bg, fg } = COLORS[chip.key];
            return (
              <div
                key={chip.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  background: bg,
                  borderRadius: 10,
                  padding: "5px 11px",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 900, color: fg, lineHeight: 1 }}>
                  {chip.n}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: chip.key === "par" ? "#6b7280" : "rgba(255,255,255,0.75)",
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                  }}
                >
                  {chip.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Putts + GIR */}
        {(displayPutts != null || displayGir != null) && (
          <div style={{ display: "flex", borderBottom: "1px solid #e9eaec" }}>
            {[
              { label: "Putts", value: displayPutts != null ? `${displayPutts}` : null },
              { label: "GIR",   value: displayGir },
            ]
              .filter((s) => s.value != null)
              .map((stat, i) => (
                <div
                  key={stat.label}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "11px 0",
                    borderLeft: i > 0 ? "1px solid #e9eaec" : "none",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, color: stat.label === "GIR" ? "#0b8a5e" : "#111827", letterSpacing: "-0.02em" }}>
                    {stat.value}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "#9ca3af",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginTop: 2,
                    }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "7px 20px 9px",
            textAlign: "center",
            fontSize: 10,
            color: "#d1d5db",
            fontWeight: 600,
            letterSpacing: "0.06em",
          }}
        >
          BIRDIEYEVIEW
        </div>
      </div>
    );
  }
);

ShareCard.displayName = "ShareCard";
