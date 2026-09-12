-- =========================================================
-- Texted tracking + contact deletion
--
-- Run this in the Supabase SQL Editor for project
-- julkhcudftedvyzfabqn, after policies.sql. It is safe to
-- re-run.
-- =========================================================


-- ---------------------------------------------------------
-- 1. TEXTED
--
-- "Called" lives in contacts.status, which holds one value
-- at a time. Texting is a separate act - a person can be
-- both called and texted - so it gets its own column rather
-- than another status that would overwrite the first.
--
-- Timestamp rather than a boolean: it answers "was this
-- person texted?" and "when?" with the same column.
-- ---------------------------------------------------------

alter table public.contacts
  add column if not exists texted_at timestamptz;

create index if not exists contacts_texted_at_idx
  on public.contacts (texted_at)
  where texted_at is not null;


-- ---------------------------------------------------------
-- 2. OUTING_CONTACTS - let a contact's owner unlink it
--
-- Deleting a contact means deleting its outing link first.
-- The existing policy keys off who owns the OUTING, so a
-- member who added someone to another person's outing could
-- not remove their own mistake. Whoever recorded the contact
-- may now unlink it too.
-- ---------------------------------------------------------

drop policy if exists "Remove people from your own outing"
  on public.outing_contacts;

create policy "Remove people from your own outing"
on public.outing_contacts
for delete
to authenticated
using (
  exists (
    select 1
    from public.evangelism_outings o
    where o.id = outing_id
      and (o.created_by = auth.uid() or public.is_pastor(auth.uid()))
  )
  or exists (
    select 1
    from public.contacts c
    where c.id = contact_id
      and c.added_by = auth.uid()
  )
);


-- ---------------------------------------------------------
-- NOTE: a temporary pastor grant used to live here. It has
-- been removed so re-running this file cannot restore it.
-- See revoke-pastor.sql for the statement that took it away.
-- ---------------------------------------------------------
