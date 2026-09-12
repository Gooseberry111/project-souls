import { supabase } from "./supabase";
import { getWeekRange } from "./week";

/* =========================================================
   CONTRIBUTOR STATS

   Per-person tallies of what each member has recorded, used
   by the pastor summary (top five) and the full contributors
   page. One pass over contacts feeds both.

   Pastors are left out entirely. A pastor does not go on
   outings, so including him only ever added a permanent zero
   to every roster and dragged down "how many members went out
   this week". He oversees the work rather than appearing in
   it. The is_pastor flag drives this, so it keeps working if
   there is ever more than one.
========================================================= */

// Paged: a plain select caps at 1000 rows, which would quietly
// under-count contributors once the church passes that many rows.
export const fetchAllRows = async (table, columns) => {
  const pageSize = 1000;

  const rows = [];
  let offset = 0;

  while (true) {
    const { data: page, error: pageError } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (pageError) throw pageError;

    rows.push(...(page || []));

    if (!page || page.length < pageSize) break;

    offset += pageSize;
  }

  return rows;
};

export const loadContributorStats = async () => {
  const { start: weekStart, end: weekEnd } = getWeekRange();

  const tallies = {};

  const tallyFor = (id) => {
    if (!tallies[id]) {
      tallies[id] = { total: 0, week: 0, called: 0, texted: 0 };
    }

    return tallies[id];
  };

  const contacts = await fetchAllRows(
    "contacts",
    "added_by, created_at, called_at, texted_at",
  );

  for (const contact of contacts) {
    if (!contact.added_by) continue;

    const tally = tallyFor(contact.added_by);

    tally.total += 1;

    const createdAt = contact.created_at ? new Date(contact.created_at) : null;

    if (createdAt && createdAt >= weekStart && createdAt < weekEnd) {
      tally.week += 1;
    }

    if (contact.called_at) {
      tally.called += 1;
    }

    if (contact.texted_at) {
      tally.texted += 1;
    }
  }

  const profiles = await fetchAllRows(
    "profiles",
    "id, full_name, team, is_pastor",
  );

  const profileMap = {};
  const pastorIds = new Set();

  for (const profile of profiles) {
    profileMap[profile.id] = profile;

    if (profile.is_pastor) {
      pastorIds.add(profile.id);
    }
  }

  // Every member appears, including those yet to record anyone -
  // a pastor looking at all contributors needs the zeroes too.
  // The pastors themselves are the exception; see the note above.
  const ids = new Set(
    [
      ...profiles.map((profile) => profile.id),
      ...Object.keys(tallies),
    ].filter((id) => !pastorIds.has(id)),
  );

  return [...ids]
    .map((id) => {
      const tally = tallies[id] || {
        total: 0,
        week: 0,
        called: 0,
        texted: 0,
      };

      return {
        id,
        name: profileMap[id]?.full_name || "Unknown",
        team: profileMap[id]?.team || "No team",
        count: tally.total,
        weekCount: tally.week,
        calledCount: tally.called,
        textedCount: tally.texted,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.weekCount - a.weekCount ||
        a.name.localeCompare(b.name),
    );
};
