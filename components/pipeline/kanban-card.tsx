"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  MapPin,
  Sparkles,
  MessageCircle,
  FileText,
  Trophy,
  XCircle,
  RotateCcw,
  ExternalLink,
  MoreHorizontal,
  Check,
  Copy,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { openUrl } from "@/lib/open-url";
import { cn, timeAgo } from "@/lib/utils";
import { PIPELINE_STAGES } from "@/lib/types";
import type { Lead, PipelineStage } from "@/lib/types";

// Small colored dot per stage for the "Move to" menu items.
const STAGE_DOT: Record<PipelineStage, string> = {
  "New Leads": "bg-blue-500",
  Engaged: "bg-amber-500",
  "Proposal Sent": "bg-violet-500",
  Won: "bg-emerald-500",
  Lost: "bg-rose-500",
};

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
  onDelete,
}: {
  lead: Lead;
  /** Move this lead to another stage (wired by the board to the persistence path). */
  onAdvance?: (toStage: PipelineStage) => void;
  /** Request deletion of this lead (board shows a confirmation). */
  onDelete?: () => void;
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
        "group cursor-grab touch-none rounded-lg border border-border bg-card p-3 shadow-sm transition-colors",
        "hover:border-primary/30 active:cursor-grabbing",
        isDragging && "opacity-50 ring-1 ring-primary/40"
      )}
      {...attributes}
      {...listeners}
    >
      {/* Header: avatar + username + actions menu */}
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
          {getInitials(lead.username)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{lead.username}</p>
          <p className="truncate text-[11px] text-muted-foreground">{lead.source}</p>
        </div>
        <div className="-mr-1 -mt-1">
          {/* 3-dots actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Card actions"
                onPointerDown={(e) => e.stopPropagation()}
                className="cursor-pointer rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Move to stage</DropdownMenuLabel>
              <DropdownMenuGroup>
                {PIPELINE_STAGES.map((s) => {
                  const isCurrent = s === stage;
                  return (
                    <DropdownMenuItem
                      key={s}
                      disabled={isCurrent}
                      onSelect={() => onAdvance?.(s)}
                    >
                      <span className={cn("h-2 w-2 rounded-full", STAGE_DOT[s])} />
                      <span className="flex-1">{s}</span>
                      {isCurrent && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>

              {lead.url && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => openUrl(lead.url)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    View post
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      navigator.clipboard?.writeText(lead.url);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </DropdownMenuItem>
                </>
              )}

              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete()}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete lead
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (lead.url) openUrl(lead.url);
                    }}
                    className="flex cursor-pointer items-center justify-center rounded-md border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdvance?.(action.to);
                  }}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors",
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
