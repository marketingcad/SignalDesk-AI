import { supabase } from "./supabase";
import type { OutreachChannel, OutreachTone } from "./outreach";
import type { LeadStatus } from "./types";

// ---------------------------------------------------------------------------
// Outreach Analytics — "close the loop"
//
// Joins outreach_drafts → leads.status to measure which outreach converts.
// See docs/outreach-analytics/README.md.
//
// Honest-measurement rules baked in here:
//  - "Sent" is PROXIED by copied_at (copying ≈ sending). A draft never copied
//    counts as drafted-but-not-sent.
//  - Outcome is attributed to a lead's MOST-RECENTLY-COPIED draft (the one most
//    likely actually sent), so tone/channel breakdowns don't double-count.
//  - We only have each lead's CURRENT status (no stage history), so "progressed"
//    is inferred: Won implies it reached Proposal Sent; Lost is counted
//    separately (a lead can be lost at any stage), not as progression.
// ---------------------------------------------------------------------------

export interface RateStat {
  pct: number; // 0-100, rounded
  num: number;
  den: number;
}

export interface OutreachRates {
  progressionRate: RateStat; // reached Proposal Sent+ / sent
  winRate: RateStat; // Won / sent
  lossRate: RateStat; // Lost / sent
}

export interface OutreachAnalytics {
  range: { days: number; from: string };
  funnel: {
    drafted: number; // distinct leads with >=1 draft
    sent: number; // distinct leads with >=1 copied draft
    progressed: number; // sent leads that reached Proposal Sent+
    won: number;
    lost: number;
  };
  rates: {
    sendRate: RateStat; // sent / drafted
  } & OutreachRates;
  byTone: Record<OutreachTone, OutreachRates & { sent: number }>;
  byChannel: Record<OutreachChannel, OutreachRates & { sent: number }>;
  timeseries: { date: string; drafted: number; sent: number }[];
}

function rate(num: number, den: number): RateStat {
  return { pct: den > 0 ? Math.round((num / den) * 100) : 0, num, den };
}

// A lead has "progressed" if it reached at least the Proposal Sent stage. With
// only current status available, Won implies it passed through Proposal Sent.
function isProgressed(status: LeadStatus): boolean {
  return status === "Proposal Sent" || status === "Won";
}

interface DraftRow {
  lead_id: string;
  tone: OutreachTone;
  channel: OutreachChannel;
  copied_at: string | null;
  created_at: string;
}

/** Per-lead rollup: its most-recently-copied draft's tone/channel + outcome. */
interface SentLead {
  status: LeadStatus;
  tone: OutreachTone;
  channel: OutreachChannel;
}

function emptyRates(sent: number): OutreachRates & { sent: number } {
  return {
    sent,
    progressionRate: rate(0, sent),
    winRate: rate(0, sent),
    lossRate: rate(0, sent),
  };
}

function computeRates(leads: SentLead[]): OutreachRates & { sent: number } {
  const sent = leads.length;
  const progressed = leads.filter((l) => isProgressed(l.status)).length;
  const won = leads.filter((l) => l.status === "Won").length;
  const lost = leads.filter((l) => l.status === "Lost").length;
  return {
    sent,
    progressionRate: rate(progressed, sent),
    winRate: rate(won, sent),
    lossRate: rate(lost, sent),
  };
}

export async function getOutreachAnalytics(
  days = 30
): Promise<OutreachAnalytics> {
  const fromDate = new Date(Date.now() - days * 86400000);
  fromDate.setHours(0, 0, 0, 0);
  const from = fromDate.toISOString();

  // 1. Drafts generated in the window.
  const { data: draftData, error: draftErr } = await supabase
    .from("outreach_drafts")
    .select("lead_id, tone, channel, copied_at, created_at")
    .gte("created_at", from);

  if (draftErr) throw draftErr;
  const drafts = (draftData || []) as DraftRow[];

  // 2. Current status for every lead that has a draft in the window.
  const leadIds = [...new Set(drafts.map((d) => d.lead_id))];
  const statusById = new Map<string, LeadStatus>();
  if (leadIds.length > 0) {
    const { data: leadData, error: leadErr } = await supabase
      .from("leads")
      .select("id, status")
      .in("id", leadIds);
    if (leadErr) throw leadErr;
    for (const row of leadData || []) {
      statusById.set(row.id as string, row.status as LeadStatus);
    }
  }

  // 3. Per-lead rollup. A lead is "sent" if any of its drafts was copied.
  //    Attribute tone/channel to the most-recently-copied draft.
  const draftedLeads = new Set<string>();
  const latestCopiedByLead = new Map<string, DraftRow>();

  for (const d of drafts) {
    draftedLeads.add(d.lead_id);
    if (!d.copied_at) continue;
    const prev = latestCopiedByLead.get(d.lead_id);
    if (!prev || d.copied_at > (prev.copied_at as string)) {
      latestCopiedByLead.set(d.lead_id, d);
    }
  }

  const sentLeads: SentLead[] = [];
  for (const [leadId, d] of latestCopiedByLead) {
    const status = statusById.get(leadId);
    if (!status) continue; // lead deleted — skip
    sentLeads.push({ status, tone: d.tone, channel: d.channel });
  }

  // 4. Funnel + overall rates.
  const draftedCount = draftedLeads.size;
  const sentCount = sentLeads.length;
  const progressed = sentLeads.filter((l) => isProgressed(l.status)).length;
  const won = sentLeads.filter((l) => l.status === "Won").length;
  const lost = sentLeads.filter((l) => l.status === "Lost").length;

  const overall = computeRates(sentLeads);

  // 5. Breakdowns by tone / channel.
  const TONES: OutreachTone[] = ["friendly", "professional", "direct"];
  const CHANNELS: OutreachChannel[] = ["comment", "dm"];

  const byTone = Object.fromEntries(
    TONES.map((t) => {
      const group = sentLeads.filter((l) => l.tone === t);
      return [t, group.length ? computeRates(group) : emptyRates(0)];
    })
  ) as Record<OutreachTone, OutreachRates & { sent: number }>;

  const byChannel = Object.fromEntries(
    CHANNELS.map((c) => {
      const group = sentLeads.filter((l) => l.channel === c);
      return [c, group.length ? computeRates(group) : emptyRates(0)];
    })
  ) as Record<OutreachChannel, OutreachRates & { sent: number }>;

  // 6. Daily trend (draft-level counts): generated vs copied per day.
  const timeseries: { date: string; drafted: number; sent: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(fromDate);
    day.setDate(day.getDate() + (days - 1 - i));
    const dayStr = day.toISOString().slice(0, 10);
    timeseries.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      drafted: drafts.filter((d) => d.created_at.slice(0, 10) === dayStr).length,
      sent: drafts.filter((d) => d.copied_at?.slice(0, 10) === dayStr).length,
    });
  }

  return {
    range: { days, from },
    funnel: {
      drafted: draftedCount,
      sent: sentCount,
      progressed,
      won,
      lost,
    },
    rates: {
      sendRate: rate(sentCount, draftedCount),
      progressionRate: overall.progressionRate,
      winRate: overall.winRate,
      lossRate: overall.lossRate,
    },
    byTone,
    byChannel,
    timeseries,
  };
}
