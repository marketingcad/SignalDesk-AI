"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Zap, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { HeroBackground } from "@/components/hero-background";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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

      {/* Background animation — slightly calmer behind the auth form */}
      {mounted && (
        <div className="absolute inset-0 z-0">
          <HeroBackground density={0.85} intensity={0.9} speed={0.9} pingMs={2200} />
        </div>
      )}

      {/* Content — centered with top padding to clear the fixed navbar */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-4 pt-20">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
