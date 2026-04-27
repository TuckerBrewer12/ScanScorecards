import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ActivityHeatmap } from "./ActivityHeatmap";
import type { RoundSummary } from "@/types/golf";

describe("ActivityHeatmap", () => {
  it("should format dates correctly and render colored squares based on recent rounds", () => {
    // Generate dates dynamically to ensure they fall within the last 6 months layout
    const today = new Date();
    
    // Y-M-D helper
    const formatDateStr = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const dateA = new Date(today);
    dateA.setDate(dateA.getDate() - 1); // Yesterday

    const dateB = new Date(today);
    dateB.setDate(dateB.getDate() - 2); // 2 Days ago

    const dateC = new Date(today);
    dateC.setDate(dateC.getDate() - 100); // Beyond 3 months, ensuring older dates handled properly

    const rounds: RoundSummary[] = [
      {
        id: "1",
        date: formatDateStr(dateA) + "T14:30:00Z", // Test parsing ISO with trailing time
        course_id: null, course_name: null, course_location: null,
        course_par: null, tee_box: null, total_score: 80, to_par: null,
        front_nine: null, back_nine: null, total_putts: null, total_gir: null,
        fairways_hit: null, notes: null
      },
      {
        id: "2",
        date: formatDateStr(dateA) + "T08:00:00", // Two rounds same day, test stacking counts
        course_id: null, course_name: null, course_location: null, course_par: null,
        tee_box: null, total_score: 82, to_par: null, front_nine: null, back_nine: null,
        total_putts: null, total_gir: null, fairways_hit: null, notes: null
      },
      {
        id: "3",
        date: formatDateStr(dateB), // Exactly YYYY-MM-DD
        course_id: null, course_name: null, course_location: null, course_par: null,
        tee_box: null, total_score: 75, to_par: null, front_nine: null, back_nine: null,
        total_putts: null, total_gir: null, fairways_hit: null, notes: null
      },
      {
        id: "4",
        date: formatDateStr(dateC).replace(/-/g, "/"), // Unconventional string testing fallback mechanism
        course_id: null, course_name: null, course_location: null, course_par: null,
        tee_box: null, total_score: 75, to_par: null, front_nine: null, back_nine: null,
        total_putts: null, total_gir: null, fairways_hit: null, notes: null
      }
    ];

    const { container } = render(<ActivityHeatmap rounds={rounds} />);

    // Since dateA has 2 rounds, it should have the 'bg-emerald-400 dark:bg-emerald-700' class
    const twoRoundsSquare = container.querySelector(`[title="2 rounds on ${formatDateStr(dateA)}"]`);
    expect(twoRoundsSquare).not.toBeNull();
    expect(twoRoundsSquare?.className).toContain("bg-emerald-400");

    // Since dateB has 1 round, it should have the 'bg-emerald-200 dark:bg-emerald-900' class
    const oneRoundSquare = container.querySelector(`[title="1 rounds on ${formatDateStr(dateB)}"]`);
    expect(oneRoundSquare).not.toBeNull();
    expect(oneRoundSquare?.className).toContain("bg-emerald-200");

    // Since dateC relies on string splitting fallback, it should also be safely handled and highlighted
    const fallbackSquare = container.querySelector(`[title="1 rounds on ${formatDateStr(dateC)}"]`);
    expect(fallbackSquare).not.toBeNull();
    expect(fallbackSquare?.className).toContain("bg-emerald-200");
  });
});
