import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ScanProvider } from "./context/ScanContext";
import { AppLayout } from "./components/layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VerifyPendingPage } from "./pages/VerifyPendingPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { LandingPage } from "./pages/public/LandingPage";
import { applyTheme, getStoredPublicTheme, getStoredTheme } from "./lib/theme";

import { DashboardPage } from "./pages/DashboardPage";
import { RoundsPage } from "./pages/RoundsPage";
import { RoundDetailPage } from "./pages/RoundDetailPage";
import { CoursesPage } from "./pages/CoursesPage";
import { ScanPage } from "./pages/ScanPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CareerPage } from "./pages/CareerPage";
import { TheLabPage } from "./pages/TheLabPage";
import { SettingsPage } from "./pages/SettingsPage";
import { FriendsInboxPage } from "./pages/FriendsInboxPage";
import { SocialPage } from "./pages/SocialPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navType]);
  return null;
}

function AppRoutes() {
  const { userId, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (userId) {
      applyTheme(getStoredTheme());
      return;
    }
    if (
      location.pathname === "/" ||
      location.pathname === "/login" ||
      location.pathname === "/register" ||
      location.pathname === "/forgot-password" ||
      location.pathname === "/reset-password" ||
      location.pathname === "/verify-email" ||
      location.pathname === "/verify-pending"
    ) {
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
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/verify-pending" element={<VerifyPendingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (location.pathname === "/verify-email") {
    return (
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
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
          <Route path="/scan" element={<ScanPage userId={userId} />} />
          <Route path="/analytics" element={<AnalyticsPage userId={userId} />} />
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
        <ScanProvider>
          <ScrollToTop />
          <AppRoutes />
        </ScanProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
