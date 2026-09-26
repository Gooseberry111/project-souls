-- =========================================================
-- New call outcomes: "No Answer" and "Switched Off"
--
-- Run this in the Supabase SQL Editor. It is safe to re-run.
--
-- WHY THIS IS NEEDED
--
-- The app now offers six call outcomes, but contacts.status was
-- created to accept only the original four. The database rejects
-- the two new ones, which is why "No Answer" and "Switched Off"
-- error while Called, Following Up and Not Reachable save fine.
--
-- RUN SECTION 1 FIRST, ON ITS OWN, and read what it prints.
-- It changes nothing. It tells you which of Section 2 or
-- Section 3 applies to your database.
-- =========================================================


-- ---------------------------------------------------------
-- SECTION 1 - LOOK, DO NOT TOUCH
--
-- Highlight this section alone and run it.
-- ---------------------------------------------------------

select
  t.typname                                   as status_type,
  case t.typtype
    when 'e' then 'ENUM - run SECTION 2'
    else          'TEXT - run SECTION 3'
  end                                         as which_section,
  not a.attnotnull                            as nullable
from pg_attribute a
join pg_class c     on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_type t      on t.oid = a.atttypid
where n.nspname = 'public'
  and c.relname = 'contacts'
  and a.attname = 'status';

-- Any CHECK constraints currently on the table. Keep this output:
-- it is the only record of them before Section 3 replaces one.

select
  conname                        as constraint_name,
  pg_get_constraintdef(oid)      as definition
from pg_constraint
where conrelid = 'public.contacts'::regclass
  and contype = 'c'
order by conname;

-- What status values your rows actually hold today.

select coalesce(status::text, '(null)') as status, count(*)
from public.contacts
group by status
order by count(*) desc;


-- =========================================================
-- SECTION 2 - ONLY IF SECTION 1 SAID "ENUM"
--
-- Run these two lines ONE AT A TIME. PostgreSQL will not let a
-- new enum label be added and used inside the same transaction,
-- and the SQL Editor runs a whole selection as one transaction -
-- so running them together, or together with Section 3, fails.
--
-- Replace contact_status with the type name Section 1 printed.
-- =========================================================

-- alter type public.contact_status add value if not exists 'No Answer';

-- alter type public.contact_status add value if not exists 'Switched Off';


-- =========================================================
-- SECTION 3 - ONLY IF SECTION 1 SAID "TEXT"
--
-- Replaces the constraint that limits status to the old four
-- values with one allowing all six.
-- =========================================================

do $$
declare
  con record;
  dropped int := 0;
begin
  -- Only constraints that govern status ON ITS OWN. A check that
  -- happens to mention status alongside other columns is somebody
  -- else's business rule and must not be collateral damage.
  for con in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.contacts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~* '^CHECK \(\(*status[^a-z_]'
  loop
    -- Printed so the old rule is recoverable from the run log.
    raise notice 'dropping % was: %', con.conname, con.def;

    execute format(
      'alter table public.contacts drop constraint %I', con.conname
    );

    dropped := dropped + 1;
  end loop;

  if dropped = 0 then
    raise notice 'no status-only check constraint found.';
  end if;
end $$;

alter table public.contacts
  drop constraint if exists contacts_status_check;

-- NOT VALID on purpose. A plain ADD CONSTRAINT scans every
-- existing row, so one legacy value outside the six - 'Texted',
-- 'called' in the wrong case, a stray space from an import -
-- aborts the whole thing and your bug stays unfixed. NOT VALID
-- applies the rule to new writes immediately, which is what
-- unblocks "No Answer" and "Switched Off", and leaves old rows
-- alone.
--
-- NULL stays allowed: rows predating the column's default have
-- it, and the app already reads a null status as "New".
alter table public.contacts
  add constraint contacts_status_check
  check (
    status is null
    or status in (
      'New',
      'Called',
      'No Answer',
      'Switched Off',
      'Not Reachable',
      'Following Up'
    )
  ) not valid;


-- Applies the rule to the rows that already exist, not just to
-- new writes. Enabled because the census above was checked first
-- and came back clean: 679 rows, all six values accounted for
-- (Called 421, New 150, Not Reachable 71, Following Up 37) and no
-- NULLs. If you are running this against a different database,
-- re-read the census before trusting that - if it errors, some
-- row holds a value outside the list.
alter table public.contacts validate constraint contacts_status_check;


-- ---------------------------------------------------------
-- VERIFY
--
-- Deliberately no test INSERT: contacts.added_by is NOT NULL and
-- under row level security, so a throwaway row would either abort
-- this script or leave junk behind. Read the definition instead -
-- it should list all six outcomes.
-- ---------------------------------------------------------

select pg_get_constraintdef(oid) as status_rule_now
from pg_constraint
where conrelid = 'public.contacts'::regclass
  and conname = 'contacts_status_check';
