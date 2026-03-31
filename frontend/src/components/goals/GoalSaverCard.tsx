import { Target, Flame, Ruler, Home, Crosshair, Shuffle, TrendingUp } from "lucide-react";
import type { GoalSaver } from "@/types/analytics";

const TYPE_CONFIG: Record<GoalSaver["type"], {
  icon: React.ElementType;
  borderColor: string;
  iconBg: string;
  iconColor: string;
}> = {
  three_putt_bleed: {
    icon: Target,
    borderColor: "#059669",
    iconBg: "#ecfdf5",
    iconColor: "#059669",
  },
  blowup_holes: {
    icon: Flame,
    borderColor: "#ef4444",
    iconBg: "#fef2f2",
    iconColor: "#ef4444",
  },
  achilles_heel: {
    icon: Ruler,
    borderColor: "#60a5fa",
    iconBg: "#eff6ff",
    iconColor: "#3b82f6",
  },
  home_course_demon: {
    icon: Home,
    borderColor: "#a78bfa",
    iconBg: "#f5f3ff",
    iconColor: "#7c3aed",
  },
  gir_opportunity: {
    icon: Crosshair,
    borderColor: "#059669",
    iconBg: "#ecfdf5",
    iconColor: "#059669",
  },
  scrambling_opportunity: {
    icon: Shuffle,
    borderColor: "#f59e0b",
    iconBg: "#fffbeb",
    iconColor: "#d97706",
  },
  par5_opportunity: {
    icon: TrendingUp,
    borderColor: "#2d7a3a",
    iconBg: "#f0fdf4",
    iconColor: "#2d7a3a",
  },
};

interface GoalSaverCardProps {
  saver: GoalSaver;
}

export function GoalSaverCard({ saver }: GoalSaverCardProps) {
  const config = TYPE_CONFIG[saver.type];
  const Icon = config.icon;
  const isSignificant = saver.strokes_saved >= 0.5;

  return (
    <div
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex flex-col gap-2 relative overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: config.borderColor }}
    >
      <div className="flex items-start gap-2">
        <div
          className="p-1.5 rounded-lg shrink-0"
          style={{ backgroundColor: config.iconBg }}
        >
          <Icon size={14} style={{ color: config.iconColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-gray-900 leading-snug">{saver.headline}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className="text-lg font-black leading-none"
            style={{ color: isSignificant ? "#2d7a3a" : "#9ca3af" }}
          >
            −{saver.strokes_saved.toFixed(1)}
          </span>
          <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide">strokes</span>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 leading-relaxed">{saver.detail}</p>

      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: saver.percentage_of_gap >= 30 ? "#fef3c7" : "#f3f4f6",
            color: saver.percentage_of_gap >= 30 ? "#b45309" : "#6b7280",
          }}
        >
          {saver.percentage_of_gap.toFixed(0)}% of your gap
        </span>
      </div>
    </div>
  );
}
