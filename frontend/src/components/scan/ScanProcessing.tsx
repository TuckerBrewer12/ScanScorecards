import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ScanState } from "@/types/scan";

interface ScanProcessingProps {
  scanMode: ScanState["scanMode"];
}

export function ScanProcessing({ scanMode }: ScanProcessingProps) {
  return (
    <div>
      <PageHeader title="Scan Scorecard" />
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 size={48} className="text-primary animate-spin mb-4" />
        <p className="text-gray-600 font-medium">Analyzing your scorecard...</p>
        <p className="text-sm text-gray-400 mt-1">
          {scanMode === "fast" ? "Fast scan — usually under 10 seconds" : "This may take 1–2 minutes"}
        </p>
      </div>
    </div>
  );
}
