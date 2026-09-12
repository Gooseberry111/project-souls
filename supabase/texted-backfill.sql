-- =========================================================
-- Backfill texted_at from called contacts
--
-- Run in the Supabase SQL Editor AFTER called-tracking.sql.
-- Safe to re-run.
-- =========================================================


-- ---------------------------------------------------------
-- The texted feature only started recording from the day it
-- shipped, so every contact reached before then reads as
-- "never texted" even though members were texting all along.
--
-- Standing assumption for this one backfill: anyone who was
-- called was also texted. From the next outreach onward the
-- column fills from real taps of the Text button, so this is
-- a one-off seed, not an ongoing rule.
--
-- It reuses called_at as the timestamp - that is the closest
-- moment on record - and touches only rows still null, so
-- genuine texts already logged are never overwritten.
-- ---------------------------------------------------------

update public.contacts
set texted_at = called_at
where called_at is not null
  and texted_at is null;


-- How many rows now carry each marker, to sanity-check the run.
select
  count(*)                                as total_contacts,
  count(*) filter (where called_at is not null) as called,
  count(*) filter (where texted_at is not null) as texted
from public.contacts;
