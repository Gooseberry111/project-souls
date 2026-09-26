/* =========================================================
   INVITATION

   The text sent to a contact. The centre decides the address, so
   this lives beside the centre list rather than inside whichever
   screen happens to have a Text button - there are three of them
   now, and they must not drift into sending different wording or,
   worse, the wrong address.
========================================================= */

import { centreAddress } from "./centres";
import { normalizePhone } from "./phone";

export const buildInvitation = (centreValue) =>
  `Good day beloved

You are warmly invited to worship with us at Transfiguration Church on SUNDAY by 8am

@ ${centreAddress(centreValue)}`;

export const getSmsLink = (phone, centreValue) => {
  const normalized = normalizePhone(phone);

  if (!normalized) return "#";

  return `sms:${normalized}?body=${encodeURIComponent(
    buildInvitation(centreValue),
  )}`;
};
