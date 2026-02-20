import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number | null;
  icon: LucideIcon;
  subtitle?: string;
}

export function StatCard({ label, value, icon: Icon, subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <Icon size={18} className="text-primary" />
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {value ?? "-"}
      </div>
      {subtitle && (
        <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
  );
}
