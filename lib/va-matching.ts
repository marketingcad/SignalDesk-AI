import { supabase } from "./supabase";
import type { AIQualificationResult } from "./types";

// ---------------------------------------------------------------------------
// Smart VA Matching — client for Linkage VA Hub's POST /api/match-vas
// See the Integration Spec in README.md.
//
// Contract constraints enforced here:
//   - `text` must be non-empty and <= 4000 chars, else VA Hub returns 400.
//   - 429 must honor Retry-After; 502 is retryable with backoff.
//   - The response NEVER contains email/phone/portfolio/full last name.
//   - profileUrl carries ?src=signaldesk&lead=<id> and must be used verbatim.
// ---------------------------------------------------------------------------

/** VA Hub rejects `text` longer than this with a 400. */
export const MATCH_TEXT_MAX_CHARS = 4000;

/**
 * VA Hub drops results below cosine similarity 0.30, but that floor is below
 * the noise level: a nonsense query still scores ~0.47 against every VA, while
 * genuine topical matches land at 0.55-0.68. Filter here instead, or we pitch a
 * video editor to a lead who needs a bookkeeper.
 */
export const MIN_MATCH_SCORE = 0.6;

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const MAX_RETRY_AFTER_S = 30;

export interface VaMatch {
  slug: string;
  firstName: string;
  displayName: string;
  headshotUrl: string | null;
  skills: string[];
  yearsOfExperience: number | null;
  availability: string | null;
  profileUrl: string;
  matchScore: number;
}

/** A match as persisted in `lead_va_matches` (no firstName — displayName only). */
export interface StoredVaMatch {
  slug: string;
  displayName: string;
  headshotUrl: string | null;
  skills: string[];
  yearsOfExperience: number | null;
  availability: string | null;
  profileUrl: string;
  matchScore: number;
}

export class MatchApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MatchApiError";
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read config lazily. When either var is missing the feature is simply OFF —
 * lead ingestion must never fail because VA matching is unconfigured.
 */
function getConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.VAHUB_BASE_URL?.replace(/\/+$/, "");
  const secret = process.env.MATCH_API_SECRET;
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export function isVaMatchingEnabled(): boolean {
  return getConfig() !== null;
}

/**
 * VA Hub home, carrying the same ?src/?lead attribution as a profileUrl. Used as
 * the outreach fallback when no individual VA clears MIN_MATCH_SCORE — a lead
 * should always have somewhere on-platform to go.
 */
export function getVaHubHomeUrl(leadId: string): string | null {
  const config = getConfig();
  if (!config) return null;
  return `${config.baseUrl}/?src=signaldesk&lead=${encodeURIComponent(leadId)}`;
}

// ---------------------------------------------------------------------------
// Query text
// ---------------------------------------------------------------------------

/**
 * Build the text we embed. Prefer the AI qualifier's extracted tasks/skills/tools
 * over the raw post: VA Hub embeds each VA's `profile_text` from skills + tools +
 * bio, so a denoised skills string lands far closer in vector space than a
 * rambling social post — and it can't blow the 4000-char cap.
 */
export function buildMatchText(
  leadText: string,
  ai?: AIQualificationResult | null
): string {
  const parts: string[] = [];

  if (ai) {
    if (ai.leadSummary) parts.push(ai.leadSummary);
    if (ai.tasks?.length) parts.push(`Tasks: ${ai.tasks.join(", ")}`);
    if (ai.skills?.length) parts.push(`Skills: ${ai.skills.join(", ")}`);
    if (ai.tools?.length) parts.push(`Tools: ${ai.tools.join(", ")}`);
    if (ai.industry) parts.push(`Industry: ${ai.industry}`);
  }

  const composed = parts.length > 0 ? parts.join(". ") : leadText;
  return composed.trim().slice(0, MATCH_TEXT_MAX_CHARS);
}

// ---------------------------------------------------------------------------
// The API call
// ---------------------------------------------------------------------------

/**
 * Ask VA Hub for the best-fit VAs. Returns only matches at or above
 * MIN_MATCH_SCORE — an empty array is a normal, expected result.
 *
 * Throws MatchApiError on 400/401/503 (non-retryable) or after exhausting
 * retries on 429/502/network. Callers that must not fail should use
 * matchAndStoreForLead().
 */
export async function matchVAsForLead(
  text: string,
  leadId: string,
  limit = 3
): Promise<VaMatch[]> {
  const config = getConfig();
  if (!config) {
    throw new MatchApiError("VA matching disabled: VAHUB_BASE_URL or MATCH_API_SECRET unset", 0);
  }
  if (!text.trim()) return [];

  const body = JSON.stringify({
    text: text.slice(0, MATCH_TEXT_MAX_CHARS),
    leadId,
    limit,
    source: "signaldesk",
  });

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const isLastAttempt = attempt === MAX_RETRIES;
    let res: Response;

    try {
      res = await fetch(`${config.baseUrl}/api/match-vas`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secret}`, // server-side only
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      if (isLastAttempt) {
        throw new MatchApiError(`match-vas network error: ${String(err)}`, 0);
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (res.ok) {
      const { matches } = (await res.json()) as { matches?: VaMatch[] };
      return (matches ?? []).filter((m) => m.matchScore >= MIN_MATCH_SCORE);
    }

    // 429 — honor Retry-After (seconds), clamped so a hostile value can't stall us.
    if (res.status === 429) {
      if (isLastAttempt) {
        throw new MatchApiError("match-vas rate limited; retries exhausted", 429);
      }
      const retryAfter = Number(res.headers.get("Retry-After") ?? 5);
      const waitS = Math.min(Math.max(Number.isFinite(retryAfter) ? retryAfter : 5, 1), MAX_RETRY_AFTER_S);
      console.warn(`[va-matching] 429 — waiting ${waitS}s before retry`);
      await sleep(waitS * 1000);
      continue;
    }

    // 502 — upstream matching failed; retry with backoff.
    if (res.status === 502) {
      if (isLastAttempt) {
        throw new MatchApiError("match-vas upstream failure; retries exhausted", 502);
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    // 400 (bad request), 401 (bad secret), 503 (disabled on VA Hub) — do not retry.
    const { error } = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new MatchApiError(`match-vas failed (${res.status}): ${error}`, res.status);
  }

  /* istanbul ignore next — loop always returns or throws */
  throw new MatchApiError("match-vas: unreachable", 0);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function mapMatchRow(row: Record<string, unknown>): StoredVaMatch {
  return {
    slug: row.va_slug as string,
    displayName: row.display_name as string,
    headshotUrl: (row.headshot_url as string) ?? null,
    skills: (row.skills as string[]) ?? [],
    yearsOfExperience: (row.years_of_experience as number) ?? null,
    availability: (row.availability as string) ?? null,
    profileUrl: row.profile_url as string,
    matchScore: row.match_score as number,
  };
}

/** Upsert on (lead_id, va_slug) so re-matching a lead refreshes rather than duplicates. */
export async function storeLeadVaMatches(
  leadId: string,
  matches: VaMatch[]
): Promise<void> {
  if (matches.length === 0) return;

  const rows = matches.map((m) => ({
    lead_id: leadId,
    va_slug: m.slug,
    display_name: m.displayName,
    headshot_url: m.headshotUrl,
    skills: m.skills,
    years_of_experience: m.yearsOfExperience,
    availability: m.availability,
    profile_url: m.profileUrl, // verbatim — keeps ?src / ?lead attribution intact
    match_score: m.matchScore,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("lead_va_matches")
    .upsert(rows, { onConflict: "lead_id,va_slug" });

  if (error) throw error;
}

/**
 * Best-scoring cached match for a lead, or null if none.
 *
 * Scores tie often (VA Hub rounds to 2dp — a 3-way tie at 0.73 is routine), and
 * Postgres breaks ties arbitrarily. Sort by va_slug as a tiebreaker so the same
 * lead always pitches the same VA across draft regenerations.
 */
export async function getTopMatchForLead(leadId: string): Promise<StoredVaMatch | null> {
  const { data, error } = await supabase
    .from("lead_va_matches")
    .select("*")
    .eq("lead_id", leadId)
    .order("match_score", { ascending: false })
    .order("va_slug", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapMatchRow(data) : null;
}

/** All cached matches for a lead, best first (deterministic on score ties). */
export async function getMatchesForLead(leadId: string): Promise<StoredVaMatch[]> {
  const { data, error } = await supabase
    .from("lead_va_matches")
    .select("*")
    .eq("lead_id", leadId)
    .order("match_score", { ascending: false })
    .order("va_slug", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapMatchRow);
}

// ---------------------------------------------------------------------------
// Fire-and-forget entry point (used by the ingestion pipeline)
// ---------------------------------------------------------------------------

/**
 * Match + persist for a freshly qualified lead. Never throws and never rejects:
 * a VA Hub outage must not fail lead ingestion. Returns [] on any error.
 */
export async function matchAndStoreForLead(
  leadId: string,
  leadText: string,
  ai?: AIQualificationResult | null,
  limit = 3
): Promise<VaMatch[]> {
  if (!isVaMatchingEnabled()) return [];

  try {
    const text = buildMatchText(leadText, ai);
    const matches = await matchVAsForLead(text, leadId, limit);

    if (matches.length === 0) {
      console.log(`[va-matching] lead ${leadId} — no VA cleared ${MIN_MATCH_SCORE}`);
      return [];
    }

    await storeLeadVaMatches(leadId, matches);
    console.log(
      `[va-matching] lead ${leadId} — stored ${matches.length} match(es), top ${matches[0].displayName} @ ${matches[0].matchScore}`
    );
    return matches;
  } catch (err) {
    console.error(`[va-matching] lead ${leadId} — match failed:`, err);
    return [];
  }
}

/**
 * Top match for a lead, matching on demand if nothing is cached yet.
 *
 * The ingestion trigger only fires for newly scraped leads, so every lead that
 * predates Smart VA Matching has an empty cache. This backfills lazily the first
 * time a draft is generated. Never throws — a miss simply yields null.
 */
export async function ensureTopMatchForLead(leadId: string): Promise<StoredVaMatch | null> {
  try {
    const cached = await getTopMatchForLead(leadId);
    if (cached) return cached;
    if (!isVaMatchingEnabled()) return null;

    // Pull the AI-extracted tasks/skills/tools — a far better query than raw post text.
    const { data, error } = await supabase
      .from("leads")
      .select("text, ai_qualification")
      .eq("id", leadId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.text) return null;

    console.log(`[va-matching] lead ${leadId} — cache miss, matching on demand`);
    await matchAndStoreForLead(leadId, data.text, data.ai_qualification ?? null);
    return await getTopMatchForLead(leadId);
  } catch (err) {
    console.error(`[va-matching] lead ${leadId} — ensureTopMatchForLead failed:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Outreach copy
// ---------------------------------------------------------------------------

const AVAILABILITY_SENTENCE: Record<string, string> = {
  "available-now": "They're available to start now.",
  "available-in-two-weeks": "They can start in about two weeks.",
  "available-in-one-months": "They can start in about a month.",
};

/** Sentinels that identify an already-pitched draft. Exported so the check can't drift. */
export const VA_PITCH_MARKER = "Here's the profile:";
export const HUB_PITCH_MARKER = "browse their profiles here:";

/** True when a draft body already ends in a VA or VA Hub pitch. */
export function hasPitch(body: string): boolean {
  return body.includes(VA_PITCH_MARKER) || body.includes(HUB_PITCH_MARKER);
}

/**
 * Deterministic pitch appended to an outreach draft. Built in code, never by the
 * LLM: a model that "tidies" the profileUrl silently destroys the ?src / ?lead
 * attribution the whole feature exists to measure.
 */
export function formatVaPitch(m: StoredVaMatch): string {
  const skills = m.skills.slice(0, 3).join(", ");
  const skillClause = skills ? ` with ${skills}` : "";
  const years = m.yearsOfExperience ? ` and ${m.yearsOfExperience} years of experience` : "";
  const availability = m.availability ? AVAILABILITY_SENTENCE[m.availability] : undefined;
  const availabilityClause = availability ? ` ${availability}` : "";

  return `We have ${m.displayName} — a vetted VA${skillClause}${years}.${availabilityClause}\n\n${VA_PITCH_MARKER} ${m.profileUrl}`;
}

/**
 * Fallback when no individual VA clears MIN_MATCH_SCORE: promote the directory
 * rather than pitching a poor match. Same deterministic construction — the LLM
 * never renders this URL either.
 */
export function formatVaHubPitch(hubUrl: string): string {
  return `We have a roster of vetted, pre-screened VAs ready to start — you can ${HUB_PITCH_MARKER} ${hubUrl}`;
}
