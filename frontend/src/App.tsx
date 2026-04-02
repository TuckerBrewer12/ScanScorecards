import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import { useEffect, useState } from "react";

function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
}
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { RoundsPage } from "./pages/RoundsPage";
import { RoundDetailPage } from "./pages/RoundDetailPage";
import { CoursesPage } from "./pages/CoursesPage";
import { ScanPage } from "./pages/ScanPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CareerPage } from "./pages/CareerPage";
import { SuggestionsPage } from "./pages/SuggestionsPage";
import { TheLabPage } from "./pages/TheLabPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FriendsInboxPage } from "./pages/FriendsInboxPage";
import { SocialPage } from "./pages/SocialPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { LandingPage } from "./pages/public/LandingPage";
import type { ScanState } from "./types/scan";
import { initialScanState } from "./types/scan";
import { applyTheme, getStoredPublicTheme, getStoredTheme } from "./lib/theme";

function AppRoutes() {
  const { userId, loading } = useAuth();
  const [scanState, setScanState] = useState<ScanState>(initialScanState);
  const location = useLocation();

  useEffect(() => {
    if (userId) {
      applyTheme(getStoredTheme());
      return;
    }
    // Logged-out routes use public theme preference.
    if (location.pathname === "/" || location.pathname === "/login" || location.pathname === "/register") {
      applyTheme(getStoredPublicTheme());
    }
  }, [userId, location.pathname]);

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
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
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
        <Route path="/suggestions" element={<SuggestionsPage userId={userId} />} />
        <Route path="/the-lab" element={<TheLabPage userId={userId} />} />
        <Route path="/social" element={<SocialPage />} />
        <Route path="/career" element={<CareerPage userId={userId} />} />
        <Route path="/inbox" element={<FriendsInboxPage userId={userId} />} />
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
        <ScrollToTop />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
