/* =========================================================
   CONTACT STATUS

   The follow-up outcome of a contact, shared by every screen
   that shows or edits one so the wording, the order and the
   colours never drift apart.

   "Texted" is deliberately not in this list. It lives in its
   own column (contacts.texted_at) so it can be true alongside
   any outcome here, and it is recorded by the app when a text
   is actually sent - never chosen by hand.
========================================================= */

export const CONTACT_STATUSES = [
  "New",
  "Called",
  "No Answer",
  "Switched Off",
  "Not Reachable",
  "Following Up",
];

/* What a member picks straight after a call. Everything above
   except "New", which means nobody has reached out yet. */
export const CALL_OUTCOMES = CONTACT_STATUSES.filter(
  (status) => status !== "New",
);

/* The outcomes that mean "try again". Nobody spoke to these
   people: the phone rang out or was off, so they are not done
   with - but because they no longer sit on "New", nothing would
   otherwise surface them again. */
export const RETRY_STATUSES = ["No Answer", "Switched Off"];

export const needsAnotherCall = (contact) =>
  RETRY_STATUSES.includes(contact?.status);

/* Green for reached, gold for still in progress, red for the
   number that did not go through, neutral for the rest. */
export const statusBadgeClass = (status) => {
  if (status === "Called") return "badge-green";
  if (status === "Following Up") return "badge-gold";
  if (status === "Not Reachable" || status === "Switched Off")
    return "badge-red";

  return "badge-neutral";
};
