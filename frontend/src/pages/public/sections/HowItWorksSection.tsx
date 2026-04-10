import { Camera, Bot, TrendingUp } from "lucide-react";
import { ScrollSection } from "@/components/analytics/ScrollSection";
import { PublicScanHero } from "@/components/public/PublicScanHero";

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

        {/* Live Demo */}
        <ScrollSection delay={0.3}>
          <div id="try-it-out" className="mt-20 max-w-2xl mx-auto">
            <PublicScanHero />
          </div>
        </ScrollSection>
      </div>
    </section>
  );
}
