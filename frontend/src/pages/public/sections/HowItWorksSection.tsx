import { Camera, Bot, TrendingUp } from "lucide-react";
import { ScrollSection } from "@/components/analytics/ScrollSection";

const STEPS = [
  {
    number: "01",
    icon: Camera,
    title: "Snap Your Scorecard",
    desc: "Take a photo of the physical scorecard after your round — no need to do anything during play.",
  },
  {
    number: "02",
    icon: Bot,
    title: "We Read It",
    desc: "Our AI instantly detects every score, yardage, and par from the card — including messy handwriting.",
  },
  {
    number: "03",
    icon: TrendingUp,
    title: "Get Your Stats",
    desc: "Handicap tracking, GIR, putts per round, and milestone progress — all calculated automatically.",
  },
];

const DEMO_SCORES = [
  { hole: 1, par: 4, score: 5 },
  { hole: 2, par: 3, score: 3 },
  { hole: 3, par: 5, score: 6 },
  { hole: 4, par: 4, score: 4 },
  { hole: 5, par: 4, score: 5 },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="max-w-5xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-16">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">How It Works</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
              Three steps. Under a minute.
            </h2>
          </div>
        </ScrollSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <ScrollSection key={step.number} delay={i * 0.2}>
                <div className="flex flex-col">
                  <span className="text-8xl font-black text-gray-100 leading-none select-none -mb-4">
                    {step.number}
                  </span>
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon size={20} className="text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </ScrollSection>
            );
          })}
        </div>

        {/* Live Demo placeholder */}
        <ScrollSection delay={0.3}>
          <div className="mt-20 rounded-2xl border border-gray-100 bg-gray-50 p-6 md:p-8 max-w-2xl mx-auto">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-5 text-center">Live Demo</p>
            <div className="grid grid-cols-2 gap-6">
              {/* Left: scorecard photo placeholder */}
              <div className="rounded-xl bg-gradient-to-br from-gray-200 to-gray-100 aspect-[4/3] flex flex-col items-center justify-center gap-2">
                <Camera size={28} className="text-gray-400" />
                <span className="text-xs text-gray-400 font-medium">Scorecard Photo</span>
              </div>
              {/* Right: parsed data */}
              <div className="flex flex-col justify-center">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Detected Scores</div>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="text-left font-medium pb-1">Hole</th>
                      <th className="text-left font-medium pb-1">Par</th>
                      <th className="text-left font-medium pb-1">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DEMO_SCORES.map((row) => (
                      <tr key={row.hole} className="border-t border-gray-100">
                        <td className="py-1 text-gray-600">{row.hole}</td>
                        <td className="py-1 text-gray-600">{row.par}</td>
                        <td className={`py-1 font-semibold ${row.score < row.par ? "text-primary" : row.score === row.par ? "text-gray-700" : "text-gray-500"}`}>
                          {row.score}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 text-xs text-gray-400 italic">+ 13 more holes…</div>
              </div>
            </div>
          </div>
        </ScrollSection>
      </div>
    </section>
  );
}
