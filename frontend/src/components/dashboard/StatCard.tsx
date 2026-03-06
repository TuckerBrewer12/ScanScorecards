import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number | null;
  icon: LucideIcon;
  subtitle?: string;
  highlight?: boolean;
}

export function StatCard({ label, value, icon: Icon, subtitle, highlight }: StatCardProps) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${highlight ? "bg-primary border-primary text-white" : "bg-white border-gray-200"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-medium ${highlight ? "text-white/70" : "text-gray-500"}`}>{label}</span>
        <Icon size={18} className={highlight ? "text-white/70" : "text-primary"} />
      </div>
      <div className={`text-2xl font-bold ${highlight ? "text-white" : "text-gray-900"}`}>
        {value ?? "-"}
      </div>
      {subtitle && (
        <p className={`text-xs mt-1 ${highlight ? "text-white/60" : "text-gray-400"}`}>{subtitle}</p>
      )}
    </div>
  );
}
