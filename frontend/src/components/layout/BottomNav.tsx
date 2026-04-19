import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScanLine,
  ListOrdered,
  BarChart2,
  Menu,
  MapPin,
  FlaskConical,
  Trophy,
  Users,
  Inbox,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const primaryTabs = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/scan", label: "Scan", icon: ScanLine },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
];

const moreTabs = [
  { to: "/courses", label: "Courses", icon: MapPin },
  { to: "/the-lab", label: "The Lab", icon: FlaskConical },
  { to: "/career", label: "Career", icon: Trophy },
  { to: "/social", label: "Social", icon: Users },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/settings", label: "Settings", icon: Settings },
];

function isTabActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function BottomNav() {
  const location = useLocation();
  const { logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const moreActive = useMemo(
    () => moreTabs.some((tab) => isTabActive(location.pathname, tab.to)),
    [location.pathname],
  );

  const handleLogout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    try {
      await logout();
    } finally {
      setLogoutPending(false);
      setMoreOpen(false);
    }
  };

  return (
    <>
      {moreOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="md:hidden fixed inset-0 bg-black/20 z-[59]"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="md:hidden fixed left-3 right-3 z-[60] rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-xl"
            style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
          >
            <div className="px-4 pt-4 pb-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-400">
              More
            </div>
            <div className="px-2 pb-2 grid grid-cols-2 gap-1">
              {moreTabs.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      isActive ? "bg-emerald-50 text-primary font-semibold" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
            <div className="px-2 pb-3">
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={logoutPending}
                className="w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <LogOut size={16} />
                {logoutPending ? "Signing out..." : "Logout"}
              </button>
            </div>
          </div>
        </>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[61] bg-white border-t border-gray-100"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch h-14">
          {primaryTabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
                  isActive ? "text-primary" : "text-gray-400"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              moreOpen || moreActive ? "text-primary" : "text-gray-400"
            }`}
          >
            <Menu size={20} strokeWidth={moreOpen || moreActive ? 2.25 : 1.75} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
