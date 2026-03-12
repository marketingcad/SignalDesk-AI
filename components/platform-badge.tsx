import { cn, getPlatformColor } from "@/lib/utils";
import type { Platform } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

interface PlatformBadgeProps {
  platform: Platform;
  size?: "sm" | "md";
}

const platformLabels: Record<Platform, string> = {
  Facebook: "FB",
  LinkedIn: "LI",
  Reddit: "RD",
  X: "X",
  Other: "Web",
};

export function PlatformBadge({ platform, size = "md" }: PlatformBadgeProps) {
  const color = getPlatformColor(platform);

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-semibold",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      )}
      style={{
        background: `${color}15`,
        color: color,
        borderColor: `${color}25`,
      }}
    >
      <div
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
      />
      {size === "sm" ? platformLabels[platform] : platform}
    </Badge>
  );
}
