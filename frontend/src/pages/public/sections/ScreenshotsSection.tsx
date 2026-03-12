import { ScanLine, BarChart2, LayoutDashboard, Trophy } from "lucide-react";
import { ScrollSection } from "@/components/analytics/ScrollSection";

const SCREENS = [
  {
    label: "Scan Screen",
    sublabel: "Point, shoot, done",
    icon: ScanLine,
    gradient: "from-emerald-100 to-green-50",
    iconColor: "text-primary",
  },
  {
    label: "Round Summary",
    sublabel: "Hole-by-hole breakdown",
    icon: BarChart2,
    gradient: "from-blue-100 to-indigo-50",
    iconColor: "text-blue-500",
  },
  {
    label: "Dashboard",
    sublabel: "All your trends at a glance",
    icon: LayoutDashboard,
    gradient: "from-amber-100 to-orange-50",
    iconColor: "text-amber-500",
  },
  {
    label: "Milestones",
    sublabel: "Track your personal bests",
    icon: Trophy,
    gradient: "from-purple-100 to-pink-50",
    iconColor: "text-purple-500",
  },
];

export function ScreenshotsSection() {
  return (
    <section className="bg-white py-24">
      <div className="max-w-5xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">The App</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">See It In Action</h2>
            <p className="mt-3 text-base text-gray-500 max-w-md mx-auto">
              A clean, focused interface built entirely around your game — not ads, GPS maps, or upsells.
            </p>
          </div>
        </ScrollSection>

        {/* Horizontal scroll strip — no overflow-x-hidden here */}
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6 scrollbar-hide">
          {SCREENS.map((screen) => {
            const Icon = screen.icon;
            return (
              <div
                key={screen.label}
                className={`snap-start shrink-0 w-52 md:w-64 aspect-[9/16] rounded-2xl bg-gradient-to-br ${screen.gradient} flex flex-col items-center justify-center gap-3 border border-white/60 shadow-sm`}
              >
                <div className="h-14 w-14 rounded-2xl bg-white/80 flex items-center justify-center shadow-sm">
                  <Icon size={28} className={screen.iconColor} />
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-800">{screen.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{screen.sublabel}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
