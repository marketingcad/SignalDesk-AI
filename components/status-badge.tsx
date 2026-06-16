import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/lib/types";

const statusStyles: Record<LeadStatus, { bg: string; text: string; dot: string }> = {
  "New Leads": { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
  Engaged: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  "Proposal Sent": { bg: "bg-violet-500/10", text: "text-violet-400", dot: "bg-violet-500" },
  Won: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
  Lost: { bg: "bg-rose-500/10", text: "text-rose-400", dot: "bg-rose-500" },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  // Fall back gracefully for any legacy/unknown status value so the badge never crashes.
  const style = statusStyles[status] ?? statusStyles["New Leads"];

  return (
    <Badge variant="outline" className={cn("gap-1.5 text-xs font-medium border-transparent", style.bg, style.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {status}
    </Badge>
  );
}
