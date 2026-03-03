"use client";

import { useState, useEffect, useCallback } from "react";
import { Header, ActionButton } from "@/components/header";
import { IntentBadge } from "@/components/intent-badge";
import { PlatformBadge } from "@/components/platform-badge";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leads as mockLeads } from "@/lib/mock-data";
import { timeAgo, cn } from "@/lib/utils";
import type { Lead, Platform, IntentLevel, LeadStatus } from "@/lib/types";
import {
  Search,
  Download,
  ExternalLink,
  MessageSquare,
  UserPlus,
  XCircle,
  ChevronDown,
} from "lucide-react";

type FilterPlatform = Platform | "All";
type FilterIntent = IntentLevel | "All";
type FilterStatus = LeadStatus | "All";

export default function LeadsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<FilterPlatform>("All");
  const [intentFilter, setIntentFilter] = useState<FilterIntent>("All");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("All");
  const [expandedLead, setExpandedLead] = useState<string | null>(null);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>(mockLeads);

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
      .catch(() => {
        // Fallback to client-side filtering of mock data
        const filtered = mockLeads.filter((lead) => {
          if (platformFilter !== "All" && lead.platform !== platformFilter) return false;
          if (intentFilter !== "All" && lead.intentLevel !== intentFilter) return false;
          if (statusFilter !== "All" && lead.status !== statusFilter) return false;
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
              lead.username.toLowerCase().includes(q) ||
              lead.text.toLowerCase().includes(q) ||
              lead.source.toLowerCase().includes(q)
            );
          }
          return true;
        });
        setFilteredLeads(filtered);
      });
  }, [platformFilter, intentFilter, statusFilter, searchQuery]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  return (
    <>
      <Header
        title="Leads"
        subtitle={`${filteredLeads.length} leads found`}
        actions={
          <ActionButton icon={Download} variant="secondary">
            Export
          </ActionButton>
        }
      />
      <div className="p-6 space-y-4">
        {/* Filters Bar */}
        <Card className="flex flex-wrap items-center gap-3 border-border bg-card px-4 py-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search leads by name, content, or source..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/50 border-border"
            />
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Platform Filter */}
          <FilterSelect
            label="Platform"
            value={platformFilter}
            options={["All", "Facebook", "LinkedIn", "Reddit", "X"]}
            onChange={(v) => setPlatformFilter(v as FilterPlatform)}
          />

          {/* Intent Filter */}
          <FilterSelect
            label="Intent"
            value={intentFilter}
            options={["All", "High", "Medium", "Low"]}
            onChange={(v) => setIntentFilter(v as FilterIntent)}
          />

          {/* Status Filter */}
          <FilterSelect
            label="Status"
            value={statusFilter}
            options={["All", "New", "Contacted", "Qualified", "Dismissed"]}
            onChange={(v) => setStatusFilter(v as FilterStatus)}
          />
        </Card>

        {/* Table */}
        <Card className="border-border bg-card overflow-hidden p-0">
          {/* Table Header */}
          <div className="grid grid-cols-[1fr_100px_100px_100px_100px_80px_48px] gap-4 border-b border-border bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Lead</span>
            <span>Platform</span>
            <span>Intent</span>
            <span>Status</span>
            <span>Category</span>
            <span className="text-right">Time</span>
            <span />
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border">
            {filteredLeads.map((lead) => (
              <div key={lead.id}>
                <div
                  className={cn(
                    "group grid grid-cols-[1fr_100px_100px_100px_100px_80px_48px] gap-4 items-center px-5 py-3.5 transition-colors cursor-pointer",
                    expandedLead === lead.id
                      ? "bg-accent/50"
                      : "hover:bg-accent/30"
                  )}
                  onClick={() =>
                    setExpandedLead(expandedLead === lead.id ? null : lead.id)
                  }
                >
                  {/* Lead Info */}
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
                  <span className="text-xs text-muted-foreground truncate">
                    {lead.intentCategory.split(" ").slice(0, 2).join(" ")}
                  </span>
                  <span className="text-xs text-muted-foreground text-right">
                    {timeAgo(lead.createdAt)}
                  </span>
                  <button className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        expandedLead === lead.id && "rotate-180"
                      )}
                    />
                  </button>
                </div>

                {/* Expanded Detail */}
                {expandedLead === lead.id && (
                  <div className="border-t border-border bg-accent/30 px-5 py-4 animate-fade-in">
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                            Post Content
                          </p>
                          <p className="text-sm text-foreground/80 leading-relaxed">
                            {lead.text}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {lead.matchedKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {lead.location && (
                            <span>Location: <span className="text-foreground/80">{lead.location}</span></span>
                          )}
                          <span>Engagement: <span className="text-foreground/80">{lead.engagement}</span></span>
                          {lead.assignedTo && (
                            <span>Assigned: <span className="text-foreground/80">{lead.assignedTo}</span></span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Button size="sm" className="gap-1.5 shadow-sm shadow-primary/25">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Contact
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                          View Post
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" />
                          Assign
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5 border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:text-rose-400">
                          <XCircle className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredLeads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <Search className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground/70">No leads found</p>
              <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
            </div>
          )}
        </Card>
      </div>
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
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-border bg-secondary/50 px-2 pr-7 text-xs font-medium text-foreground outline-none transition-colors focus:border-primary cursor-pointer appearance-none"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
