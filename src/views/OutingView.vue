<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const outing = ref(null);
const contacts = ref([]);
const loading = ref(true);
const error = ref("");

const editingId = ref(null);
const editingNotes = ref("");
const saving = ref(false);

/* =========================================================
   FEEDBACK PROMPT
========================================================= */

const showFeedbackPrompt = ref(false);
const feedbackContact = ref(null);

/* =========================================================
   PERMISSIONS
========================================================= */

const canEdit = computed(() => {
  if (!outing.value || !authStore.profile) return false;

  return (
    outing.value.created_by === authStore.user?.id ||
    authStore.profile.is_pastor === true
  );
});

/* =========================================================
   DATE
========================================================= */

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

/* =========================================================
   PHONE HELPERS
========================================================= */

const normalizePhone = (phone) => {
  if (!phone) return "";

  let value = String(phone).trim();

  // Remove spaces, brackets, dashes, etc.
  value = value.replace(/[^\d+]/g, "");

  // Nigerian local format:
  // 08012345678 -> +2348012345678
  if (value.startsWith("0") && value.length >= 10) {
    value = "+234" + value.substring(1);
  }

  return value;
};

const getCallLink = (phone) => {
  const normalized = normalizePhone(phone);

  return normalized ? `tel:${normalized}` : "#";
};

const getSmsLink = (phone) => {
  const normalized = normalizePhone(phone);

  if (!normalized) return "#";

  const message =
    "Hello! This is the Transfiguration Church team. It was lovely meeting you. We would love to stay connected with you. God bless you!";

  return `sms:${normalized}?body=${encodeURIComponent(message)}`;
};

/* =========================================================
   FEEDBACK PROMPT
========================================================= */

const askForFeedback = (contact) => {
  if (!contact?.id) return;

  feedbackContact.value = contact;
  showFeedbackPrompt.value = true;
};

const closeFeedbackPrompt = () => {
  showFeedbackPrompt.value = false;
  feedbackContact.value = null;
};

const addFeedbackNow = () => {
  if (!feedbackContact.value) return;

  startEditing(feedbackContact.value);
  closeFeedbackPrompt();
};

/* =========================================================
   CALL / TEXT
========================================================= */

const handleCall = (contact) => {
  if (!contact?.phone) return;

  const link = getCallLink(contact.phone);

  if (link !== "#") {
    window.location.href = link;

    // Give the browser a moment before showing the feedback prompt.
    setTimeout(() => {
      askForFeedback(contact);
    }, 800);
  }
};

const handleText = (contact) => {
  if (!contact?.phone) return;

  const link = getSmsLink(contact.phone);

  if (link !== "#") {
    window.location.href = link;

    // Give the messaging app time to open.
    setTimeout(() => {
      askForFeedback(contact);
    }, 800);
  }
};

/* =========================================================
   LOAD OUTING
========================================================= */

const loadOuting = async () => {
  loading.value = true;
  error.value = "";

  try {
    const outingId = route.params.id;

    /* Get outing */
    const { data: outingData, error: outingError } = await supabase
      .from("evangelism_outings")
      .select("*")
      .eq("id", outingId)
      .single();

    if (outingError) throw outingError;

    outing.value = outingData;

    /* Get people in this outing */
    const { data: outingContacts, error: relationError } = await supabase
      .from("outing_contacts")
      .select("contact_id")
      .eq("outing_id", outingId);

    if (relationError) throw relationError;

    const contactIds = (outingContacts || []).map((item) => item.contact_id);

    if (!contactIds.length) {
      contacts.value = [];
      return;
    }

    /* Get contacts */
    const { data: contactData, error: contactError } = await supabase
      .from("contacts")
      .select("*")
      .in("id", contactIds)
      .order("created_at", { ascending: true });

    if (contactError) throw contactError;

    contacts.value = contactData || [];
  } catch (err) {
    console.error("Error loading outing:", err);

    error.value = err.message || "Unable to load outing.";
  } finally {
    loading.value = false;
  }
};

/* =========================================================
   EDIT FEEDBACK
========================================================= */

const startEditing = (contact) => {
  editingId.value = contact.id;
  editingNotes.value = contact.notes || "";
};

const cancelEditing = () => {
  editingId.value = null;
  editingNotes.value = "";
};

/* =========================================================
   SAVE FEEDBACK
========================================================= */

const saveFeedback = async (contact) => {
  saving.value = true;
  error.value = "";

  try {
    const notes = editingNotes.value.trim();

    const { data, error: updateError } = await supabase
      .from("contacts")
      .update({
        notes: notes || null,
        status: notes ? "Called" : "New",
      })
      .eq("id", contact.id)
      .select()
      .single();

    if (updateError) throw updateError;

    const index = contacts.value.findIndex((item) => item.id === contact.id);

    if (index !== -1) {
      contacts.value[index] = data;
    }

    cancelEditing();
  } catch (err) {
    console.error("Error updating feedback:", err);

    error.value = err.message || "Unable to update feedback.";
  } finally {
    saving.value = false;
  }
};

/* =========================================================
   MOUNT
========================================================= */

onMounted(() => {
  loadOuting();
});
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <button
          type="button"
          @click="router.back()"
          class="mb-5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <div v-if="outing">
          <p class="text-sm font-semibold text-[#D4AF37]">
            {{ outing.location }} Branch
          </p>

          <h1 class="mt-1 text-2xl font-black sm:text-3xl">
            {{ outing.title }}
          </h1>

          <p class="mt-2 text-sm text-gray-500">
            {{ formatDate(outing.outing_date) }}
          </p>
        </div>
      </div>
    </header>

    <!-- =====================================================
         MAIN
    ====================================================== -->

    <main class="mx-auto max-w-4xl px-4 py-6 pb-24 sm:px-6 sm:py-8">
      <!-- Loading -->

      <div
        v-if="loading"
        class="rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-sm text-gray-500"
      >
        Loading contacts...
      </div>

      <!-- Error -->

      <div
        v-else-if="error"
        class="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <template v-else>
        <!-- =================================================
             SUMMARY
        ================================================== -->

        <div
          class="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-[#101010] p-4"
        >
          <div>
            <p class="text-xs text-gray-500">People reached</p>

            <p class="mt-1 text-2xl font-black text-[#D4AF37]">
              {{ contacts.length }}
            </p>
          </div>

          <div v-if="canEdit" class="text-right text-xs text-gray-500">
            You can edit feedback
          </div>
        </div>

        <!-- =================================================
             EMPTY
        ================================================== -->

        <div
          v-if="contacts.length === 0"
          class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-8 text-center"
        >
          <p class="text-gray-400">No people recorded in this outing.</p>
        </div>

        <!-- =================================================
             CONTACTS
        ================================================== -->

        <div v-else class="space-y-3">
          <article
            v-for="contact in contacts"
            :key="contact.id"
            class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
          >
            <!-- Person Header -->

            <div class="flex items-start gap-3">
              <!-- Avatar -->

              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 font-bold text-[#D4AF37]"
              >
                {{ contact.name?.charAt(0)?.toUpperCase() || "?" }}
              </div>

              <!-- Details -->

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="font-bold">
                    {{ contact.name }}
                  </h2>

                  <!-- Status -->

                  <span
                    :class="[
                      'rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                      contact.status === 'Called'
                        ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                        : 'bg-white/5 text-gray-500',
                    ]"
                  >
                    {{ contact.status || "New" }}
                  </span>
                </div>

                <!-- Phone -->

                <p class="mt-1 text-sm text-gray-500">
                  {{ contact.phone || "No phone number" }}
                </p>
              </div>

              <!-- Edit -->

              <button
                v-if="canEdit && editingId !== contact.id"
                type="button"
                @click="startEditing(contact)"
                class="shrink-0 text-xs font-semibold text-[#D4AF37] hover:text-[#E2C45A]"
              >
                Edit
              </button>
            </div>

            <!-- =================================================
                 QUICK ACTION BUTTONS
            ================================================== -->

            <div v-if="contact.phone" class="mt-4 flex gap-2">
              <!-- CALL -->

              <button
                type="button"
                @click="handleCall(contact)"
                class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3 py-2.5 text-sm font-semibold text-green-400 transition hover:bg-green-500/20 active:scale-[0.98]"
              >
                <span class="text-base">📞</span>
                <span>Call</span>
              </button>

              <!-- TEXT -->

              <button
                type="button"
                @click="handleText(contact)"
                class="flex flex-1 items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-2.5 text-sm font-semibold text-blue-400 transition hover:bg-blue-500/20 active:scale-[0.98]"
              >
                <span class="text-base">💬</span>
                <span>Text</span>
              </button>
            </div>

            <!-- No phone -->

            <div
              v-else
              class="mt-4 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-center text-xs text-gray-600"
            >
              No phone number available for this contact.
            </div>

            <!-- =================================================
                 FEEDBACK
            ================================================== -->

            <div class="mt-4 border-t border-white/5 pt-4">
              <p
                class="text-xs font-semibold uppercase tracking-wide text-gray-600"
              >
                Feedback
              </p>

              <!-- Normal -->

              <p
                v-if="editingId !== contact.id"
                class="mt-2 text-sm leading-6 text-gray-400"
              >
                {{ contact.notes || "No feedback recorded yet." }}
              </p>

              <!-- Editing -->

              <div v-else class="mt-3">
                <textarea
                  v-model="editingNotes"
                  rows="3"
                  placeholder="Enter feedback..."
                  class="w-full resize-none rounded-xl border border-white/10 bg-[#080808] px-3 py-3 text-sm text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37]/50"
                ></textarea>

                <div class="mt-3 flex gap-2">
                  <!-- Cancel -->

                  <button
                    type="button"
                    @click="cancelEditing"
                    class="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>

                  <!-- Save -->

                  <button
                    type="button"
                    @click="saveFeedback(contact)"
                    :disabled="saving"
                    class="rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-black text-black disabled:opacity-50"
                  >
                    {{ saving ? "Saving..." : "Save feedback" }}
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </template>
    </main>

    <!-- =====================================================
         FEEDBACK PROMPT
    ====================================================== -->

    <div
      v-if="showFeedbackPrompt"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="closeFeedbackPrompt"
    >
      <div
        class="w-full max-w-md rounded-2xl border border-white/10 bg-[#101010] p-6 shadow-2xl"
      >
        <!-- Header -->

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-[#D4AF37]">
              Outreach follow-up
            </p>

            <h3 class="mt-1 text-xl font-black">Add feedback now?</h3>

            <p class="mt-2 text-sm leading-6 text-gray-500">
              Did you get any feedback from
              <span class="font-semibold text-gray-300">
                {{ feedbackContact?.name }}
              </span>
              ?
            </p>
          </div>

          <button
            type="button"
            @click="closeFeedbackPrompt"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/5 hover:text-white"
          >
            ×
          </button>
        </div>

        <!-- Buttons -->

        <div class="mt-6 grid gap-3 sm:grid-cols-2">
          <!-- Add Feedback -->

          <button
            type="button"
            @click="addFeedbackNow"
            class="rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black transition hover:bg-[#E2C45A]"
          >
            Add feedback
          </button>

          <!-- Not Now -->

          <button
            type="button"
            @click="closeFeedbackPrompt"
            class="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
          >
            Not now
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         MOBILE NAVIGATION
    ====================================================== -->

    <nav
      class="fixed bottom-4 left-4 right-4 z-50 rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-2xl lg:hidden"
    >
      <div class="grid grid-cols-3">
        <!-- Home -->

        <button
          type="button"
          @click="router.push('/dashboard')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500"
        >
          <span class="text-lg">⌂</span>

          <span class="text-[11px]"> Home </span>
        </button>

        <!-- Add Outing -->

        <button
          type="button"
          @click="router.push('/record-person')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500"
        >
          <span class="text-lg">+</span>

          <span class="text-[11px]"> Add Outing </span>
        </button>

        <!-- Contacts -->

        <button
          type="button"
          @click="router.push('/contacts')"
          class="flex flex-col items-center gap-1 py-3 text-[#D4AF37]"
        >
          <span class="text-lg">▣</span>

          <span class="text-[11px]"> Contacts </span>
        </button>
      </div>
    </nav>
  </div>
</template>
