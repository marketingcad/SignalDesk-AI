import { supabase } from "./supabase";
import type {
  Lead,
  Platform,
  IntentLevel,
  LeadStatus,
  DashboardStats,
  ChartDataPoint,
  DailyReport,
} from "./types";

// ---------------------------------------------------------------------------
// Map snake_case DB rows → camelCase Lead interface
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): Lead {
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
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getLeads(filters?: {
  platform?: Platform;
  intentLevel?: IntentLevel;
  status?: LeadStatus;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<{ leads: Lead[]; count: number }> {
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters?.platform) query = query.eq("platform", filters.platform);
  if (filters?.intentLevel) query = query.eq("intent_level", filters.intentLevel);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);
  if (filters?.search) {
    query = query.or(
      `username.ilike.%${filters.search}%,text.ilike.%${filters.search}%,source.ilike.%${filters.search}%`
    );
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    leads: (data || []).map(mapRow),
    count: count || 0,
  };
}

export async function getAlerts(limit = 20, offset = 0): Promise<{ leads: Lead[]; total: number }> {
  const { data, error, count } = await supabase
    .from("leads")
    .select("*", { count: "exact" })
    .gte("intent_score", 60)
    .neq("status", "Dismissed")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { leads: (data || []).map(mapRow), total: count ?? 0 };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  const [currentPeriod, previousPeriod] = await Promise.all([
    supabase
      .from("leads")
      .select("intent_score, intent_level, status", { count: "exact" })
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("leads")
      .select("intent_score, intent_level, status", { count: "exact" })
      .gte("created_at", fourteenDaysAgo)
      .lt("created_at", sevenDaysAgo),
  ]);

  const current = currentPeriod.data || [];
  const previous = previousPeriod.data || [];

  const totalLeads = currentPeriod.count || 0;
  const prevTotal = previousPeriod.count || 0;
  const highIntentLeads = current.filter((r) => r.intent_level === "High").length;
  const prevHigh = previous.filter((r) => r.intent_level === "High").length;
  const avgScore =
    current.length > 0
      ? Math.round(current.reduce((s, r) => s + r.intent_score, 0) / current.length)
      : 0;
  const prevAvgScore =
    previous.length > 0
      ? Math.round(previous.reduce((s, r) => s + r.intent_score, 0) / previous.length)
      : 0;
  const contacted = current.filter((r) => r.status !== "New").length;
  const responseRate = totalLeads > 0 ? Math.round((contacted / totalLeads) * 100) : 0;

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }

  return {
    totalLeads,
    highIntentLeads,
    avgIntentScore: avgScore,
    responseRate,
    totalLeadsChange: pctChange(totalLeads, prevTotal),
    highIntentChange: pctChange(highIntentLeads, prevHigh),
    avgScoreChange: avgScore - prevAvgScore,
    responseRateChange: 0,
  };
}

export async function getChartData(days = 7): Promise<ChartDataPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("leads")
    .select("created_at, intent_level")
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = data || [];
  const points: ChartDataPoint[] = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);

    const dayRows = rows.filter(
      (r) => (r.created_at as string).slice(0, 10) === dayStr
    );

    points.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      leads: dayRows.length,
      highIntent: dayRows.filter((r) => r.intent_level === "High").length,
    });
  }

  return points;
}

export async function getDailyReports(days = 7): Promise<DailyReport[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data || []).map(mapRow);
  const reports: DailyReport[] = [];

  for (let i = 0; i < days; i++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    const dayStr = day.toISOString().slice(0, 10);

    const dayLeads = rows.filter(
      (r) => r.createdAt.toISOString().slice(0, 10) === dayStr
    );

    const platforms: Record<Platform, number> = {
      Facebook: 0,
      LinkedIn: 0,
      Reddit: 0,
      X: 0,
      Other: 0,
    };
    for (const lead of dayLeads) {
      platforms[lead.platform]++;
    }

    reports.push({
      date: dayStr,
      totalLeads: dayLeads.length,
      highIntent: dayLeads.filter((l) => l.intentLevel === "High").length,
      mediumIntent: dayLeads.filter((l) => l.intentLevel === "Medium").length,
      lowIntent: dayLeads.filter((l) => l.intentLevel === "Low").length,
      platforms,
      topLeads: dayLeads
        .sort((a, b) => b.intentScore - a.intentScore)
        .slice(0, 3),
    });
  }

  return reports.reverse();
}

export async function getArchivedAlerts(limit = 20, offset = 0): Promise<{ leads: Lead[]; total: number }> {
  const { data, error, count } = await supabase
    .from("leads")
    .select("*", { count: "exact" })
    .gte("intent_score", 60)
    .eq("status", "Dismissed")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { leads: (data || []).map(mapRow), total: count ?? 0 };
}

export async function deleteArchivedAlerts(): Promise<number> {
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("status", "Dismissed")
    .gte("intent_score", 60)
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export async function updateLeadStatus(
  id: string,
  status: LeadStatus
): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data ? mapRow(data) : null;
}

export async function deleteLead(id: string): Promise<boolean> {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function deleteLeadsBulk(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export async function deleteAllLeads(): Promise<number> {
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .gte("created_at", "1970-01-01")
    .select("id");

  if (error) throw error;
  return data?.length || 0;
}

export interface GeographyDataPoint {
  country: string;
  code: string;
  leads: number;
  highIntent: number;
  percentage: number;
}

// Fixed 5 target countries + "Others" bucket for geography chart
const TARGET_COUNTRIES = [
  { country: "Philippines", code: "PH" },
  { country: "India", code: "IN" },
  { country: "United States", code: "US" },
  { country: "United Kingdom", code: "GB" },
  { country: "Australia", code: "AU" },
];

const TARGET_COUNTRY_NAMES = new Set(TARGET_COUNTRIES.map((c) => c.country));

export async function getGeographyData(): Promise<GeographyDataPoint[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("location, intent_level")
    .not("location", "is", null);

  if (error) throw error;

  const rows = data || [];

  // Initialize all 6 buckets
  const counts: Record<string, { leads: number; highIntent: number }> = {};
  for (const t of TARGET_COUNTRIES) {
    counts[t.country] = { leads: 0, highIntent: 0 };
  }
  counts["Others"] = { leads: 0, highIntent: 0 };

  for (const row of rows) {
    const loc = (row.location as string) || "";
    if (!loc) continue;
    const bucket = TARGET_COUNTRY_NAMES.has(loc) ? loc : "Others";
    counts[bucket].leads++;
    if (row.intent_level === "High") counts[bucket].highIntent++;
  }

  const total = Object.values(counts).reduce((s, c) => s + c.leads, 0);
  if (total === 0) return [];

  // Return in fixed order: 5 target countries then Others
  const codeMap: Record<string, string> = {};
  for (const t of TARGET_COUNTRIES) codeMap[t.country] = t.code;
  codeMap["Others"] = "OT";

  return [...TARGET_COUNTRIES.map((t) => t.country), "Others"].map((country) => ({
    country,
    code: codeMap[country],
    leads: counts[country].leads,
    highIntent: counts[country].highIntent,
    percentage: total > 0 ? Math.round((counts[country].leads / total) * 100) : 0,
  }));
}

export async function getPlatformCounts(): Promise<
  Record<Platform, { total: number; lastActive: Date | null }>
> {
  const platforms: Platform[] = ["Facebook", "LinkedIn", "Reddit", "X"];
  const result: Record<string, { total: number; lastActive: Date | null }> = {};

  for (const platform of platforms) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("platform", platform);

    const { data: latest } = await supabase
      .from("leads")
      .select("created_at")
      .eq("platform", platform)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    result[platform] = {
      total: count || 0,
      lastActive: latest ? new Date(latest.created_at) : null,
    };
  }

  return result as Record<Platform, { total: number; lastActive: Date | null }>;
}
