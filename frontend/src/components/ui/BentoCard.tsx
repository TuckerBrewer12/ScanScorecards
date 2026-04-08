interface BentoCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function BentoCard({ title, subtitle, children, className, interactive, onClick }: BentoCardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-gray-200/50 ${interactive ? "cursor-pointer" : ""} ${className ?? ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive && onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-gray-800">{title}</div>
          {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
