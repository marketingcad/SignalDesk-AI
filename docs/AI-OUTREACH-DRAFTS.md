# AI Outreach Drafts — Spec

**Status:** Proposed
**Owner:** —
**Depends on:** existing Gemini setup (`lib/ai-lead-qualifier.ts`), auth (`lib/auth.ts`), `openUrl` (`lib/open-url.ts`)

---

## 1. Summary

From any lead's detail panel, a user clicks **Draft Reply**. Gemini generates a
short, personalized outreach message from the post itself. The user edits it,
picks a tone/channel, clicks **Copy**, then **Copy & Open** to deep-link straight
to the thread and paste it in manually.

**A human always sends the message.** SignalDesk never posts to Facebook (or any
platform) automatically. This deliberately avoids the account-ban and
automation-detection risk of driving an authenticated browser session to write
content — see [§7 Why not auto-post](#7-why-not-auto-post). The value ("leads you
can act on" instead of "a list of leads") is captured with none of that risk.

### Decisions locked for v1
- **Access:** all logged-in users (gated by `verifySession` only — same as the
  rest of the app). No admin-role check.
- **Draft input:** simple — the post `text` + `matchedKeywords`. No changes to
  the `leads` schema or the qualifier are required to ship.
- **Channels:** `comment` (reply on the post) and `dm` (direct message).

---

## 2. User flow

1. User opens a lead in **/leads** (the right-hand `LeadDetailContent` panel).
2. Clicks **Draft Reply** in the actions footer.
3. A drawer opens. If a draft already exists for this lead it loads the latest;
   otherwise it auto-generates one.
4. User optionally changes **Tone** (Friendly / Professional / Direct) or
   **Channel** (Comment / DM) and clicks **Regenerate**.
5. User edits the text freely in a textarea.
6. Clicks **Copy** (copies to clipboard) or **Copy & Open**:
   - copies the text,
   - opens the post/DM compose page via `openUrl(...)`,
   - advances the lead to **Engaged** automatically (existing
     `onUpdateStatus(lead.id, "Engaged")`).
7. User pastes and sends the message themselves on the platform.

---

## 3. Data model

One new table. Drafts persist per lead so users don't regenerate every time and
we build a message history.

```sql
-- migration: outreach_drafts
create table outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  channel text not null default 'comment',   -- 'comment' | 'dm'
  tone text not null default 'friendly',      -- 'friendly' | 'professional' | 'direct'
  body text not null,
  created_by text,                            -- session user email
  copied_at timestamptz,                      -- set when the user hits Copy
  created_at timestamptz not null default now()
);
create index outreach_drafts_lead_id_idx on outreach_drafts(lead_id);
```

> **DB-constraint note.** `channel` and `tone` are plain `text` on purpose. If you
> prefer to constrain them with a CHECK, add it in the **same migration** — a
> mismatched/late CHECK makes every insert fail silently with Postgres error
> `23514` (see the `leads-status` history). Keeping them unconstrained here avoids
> that failure mode entirely.

No changes to the `leads` table for v1.

---

## 4. Backend — draft generation route

New file: `app/api/leads/[id]/draft/route.ts`. Structure mirrors
`app/api/ai-assistant/route.ts` (auth + Gemini) and `app/api/leads/[id]/route.ts`
(the `params: Promise<{ id }>` signature).

```
POST /api/leads/[id]/draft
Body: {
  tone?:    'friendly' | 'professional' | 'direct'   // default 'friendly'
  channel?: 'comment'  | 'dm'                         // default 'comment'
}
→ 200 { draft: string, tone, channel, id }
→ 401 unauthorized | 404 lead not found | 503 AI unavailable
```

Steps:
1. `verifySession(token)` — reject 401 if missing/invalid. (No role check.)
2. Load the lead from Supabase (`text`, `username`, `platform`, `source`,
   `matched_keywords`). 404 if not found.
3. Build the prompt (§4.1) and call Gemini via the shared rotation helper (§4.2).
4. Insert the result into `outreach_drafts` (`created_by` = session email).
5. Return `{ draft, tone, channel, id }`.

### 4.1 Prompt

```
You are helping a virtual-assistant agency owner write a SHORT, human reply to a
social-media post from someone looking to hire help.

Post by {username} on {platform}{source ? `, in "${source}"` : ""}:
"{text}"

Signals we matched: {matchedKeywords.join(", ") || "none"}

Write a {tone} {channel === 'dm' ? 'direct message' : 'public comment reply'}.
Rules:
- 2–4 sentences. Sound like a real person, not a sales bot.
- Reference their SPECIFIC need. Do not be generic.
- Exactly one soft call-to-action (offer to help / invite a DM).
- No emojis unless tone is 'friendly' (then at most one).
- Never invent credentials, names, or pricing.
Return ONLY the message text — no preamble, no quotes.
```

Tone guidance appended per selection:
- `friendly` — warm, first-person, contractions ok.
- `professional` — polished, courteous, no slang.
- `direct` — concise and to the point, lead with the offer.

### 4.2 Shared Gemini helper (refactor)

`lib/ai-lead-qualifier.ts` already implements free-model rotation + per-model
cooldown (`FREE_MODELS`, `getAvailableModels`, `markModelExhausted`). Extract that
into `lib/gemini.ts` and have both the qualifier and this route use it, so there's
one rotation and cooldown map shared across the app rather than two copies.

Minimal surface:
```ts
// lib/gemini.ts
export function getGenAI(): GoogleGenerativeAI | null
export async function generateText(prompt: string, opts?: {
  temperature?: number; maxOutputTokens?: number;
}): Promise<string | null>   // returns null if all models exhausted/unavailable
```
Draft generation uses `temperature: 0.7`, `maxOutputTokens: 512`.

---

## 5. Deep-link helper

New file `lib/deep-link.ts`. `lead.url` already points at the exact post, so a
comment reply just opens that. DM needs per-platform compose URLs.

```ts
import type { Lead } from "./types";

export function outreachLink(lead: Lead, channel: "comment" | "dm"): string {
  if (channel === "comment") return lead.url;
  switch (lead.platform) {
    case "Reddit":
      // Reddit supports a fully prefilled compose link.
      return `https://www.reddit.com/message/compose/?to=${encodeURIComponent(lead.username)}`;
    case "X":
      return "https://x.com/messages/compose";
    case "LinkedIn":
    case "Facebook":
    default:
      // No reliable DM deep-link → open the post; user DMs from there.
      return lead.url;
  }
}
```

Reddit also accepts `&subject=` and `&message=` — optionally prefill the body
there for a one-click compose.

---

## 6. UI — Draft Reply drawer

In `app/(dashboard)/leads/page.tsx`, `LeadDetailContent`'s actions footer
(~line 1096, alongside **View Post** / **Engaged**) gains a **Draft Reply**
button that opens a drawer/modal (reuse the `confirmModal` backdrop pattern).

```
┌─ Draft Reply ──────────────────────────────┐
│ Tone:  (Friendly) Professional  Direct     │  ← segmented control
│ Channel: (Comment)  DM                      │
│ ┌────────────────────────────────────────┐ │
│ │ Hi Jane — saw you're after a VA to      │ │  ← editable <textarea>,
│ │ handle inbox + order tracking for your  │ │    prefilled from AI
│ │ Shopify store. That's exactly what I    │ │
│ │ set up for e-com owners...              │ │
│ └────────────────────────────────────────┘ │
│  [↻ Regenerate]     [Copy]  [Copy & Open ➜] │
└─────────────────────────────────────────────┘
```

Behavior:
- **Open** → `GET`/`POST` latest or auto-generate. Loading spinner while waiting.
- **Regenerate** → re-`POST` with current tone/channel.
- **Copy** → `navigator.clipboard.writeText(body)` (works in Tauri), stamp
  `copied_at`, show a toast.
- **Copy & Open** → copy, `openUrl(outreachLink(lead, channel))`, then
  `onUpdateStatus(lead.id, "Engaged")` to advance the pipeline automatically.

Reuses existing `Button`, modal backdrop, and `openUrl` — no new UI primitives.

---

## 7. Why not auto-post

Reading public posts (current behavior) is low-risk. **Writing** as the user is
where platforms fight back:

- Automated posting/commenting via an unofficial browser session violates
  Facebook's (and others') automation policy and is a common trigger for
  **flagging, rate-limiting, or permanent bans** — on the user's real account.
- The official Graph API only permits commenting on **Pages you own**, not
  arbitrary group posts, and requires app review. There is no clean API path.
- Write automation is fingerprinted aggressively (input timing, no mouse
  movement, headless signals).
- A misfired AI comment damages the user's reputation in the exact VA communities
  they're trying to win business in.

The draft → copy → deep-link flow keeps a human on the send button, so none of
this applies. If fully-automated sending is ever demanded by a customer, it would
be a separate, explicitly-gated feature with heavy throttling and a clear
account-risk warning — out of scope here.

---

## 8. Build sequence

| Phase | Work | Effort |
|------:|------|:------:|
| 1 | Extract shared `lib/gemini.ts` (model rotation from the qualifier) | S |
| 2 | `outreach_drafts` migration | XS |
| 3 | `POST /api/leads/[id]/draft` route | M |
| 4 | `lib/deep-link.ts` helper | XS |
| 5 | Draft Reply drawer in `LeadDetailContent` + Copy/Open wiring | M |
| 6 | *(fast follow)* persist `lead_summary`/`tasks` on leads → richer drafts | S |
| 7 | *(phase 2)* reusable `message_templates` with `{{variables}}` | M |

**v1 = phases 1–5** (~1 focused day). Phases 6–7 are enhancements.

---

## 9. Out of scope (v1)

- Automated/scheduled sending of any kind.
- Reusable message templates (phase 2).
- Multi-message threads / conversation tracking beyond the single latest draft.
- Persisting AI `tasks`/`leadSummary` on the lead (fast follow, phase 6).
