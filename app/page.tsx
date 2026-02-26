"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ArrowRight, Zap, Shield, BarChart3, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import FloatingLines from "@/components/FloatingLines";

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* ── Navbar ── */}
      <nav className="animate-nav relative z-20 flex items-center justify-between px-6 py-4 md:px-12 lg:px-20">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Zap className="size-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Signal<span className="text-primary">Desk</span><span className="ml-2">AI</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <Button size="sm" className="gap-1.5">
              Sign In
              <ArrowRight className="size-3.5" />
            </Button>
          </Link>
        </div>
      </nav>

      {/* ── Background: FloatingLines animation ── */}
      {mounted && (
        <div className="pointer-events-none absolute inset-0 z-0">
          <FloatingLines
            linesGradient={
              isDark
                ? ["#6366f1", "#818cf8", "#a5b4fc", "#c7d2fe"]
                : ["#4338ca", "#4f46e5", "#6366f1", "#818cf8"]
            }
            enabledWaves={["top", "middle", "bottom"]}
            lineCount={[4, 6, 3]}
            lineDistance={[6, 4, 8]}
            topWavePosition={{ x: 10.0, y: 0.5, rotate: -0.4 }}
            middleWavePosition={{ x: 5.0, y: 0.0, rotate: 0.2 }}
            bottomWavePosition={{ x: 2.0, y: -0.7, rotate: -1 }}
            animationSpeed={0.6}
            interactive={true}
            bendRadius={4.0}
            bendStrength={-0.4}
            mouseDamping={0.04}
            parallax={true}
            parallaxStrength={0.15}
            mixBlendMode={isDark ? "screen" : "normal"}
            transparent={!isDark}
          />
        </div>
      )}

      {/* ── Dark-mode readability overlay ── */}
      <div className="pointer-events-none absolute inset-0 z-[5] hidden bg-radial-[ellipse_80%_60%_at_50%_40%] from-background/70 via-background/30 to-transparent dark:block" />

      {/* ── Hero ── */}
      <section className="relative z-10 flex flex-col items-center px-6 pt-24 pb-32 text-center md:pt-32 md:pb-40 lg:pt-40 lg:pb-48">
        {/* Badge */}
        <div className="animate-hero delay-0 mb-8 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm text-primary backdrop-blur-sm dark:bg-primary/10 dark:backdrop-blur-md">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Internal Lead Intelligence Platform
        </div>

        {/* Headline */}
        <h1 className="animate-hero delay-1 max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl dark:[text-shadow:_0_2px_20px_rgb(0_0_0_/_50%)]">
          Your team&apos;s{" "}
          <span className="bg-linear-to-r from-primary via-brand-400 to-brand-300 bg-clip-text text-transparent dark:from-brand-300 dark:via-brand-200 dark:to-brand-100">
            lead intelligence
          </span>{" "}
          hub
        </h1>

        {/* Subheadline */}
        <p className="animate-hero delay-2 mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl dark:text-foreground/80 dark:[text-shadow:_0_1px_12px_rgb(0_0_0_/_40%)]">
          SignalDesk AI monitors social platforms in real-time, surfacing
          high-intent hiring signals so our team can engage prospects at the
          perfect moment.
        </p>

        {/* CTA */}
        <div className="animate-hero delay-3 mt-10">
          <Link href="/login">
            <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base font-medium shadow-lg shadow-primary/20">
              Get Started
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="animate-hero delay-4 mt-16 flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
          {[
            { value: "2,400+", label: "Leads Detected" },
            { value: "87%", label: "Intent Accuracy" },
            { value: "3.2×", label: "Faster Response" },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-3">
              <div className="text-2xl font-bold tracking-tight dark:[text-shadow:_0_1px_8px_rgb(0_0_0_/_40%)]">{stat.value}</div>
              <div className="text-sm text-muted-foreground dark:text-foreground/70">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Feature cards ── */}
        <div className="mt-24 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Globe,
              title: "Multi-Platform",
              desc: "Track Facebook, LinkedIn, Reddit & X from a single dashboard",
            },
            {
              icon: Zap,
              title: "Real-Time Alerts",
              desc: "Get notified instantly when high-intent signals are detected",
            },
            {
              icon: BarChart3,
              title: "Intent Scoring",
              desc: "AI-ranked leads so the team focuses on the hottest prospects",
            },
            {
              icon: Shield,
              title: "Smart Filtering",
              desc: "Automated noise reduction for cleaner, actionable signals",
            },
          ].map((feature, i) => (
            <div
              key={feature.title}
              className={`animate-hero delay-${i + 5} group relative rounded-2xl border border-border/50 bg-card/50 p-6 text-left backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5 dark:bg-card/60 dark:backdrop-blur-md`}
            >
              <div className="mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <feature.icon className="size-5" />
              </div>
              <h3 className="mb-1.5 text-sm font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer line ── */}
      <footer className="relative z-10 border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} SignalDesk AI. Internal use only.
      </footer>
    </div>
  );
}
