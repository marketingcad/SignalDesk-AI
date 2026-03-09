"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/header";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { timeAgo, cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import type { Lead, Platform, IntentLevel, LeadStatus } from "@/lib/types";
import {
  Search,
  Download,
  ExternalLink,
  UserPlus,
  XCircle,
  ChevronDown,
  Trash2,
  MapPin,
  TrendingUp,
  User,
  Tag,
  Clock,
  MousePointerClick,
  Quote,
  AlertTriangle,
  X,
  LayoutGrid,
  LayoutList,
} from "lucide-react";

type FilterPlatform = Platform | "All";
type FilterIntent = IntentLevel | "All";
type FilterStatus = LeadStatus | "All";

export default function LeadsPage() {
  const [viewMode, setViewMode] = useState<"table" | "card">("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<FilterPlatform>("All");
  const [intentFilter, setIntentFilter] = useState<FilterIntent>("All");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("All");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionOpen, setActionOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  // Close action dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (actionRef.current && !actionRef.current.contains(e.target as Node)) {
        setActionOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(60); // percentage
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(80, Math.max(30, pct)));
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const startDragging = () => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const updateStatus = async (id: string, status: LeadStatus) => {
    setFilteredLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status } : l))
    );
    if (selectedLead?.id === id) {
      setSelectedLead((prev) => (prev ? { ...prev, status } : prev));
    }
    try {
      await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    } catch {
      // optimistic update already applied
    }
  };

  const handleDeleteLead = (id: string) => {
    setConfirmModal({
      title: "Delete Lead",
      message: "Are you sure you want to delete this lead? This action cannot be undone.",
      onConfirm: async () => {
        setFilteredLeads((prev) => prev.filter((l) => l.id !== id));
        if (selectedLead?.id === id) setSelectedLead(null);
        setConfirmModal(null);
        try {
          await fetch(`/api/leads/${id}`, { method: "DELETE" });
        } catch {
          // optimistic update already applied
        }
      },
    });
  };

  const handleDeleteAll = () => {
    setConfirmModal({
      title: "Delete All Leads",
      message: `Are you sure you want to delete all ${filteredLeads.length} leads? This action cannot be undone.`,
      onConfirm: async () => {
        setFilteredLeads([]);
        setSelectedLead(null);
        setConfirmModal(null);
        try {
          await fetch("/api/leads", { method: "DELETE" });
        } catch {
          // optimistic update already applied
        }
      },
    });
  };

  const handleExport = () => {
    const headers = ["Username", "Platform", "Source", "Intent Score", "Intent Level", "Status", "Category", "URL", "Created At"];
    const rows = filteredLeads.map((l) => [
      l.username,
      l.platform,
      l.source,
      l.intentScore,
      l.intentLevel,
      l.status,
      l.intentCategory,
      l.url || "",
      new Date(l.createdAt).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchLeads = useCallback(() => {
    const params = new URLSearchParams();
    if (platformFilter !== "All") params.set("platform", platformFilter);
    if (intentFilter !== "All") params.set("intentLevel", intentFilter);
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (searchQuery) params.set("search", searchQuery);
    params.set("limit", "50");

    fetch(`/api/leads?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.leads?.length >= 0) setFilteredLeads(data.leads);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [platformFilter, intentFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Realtime: new leads appear at top, deleted leads disappear
  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "INSERT",
    onInsert: (row) => {
      const lead: Lead = {
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
      };
      setFilteredLeads((prev) => [lead, ...prev]);
    },
  });

  useRealtime<Record<string, unknown>>({
    table: "leads",
    event: "DELETE",
    onDelete: (old) => {
      const id = old.id as string;
      setFilteredLeads((prev) => prev.filter((l) => l.id !== id));
      if (selectedLead?.id === id) setSelectedLead(null);
    },
  });

  return (
    <>
      <Header
        title="Leads"
        subtitle={`${filteredLeads.length} leads found`}
      />
      <div className="p-6 space-y-4">
        {/* Filters Bar */}
        <Card className="border-border bg-card px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search leads by name, content, or source..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50 border-border"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Platform"
                value={platformFilter}
                options={["All", "Facebook", "LinkedIn", "Reddit", "X"]}
                onChange={(v) => setPlatformFilter(v as FilterPlatform)}
              />
              <FilterSelect
                label="Intent"
                value={intentFilter}
                options={["All", "High", "Medium", "Low"]}
                onChange={(v) => setIntentFilter(v as FilterIntent)}
              />
              <FilterSelect
                label="Status"
                value={statusFilter}
                options={["All", "New", "Contacted", "Qualified", "Dismissed"]}
                onChange={(v) => setStatusFilter(v as FilterStatus)}
              />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex items-center rounded-md border border-border bg-secondary/50 p-0.5">
                  <button
                  onClick={() => setViewMode("card")}
                  className={cn(
                    "flex items-center justify-center rounded-[5px] p-1.5 transition-all duration-200",
                    viewMode === "card"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Card view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "flex items-center justify-center rounded-[5px] p-1.5 transition-all duration-200",
                    viewMode === "table"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Table view"
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleExport}
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </Button>
              <div ref={actionRef} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setActionOpen((o) => !o)}
                >
                  Action
                  <ChevronDown className={cn("h-3 w-3 transition-transform", actionOpen && "rotate-180")} />
                </Button>
                {actionOpen && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-md border border-border bg-card py-1 shadow-lg animate-fade-in">
                    <button
                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                      onClick={() => {
                        setActionOpen(false);
                        handleDeleteAll();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete All Leads
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Card View */}
        {viewMode === "card" && (
          <div className="flex flex-col lg:flex-row gap-0 items-start animate-view-switch">
            {/* Left Panel: Card Grid */}
            <Card className={cn(
              "border-border bg-card overflow-hidden p-0 w-full transition-all duration-300",
              selectedLead ? "lg:w-[55%] lg:rounded-r-none" : "lg:w-full"
            )}>
              <div className={cn(
                "grid gap-3 p-4 max-h-[calc(100vh-320px)] overflow-y-auto transition-all duration-300",
                selectedLead
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              )}>
                {filteredLeads.map((lead, i) => (
                  <Card
                    key={lead.id}
                    className={cn(
                      "border-border bg-card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 animate-view-card-in",
                      selectedLead?.id === lead.id && "ring-1 ring-primary border-primary/40"
                    )}
                    style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
                    onClick={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {lead.username.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{lead.username}</p>
                        <p className="text-xs text-muted-foreground truncate">{lead.source}</p>
                      </div>
                    </div>

                    <p className="text-xs text-foreground/70 leading-relaxed line-clamp-2 mb-3">
                      {lead.text}
                    </p>

                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <PlatformBadge platform={lead.platform} size="sm" />
                      <IntentBadge score={lead.intentScore} size="sm" />
                      <StatusBadge status={lead.status} />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/60">
                      <span className="text-[11px] text-muted-foreground">{timeAgo(lead.createdAt)}</span>
                      {lead.location && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {lead.location}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>

              {loading && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Search className="h-10 w-10 text-muted-foreground/50 mb-3 animate-pulse" />
                  <p className="text-sm font-medium text-foreground/70">Loading leads...</p>
                </div>
              )}

              {!loading && filteredLeads.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium text-foreground/70">No leads found</p>
                  <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
                </div>
              )}
            </Card>

            {/* Right Panel: Card Detail */}
            <Card className={cn(
              "border-border bg-card p-0 lg:sticky lg:top-6 overflow-hidden min-w-0 w-full lg:rounded-l-none transition-all duration-300 origin-left",
              selectedLead ? "lg:w-[45%] opacity-100 scale-x-100" : "lg:w-0 opacity-0 scale-x-0 border-0"
            )}>
              {selectedLead ? (
                <div className="animate-fade-in">
                  {/* Detail Header */}
                  <div className="border-b border-border bg-muted/20 px-5 py-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {selectedLead.username.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {selectedLead.username}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {selectedLead.source}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedLead(null)}
                        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlatformBadge platform={selectedLead.platform} size="sm" />
                      <IntentBadge score={selectedLead.intentScore} size="sm" />
                      <StatusBadge status={selectedLead.status} />
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="px-5 py-4 space-y-4 max-h-[calc(100vh-520px)] overflow-y-auto">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Quote className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Post Content
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-primary/40" />
                        <p className="text-sm text-foreground/85 leading-[1.75] whitespace-pre-wrap pl-2">
                          <HighlightedText text={selectedLead.text} keywords={selectedLead.matchedKeywords} />
                        </p>
                      </div>
                    </div>

                    {/* Matched Keywords */}
                    {selectedLead.matchedKeywords.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Matched Keywords
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedLead.matchedKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Meta Info */}
                    <div className="grid grid-cols-2 gap-3">
                      {selectedLead.location && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</p>
                            <p className="text-xs font-medium text-foreground/80">{selectedLead.location}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                        <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engagement</p>
                          <p className="text-xs font-medium text-foreground/80">{selectedLead.engagement}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                          <p className="text-xs font-medium text-foreground/80">{selectedLead.intentCategory}</p>
                        </div>
                      </div>
                      {selectedLead.assignedTo && (
                        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</p>
                            <p className="text-xs font-medium text-foreground/80">{selectedLead.assignedTo}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="border-t border-border bg-muted/10 px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5 shadow-sm shadow-primary/25"
                        onClick={() => {
                          if (selectedLead.url) window.open(selectedLead.url, "_blank");
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Post
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => updateStatus(selectedLead.id, "Qualified")}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Assign
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                        onClick={() => updateStatus(selectedLead.id, "Dismissed")}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                        onClick={() => handleDeleteLead(selectedLead.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50 mb-4">
                    <MousePointerClick className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground/70 mb-1">No lead selected</p>
                  <p className="text-xs text-muted-foreground text-center">
                    Click on a card to view its full details
                  </p>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Two-Panel Table Layout */}
        <div ref={containerRef} className={cn(
          "flex flex-col lg:flex-row gap-0 items-start transition-all duration-300",
          viewMode === "card" && "hidden"
        )}>
          {/* Left Panel: Leads List */}
          <Card className="border-border bg-card overflow-hidden p-0 w-full lg:rounded-r-none animate-view-switch" style={{ width: `${leftWidth}%`, flexShrink: 0 }}>
            <div className="grid grid-cols-[1fr_90px_80px_90px_70px] gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Lead</span>
              <span>Platform</span>
              <span>Intent</span>
              <span>Status</span>
              <span className="text-right">Time</span>
            </div>

            <div className="divide-y divide-border max-h-[calc(100vh-320px)] overflow-y-auto">
              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  className={cn(
                    "group grid grid-cols-[1fr_90px_80px_90px_70px] gap-3 items-center px-4 py-3 transition-all cursor-pointer",
                    selectedLead?.id === lead.id
                      ? "bg-primary/6 border-l-2 border-l-primary"
                      : "hover:bg-accent/30 border-l-2 border-l-transparent"
                  )}
                  onClick={() => setSelectedLead(lead)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/80">
                        {lead.username.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.username}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {lead.source}
                        </p>
                      </div>
                    </div>
                  </div>
                  <PlatformBadge platform={lead.platform} size="sm" />
                  <IntentBadge score={lead.intentScore} size="sm" />
                  <StatusBadge status={lead.status} />
                  <span className="text-xs text-muted-foreground text-right">
                    {timeAgo(lead.createdAt)}
                  </span>
                </div>
              ))}
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-muted-foreground/50 mb-3 animate-pulse" />
                <p className="text-sm font-medium text-foreground/70">Loading leads...</p>
              </div>
            )}

            {!loading && filteredLeads.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm font-medium text-foreground/70">No leads found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
              </div>
            )}
          </Card>

          {/* Drag Handle */}
          <div
            onMouseDown={startDragging}
            className="hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center self-stretch group hover:bg-primary/10 transition-colors"
          >
            <div className="h-8 w-0.5 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
          </div>

          {/* Right Panel: Lead Detail */}
          <Card className="border-border bg-card p-0 lg:sticky lg:top-6 overflow-hidden flex-1 min-w-0 w-full lg:rounded-l-none">
            {selectedLead ? (
              <div className="animate-fade-in">
                {/* Detail Header */}
                <div className="border-b border-border bg-muted/20 px-5 py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {selectedLead.username.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {selectedLead.username}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedLead.source}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <PlatformBadge platform={selectedLead.platform} size="sm" />
                    <IntentBadge score={selectedLead.intentScore} size="sm" />
                    <StatusBadge status={selectedLead.status} />
                  </div>
                </div>

                {/* Post Content */}
                <div className="px-5 py-4 space-y-4 max-h-[calc(100vh-520px)] overflow-y-auto">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Quote className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Post Content
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 relative">
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg bg-primary/40" />
                      <p className="text-sm text-foreground/85 leading-[1.75] whitespace-pre-wrap pl-2">
                        <HighlightedText text={selectedLead.text} keywords={selectedLead.matchedKeywords} />
                      </p>
                    </div>
                  </div>

                  {/* Matched Keywords */}
                  {selectedLead.matchedKeywords.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Matched Keywords
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedLead.matchedKeywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Meta Info */}
                  <div className="grid grid-cols-2 gap-3">
                    {selectedLead.location && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Location</p>
                          <p className="text-xs font-medium text-foreground/80">{selectedLead.location}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Engagement</p>
                        <p className="text-xs font-medium text-foreground/80">{selectedLead.engagement}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p>
                        <p className="text-xs font-medium text-foreground/80">{selectedLead.intentCategory}</p>
                      </div>
                    </div>
                    {selectedLead.assignedTo && (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assigned</p>
                          <p className="text-xs font-medium text-foreground/80">{selectedLead.assignedTo}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="border-t border-border bg-muted/10 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      className="gap-1.5 shadow-sm shadow-primary/25"
                      onClick={() => {
                        if (selectedLead.url) window.open(selectedLead.url, "_blank");
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Post
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => updateStatus(selectedLead.id, "Qualified")}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Assign
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                      onClick={() => updateStatus(selectedLead.id, "Dismissed")}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400"
                      onClick={() => handleDeleteLead(selectedLead.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50 mb-4">
                  <MousePointerClick className="h-7 w-7 text-muted-foreground/40" />
                </div>
                <p className="text-sm font-medium text-foreground/70 mb-1">No lead selected</p>
                <p className="text-xs text-muted-foreground text-center">
                  Click on a lead from the list to view its full post content and details
                </p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmModal(null)}
          />
          <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-0 shadow-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/10">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">{confirmModal.title}</h3>
              </div>
              <button
                onClick={() => setConfirmModal(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-muted-foreground leading-relaxed">{confirmModal.message}</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-rose-500 hover:bg-rose-600 text-white shadow-sm"
                onClick={confirmModal.onConfirm}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative flex items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/50 pl-2.5 pr-7 text-xs font-medium text-foreground outline-none transition-colors hover:bg-secondary focus:border-primary focus:ring-1 focus:ring-primary/30 cursor-pointer appearance-none"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!keywords.length) return <>{text}</>;

  const escaped = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = keywords.some((kw) => kw.toLowerCase() === part.toLowerCase());
        return isMatch ? (
          <mark
            key={i}
            className="bg-primary/15 text-primary font-medium rounded px-0.5 py-px"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}
