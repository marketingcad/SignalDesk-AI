# Pipeline (Kanban)

How the visual sales pipeline works in Signal Desk AI.

---

## Overview

The **Pipeline** is a Kanban-style board that lets you move leads through your sales process by dragging cards between columns. Every lead has a **pipeline stage** and a **position** within that stage, both persisted to Supabase so the board layout is shared across devices and stays in sync in real time.

The board lives at **`/pipeline`** and is reachable from the **Pipeline** item in the sidebar (right below Leads).

---

## The 5 Stages

Leads flow left to right through five fixed stages:

| Stage          | Meaning                                              |
| -------------- | ---------------------------------------------------- |
| New Leads      | Freshly captured, not yet worked. The default stage. |
| Engaged        | You have started a conversation / outreach.          |
| Proposal Sent  | A proposal or quote has been delivered.              |
| Won            | The deal closed successfully.                        |
| Lost           | The deal did not close.                              |

Every newly captured lead starts in **New Leads** (the database default).

---

## How Drag-and-Drop Maps to the Database

Two columns on the `leads` table back the board:

| Column           | Type               | Purpose                                                    |
| ---------------- | ------------------ | ---------------------------------------------------------- |
| `pipeline_stage` | `text`             | Which column the card lives in (one of the 5 stages).      |
| `stage_position` | `double precision` | Sort order of the card **within** its column (ascending).  |

When you drop a card, the board computes a new `stage_position` so the card lands exactly where you released it, then persists both values:

| Drop location          | New `stage_position`        |
| ---------------------- | --------------------------- |
| Top of a column        | `firstCardPos - 1`          |
| Bottom of a column     | `lastCardPos + 1`           |
| Between cards A and B   | `(A.pos + B.pos) / 2`       |
| Into an empty column    | `0`                         |

Using the midpoint between neighbors (a fractional-index scheme) means a single card can be re-ordered without renumbering every other card in the column.

The UI updates **optimistically** — the card moves immediately on drop, and the PATCH request persists the change in the background. Cards within a column are always rendered sorted ascending by `stage_position`.

---

## Real-time Sync

The board subscribes to the `leads` table via the shared `useRealtime` hook, so changes made elsewhere (or by other users) appear without a refresh:

| Event    | Board behavior                                  |
| -------- | ----------------------------------------------- |
| `INSERT` | New card appears in the **New Leads** column.   |
| `UPDATE` | The matching card refreshes in place.           |
| `DELETE` | The matching card is removed by id.             |

---

## API Endpoints

| Method & Route                 | Body                              | Returns          | Purpose                                              |
| ------------------------------ | --------------------------------- | ---------------- | ---------------------------------------------------- |
| `GET /api/pipeline`            | —                                 | `{ leads }`      | All leads for the board (ordered by position).       |
| `PATCH /api/leads/{id}/stage`  | `{ pipelineStage, stagePosition }`| `{ lead }`       | Persist a card's new stage and/or position.          |

Both endpoints require a valid session cookie (same auth pattern as the rest of the `/api/leads` routes) and return `401` when unauthenticated. The PATCH route returns `400` if `pipelineStage` is not one of the five valid stages or `stagePosition` is not a number.

The data layer (`lib/leads.ts`) backs these with `getPipelineLeads()` and `updateLeadStage(id, pipelineStage, stagePosition)`.

---

## Database migration required

The Kanban board does **not** work until the two new columns exist on the `leads` table.

Before using the Pipeline, open the **Supabase SQL editor** and run:

```
supabase/pipeline_stage.sql
```

This migration adds the `pipeline_stage` and `stage_position` columns (with the stage `CHECK` constraint and sensible defaults) plus an index on `(pipeline_stage, stage_position)` for fast ordered reads. Existing leads automatically default to the **New Leads** stage at position `0`.

---

## Key Files

| File                                       | Purpose                                              |
| ------------------------------------------ | ---------------------------------------------------- |
| `supabase/pipeline_stage.sql`              | Migration — adds the two columns + index.            |
| `lib/types.ts`                             | `PipelineStage` type + `PIPELINE_STAGES` constant.   |
| `lib/leads.ts`                             | `getPipelineLeads()`, `updateLeadStage()`, `mapRow`. |
| `app/api/pipeline/route.ts`                | `GET /api/pipeline`.                                 |
| `app/api/leads/[id]/stage/route.ts`        | `PATCH /api/leads/{id}/stage`.                        |
| `app/(dashboard)/pipeline/page.tsx`        | The Kanban board UI.                                 |
| `components/sidebar.tsx`                    | Pipeline nav item.                                   |
