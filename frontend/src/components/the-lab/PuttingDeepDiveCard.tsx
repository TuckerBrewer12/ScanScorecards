import type { ThreePuttRow, PuttsTrendRow } from "@/types/analytics";

interface Props {
  threePuttsTrend: ThreePuttRow[];
  puttsTrend: PuttsTrendRow[];
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function StatTile({
  value,
  label,
  bad,
}: {
  value: string;
  label: string;
  bad?: boolean;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center gap-1">
      <span
        className={`font-mono text-2xl font-semibold leading-none ${bad ? "text-[#ef4444]" : "text-gray-800"}`}
      >
        {value}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

export function PuttingDeepDiveCard({ threePuttsTrend, puttsTrend }: Props) {
  const avgThreePutts = avg(threePuttsTrend.map((r) => r.three_putt_count));
  const avgThreePuttRate = avg(threePuttsTrend.map((r) => r.three_putt_percentage));
  const avgTotalPutts = avg(
    puttsTrend.filter((r) => r.total_putts != null).map((r) => r.total_putts!),
  );

  const noData = avgThreePutts === null && avgTotalPutts === null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-gray-800">Putting Deep Dive</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {noData
            ? "Log putts to unlock this analysis"
            : "3-putts are costing you the most strokes"}
        </p>
      </div>

      {noData ? (
        <div className="flex items-center justify-center h-24 text-gray-300 text-sm">
          No putting data yet
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              value={avgThreePutts != null ? avgThreePutts.toFixed(1) : "—"}
              label="3-Putts / Round"
              bad={avgThreePutts != null && avgThreePutts > 1.5}
            />
            <StatTile
              value={avgThreePuttRate != null ? `${Math.round(avgThreePuttRate)}%` : "—"}
              label="3-Putt Rate"
              bad={avgThreePuttRate != null && avgThreePuttRate > 15}
            />
            <StatTile
              value={avgTotalPutts != null ? avgTotalPutts.toFixed(1) : "—"}
              label="Avg Putts"
            />
          </div>

          {/* Context bar: putts trend over last N rounds */}
          {puttsTrend.length >= 3 && (
            <div className="pt-3 border-t border-gray-50">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                Putts per round trend
              </p>
              <div className="flex gap-2">
                {/* Y-axis */}
                <div className="relative shrink-0 w-5 h-28">
                  {[42, 38, 34, 30, 26].map((v, i) => (
                    <span
                      key={v}
                      className="absolute text-[9px] font-semibold text-gray-400 right-0 leading-none"
                      style={{ top: `${(i / 4) * 100}%`, transform: "translateY(-50%)" }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
                {/* Chart */}
                <div className="flex-1 relative h-28">
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <div
                      key={pct}
                      className="absolute w-full border-t border-gray-100"
                      style={{ top: `${pct}%` }}
                    />
                  ))}
                  <div className="flex items-end gap-0.5 h-full">
                    {puttsTrend.slice(-20).map((r, i) => {
                      const putts = r.total_putts;
                      if (putts == null) return <div key={i} className="flex-1 h-1 bg-gray-100 rounded-sm" />;
                      const max = 42;
                      const min = 26;
                      const heightPct = Math.max(8, Math.min(100, ((putts - min) / (max - min)) * 100));
                      const good = putts <= 32;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm transition-all"
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: good ? "#059669" : putts <= 36 ? "#f59e0b" : "#ef4444",
                            opacity: 0.65,
                          }}
                          title={`${putts} putts`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
