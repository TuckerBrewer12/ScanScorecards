import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ScanLine, Type, GripVertical, CheckSquare } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function CrispDigitalTable() {
  const holes = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const par = [4, 4, 3, 5, 4, 4, 3, 5, 3];
  const score = [5, 5, 3, 6, 5, 5, 4, 6, 4]; // T's scores
  const putts = [2, 1, 2, 2, 2, 3, 3, 2, 2];
  const gir = [0, 0, 1, 0, 0, 1, 1, 0, 0];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 1.05 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
      className="absolute inset-0 bg-white w-full h-full flex flex-col p-4 md:p-6 overflow-hidden pointer-events-none z-10 rounded-2xl"
    >
      <div className="bg-[#2d4c3b] text-white p-3 rounded-t-lg flex justify-between items-center text-xs md:text-sm shadow-md">
        <span className="font-semibold">Half Moon Bay Golf Course</span>
        <div className="text-right">
          <div className="font-bold uppercase tracking-wider text-[10px] sm:text-xs text-white/90">Blue tees</div>
          <div className="text-[9px] text-white/70">Rating 70.8 / Slope 127</div>
        </div>
      </div>
      
      <div className="flex-1 bg-white border-l border-r border-b border-gray-100 rounded-b-lg shadow-xl grid font-sans text-[10px] sm:text-[11px] font-medium text-gray-500 overflow-hidden">
        {/* Row Headers */}
        <div className="grid grid-cols-11 border-b border-gray-100 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-gray-400 tracking-wider">HOLE</div>
          {holes.map(h => <div key={h} className="py-2 text-gray-900 font-bold">{h}</div>)}
        </div>
        <div className="grid grid-cols-11 border-b border-gray-50 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-gray-700">Par</div>
          {par.map((p, i) => <div key={i} className="py-2 text-gray-600 font-bold">{p}</div>)}
        </div>
        <div className="grid grid-cols-11 border-b border-gray-50 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-gray-900">Score</div>
          {score.map((s, i) => (
            <div key={i} className="py-1">
              <span className={`inline-block w-5 h-5 sm:w-6 sm:h-6 leading-5 sm:leading-6 rounded-sm text-white ${s > par[i] ? 'bg-red-500' : s === par[i] ? 'bg-gray-400' : 'bg-blue-500'}`}>
                {s}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-11 border-b border-gray-50 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-gray-700">To Par</div>
          {score.map((s, i) => (
            <div key={i} className={`py-2 font-semibold ${s > par[i] ? 'text-red-500' : 'text-gray-500'}`}>
              {s > par[i] ? `+${s - par[i]}` : s === par[i] ? 'E' : `${s - par[i]}`}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-11 border-b border-gray-50 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-gray-700">Putts</div>
          {putts.map((p, i) => <div key={i} className="py-2 text-gray-400">{p}</div>)}
        </div>
        <div className="grid grid-cols-11 border-b border-gray-50 items-center text-center">
          <div className="col-span-2 text-left pl-3 py-2 font-bold text-emerald-600">GIR</div>
          {gir.map((g, i) => (
            <div key={i} className="py-2 flex justify-center">
              <div className={`w-2 h-2 rounded-full border ${g ? 'bg-emerald-500 border-emerald-500' : 'border-gray-300'}`} />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function InteractiveScannerDemo() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    let delay = 1000;
    if (step === 1) delay = 4000; // Time reading mappings
    else if (step === 2) delay = 1500; // Scan line goes down
    else if (step === 3) delay = 5000; // Review clean HTML table

    const timeout = setTimeout(() => {
      setStep((s) => (s + 1) % 4);
    }, delay);

    return () => clearTimeout(timeout);
  }, [step]);

  const TypewriterLabel = ({ text }: { text: string }) => {
    return (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ staggerChildren: 0.1 }}
      >
        {text.split('').map((char, i) => (
          <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.15 }}>
            {char}
          </motion.span>
        ))}
      </motion.span>
    );
  };

  return (
    <div className="relative w-full max-w-lg aspect-[4/3] sm:aspect-[1.1] rounded-2xl shadow-2xl shadow-gray-200/50 border border-gray-200 overflow-hidden bg-white perspective-1000 flex items-center justify-center">
      
      {/* Base Images */}
      <motion.img 
        src="/hero/physical-card.jpg" 
        alt="Physical Scorecard" 
        className="absolute inset-0 w-full h-full object-cover origin-left"
        initial={false}
        animate={{ 
          filter: step === 1 ? "brightness(0.5) blur(3px)" : "brightness(1) blur(0px)",
          opacity: step === 3 ? 0 : 1,
          scale: step === 3 ? 0.95 : 1
        }}
        transition={{ duration: 0.8 }}
      />

      {/* Step 3 Digital replacement */}
      <AnimatePresence>
        {step === 3 && <CrispDigitalTable />}
      </AnimatePresence>

      {/* Step 1: Mapping Overlay matching exactly the user UI */}
      <AnimatePresence>
        {step === 1 && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 z-20 pointer-events-none"
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col font-sans">
              <div className="p-4 sm:p-5 border-b border-gray-100">
                <h3 className="font-bold text-gray-800 text-sm mb-4">What's on your card?</h3>
                
                <div className="mb-4">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-gray-400 mb-1.5 flex items-center gap-1">
                    Your Name On The Card
                  </div>
                  <div className="border border-gray-200 rounded-md py-2 px-3 flex items-center font-medium text-gray-800 text-sm">
                    <TypewriterLabel text="T" />
                    <motion.div animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-0.5 h-4 bg-gray-400 ml-1" />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-gray-400 mb-1.5 flex items-center gap-1">
                    Scoring Format
                  </div>
                  <div className="flex gap-2">
                    <motion.div 
                      initial={{ opacity: 1 }} 
                      animate={{ opacity: 0.4 }} 
                      transition={{ delay: 1.2, duration: 0.3 }}
                      className="flex-1 border border-gray-200 rounded-md p-2 flex flex-col justify-center"
                    >
                      <div className="text-xs font-bold text-gray-800">Total strokes</div>
                      <div className="text-[9px] text-gray-400">e.g. 4, 5, 3</div>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ borderColor: "#e5e7eb", backgroundColor: "#ffffff" }}
                      animate={{ borderColor: "#059669", backgroundColor: "#ecfdf5" }}
                      transition={{ delay: 1.2, duration: 0.2 }}
                      className="flex-1 border-2 rounded-md p-2 flex flex-col justify-center transform origin-center"
                    >
                      <motion.div initial={{ scale: 1 }} animate={{ scale: [1, 1.05, 1] }} transition={{ delay: 1.2, duration: 0.3 }}>
                        <div className="text-xs font-bold text-emerald-800">To par</div>
                        <div className="text-[9px] text-emerald-600/70">e.g. +1, -1, E</div>
                      </motion.div>
                    </motion.div>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-gray-400 mb-1.5 flex items-center gap-1">
                    Also On The Card
                  </div>
                  <div className="flex gap-2">
                    <motion.div 
                      initial={{ opacity: 0.4, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      transition={{ delay: 1.8, duration: 0.3 }}
                      className="border border-emerald-600/40 bg-emerald-50/50 rounded-md py-1.5 px-3 flex items-center gap-2"
                    >
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.9, type: "spring" }}>
                        <CheckSquare size={14} className="text-emerald-600" />
                      </motion.div>
                      <span className="text-xs font-bold text-emerald-800">Putts</span>
                    </motion.div>
                    
                    <motion.div 
                      initial={{ opacity: 0.4, scale: 0.95 }} 
                      animate={{ opacity: 1, scale: 1 }} 
                      transition={{ delay: 2.2, duration: 0.3 }}
                      className="border border-emerald-600/40 bg-emerald-50/50 rounded-md py-1.5 px-3 flex items-center gap-2"
                    >
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2.3, type: "spring" }}>
                        <CheckSquare size={14} className="text-emerald-600" />
                      </motion.div>
                      <span className="text-xs font-bold text-emerald-800">Shots to green</span>
                    </motion.div>
                  </div>
                </div>

              </div>
              
              <div className="bg-gray-50/50 p-4 sm:p-5 overflow-hidden">
                <div className="flex flex-col gap-2 mb-4 relative">
                  {/* Row 1 */}
                  <div className="flex gap-2 relative">
                    <div className="w-16 bg-slate-600 text-white rounded-md flex items-center justify-center font-bold text-xs shadow-md z-10">
                      NAME
                    </div>
                    <motion.div 
                      initial={{ x: "120%", opacity: 0 }} 
                      animate={{ x: 0, opacity: 1 }} 
                      transition={{ delay: 2.6, type: "spring", damping: 15 }} 
                      className="flex-1 bg-[#388e3c] text-white rounded-md py-2 px-3 text-xs font-semibold flex items-center gap-2 shadow-sm"
                    >
                      <GripVertical size={14} className="opacity-50" /> Score
                    </motion.div>
                  </div>
                  
                  {/* Row 2 */}
                  <motion.div 
                    initial={{ x: "120%", opacity: 0 }} 
                    animate={{ x: 0, opacity: 1 }} 
                    transition={{ delay: 2.9, type: "spring", damping: 15 }} 
                    className="w-full bg-[#7e57c2] text-white rounded-md py-2 px-3 text-xs font-semibold flex items-center gap-2 shadow-sm"
                  >
                    <GripVertical size={14} className="opacity-50" /> Shots to Green
                  </motion.div>
                  
                  {/* Row 3 */}
                  <motion.div 
                    initial={{ x: "120%", opacity: 0 }} 
                    animate={{ x: 0, opacity: 1 }} 
                    transition={{ delay: 3.2, type: "spring", damping: 15 }} 
                    className="w-full bg-[#0277bd] text-white rounded-md py-2 px-3 text-xs font-semibold flex items-center gap-2 shadow-sm"
                  >
                    <GripVertical size={14} className="opacity-50" /> Putts
                  </motion.div>
                </div>
                
                <motion.div 
                  initial={{ scale: 1 }}
                  animate={{ scale: [1, 0.95, 1], backgroundColor: ["#388e3c", "#2e7d32", "#388e3c"] }}
                  transition={{ delay: 3.8, duration: 0.3 }}
                  className="text-white rounded-md py-3 text-center text-sm font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  style={{ backgroundColor: "#388e3c" }}
                >
                  <ScanLine size={16} /> Extract Scorecard
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step 2: Laser Scanner */}
      <AnimatePresence>
        {step === 2 && (
          <motion.div
            initial={{ top: "-20%" }}
            animate={{ top: "120%" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "linear" }}
            className="absolute left-0 right-0 h-32 bg-gradient-to-b from-transparent via-primary/10 to-primary/40 border-b-2 border-primary z-30 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* Step Indicator Pill */}
      <motion.div 
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl flex items-center gap-2 tracking-wide z-40 transition-colors"
        layout
      >
        {step === 0 && "1. Snap a Photo"}
        {step === 1 && (
          <>
            <Type size={14} className="text-primary" />
            2. Tell it what to read
          </>
        )}
        {step === 2 && (
          <>
            <ScanLine size={14} className="text-emerald-400 animate-pulse" />
            3. AI Extraction
          </>
        )}
        {step === 3 && (
          <>
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            4. Pure Clean Stats
          </>
        )}
      </motion.div>

    </div>
  );
}

export function HeroSection() {
  return (
    <section className="bg-white pt-20 pb-24 md:pt-32 md:pb-36 overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16 relative z-10">
        
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 text-center lg:text-left"
        >
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-gray-900 leading-[1.08] mb-6">
            Your Golf History —<br />
            <span className="text-primary">Just Snap a Scorecard.</span>
          </h1>

          <p className="text-xl text-gray-500 max-w-2xl mx-auto lg:mx-0 leading-relaxed mb-10">
            Ditch the manual data entry. Take a photo of your paper scorecard and instantly track your fairways, putts, greens in regulation, and handicap.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
            <Link
              to="/register"
              className="bg-primary text-white rounded-full px-8 py-3.5 text-base font-semibold hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20 transition-all duration-200"
            >
              Sign Up Free
            </Link>
            <button
              onClick={() => scrollTo("how-it-works")}
              className="flex items-center gap-2 text-gray-600 font-medium hover:text-primary transition-colors px-6 py-3.5"
            >
              See How It Works <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>

        <div className="flex-1 w-full flex items-center justify-center min-h-[350px]">
          <InteractiveScannerDemo />
        </div>

      </div>
    </section>
  );
}
