"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Zap } from "lucide-react";

interface AuthTransitionProps {
  type: "login" | "logout";
  onComplete?: () => void;
  duration?: number;
}

export function AuthTransition({
  type,
  onComplete,
  duration = 1800,
}: AuthTransitionProps) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, duration - 500);

    const completeTimer = setTimeout(() => {
      onCompleteRef.current?.();
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration]);

  if (typeof window === "undefined") return null;

  const label = type === "login" ? "Signing you in..." : "Signing out...";
  const sublabel =
    type === "login" ? "Preparing your dashboard" : "See you next time";

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--background)",
        animation:
          phase === "enter"
            ? "auth-overlay-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards"
            : "auth-overlay-out 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
      }}
    >
      {/* Animated background glow */}
      <div className="auth-transition-glow" />

      {/* Content */}
      <div className="auth-transition-content">
        {/* Logo with pulse */}
        <div className="auth-transition-logo">
          <div className="auth-transition-logo-ring" />
          <div className="auth-transition-logo-icon">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>

        {/* App name */}
        <div className="auth-transition-title">
          <span className="text-xl font-semibold text-foreground">
            SignalDesk
          </span>
          <span className="text-xs font-semibold text-primary ml-1">AI</span>
        </div>

        {/* Status text */}
        <p className="auth-transition-label">{label}</p>
        <p className="auth-transition-sublabel">{sublabel}</p>

        {/* Progress bar */}
        <div className="auth-transition-bar-track">
          <div
            className="auth-transition-bar-fill"
            style={{ animationDuration: `${duration - 400}ms` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
