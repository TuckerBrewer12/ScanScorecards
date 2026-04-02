import { Target, Flame, Ruler, Home, Crosshair, Shuffle, TrendingUp } from "lucide-react";
import type { GoalSaver } from "@/types/analytics";

const TYPE_CONFIG: Record<GoalSaver["type"], {
  icon: React.ElementType;
  accentColor: string;
  iconBg: string;
  iconColor: string;
  label: string;
}> = {
  three_putt_bleed: {
    icon: Target,
    accentColor: "#059669",
    iconBg: "#ecfdf5",
    iconColor: "#059669",
    label: "3-Putts",
  },
  blowup_holes: {
    icon: Flame,
    accentColor: "#ef4444",
    iconBg: "#fef2f2",
    iconColor: "#ef4444",
    label: "Blow-ups",
  },
  achilles_heel: {
    icon: Ruler,
    accentColor: "#3b82f6",
    iconBg: "#eff6ff",
    iconColor: "#3b82f6",
    label: "Trouble Distance",
  },
  home_course_demon: {
    icon: Home,
    accentColor: "#7c3aed",
    iconBg: "#f5f3ff",
    iconColor: "#7c3aed",
    label: "Home Course",
  },
  gir_opportunity: {
    icon: Crosshair,
    accentColor: "#059669",
    iconBg: "#ecfdf5",
    iconColor: "#059669",
    label: "Greens in Reg.",
  },
  scrambling_opportunity: {
    icon: Shuffle,
    accentColor: "#d97706",
    iconBg: "#fffbeb",
    iconColor: "#d97706",
    label: "Scrambling",
  },
  par5_opportunity: {
    icon: TrendingUp,
    accentColor: "#2d7a3a",
    iconBg: "#f0fdf4",
    iconColor: "#2d7a3a",
    label: "Par 5s",
  },
};

interface GoalSaverCardProps {
  saver: GoalSaver;
}

export function GoalSaverCard({ saver }: GoalSaverCardProps) {
  const config = TYPE_CONFIG[saver.type];
  const Icon = config.icon;
  const pct = Math.min(100, saver.percentage_of_gap);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3 overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: config.accentColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg shrink-0" style={{ backgroundColor: config.iconBg }}>
            <Icon size={13} style={{ color: config.iconColor }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            {config.label}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-black leading-none" style={{ color: config.accentColor }}>
            −{saver.strokes_saved.toFixed(1)}
          </span>
          <span className="text-[10px] text-gray-400 font-medium">strokes</span>
        </div>
      </div>

      {/* Headline — actual stat, no AI fluff */}
      <p className="text-[13px] font-semibold text-gray-800 leading-snug">{saver.headline}</p>

      {/* Gap bar */}
      <div>
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-gray-400">share of your gap</span>
          <span className="font-bold text-gray-600">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, backgroundColor: config.accentColor }}
          />
        </div>
      </div>
    </div>
  );
}
