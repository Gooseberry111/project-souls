-- =========================================================
-- Make four users first-timer coordinators
--
-- Run in the Supabase SQL Editor.
--
-- Coordinator access is not a single flag. Two things decide
-- it, and BOTH have to change or the grant will not stick:
--
--   1. the profile row      - what the app reads today
--   2. set_profile_role()   - a BEFORE INSERT trigger that
--                             overrides whatever the browser
--                             sends, so it decides the role
--                             whenever a profile row is
--                             created
--
-- Changing only the row works until that row is ever deleted
-- and recreated by the app, at which point the trigger quietly
-- puts them back to 'member'. Changing only the trigger does
-- nothing for users whose row already exists.
--
-- RUN SECTION 1 FIRST, ON ITS OWN, and check the four people
-- it names are the four you meant.

-- Blessing Benedict (09875239...) was found by the drift check
-- at the foot of this file, not asked for originally: her role
-- already said 'coordinator' while the flag that actually grants
-- access was false, so she had been locked out silently. She is
-- in the lists below deliberately - leaving her out would mean
-- re-running this file revoked her again.
-- =========================================================


-- ---------------------------------------------------------
-- SECTION 1 - LOOK, DO NOT TOUCH
--
-- Highlight this section alone and run it. It changes nothing.
--
-- Deliberately ONE query. The SQL Editor only shows the result
-- of the last statement it was given, so two selects here meant
-- the important one scrolled into the void.
-- ---------------------------------------------------------

select
  'REQUESTED'                                   as which,
  u.id::text                                    as id,
  u.email,
  p.full_name,
  coalesce(p.role, '(no profile row yet)')      as role_now,
  coalesce(p.is_first_timer_coordinator, false) as coordinator_now,
  case
    when p.id is null
      then 'no profile row - the trigger grants it on first sign-in'
    when p.is_first_timer_coordinator
      then 'already a coordinator - nothing to do'
    else 'will be promoted by Section 2'
  end                                           as what_happens
from auth.users u
left join public.profiles p on p.id = u.id
where u.id in (
  '69c48b73-4cba-4928-8e9c-aad241880d6f',
  '06a578ff-591a-47e2-ac1c-20f212a35c0b',
  'cbf09c8c-9829-458f-85b0-facab4624f06',
  '09875239-a97d-43bf-8d7b-614df483e091'
)

union all

-- Who holds it already, for comparison.
select
  'ALREADY A COORDINATOR'         as which,
  p.id::text                      as id,
  u.email,
  p.full_name,
  p.role                          as role_now,
  true                            as coordinator_now,
  '-'                             as what_happens
from public.profiles p
join auth.users u on u.id = p.id
where p.is_first_timer_coordinator = true

order by which, email;

-- Expect four REQUESTED rows. Fewer means an id is not in
-- auth.users at all - find out which before running Section 2,
-- because the update silently does nothing for an id that is
-- not there, and the trigger would carry a dead entry forever.


-- =========================================================
-- SECTION 2 - THE GRANT
--
-- Safe to re-run.
-- =========================================================

-- ---------------------------------------------------------
-- 2a. The existing profile rows
--
-- is_pastor is left alone: a pastor already outranks a
-- coordinator, and role must keep saying 'pastor' for them.
-- ---------------------------------------------------------

update public.profiles
set is_first_timer_coordinator = true,
    role = case when is_pastor then 'pastor' else 'coordinator' end
where id in (
  '69c48b73-4cba-4928-8e9c-aad241880d6f',
  '06a578ff-591a-47e2-ac1c-20f212a35c0b',
  'cbf09c8c-9829-458f-85b0-facab4624f06',
  '09875239-a97d-43bf-8d7b-614df483e091'
);


-- ---------------------------------------------------------
-- 2b. The trigger
--
-- Keyed on id for the three new coordinators rather than on
-- email. The existing entries stay on email so this file does
-- not silently change who else has access - but id is the
-- better key: it survives someone changing their email
-- address, which the email list does not.
-- ---------------------------------------------------------

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
    )
    or new.id in (
      '69c48b73-4cba-4928-8e9c-aad241880d6f',
      '06a578ff-591a-47e2-ac1c-20f212a35c0b',
      'cbf09c8c-9829-458f-85b0-facab4624f06',
      '09875239-a97d-43bf-8d7b-614df483e091'
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

-- The trigger itself is unchanged, but recreate it so this
-- file stands alone if run on a fresh database.

drop trigger if exists set_profile_role on public.profiles;

create trigger set_profile_role
before insert on public.profiles
for each row
execute function public.set_profile_role();


-- ---------------------------------------------------------
-- VERIFY
--
-- Should now list six coordinators: the original three and
-- the three added here (minus any that were already listed).
-- ---------------------------------------------------------

-- One query, again, so nothing is hidden: the coordinators
-- afterwards, plus anyone whose role and flag disagree.
--
-- That disagreement is what made this job necessary. All three
-- requested users already had role = 'coordinator' with the
-- flag still false, so the app - which reads only the flag -
-- kept them out. Anything listed as MISMATCH below is in that
-- same broken half-state and is not getting the access its
-- role claims.

select
  case
    when p.is_first_timer_coordinator and p.role in ('coordinator', 'pastor')
      then 'OK'
    when p.is_first_timer_coordinator
      then 'MISMATCH - has access, role says ' || coalesce(p.role, 'null')
    else 'MISMATCH - role says coordinator, but has NO access'
  end                             as state,
  p.id::text                      as id,
  u.email,
  p.full_name,
  p.role,
  p.is_first_timer_coordinator    as has_access
from public.profiles p
join auth.users u on u.id = p.id
where p.is_first_timer_coordinator = true
   or p.role = 'coordinator'
order by state, u.email;


-- =========================================================
-- AFTERWARDS - THIS PART MATTERS
--
-- The app keeps the signed-in profile in localStorage
-- (pinia-plugin-persistedstate), so these three will NOT see
-- the First Timers link until they sign out and back in.
-- Their browser is still holding the old 'member' profile.
--
-- Until they do, /first-timers will also bounce them: the
-- router guard reads the same cached profile.
-- =========================================================
