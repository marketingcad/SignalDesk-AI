import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/lib/types";

const statusStyles: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  New: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
  Contacted: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  Qualified: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
  Dismissed: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const style = statusStyles[status];

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-xs font-medium border-transparent", style.bg, style.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {status}
    </Badge>
  );
}
