import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { type ComparisonTargetValue } from "@/components/suggestions/ComparisonTargetToggle";
import { BentoCard } from "@/components/ui/BentoCard";
import type { BenchmarkProfile } from "@/components/the-lab/constants";
import { GOAL_OPTIONS, GOAL_BENCHMARK, HANDICAP_BENCHMARK } from "@/components/the-lab/constants";
import { AttemptsTimeline } from "@/components/the-lab/AttemptsTimeline";
import { ParTypeCard } from "@/components/the-lab/ParTypeCard";
import { PuttingDeepDiveCard } from "@/components/the-lab/PuttingDeepDiveCard";
import { buildRadarData, UserRadarChart } from "@/components/analytics/UserRadarChart";
import type { AnalyticsData, ScoreTypeRow } from "@/types/analytics";
import { MobileLabPage } from "@/components/the-lab/MobileLabPage";

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-bold text-primary/50 uppercase tracking-[0.18em] whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-primary/10 rounded-full" />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-24 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="h-32 rounded-2xl bg-gray-100" />
        <div className="h-32 rounded-2xl bg-gray-100" />
      </div>
      <div className="h-80 rounded-2xl bg-gray-100" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface TheLabPageProps {
  userId: string;
}

function toBenchmarkProfile(data: AnalyticsData | undefined): BenchmarkProfile | null {
  if (!data || data.kpis.total_rounds < 1) return null;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  const par3 = data.scoring_by_par.find((row) => row.par === 3 && row.sample_size > 0)?.average_to_par;
  const par4 = data.scoring_by_par.find((row) => row.par === 4 && row.sample_size > 0)?.average_to_par;
  const par5 = data.scoring_by_par.find((row) => row.par === 5 && row.sample_size > 0)?.average_to_par;

  return {
    gir: clamp(data.kpis.gir_percentage ?? 0),
    scrambling: clamp(data.kpis.scrambling_percentage ?? 0),
    putting: clamp(((3.5 - (data.kpis.putts_per_gir ?? 3.5)) / 2) * 100),
    par3: clamp(((2 - (par3 ?? 2)) / 2.5) * 100),
    par4: clamp(((2 - (par4 ?? 2)) / 2.5) * 100),
    par5: clamp(((2 - (par5 ?? 2)) / 2.5) * 100),
  };
}

export function TheLabPage({ userId }: TheLabPageProps) {
  const queryClient = useQueryClient();
  const [targetHandicap, setTargetHandicap] = useState<ComparisonTargetValue>(null);
  const [radarMode, setRadarMode] = useState<"benchmark" | "peak">("benchmark");
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [compactRadarLayout, setCompactRadarLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });

  // Queries
  const { data: user } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => api.getUser(userId),
  });
  const currentGoal = user?.scoring_goal ?? null;

  const { data: goalReport, isLoading: reportLoading } = useQuery({
    queryKey: ["goal-report", userId],
    queryFn: () => api.getGoalReport(userId, 20),
    enabled: !!currentGoal,
    retry: false,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["analytics", userId, { limit: 20 }],
    queryFn: () => api.getAnalytics(userId, { limit: 20, timeframe: "all", courseId: "all" }),
  });

  const { data: acceptedFriendships = [] } = useQuery({
    queryKey: ["friendships", "accepted"],
    queryFn: () => api.getFriendships("accepted"),
  });

  const friendOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    for (const friendship of acceptedFriendships) {
      const isRequester = friendship.requester_id === userId;
      const friendId = isRequester ? friendship.addressee_id : friendship.requester_id;
      if (!friendId || friendId === userId) continue;
      const friendName = (isRequester ? friendship.addressee_name : friendship.requester_name) || "Unknown user";
      if (!deduped.has(friendId)) {
        deduped.set(friendId, friendName);
      }
    }
    return [...deduped.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [acceptedFriendships, userId]);

  useEffect(() => {
    if (!friendOptions.length) {
      setSelectedFriendId("");
      return;
    }
    if (!selectedFriendId || !friendOptions.some((f) => f.id === selectedFriendId)) {
      setSelectedFriendId(friendOptions[0].id);
    }
  }, [friendOptions, selectedFriendId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const apply = (matches: boolean) => setCompactRadarLayout(matches);
    apply(media.matches);
    const listener = (event: MediaQueryListEvent) => apply(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  const selectedFriend = useMemo(
    () => friendOptions.find((friend) => friend.id === selectedFriendId) ?? null,
    [friendOptions, selectedFriendId],
  );

  const comparingFriend = radarMode === "benchmark" && targetHandicap === "friend";
  const { data: friendAnalytics, isLoading: friendAnalyticsLoading } = useQuery({
    queryKey: ["analytics", "friend-compare", selectedFriendId, { limit: 20 }],
    queryFn: () => api.getAnalytics(selectedFriendId, { limit: 20, timeframe: "all", courseId: "all" }),
    enabled: comparingFriend && !!selectedFriendId,
  });

  // Goal mutation
  const { mutate: setGoal, isPending: settingGoal } = useMutation({
    mutationFn: (value: number) => api.updateUser(userId, { scoring_goal: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["goal-report", userId] });
    },
  });

  // Benchmark profile: driven solely by the toggle, independent of goal
  const benchmarkProfile = useMemo<BenchmarkProfile | null>(() => {
    if (typeof targetHandicap === "number") return HANDICAP_BENCHMARK[targetHandicap] ?? null;
    return null;
  }, [targetHandicap]);

  const friendProfile = useMemo<BenchmarkProfile | null>(
    () => toBenchmarkProfile(friendAnalytics),
    [friendAnalytics],
  );

  // Best rounds insight — top 3 rounds by score, for peak-game analysis
  const peakInsight = useMemo(() => {
    if (!currentGoal || !analytics?.score_trend) return null;
    const valid = analytics.score_trend
      .filter((r) => r.total_score != null)
      .sort((a, b) => a.total_score! - b.total_score!);
    if (valid.length < 2) return null;
    const top = valid.slice(0, Math.min(3, valid.length));
    const bestAvg = top.reduce((s, r) => s + r.total_score!, 0) / top.length;
    const overallAvg = analytics.kpis.scoring_average;
    const gapToGoal = bestAvg - currentGoal;
    return { top, bestAvg, overallAvg, gapToGoal };
  }, [analytics, currentGoal]);

  // Peak profile — nearest GOAL_BENCHMARK entry to the user's best-rounds average
  const peakProfile = useMemo<BenchmarkProfile | null>(() => {
    if (!peakInsight) return null;
    const thresholds = [71, 74, 79, 84, 89, 94, 99] as const;
    const nearest = thresholds.reduce((a, b) =>
      Math.abs(b - peakInsight.bestAvg) < Math.abs(a - peakInsight.bestAvg) ? b : a,
    );
    return GOAL_BENCHMARK[nearest];
  }, [peakInsight]);

  // Score type breakdown for peak rounds vs overall average
  const peakScoreTypes = useMemo(() => {
    if (!peakInsight || !analytics?.score_type_distribution?.length) return null;
    const peakIds = new Set(peakInsight.top.map((r) => r.round_id).filter(Boolean));
    const peakRows = analytics.score_type_distribution.filter((r) => r.round_id && peakIds.has(r.round_id));
    const allRows = analytics.score_type_distribution;
    if (!peakRows.length) return null;

    const avgCount = (rows: ScoreTypeRow[], key: keyof ScoreTypeRow) =>
      rows.reduce((s, r) => s + ((r[key] as number) / 100) * r.holes_counted, 0) / rows.length;
    const doublesPlus = (rows: ScoreTypeRow[]) =>
      rows.reduce((s, r) => s + ((r.double_bogey + r.triple_bogey + r.quad_bogey) / 100) * r.holes_counted, 0) / rows.length;

    return {
      peak: {
        birdies: avgCount(peakRows, "birdie"),
        bogeys: avgCount(peakRows, "bogey"),
        doubles: doublesPlus(peakRows),
      },
      all: {
        birdies: avgCount(allRows, "birdie"),
        bogeys: avgCount(allRows, "bogey"),
        doubles: doublesPlus(allRows),
      },
    };
  }, [peakInsight, analytics]);

  // Active profile: switches between peer benchmark and peak game
  const activeProfile = useMemo(() => {
    if (radarMode === "peak") return peakProfile;
    if (targetHandicap === "friend") return friendProfile;
    return benchmarkProfile;
  }, [radarMode, targetHandicap, peakProfile, friendProfile, benchmarkProfile]);

  // Missing axes for the "no data" notice in the left panel
  const missingAxes = useMemo(() => {
    if (!analytics?.kpis) return [];
    const profile = activeProfile ?? { gir: 0, scrambling: 0, putting: 0, par3: 0, par4: 0, par5: 0 };
    return buildRadarData(analytics.kpis, analytics.scoring_by_par ?? [], profile)
      .filter((e) => !e.hasData)
      .map((e) => e.axis);
  }, [analytics, activeProfile]);

  const goalLabel = GOAL_OPTIONS.find((o) => o.value === currentGoal)?.label ?? null;

  const achievedCount = useMemo(() => {
    if (!analytics?.score_trend || !currentGoal) return 0;
    return analytics.score_trend.filter(
      (r) => r.total_score != null && r.total_score <= currentGoal,
    ).length;
  }, [analytics, currentGoal]);

  // Radar card heading
  const benchmarkHeading = useMemo(() => {
    if (radarMode === "peak") return peakInsight ? `You vs. Your Peak Game (avg ${peakInsight.bestAvg.toFixed(1)})` : "Peak Game";
    if (targetHandicap === "friend") return selectedFriend ? `You vs. ${selectedFriend.name}` : "You vs. Friend";
    if (targetHandicap === 0)  return "You vs. Scratch";
    if (targetHandicap === 5)  return "You vs. Break-80 Shape";
    if (targetHandicap === 10) return "You vs. Break-85 Shape";
    if (targetHandicap === 15) return "You vs. Break-90 Shape";
    if (targetHandicap === 20) return "You vs. Break-95 Shape";
    if (targetHandicap === 25) return "You vs. Break-100 Shape";
    return "Your Performance Shape";
  }, [radarMode, targetHandicap, peakInsight, selectedFriend]);

  const savers = goalReport?.savers ?? [];

  // Best score across all rounds
  const bestScore = useMemo(() => {
    if (goalReport?.best_score != null) return goalReport.best_score;
    const scores = (analytics?.score_trend ?? [])
      .map((r) => r.total_score)
      .filter((s): s is number => s != null);
    return scores.length ? Math.min(...scores) : null;
  }, [analytics, goalReport]);

  // Recent trend: last-5 avg vs overall avg (positive = trending worse)
  const recentTrend = useMemo(() => {
    const valid = (analytics?.score_trend ?? []).filter((r) => r.total_score != null);
    if (valid.length < 5) return null;
    const recent5 = valid.slice(-5).reduce((s, r) => s + r.total_score!, 0) / 5;
    const overall = analytics!.kpis.scoring_average;
    if (overall == null) return null;
    return +(recent5 - overall).toFixed(1);
  }, [analytics]);

  // Compare-vs dropdown helpers
  const selectValue = targetHandicap === null ? "" : String(targetHandicap);
  function handleCompareChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    setTargetHandicap(v === "" ? null : v === "friend" ? "friend" : (Number(v) as ComparisonTargetValue));
  }

  const COMPARE_OPTIONS = [
    { label: "My Level",       value: "" },
    { label: "Scratch",        value: "0" },
    { label: "Breaks 80",      value: "5" },
    { label: "Breaks 85",      value: "10" },
    { label: "Breaks 90",      value: "15" },
    { label: "Breaks 95",      value: "20" },
    { label: "Breaks 100",     value: "25" },
    { label: "Compare Friend", value: "friend" },
  ];

  const benchmarkLegendLabel = (() => {
    if (radarMode === "peak") return "Your peak game";
    if (targetHandicap === "friend") return selectedFriend?.name ?? "Friend";
    return COMPARE_OPTIONS.find((o) => o.value === selectValue)?.label ?? "Benchmark";
  })();

  return (
    <div>

      {/* Mobile layout */}
      <div className="md:hidden">
        <MobileLabPage
          analyticsData={analytics}
          currentGoal={currentGoal}
          setGoal={setGoal}
          settingGoal={settingGoal}
          mode={radarMode}
          setMode={setRadarMode}
          comparisonTarget={targetHandicap}
          setComparisonTarget={setTargetHandicap}
          activeProfile={activeProfile}
          peakInsight={peakInsight}
          peakScoreTypes={peakScoreTypes}
          goalLabel={goalLabel}
          benchmarkHeading={benchmarkHeading}
        />
      </div>

      {/* Desktop layout */}
      <div className="hidden md:block">
      <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">The Lab</h1>
        <p className="text-sm text-gray-400 mt-1">Your blueprint to lower scores.</p>
      </div>

      {/* ── Section 3: Benchmark Analysis ──────────────────────────────── */}
      <div>
        <div className="mb-4">
          <SectionDivider label="Benchmark Analysis" />
        </div>

        {analyticsLoading ? (
          <LoadingSkeleton />
        ) : (
          <BentoCard className="!p-0 overflow-hidden">
            <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100">

              {/* ── Left panel ── */}
              <div className="flex flex-col gap-4 w-full md:w-64 shrink-0 p-5">

                {/* Title */}
                <p className="text-base font-bold text-gray-900 leading-tight">Your Performance Shape</p>

                {/* Mode tabs — horizontal */}
                <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                  {(["benchmark", "peak"] as const).map((mode) => {
                    const active = radarMode === mode;
                    const disabled = mode === "peak" && !peakInsight;
                    return (
                      <button
                        key={mode}
                        onClick={() => !disabled && setRadarMode(mode)}
                        disabled={disabled}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600"
                        } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        {mode === "benchmark" ? "Average (L20)" : "Peak Game"}
                      </button>
                    );
                  })}
                </div>

                {/* Mode-specific stats */}
                {radarMode === "benchmark" ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Your Average</p>
                      <p className="font-mono text-[32px] font-medium text-gray-900 leading-none tracking-tight">
                        {analytics?.kpis.scoring_average != null
                          ? analytics.kpis.scoring_average.toFixed(1)
                          : "—"}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        avg · L20 rounds
                        {bestScore != null && (
                          <> · <span className="font-semibold text-gray-600">{bestScore}</span> best</>
                        )}
                      </p>
                    </div>
                    {recentTrend != null && (
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[11px] text-gray-600 leading-snug">
                        Trending{" "}
                        <span className="font-semibold text-gray-800">
                          {recentTrend >= 0 ? "+" : ""}{recentTrend} strokes
                        </span>{" "}
                        {recentTrend >= 0 ? "above" : "below"} season avg.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {peakInsight ? (
                      <>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Peak Game</p>
                          <p className="font-mono text-[32px] font-medium text-gray-900 leading-none tracking-tight">
                            {peakInsight.bestAvg.toFixed(1)}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            avg · best {peakInsight.top.length} rounds · overall{" "}
                            <span className="font-semibold text-gray-600">
                              {peakInsight.overallAvg?.toFixed(1) ?? "—"}
                            </span>
                          </p>
                        </div>
                        {goalLabel && (
                          <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-[11px] text-gray-600 leading-snug">
                            {peakInsight.gapToGoal <= 0 ? (
                              <>Your best rounds already <span className="font-semibold text-emerald-600">{goalLabel}</span>.</>
                            ) : (
                              <><span className="font-semibold text-gray-800">{peakInsight.gapToGoal.toFixed(1)} strokes</span> from {goalLabel} on best days.</>
                            )}
                          </div>
                        )}
                        <div className="border-t border-gray-50 pt-2 space-y-1.5">
                          {peakInsight.top.map((r, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="text-gray-400 truncate max-w-[140px]">{r.course_name ?? `Round ${i + 1}`}</span>
                              <span className="font-mono font-bold text-gray-700 shrink-0 ml-2">{r.total_score}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-400">No peak data yet — set a goal to enable peak analysis.</p>
                    )}
                  </div>
                )}

                {/* Compare vs. dropdown */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Compare vs.</p>
                  <div className="relative">
                    <select
                      value={selectValue}
                      onChange={handleCompareChange}
                      className="w-full appearance-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 pr-7 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {COMPARE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                  {/* Friend picker */}
                  {comparingFriend && (
                    <select
                      value={selectedFriendId}
                      onChange={(e) => setSelectedFriendId(e.target.value)}
                      disabled={friendOptions.length === 0}
                      className="mt-1.5 w-full appearance-none rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    >
                      {friendOptions.length === 0 ? (
                        <option value="">No friends available</option>
                      ) : (
                        friendOptions.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                {/* Spacer + legend pinned to bottom */}
                <div className="mt-auto pt-2 flex flex-col gap-1.5 text-[11px] text-gray-400">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: "#2d7a3a", opacity: 0.75 }} />
                    You
                  </span>
                  {activeProfile && (
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm bg-gray-400/40 shrink-0" />
                      {benchmarkLegendLabel}
                    </span>
                  )}
                  {missingAxes.length > 0 && (
                    <p className="text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5 leading-relaxed mt-1">
                      No {missingAxes.join(", ")} data yet.
                    </p>
                  )}
                </div>
              </div>

              {/* ── Right panel: radar chart ── */}
              <div className="flex-1 min-w-0 p-5">
                <p className="text-xs text-gray-400 mb-3">Your shape vs. benchmark</p>
                {analytics?.kpis && (
                  <UserRadarChart
                    kpis={analytics.kpis}
                    scoringByPar={analytics.scoring_by_par ?? []}
                    profile={activeProfile ?? undefined}
                    height={compactRadarLayout ? 300 : 340}
                    outerRadius={compactRadarLayout ? 105 : 125}
                    primaryColor="#2d7a3a"
                    gridColor="#e5e7eb"
                    showTooltip
                    emptyMessage={
                      comparingFriend
                        ? friendOptions.length === 0
                          ? "Add friends in Social to unlock friend comparison."
                          : friendAnalyticsLoading
                            ? "Loading friend data..."
                            : "This friend needs more round data."
                        : "Select a benchmark in Compare vs. to see your shape."
                    }
                    margin={compactRadarLayout
                      ? { top: 20, right: 20, bottom: 20, left: 20 }
                      : { top: 24, right: 44, bottom: 24, left: 44 }}
                  />
                )}
              </div>

            </div>
          </BentoCard>
        )}
      </div>

      {/* ── Times Achieved + Attempts Timeline ────────────────────────── */}
      {currentGoal && analytics?.score_trend &&
        analytics.score_trend.filter((r) => r.total_score != null).length >= 3 && (
        <BentoCard>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">Recent Attempts</p>
              <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                green rounds beat the goal
              </p>
            </div>
            <div className="text-right shrink-0 ml-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Times Achieved</p>
              <p className={`text-3xl font-black leading-tight ${achievedCount > 0 ? "text-emerald-600" : "text-gray-900"}`}>
                {achievedCount}
              </p>
              <p className="text-[11px] text-gray-400">
                {achievedCount === 0 ? "keep going" : achievedCount === 1 ? "once!" : `${achievedCount} rounds`}
              </p>
            </div>
          </div>
          <AttemptsTimeline scores={analytics.score_trend} goal={currentGoal} />
        </BentoCard>
      )}

      {/* ── Section 1: Goal Selector ────────────────────────────────────── */}
      <BentoCard>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">Set Your Target</p>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map(({ label, value }) => {
            const active = currentGoal === value;
            return (
              <button
                key={value}
                onClick={() => setGoal(value)}
                disabled={settingGoal}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </BentoCard>

      {/* ── Section: Par Type + Putting ───────────────────────────────── */}
      {analytics && (analytics.scoring_by_par.length > 0 || analytics.three_putts_trend.length > 0) && (
        <div>
          <SectionDivider label="Performance Breakdown" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ParTypeCard
              scoringByPar={analytics.scoring_by_par}
              scoreTypeDist={analytics.score_type_distribution}
              benchmark={activeProfile}
              benchmarkLabel={
                radarMode === "peak"
                  ? "Peak game"
                  : typeof targetHandicap === "number"
                  ? `HCP ${targetHandicap}`
                  : goalLabel ?? "Target"
              }
            />
            <PuttingDeepDiveCard
              threePuttsTrend={analytics.three_putts_trend}
              puttsTrend={analytics.putts_trend}
            />
          </div>
        </div>
      )}


      {/* ── Section 1b: Peak Game Analysis ─────────────────────────────── */}
      {peakInsight && (
        <BentoCard>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3">
            Your Peak Game
          </p>
          <div className="flex items-end gap-4 mb-3">
            <div>
              <span className="text-4xl font-black text-gray-900 tracking-tighter">
                {peakInsight.bestAvg.toFixed(1)}
              </span>
              <span className="text-sm text-gray-400 ml-2">avg · best {peakInsight.top.length} rounds</span>
            </div>
            {peakInsight.overallAvg != null && (
              <div className="pb-1 text-right">
                <span className="text-xs text-gray-400">Overall avg </span>
                <span className="text-sm font-semibold text-gray-500">{peakInsight.overallAvg.toFixed(1)}</span>
              </div>
            )}
          </div>

          {peakInsight.gapToGoal <= 0 ? (
            <p className="text-sm font-semibold text-emerald-600 mb-3">
              Your best rounds already {goalLabel} — make it your new normal.
            </p>
          ) : (
            <p className="text-sm text-gray-600 mb-3">
              Just{" "}
              <span className="font-bold text-gray-900">{peakInsight.gapToGoal.toFixed(1)} strokes</span>{" "}
              away from {goalLabel} on your best days.
            </p>
          )}

          <div className="space-y-1.5 border-t border-gray-50 pt-3 mb-4">
            {peakInsight.top.map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-gray-400 truncate max-w-[180px]">
                  {r.course_name ?? `Round ${i + 1}`}
                </span>
                <span className="font-bold text-gray-700 shrink-0 ml-2">{r.total_score}</span>
              </div>
            ))}
          </div>

          {/* Score type breakdown: peak vs average */}
          {peakScoreTypes && (() => {
            const metrics = [
              {
                label: "Birdies",
                peak: peakScoreTypes.peak.birdies,
                avg: peakScoreTypes.all.birdies,
                higherIsBetter: true,
                strokeMult: 1,
                color: "#059669",
              },
              {
                label: "Bogeys",
                peak: peakScoreTypes.peak.bogeys,
                avg: peakScoreTypes.all.bogeys,
                higherIsBetter: false,
                strokeMult: 1,
                color: "#ef4444",
              },
              {
                label: "Doubles+",
                peak: peakScoreTypes.peak.doubles,
                avg: peakScoreTypes.all.doubles,
                higherIsBetter: false,
                strokeMult: 2,
                color: "#60a5fa",
              },
            ];
            return (
              <div className="border-t border-gray-50 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Peak vs. Average
                </p>
                <div className="space-y-3">
                  {metrics.map(({ label, peak, avg, higherIsBetter, strokeMult, color }) => {
                    const diff = peak - avg;
                    const good = higherIsBetter ? diff > 0 : diff < 0;
                    const strokeImpact = (higherIsBetter ? diff : -diff) * strokeMult;
                    const maxVal = Math.max(peak, avg, 0.1) * 1.2;
                    const peakPct = (peak / maxVal) * 100;
                    const avgPct = (avg / maxVal) * 100;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-semibold text-gray-600">{label}</span>
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: good ? "#059669" : strokeImpact === 0 ? "#9ca3af" : "#ef4444" }}
                          >
                            {strokeImpact > 0 ? "+" : ""}{strokeImpact.toFixed(1)} strokes {strokeImpact >= 0 ? "gained" : "lost"}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">Peak</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${peakPct}%`, backgroundColor: color }} />
                            </div>
                            <span className="text-[11px] font-bold text-gray-700 w-8 shrink-0">{peak.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 w-10 text-right shrink-0">Avg</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${avgPct}%`, backgroundColor: "#d1d5db" }} />
                            </div>
                            <span className="text-[11px] font-bold text-gray-400 w-8 shrink-0">{avg.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </BentoCard>
      )}


    </div>
      </div>
    </div>
  );
}
