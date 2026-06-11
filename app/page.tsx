"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight, Zap, Shield, BarChart3, Globe, Bell, Filter,
  CalendarClock, Sparkles, Bookmark, Radar, Send, ChevronDown,
  ArrowUp, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

// Lightweight, dependency-free animated hero backdrop (canvas + CSS aurora).
// Code-split so it never blocks the landing page's initial paint.
const HeroBackground = dynamic(() => import("@/components/hero-background").then((m) => m.HeroBackground), { ssr: false });

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#faq", label: "FAQ" },
];

const PLATFORMS = [
  { name: "Facebook", color: "#1877F2" },
  { name: "LinkedIn", color: "#0A66C2" },
  { name: "Reddit", color: "#FF4500" },
  { name: "X", color: "#a1a1aa" },
];

const FEATURES = [
  { icon: Globe, title: "Multi-Platform", desc: "Track Facebook, LinkedIn, Reddit & X from a single unified dashboard." },
  { icon: Bell, title: "Real-Time Alerts", desc: "Get notified the instant a high-intent buying signal is detected." },
  { icon: BarChart3, title: "Intent Scoring", desc: "AI ranks every lead so the team focuses on the hottest prospects first." },
  { icon: Filter, title: "Smart Filtering", desc: "Automated noise reduction surfaces only clean, actionable signals." },
  { icon: CalendarClock, title: "Scheduled Scraping", desc: "Set recurring scrapes on any cadence and let the pipeline fill itself." },
  { icon: Shield, title: "Secure by Design", desc: "Row-level security and session isolation keep your data locked down." },
];

const STEPS = [
  { icon: Bookmark, title: "Add your targets", desc: "Save groups, profiles, subreddits and pages as bookmarks or recurring schedules." },
  { icon: Radar, title: "Automated scraping", desc: "Cloud Playwright scrapers pull fresh posts on the cadence you choose." },
  { icon: Sparkles, title: "AI intent scoring", desc: "Every post is ranked by buying-intent signals while noise is filtered out." },
  { icon: Send, title: "Engage at the right moment", desc: "Work a prioritized pipeline of hot leads backed by real-time alerts." },
];

const STATS = [
  { value: "2,400+", label: "Leads Detected" },
  { value: "87%", label: "Intent Accuracy" },
  { value: "3.2×", label: "Faster Response" },
  { value: "4", label: "Platforms Monitored" },
];

const FAQS = [
  { q: "Which platforms does SignalDesk AI monitor?", a: "Out of the box we track Facebook groups & pages, LinkedIn posts, Reddit subreddits and X profiles — plus any generic URL through the universal scraper." },
  { q: "How does intent scoring work?", a: "Each scraped post is run through a scoring engine that matches buying-intent keywords and filters out job-seekers and self-promotion, then ranks the remaining leads so the highest-intent prospects rise to the top." },
  { q: "How often does it scrape?", a: "You decide. Create schedules on any cron cadence — every 15 minutes, hourly, daily, or a custom expression. Built-in rate limiting keeps each platform safe from throttling." },
  { q: "Is my data secure?", a: "Yes. Sessions are isolated, schedules and leads are protected with row-level security in Supabase, and scraping runs server-side so credentials never touch the browser." },
  { q: "Can I export the leads I find?", a: "Absolutely — leads and run history can be exported to CSV from the dashboard for use in your CRM or outreach tooling." },
];

// ── Scroll-reveal wrapper ──────────────────────────────────────
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setShown(true); io.disconnect(); }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(28px)",
        transition: `opacity .7s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .7s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── FAQ accordion item ─────────────────────────────────────────
function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn(
      "rounded-2xl border bg-card/60 backdrop-blur-sm transition-colors",
      open ? "border-primary/30" : "border-border/60 hover:border-border"
    )}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-foreground sm:text-base">{q}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300", open && "rotate-180 text-primary")} />
      </button>
      <div className={cn("grid transition-all duration-300 ease-out", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [year, setYear] = useState(2026);

  useEffect(() => {
    // Smooth in-page anchor scrolling, scoped to this page
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = "smooth";

    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      setShowTop(window.scrollY > 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Defer initial sync state out of the effect body (avoids cascading renders)
    const raf = requestAnimationFrame(() => {
      setMounted(true);
      setYear(new Date().getFullYear());
      onScroll();
    });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      html.style.scrollBehavior = prev;
    };
  }, []);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="relative min-h-screen bg-background">
      {/* ── Sticky Navbar ── */}
      <nav className={cn(
        "animate-nav sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
          : "border-b border-transparent"
      )}>
        <div className="flex items-center justify-between px-6 py-3.5 md:px-12 lg:px-20">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary shadow-sm shadow-primary/30">
              <Zap className="size-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              Signal<span className="text-primary">Desk</span><span className="ml-2">AI</span>
            </span>
          </Link>

          {/* Center links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login">
              <Button size="sm" className="gap-1.5">
                Sign In
                <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero (animated signal-network backdrop confined here) ── */}
      <section className="relative overflow-hidden">
        {mounted && <HeroBackground />}

        <div className="relative z-10 flex flex-col items-center px-6 pt-20 pb-28 text-center md:pt-28 md:pb-36 lg:pt-32 lg:pb-44">
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

          {/* CTAs */}
          <div className="animate-hero delay-3 mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Link href="/login">
              <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base font-medium shadow-lg shadow-primary/20">
                Get Started
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <a href="#how">
              <Button variant="outline" size="lg" className="h-12 gap-2 rounded-xl px-7 text-base font-medium bg-background/40 backdrop-blur-sm">
                See how it works
              </Button>
            </a>
          </div>

          {/* Stats */}
          <div className="animate-hero delay-4 mt-16 flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
            {STATS.slice(0, 3).map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="text-2xl font-bold tracking-tight dark:[text-shadow:_0_1px_8px_rgb(0_0_0_/_40%)]">{stat.value}</div>
                <div className="text-sm text-muted-foreground dark:text-foreground/70">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platforms strip ── */}
      <section className="relative z-10 border-y border-border/50 bg-card/30 py-8 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-6">
          <Reveal className="flex flex-col items-center gap-5 sm:flex-row sm:justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Monitoring signals across
            </span>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {PLATFORMS.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium"
                  style={{ borderColor: `${p.color}33`, background: `${p.color}10`, color: p.color }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium text-muted-foreground">
                <Globe className="size-3.5" />
                + Any URL
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative z-10 scroll-mt-24 px-6 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto mb-14 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">Capabilities</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Everything you need to catch a lead first</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              From discovery to engagement, SignalDesk AI handles the heavy lifting so your team can focus on conversations that convert.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, i) => (
              <Reveal key={feature.title} delay={(i % 3) * 80}>
                <div className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-6 text-left backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-card/80 hover:shadow-lg hover:shadow-primary/5">
                  <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
                  <div className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 transition-colors group-hover:bg-primary/15">
                    <feature.icon className="size-5" />
                  </div>
                  <h3 className="mb-1.5 text-base font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="relative z-10 scroll-mt-24 border-t border-border/50 bg-card/20 px-6 py-24 md:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">How it works</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From raw URL to ready-to-engage lead</h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Four steps, fully automated. Set it once and let the signal come to you.
            </p>
          </Reveal>

          <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Connecting line (desktop) */}
            <div className="pointer-events-none absolute left-0 right-0 top-7 hidden h-px bg-linear-to-r from-transparent via-border to-transparent lg:block" />
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 90} className="relative">
                <div className="flex h-full flex-col items-center text-center lg:items-start lg:text-left">
                  <div className="relative z-10 mb-5 flex size-14 items-center justify-center rounded-2xl border border-primary/20 bg-background shadow-sm">
                    <step.icon className="size-6 text-primary" />
                    <span className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Impact / stats band ── */}
      <section className="relative z-10 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-linear-to-br from-primary/10 via-primary/5 to-transparent p-10 md:p-14">
              <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative grid grid-cols-2 gap-8 lg:grid-cols-4">
                {STATS.map((stat) => (
                  <div key={stat.label} className="text-center lg:text-left">
                    <div className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{stat.value}</div>
                    <div className="mt-1.5 text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-10 scroll-mt-24 px-6 py-24 md:py-28">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-12 text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-primary">FAQ</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          </Reveal>
          <Reveal className="space-y-3">
            {FAQS.map((f, i) => (
              <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(openFaq === i ? null : i)} />
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative z-10 px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/60 p-10 text-center backdrop-blur-sm md:p-16">
              <div className="pointer-events-none absolute inset-0 bg-radial-[ellipse_60%_80%_at_50%_0%] from-primary/15 to-transparent" />
              <div className="relative">
                <div className="mx-auto mb-6 inline-flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  <Sparkles className="size-6" />
                </div>
                <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                  Ready to catch your next high-intent lead?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
                  Sign in to the dashboard and start surfacing buying signals across every platform your prospects are talking on.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link href="/login">
                    <Button size="lg" className="h-12 gap-2 rounded-xl px-8 text-base font-medium shadow-lg shadow-primary/20">
                      Get Started
                      <ArrowRight className="size-4" />
                    </Button>
                  </Link>
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Lock className="size-3.5" />
                    Internal access only
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-border/50 bg-card/20">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
            <div className="max-w-xs">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
                  <Zap className="size-5 text-primary-foreground" />
                </div>
                <span className="text-lg font-semibold tracking-tight">
                  Signal<span className="text-primary">Desk</span><span className="ml-2">AI</span>
                </span>
              </Link>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Real-time buying-intent detection that surfaces high-intent hiring signals across social platforms.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-10 sm:gap-16">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">Platform</p>
                <ul className="space-y-2.5 text-sm">
                  {NAV_LINKS.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} className="text-muted-foreground transition-colors hover:text-foreground">{l.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-foreground">Account</p>
                <ul className="space-y-2.5 text-sm">
                  <li><Link href="/login" className="text-muted-foreground transition-colors hover:text-foreground">Sign In</Link></li>
                  <li><Link href="/dashboard" className="text-muted-foreground transition-colors hover:text-foreground">Dashboard</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-center gap-2 border-t border-border/50 pt-6 sm:flex-row sm:justify-between">
            <p className="text-sm text-muted-foreground">&copy; {year} SignalDesk AI. Internal use only.</p>
            <p className="text-xs text-muted-foreground/70">Built for the team, by the team.</p>
          </div>
        </div>
      </footer>

      {/* ── Scroll to top ── */}
      <button
        onClick={scrollTop}
        aria-label="Scroll to top"
        className={cn(
          "fixed bottom-6 right-6 z-50 flex size-11 items-center justify-center rounded-full border border-border bg-card/80 text-foreground shadow-lg backdrop-blur-md transition-all duration-300 hover:border-primary/40 hover:text-primary",
          showTop ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}
