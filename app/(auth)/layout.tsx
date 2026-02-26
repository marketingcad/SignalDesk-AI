"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import FloatingLines from "@/components/FloatingLines";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      {/* ── Fixed Navbar ── */}
      <nav className="animate-nav fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4 md:px-12 lg:px-20">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Signal<span className="text-primary">Desk</span>
            <span className="ml-2">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="size-3.5" />
              Home
            </Button>
          </Link>
        </div>
      </nav>

      {/* Background animation */}
      {mounted && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <FloatingLines
            linesGradient={
              isDark
                ? ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"]
                : ["#4338ca", "#4f46e5", "#6366f1", "#818cf8"]
            }
            enabledWaves={["top", "middle", "bottom"]}
            lineCount={[3, 4, 2]}
            lineDistance={[5, 3, 6]}
            topWavePosition={{ x: 10.0, y: 0.5, rotate: -0.4 }}
            middleWavePosition={{ x: 5.0, y: 0.0, rotate: 0.2 }}
            bottomWavePosition={{ x: 2.0, y: -0.7, rotate: -1 }}
            animationSpeed={0.4}
            interactive={true}
            bendRadius={4.0}
            bendStrength={-0.4}
            mouseDamping={0.04}
            parallax={true}
            parallaxStrength={0.1}
            mixBlendMode={isDark ? "screen" : "normal"}
            transparent={!isDark}
          />
        </div>
      )}

      {/* Content — centered with top padding to clear the fixed navbar */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-4 pt-20">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
