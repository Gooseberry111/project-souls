/* =========================================================
   WEEK RANGE

   A church week runs Saturday 00:00 -> Friday 23:59.
   Everything weekly (rankings, activity counts) therefore
   resets every Friday night.
========================================================= */

export const getWeekRange = (reference = new Date()) => {
  const now = new Date(reference);

  // getDay(): 0 = Sunday ... 6 = Saturday
  const daysSinceSaturday = (now.getDay() + 1) % 7;

  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceSaturday);
  start.setHours(0, 0, 0, 0);

  // Exclusive end: the following Saturday at 00:00
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { start, end };
};

/* Local YYYY-MM-DD, for comparing against plain date columns. */
export const toDateKey = (date) => {
  return (
    `${date.getFullYear()}-` +
    `${String(date.getMonth() + 1).padStart(2, "0")}-` +
    `${String(date.getDate()).padStart(2, "0")}`
  );
};

/* e.g. "Sep 5 - Sep 11" */
export const formatWeekLabel = ({ start, end }) => {
  const options = { month: "short", day: "numeric" };

  // Last day of the week is the Friday before the exclusive end.
  const lastDay = new Date(end);
  lastDay.setDate(end.getDate() - 1);

  return `${start.toLocaleDateString("en-US", options)} - ${lastDay.toLocaleDateString(
    "en-US",
    options,
  )}`;
};
