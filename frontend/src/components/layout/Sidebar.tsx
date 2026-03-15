import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListOrdered, MapPin, ScanLine, BarChart2, Trophy, LogOut, Settings, Gamepad2, Flag, ChevronsUpDown, Sparkles, Inbox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan Scorecard", icon: ScanLine },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/courses", label: "Courses", icon: MapPin },
  { to: "/analytics", label: "Analytics", icon: BarChart2 },
  { to: "/suggestions", label: "Peer Comparison", icon: Sparkles },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/progress", label: "Progress", icon: Gamepad2 },
  { to: "/career", label: "Career", icon: Trophy },
];

export function Sidebar() {
  const { logout, name, email } = useAuth();

  const initials = name
    ? name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <aside className="bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.04)] fixed left-0 top-0 h-full w-64 flex flex-col">
      <div className="p-4 border-b border-gray-100">
        <button className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors duration-150">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Flag size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900 flex-1 text-left truncate">ScanScorecards</span>
          <ChevronsUpDown size={14} className="text-gray-400 flex-shrink-0" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-[#eef7f0] text-primary font-semibold rounded-xl"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 rounded-xl"
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
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
              isActive
                ? "bg-[#eef7f0] text-primary font-semibold"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
            }`
          }
        >
          <Settings size={17} />
          Settings
        </NavLink>
      </div>
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors duration-150 group">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{name ?? "Golfer"}</p>
            <p className="text-xs text-gray-400 truncate">{email ?? ""}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Log out"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
