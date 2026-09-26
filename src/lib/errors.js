/* =========================================================
   ERRORS

   Supabase hands back an object with message, details, hint and
   code, and the app was showing only `message`. For a rejected
   write that message is often just "Bad Request", which tells
   nobody anything.

   Two rules this file exists to enforce:

     - `details` never reaches the screen. Postgres puts the
       whole offending row in it ("Failing row contains (uuid,
       John Doe, 08012345678, <their notes>)"), so showing it
       would put one person's phone number and private feedback
       in front of whoever happened to hit the error. It goes to
       the console only.

     - the return value is always a string. Every caller assigns
       it straight into a rendered ref.
========================================================= */

/* Object.create(null) rather than {}: a plain object literal
   inherits from Object.prototype, so an error carrying
   code: "constructor" or "toString" would look up a function
   and we would render it. */
const KNOWN = Object.create(null);

/* Every key quoted. Unquoted keys look tidy until someone adds a
   SQLSTATE that starts with a zero - 08006, 02000 - which is an
   octal literal and a SyntaxError in a module, taking the whole
   bundle down rather than mis-mapping one error. */
Object.assign(KNOWN, {
  // check_violation - a value the table refuses to store
  "23514": "The database will not accept one of those values.",
  // invalid_text_representation - bad uuid, date, number or enum
  "22P02": "Something in that request was not in a form the database understands.",
  // undefined_column - the app asked for a field that is not there
  "42703":
    "This screen asked the database for a field that does not exist. That is a bug in the app, not something you did.",
  // undefined_table
  "42P01":
    "This screen asked for data that does not exist in the database. That is a bug in the app.",
  // insufficient_privilege / row level security. Deliberately
  // neutral about read vs write: 42501 fires on both.
  "42501": "You do not have permission to do that.",
  // unique_violation
  "23505": "That record already exists.",
  // foreign_key_violation
  "23503": "Something this record depends on is missing.",
  // not_null_violation
  "23502": "A required field was empty.",
});

/* A remedy worth suggesting, but only when the error is actually
   about the status column - 23514 and 22P02 are generic and fire
   on a bad outing link, a phone-format rule, a malformed date. */
const STATUS_REMEDY =
  "If you were saving a call outcome, the database needs supabase/status-outcomes.sql run in Supabase.";

const mentionsStatus = (err) => {
  const haystack = [err?.message, err?.details, err?.hint]
    .filter((part) => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return haystack.includes("status");
};

/* A thrown fetch failure has a message like "Failed to fetch" or
   "NetworkError when attempting to fetch resource", which is
   jargon in place of the one thing the member can act on. */
const looksOffline = (err) => {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }

  if (err instanceof TypeError) return true;

  const message = typeof err?.message === "string" ? err.message : "";

  return /failed to fetch|networkerror|network request failed|load failed/i.test(
    message,
  );
};

/* Promise.all rejects with the first failure; an AggregateError
   hides it behind "All promises were rejected". */
const unwrap = (err) => {
  if (err?.errors?.length) return err.errors[0];

  return err;
};

const BARE_STATUS = /^(bad request|unauthorized|forbidden|not found|conflict)\.?$/i;

export const describeError = (err, fallback = "Something went wrong.") => {
  if (!err) return fallback;

  if (typeof err === "string") return err;

  const actual = unwrap(err);

  if (looksOffline(actual)) {
    return "You appear to be offline. Check your connection and try again.";
  }

  const code = actual?.code;

  const known =
    code != null && Object.hasOwn(KNOWN, String(code))
      ? KNOWN[String(code)]
      : null;

  if (known) {
    const suffix =
      (String(code) === "23514" || String(code) === "22P02") &&
      mentionsStatus(actual)
        ? ` ${STATUS_REMEDY}`
        : "";

    return `${known}${suffix}`;
  }

  /* message and hint only. details is withheld on purpose - see
     the note at the top of this file. */
  const parts = [actual?.message, actual?.hint]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim())
    /* A bare HTTP status is not an explanation, so it earns the
       caller's fallback rather than standing in for it. */
    .filter((part) => !BARE_STATUS.test(part));

  const unique = [...new Set(parts)];

  if (!unique.length) return fallback;

  return unique.join(" — ");
};

/* One place that logs the whole object, so `details` and `code`
   survive in the console even though they never reach the screen.
   Used in place of console.error at every catch site. */
export const logError = (label, err) => {
  const actual = unwrap(err);

  console.error(label, {
    message: actual?.message,
    details: actual?.details,
    hint: actual?.hint,
    code: actual?.code,
    error: err,
  });
};
