"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
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
      <div className="relative z-10 w-full max-w-md">{children}</div>
    </div>
  );
}
