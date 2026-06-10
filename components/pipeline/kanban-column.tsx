"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Inbox } from "lucide-react";
import { KanbanCard } from "@/components/pipeline/kanban-card";
import { cn } from "@/lib/utils";
import type { Lead, PipelineStage } from "@/lib/types";

// Distinct tailwind accent per stage (consistent with status-badge.tsx convention).
const stageAccents: Record<
  PipelineStage,
  { dot: string; text: string; headerBg: string; count: string; ring: string }
> = {
  "New Leads": {
    dot: "bg-blue-500",
    text: "text-blue-400",
    headerBg: "bg-blue-500/10",
    count: "bg-blue-500/15 text-blue-400",
    ring: "ring-blue-500/40",
  },
  Engaged: {
    dot: "bg-amber-500",
    text: "text-amber-400",
    headerBg: "bg-amber-500/10",
    count: "bg-amber-500/15 text-amber-400",
    ring: "ring-amber-500/40",
  },
  "Proposal Sent": {
    dot: "bg-violet-500",
    text: "text-violet-400",
    headerBg: "bg-violet-500/10",
    count: "bg-violet-500/15 text-violet-400",
    ring: "ring-violet-500/40",
  },
  Won: {
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    headerBg: "bg-emerald-500/10",
    count: "bg-emerald-500/15 text-emerald-400",
    ring: "ring-emerald-500/40",
  },
  Lost: {
    dot: "bg-rose-500",
    text: "text-rose-400",
    headerBg: "bg-rose-500/10",
    count: "bg-rose-500/15 text-rose-400",
    ring: "ring-rose-500/40",
  },
};

export function KanbanColumn({
  stage,
  leads,
  onAdvance,
  onDelete,
}: {
  stage: PipelineStage;
  leads: Lead[];
  /** Advance a lead to another stage (recommended-action quick buttons). */
  onAdvance?: (id: string, toStage: PipelineStage) => void;
  /** Request deletion of a lead (board shows a confirmation). */
  onDelete?: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { stage, type: "column" },
  });

  const accent = stageAccents[stage] ?? stageAccents["New Leads"];
  const ids = leads.map((l) => l.id);

  return (
    <div className="flex h-full w-[300px] min-w-[300px] flex-col rounded-xl border border-border bg-card/40">
      {/* Column header */}
      <div
        className={cn(
          "flex items-center justify-between rounded-t-xl border-b border-border px-3 py-2.5",
          accent.headerBg
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
          <span className={cn("text-sm font-semibold", accent.text)}>{stage}</span>
        </div>
        <span
          className={cn(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
            accent.count
          )}
        >
          {leads.length}
        </span>
      </div>

      {/* Droppable card list */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2.5 overflow-y-auto p-2.5 transition-colors",
          isOver && cn("ring-2 ring-inset", accent.ring)
        )}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              onAdvance={onAdvance ? (toStage) => onAdvance(lead.id, toStage) : undefined}
              onDelete={onDelete ? () => onDelete(lead.id) : undefined}
            />
          ))}
        </SortableContext>

        {leads.length === 0 && (
          <div className="flex h-full min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8 text-center">
            <Inbox className="mb-2 h-6 w-6 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/70">Drop leads here</p>
          </div>
        )}
      </div>
    </div>
  );
}
