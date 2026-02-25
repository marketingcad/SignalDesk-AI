import { cn } from "@/lib/utils";
import { getIntentColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface IntentBadgeProps {
  score: number;
  showScore?: boolean;
  size?: "sm" | "md";
}

export function IntentBadge({ score, showScore = true, size = "md" }: IntentBadgeProps) {
  const { bg, text, border, label } = getIntentColor(score);

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 border font-semibold",
        bg,
        border,
        text,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      )}
    >
      <div
        className={cn(
          "rounded-full",
          size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2",
          score >= 80 ? "bg-emerald-400" : score >= 50 ? "bg-amber-400" : "bg-zinc-400"
        )}
      />
      {label}
      {showScore && (
        <span className="font-mono font-bold">{score}</span>
      )}
    </Badge>
  );
}
