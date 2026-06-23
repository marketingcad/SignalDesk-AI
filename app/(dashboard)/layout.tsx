"use client";

import { useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { AiAssistantPanel } from "@/components/ai-assistant-panel";
import { AskAiContext } from "@/components/ask-ai-context";
import { PageTransition } from "@/components/page-transition";
import { cn } from "@/lib/utils";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState(420);
  const pathname = usePathname();

  // Auto-close sidebar on route change (mobile)
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on window resize to desktop
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = () => {
      if (mq.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const toggleMobile = useCallback(() => setMobileOpen((v) => !v), []);
  const toggleAskAi = useCallback(() => setAskAiOpen((v) => !v), []);

  return (
    <div className="min-h-screen bg-background pb-[var(--desktop-statusbar-height,0px)]">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* AI Panel overlay backdrop */}
      {askAiOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
          onClick={() => setAskAiOpen(false)}
        />
      )}

      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onMobileToggle={toggleMobile}
      />

      <AiAssistantPanel
        open={askAiOpen}
        onClose={() => setAskAiOpen(false)}
        onWidthChange={setAiPanelWidth}
      />

      <AskAiContext.Provider value={{ askAiOpen, toggleAskAi }}>
        <main
          className={cn(
            "min-h-screen transition-all duration-300",
            collapsed ? "md:ml-[68px]" : "md:ml-[260px]",
            "ml-0"
          )}
          style={{
            marginRight: askAiOpen ? `${aiPanelWidth}px` : undefined,
          }}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </AskAiContext.Provider>
    </div>
  );
}
