import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GripVertical } from "lucide-react";

type DataRow = "score" | "putts" | "shots";

const ROW_CONFIG: Record<DataRow, { label: string; color: string; bg: string; border: string }> = {
  score: { label: "Score",          color: "#2d7a3a", bg: "#f0faf1", border: "#2d7a3a40" },
  putts: { label: "Putts",          color: "#0369a1", bg: "#f0f5ff", border: "#0369a140" },
  shots: { label: "Shots to Green", color: "#6d28d9", bg: "#f5f3ff", border: "#6d28d940" },
};

interface ScorecardLayoutPickerProps {
  onContextChange: (ctx: string) => void;
}

export function ScorecardLayoutPicker({ onContextChange }: ScorecardLayoutPickerProps) {
  const [playerName, setPlayerName] = useState("");
  const [hasPutts, setHasPutts] = useState(false);
  const [hasShotsToGreen, setHasShotsToGreen] = useState(false);
  const [isTopar, setIsTopar] = useState(false);
  const [rowOrder, setRowOrder] = useState<DataRow[]>(["score"]);
  // which data-row index the Name label sits beside
  const [nameRowIndex, setNameRowIndex] = useState(0);

  // "row" drag = reordering data rows; "name" drag = repositioning Name label
  const dragging = useRef<{ type: "row"; src: number } | { type: "name" } | null>(null);

  // Sync rowOrder with checkboxes; clamp nameRowIndex
  useEffect(() => {
    setRowOrder((prev) => {
      let next = prev.filter(
        (r) =>
          r === "score" ||
          (r === "putts" && hasPutts) ||
          (r === "shots" && hasShotsToGreen)
      );
      if (hasPutts && !next.includes("putts")) next = [...next, "putts"];
      if (hasShotsToGreen && !next.includes("shots")) next = [...next, "shots"];
      return next;
    });
  }, [hasPutts, hasShotsToGreen]);

  useEffect(() => {
    setNameRowIndex((prev) => Math.min(prev, rowOrder.length - 1));
  }, [rowOrder]);

  // Build user_context string
  useEffect(() => {
    const parts: string[] = [];
    if (playerName.trim()) parts.push(`my name is ${playerName.trim()}`);
    if (!hasPutts) parts.push("no putts recorded");
    if (isTopar) parts.push("scores written to par");

    // Always send row order + name position when the picker is active
    if (hasPutts || hasShotsToGreen) {
      const nameRowType = rowOrder[nameRowIndex] ?? "score";
      const nameLabel = nameRowType === "shots" ? "shots to green" : nameRowType;
      parts.push(`name on ${nameLabel} row`);

      const rowLabels = rowOrder.map((r) => (r === "shots" ? "shots to green" : r));
      parts.push(`row order: ${rowLabels.join(", ")}`);
    }

    onContextChange(parts.join(". "));
  }, [playerName, hasPutts, hasShotsToGreen, isTopar, rowOrder, nameRowIndex, onContextChange]);

  // dragover handler shared by each row slot
  const handleRowDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (!dragging.current) return;
    if (dragging.current.type === "name") {
      setNameRowIndex(i);
    } else if (dragging.current.type === "row") {
      const src = dragging.current.src;
      if (src === i) return;
      setRowOrder((prev) => {
        const next = [...prev];
        const [item] = next.splice(src, 1);
        next.splice(i, 0, item);
        return next;
      });
      dragging.current = { type: "row", src: i };
    }
  };

  const showPicker = hasPutts || hasShotsToGreen;

  return (
    <div className="space-y-3">
      {/* Player name */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.14em] mb-1.5">
          Your name on the card
        </p>
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="e.g. Tucker"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {/* Scoring format selector */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.14em] mb-1.5">
          Scoring format
        </p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: false, label: "Total strokes", sub: "e.g. 4, 5, 3" },
            { value: true,  label: "To par",        sub: "e.g. +1, −1, E" },
          ] as const).map(({ value, label, sub }) => (
            <button
              key={label}
              type="button"
              onClick={() => setIsTopar(value)}
              className={`flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all ${
                isTopar === value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className={`text-xs font-semibold ${isTopar === value ? "text-primary" : "text-gray-700"}`}>
                {label}
              </span>
              <span className="text-[10px] text-gray-400 mt-0.5">{sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* What else is on the card */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.14em] mb-1.5">
          Also on the card
        </p>
        <div className="flex flex-wrap gap-2">
          {([
            { label: "Putts",          active: hasPutts,         toggle: () => setHasPutts((v) => !v) },
            { label: "Shots to green", active: hasShotsToGreen,  toggle: () => setHasShotsToGreen((v) => !v) },
          ] as const).map(({ label, active, toggle }) => (
            <button
              key={label}
              type="button"
              onClick={toggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
              }`}
            >
              <span
                className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors ${
                  active ? "bg-primary border-primary" : "border-gray-300 bg-white"
                }`}
              >
                {active && (
                  <svg viewBox="0 0 8 7" className="w-2 h-2" fill="none">
                    <polyline points="1,3.5 3,5.5 7,1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Row order picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.14em] mb-2">
                Drag rows to match your card · drag Name to its row
              </p>

              <div className="flex flex-col gap-1.5">
                {rowOrder.map((row, i) => {
                  const { label, color, bg, border } = ROW_CONFIG[row];
                  const nameHere = i === nameRowIndex;
                  return (
                    <div
                      key={row}
                      className="flex gap-2"
                      onDragOver={(e) => handleRowDragOver(e, i)}
                    >
                      {/* Left column: Name indicator or empty drop target */}
                      <div className="w-16 shrink-0">
                        {nameHere ? (
                          <div
                            draggable
                            onDragStart={() => { dragging.current = { type: "name" }; }}
                            onDragEnd={() => { dragging.current = null; }}
                            className="h-full min-h-[38px] flex items-center justify-center rounded-lg border border-dashed border-gray-400 bg-gray-50 cursor-grab active:cursor-grabbing select-none"
                          >
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                              Name
                            </span>
                          </div>
                        ) : (
                          // invisible drop target so Name can be dragged here
                          <div className="h-full min-h-[38px] rounded-lg" />
                        )}
                      </div>

                      {/* Right column: draggable data row */}
                      <div
                        draggable
                        onDragStart={() => { dragging.current = { type: "row", src: i }; }}
                        onDragEnd={() => { dragging.current = null; }}
                        className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-grab active:cursor-grabbing select-none"
                        style={{ backgroundColor: bg, borderColor: border }}
                      >
                        <GripVertical size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs font-semibold" style={{ color }}>
                          {label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
