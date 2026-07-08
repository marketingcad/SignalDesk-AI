import { supabase } from "./supabase";
import { generateText } from "./gemini";
import {
  ensureTopMatchForLead,
  formatVaHubPitch,
  formatVaPitch,
  getVaHubDirectoryUrl,
  hasPitch,
  stripPitch,
} from "./va-matching";
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

/** What gets appended after the model's opener. */
type PitchMode = "va" | "hub" | "none";

function buildDraftPrompt(
  lead: Lead,
  tone: OutreachTone,
  channel: OutreachChannel,
  pitchMode: PitchMode
): string {
  const sourceClause = lead.source ? `, in "${lead.source}"` : "";
  const keywords =
    lead.matchedKeywords.length > 0 ? lead.matchedKeywords.join(", ") : "none";
  const format =
    channel === "dm" ? "direct message" : "public comment reply";

  // When we append a pitch + link ourselves the model must not write one. Its
  // job is only the personalised opener.
  const matchRules =
    pitchMode === "none"
      ? `
- Exactly one soft call-to-action (offer to help / invite a DM).`
      : `
- Do NOT name a specific VA, and do NOT write any link or URL — one is appended for you.
- End on their need, not on an offer; the closing line is added afterwards.`;

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
 * The model writes the opener; we append the call-to-action deterministically,
 * in one of three modes:
 *   "va"   — a VA cleared MIN_MATCH_SCORE: pitch them + their profile URL.
 *   "hub"  — no good match: promote the VA Hub directory instead.
 *   "none" — VA matching unconfigured: original un-enriched copy.
 *
 * The LLM never renders either URL — it would silently mangle the ?src/?lead
 * attribution params that make the funnel measurable.
 */
/**
 * Resolve the pitch block for a lead: the matched VA plus a directory link, or
 * the directory alone when nothing clears MIN_MATCH_SCORE. Single source of truth
 * for both the write path and the read path, so they cannot diverge.
 *
 * Never throws — a VA Hub outage must not kill the draft.
 */
async function buildPitch(
  leadId: string
): Promise<{ mode: PitchMode; text: string | null }> {
  const directoryUrl = getVaHubDirectoryUrl(leadId);
  if (!directoryUrl) return { mode: "none", text: null }; // matching unconfigured

  const vaMatch = await ensureTopMatchForLead(leadId);
  return vaMatch
    ? { mode: "va", text: formatVaPitch(vaMatch, directoryUrl) }
    : { mode: "hub", text: formatVaHubPitch(directoryUrl) };
}

export async function generateOutreachDraft(
  lead: Lead,
  tone: OutreachTone,
  channel: OutreachChannel,
  createdBy?: string
): Promise<OutreachDraft | null> {
  // Matches on demand when nothing is cached (leads predating this feature).
  const pitch = await buildPitch(lead.id);

  const prompt = buildDraftPrompt(lead, tone, channel, pitch.mode);
  const text = await generateText(prompt, {
    temperature: 0.7,
    // 2048, not 512: these are thinking models and the budget covers thinking +
    // visible text. Measured ~480 thinking tokens for this prompt, so 512 left
    // ~30 for the reply and truncated it mid-word 5 times out of 6.
    maxOutputTokens: 2048,
  });

  if (!text || !text.trim()) return null;

  const body = pitch.text
    ? `${stripUrls(cleanDraft(text))}\n\n${pitch.text}`
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

/**
 * Attach the pitch block to a draft body that doesn't already carry the current
 * one.
 *
 * The pitch used to be baked in at write time only, which made every draft an
 * immutable snapshot of what the matcher knew back then: drafts written before a
 * lead was matched showed no profile URL forever, even after the match existed.
 * Composing at read time instead means a draft can never go stale. Deterministic
 * — no LLM call, no DB write.
 *
 * Bodies holding an older pitch format get it stripped and rebuilt, so adding the
 * directory line doesn't duplicate the blurb on drafts already in the database.
 */
async function attachPitch(leadId: string, body: string): Promise<string> {
  if (hasPitch(body)) return body;

  const pitch = await buildPitch(leadId);
  if (!pitch.text) return body;

  // Drop any stale pitch block, then any model-written link left in the prose,
  // so the URLs we append are the only ones in the message.
  return `${stripUrls(stripPitch(body))}\n\n${pitch.text}`;
}

/** Most recent draft for a lead, or null if none exists yet. Pitch attached on read. */
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
  if (!data) return null;

  const draft = mapDraftRow(data);
  return { ...draft, body: await attachPitch(leadId, draft.body) };
}

/** Stamp copied_at when the user copies a draft. */
export async function markDraftCopied(id: string): Promise<void> {
  const { error } = await supabase
    .from("outreach_drafts")
    .update({ copied_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}
