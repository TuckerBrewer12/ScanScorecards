import { Link } from "react-router-dom";

export function FinalCtaSection() {
  return (
    <section className="bg-primary">
      <div className="max-w-5xl mx-auto px-6 py-24 text-center">
        <p className="text-xs tracking-widest text-white/60 uppercase font-semibold mb-5">Get Started Today</p>
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
          Start Tracking Your Golf<br />the Easy Way.
        </h2>
        <p className="mt-5 text-lg text-white/70 max-w-md mx-auto leading-relaxed">
          Free to start. No credit card. Just snap a scorecard and go.
        </p>
        <Link
          to="/register"
          className="mt-8 inline-block bg-white text-primary rounded-full px-9 py-4 text-base font-bold hover:bg-white/90 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-200"
        >
          Create Free Account
        </Link>
      </div>

      {/* Footer strip */}
      <div className="border-t border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-3 text-white/40 text-sm">
          <span>© 2026 ScanScorecards</span>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-white transition-colors">
              Register
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
