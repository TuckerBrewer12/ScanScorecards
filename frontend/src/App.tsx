import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RoundsPage } from "./pages/RoundsPage";
import { RoundDetailPage } from "./pages/RoundDetailPage";
import { CoursesPage } from "./pages/CoursesPage";
import { ScanPage } from "./pages/ScanPage";
import type { ScanState } from "./types/scan";
import { initialScanState } from "./types/scan";
import { api } from "./lib/api";

export default function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>(initialScanState);

  useEffect(() => {
    api.getUserByEmail("scheffler@example.com").then((user) => {
      if (user.id) setUserId(user.id);
    });
  }, []);

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Connecting...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<DashboardPage userId={userId} />} />
          <Route path="/rounds" element={<RoundsPage userId={userId} />} />
          <Route path="/rounds/:roundId" element={<RoundDetailPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/scan" element={<ScanPage userId={userId} scanState={scanState} setScanState={setScanState} />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
