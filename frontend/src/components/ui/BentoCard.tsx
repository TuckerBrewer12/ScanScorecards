interface BentoCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  theme?: "light" | "glass" | "dark";
  onClick?: () => void;
}

export function BentoCard({
  title,
  subtitle,
  children,
  className,
  interactive,
  theme = "light",
  onClick,
}: BentoCardProps) {
  const baseClasses =
    "rounded-2xl shadow-sm p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md";

  const themeClasses = {
    light: "bg-white border border-gray-100 hover:shadow-gray-200/50",
    glass: "bg-white/70 backdrop-blur-xl border border-white/50 hover:shadow-gray-200/50 shadow-gray-200/40",
    dark: "bg-[#18191A] border border-[#2a2d30] hover:shadow-black/20 text-white shadow-black/10",
  }[theme];

  const titleColor = theme === "dark" ? "text-white" : "text-gray-800";
  const subtitleColor = theme === "dark" ? "text-gray-400" : "text-gray-400";

  return (
    <div
      className={`${baseClasses} ${themeClasses} ${interactive ? "cursor-pointer" : ""} ${className ?? ""}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {title && (
        <div className="mb-3 relative z-10">
          <div className={`text-sm font-semibold ${titleColor}`}>{title}</div>
          {subtitle && <div className={`text-xs ${subtitleColor} mt-0.5`}>{subtitle}</div>}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
