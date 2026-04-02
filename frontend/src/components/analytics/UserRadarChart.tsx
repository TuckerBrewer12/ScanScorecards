import { useMemo, useCallback, memo } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
} from "recharts";
import type { AnalyticsKPIs, ScoringByParRow } from "@/types/analytics";
import type { BenchmarkProfile } from "@/components/the-lab/constants";

export type RadarEntry = {
  axis: string;
  value: number;       // 0–100 normalized user score
  benchmark: number;   // 0–100 normalized benchmark (0 when no profile)
  userRaw: string;     // human-readable user stat
  benchRaw: string;    // human-readable benchmark stat
  hasData: boolean;    // false when underlying kpi is null/untracked
};

function fmtSign(v: number) {
  return (v >= 0 ? "+" : "") + v.toFixed(1);
}

export function buildRadarData(
  kpis: AnalyticsKPIs,
  scoringByPar: ScoringByParRow[],
  profile?: BenchmarkProfile,
): RadarEntry[] {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const hasGir  = kpis.gir_percentage != null;
  const hasScr  = kpis.scrambling_percentage != null;
  const hasPutt = kpis.putts_per_gir != null;

  const girPct   = kpis.gir_percentage ?? 0;
  const scrPct   = kpis.scrambling_percentage ?? 0;
  const puttsRaw = kpis.putts_per_gir ?? 3.5;

  const p = profile ?? { gir: 0, scrambling: 0, putting: 0, par3: 0, par4: 0, par5: 0 };
  const parRow = (par: number) => scoringByPar.find((r) => r.par === par && r.sample_size > 0);

  const benchPutts = 3.5 - (p.putting * 2.0) / 100;
  const benchPar3  = 2.0 - (p.par3  * 2.5) / 100;
  const benchPar4  = 2.0 - (p.par4  * 2.5) / 100;
  const benchPar5  = 2.0 - (p.par5  * 2.5) / 100;

  return [
    {
      axis: "GIR",
      value: clamp(girPct),
      benchmark: p.gir,
      userRaw: girPct.toFixed(0) + "%",
      benchRaw: p.gir + "%",
      hasData: hasGir,
    },
    {
      axis: "Scrambling",
      value: clamp(scrPct),
      benchmark: p.scrambling,
      userRaw: scrPct.toFixed(0) + "%",
      benchRaw: p.scrambling + "%",
      hasData: hasScr,
    },
    {
      axis: "Putting",
      value: clamp(((3.5 - puttsRaw) / 2.0) * 100),
      benchmark: p.putting,
      userRaw: puttsRaw.toFixed(2) + "/GIR",
      benchRaw: benchPutts.toFixed(2) + "/GIR",
      hasData: hasPutt,
    },
    {
      axis: "Par 3s",
      value: clamp(((2.0 - (parRow(3)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: p.par3,
      userRaw: parRow(3) ? fmtSign(parRow(3)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar3),
      hasData: !!parRow(3),
    },
    {
      axis: "Par 4s",
      value: clamp(((2.0 - (parRow(4)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: p.par4,
      userRaw: parRow(4) ? fmtSign(parRow(4)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar4),
      hasData: !!parRow(4),
    },
    {
      axis: "Par 5s",
      value: clamp(((2.0 - (parRow(5)?.average_to_par ?? 2.0)) / 2.5) * 100),
      benchmark: p.par5,
      userRaw: parRow(5) ? fmtSign(parRow(5)!.average_to_par) : "—",
      benchRaw: fmtSign(benchPar5),
      hasData: !!parRow(5),
    },
  ];
}

function RadarTooltipContent({ payload }: { payload?: Array<{ payload: RadarEntry }> }) {
  if (!payload?.length) return null;
  const entry = payload[0]?.payload as RadarEntry | undefined;
  if (!entry?.axis) return null;
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2.5 text-xs">
      <p className="font-bold text-gray-800 mb-2">{entry.axis}</p>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#2d7a3a" }} />
          <span className="text-gray-500">You</span>
          <span className="font-bold text-gray-900 ml-auto">{entry.userRaw}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0 bg-gray-300" />
          <span className="text-gray-500">Target</span>
          <span className="font-semibold text-gray-500 ml-auto">{entry.benchRaw}</span>
        </div>
      </div>
    </div>
  );
}

interface UserRadarChartProps {
  kpis: AnalyticsKPIs;
  scoringByPar: ScoringByParRow[];
  profile?: BenchmarkProfile;
  height?: number;
  outerRadius?: number;
  primaryColor?: string;
  gridColor?: string;
  axisColor?: string;
  showTooltip?: boolean;
  emptyMessage?: string;
  margin?: { top: number; right: number; bottom: number; left: number };
}

export const UserRadarChart = memo(function UserRadarChart({
  kpis,
  scoringByPar,
  profile,
  height = 260,
  outerRadius = 80,
  primaryColor = "#2d7a3a",
  gridColor = "#e5e7eb",
  axisColor = "#9ca3af",
  showTooltip = false,
  emptyMessage,
  margin,
}: UserRadarChartProps) {
  const chartData = useMemo(() => {
    const all = buildRadarData(kpis, scoringByPar, profile);
    return all.filter((e) => e.hasData);
  }, [kpis, scoringByPar, profile]);

  const renderTick = useCallback(
    (props: { cx: number; cy: number; x: number; y: number; payload: { value: string } }) => {
      const { cx, x, y, payload } = props;
      const entry = chartData.find((e) => e.axis === payload.value);
      const dx = x - cx;
      const anchor = Math.abs(dx) < 15 ? "middle" : dx > 0 ? "start" : "end";
      return (
        <g>
          <text x={x} y={y} textAnchor={anchor} fill="#6b7280" fontSize={13} fontWeight={600}>
            {payload.value}
          </text>
          {entry && (
            <text x={x} y={y + 16} textAnchor={anchor} fontSize={12} fontWeight={700}>
              <tspan fill={primaryColor}>{entry.userRaw}</tspan>
              {profile && (
                <tspan fill="#6b7280"> vs {entry.benchRaw}</tspan>
              )}
            </text>
          )}
        </g>
      );
    },
    [chartData, profile, primaryColor],
  );

  if (chartData.length < 3) {
    if (!emptyMessage) return null;
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData} outerRadius={outerRadius} margin={margin}>
        <PolarGrid stroke={gridColor} />
        <PolarAngleAxis
          dataKey="axis"
          tick={showTooltip ? (renderTick as never) : { fontSize: 11, fill: axisColor }}
        />
        <Radar
          dataKey="value"
          stroke={primaryColor}
          fill={primaryColor}
          fillOpacity={showTooltip ? 0.18 : 0.15}
          strokeWidth={2}
          dot={showTooltip ? { r: 4, fill: primaryColor, strokeWidth: 0 } : undefined}
          activeDot={showTooltip ? { r: 6, fill: primaryColor, stroke: "white", strokeWidth: 2 } : undefined}
        />
        {profile && (
          <Radar
            dataKey="benchmark"
            stroke="#9ca3af"
            fill="#9ca3af"
            fillOpacity={0.07}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={{ r: 3, fill: "#9ca3af", strokeWidth: 0 }}
          />
        )}
        {showTooltip && (
          <Tooltip content={<RadarTooltipContent />} wrapperStyle={{ outline: "none" }} />
        )}
      </RadarChart>
    </ResponsiveContainer>
  );
});
