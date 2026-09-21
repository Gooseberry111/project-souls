/* =========================================================
   RELATIVE TIME

   "3 days ago" answers the question people actually have
   about a contact - how long has this been sitting? - which
   a formatted date makes them work out for themselves.
========================================================= */

export const relativeTime = (value) => {
  if (!value) return "";

  const then = new Date(value);

  if (Number.isNaN(then.getTime())) return "";

  const seconds = Math.round((Date.now() - then.getTime()) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.round(days / 365)}y ago`;
};

/* Whole days since a timestamp, for "sitting untouched" checks. */
export const daysSince = (value) => {
  if (!value) return null;

  const then = new Date(value);

  if (Number.isNaN(then.getTime())) return null;

  return Math.floor((Date.now() - then.getTime()) / 86400000);
};
