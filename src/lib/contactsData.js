/* =========================================================
   CONTACTS DATA

   The join every screen that lists contacts needs: who recorded
   them, which outing they came from, and therefore which centre.

   Four flat queries in one wave, joined here. Deliberately no
   filtering by a list of ids: doing that meant putting several
   hundred uuids in a query string, which the gateway rejects
   outright once the list is long enough - a bare 400 that took a
   console trace to explain. The lookup tables are small, so
   fetching them whole is both faster and safer.
========================================================= */

import { centreLabel } from "./centres";
import { supabase } from "./supabase";

export const fetchContactsWithContext = async () => {
  const [outingsResult, contactsResult, linksResult, profilesResult] =
    await Promise.all([
      supabase
        .from("evangelism_outings")
        .select("id, title, outing_date, location, created_by, created_at")
        .order("outing_date", { ascending: false })
        .order("created_at", { ascending: false }),

      supabase
        .from("contacts")
        .select(
          "id, name, phone, notes, status, called_at, texted_at, created_at, added_by",
        )
        .order("created_at", { ascending: false }),

      supabase.from("outing_contacts").select("outing_id, contact_id"),

      supabase.from("profiles").select("id, full_name, team"),
    ]);

  for (const result of [
    outingsResult,
    contactsResult,
    linksResult,
    profilesResult,
  ]) {
    if (result.error) throw result.error;
  }

  const outingList = outingsResult.data || [];
  const contactList = contactsResult.data || [];
  const links = linksResult.data || [];
  const profileList = profilesResult.data || [];

  const profileMap = new Map(
    profileList.map((profile) => [profile.id, profile]),
  );

  const outingMap = new Map(outingList.map((outing) => [outing.id, outing]));

  /* One pass over the links builds both things that need them:
     how many people each outing reached, and which outing each
     contact belongs to. */
  const countByOuting = new Map();
  const outingByContact = new Map();

  links.forEach((link) => {
    countByOuting.set(
      link.outing_id,
      (countByOuting.get(link.outing_id) || 0) + 1,
    );

    const outing = outingMap.get(link.outing_id);

    if (!outing) return;

    const current = outingByContact.get(link.contact_id);

    /* A contact can be on more than one outing. Take the earliest,
       deterministically - last-write-wins meant their centre
       flipped between refreshes depending on the order the rows
       came back in. */
    if (
      !current ||
      new Date(outing.outing_date) < new Date(current.outing_date)
    ) {
      outingByContact.set(link.contact_id, outing);
    }
  });

  const outings = outingList.map((outing) => {
    const profile = profileMap.get(outing.created_by);

    return {
      ...outing,

      submitterName: profile?.full_name || "Member",

      team: profile?.team || "No team",

      contactsCount: countByOuting.get(outing.id) || 0,
    };
  });

  const contacts = contactList.map((contact) => {
    const outing = outingByContact.get(contact.id);
    const profile = profileMap.get(contact.added_by);

    return {
      ...contact,

      /* The outing carries the centre. Contacts have no centre of
         their own - nothing ever set one. */
      centre: centreLabel(outing?.location),

      /* Kept raw as well, because the invitation text needs the
         stored value rather than the label to pick an address. */
      centreValue: outing?.location || "",

      outingId: outing?.id || null,

      outingDate: outing?.outing_date || contact.created_at,

      addedBy: profile?.full_name || "Unknown",

      team: profile?.team || "No Team",

      status: contact.status || "New",
    };
  });

  return { contacts, outings };
};
