-- Unify lead status with the pipeline funnel.
-- The leads.status column had a CHECK constraint (leads_status_check) that only
-- allowed the OLD values (New / Contacted / Qualified / Dismissed). After the UI
-- switched to the funnel vocabulary, every insert with status 'New Leads' failed
-- with Postgres error 23514, so no new leads could be saved. This migration maps
-- legacy values and replaces the constraint with the new allowed set.

-- 1) Map any existing legacy status values to the new funnel.
UPDATE leads SET status = 'New Leads'     WHERE status = 'New';
UPDATE leads SET status = 'Engaged'       WHERE status = 'Contacted';
UPDATE leads SET status = 'Proposal Sent' WHERE status = 'Qualified';
UPDATE leads SET status = 'Lost'          WHERE status = 'Dismissed';
-- (Won has no legacy equivalent.)

-- 2) Replace the CHECK constraint with the new vocabulary.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('New Leads', 'Engaged', 'Proposal Sent', 'Won', 'Lost'));

-- 3) Make 'New Leads' the column default for fresh inserts.
ALTER TABLE leads ALTER COLUMN status SET DEFAULT 'New Leads';
