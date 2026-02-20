import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListOrdered, MapPin } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/rounds", label: "Rounds", icon: ListOrdered },
  { to: "/courses", label: "Courses", icon: MapPin },
];

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="p-5 border-b border-sidebar-hover">
        <h1 className="text-lg font-bold tracking-tight">ScanScorecards</h1>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-hover text-white"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-hover hover:text-white"
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
