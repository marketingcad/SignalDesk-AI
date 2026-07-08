import { supabase } from "./supabase";
import { generateText } from "./gemini";
import { formatVaPitch, getTopMatchForLead, type StoredVaMatch } from "./va-matching";
import type { Lead } from "./types";

// ---------------------------------------------------------------------------
// AI Outreach Drafts — generation + persistence
// See docs/AI-OUTREACH-DRAFTS.md
// ---------------------------------------------------------------------------

export type OutreachChannel = "comment" | "dm";
export type OutreachTone = "friendly" | "professional" | "direct";

export const OUTREACH_CHANNELS: OutreachChannel[] = ["comment", "dm"];
export const OUTREACH_TONES: OutreachTone[] = ["friendly", "professional", "direct"];

export interface OutreachDraft {
  id: string;
  leadId: string;
  channel: OutreachChannel;
  tone: OutreachTone;
  body: string;
  createdBy?: string;
  copiedAt?: string | null;
  createdAt: string;
}

function mapDraftRow(row: Record<string, unknown>): OutreachDraft {
  return {
    id: row.id as string,
    leadId: row.lead_id as string,
    channel: row.channel as OutreachChannel,
    tone: row.tone as OutreachTone,
    body: row.body as string,
    createdBy: (row.created_by as string) || undefined,
    copiedAt: (row.copied_at as string) || null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const TONE_GUIDANCE: Record<OutreachTone, string> = {
  friendly: "Tone: warm and personable, first-person, contractions are fine.",
  professional: "Tone: polished and courteous, no slang.",
  direct: "Tone: concise and to the point — lead with the offer.",
};

function buildDraftPrompt(
  lead: Lead,
  tone: OutreachTone,
  channel: OutreachChannel,
  vaMatch?: StoredVaMatch | null
): string {
  const sourceClause = lead.source ? `, in "${lead.source}"` : "";
  const keywords =
    lead.matchedKeywords.length > 0 ? lead.matchedKeywords.join(", ") : "none";
  const format =
    channel === "dm" ? "direct message" : "public comment reply";

  // When a VA match exists we append the pitch + profile link ourselves, so the
  // model must not write one. Its job is only the personalised opener.
  const matchRules = vaMatch
    ? `
- Do NOT name a specific VA, and do NOT write any link or URL — one is appended for you.
- End on their need, not on an offer; the closing line is added afterwards.`
    : `
- Exactly one soft call-to-action (offer to help / invite a DM).`;

  return `You are helping a virtual-assistant agency owner write a SHORT, human reply to a social-media post from someone looking to hire help.

Post by ${lead.username} on ${lead.platform}${sourceClause}:
"${lead.text}"

Signals we matched: ${keywords}

Write a ${tone} ${format}.
${TONE_GUIDANCE[tone]}
Rules:
- 2-4 sentences. Sound like a real person, not a sales bot.
- Reference their SPECIFIC need. Do not be generic.${matchRules}
- No emojis${tone === "friendly" ? " (at most one)" : ""}.
- Never invent credentials, names, or pricing.
Return ONLY the message text — no preamble, no quotes.`;
}

/** Trim wrapping quotes/whitespace the model sometimes adds despite instructions. */
function cleanDraft(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Belt-and-braces: strip any URL the model emitted despite being told not to.
 * Only applied when we're about to append the real profileUrl, so a draft with
 * no VA match keeps whatever the model wrote.
 */
function stripUrls(s: string): string {
  return s
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Generate + persist
// ---------------------------------------------------------------------------

/**
 * Generate an outreach draft for a lead and persist it. Returns null if AI is
 * unavailable (no key / all models exhausted) so the caller can surface a 503.
 *
 * When the lead has a cached VA match (see lib/va-matching.ts) the model writes
 * the opener and we append the VA pitch + profile URL deterministically. If
 * there is no match, the draft degrades to the original un-enriched copy.
 */
export async function generateOutreachDraft(
  lead: Lead,
  tone: OutreachTone,
  channel: OutreachChannel,
  createdBy?: string
): Promise<OutreachDraft | null> {
  // A missing lead_va_matches table or a DB hiccup must not kill the draft.
  const vaMatch = await getTopMatchForLead(lead.id).catch((err) => {
    console.error(`[outreach] top VA match lookup failed for ${lead.id}:`, err);
    return null;
  });

  const prompt = buildDraftPrompt(lead, tone, channel, vaMatch);
  const text = await generateText(prompt, {
    temperature: 0.7,
    maxOutputTokens: 512,
  });

  if (!text || !text.trim()) return null;

  const body = vaMatch
    ? `${stripUrls(cleanDraft(text))}\n\n${formatVaPitch(vaMatch)}`
    : cleanDraft(text);

  const { data, error } = await supabase
    .from("outreach_drafts")
    .insert({
      lead_id: lead.id,
      channel,
      tone,
      body,
      created_by: createdBy ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return mapDraftRow(data);
}

/** Most recent draft for a lead, or null if none exists yet. */
export async function getLatestDraft(
  leadId: string
): Promise<OutreachDraft | null> {
  const { data, error } = await supabase
    .from("outreach_drafts")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? mapDraftRow(data) : null;
}

/** Stamp copied_at when the user copies a draft. */
export async function markDraftCopied(id: string): Promise<void> {
  const { error } = await supabase
    .from("outreach_drafts")
    .update({ copied_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
