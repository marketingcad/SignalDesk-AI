import { supabase } from "./supabase";
import { generateText } from "./gemini";
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
  channel: OutreachChannel
): string {
  const sourceClause = lead.source ? `, in "${lead.source}"` : "";
  const keywords =
    lead.matchedKeywords.length > 0 ? lead.matchedKeywords.join(", ") : "none";
  const format =
    channel === "dm" ? "direct message" : "public comment reply";

  return `You are helping a virtual-assistant agency owner write a SHORT, human reply to a social-media post from someone looking to hire help.

Post by ${lead.username} on ${lead.platform}${sourceClause}:
"${lead.text}"

Signals we matched: ${keywords}

Write a ${tone} ${format}.
${TONE_GUIDANCE[tone]}
Rules:
- 2-4 sentences. Sound like a real person, not a sales bot.
- Reference their SPECIFIC need. Do not be generic.
- Exactly one soft call-to-action (offer to help / invite a DM).
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

// ---------------------------------------------------------------------------
// Generate + persist
// ---------------------------------------------------------------------------

/**
 * Generate an outreach draft for a lead and persist it. Returns null if AI is
 * unavailable (no key / all models exhausted) so the caller can surface a 503.
 */
export async function generateOutreachDraft(
  lead: Lead,
  tone: OutreachTone,
  channel: OutreachChannel,
  createdBy?: string
): Promise<OutreachDraft | null> {
  const prompt = buildDraftPrompt(lead, tone, channel);
  const text = await generateText(prompt, {
    temperature: 0.7,
    maxOutputTokens: 512,
  });

  if (!text || !text.trim()) return null;

  const body = cleanDraft(text);

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
