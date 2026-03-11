import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListOrdered, MapPin, ScanLine, BarChart2, Trophy, LogOut, Settings, Gamepad2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan Scorecard", icon: ScanLine },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/courses", label: "Courses", icon: MapPin },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
  { to: "/progress", label: "Progress", icon: Gamepad2 },
  { to: "/career", label: "Career", icon: Trophy },
];

export function Sidebar() {
  const { logout } = useAuth();

  return (
    <aside className="sidebar-gradient fixed left-0 top-0 h-full w-56 text-sidebar-foreground flex flex-col">
      <div className="p-5 border-b border-white/10">
        <h1 className="text-xl font-extrabold tracking-tight text-white">ScanScorecards</h1>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-white/10 text-white border-l-2 border-white/50 pl-[10px]"
                  : "text-sidebar-foreground/60 hover:bg-white/8 hover:text-white border-l-2 border-transparent pl-[10px]"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-white/10 grid grid-cols-2 gap-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-white/12 text-white"
                : "text-sidebar-foreground/70 hover:bg-white/8 hover:text-white"
            }`
          }
        >
          <Settings size={17} />
          Settings
        </NavLink>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-sidebar-foreground/70 hover:bg-white/8 hover:text-white"
        >
          <LogOut size={17} />
          Log Out
        </button>
      </div>
    </aside>
  );
}
