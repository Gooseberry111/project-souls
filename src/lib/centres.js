/* =========================================================
   CENTRES

   The church's worship centres. The list used to be written
   out again in every screen that needed it - the record form,
   the contact filters, the pastor's breakdown, the invitation
   text - which is how the wording drifted apart.

   `value` is what is stored in the database and must not be
   changed: "Gbaggivilla" is a typo that already exists on
   every row recorded so far, so it is kept as the key and
   corrected only in `label`, which is what people read.
========================================================= */

export const CENTRES = [
  {
    value: "Barnawa",
    label: "Barnawa",
    detail: "Chalawa, opposite Millennium Suite",
    address: "Chalawa, Opposite millennium suite, Barnawa",
    /* Every spelling this centre has been written as. Matching
       has to be generous here: getting it wrong puts the other
       centre's address into somebody's invitation. */
    aliases: ["barnawa", "banawa", "chalawa"],
  },
  {
    value: "Gbaggivilla",
    label: "Gbagyivilla",
    detail: "John Tanko street, off Joel Bala",
    address: "John Tanko street off Joel Bala Gbayi villa",
    aliases: ["gbaggivilla", "gbagyivilla", "gbayivilla", "gbayi", "gbagi"],
  },
];

export const CENTRE_VALUES = CENTRES.map((centre) => centre.value);

const findCentre = (value) => {
  if (!value) return null;

  const needle = String(value).trim().toLowerCase();

  /* Exact stored value first - that is what the app writes. */
  const exact = CENTRES.find(
    (centre) => centre.value.toLowerCase() === needle,
  );

  if (exact) return exact;

  /* Then the known spellings, ignoring spaces, so "Gbayi villa"
     and "gbayivilla" both land on the same centre.

     The length floor matters: without it "" (from "-" or "2")
     is a substring of every alias and "na" (from "N/A") sits
     inside "barnawa", so junk would resolve to a real centre
     and put the wrong address into somebody's invitation. */
  const squashed = needle.replace(/[^a-z]/g, "");

  if (squashed.length < 4) return null;

  return (
    CENTRES.find((centre) =>
      centre.aliases.some(
        (alias) =>
          squashed.includes(alias) ||
          // A truncation of a known spelling, e.g. "gbag".
          alias.startsWith(squashed),
      ),
    ) || null
  );
};

/* What to show on screen for a stored centre value. */
export const centreLabel = (value) => {
  const centre = findCentre(value);

  if (centre) return centre.label;

  return value || "Unknown";
};

/* The address that goes into the invitation text. An unrecognised
   centre falls back to Barnawa, which is what this has always
   done - but that is a guess, so it is worth knowing about. */
export const centreAddress = (value) => {
  const centre = findCentre(value);

  if (!centre) {
    console.warn(
      `Unrecognised centre "${value}" - using the Barnawa address.`,
    );
  }

  return (centre || CENTRES[0]).address;
};

/* The title stored on an outing. Generated rather than typed, so
   it follows the centre whenever the centre is corrected. */
export const outingTitleFor = (value) => `${centreLabel(value)} Centre`;
