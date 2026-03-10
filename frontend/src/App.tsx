import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RoundsPage } from "./pages/RoundsPage";
import { RoundDetailPage } from "./pages/RoundDetailPage";
import { CoursesPage } from "./pages/CoursesPage";
import { ScanPage } from "./pages/ScanPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CareerPage } from "./pages/CareerPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import type { ScanState } from "./types/scan";
import { initialScanState } from "./types/scan";

function AppRoutes() {
  const { userId, loading } = useAuth();
  const [scanState, setScanState] = useState<ScanState>(initialScanState);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage userId={userId} />} />
        <Route path="/rounds" element={<RoundsPage userId={userId} />} />
        <Route path="/rounds/:roundId" element={<RoundDetailPage userId={userId} />} />
        <Route path="/courses" element={<CoursesPage userId={userId} />} />
        <Route path="/scan" element={<ScanPage userId={userId} scanState={scanState} setScanState={setScanState} />} />
        <Route path="/analytics" element={<AnalyticsPage userId={userId} />} />
        <Route path="/career" element={<CareerPage userId={userId} />} />
        <Route path="/settings" element={<SettingsPage userId={userId} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
