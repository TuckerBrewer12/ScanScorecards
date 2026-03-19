import { useState } from "react";
import type { ScoringByYardageRow } from "@/types/analytics";
import { YardageAnalysisCard } from "./YardageAnalysisCard";

interface ParMatrixGridProps {
  rows: ScoringByYardageRow[];
}

export function ParMatrixGrid({ rows }: ParMatrixGridProps) {
  const availablePars = new Set(rows.map(r => r.par));

  const [activePar, setActivePar] = useState<3 | 4 | 5>(
    () => ([4, 3, 5] as const).find(p => rows.some(r => r.par === p)) ?? 4
  );

  const filteredRows = rows
    .filter(r => r.par === activePar)
    .sort((a, b) => a.bucket_order - b.bucket_order);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="text-sm font-bold text-gray-900 mb-0.5">Range View</div>
      <div className="text-xs text-gray-400 mb-5">Performance by yardage and par</div>

      {/* Segmented control */}
      <div className="flex gap-1.5 mb-5">
        {([3, 4, 5] as const).map((par) => {
          const isActive = activePar === par;
          const hasData = availablePars.has(par);
          return (
            <button
              key={par}
              onClick={() => hasData && setActivePar(par)}
              disabled={!hasData}
              className={
                isActive
                  ? "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-white shadow-sm"
                  : "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-white border border-gray-200 text-gray-600 hover:border-gray-300 disabled:text-gray-300 disabled:cursor-not-allowed disabled:border-gray-100"
              }
              style={isActive ? { backgroundColor: "#2d7a3a" } : undefined}
            >
              Par {par}
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      {filteredRows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRows.map(row => (
            <YardageAnalysisCard key={`${row.par}-${row.bucket_label}`} row={row} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-gray-400">
          No Par {activePar} yardage data recorded
        </div>
      )}
    </div>
  );
}
