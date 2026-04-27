import type { User } from "@/types/golf";

interface ProfileHeroBannerProps {
  user: User | null;
  handicapIndex: number | null;
}

function formatHI(hi: number | null | undefined): string {
  if (hi == null) return "—";
  if (hi < 0) return `+${Math.abs(hi).toFixed(1)}`;
  return hi.toFixed(1);
}

export function ProfileHeroBanner({ user, handicapIndex }: ProfileHeroBannerProps) {
  const firstName = user?.name ? user.name.split(" ")[0] : "Golfer";
  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "G";



  return (
    <div className="relative overflow-hidden rounded-3xl bg-white border border-gray-200 p-6 md:p-8 shadow-sm">
      {/* Very subtle background pattern or gradient */}
      <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-gray-50/50 to-white/50"></div>

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center shadow-sm">
            <span className="text-xl font-bold text-gray-700 tracking-widest">{initials}</span>
          </div>
          <div>
            <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">
              Welcome back
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight">
              Hello, {firstName}
            </h1>
          </div>
        </div>

        {handicapIndex != null && (
          <div className="flex flex-col items-start bg-gray-50 border border-gray-100 rounded-2xl p-4 min-w-[140px]">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              Handicap
            </div>
            <div className="text-3xl font-black text-gray-900 leading-none flex items-baseline gap-1">
              {formatHI(handicapIndex)}
              <span className="text-sm font-semibold text-gray-400 tracking-wide">HCP</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
