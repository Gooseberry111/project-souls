<script setup>
/* =========================================================
   MODAL

   Every modal in the app was a bare div: no Escape key, no
   focus handling, and nothing telling a screen reader that a
   dialog had opened. This wraps that up once so each of them
   behaves the same way.
========================================================= */

import { nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  /* While a save is in flight, Escape and backdrop clicks are
     ignored - closing then would hide the outcome. */
  busy: { type: Boolean, default: false },
  labelledBy: { type: String, default: undefined },
  size: { type: String, default: "md" },
});

const emit = defineEmits(["close"]);

const panel = ref(null);

let previouslyFocused = null;

const requestClose = () => {
  if (props.busy) return;

  emit("close");
};

const onKeydown = (event) => {
  if (!props.open) return;

  if (event.key === "Escape") {
    event.stopPropagation();
    requestClose();
    return;
  }

  /* Keep Tab inside the dialog: tabbing onto the page behind an
     open modal is disorienting and, with a backdrop, invisible. */
  if (event.key !== "Tab" || !panel.value) return;

  const focusable = panel.value.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );

  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previouslyFocused = document.activeElement;

      // The page behind must not scroll under the dialog.
      document.body.style.overflow = "hidden";

      await nextTick();

      const target = panel.value?.querySelector(
        "[data-autofocus], button, input, select, textarea",
      );

      target?.focus?.();
    } else {
      document.body.style.overflow = "";

      previouslyFocused?.focus?.();
      previouslyFocused = null;
    }
  },
);

onMounted(() => document.addEventListener("keydown", onKeydown));

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-100 ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="modal-backdrop"
      @click.self="requestClose"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledBy"
        :class="[
          'glass-panel max-h-[90vh] w-full overflow-y-auto p-6',
          size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-lg' : 'max-w-md',
        ]"
      >
        <slot />
      </div>
    </div>
  </Transition>
</template>
