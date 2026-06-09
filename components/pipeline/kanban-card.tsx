"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  MapPin,
  Sparkles,
  MessageCircle,
  FileText,
  Trophy,
  XCircle,
  RotateCcw,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { openUrl } from "@/lib/open-url";
import { cn, timeAgo } from "@/lib/utils";
import type { Lead, PipelineStage } from "@/lib/types";

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

// ---------------------------------------------------------------------------
// Recommended next actions per pipeline stage (GoHighLevel-style quick actions).
// "advance" actions move the lead to the suggested next stage; "view" opens the
// original post. The board wires `onAdvance` to the same persistence path used
// by drag-and-drop.
// ---------------------------------------------------------------------------

type CardAction =
  | { kind: "advance"; label: string; to: PipelineStage; icon: LucideIcon; tone: "primary" | "danger" | "neutral" }
  | { kind: "view"; label: string; icon: LucideIcon };

const STAGE_ACTIONS: Record<PipelineStage, CardAction[]> = {
  "New Leads": [
    { kind: "advance", label: "Engage", to: "Engaged", icon: MessageCircle, tone: "primary" },
    { kind: "view", label: "View post", icon: ExternalLink },
  ],
  Engaged: [
    { kind: "advance", label: "Send proposal", to: "Proposal Sent", icon: FileText, tone: "primary" },
    { kind: "view", label: "View post", icon: ExternalLink },
  ],
  "Proposal Sent": [
    { kind: "advance", label: "Mark won", to: "Won", icon: Trophy, tone: "primary" },
    { kind: "advance", label: "Lost", to: "Lost", icon: XCircle, tone: "danger" },
  ],
  Won: [
    { kind: "view", label: "View post", icon: ExternalLink },
  ],
  Lost: [
    { kind: "advance", label: "Reopen", to: "New Leads", icon: RotateCcw, tone: "neutral" },
    { kind: "view", label: "View post", icon: ExternalLink },
  ],
};

export function KanbanCard({
  lead,
  onAdvance,
}: {
  lead: Lead;
  /** Move this lead to another stage (wired by the board to the persistence path). */
  onAdvance?: (toStage: PipelineStage) => void;
}) {
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
  const stage: PipelineStage = (STAGE_ACTIONS[lead.pipelineStage as PipelineStage]
    ? (lead.pipelineStage as PipelineStage)
    : "New Leads");
  // Drop the "View post" action when there's no URL to open.
  const actions = STAGE_ACTIONS[stage].filter((a) => a.kind !== "view" || !!lead.url);

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

      {/* Recommended actions */}
      {actions.length > 0 && (
        <div className="mt-2.5 border-t border-border/60 pt-2.5">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
            <Sparkles className="h-3 w-3" />
            Suggested
          </div>
          <div className="flex items-center gap-1.5">
            {actions.map((action, i) => {
              const Icon = action.icon;
              if (action.kind === "view") {
                return (
                  <button
                    key={i}
                    type="button"
                    aria-label="View original post"
                    title="View original post"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (lead.url) openUrl(lead.url);
                    }}
                    className="flex items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance?.(action.to);
                  }}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
                    action.tone === "primary" && "bg-primary/10 text-primary hover:bg-primary/20",
                    action.tone === "danger" && "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
                    action.tone === "neutral" && "bg-muted text-foreground/80 hover:bg-muted/70"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
