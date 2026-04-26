import { useCallback, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { Round } from "@/types/golf";
import { formatToPar } from "@/types/golf";

export function useShareRound() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const share = useCallback(
    async (round: Round, courseName: string) => {
      if (!cardRef.current) return;
      setSharing(true);
      try {
        const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });

        const totalScore = round.hole_scores.reduce((s, h) => s + (h.strokes ?? 0), 0);
        const coursePar = round.course
          ? round.course.holes.reduce((s, h) => s + (h.par ?? 0), 0) || null
          : round.hole_scores.some((s) => s.par_played != null)
          ? round.hole_scores.reduce((s, h) => s + (h.par_played ?? 0), 0)
          : null;
        const toPar = coursePar !== null && totalScore > 0 ? totalScore - coursePar : null;
        const toParStr = formatToPar(toPar);
        const text = `Check out my ${totalScore} (${toParStr}) at ${courseName}! ⛳`;

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "round.png", { type: "image/png" });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${totalScore} at ${courseName}`,
            text,
          });
        } else {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = `scorecard-${courseName.replace(/\s+/g, "-").toLowerCase()}.png`;
          a.click();
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("Share failed:", err);
        }
      } finally {
        setSharing(false);
      }
    },
    []
  );

  return { cardRef, share, sharing };
}
