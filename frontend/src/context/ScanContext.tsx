import { createContext, useContext, useState } from "react";
import type { ScanState } from "@/types/scan";
import { initialScanState } from "@/types/scan";

interface ScanContextValue {
  scanState: ScanState;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [scanState, setScanState] = useState<ScanState>(initialScanState);
  return <ScanContext.Provider value={{ scanState, setScanState }}>{children}</ScanContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useScanState(): ScanContextValue {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScanState must be used within ScanProvider");
  return ctx;
}
