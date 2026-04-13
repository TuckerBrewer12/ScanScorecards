import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListOrdered, MapPin, ScanLine, BarChart2, Trophy, LogOut, Settings, Flag, ChevronsUpDown, FlaskConical, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan Scorecard", icon: ScanLine },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/courses", label: "Courses", icon: MapPin },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
  { to: "/the-lab", label: "The Lab", icon: FlaskConical },
  { to: "/career", label: "Career", icon: Trophy },
  { to: "/social", label: "Social", icon: Users },
];

export function Sidebar() {
  const { logout, name, email } = useAuth();

  const initials = name
    ? name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 flex-col" style={{ background: "linear-gradient(180deg, #1e3d25 0%, #152d1b 100%)" }}>
      <div className="p-4">
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/10 rounded-xl transition-colors duration-150">
          <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
            <Flag size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-white flex-1 text-left truncate">BirdieEyeView</span>
          <ChevronsUpDown size={14} className="text-white/30 flex-shrink-0" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-150 rounded-xl ${
                isActive
                  ? "bg-white/15 text-white font-semibold"
                  : "text-white/50 hover:text-white hover:bg-white/8 font-medium"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
              isActive
                ? "bg-white/15 text-white font-semibold"
                : "text-white/50 hover:text-white hover:bg-white/8 font-medium"
            }`
          }
        >
          <Settings size={17} />
          Settings
        </NavLink>
      </div>
      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition-colors duration-150 group">
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{name ?? "Golfer"}</p>
            <p className="text-xs text-white/40 truncate">{email ?? ""}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            title="Log out"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
