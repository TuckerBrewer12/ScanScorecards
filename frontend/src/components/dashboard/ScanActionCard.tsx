import { useNavigate } from "react-router-dom";
import { Camera, ArrowRight } from "lucide-react";

export function ScanActionCard() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/scan")}
      className="group relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white hover:border-gray-300 hover:shadow-md transition-all duration-300 p-5 text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shadow-sm group-hover:bg-primary group-hover:text-white transition-colors">
            <Camera size={20} className="text-gray-600 group-hover:text-white transition-colors mb-0.5" />
          </div>
          <div>
            <div className="font-bold text-gray-900 leading-tight">Scan a round</div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mt-0.5 group-hover:text-primary transition-colors">
              Upload scorecard
            </div>
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
          <ArrowRight size={16} className="text-gray-400 group-hover:text-primary -rotate-45 group-hover:rotate-0 transition-all duration-300" />
        </div>
      </div>
    </button>
  );
}
