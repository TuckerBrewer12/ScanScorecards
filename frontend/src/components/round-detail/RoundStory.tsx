import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Round } from "@/types/golf";

// ─── Score config ───────────────────────────────────────────────────────────

// bg = tile fill, text = label/stroke color (white on dark, dark on light)
const SCORE_CFG = {
  eagle_plus: { bg: "#b45309", text: "#fff",     short: "EGL" },
  birdie:     { bg: "#059669", text: "#fff",     short: "BIR" },
  par:        { bg: "#e5e7eb", text: "#6b7280",  short: "PAR" },
  bogey:      { bg: "#ef4444", text: "#fff",     short: "+1"  },
  double:     { bg: "#3b82f6", text: "#fff",     short: "+2"  },
  triple:     { bg: "#8b5cf6", text: "#fff",     short: "+3"  },
  quad_plus:  { bg: "#6d28d9", text: "#fff",     short: "+4"  },
} as const;

function scoreCfg(toPar: number) {
  if (toPar <= -2) return SCORE_CFG.eagle_plus;
  if (toPar === -1) return SCORE_CFG.birdie;
  if (toPar === 0)  return SCORE_CFG.par;
  if (toPar === 1)  return SCORE_CFG.bogey;
  if (toPar === 2)  return SCORE_CFG.double;
  if (toPar === 3)  return SCORE_CFG.triple;
  return SCORE_CFG.quad_plus;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface HoleData {
  hole: number;
  strokes: number;
  par: number;
  toPar: number;
  putts: number | null;
  gir: boolean | null;
  fairway: boolean | null;
}

interface Streak {
  startIdx: number;
  count: number;
  type: "birdie_run" | "bogey_run";
}

// ─── Streak detection ────────────────────────────────────────────────────────

function findStreaks(holes: HoleData[]): Streak[] {
  const streaks: Streak[] = [];
  let i = 0;
  while (i < holes.length) {
    const cat = holes[i].toPar <= -1 ? "birdie" : holes[i].toPar >= 1 ? "bogey" : null;
    if (!cat) { i++; continue; }
    let j = i + 1;
    while (j < holes.length && (cat === "birdie" ? holes[j].toPar <= -1 : holes[j].toPar >= 1)) j++;
    if (j - i >= 2) {
      streaks.push({ startIdx: i, count: j - i, type: cat === "birdie" ? "birdie_run" : "bogey_run" });
    }
    i = j;
  }
  return streaks;
}

// ─── Tile dimensions (must match gap-1.5 = 6px) ──────────────────────────────

const TILE_W = 44;
const TILE_GAP = 6;

// ─── HoleTile ────────────────────────────────────────────────────────────────

function HoleTile({ hole, idx, isBlowup }: { hole: HoleData; idx: number; isBlowup: boolean }) {
  const cfg = scoreCfg(hole.toPar);
  return (
    <motion.div
      className="flex-shrink-0 flex flex-col items-center rounded-xl overflow-hidden"
      style={{ width: TILE_W, background: cfg.bg }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.03, duration: 0.2 }}
    >
      <div className="flex flex-col items-center py-2 px-1 gap-px">
        <span style={{ fontSize: 8.5, color: cfg.text, opacity: 0.55, fontWeight: 600 }}>H{hole.hole}</span>
        <span style={{ fontSize: 22, fontWeight: 900, color: cfg.text, lineHeight: 1.1 }}>
          {hole.strokes}
        </span>
        <span style={{ fontSize: 7.5, fontWeight: 700, color: cfg.text, opacity: 0.7, letterSpacing: "0.03em" }}>
          {isBlowup ? "⚡" : cfg.short}
        </span>
      </div>
    </motion.div>
  );
}

// ─── StreakBadge ─────────────────────────────────────────────────────────────

function StreakBadge({ streak, offset }: { streak: Streak; offset: number }) {
  const color = streak.type === "birdie_run" ? "#059669" : "#ef4444";
  const label = streak.type === "birdie_run"
    ? `${streak.count} BIRDIES`
    : `${streak.count} BOGEYS`;
  const left = streak.startIdx * (TILE_W + TILE_GAP);
  const width = streak.count * (TILE_W + TILE_GAP) - TILE_GAP;

  return (
    <motion.div
      className="absolute flex items-center justify-center"
      style={{ left, top: 0, width }}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7 + offset * 0.1 }}
    >
      <div
        className="rounded-full px-2 py-0.5 flex items-center gap-1"
        style={{ background: color + "15", border: `1px solid ${color}30` }}
      >
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 7.5, fontWeight: 800, color, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
    </motion.div>
  );
}

// ─── NineRow ─────────────────────────────────────────────────────────────────

function NineRow({
  holes, streaks, label, globalOffset,
}: {
  holes: HoleData[];
  streaks: Streak[];
  label: string;
  globalOffset: number;
}) {
  if (holes.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">{label}</p>
      {/* pt-6 reserves room for streak badges */}
      <div className="relative pt-6">
        {streaks.map((s, i) => (
          <StreakBadge key={i} streak={s} offset={i} />
        ))}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {holes.map((hole, i) => (
            <HoleTile
              key={hole.hole}
              hole={hole}
              idx={globalOffset + i}
              isBlowup={hole.toPar >= 3}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── RoundInNumbers ──────────────────────────────────────────────────────────

function RoundInNumbers({ holes }: { holes: HoleData[] }) {
  const s = useMemo(() => {
    const eagles  = holes.filter(h => h.toPar <= -2).length;
    const birdies = holes.filter(h => h.toPar === -1).length;
    const pars    = holes.filter(h => h.toPar === 0).length;
    const bogeys  = holes.filter(h => h.toPar === 1).length;
    const doubles = holes.filter(h => h.toPar === 2).length;
    const triples = holes.filter(h => h.toPar >= 3).length;

    const puttsHoles = holes.filter(h => h.putts != null);
    const totalPutts = puttsHoles.reduce((a, h) => a + (h.putts ?? 0), 0);

    const girHoles = holes.filter(h => h.gir != null);
    const girCount = girHoles.filter(h => h.gir).length;

    const front9 = holes.filter(h => h.hole <= 9);
    const back9  = holes.filter(h => h.hole >= 10);
    const hasBoth = front9.length > 0 && back9.length > 0;

    const chips: { val: number | string; label: string; color: string }[] = [
      ...(eagles  > 0 ? [{ val: eagles,  label: eagles  === 1 ? "Eagle"  : "Eagles",  color: "#b45309" }] : []),
      ...(birdies > 0 ? [{ val: birdies, label: birdies === 1 ? "Birdie" : "Birdies", color: "#059669" }] : []),
      { val: pars, label: "Pars", color: "#9ca3af" },
      ...(bogeys  > 0 ? [{ val: bogeys,  label: "Bogeys",  color: "#ef4444" }] : []),
      ...(doubles > 0 ? [{ val: doubles, label: "Doubles", color: "#3b82f6" }] : []),
      ...(triples > 0 ? [{ val: triples, label: "Triple+", color: "#8b5cf6" }] : []),
    ];

    return {
      chips,
      putts:  puttsHoles.length > 0 ? totalPutts : null,
      gir:    girHoles.length   > 0 ? `${girCount}/${girHoles.length}` : null,
      front9: hasBoth ? front9.reduce((a, h) => a + h.strokes, 0) : null,
      back9:  hasBoth ? back9.reduce((a, h) => a + h.strokes, 0) : null,
    };
  }, [holes]);

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {s.chips.map(chip => (
        <div
          key={chip.label}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
          style={{ background: chip.color }}
        >
          <span style={{ fontSize: 16, fontWeight: 900, color: "#fff", lineHeight: 1 }}>{chip.val}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", opacity: 0.8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {chip.label}
          </span>
        </div>
      ))}

      {(s.putts != null || s.gir != null || s.front9 != null) && (
        <div className="w-px h-5 bg-gray-200 mx-1" />
      )}

      {s.putts != null && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
          <span className="text-base font-black text-gray-700">{s.putts}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Putts</span>
        </div>
      )}
      {s.gir != null && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
          <span className="text-base font-black text-emerald-600">{s.gir}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">GIR</span>
        </div>
      )}
      {s.front9 != null && s.back9 != null && (
        <>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
            <span className="text-base font-black text-gray-700">{s.front9}</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Front</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-50 border border-gray-100">
            <span className="text-base font-black text-gray-700">{s.back9}</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Back</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Narrative text ──────────────────────────────────────────────────────────

function buildNarrative(holes: HoleData[]): string {
  const birdies  = holes.filter(h => h.toPar <= -1);
  const blowups  = holes.filter(h => h.toPar >= 3);
  const doubles  = holes.filter(h => h.toPar === 2);
  const front9   = holes.filter(h => h.hole <= 9);
  const back9    = holes.filter(h => h.hole >= 10);
  const hasBoth  = front9.length > 0 && back9.length > 0;
  const parts: string[] = [];

  if (birdies.length >= 4) {
    parts.push(`${birdies.length} birdies — an aggressive, attack-the-flag round`);
  } else if (birdies.length > 0) {
    const nums = birdies.slice(0, 3).map(b => b.hole).join(", ");
    parts.push(`Birdie${birdies.length > 1 ? "s" : ""} on ${birdies.length > 1 ? "holes " : "hole "}${nums}`);
  }

  if (blowups.length > 0) {
    const worst = blowups.reduce((a, b) => a.toPar > b.toPar ? a : b);
    parts.push(`hole ${worst.hole} a blowup (+${worst.toPar})`);
  } else if (doubles.length > 1) {
    parts.push(`${doubles.length} doubles added up`);
  }

  if (hasBoth) {
    const ftp = front9.reduce((s, h) => s + h.toPar, 0);
    const btp = back9.reduce((s, h) => s + h.toPar, 0);
    if (Math.abs(ftp - btp) >= 4) {
      parts.push(ftp < btp ? "stronger front nine" : "stronger back nine");
    }
  }

  if (parts.length === 0) {
    const total = holes.reduce((s, h) => s + h.toPar, 0);
    if (total <= 0) return "Clean, disciplined round — no blowups.";
    if (birdies.length === 0) return "Consistent but couldn't get birdies going.";
    return "Up and down — birdies offset by a few mistakes.";
  }

  return parts.join(" · ") + ".";
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function RoundStory({ round }: { round: Round }) {
  const holes = useMemo<HoleData[]>(() => {
    return round.hole_scores
      .filter(s => s.hole_number != null && s.strokes != null)
      .map(s => {
        const courseHole = round.course?.holes.find(h => h.number === s.hole_number);
        const par = courseHole?.par ?? s.par_played ?? 4;
        return {
          hole: s.hole_number!,
          strokes: s.strokes!,
          par,
          toPar: s.strokes! - par,
          putts: s.putts,
          gir: s.green_in_regulation,
          fairway: s.fairway_hit,
        };
      })
      .sort((a, b) => a.hole - b.hole);
  }, [round]);

  const narrative = useMemo(() => buildNarrative(holes), [holes]);

  if (holes.length === 0) return null;

  return (
    <div>
      <RoundInNumbers holes={holes} />
      <p className="text-xs text-gray-400 mt-1 italic leading-relaxed">{narrative}</p>
    </div>
  );
}
