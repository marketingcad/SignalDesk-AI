import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getLeadById } from "@/lib/leads";
import {
  generateOutreachDraft,
  getLatestDraft,
  markDraftCopied,
  OUTREACH_CHANNELS,
  OUTREACH_TONES,
  type OutreachChannel,
  type OutreachTone,
} from "@/lib/outreach";

// ---------------------------------------------------------------------------
// AI Outreach Drafts — generate / fetch / mark-copied for a single lead.
// Available to all logged-in users (verifySession only). See
// docs/AI-OUTREACH-DRAFTS.md.
// ---------------------------------------------------------------------------

async function requireSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** GET — latest saved draft for this lead (null if none). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const draft = await getLatestDraft(id);
    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[api/leads/[id]/draft] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — generate a new draft. Body: { tone?, channel? }. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { tone?: string; channel?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tone: OutreachTone = OUTREACH_TONES.includes(body.tone as OutreachTone)
    ? (body.tone as OutreachTone)
    : "friendly";
  const channel: OutreachChannel = OUTREACH_CHANNELS.includes(
    body.channel as OutreachChannel
  )
    ? (body.channel as OutreachChannel)
    : "comment";

  try {
    const lead = await getLeadById(id);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const draft = await generateOutreachDraft(lead, tone, channel, session.email);
    if (!draft) {
      return NextResponse.json(
        { error: "AI is unavailable right now. Please try again in a moment." },
        { status: 503 }
      );
    }

    return NextResponse.json({ draft });
  } catch (error) {
    console.error("[api/leads/[id]/draft] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH — mark a draft as copied. Body: { draftId }. */
export async function PATCH(
  request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { draftId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.draftId) {
    return NextResponse.json({ error: "draftId is required" }, { status: 400 });
  }

  try {
    await markDraftCopied(body.draftId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/leads/[id]/draft] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
