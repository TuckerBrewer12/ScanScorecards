import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Upload, RotateCcw, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicScan } from "@/hooks/usePublicScan";
import { ScorecardLayoutPicker } from "@/components/scan/ScorecardLayoutPicker";
import type { ExtractedHoleScore, ScanResult } from "@/types/scan";

// ── Score helpers (identical to ScanReviewStep) ──────────────────────────────

function getScoreColorClass(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "border-gray-200 text-gray-400";
  const diff = strokes - par;
  if (diff <= -2) return "border-yellow-500 bg-yellow-50 text-yellow-900";
  if (diff === -1) return "border-green-500 bg-green-50 text-green-900";
  if (diff === 0)  return "border-gray-300 bg-white text-gray-800";
  if (diff === 1)  return "border-red-300 bg-red-50 text-red-800";
  if (diff === 2)  return "border-orange-400 bg-orange-100 text-orange-900";
  if (diff === 3)  return "border-rose-400 bg-rose-100 text-rose-900";
  return "border-red-600 bg-red-200 text-red-950";
}

function toParStr(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "-";
  const d = strokes - par;
  return d === 0 ? "E" : d > 0 ? `+${d}` : `${d}`;
}

function toParCls(strokes: number | null, par: number | null): string {
  if (strokes === null || par === null) return "text-gray-400";
  const d = strokes - par;
  if (d < 0) return "text-green-600 font-semibold";
  if (d > 0) return "text-red-500";
  return "text-gray-600";
}

// ── Processing animation (no PageHeader) ────────────────────────────────────

const PHASES = [
  { label: "Reading course details…",  sub: "Identifying name, location & tee boxes" },
  { label: "Extracting hole scores…",  sub: "Parsing your scorecard row by row" },
  { label: "Verifying yardages & par…", sub: "Cross-checking hole data" },
  { label: "Calculating confidence…",  sub: "Flagging fields that may need review" },
];

function ProcessingView() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhaseIdx((i) => Math.min(i + 1, PHASES.length - 1)), 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="relative mb-10">
        <motion.div
          className="relative w-56 h-36 rounded-2xl border-2 border-primary/20 overflow-hidden"
          style={{ background: "linear-gradient(135deg, #ffffff 0%, #f0f7f1 100%)" }}
          animate={{
            boxShadow: [
              "0 8px 32px rgba(45,122,58,0.08)",
              "0 20px 60px rgba(45,122,58,0.22)",
              "0 8px 32px rgba(45,122,58,0.08)",
            ],
          }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="absolute inset-0 p-3 pt-4 flex flex-col gap-2 select-none pointer-events-none">
            <div className="flex gap-1 items-center">
              <div className="h-1.5 w-8 rounded-full bg-gray-300/60" />
              {[...Array(9)].map((_, j) => (
                <div key={j} className="h-1.5 w-[14px] rounded-full bg-gray-200/80 flex-shrink-0" />
              ))}
            </div>
            {["bg-gray-300/50", "bg-primary/25", "bg-gray-300/50", "bg-gray-200/40"].map((color, i) => (
              <div key={i} className="flex gap-1 items-center">
                <div className={`h-1.5 w-8 rounded-full ${color}`} />
                {[...Array(9)].map((_, j) => (
                  <div key={j} className={`h-1.5 w-[14px] rounded-full ${color} flex-shrink-0`} />
                ))}
              </div>
            ))}
          </div>
          <motion.div
            className="absolute left-0 right-0 h-px pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, #2d7a3a 35%, #2d7a3a 65%, transparent 100%)",
              boxShadow: "0 0 16px 5px rgba(45,122,58,0.45)",
            }}
            animate={{ top: ["8%", "92%"] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute left-0 right-0 h-10 pointer-events-none"
            style={{ background: "linear-gradient(180deg, rgba(45,122,58,0.10) 0%, transparent 100%)" }}
            animate={{ top: ["-10%", "70%"] }}
            transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
        </motion.div>
        {(["tl", "tr", "bl", "br"] as const).map((corner, i) => (
          <motion.div
            key={corner}
            className="absolute w-4 h-4 border-primary"
            style={{
              top:    corner.startsWith("t") ? -7 : undefined,
              bottom: corner.startsWith("b") ? -7 : undefined,
              left:   corner.endsWith("l")   ? -7 : undefined,
              right:  corner.endsWith("r")   ? -7 : undefined,
              borderTopWidth:    corner.startsWith("t") ? 2 : 0,
              borderBottomWidth: corner.startsWith("b") ? 2 : 0,
              borderLeftWidth:   corner.endsWith("l")   ? 2 : 0,
              borderRightWidth:  corner.endsWith("r")   ? 2 : 0,
            }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.45, ease: "easeInOut" }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phaseIdx}
          className="text-center px-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.32 }}
        >
          <p className="text-base font-semibold text-gray-800 mb-1">{PHASES[phaseIdx].label}</p>
          <p className="text-sm text-gray-400">{PHASES[phaseIdx].sub}</p>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-2 mt-6">
        {PHASES.map((_, i) => (
          <motion.div
            key={i}
            className="h-1.5 rounded-full bg-primary"
            animate={{
              width: i < phaseIdx ? 18 : i === phaseIdx ? 32 : 6,
              opacity: i <= phaseIdx ? 1 : 0.18,
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Read-only nine-hole scorecard table (identical structure to ScanReviewStep) ──

function NineTable({
  scores,
  result,
  startIdx,
  label,
  showGrandTotal = false,
}: {
  scores: ExtractedHoleScore[];
  result: ScanResult;
  startIdx: number;
  label: string;
  showGrandTotal?: boolean;
}) {
  const rd = result.round;
  const slice = scores.slice(startIdx, startIdx + 9);

  const getPar = (hs: ExtractedHoleScore, si: number): number | null => {
    const holeNum = hs.hole_number ?? startIdx + si + 1;
    return rd.course?.holes.find((h) => h.number === holeNum)?.par ?? null;
  };

  const ninePar = slice.reduce((s, hs, si) => s + (getPar(hs, si) ?? 0), 0);
  const nineScore = slice.reduce((s, hs) => s + (hs.strokes ?? 0), 0);
  const hasScores = slice.some((hs) => hs.strokes != null);
  const nineToPar = hasScores && ninePar > 0 ? nineScore - ninePar : null;

  const totalStrokes = scores.reduce((s, hs) => s + (hs.strokes ?? 0), 0);
  const coursePar = rd.course?.par ?? null;
  const totalToPar = totalStrokes && coursePar ? totalStrokes - coursePar : null;

  const hasPutts = scores.some((hs) => hs.putts != null);
  const hasGir   = scores.some((hs) => hs.green_in_regulation != null);
  const hasShots = scores.some((hs) => hs.shots_to_green != null);

  const ninePutts = slice.reduce((s, hs) => s + (hs.putts ?? 0), 0);
  const totalPutts = scores.reduce((s, hs) => s + (hs.putts ?? 0), 0);
  const nineGir = slice.filter((hs) => hs.green_in_regulation === true).length;
  const totalGir = scores.filter((hs) => hs.green_in_regulation === true).length;
  const nineShots = slice.reduce((s, hs) => s + (hs.shots_to_green ?? 0), 0);
  const totalShots = scores.reduce((s, hs) => s + (hs.shots_to_green ?? 0), 0);

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase">
          <th className="px-3 py-2 text-left w-16">Hole</th>
          {slice.map((hs, si) => (
            <th key={si} className="px-1 py-2 text-center min-w-[2.25rem]">
              {hs.hole_number ?? startIdx + si + 1}
            </th>
          ))}
          <th className="px-2 py-2 text-center w-12 bg-gray-100">{label}</th>
          {showGrandTotal && <th className="px-2 py-2 text-center w-12 bg-gray-200">TOT</th>}
        </tr>
      </thead>
      <tbody>
        {/* Par */}
        <tr className="border-b border-gray-100 text-xs text-gray-500">
          <td className="px-3 py-1.5 font-medium">Par</td>
          {slice.map((hs, si) => (
            <td key={si} className="px-1 py-1.5 text-center">{getPar(hs, si) ?? "-"}</td>
          ))}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{ninePar || "-"}</td>
          {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{coursePar ?? "-"}</td>}
        </tr>

        {/* Score */}
        <tr className="border-b border-gray-100">
          <td className="px-3 py-1.5 font-semibold text-gray-900 text-sm">Score</td>
          {slice.map((hs, si) => {
            const par = getPar(hs, si);
            return (
              <td key={si} className="px-1 py-1 text-center">
                <span
                  className={`inline-flex items-center justify-center w-9 h-7 border rounded text-sm font-semibold ${getScoreColorClass(hs.strokes, par)}`}
                >
                  {hs.strokes ?? "-"}
                </span>
              </td>
            );
          })}
          <td className="px-2 py-1.5 text-center bg-gray-50 font-bold text-gray-900 text-sm">
            {hasScores ? nineScore : "-"}
          </td>
          {showGrandTotal && (
            <td className="px-2 py-1.5 text-center bg-gray-100 font-bold text-base text-gray-900">
              {totalStrokes || "-"}
            </td>
          )}
        </tr>

        {/* To Par */}
        <tr className={`text-xs ${hasPutts || hasGir || hasShots ? "border-b border-gray-100" : ""}`}>
          <td className="px-3 py-1.5 text-gray-500 font-medium">To Par</td>
          {slice.map((hs, si) => {
            const par = getPar(hs, si);
            return (
              <td key={si} className={`px-1 py-1.5 text-center ${toParCls(hs.strokes, par)}`}>
                {toParStr(hs.strokes, par)}
              </td>
            );
          })}
          <td className={`px-2 py-1.5 text-center bg-gray-50 font-bold ${nineToPar === null ? "text-gray-400" : nineToPar < 0 ? "text-green-600" : nineToPar > 0 ? "text-red-500" : "text-gray-600"}`}>
            {nineToPar === null ? "-" : nineToPar === 0 ? "E" : nineToPar > 0 ? `+${nineToPar}` : nineToPar}
          </td>
          {showGrandTotal && (
            <td className={`px-2 py-1.5 text-center bg-gray-100 font-bold text-sm ${totalToPar === null ? "text-gray-400" : totalToPar < 0 ? "text-green-600" : totalToPar > 0 ? "text-red-500" : "text-gray-600"}`}>
              {totalToPar === null ? "-" : totalToPar === 0 ? "E" : totalToPar > 0 ? `+${totalToPar}` : totalToPar}
            </td>
          )}
        </tr>

        {/* Putts */}
        {hasPutts && (
          <tr className={`text-xs text-gray-500 ${hasGir || hasShots ? "border-b border-gray-100" : ""}`}>
            <td className="px-3 py-1.5 font-medium">Putts</td>
            {slice.map((hs, si) => (
              <td key={si} className="px-1 py-1.5 text-center">
                {hs.putts ?? "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{ninePutts || "-"}</td>
            {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{totalPutts || "-"}</td>}
          </tr>
        )}

        {/* GIR */}
        {hasGir && (
          <tr className={`text-xs ${hasShots ? "border-b border-gray-100" : ""}`}>
            <td className="px-3 py-1.5 font-bold text-green-700">GIR</td>
            {slice.map((hs, si) => {
              const gir = hs.green_in_regulation;
              return (
                <td key={si} className="px-1 py-1.5 text-center">
                  <span style={{ color: gir === true ? "#16a34a" : "#9ca3af" }}>
                    {gir === true ? "●" : gir === false ? "○" : "–"}
                  </span>
                </td>
              );
            })}
            <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-50">{nineGir || "-"}</td>
            {showGrandTotal && <td className="px-2 py-1.5 text-center text-green-700 font-semibold bg-gray-100">{totalGir || "-"}</td>}
          </tr>
        )}

        {/* Shots to Green */}
        {hasShots && (
          <tr className="text-xs text-gray-500">
            <td className="px-3 py-1.5 font-medium">S2G</td>
            {slice.map((hs, si) => (
              <td key={si} className="px-1 py-1.5 text-center">
                {hs.shots_to_green ?? "-"}
              </td>
            ))}
            <td className="px-2 py-1.5 text-center bg-gray-50 font-bold">{nineShots || "-"}</td>
            {showGrandTotal && <td className="px-2 py-1.5 text-center bg-gray-100 font-bold">{totalShots || "-"}</td>}
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PublicScanHero() {
  const { step, file, preview, userContext, setUserContext, extracting, result, error, handleFile, handleExtract, reset } = usePublicScan();
  const inputRef = useRef<HTMLInputElement>(null);

  const onExtract = useCallback(() => handleExtract(), [handleExtract]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const scores = result?.round.hole_scores ?? [];
  const front = scores.slice(0, 9);
  const back  = scores.slice(9, 18);
  const courseName = result?.round.course?.name ?? null;
  const courseLocation = result?.round.course?.location ?? null;
  const teeBox = result?.round.tee_box ?? null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <AnimatePresence mode="wait">
        {/* ── UPLOAD ── */}
        {step === "upload" && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="p-6"
          >
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-4 text-center">
              Try It Yourself
            </p>

            {!file ? (
              <div
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02] transition-all"
              >
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Camera size={22} className="text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800">Upload a scorecard photo</p>
                  <p className="text-xs text-gray-400 mt-1">Drag & drop or click to browse</p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={onInputChange}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  {preview && (
                    <img src={preview} alt="scorecard preview" className="h-14 w-20 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); reset(); }}
                    className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  >
                    <RotateCcw size={15} />
                  </button>
                </div>

                <ScorecardLayoutPicker onContextChange={setUserContext} />

                {error && (
                  <p className="text-xs text-red-500 text-center">{error}</p>
                )}

                <button
                  onClick={onExtract}
                  disabled={extracting}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Upload size={15} />
                  Scan My Scorecard
                </button>
              </div>
            )}

            {error && !file && (
              <p className="text-xs text-red-500 text-center mt-3">{error}</p>
            )}
          </motion.div>
        )}

        {/* ── PROCESSING ── */}
        {step === "processing" && (
          <motion.div
            key="processing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ProcessingView />
          </motion.div>
        )}

        {/* ── REVIEW ── */}
        {step === "review" && result && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Course header — identical to ScorecardGrid */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between header-gradient rounded-t-2xl">
              <div>
                <div className="font-bold text-white text-base">
                  {courseName ?? "Unknown Course"}
                </div>
                {courseLocation && (
                  <div className="text-xs text-white/50">{courseLocation}</div>
                )}
              </div>
              <div className="flex items-center gap-3">
                {teeBox && (
                  <span className="text-sm font-medium text-white/80">{teeBox} tees</span>
                )}
                <button
                  onClick={reset}
                  className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors"
                >
                  <RotateCcw size={12} />
                  Scan another
                </button>
              </div>
            </div>

            {/* Scorecard tables */}
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {front.length > 0 && (
                  <NineTable scores={scores} result={result} startIdx={0} label="OUT" />
                )}

                {back.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 px-4 py-1.5 bg-gray-50/60 border-y border-gray-100">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Back Nine</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    <NineTable scores={scores} result={result} startIdx={9} label="IN" showGrandTotal />
                  </>
                )}

                {scores.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-8">No scores detected — try a clearer photo.</p>
                )}
              </div>
            </div>

            {/* CTA */}
            <div className="px-6 py-5 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-500 mb-3">Sign up to save this round and track your progress.</p>
              <Link
                to="/register"
                className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
              >
                Sign up to save this round
                <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
