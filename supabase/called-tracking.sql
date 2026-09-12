-- =========================================================
-- Called tracking
--
-- Run this in the Supabase SQL Editor after
-- texted-and-deletes.sql. It is safe to re-run.
-- =========================================================


-- ---------------------------------------------------------
-- 1. CALLED
--
-- Same reasoning as texted_at. contacts.status holds one
-- value at a time, so a person who was called and then moved
-- to "Following Up" or "Not Reachable" stops counting as
-- called - which would under-report the members doing the
-- most thorough follow-up. The act of calling gets its own
-- column; status stays the follow-up outcome.
-- ---------------------------------------------------------

alter table public.contacts
  add column if not exists called_at timestamptz;

create index if not exists contacts_called_at_idx
  on public.contacts (called_at)
  where called_at is not null;


-- ---------------------------------------------------------
-- 2. BACKFILL
--
-- Everyone already marked "Called" was called at some point,
-- so seed the new column from the existing status. created_at
-- is the closest timestamp on hand - the exact moment was
-- never recorded. Only fills rows that are still null, so
-- re-running will not overwrite real call times.
-- ---------------------------------------------------------

update public.contacts
set called_at = coalesce(created_at, now())
where status = 'Called'
  and called_at is null;
