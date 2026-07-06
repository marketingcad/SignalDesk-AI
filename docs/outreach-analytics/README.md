# Outreach Analytics — "Close the Loop" (Spec Draft)

**Status:** Draft — pre-implementation
**Owner:** —
**Builds on:** [AI Outreach Drafts](../AI-OUTREACH-DRAFTS.md) (shipped)
**Depends on:** `outreach_drafts` table, `leads.status`, `recharts` (already a dependency)

> This is a **design draft written before implementation**. Nothing here is built
> yet. It exists so the data model, attribution rules, and honest-measurement
> caveats are agreed before any code lands.

---

## 1. Summary

The Drafts feature lets users *generate* outreach. This feature measures *what
works* — the one thing a scraper competitor structurally cannot have, because it
requires owning both the outreach **and** the pipeline outcome.

We join `outreach_drafts` → the lead's eventual `status` to answer:

- How many drafts were generated vs. actually used (copied)?
- Of the leads we reached out to, how many reached **Won**?
- Which **tone** (Friendly / Professional / Direct) and **channel**
  (Comment / DM) convert best — *for this user*?

The output is a small analytics panel plus an API. No new scraping, no new AI
calls — pure read-side on data we already store.

---

## 2. What is (and isn't) measurable — read this first

Honest measurement matters more than a vanity chart. Given how the Drafts flow
works today:

| Signal | How we know it | Reliability |
|--------|----------------|-------------|
| **Drafted** | a row exists in `outreach_drafts` | exact |
| **Sent** | `copied_at` is set (user copied the message) | **proxy** — copying ≈ sending, but a user could copy and not send |
| **Reached out** | lead auto-advances to `Engaged` on *Copy & Open* | exact, but means "we contacted", **not** "they replied" |
| **Progressed** | user manually moves lead to `Proposal Sent` | exact (human action) |
| **Won / Lost** | user manually sets terminal `status` | exact (human action) |

**Key caveat to surface in the UI:** `Engaged` is set *automatically* when the
user hits Copy & Open, so it is **not** a reply signal. The only trustworthy
"it worked" signals are the human-set `Proposal Sent` / `Won` stages. Analytics
must be built on those, and the panel should label "Sent" as *copied* so nobody
mistakes it for a platform-confirmed send.

### Attribution rule
A lead can have multiple drafts. Attribute the lead's outcome to its
**most-recently-copied** draft (`max(copied_at)`), since that's the one most
likely actually sent. Drafts that were never copied count toward "generated" but
not toward "sent" or outcome rates.

### Optional accuracy upgrade (phase 2)
Add explicit **Mark as Sent** / **Mark as Replied** controls on the lead so the
signals become real instead of proxied. Deferred — v1 ships on the proxies above
with clear labels.

---

## 3. Metrics

**Funnel (counts):** Drafted → Sent (copied) → Proposal Sent → Won.

**Rates:**
- **Send rate** = drafts copied / drafts generated
- **Progression rate** = leads reaching `Proposal Sent`+ / leads sent
- **Win rate** = leads `Won` / leads sent
- **Loss rate** = leads `Lost` / leads sent

**Breakdowns:** each rate split by `tone` and by `channel`, so the winner is
visible (e.g. "Direct DMs win 22% vs Friendly comments 9%").

**Time series:** drafts generated & copied per day (last 30 days).

All rates show the **denominator** (e.g. "22% (4/18)") — a 100% win rate on 1
lead is noise, and the UI must make small samples obvious.

---

## 4. Data model

**No schema change required for v1.** Everything derives from existing tables:

- `outreach_drafts` (`lead_id`, `tone`, `channel`, `copied_at`, `created_at`)
- `leads` (`id`, `status`)

Phase-2 accuracy upgrade would add:
```sql
-- optional, phase 2 only
alter table public.outreach_drafts
  add column if not exists sent_at    timestamptz,   -- explicit "I sent this"
  add column if not exists replied_at timestamptz;   -- explicit "they replied"
```

---

## 5. API

New route: `app/api/analytics/outreach/route.ts` (auth via `verifySession`, same
as every other route).

```
GET /api/analytics/outreach?days=30
→ 200 {
    range: { days, from },
    funnel: { drafted, sent, proposalSent, won, lost },
    rates:  { sendRate, progressionRate, winRate, lossRate },   // each: { pct, num, den }
    byTone:    { friendly:{...rates}, professional:{...}, direct:{...} },
    byChannel: { comment:{...rates}, dm:{...rates} },
    timeseries: [ { date, drafted, sent } ]   // last `days` days
  }
→ 401 unauthorized
```

Implementation notes:
- Add query helpers to a new `lib/outreach-analytics.ts` (keeps `lib/outreach.ts`
  focused on generation).
- One `outreach_drafts` select joined in-memory to a `leads` (`id`,`status`)
  map is enough at current volume; revisit with a SQL view if it grows.
- Compute everything server-side; the client just renders.

---

## 6. UI

Add an **Outreach** section to the existing **/reports** page (it already uses
`recharts`). Components:

1. **Funnel bar** — Drafted → Sent → Proposal Sent → Won, with counts.
2. **Rate tiles** — Send / Progression / Win rate, each showing `pct (num/den)`.
3. **Tone & Channel comparison** — small grouped bar charts of win rate by tone
   and by channel, denominators visible.
4. **Trend** — drafts generated vs copied per day.

Design cues: reuse the dashboard's existing card + `recharts` styling. Add a
one-line disclaimer under the header: *"'Sent' means the draft was copied.
'Won/Proposal Sent' reflect stages you set manually."*

---

## 7. Build sequence

| Phase | Work | Effort |
|------:|------|:------:|
| 1 | `lib/outreach-analytics.ts` — aggregation queries + rate math (with denominators) | M |
| 2 | `GET /api/analytics/outreach` route | S |
| 3 | Outreach section on `/reports` (funnel, tiles, tone/channel charts, trend) | M |
| 4 | *(phase 2)* explicit **Mark as Sent / Replied** controls → real signals | M |

**v1 = phases 1–3.** Phase 4 upgrades proxied signals to real ones later.

---

## 8. Out of scope (v1)

- True inbound reply detection (would require re-scraping threads / platform
  APIs). Approximated by pipeline stage instead.
- Cross-user / team benchmarking.
- A/B *auto-optimization* (auto-defaulting to the winning tone) — this feature
  produces the data that later makes auto-optimization possible; it doesn't act
  on it yet.

---

## 9. Open questions

1. Should "Sent" stay proxied by `copied_at`, or do we want the explicit
   Mark-as-Sent control in v1 rather than phase 2?
2. Attribution: most-recently-copied draft (proposed) vs. first draft vs.
   all-drafts-for-lead? Most-recent is the default here.
3. Reports page section vs. a dedicated `/analytics` route?
