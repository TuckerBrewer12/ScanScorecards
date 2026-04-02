import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      {/* md:ml-64 — no left offset on mobile (sidebar hidden) */}
      {/* pb-20 md:pb-6 — clearance for bottom nav on mobile */}
      <main className="md:ml-64 p-4 pt-16 pb-20 md:p-6 md:pt-16 md:pb-6">{children}</main>
      <BottomNav />
    </div>
  );
}
