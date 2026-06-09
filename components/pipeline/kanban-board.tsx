"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Loader2, LayoutGrid } from "lucide-react";
import { Header } from "@/components/header";
import { KanbanColumn } from "@/components/pipeline/kanban-column";
import { KanbanCard } from "@/components/pipeline/kanban-card";
import { useRealtime } from "@/hooks/use-realtime";
import { PIPELINE_STAGES } from "@/lib/types";
import type { Lead, Platform, IntentLevel, LeadStatus, PipelineStage } from "@/lib/types";

const DEFAULT_STAGE: PipelineStage = "New Leads";

function normalizeStage(stage: unknown): PipelineStage {
  return (PIPELINE_STAGES as string[]).includes(stage as string)
    ? (stage as PipelineStage)
    : DEFAULT_STAGE;
}

// Map a raw realtime row into a Lead, mirroring app/(dashboard)/leads/page.tsx.
function mapRealtimeRow(row: Record<string, unknown>): Lead {
  return {
    id: row.id as string,
    platform: row.platform as Platform,
    source: row.source as string,
    username: row.username as string,
    text: row.text as string,
    url: row.url as string,
    intentScore: row.intent_score as number,
    intentLevel: row.intent_level as IntentLevel,
    intentCategory: row.intent_category as Lead["intentCategory"],
    status: row.status as LeadStatus,
    engagement: row.engagement as number,
    location: (row.location as string) || undefined,
    matchedKeywords: (row.matched_keywords as string[]) || [],
    createdAt: new Date(row.created_at as string),
    assignedTo: (row.assigned_to as string) || undefined,
    pipelineStage: normalizeStage(row.pipeline_stage),
    stagePosition: (row.stage_position as number) ?? 0,
  };
}

export function KanbanBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // Keep a ref to the latest leads for the realtime UPDATE handler and rollback.
  const leadsRef = useRef<Lead[]>([]);
  leadsRef.current = leads;

  // Card ids with an in-flight stage PATCH — used to ignore stale realtime
  // UPDATE echoes that would otherwise clobber a newer local optimistic drag.
  const pendingDrags = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchLeads = useCallback(() => {
    fetch("/api/pipeline")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.leads) {
          const mapped: Lead[] = data.leads.map((l: Lead) => ({
            ...l,
            createdAt: new Date(l.createdAt),
            pipelineStage: normalizeStage(l.pipelineStage),
            stagePosition: l.stagePosition ?? 0,
          }));
          setLeads(mapped);
        }
      })
      .catch((err) => console.error("[pipeline] Failed to fetch leads:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Group leads into columns, sorted ascending by stagePosition.
  const columns = useMemo(() => {
    const map: Record<PipelineStage, Lead[]> = {
      "New Leads": [],
      Engaged: [],
      "Proposal Sent": [],
      Won: [],
      Lost: [],
    };
    for (const lead of leads) {
      const stage = normalizeStage(lead.pipelineStage);
      map[stage].push(lead);
    }
    for (const stage of PIPELINE_STAGES) {
      map[stage].sort((a, b) => (a.stagePosition ?? 0) - (b.stagePosition ?? 0));
    }
    return map;
  }, [leads]);

  // Resolve which stage column a droppable/draggable id belongs to.
  const findStage = useCallback(
    (id: string): PipelineStage | null => {
      if ((PIPELINE_STAGES as string[]).includes(id)) return id as PipelineStage;
      const lead = leadsRef.current.find((l) => l.id === id);
      return lead ? normalizeStage(lead.pipelineStage) : null;
    },
    []
  );

  const persistStage = useCallback(
    async (id: string, pipelineStage: PipelineStage, stagePosition: number) => {
      pendingDrags.current.add(id);
      try {
        const res = await fetch(`/api/leads/${id}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipelineStage, stagePosition }),
        });
        if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      } catch (err) {
        console.error("[pipeline] Failed to persist stage, refetching:", err);
        fetchLeads();
      } finally {
        pendingDrags.current.delete(id);
      }
    },
    [fetchLeads]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leadsRef.current.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const sourceStage = findStage(activeId);
    const targetStage = findStage(overId);
    if (!sourceStage || !targetStage) return;

    const current = leadsRef.current;
    const activeLeadObj = current.find((l) => l.id === activeId);
    if (!activeLeadObj) return;

    // Build the target column ordered list (excluding the dragged card).
    const targetColumn = current
      .filter((l) => normalizeStage(l.pipelineStage) === targetStage && l.id !== activeId)
      .sort((a, b) => (a.stagePosition ?? 0) - (b.stagePosition ?? 0));

    // Determine insertion index within the target column.
    let insertIndex: number;
    if ((PIPELINE_STAGES as string[]).includes(overId)) {
      // Dropped onto the column area itself -> append to bottom.
      insertIndex = targetColumn.length;
    } else {
      const overIdx = targetColumn.findIndex((l) => l.id === overId);
      insertIndex = overIdx === -1 ? targetColumn.length : overIdx;
    }

    // No-op: dropped onto itself.
    if (overId === activeId) return;

    // Compute new stagePosition via the midpoint algorithm.
    const before = targetColumn[insertIndex - 1];
    const after = targetColumn[insertIndex];
    let newPos: number;
    if (targetColumn.length === 0) {
      newPos = 0; // empty column
    } else if (!before) {
      newPos = (after.stagePosition ?? 0) - 1; // top of column
    } else if (!after) {
      newPos = (before.stagePosition ?? 0) + 1; // bottom of column
    } else {
      newPos = ((before.stagePosition ?? 0) + (after.stagePosition ?? 0)) / 2; // between A and B
    }

    // Optimistic update.
    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeId
          ? { ...l, pipelineStage: targetStage, stagePosition: newPos }
          : l
      )
    );

    persistStage(activeId, targetStage, newPos);
  };

  // Realtime: INSERT -> new card into "New Leads", DELETE -> remove, UPDATE -> refresh card.
  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "INSERT",
    onInsert: (row) => {
      const lead = mapRealtimeRow(row);
      // New scraped leads land in "New Leads" by default.
      lead.pipelineStage = normalizeStage(row.pipeline_stage ?? DEFAULT_STAGE);
      setLeads((prev) =>
        prev.some((l) => l.id === lead.id) ? prev : [lead, ...prev]
      );
    },
  });

  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "DELETE",
    onDelete: (old) => {
      const id = old.id as string;
      setLeads((prev) => prev.filter((l) => l.id !== id));
    },
  });

  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "UPDATE",
    onUpdate: ({ new: row }) => {
      const updated = mapRealtimeRow(row);
      // Skip stale echoes while our own stage PATCH for this card is in flight;
      // the optimistic local state is newer than what the server has confirmed.
      if (pendingDrags.current.has(updated.id)) return;
      setLeads((prev) =>
        prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l))
      );
    },
  });

  return (
    <>
      <Header
        title="Pipeline"
        subtitle={`${leads.length} lead${leads.length === 1 ? "" : "s"} across the pipeline`}
      />
      <div className="flex h-[calc(100vh-4rem)] flex-col p-4 md:p-6">
        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground/70">Loading pipeline...</p>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
              <LayoutGrid className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="mb-1 text-sm font-medium text-foreground/70">No leads yet</p>
            <p className="text-xs text-muted-foreground">
              New leads will appear in the New Leads column.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full gap-4 overflow-x-auto pb-2">
              {PIPELINE_STAGES.map((stage) => (
                <KanbanColumn key={stage} stage={stage} leads={columns[stage]} />
              ))}
            </div>
            <DragOverlay>
              {activeLead ? (
                <div className="w-[280px] rotate-2 cursor-grabbing">
                  <KanbanCard lead={activeLead} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </>
  );
}
