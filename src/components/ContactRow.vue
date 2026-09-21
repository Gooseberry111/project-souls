<script setup>
/* =========================================================
   CONTACT ROW

   One person, with the two things a member wants to do about
   them: call, or write down what happened. Used by the Mine
   tab's search results and its attention list.
========================================================= */

import { statusBadgeClass } from "../lib/contactStatus";
import { relativeTime } from "../lib/time";

defineProps({
  contact: { type: Object, required: true },
  /* Why this person is on the list, when they are on one. */
  reason: { type: String, default: "" },
});

defineEmits(["call", "edit"]);

const initialOf = (name) =>
  (name || "?").trim().charAt(0).toUpperCase() || "?";
</script>

<template>
  <div class="glass-card flex items-center gap-3 p-3 sm:p-4">
    <div
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E2C45A]/30 to-[#A8861F]/20 text-xs font-black text-[#D4AF37] ring-1 ring-[#D4AF37]/20"
      aria-hidden="true"
    >
      {{ initialOf(contact.name) }}
    </div>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-semibold text-white">
        {{ contact.name }}
      </p>

      <p class="mt-0.5 flex flex-wrap items-center gap-1.5">
        <span
          :class="[statusBadgeClass(contact.status || 'New'), 'px-2 py-0.5']"
        >
          {{ reason || contact.status || "New" }}
        </span>

        <span
          v-if="contact.texted_at"
          class="badge-blue px-2 py-0.5"
          :title="`Texted ${relativeTime(contact.texted_at)}`"
        >
          Texted
        </span>

        <span class="truncate text-[11px] text-gray-500">
          {{ contact.phone || "No number" }}
        </span>
      </p>

      <p
        v-if="contact.called_at"
        class="mt-0.5 truncate text-[11px] text-gray-600"
      >
        Last called {{ relativeTime(contact.called_at) }}
      </p>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        @click="$emit('edit', contact)"
        :aria-label="`Edit feedback for ${contact.name}`"
        class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-gray-400 transition hover:bg-white/[0.07] hover:text-white active:scale-[0.98]"
      >
        ✎
      </button>

      <button
        v-if="contact.phone"
        type="button"
        @click="$emit('call', contact)"
        :aria-label="`Call ${contact.name}`"
        class="flex items-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/20 active:scale-[0.98]"
      >
        <span aria-hidden="true">📞</span>
        <span>Call</span>
      </button>
    </div>
  </div>
</template>
