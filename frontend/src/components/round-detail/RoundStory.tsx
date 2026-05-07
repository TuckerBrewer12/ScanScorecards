import { useMemo } from "react";
import type { Round } from "@/types/golf";
import { SCORE_COLORS } from "@/lib/colors";

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
      ...(eagles  > 0 ? [{ val: eagles,  label: eagles  === 1 ? "Eagle"  : "Eagles",  color: SCORE_COLORS.eagle        }] : []),
      ...(birdies > 0 ? [{ val: birdies, label: birdies === 1 ? "Birdie" : "Birdies", color: SCORE_COLORS.birdie       }] : []),
      { val: pars, label: "Pars", color: SCORE_COLORS.par },
      ...(bogeys  > 0 ? [{ val: bogeys,  label: "Bogeys",  color: SCORE_COLORS.bogey        }] : []),
      ...(doubles > 0 ? [{ val: doubles, label: "Doubles", color: SCORE_COLORS.double_bogey }] : []),
      ...(triples > 0 ? [{ val: triples, label: "Triple+", color: SCORE_COLORS.triple_bogey }] : []),
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
