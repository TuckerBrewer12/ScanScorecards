import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Sparkles, BarChart2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  { icon: Camera, label: "Snap Your Card", desc: "Take a photo after your round" },
  { icon: Sparkles, label: "AI Reads It", desc: "Scores, pars & yardages detected" },
  { icon: BarChart2, label: "Stats Appear", desc: "Instant handicap & trend tracking" },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function HeroSection() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="bg-white pt-20 pb-24">
      <div className="max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-primary/5 border border-primary/20 text-primary text-xs font-semibold rounded-full px-4 py-1.5 mb-8 tracking-wide uppercase">
            AI-Powered Scorecard Scanning
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.08] mb-6">
            Your Golf History —<br />
            <span className="text-primary">Just Snap a Scorecard.</span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed mb-10">
            Snap a photo of your scorecard and instantly log your round, track stats, and follow your progress.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              to="/register"
              className="bg-primary text-white rounded-full px-8 py-3.5 text-base font-semibold hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-200"
            >
              Sign Up Free
            </Link>
            <button
              onClick={() => scrollTo("how-it-works")}
              className="flex items-center gap-2 text-gray-600 font-medium hover:text-primary transition-colors"
            >
              See How It Works <ArrowRight size={16} />
            </button>
          </div>
        </motion.div>

        {/* 3-step animation */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
          className="flex items-center justify-center gap-3 md:gap-6"
        >
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            return (
              <div key={step.label} className="flex items-center gap-3 md:gap-6">
                <div
                  className={`flex flex-col items-center gap-3 rounded-2xl border p-5 md:p-6 w-32 md:w-44 transition-all duration-500 ${
                    isActive
                      ? "bg-primary border-primary text-white shadow-xl shadow-primary/20 scale-105"
                      : "bg-white border-gray-100 text-gray-400 shadow-sm"
                  }`}
                >
                  <Icon size={28} />
                  <div className="text-center">
                    <div className={`text-xs font-bold tracking-wide ${isActive ? "text-white" : "text-gray-600"}`}>
                      {step.label}
                    </div>
                    <div className={`text-xs mt-1 leading-snug hidden md:block ${isActive ? "text-white/80" : "text-gray-400"}`}>
                      {step.desc}
                    </div>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    size={20}
                    className={`shrink-0 transition-colors duration-500 ${
                      activeStep > i ? "text-primary" : "text-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </motion.div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-500 ${
                i === activeStep ? "w-5 h-1.5 bg-primary" : "w-1.5 h-1.5 bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
