/* =========================================================
   TOASTS

   Every save in this app used to end with a modal simply
   closing, which looks identical to a modal being dismissed -
   so people saved twice to be sure. A toast is the smallest
   thing that answers "did that work?".

   A module-level array rather than a store: nothing needs to
   persist it, and any component can push to it.
========================================================= */

import { ref } from "vue";

export const toasts = ref([]);

let nextId = 0;

const push = (message, tone, timeout) => {
  if (!message) return;

  const id = ++nextId;

  toasts.value.push({ id, message, tone });

  if (timeout) {
    setTimeout(() => dismissToast(id), timeout);
  }

  return id;
};

export const dismissToast = (id) => {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
};

export const toastSuccess = (message) => push(message, "success", 3200);

/* Errors stay until dismissed. They usually mean something did
   not save, and that should not disappear on its own. */
export const toastError = (message) => push(message, "error", 0);

export const toastInfo = (message) => push(message, "info", 3200);
