import { TrendingDown, TrendingUp, Minus } from "lucide-react";

type InsightCategory = "scoring" | "gir" | "putting";

interface InsightItem {
  text: string;
  trend?: "up" | "down" | "flat";
  positiveUp?: boolean;
  category: InsightCategory;
}

const CATEGORY_META: Record<InsightCategory, { label: string; color: string }> = {
  scoring:  { label: "Scoring",       color: "#2d7a3a" },
  gir:      { label: "Ball Striking", color: "#0369a1" },
  putting:  { label: "Putting",       color: "#7c3aed" },
};

export function InsightsCarousel({ insights }: { insights: InsightItem[] }) {
  if (!insights.length) return null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2.5">
        <span className="text-[11px] font-bold text-primary uppercase tracking-[0.18em] whitespace-nowrap">
          Insights
        </span>
        <div className="h-px flex-1 bg-primary/15 rounded-full" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory">
        {insights.map((ins, i) => {
          const isGood =
            ins.trend === "down" ? !ins.positiveUp
            : ins.trend === "up" ? !!ins.positiveUp
            : null;
          const TrendIcon =
            ins.trend === "up" ? TrendingUp
            : ins.trend === "down" ? TrendingDown
            : Minus;
          const iconColor =
            isGood === true ? "#059669"
            : isGood === false ? "#f87171"
            : "#9ca3af";
          const { label, color } = CATEGORY_META[ins.category];

          return (
            <div
              key={i}
              className="snap-start shrink-0 w-[260px] bg-white rounded-2xl border border-gray-100 shadow-sm p-4 relative overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl"
                style={{ background: color }}
              />
              <div className="flex items-center gap-1.5 mb-2 mt-0.5">
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ color }}
                >
                  {label}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <TrendIcon
                  size={14}
                  className="shrink-0 mt-0.5"
                  style={{ color: iconColor }}
                />
                <p className="text-xs text-gray-600 leading-relaxed">{ins.text}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
