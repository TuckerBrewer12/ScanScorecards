import { ScanLine, Target, Trophy, Archive } from "lucide-react";
import { ScrollSection } from "@/components/analytics/ScrollSection";

export function FeaturesSection() {
  return (
    <section id="features" className="bg-gray-50/50 py-24">
      <div className="max-w-5xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">Features</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
              Everything You Need.<br />Nothing You Don't.
            </h2>
          </div>
        </ScrollSection>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Large feature card */}
          <ScrollSection className="md:row-span-2">
            <div className="rounded-2xl border border-gray-100 bg-white p-8 h-full flex flex-col">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                <ScanLine size={24} className="text-primary" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Scorecard Scanning</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-6">
                Point your camera at any paper scorecard — tournament style, resort format, spiral notebook — and our AI extracts every score, hole par, and yardage in seconds.
              </p>
              <div className="mt-auto rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 aspect-video flex items-center justify-center">
                <ScanLine size={48} className="text-primary/30" />
              </div>
            </div>
          </ScrollSection>

          {/* Small cards */}
          <ScrollSection delay={0.1}>
            <div className="rounded-2xl border border-gray-100 bg-white p-7">
              <div className="h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                <Target size={20} className="text-blue-500" />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Automatic Stats</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                GIR percentage, putts per round, fairways hit, and scoring average — calculated from every saved round.
              </p>
            </div>
          </ScrollSection>

          <ScrollSection delay={0.2}>
            <div className="rounded-2xl border border-gray-100 bg-white p-7 flex gap-5">
              <div className="flex-1">
                <div className="h-11 w-11 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                  <Trophy size={20} className="text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">Milestones</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Track your journey to breaking 100, 90, 80, or lower. Celebrate every personal best.
                </p>
              </div>
              <div className="flex-1">
                <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center mb-4">
                  <Archive size={20} className="text-purple-500" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2">Golf Archive</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Every round you've ever played, searchable by course, date, or score.
                </p>
              </div>
            </div>
          </ScrollSection>
        </div>
      </div>
    </section>
  );
}
