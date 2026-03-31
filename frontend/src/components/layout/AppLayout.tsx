import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <Sidebar />
      {/* pt-20 compensates for the fixed PageHeader bar height */}
      <main className="ml-64 p-6 pt-16">{children}</main>
    </div>
  );
}
