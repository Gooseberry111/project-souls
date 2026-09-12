-- =========================================================
-- Remove temporary pastor access
--
-- Undoes the grant in texted-and-deletes.sql. Run in the
-- Supabase SQL Editor.
--
-- WARNING: this takes away your own access to /pastor,
-- /pastor/contributors and /first-timers. Sign out and back
-- in afterwards, or the cached profile in localStorage will
-- keep showing pastor links that no longer resolve.
-- =========================================================

update public.profiles
set is_pastor = false,
    role      = case
                  when is_first_timer_coordinator then 'coordinator'
                  else 'member'
                end
where id = '0f4371af-6032-4760-ac38-ea9d0ee3e99f';


-- The trigger decides the role on every INSERT, so the email
-- has to come back out of its list too. Otherwise deleting
-- the profile row and letting the app recreate it would
-- silently restore pastor access.

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


-- Confirm only Pastor Kelvin is left.
select id, full_name, role, is_pastor
from public.profiles
where is_pastor = true;
