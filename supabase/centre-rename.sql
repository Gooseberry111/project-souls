-- =========================================================
-- Branch -> Centre
--
-- Run this in the Supabase SQL Editor. It is safe to re-run.
--
-- The app no longer says "branch" anywhere, but outing titles
-- were generated and STORED at record time - every outing saved
-- so far literally reads "Barnawa Branch" in the database, and
-- no amount of relabelling in the app will change that.
--
-- Only the title changes. evangelism_outings.location and
-- first_timers.branch keep their names and their values, which
-- is what every query and every existing row relies on.
-- =========================================================

update public.evangelism_outings
set title = replace(title, ' Branch', ' Centre')
where title like '% Branch';


-- The stored value "Gbaggivilla" is a typo that predates this,
-- and it is the key the app matches on, so it is deliberately
-- left alone - the app shows "Gbagyivilla" for it instead.
-- See src/lib/centres.js.

update public.evangelism_outings
set title = 'Gbagyivilla Centre'
where location = 'Gbaggivilla';


-- How many titles still mention a branch, to confirm the run.

select count(*) as titles_still_saying_branch
from public.evangelism_outings
where title ilike '%branch%';
