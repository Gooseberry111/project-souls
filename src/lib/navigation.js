/* =========================================================
   BACK NAVIGATION

   Back buttons used to push a hardcoded route, so "← Back to
   pastor summary" sent you to the summary even when you had
   arrived from the dashboard. This steps back through real
   history instead.

   The fallback covers the case where there is nothing to go
   back to - a shared link, a refresh, or the first page of
   the session - because history.back() there would leave the
   app entirely.
========================================================= */

export const goBack = (router, fallback = "/dashboard") => {
  const hasHistory = Boolean(window.history.state?.back);

  if (hasHistory) {
    router.back();
    return;
  }

  router.replace(fallback);
};
