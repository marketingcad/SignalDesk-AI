"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MapPin } from "lucide-react";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { cn, timeAgo } from "@/lib/utils";
import type { Lead } from "@/lib/types";

function getInitials(name: string): string {
  return (name || "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Hide internal "ai:" / "task:" / "tool:" prefixed keywords like the leads list does.
function visibleKeywords(keywords: string[] | undefined): string[] {
  return (keywords ?? []).filter(
    (kw) => !kw.startsWith("ai:") && !kw.startsWith("task:") && !kw.startsWith("tool:")
  );
}

export function KanbanCard({ lead }: { lead: Lead }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id, data: { lead } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const keywords = visibleKeywords(lead.matchedKeywords);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 shadow-sm transition-colors",
        "hover:border-primary/30",
        isDragging && "opacity-50 ring-1 ring-primary/40"
      )}
    >
      {/* Header: avatar + username + drag handle */}
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
          {getInitials(lead.username)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{lead.username}</p>
          <p className="truncate text-[11px] text-muted-foreground">{lead.source}</p>
        </div>
        <button
          type="button"
          className="-mr-1 -mt-1 cursor-grab touch-none rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label="Drag lead"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      {/* Text snippet */}
      {lead.text && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-foreground/70">
          {lead.text}
        </p>
      )}

      {/* Badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PlatformBadge platform={lead.platform} size="sm" />
        <IntentBadge score={lead.intentScore} size="sm" />
      </div>

      {/* Matched keyword chips */}
      {keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {keywords.slice(0, 3).map((kw) => (
            <span
              key={kw}
              className="max-w-[120px] truncate rounded border border-primary/20 bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary"
            >
              {kw}
            </span>
          ))}
          {keywords.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{keywords.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer: time + location */}
      <div className="mt-2.5 flex items-center justify-between border-t border-border/60 pt-2">
        <span className="text-[11px] text-muted-foreground">{timeAgo(lead.createdAt)}</span>
        {lead.location && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="max-w-[120px] truncate">{lead.location}</span>
          </span>
        )}
      </div>
    </div>
  );
}
