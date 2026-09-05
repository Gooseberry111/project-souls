-- =========================================================
-- Row Level Security fixes
--
-- Run this in the Supabase SQL Editor for project
-- julkhcudftedvyzfabqn. It is safe to re-run.
-- =========================================================


-- ---------------------------------------------------------
-- Helper: is this user a pastor?
--
-- SECURITY DEFINER so it can read profiles from inside a
-- policy without tripping over that table's own RLS.
-- ---------------------------------------------------------

create or replace function public.is_pastor(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_pastor from public.profiles p where p.id = uid),
    false
  );
$$;

grant execute on function public.is_pastor(uuid) to authenticated;


-- =========================================================
-- 1. PROFILES - stop members promoting themselves
--
-- The UPDATE policy allows a user to change their own row,
-- and RLS cannot restrict which COLUMNS that covers. Any
-- member could set is_pastor = true on themselves from the
-- browser console and unlock the pastor view and the whole
-- first-timer table. Column privileges close that.
-- =========================================================

revoke update on public.profiles from anon, authenticated;

grant update (full_name, phone, team) on public.profiles to authenticated;


-- INSERT has the same hole: ensureProfile() sends is_pastor
-- from the browser. This trigger overrides whatever the
-- client sends, so the role is decided by the database.
--
-- To make someone a pastor later, add their email here and
-- update their existing row from the SQL editor.

create or replace function public.set_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_email text;
begin
  select lower(u.email) into user_email
  from auth.users u
  where u.id = new.id;

  new.is_pastor := coalesce(
    user_email in ('kelvinherogod@gmail.com'),
    false
  );

  new.is_first_timer_coordinator := coalesce(
    user_email in (
      'udembaugochukwu09@gmail.com',
      'uzomak22@gmail.com',
      'graceukat@gmail.com'
    ),
    false
  );

  new.role := case
                when new.is_pastor then 'pastor'
                when new.is_first_timer_coordinator then 'coordinator'
                else 'member'
              end;

  return new;
end;
$$;

drop trigger if exists set_profile_role on public.profiles;

create trigger set_profile_role
before insert on public.profiles
for each row
execute function public.set_profile_role();


-- =========================================================
-- 2. CONTACTS - pastors can edit any contact
--
-- The app lets a pastor edit any outing, but the old policy
-- allowed updates only where added_by = auth.uid(), so a
-- pastor's edit silently matched zero rows.
-- =========================================================

drop policy if exists "Users can update their own contacts" on public.contacts;

create policy "Owners and pastors can update contacts"
on public.contacts
for update
to authenticated
using (added_by = auth.uid() or public.is_pastor(auth.uid()))
with check (added_by = auth.uid() or public.is_pastor(auth.uid()));


drop policy if exists "Users can delete their own contacts" on public.contacts;

create policy "Owners and pastors can delete contacts"
on public.contacts
for delete
to authenticated
using (added_by = auth.uid() or public.is_pastor(auth.uid()));


-- =========================================================
-- 3. OUTING_CONTACTS - links must belong to your own outing
--
-- The old INSERT check was literally `true`, so any member
-- could attach contacts to anyone else's outing.
-- =========================================================

drop policy if exists "Authenticated users can add outing contacts"
  on public.outing_contacts;

create policy "Add people to your own outing"
on public.outing_contacts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.evangelism_outings o
    where o.id = outing_id
      and (o.created_by = auth.uid() or public.is_pastor(auth.uid()))
  )
);


-- There was no DELETE policy at all, so a person could never
-- be removed from an outing.

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
);


-- =========================================================
-- 4. EVANGELISM_OUTINGS - allow corrections
--
-- Only INSERT and SELECT existed, so a saved outing could
-- never be edited or removed by anyone.
-- =========================================================

drop policy if exists "Owners and pastors can update outings"
  on public.evangelism_outings;

create policy "Owners and pastors can update outings"
on public.evangelism_outings
for update
to authenticated
using (created_by = auth.uid() or public.is_pastor(auth.uid()))
with check (created_by = auth.uid() or public.is_pastor(auth.uid()));


drop policy if exists "Owners and pastors can delete outings"
  on public.evangelism_outings;

create policy "Owners and pastors can delete outings"
on public.evangelism_outings
for delete
to authenticated
using (created_by = auth.uid() or public.is_pastor(auth.uid()));


-- =========================================================
-- 5. FIRST_TIMERS - one insert policy instead of two
--
-- Two overlapping INSERT policies were OR'd together, and
-- the looser one did not require added_by = auth.uid(), so
-- a record could be filed under someone else's name.
-- =========================================================

drop policy if exists "Coordinators can add first timers" on public.first_timers;

drop policy if exists "Pastors and coordinators can add first timers"
  on public.first_timers;

create policy "Pastors and coordinators can add first timers"
on public.first_timers
for insert
to authenticated
with check (
  added_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_pastor = true or p.is_first_timer_coordinator = true)
  )
);
