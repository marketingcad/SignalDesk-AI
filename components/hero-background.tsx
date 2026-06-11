"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

/**
 * HeroBackground — a dependency-free animated backdrop.
 *
 * Two layers:
 *  1. Slow-drifting aurora gradient orbs (CSS keyframes in globals.css).
 *  2. A live "signal network" rendered on a 2D canvas — drifting nodes,
 *     proximity links, periodic radar "pings", and mouse interactivity.
 *
 * Thematically this maps to SignalDesk's job: detecting signals and the
 * connections between them across platforms. Respects prefers-reduced-motion
 * and caps DPR for performance.
 *
 * Tunables let the same component read as "vivid" on the landing hero and a
 * touch calmer behind the login form.
 */
type Node = { x: number; y: number; vx: number; vy: number; r: number };
type Ping = { x: number; y: number; r: number; life: number };

type Props = {
  /** Node-count multiplier (1 = default). */
  density?: number;
  /** Opacity multiplier for lines/dots/pings (1 = default). */
  intensity?: number;
  /** Drift-speed multiplier (1 = default). */
  speed?: number;
  /** Milliseconds between radar pings. */
  pingMs?: number;
  /** Strength of the center readability vignette: 0 = none, 1 = default. */
  vignette?: number;
};

export function HeroBackground({
  density = 1,
  intensity = 1,
  speed = 1,
  pingMs = 1600,
  vignette = 1,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const isDark =
      resolvedTheme === "dark" ||
      (!resolvedTheme && document.documentElement.classList.contains("dark"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Palette (indigo / brand) tuned per theme
    const C = isDark
      ? { line: [129, 140, 248], dot: [165, 180, 252], ping: [199, 210, 254] }
      : { line: [79, 70, 229], dot: [67, 56, 202], ping: [99, 102, 241] };
    const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, a)})`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let nodes: Node[] = [];
    const pings: Ping[] = [];
    const mouse = { x: -9999, y: -9999, active: false };

    const LINK_DIST = 142;
    const MOUSE_DIST = 190;

    const initNodes = () => {
      const base = Math.round((width * height) / 16000) * density;
      const count = Math.min(120, Math.max(30, base));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.32 * speed,
        vy: (Math.random() - 0.5) * 0.32 * speed,
        r: Math.random() * 1.7 + 0.9,
      }));
    };

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    };

    let raf = 0;
    let last = -99999;

    const frame = (t: number) => {
      ctx.clearRect(0, 0, width, height);

      // Update positions
      for (const n of nodes) {
        if (!reduce) {
          n.x += n.vx;
          n.y += n.vy;
        }
        if (n.x < -24) n.x = width + 24;
        else if (n.x > width + 24) n.x = -24;
        if (n.y < -24) n.y = height + 24;
        else if (n.y > height + 24) n.y = -24;

        // Gentle push away from the cursor
        if (mouse.active) {
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          const R = 160;
          if (d2 < R * R && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / R) * 0.9;
            n.x += (dx / d) * f;
            n.y += (dy / d) * f;
          }
        }
      }

      // Proximity links
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < LINK_DIST) {
            ctx.strokeStyle = rgba(C.line, (1 - d / LINK_DIST) * 0.6 * intensity);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Links to the cursor
      if (mouse.active) {
        for (const n of nodes) {
          const d = Math.hypot(n.x - mouse.x, n.y - mouse.y);
          if (d < MOUSE_DIST) {
            ctx.strokeStyle = rgba(C.line, (1 - d / MOUSE_DIST) * 0.95 * intensity);
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // Spawn a radar ping from a random node on the configured cadence
      if (!reduce && t - last > pingMs && nodes.length) {
        last = t;
        const src = nodes[(Math.random() * nodes.length) | 0];
        pings.push({ x: src.x, y: src.y, r: 0, life: 1 });
      }
      for (let i = pings.length - 1; i >= 0; i--) {
        const p = pings[i];
        p.r += 1.1;
        p.life -= 0.012;
        if (p.life <= 0) {
          pings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = rgba(C.ping, p.life * 0.7 * intensity);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Nodes
      for (const n of nodes) {
        ctx.fillStyle = rgba(C.dot, 0.92 * intensity);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    // Pointer interaction (canvas is pointer-events-none, so listen on window)
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mouse.x = x;
      mouse.y = y;
      mouse.active = x >= 0 && x <= width && y >= 0 && y <= height;
    };
    const onDown = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && x <= width && y >= 0 && y <= height) {
        pings.push({ x, y, r: 0, life: 1 });
      }
    };
    const onLeave = () => { mouse.active = false; };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("blur", onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("blur", onLeave);
    };
  }, [resolvedTheme, density, intensity, speed, pingMs]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Aurora gradient orbs */}
      <div
        data-aurora
        className="absolute -left-[10%] -top-[20%] size-[55vw] rounded-full opacity-70 blur-3xl dark:opacity-50"
        style={{
          background: "radial-gradient(circle at center, var(--color-brand-500), transparent 65%)",
          animation: "aurora-a 22s ease-in-out infinite",
        }}
      />
      <div
        data-aurora
        className="absolute right-[-15%] top-[-10%] size-[50vw] rounded-full opacity-60 blur-3xl dark:opacity-40"
        style={{
          background: "radial-gradient(circle at center, var(--color-brand-400), transparent 65%)",
          animation: "aurora-b 28s ease-in-out infinite",
        }}
      />
      <div
        data-aurora
        className="absolute bottom-[-25%] left-1/3 size-[45vw] rounded-full opacity-50 blur-3xl dark:opacity-30"
        style={{
          background: "radial-gradient(circle at center, var(--color-brand-300), transparent 65%)",
          animation: "aurora-c 26s ease-in-out infinite",
        }}
      />

      {/* Signal network */}
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />

      {/* Readability vignette */}
      {vignette > 0 && (
        <div
          className="absolute inset-0 bg-radial-[ellipse_75%_60%_at_50%_42%] from-background/60 via-background/20 to-transparent dark:from-background/75 dark:via-background/35"
          style={{ opacity: vignette }}
        />
      )}
    </div>
  );
}
