<script setup>
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { goBack } from "../lib/navigation";
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
const editForm = ref({ name: "", phone: "", notes: "" });
const saving = ref(false);

const addingPerson = ref(false);
const newPerson = ref({ name: "", phone: "", notes: "" });
const addingSaving = ref(false);
const actionError = ref("");

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

/* Mirrors the row level security rule on contacts: only the
   person who recorded someone, or a pastor, may change or
   remove that record. Owning the outing is not enough. */
const canModifyContact = (contact) => {
  if (!contact) return false;

  return (
    contact.added_by === authStore.user?.id ||
    authStore.profile?.is_pastor === true
  );
};

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

const buildSmsMessage = (contact) => {
  const branch =
    contact?.branch || contact?.location || outing.value?.location || "";

  if (
    branch.toLowerCase().includes("gbag") ||
    branch.toLowerCase().includes("gbayi")
  ) {
    return `Good day beloved

You are warmly invited to worship with us at Transfiguration Church on SUNDAY by 8am

@ John Tanko street off Joel Bala Gbayi villa`;
  }

  return `Good day beloved

You are warmly invited to worship with us at Transfiguration Church on SUNDAY by 8am

@ Chalawa, Opposite millennium suite, Barnawa`;
};

const getSmsLink = (contact) => {
  const normalized = normalizePhone(contact?.phone);

  if (!normalized) return "#";

  const message = buildSmsMessage(contact);

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

const handleCall = async (contact) => {
  if (!contact?.phone) return;

  const link = getCallLink(contact.phone);

  if (link === "#") return;

  // called_at is the permanent record of the act. status is left
  // alone here: it is the follow-up outcome, and saveContact sets
  // it once feedback is actually written down.
  if (canModifyContact(contact)) {
    const calledAt = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ called_at: calledAt })
        .eq("id", contact.id);

      if (updateError) throw updateError;

      contact.called_at = calledAt;
    } catch (err) {
      console.error("Error recording call:", err);
    }
  }

  window.location.href = link;

  // Give the browser a moment before showing the feedback prompt.
  setTimeout(() => {
    askForFeedback(contact);
  }, 800);
};

const handleText = async (contact) => {
  if (!contact?.phone) return;

  const link = getSmsLink(contact);

  if (link === "#") return;

  // Texted is recorded on its own column rather than as a status,
  // so a contact who has already been called keeps that status
  // and picks up a Texted badge alongside it.
  if (canModifyContact(contact)) {
    const textedAt = new Date().toISOString();

    try {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ texted_at: textedAt })
        .eq("id", contact.id);

      if (updateError) throw updateError;

      contact.texted_at = textedAt;
    } catch (err) {
      console.error("Error recording text:", err);
    }
  }

  window.location.href = link;

  // Give the messaging app time to open.
  setTimeout(() => {
    askForFeedback(contact);
  }, 800);
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
   EDIT A SAVED CONTACT

   An outing stays editable after it is saved: its owner (or a
   pastor) can correct a person's details or add someone who
   was missed on the day.
========================================================= */

const startEditing = (contact) => {
  editingId.value = contact.id;

  editForm.value = {
    name: contact.name || "",
    phone: contact.phone || "",
    notes: contact.notes || "",
  };

  addingPerson.value = false;
  actionError.value = "";
};

const cancelEditing = () => {
  editingId.value = null;

  editForm.value = { name: "", phone: "", notes: "" };
  actionError.value = "";
};

const saveContact = async (contact) => {
  const name = editForm.value.name.trim();
  const phone = editForm.value.phone.trim();
  const notes = editForm.value.notes.trim();

  if (!name || !phone) {
    actionError.value = "Please enter a name and phone number.";
    return;
  }

  saving.value = true;
  actionError.value = "";

  try {
    // Recording feedback moves a brand new contact to "Called", but an
    // existing status (Following Up, Not Reachable) is left alone.
    const status =
      notes && (!contact.status || contact.status === "New")
        ? "Called"
        : contact.status || "New";

    const { data, error: updateError } = await supabase
      .from("contacts")
      .update({
        name,
        phone,
        notes: notes || null,
        status,
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
    console.error("Error updating contact:", err);

    actionError.value = err.message || "Unable to update this person.";
  } finally {
    saving.value = false;
  }
};

/* =========================================================
   ADD A PERSON TO A SAVED OUTING
========================================================= */

const startAddingPerson = () => {
  addingPerson.value = true;

  newPerson.value = { name: "", phone: "", notes: "" };

  cancelEditing();
};

const cancelAddingPerson = () => {
  addingPerson.value = false;

  newPerson.value = { name: "", phone: "", notes: "" };
  actionError.value = "";
};

const saveNewPerson = async () => {
  const name = newPerson.value.name.trim();
  const phone = newPerson.value.phone.trim();
  const notes = newPerson.value.notes.trim();

  if (!name || !phone) {
    actionError.value = "Please enter a name and phone number.";
    return;
  }

  addingSaving.value = true;
  actionError.value = "";

  let createdId = null;

  try {
    const { data: contact, error: insertError } = await supabase
      .from("contacts")
      .insert({
        name,
        phone,
        notes: notes || null,
        status: notes ? "Called" : "New",
        added_by: authStore.user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    createdId = contact.id;

    const { error: linkError } = await supabase.from("outing_contacts").insert({
      outing_id: outing.value.id,
      contact_id: contact.id,
    });

    if (linkError) throw linkError;

    contacts.value.push(contact);

    cancelAddingPerson();
  } catch (err) {
    console.error("Error adding person:", err);

    // Do not leave a contact behind that belongs to no outing.
    if (createdId) {
      try {
        await supabase.from("contacts").delete().eq("id", createdId);
      } catch (cleanupError) {
        console.error("Error cleaning up contact:", cleanupError);
      }
    }

    actionError.value = err.message || "Unable to add this person.";
  } finally {
    addingSaving.value = false;
  }
};

/* =========================================================
   DELETE A CONTACT

   For correcting mistakes - a name entered twice, a wrong
   number saved. Only whoever recorded the person (or a
   pastor) can remove them, and only from here, never from
   the church-wide Everyone list.
========================================================= */

const deleteTarget = ref(null);
const deleting = ref(false);
const deleteError = ref("");

const confirmDeleteContact = (contact) => {
  deleteTarget.value = contact;
  deleteError.value = "";
};

const cancelDeleteContact = () => {
  if (deleting.value) return;

  deleteTarget.value = null;
  deleteError.value = "";
};

const deleteContact = async () => {
  const contact = deleteTarget.value;

  if (!contact) return;

  deleting.value = true;
  deleteError.value = "";

  try {
    // Unlink first: the join row would otherwise be orphaned, or
    // block the delete outright if the foreign key is enforced.
    const { error: unlinkError } = await supabase
      .from("outing_contacts")
      .delete()
      .eq("contact_id", contact.id);

    if (unlinkError) throw unlinkError;

    const { error: deleteContactError } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contact.id);

    if (deleteContactError) throw deleteContactError;

    contacts.value = contacts.value.filter((item) => item.id !== contact.id);

    if (editingId.value === contact.id) {
      cancelEditing();
    }

    deleteTarget.value = null;
  } catch (err) {
    console.error("Error deleting contact:", err);

    deleteError.value = err.message || "Unable to delete this person.";
  } finally {
    deleting.value = false;
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
  <div class="min-h-screen text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="glass-bar border-b">
      <div class="mx-auto max-w-4xl px-4 py-5 sm:px-6">
        <button
          type="button"
          @click="goBack(router, '/contacts')"
          class="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <div v-if="outing">
          <p class="eyebrow">
            {{ outing.location }} Branch
          </p>

          <h1 class="page-title mt-2">
            {{ outing.title }}
          </h1>

          <p class="muted mt-2">
            {{ formatDate(outing.outing_date) }}
          </p>
        </div>
      </div>
    </header>

    <!-- =====================================================
         MAIN
    ====================================================== -->

    <main class="mx-auto max-w-4xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <!-- Loading -->

      <div
        v-if="loading"
        class="glass-card p-8 text-center text-sm text-gray-500"
      >
        Loading contacts...
      </div>

      <!-- Error -->

      <div
        v-else-if="error"
        class="rounded-2xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <template v-else>
        <!-- =================================================
             SUMMARY
        ================================================== -->

        <div
          class="mb-6 flex items-center justify-between glass-card p-4"
        >
          <div>
            <p class="text-xs text-gray-500">People reached</p>

            <p class="mt-1 text-2xl font-black text-[#D4AF37]">
              {{ contacts.length }}
            </p>
          </div>

          <div v-if="canEdit" class="text-right text-xs text-gray-500">
            You can add people and edit their details
          </div>
        </div>

        <!-- =================================================
             EMPTY
        ================================================== -->

        <div
          v-if="contacts.length === 0"
          class="glass-dashed p-8 text-center"
        >
          <p class="text-gray-400">No people recorded in this outing.</p>
        </div>

        <!-- =================================================
             CONTACTS
        ================================================== -->

        <div v-if="contacts.length" class="space-y-3">
          <article
            v-for="contact in contacts"
            :key="contact.id"
            class="glass-card p-4 sm:p-5"
          >
            <!-- =================================================
                 VIEW
            ================================================== -->

            <template v-if="editingId !== contact.id">
              <!-- Person Header -->

              <div class="flex items-start gap-3">
                <!-- Avatar -->

                <div
                  class="icon-tile h-10 w-10 shrink-0 font-bold"
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

                    <!-- Sits alongside the status, not in place of
                         it: a person can be called and texted. -->
                    <span
                      v-if="contact.texted_at"
                      class="rounded-full bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-400"
                    >
                      Texted
                    </span>
                  </div>

                  <!-- Phone -->

                  <p class="muted mt-1">
                    {{ contact.phone || "No phone number" }}
                  </p>
                </div>

                <!-- Edit / Delete -->

                <div class="flex shrink-0 items-center gap-3">
                  <button
                    v-if="canEdit"
                    type="button"
                    @click="startEditing(contact)"
                    class="text-xs font-semibold text-[#D4AF37] hover:text-[#E2C45A]"
                  >
                    Edit
                  </button>

                  <button
                    v-if="canModifyContact(contact)"
                    type="button"
                    @click="confirmDeleteContact(contact)"
                    class="text-xs font-semibold text-gray-600 transition hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
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

                <p class="mt-2 text-sm leading-6 text-gray-400">
                  {{ contact.notes || "No feedback recorded yet." }}
                </p>
              </div>
            </template>

            <!-- =================================================
                 EDIT
            ================================================== -->

            <div v-else>
              <p
                class="text-xs font-semibold uppercase tracking-wide text-gray-600"
              >
                Editing person
              </p>

              <div class="mt-3 space-y-3">
                <div>
                  <label class="text-xs text-gray-500">Name</label>

                  <input
                    v-model="editForm.name"
                    type="text"
                    placeholder="Full name"
                    class="field mt-1 py-3 text-sm"
                  />
                </div>

                <div>
                  <label class="text-xs text-gray-500">Phone number</label>

                  <input
                    v-model="editForm.phone"
                    type="tel"
                    inputmode="tel"
                    placeholder="08012345678"
                    class="field mt-1 py-3 text-sm"
                  />
                </div>

                <div>
                  <label class="text-xs text-gray-500">Feedback</label>

                  <textarea
                    v-model="editForm.notes"
                    rows="3"
                    placeholder="Enter feedback..."
                    class="field mt-1 resize-none py-3 text-sm"
                  ></textarea>
                </div>
              </div>

              <p
                v-if="actionError"
                class="mt-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur px-3 py-2 text-xs text-red-400"
              >
                {{ actionError }}
              </p>

              <div class="mt-4 flex gap-2">
                <!-- Cancel -->

                <button
                  type="button"
                  @click="cancelEditing"
                  class="btn-ghost btn-sm"
                >
                  Cancel
                </button>

                <!-- Save -->

                <button
                  type="button"
                  @click="saveContact(contact)"
                  :disabled="saving"
                  class="btn-gold btn-sm"
                >
                  {{ saving ? "Saving..." : "Save changes" }}
                </button>
              </div>
            </div>
          </article>
        </div>

        <!-- =================================================
             ADD A PERSON
        ================================================== -->

        <div v-if="canEdit" class="mt-3">
          <button
            v-if="!addingPerson"
            type="button"
            @click="startAddingPerson"
            class="w-full rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#D4AF37]/[0.04] backdrop-blur-xl px-4 py-4 text-sm font-semibold text-[#D4AF37] transition hover:border-[#D4AF37]/60 hover:bg-white/[0.07]"
          >
            + Add person to this outing
          </button>

          <div
            v-else
            class="rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] backdrop-blur-xl p-4 sm:p-5"
          >
            <p
              class="text-xs font-semibold uppercase tracking-wide text-gray-600"
            >
              New person
            </p>

            <div class="mt-3 space-y-3">
              <div>
                <label class="text-xs text-gray-500">Name</label>

                <input
                  v-model="newPerson.name"
                  type="text"
                  placeholder="Full name"
                  class="field mt-1 py-3 text-sm"
                />
              </div>

              <div>
                <label class="text-xs text-gray-500">Phone number</label>

                <input
                  v-model="newPerson.phone"
                  type="tel"
                  inputmode="tel"
                  placeholder="08012345678"
                  class="field mt-1 py-3 text-sm"
                />
              </div>

              <div>
                <label class="text-xs text-gray-500">
                  Feedback
                  <span class="text-gray-700">(optional)</span>
                </label>

                <textarea
                  v-model="newPerson.notes"
                  rows="3"
                  placeholder="Enter feedback..."
                  class="field mt-1 resize-none py-3 text-sm"
                ></textarea>
              </div>
            </div>

            <p
              v-if="actionError"
              class="mt-3 rounded-xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur px-3 py-2 text-xs text-red-400"
            >
              {{ actionError }}
            </p>

            <div class="mt-4 flex gap-2">
              <button
                type="button"
                @click="cancelAddingPerson"
                class="btn-ghost btn-sm"
              >
                Cancel
              </button>

              <button
                type="button"
                @click="saveNewPerson"
                :disabled="addingSaving"
                class="btn-gold btn-sm"
              >
                {{ addingSaving ? "Adding..." : "Add person" }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- =====================================================
         FEEDBACK PROMPT
    ====================================================== -->

    <div
      v-if="showFeedbackPrompt"
      class="modal-backdrop"
      @click.self="closeFeedbackPrompt"
    >
      <div
        class="w-full max-w-md glass-panel p-6"
      >
        <!-- Header -->

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">
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
         DELETE CONFIRMATION
    ====================================================== -->

    <div
      v-if="deleteTarget"
      class="modal-backdrop z-[110]"
      @click.self="cancelDeleteContact"
    >
      <div
        class="w-full max-w-sm glass-panel p-6"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-xl text-red-400"
        >
          ⚠
        </div>

        <h3 class="mt-4 text-lg font-bold">Delete this person?</h3>

        <p class="mt-2 text-sm leading-6 text-gray-500">
          <span class="font-semibold text-gray-300">
            {{ deleteTarget.name }}
          </span>

          will be removed from this outing and from the church-wide
          contact list. This cannot be undone.
        </p>

        <p
          v-if="deleteError"
          class="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur px-3 py-2 text-xs text-red-400"
        >
          {{ deleteError }}
        </p>

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            @click="cancelDeleteContact"
            :disabled="deleting"
            class="btn-ghost flex-1"
          >
            Cancel
          </button>

          <button
            type="button"
            @click="deleteContact"
            :disabled="deleting"
            class="btn-danger flex-1"
          >
            {{ deleting ? "Deleting..." : "Delete" }}
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         MOBILE NAVIGATION
    ====================================================== -->

    <BottomNav />
  </div>
</template>
