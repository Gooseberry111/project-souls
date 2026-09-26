<script setup>
/* =========================================================
   FOLLOW UP

   The dashboard says "12 still to call". This is the page that
   answers "which twelve?".

   Before this, those cards dropped you on the contacts list with
   the advice "open an outing to call them" - so finding the
   uncalled twelve meant opening every outing in turn and reading
   each person's badges. The names are the whole point, so they
   are what this shows, each with the one button that clears it.
========================================================= */

import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { CALL_OUTCOMES, statusBadgeClass } from "../lib/contactStatus";
import { fetchContactsWithContext } from "../lib/contactsData";
import { describeError, logError } from "../lib/errors";
import { getSmsLink } from "../lib/invitation";
import { goBack } from "../lib/navigation";
import { getCallLink } from "../lib/phone";
import { supabase } from "../lib/supabase";
import { relativeTime, daysSince } from "../lib/time";
import { toastError, toastSuccess } from "../lib/toast";
import { useAuthStore } from "../stores/auth";
import AppModal from "../components/AppModal.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const contacts = ref([]);
const loading = ref(true);
const error = ref("");

const isPastor = computed(() => authStore.profile?.is_pastor === true);

/* =========================================================
   WHICH LIST
========================================================= */

const KINDS = {
  uncalled: {
    title: "Still to call",
    eyebrow: "Follow-up",
    blurb: "Nobody has placed a call to these people yet.",
    empty: "Everyone has been called. Nothing outstanding here.",
    matches: (contact) => !contact.called_at,
    action: "call",
  },

  untexted: {
    title: "Still to text",
    eyebrow: "Follow-up",
    blurb: "These people have not been sent the invitation yet.",
    empty: "Everyone has been sent the invitation.",
    matches: (contact) => !contact.texted_at,
    action: "text",
  },

  stale: {
    title: "Sitting untouched",
    eyebrow: "Follow-up",
    blurb:
      "Recorded three or more days ago and never called. These are the ones most likely to be forgotten.",
    empty: "Nothing has been left sitting. Well kept.",
    matches: (contact) => {
      const age = daysSince(contact.created_at);

      return (
        !contact.called_at &&
        (!contact.status || contact.status === "New") &&
        age !== null &&
        age >= 3
      );
    },
    action: "call",
  },
};

const kind = computed(() => KINDS[route.params.kind] || KINDS.uncalled);

/* Members see only what they recorded - chasing it is their job.
   A pastor sees the whole church, which is what his dashboard
   numbers count. `?scope=mine` lets him narrow it anyway. */
const scope = computed(() => {
  if (!isPastor.value) return "mine";

  return route.query.scope === "mine" ? "mine" : "all";
});

const search = ref("");

const visible = computed(() => {
  let result = contacts.value;

  if (scope.value === "mine") {
    result = result.filter(
      (contact) => contact.added_by === authStore.user?.id,
    );
  }

  result = result.filter(kind.value.matches);

  const term = search.value.trim().toLowerCase();

  if (term) {
    result = result.filter(
      (contact) =>
        contact.name?.toLowerCase().includes(term) ||
        contact.phone?.toLowerCase().includes(term),
    );
  }

  /* Oldest first: the longest-neglected deserve the first call. */
  return [...result].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  );
});

/* =========================================================
   LOAD
========================================================= */

const load = async () => {
  loading.value = true;
  error.value = "";

  try {
    const data = await fetchContactsWithContext();

    contacts.value = data.contacts;
  } catch (err) {
    logError("Error loading follow-up list:", err);

    error.value = describeError(err, "Unable to load this list.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/* =========================================================
   PERMISSIONS
========================================================= */

const canModify = (contact) =>
  contact?.added_by === authStore.user?.id || isPastor.value;

/* =========================================================
   CALL

   Records the call, dials, then asks for the outcome once the
   tab comes back - a phone backgrounds this page while the
   dialer is up, so a plain timer could fire unseen.
========================================================= */

const promptContact = ref(null);
const promptStatus = ref("Called");
const promptNotes = ref("");
const savingPrompt = ref(false);
const promptError = ref("");

let pending = null;

const flushPending = () => {
  if (!pending) return;

  const contact = pending;

  pending = null;

  document.removeEventListener("visibilitychange", onReturn);

  if (!canModify(contact)) return;

  promptContact.value = contact;
  promptStatus.value =
    contact.status && contact.status !== "New" ? contact.status : "Called";
  promptNotes.value = contact.notes || "";
  promptError.value = "";
};

function onReturn() {
  if (document.visibilityState === "visible") flushPending();
}

onUnmounted(() => {
  pending = null;

  document.removeEventListener("visibilitychange", onReturn);
});

const callContact = async (contact) => {
  const link = getCallLink(contact?.phone);

  if (link === "#") return;

  if (canModify(contact)) {
    const calledAt = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ called_at: calledAt })
        .eq("id", contact.id);

      if (updateError) throw updateError;

      contact.called_at = calledAt;
    } catch (err) {
      logError("Error recording call:", err);

      toastError(
        describeError(err, "The call could not be recorded."),
      );
    }
  }

  pending = contact;

  document.addEventListener("visibilitychange", onReturn);

  window.location.href = link;

  // Desktop never hides the tab, so nothing else would wake this.
  setTimeout(() => {
    if (document.visibilityState === "visible") flushPending();
  }, 1200);
};

const closePrompt = ({ force = false } = {}) => {
  if (savingPrompt.value && !force) return;

  promptContact.value = null;
  promptNotes.value = "";
  promptError.value = "";
};

const savePrompt = async () => {
  const contact = promptContact.value;

  if (!contact) return;

  savingPrompt.value = true;
  promptError.value = "";

  try {
    const notes = promptNotes.value.trim();

    const { data, error: updateError } = await supabase
      .from("contacts")
      .update({ notes: notes || null, status: promptStatus.value })
      .eq("id", contact.id)
      .select()
      .single();

    if (updateError) throw updateError;

    Object.assign(contact, data);

    closePrompt({ force: true });

    toastSuccess(`Saved for ${contact.name}.`);
  } catch (err) {
    logError("Error saving outcome:", err);

    promptError.value = describeError(err, "Unable to save that.");
  } finally {
    savingPrompt.value = false;
  }
};

/* =========================================================
   TEXT

   No prompt afterwards. The invitation is one-way, so there is
   nothing said back to write down.
========================================================= */

const textContact = async (contact) => {
  const link = getSmsLink(contact?.phone, contact?.centreValue);

  if (link === "#") return;

  if (canModify(contact)) {
    const textedAt = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ texted_at: textedAt })
        .eq("id", contact.id);

      if (updateError) throw updateError;

      contact.texted_at = textedAt;
    } catch (err) {
      logError("Error recording text:", err);

      toastError(
        describeError(err, "The text could not be recorded."),
      );
    }
  }

  window.location.href = link;
};

const initialOf = (name) =>
  (name || "?").trim().charAt(0).toUpperCase() || "?";
</script>

<template>
  <div class="min-h-screen text-white">
    <header class="glass-bar sticky top-0 z-40 border-b">
      <div class="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <button
          type="button"
          @click="goBack(router, '/dashboard')"
          class="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <p class="eyebrow">{{ kind.eyebrow }}</p>

        <h1 class="page-title mt-2">{{ kind.title }}</h1>

        <p class="muted mt-2">{{ kind.blurb }}</p>

        <!-- Switch between the other lists without going back. -->
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="(entry, key) in KINDS"
            :key="key"
            type="button"
            @click="router.replace(`/follow-up/${key}`)"
            :class="[
              'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              route.params.kind === key ||
              (!KINDS[route.params.kind] && key === 'uncalled')
                ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black'
                : 'border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white',
            ]"
          >
            {{ entry.title }}
          </button>
        </div>
      </div>
    </header>

    <main id="main" tabindex="-1" class="mx-auto max-w-4xl px-4 py-6 pb-28 sm:px-6">
      <!-- SCOPE (pastor only) -->

      <div v-if="isPastor" class="mb-4 flex gap-2">
        <button
          type="button"
          @click="router.replace({ query: {} })"
          :class="[
            'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
            scope === 'all'
              ? 'border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]'
              : 'border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white',
          ]"
        >
          Whole church
        </button>

        <button
          type="button"
          @click="router.replace({ query: { scope: 'mine' } })"
          :class="[
            'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
            scope === 'mine'
              ? 'border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37]'
              : 'border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white',
          ]"
        >
          Only mine
        </button>
      </div>

      <!-- LOADING -->

      <div v-if="loading" class="space-y-2">
        <div
          v-for="i in 6"
          :key="`skeleton-${i}`"
          class="glass-card flex items-center gap-3 p-4"
        >
          <div class="skeleton h-9 w-9 shrink-0 rounded-xl"></div>

          <div class="flex-1 space-y-2">
            <div class="skeleton h-3.5 w-40 rounded"></div>
            <div class="skeleton h-2.5 w-24 rounded"></div>
          </div>

          <div class="skeleton h-8 w-16 shrink-0 rounded-xl"></div>
        </div>
      </div>

      <!-- ERROR -->

      <div
        v-else-if="error"
        class="rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-5 backdrop-blur"
      >
        <p class="text-sm text-red-400">{{ error }}</p>

        <button type="button" @click="load" class="btn-ghost btn-sm mt-3">
          Try again
        </button>
      </div>

      <template v-else>
        <!-- SEARCH + COUNT -->

        <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="relative flex-1">
            <span
              class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
            >
              ⌕
            </span>

            <input
              v-model="search"
              type="search"
              placeholder="Search this list..."
              aria-label="Search this list"
              class="field pl-10"
            />
          </div>

          <p class="shrink-0 text-sm text-gray-500">
            <span class="font-black text-[#D4AF37]">{{ visible.length }}</span>
            {{ visible.length === 1 ? "person" : "people" }}
          </p>
        </div>

        <!-- EMPTY -->

        <div v-if="!visible.length" class="glass-dashed p-10 text-center">
          <div class="icon-tile mx-auto h-14 w-14 text-2xl">✓</div>

          <p class="mt-4 font-semibold text-gray-300">
            {{ search.trim() ? "Nobody here matches that." : kind.empty }}
          </p>
        </div>

        <!-- THE NAMES -->

        <div v-else class="space-y-2">
          <div
            v-for="contact in visible"
            :key="contact.id"
            class="glass-card flex items-center gap-3 p-3 sm:p-4"
          >
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
                  :class="[statusBadgeClass(contact.status), 'px-2 py-0.5']"
                >
                  {{ contact.status }}
                </span>

                <span class="truncate text-[11px] text-gray-500">
                  {{ contact.phone || "No number" }}
                </span>
              </p>

              <p class="mt-0.5 truncate text-[11px] text-gray-600">
                {{ contact.centre }} · recorded
                {{ relativeTime(contact.created_at) }}

                <span v-if="scope === 'all'"> · {{ contact.addedBy }}</span>
              </p>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <button
                v-if="contact.outingId"
                type="button"
                @click="router.push(`/outing/${contact.outingId}`)"
                :aria-label="`Open the outing ${contact.name} came from`"
                class="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 text-xs font-semibold text-gray-500 transition hover:bg-white/[0.07] hover:text-white"
                title="Open their outing"
              >
                ▣
              </button>

              <button
                v-if="contact.phone && kind.action === 'call'"
                type="button"
                @click="callContact(contact)"
                :aria-label="`Call ${contact.name}`"
                class="flex items-center gap-1.5 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs font-semibold text-green-400 transition hover:bg-green-500/20 active:scale-[0.98]"
              >
                <span aria-hidden="true">📞</span>
                <span>Call</span>
              </button>

              <button
                v-if="contact.phone && kind.action === 'text'"
                type="button"
                @click="textContact(contact)"
                :aria-label="`Text ${contact.name}`"
                class="flex items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 transition hover:bg-blue-500/20 active:scale-[0.98]"
              >
                <span aria-hidden="true">💬</span>
                <span>Text</span>
              </button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- =====================================================
         CALL OUTCOME
    ====================================================== -->

    <AppModal
      :open="Boolean(promptContact)"
      :busy="savingPrompt"
      labelled-by="followup-prompt-title"
      @close="closePrompt()"
    >
      <div v-if="promptContact">
        <p class="eyebrow">Outreach follow-up</p>

        <h3 id="followup-prompt-title" class="mt-1 text-xl font-black">
          How did the call go?
        </h3>

        <p class="mt-2 text-sm leading-6 text-gray-500">
          <span class="font-semibold text-gray-300">
            {{ promptContact.name }}
          </span>

          - pick what happened, and add anything worth remembering.
        </p>

        <div class="mt-5">
          <p class="field-label">Outcome</p>

          <div class="flex flex-wrap gap-2">
            <button
              v-for="outcome in CALL_OUTCOMES"
              :key="outcome"
              type="button"
              @click="promptStatus = outcome"
              :disabled="savingPrompt"
              :class="[
                'rounded-xl border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40',
                promptStatus === outcome
                  ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]'
                  : 'border-white/10 bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] hover:text-white',
              ]"
            >
              {{ outcome }}
            </button>
          </div>
        </div>

        <div class="mt-5">
          <label class="field-label">Feedback</label>

          <textarea
            v-model="promptNotes"
            rows="3"
            :disabled="savingPrompt"
            placeholder="What did they say?"
            class="field resize-none py-3 text-sm"
          ></textarea>
        </div>

        <p
          v-if="promptError"
          class="mt-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3 py-2 text-xs text-red-400 backdrop-blur"
        >
          {{ promptError }}
        </p>

        <div class="mt-6 flex gap-2">
          <button
            type="button"
            @click="closePrompt()"
            :disabled="savingPrompt"
            class="btn-ghost flex-1"
          >
            Not now
          </button>

          <button
            type="button"
            @click="savePrompt"
            :disabled="savingPrompt"
            class="btn-gold flex-1"
          >
            {{ savingPrompt ? "Saving..." : "Save" }}
          </button>
        </div>
      </div>
    </AppModal>

    <BottomNav />
  </div>
</template>
