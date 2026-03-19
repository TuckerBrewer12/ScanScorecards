import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, Dumbbell, Target, Pin, TrendingUp, TrendingDown } from "lucide-react";
import { api } from "@/lib/api";
import { getStoredColorBlindMode } from "@/lib/accessibility";
import { getColorBlindPalette } from "@/lib/chartPalettes";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatComparisonBar } from "@/components/suggestions/StatComparisonBar";
import { ComparisonTargetToggle } from "@/components/suggestions/ComparisonTargetToggle";
import { BentoCard } from "@/components/ui/BentoCard";
import type { AISuggestionsResponse, AIInsightItem, AIComparisonItem } from "@/types/suggestions";

const COMPARISON_CATEGORIES = ["Ball Striking", "Short Game", "Putting"] as const;

const CATEGORY_STYLES: Record<string, { dot: string; heading: string }> = {
  "Ball Striking": { dot: "#60A5FA", heading: "#1D4ED8" },
  "Short Game": { dot: "#FBBF24", heading: "#B45309" },
  "Putting": { dot: "#10B981", heading: "#047857" },
};

const GROUP_ICONS: Record<string, React.ElementType> = {
  "Ball Striking": Target,
  "Short Game": Dumbbell,
  "Putting": Pin,
};

interface SuggestionsPageProps {
  userId: string;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-36 rounded-2xl bg-gray-200" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-72 rounded-2xl bg-gray-200" />
        ))}
      </div>
      <div className="h-32 rounded-2xl bg-gray-200" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-200" />)}
      </div>
    </div>
  );
}

function InsightCard({
  insight,
  index,
  accentColor,
}: {
  insight: AIInsightItem;
  index: number;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = GROUP_ICONS[insight.category_group] ?? Target;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35 }}
    >
      <BentoCard className="overflow-hidden p-0">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-gray-50 shrink-0">
            <Icon size={15} className="text-gray-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-sm font-bold text-gray-900 leading-snug">{insight.title}</p>
              <span className="text-[11px] font-bold text-white bg-primary rounded-full px-2 py-0.5 shrink-0">
                P{Math.round(insight.priority_score)}
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{insight.description}</p>

            {insight.what_if && (
              <div className="mt-2.5 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <p className="text-[11px] font-semibold leading-snug" style={{ color: accentColor }}>
                  {insight.what_if}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Drill tips toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-3 ml-11 flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
        >
          <Dumbbell size={11} />
          Practice drills
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={11} />
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-50"
          >
            <ul className="px-4 py-3 space-y-1.5">
              {insight.drill_tips.map((tip, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-600">
                  <span className="font-bold shrink-0" style={{ color: accentColor }}>{i + 1}.</span>
                  {tip}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      </BentoCard>
    </motion.div>
  );
}

function ComparisonCategory({
  category,
  items,
  benchmarkLabel,
  globalIndex,
  goodColor,
  badColor,
  benchmarkColor,
  categoryStyles,
}: {
  category: string;
  items: AIComparisonItem[];
  benchmarkLabel: string;
  globalIndex: number;
  goodColor: string;
  badColor: string;
  benchmarkColor: string;
  categoryStyles: Record<string, { dot: string; heading: string }>;
}) {
  const style = categoryStyles[category] ?? { dot: "#9CA3AF", heading: "#4B5563" };

  const itemsWithData = items.filter((i) => i.has_data).length;
  const better = items.filter((i) => {
    if (!i.has_data || i.player_value == null) return false;
    return i.lower_is_better ? i.player_value < i.benchmark_value : i.player_value > i.benchmark_value;
  }).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: globalIndex * 0.1, duration: 0.4 }}
    >
      <BentoCard>
        {/* Category header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: style.dot }} />
            <h3 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: style.heading }}>
              {category}
            </h3>
          </div>
          {itemsWithData > 0 && (
            <span className="text-[11px] text-gray-400">
              {better}/{itemsWithData} beating avg
            </span>
          )}
        </div>

        {/* Bars */}
        <div className="space-y-5">
          {items.map((item, i) => (
            <StatComparisonBar
              key={item.metric}
              item={item}
              benchmarkLabel={benchmarkLabel}
              index={globalIndex * 10 + i}
              goodColor={goodColor}
              badColor={badColor}
              benchmarkColor={benchmarkColor}
            />
          ))}
        </div>
      </BentoCard>
    </motion.div>
  );
}

export function SuggestionsPage({ userId }: SuggestionsPageProps) {
  const [targetHandicap, setTargetHandicap] = useState<number | null>(null);
  const { data, isLoading: loading } = useQuery({
    queryKey: ["suggestions", userId, targetHandicap],
    queryFn: () => api.getAISuggestions(userId, 50, targetHandicap),
  });
  const colorBlindMode = useMemo(() => getStoredColorBlindMode(), []);
  const colorBlindPalette = useMemo(() => getColorBlindPalette(colorBlindMode), [colorBlindMode]);
  const goodColor = colorBlindPalette?.ui.success ?? "#10B981";
  const badColor = colorBlindPalette?.ui.danger ?? "#F87171";
  const benchmarkColor = colorBlindPalette?.ui.mutedFill ?? "#E5E7EB";
  const accentColor = colorBlindPalette?.trend.primary ?? "var(--color-primary)";
  const categoryStyles = useMemo(
    () =>
      colorBlindPalette
        ? {
            "Ball Striking": { dot: colorBlindPalette.trend.primary, heading: colorBlindPalette.trend.primary },
            "Short Game": { dot: colorBlindPalette.trend.secondary, heading: colorBlindPalette.trend.secondary },
            "Putting": { dot: colorBlindPalette.ui.success, heading: colorBlindPalette.ui.success },
          }
        : CATEGORY_STYLES,
    [colorBlindPalette],
  );

  // Derive comparison summary for hero
  function getSummary() {
    if (!data?.comparisons.length) return null;
    const withData = data.comparisons.filter((c) => c.has_data);
    const better = withData.filter((c) =>
      c.player_value != null &&
      (c.lower_is_better ? c.player_value < c.benchmark_value : c.player_value > c.benchmark_value)
    );
    return { better: better.length, total: withData.length };
  }

  const summary = getSummary();

  return (
    <div className="space-y-7">
      <PageHeader
        title="Performance vs. Peers"
        subtitle="Your stats compared to the average golfer at your handicap level"
      />

      {loading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <p className="text-gray-400 text-sm">Failed to load comparison data.</p>
      ) : (
        <>
          {/* Hero */}
          <BentoCard>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-primary" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  Peer Comparison
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400">{data.rounds_analyzed} rounds</span>
                {data.handicap_index != null && (
                  <span className="text-[11px] font-semibold bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                    HI {data.handicap_index}
                  </span>
                )}
              </div>
            </div>

            <h2 className="text-xl font-black text-gray-900 leading-tight mb-0.5">
              You vs. {data.handicap_range_label} Average
            </h2>
            {targetHandicap != null && (
              <p className="text-sm text-gray-400 mb-3">· HI ~{targetHandicap}</p>
            )}

            {summary && (
              <div className="mt-3 mb-4 flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                  <TrendingUp size={14} style={{ color: goodColor }} />
                  <span className="text-sm font-bold text-gray-900">{summary.better}</span>
                  <span className="text-xs text-gray-400">stats above avg</span>
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2">
                  <TrendingDown size={14} style={{ color: badColor }} />
                  <span className="text-sm font-bold text-gray-900">{summary.total - summary.better}</span>
                  <span className="text-xs text-gray-400">below avg</span>
                </div>
              </div>
            )}

            <ComparisonTargetToggle value={targetHandicap} onChange={(v) => setTargetHandicap(v)} />
          </BentoCard>

          {/* Comparison grid */}
          {data.comparisons.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {COMPARISON_CATEGORIES.map((cat, i) => {
                const items = data.comparisons.filter((c) => c.category === cat);
                if (!items.length) return null;
                return (
                  <ComparisonCategory
                    key={cat}
                    category={cat}
                    items={items}
                    benchmarkLabel="Avg"
                    globalIndex={i}
                    goodColor={goodColor}
                    badColor={badColor}
                    benchmarkColor={benchmarkColor}
                    categoryStyles={categoryStyles}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Sparkles size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">
                Play a few more rounds to unlock your comparison data.
              </p>
            </div>
          )}

          {/* Strengths */}
          {data.strengths.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">Your Strengths</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {data.strengths.map((s, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.35 }}
                  >
                    <BentoCard>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: accentColor }}>
                        {s.category}
                      </p>
                      <p className="text-sm font-bold text-gray-900 mb-2">{s.title}</p>
                      <p className="text-2xl font-black text-gray-900 leading-none">
                        {s.player_value}
                        <span className="text-xs font-normal text-gray-400 ml-1">{s.metric_label}</span>
                      </p>
                      <p className="text-xs font-semibold mt-1.5" style={{ color: accentColor }}>
                        {s.margin_description}
                      </p>
                    </BentoCard>
                  </motion.div>
                ))}
              </div>
            </section>
          )}

          {/* Focus areas */}
          {data.insights.length > 0 && (
            <section>
              <h2 className="text-base font-bold text-gray-900 mb-3">Top Focus Areas</h2>
              <div className="space-y-3">
                {data.insights.map((insight, i) => (
                  <InsightCard key={i} insight={insight} index={i} accentColor={accentColor} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
