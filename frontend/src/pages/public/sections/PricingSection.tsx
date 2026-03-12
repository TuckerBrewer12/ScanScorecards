import { Link } from "react-router-dom";
import { ScrollSection } from "@/components/analytics/ScrollSection";

const PRO_PRICE = "$49";

const FREE_FEATURES = [
  "Scorecard scanning (AI-powered)",
  "Up to 20 rounds history",
  "Basic stats: GIR, putts, scoring avg",
  "Course tracking",
  "Milestone tracking",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited round history",
  "Advanced analytics & trends",
  "Deep milestone breakdowns",
  "Short game & handicap tracking",
  "Export your data",
];

function FeatureItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-gray-600">
      <span className="mt-0.5 text-primary font-bold shrink-0">✓</span>
      {text}
    </li>
  );
}

export function PricingSection() {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="max-w-3xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">Pricing</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
              Simple, Honest Pricing
            </h2>
            <p className="mt-3 text-base text-gray-500">
              Start free. Upgrade when you're ready.
            </p>
          </div>
        </ScrollSection>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free card */}
          <ScrollSection delay={0.1}>
            <div className="rounded-2xl border border-gray-200 p-8 h-full flex flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">Free</h3>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold text-gray-900">$0</span>
                  <span className="text-sm text-gray-400 ml-1">/ forever</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">Everything you need to get started.</p>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {FREE_FEATURES.map((f) => <FeatureItem key={f} text={f} />)}
              </ul>

              <Link
                to="/register"
                className="block text-center border border-primary text-primary rounded-xl py-3 px-6 text-sm font-semibold hover:bg-primary/5 transition-colors"
              >
                Get Started Free
              </Link>
            </div>
          </ScrollSection>

          {/* Pro card */}
          <ScrollSection delay={0.2}>
            <div className="relative rounded-2xl border-2 border-primary p-8 bg-primary/5 h-full flex flex-col">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                Most Popular
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900">Pro</h3>
                <div className="mt-2">
                  <span className="text-4xl font-extrabold text-gray-900">{PRO_PRICE}</span>
                  <span className="text-sm text-gray-400 ml-1">/ year</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">Unlock the full picture of your game.</p>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {PRO_FEATURES.map((f) => <FeatureItem key={f} text={f} />)}
              </ul>

              <Link
                to="/register"
                className="block text-center bg-primary text-white rounded-xl py-3 px-6 text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/20 transition-all duration-200"
              >
                Go Pro
              </Link>
            </div>
          </ScrollSection>
        </div>
      </div>
    </section>
  );
}
