import { NavLink } from "react-router-dom";
import { LayoutDashboard, ScanLine, ListOrdered, BarChart2 } from "lucide-react";

const tabs = [
  { to: "/",          label: "Home",      icon: LayoutDashboard },
  { to: "/scan",      label: "Scan",      icon: ScanLine        },
  { to: "/rounds",    label: "Rounds",    icon: ListOrdered     },
  { to: "/analytics", label: "Analytics", icon: BarChart2       },
];

export function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-14">
        {tabs.map(({ to, label, icon: Icon }) => (
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
      </div>
    </nav>
  );
}
