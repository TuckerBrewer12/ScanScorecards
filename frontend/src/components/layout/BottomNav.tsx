import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ScanLine,
  ListOrdered,
  BarChart2,
  Menu,
  FlaskConical,
  Trophy,
  MapPin,
  Users,
  Settings,
} from "lucide-react";

const primaryTabs = [
  { to: "/",          label: "Home",      icon: LayoutDashboard },
  { to: "/scan",      label: "Scan",      icon: ScanLine        },
  { to: "/rounds",    label: "Rounds",    icon: ListOrdered     },
  { to: "/analytics", label: "Analytics", icon: BarChart2       },
];

const moreItems = [
  { to: "/lab",      label: "The Lab",  icon: FlaskConical },
  { to: "/career",   label: "Career",   icon: Trophy       },
  { to: "/courses",  label: "Courses",  icon: MapPin       },
  { to: "/social",   label: "Social",   icon: Users        },
  { to: "/settings", label: "Settings", icon: Settings     },
];

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/20"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More Sheet */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            key="more-sheet"
            className="md:hidden fixed bottom-14 left-0 right-0 z-40 bg-white rounded-t-2xl border-t border-gray-100 shadow-xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-2.5 mb-4" />
            {/* Grid of items */}
            <div className="grid grid-cols-3 gap-1 px-4 pb-5">
              {moreItems.map(({ to, label, icon: Icon }) => (
                <button
                  key={to}
                  onClick={() => { navigate(to); setMoreOpen(false); }}
                  className="flex flex-col items-center gap-1.5 py-4 rounded-xl active:bg-gray-50 transition-colors"
                >
                  <Icon size={24} strokeWidth={1.75} className="text-gray-600" />
                  <span className="text-xs font-semibold text-gray-700">{label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-stretch h-14">
          {primaryTabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMoreOpen(false)}
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

          {/* More tab */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors ${
              moreOpen ? "text-primary" : "text-gray-400"
            }`}
          >
            <Menu size={20} strokeWidth={moreOpen ? 2.25 : 1.75} />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
