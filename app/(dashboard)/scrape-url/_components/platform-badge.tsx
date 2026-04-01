"use client";

import { cn } from "@/lib/utils";
import { PLATFORM_META } from "./shared";

export function PlatformBadge({ platform }: { platform: string | null }) {
  const meta = platform ? PLATFORM_META[platform] : null;
  if (!meta || !platform) return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0",
      meta.bg, meta.border, meta.color
    )}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {platform}
    </span>
  );
}
