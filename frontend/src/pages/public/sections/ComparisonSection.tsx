import { ScrollSection } from "@/components/analytics/ScrollSection";

function Check() {
  return <span className="text-primary font-bold text-base">✓</span>;
}

function Cross() {
  return <span className="text-gray-300 text-base">✗</span>;
}

function Partial({ label }: { label: string }) {
  return <span className="text-gray-400 text-sm">{label}</span>;
}

const ROWS = [
  {
    feature: "Scorecard Scanning",
    us: <Check />,
    them: <Cross />,
  },
  {
    feature: "GPS Required",
    us: <span className="text-primary font-semibold text-sm">Never</span>,
    them: <Partial label="Usually" />,
  },
  {
    feature: "Price",
    us: <span className="text-primary font-semibold text-sm">Free / $49/yr</span>,
    them: <Partial label="$5–15/mo" />,
  },
  {
    feature: "Setup Time",
    us: <span className="text-primary font-semibold text-sm">Under 1 min</span>,
    them: <Partial label="10–20 min" />,
  },
  {
    feature: "Automatic Stat Tracking",
    us: <Check />,
    them: <Partial label="Partial" />,
  },
  {
    feature: "Ad-Free",
    us: <Check />,
    them: <Cross />,
  },
];

export function ComparisonSection() {
  return (
    <section className="bg-[#fdfaf6] py-24">
      <div className="max-w-3xl mx-auto px-6">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-xs tracking-widest text-primary uppercase font-semibold mb-3">Why Us</p>
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900">
              ScanScorecards vs. The Rest
            </h2>
          </div>
        </ScrollSection>

        <ScrollSection delay={0.15}>
          <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white shadow-sm">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
                    Feature
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-bold text-primary bg-primary/5 border-t-2 border-primary">
                    ScanScorecards
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">
                    Typical Golf Apps
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr key={row.feature} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                    <td className="px-6 py-4 text-gray-700 font-medium">{row.feature}</td>
                    <td className="px-6 py-4 text-center bg-primary/5">{row.us}</td>
                    <td className="px-6 py-4 text-center">{row.them}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollSection>
      </div>
    </section>
  );
}
