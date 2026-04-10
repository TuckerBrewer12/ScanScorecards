import { useState } from "react";
import { Link } from "react-router-dom";
import { Flag, Menu, Moon, Sun, X } from "lucide-react";
import { applyTheme, getStoredPublicTheme, setStoredPublicTheme } from "@/lib/theme";

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
        <Flag size={17} className="text-white" />
      </div>
      <span className="text-xl font-bold text-gray-900 tracking-tight">ScanScorecards</span>
    </div>
  );
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

export function PublicNav() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => getStoredPublicTheme());

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setStoredPublicTheme(next);
    applyTheme(next);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo />

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-600 font-medium">
          <button onClick={() => scrollTo("how-it-works")} className="hover:text-primary transition-colors">
            How It Works
          </button>
          <button onClick={() => scrollTo("try-it-out")} className="hover:text-primary transition-colors">
            Try It Out
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="border border-gray-200 text-gray-700 rounded-full px-5 py-2 text-sm font-medium hover:border-primary hover:text-primary transition-colors"
          >
            Sign In
          </Link>
          <Link
            to="/register"
            className="bg-primary text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Sign Up
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-gray-200 text-gray-600 hover:border-primary hover:text-primary transition-colors"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 flex flex-col gap-4">
          <button
            onClick={() => { scrollTo("how-it-works"); setOpen(false); }}
            className="text-sm font-medium text-gray-700 text-left hover:text-primary transition-colors"
          >
            How It Works
          </button>
          <button
            onClick={() => { scrollTo("try-it-out"); setOpen(false); }}
            className="text-sm font-medium text-gray-700 text-left hover:text-primary transition-colors"
          >
            Try It Out
          </button>
          <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={toggleTheme}
              className="border border-gray-200 text-gray-700 rounded-full px-5 py-2 text-sm font-medium text-center hover:border-primary hover:text-primary transition-colors"
            >
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </button>
            <Link
              to="/login"
              onClick={() => setOpen(false)}
              className="border border-gray-200 text-gray-700 rounded-full px-5 py-2 text-sm font-medium text-center hover:border-primary hover:text-primary transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/register"
              onClick={() => setOpen(false)}
              className="bg-primary text-white rounded-full px-5 py-2 text-sm font-semibold text-center hover:bg-primary/90 transition-colors"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
