/* =========================================================
   PHONE

   Shared by every screen with a Call button, so a number that
   dials from one screen dials from all of them.
========================================================= */

export const normalizePhone = (phone) => {
  if (!phone) return "";

  // Strip spaces, brackets, dashes - and any "+" that is not the
  // leading one, so "+234 (0)801..." does not survive as a mess.
  let value = String(phone).trim().replace(/[^\d+]/g, "");

  const hadPlus = value.startsWith("+");

  value = value.replace(/\+/g, "");

  if (!value) return "";

  // Country code first, so the trunk zero in "+234 (0)803..."
  // is dropped rather than carried into the result - it is a
  // domestic-dialling prefix and must not survive the +234.
  if (value.startsWith("234")) {
    let local = value.slice(3);

    if (local.startsWith("0")) {
      local = local.slice(1);
    }

    if (local.length === 10) {
      return "+234" + local;
    }

    return "+" + value;
  }

  // 08012345678 -> +2348012345678
  if (value.startsWith("0") && value.length >= 10) {
    return "+234" + value.slice(1);
  }

  // 8012345678 -> +2348012345678 (the leading zero dropped)
  if (!hadPlus && value.length === 10 && value.startsWith("8")) {
    return "+234" + value;
  }

  return hadPlus ? "+" + value : value;
};

export const getCallLink = (phone) => {
  const normalized = normalizePhone(phone);

  return normalized ? `tel:${normalized}` : "#";
};

/* Every shape a given number might already be stored as. Phones
   are saved exactly as they were typed, so the same person can
   sit in the table as "08012345678" and "+2348012345678" - and
   a plain equality check would miss the duplicate. */
export const phoneVariants = (phone) => {
  const raw = String(phone || "").trim();

  if (!raw) return [];

  const normalized = normalizePhone(raw);

  const variants = new Set([raw, normalized]);

  if (normalized.startsWith("+234")) {
    const local = normalized.slice(4);

    variants.add("0" + local);
    variants.add("234" + local);
    variants.add(local);
  }

  return [...variants].filter(Boolean);
};

/* Do two numbers reach the same phone, however they were typed? */
export const samePhone = (a, b) => {
  const left = normalizePhone(a);

  return Boolean(left) && left === normalizePhone(b);
};
