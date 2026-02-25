"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { PageTransition } from "@/components/page-transition";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main
        className={cn(
          "min-h-screen transition-all duration-300",
          collapsed ? "ml-[68px]" : "ml-[260px]"
        )}
      >
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
