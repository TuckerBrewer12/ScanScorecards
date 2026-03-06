import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListOrdered, MapPin, ScanLine } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "Scan Scorecard", icon: ScanLine },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/courses", label: "Courses", icon: MapPin },
];

export function Sidebar() {
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
    </aside>
  );
}
