import { FolderX, ClipboardList, DollarSign } from "lucide-react";
import { ScrollSection } from "@/components/analytics/ScrollSection";

const PAIN_POINTS = [
  {
    icon: FolderX,
    title: "Lost Scorecards",
    desc: "Physical cards get tossed, rained on, or forgotten in the car. Your round disappears with them.",
  },
  {
    icon: ClipboardList,
    title: "Tedious Manual Entry",
    desc: "Hole by hole, par by par — retyping a round takes longer than playing it. Nobody actually does it.",
  },
  {
    icon: DollarSign,
    title: "Expensive, Complex Apps",
    desc: "Most golf apps bundle GPS, live scoring, and social feeds you'll never use — and charge monthly for it.",
  },
];

export function ProblemSection() {
  return (
    <section className="bg-[#fdfaf6] py-24">
      <div className="max-w-5xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">Sound Familiar?</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
              Why Most Golfers Stop Tracking
            </h2>
          </div>
        </ScrollSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PAIN_POINTS.map((point, i) => {
            const Icon = point.icon;
            return (
              <ScrollSection key={point.title} delay={i * 0.15}>
                <div className="rounded-2xl bg-white border border-gray-100 p-7 shadow-sm h-full">
                  <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-red-400" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{point.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{point.desc}</p>
                </div>
              </ScrollSection>
            );
          })}
        </div>

        <ScrollSection delay={0.45}>
          <p className="text-3xl font-extrabold text-primary text-center mt-14">
            There's a simpler way.
          </p>
        </ScrollSection>
      </div>
    </section>
  );
}
