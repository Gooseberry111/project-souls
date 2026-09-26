<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppModal from "../components/AppModal.vue";
import BottomNav from "../components/BottomNav.vue";
import { describeError, logError } from "../lib/errors";
import { CENTRES, centreLabel, outingTitleFor } from "../lib/centres";
import { goBack } from "../lib/navigation";
import { phoneVariants, samePhone } from "../lib/phone";
import { toastError, toastSuccess } from "../lib/toast";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const centre = ref("");
const people = ref([
  {
    name: "",
    phone: "",
    feedback: "",
  },
]);

const loading = ref(false);
const error = ref("");

/* Only mark rows red once the member has actually tried to
   save. Flagging empty fields before then would scold them
   for a form they have barely started. */
const attempted = ref(false);

const today = computed(() =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }),
);

const isComplete = (person) =>
  Boolean(person.name.trim() && person.phone.trim());

const completeCount = computed(
  () => people.value.filter(isComplete).length,
);

const readyToSave = computed(
  () => Boolean(centre.value) && completeCount.value === people.value.length,
);

const addPerson = () => {
  people.value.push({
    name: "",
    phone: "",
    feedback: "",
  });
};

const removePerson = (index) => {
  if (people.value.length === 1) return;

  people.value.splice(index, 1);
};

/* =========================================================
   DUPLICATES

   The same person gets met twice - different week, different
   member - and lands in the table twice, which then quietly
   inflates every count and gets them called twice. Checked at
   submit rather than while typing: a half-entered number
   matches nothing, and a warning per keystroke is noise.
========================================================= */

const duplicateWarning = ref(null);
const checkingDuplicates = ref(false);

const findDuplicates = async () => {
  const entered = people.value
    .map((person) => person.phone.trim())
    .filter(Boolean);

  if (!entered.length) return [];

  /* Same number typed twice in this one form. */
  const withinForm = [];

  entered.forEach((phone, index) => {
    const earlier = entered.findIndex((other) => samePhone(other, phone));

    if (earlier !== -1 && earlier < index) {
      withinForm.push({
        name: people.value[index].name.trim() || "Someone",
        phone,
        where: "twice in this outing",
      });
    }
  });

  /* Already in the church-wide table from a previous outing. */
  const variants = [...new Set(entered.flatMap(phoneVariants))];

  let existing = [];

  if (variants.length) {
    const { data, error: lookupError } = await supabase
      .from("contacts")
      .select("name, phone, created_at")
      .in("phone", variants);

    if (lookupError) throw lookupError;

    existing = data || [];
  }

  const alreadyRecorded = existing.map((match) => ({
    name: match.name,
    phone: match.phone,
    where: `already recorded ${new Date(
      match.created_at,
    ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  }));

  return [...withinForm, ...alreadyRecorded];
};

const handleSubmit = async (options = {}) => {
  error.value = "";
  attempted.value = true;

  if (!centre.value) {
    error.value = "Please choose which centre this outing was for.";
    return;
  }

  const invalidPerson = people.value.some(
    (person) => !person.name.trim() || !person.phone.trim(),
  );

  if (invalidPerson) {
    error.value = "Please enter a name and phone number for every person.";
    return;
  }

  /* Ask once, then let them through if they say so - the same
     number really can belong to two people in a household. */
  if (!options.skipDuplicateCheck) {
    checkingDuplicates.value = true;

    try {
      const duplicates = await findDuplicates();

      if (duplicates.length) {
        duplicateWarning.value = duplicates;
        return;
      }
    } catch (err) {
      // A failed lookup must not block recording an outing.
      logError("Duplicate check failed:", err);
    } finally {
      checkingDuplicates.value = false;
    }
  }

  duplicateWarning.value = null;

  loading.value = true;

  /* Tracked so a failure part-way through does not leave records
     behind. See the cleanup in the catch below. */
  let createdOutingId = null;
  let createdContactIds = [];

  try {
    // Create outing
    const { data: outing, error: outingError } = await supabase
      .from("evangelism_outings")
      .insert({
        title: outingTitleFor(centre.value),
        outing_date: new Date().toISOString().split("T")[0],
        location: centre.value,
        created_by: authStore.user.id,
      })
      .select()
      .single();

    if (outingError) throw outingError;

    createdOutingId = outing.id;

    // Create contacts
    const contactsToInsert = people.value.map((person) => ({
      name: person.name.trim(),
      phone: person.phone.trim(),
      notes: person.feedback.trim() || null,
      status: person.feedback.trim() ? "Called" : "New",
      added_by: authStore.user.id,
    }));

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .insert(contactsToInsert)
      .select();

    if (contactsError) throw contactsError;

    createdContactIds = (contacts || []).map((contact) => contact.id);

    // Connect contacts to outing
    const outingContacts = contacts.map((contact) => ({
      outing_id: outing.id,
      contact_id: contact.id,
    }));

    const { error: outingContactsError } = await supabase
      .from("outing_contacts")
      .insert(outingContacts);

    if (outingContactsError) throw outingContactsError;

    // Saved and linked: nothing left to roll back.
    createdContactIds = [];
    createdOutingId = null;

    toastSuccess(
      `${contacts.length} ${
        contacts.length === 1 ? "person" : "people"
      } recorded at ${centreLabel(centre.value)}.`,
    );

    router.push("/dashboard");
  } catch (err) {
    logError("Error saving outing:", err);

    /* Contacts are inserted before they are linked to the outing,
       so a failure in between would leave people in the table
       belonging to no outing. Those orphans then show up in every
       count with no centre and no way to reach them, so they are
       cleaned up here - the same thing OutingView does when
       adding one person fails. */
    if (createdContactIds.length) {
      try {
        await supabase
          .from("outing_contacts")
          .delete()
          .in("contact_id", createdContactIds);

        await supabase.from("contacts").delete().in("id", createdContactIds);
      } catch (cleanupError) {
        logError("Could not clean up half-saved contacts:", cleanupError);
      }
    }

    if (createdOutingId) {
      try {
        await supabase
          .from("evangelism_outings")
          .delete()
          .eq("id", createdOutingId);
      } catch (cleanupError) {
        logError("Could not clean up the half-saved outing:", cleanupError);
      }
    }

    const message = describeError(err, "Could not save this outing.");

    error.value = message;

    toastError(message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="glass-bar sticky top-0 z-40 border-b">
      <div
        class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6"
      >
        <button
          type="button"
          @click="goBack(router)"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
        >
          ←
        </button>

        <div class="min-w-0 flex-1">
          <h1 class="font-bold leading-tight">Add Outing</h1>

          <p class="truncate text-xs text-gray-500">{{ today }}</p>
        </div>

        <!-- Live count, so the total is visible while scrolling
             through a long list of people. -->
        <span class="badge-gold shrink-0">
          {{ completeCount }}/{{ people.length }}
        </span>
      </div>
    </header>

    <main id="main" tabindex="-1" class="mx-auto max-w-3xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <!-- INTRO -->

      <div class="rise mb-8">
        <p class="eyebrow">New outing</p>

        <h2 class="page-title mt-2">Who did you speak with?</h2>

        <p class="muted mt-2 leading-6">
          Add everyone you met today. Names and numbers are required; feedback
          can wait until after you have called them.
        </p>
      </div>

      <!-- =================================================
           STEP 1 — CENTRE
      ================================================== -->

      <section>
        <div class="flex items-center gap-3">
          <div
            :class="[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition',
              centre
                ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black'
                : 'bg-white/[0.06] text-gray-400',
            ]"
          >
            {{ centre ? "✓" : "1" }}
          </div>

          <h3 class="section-title">Which centre?</h3>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            v-for="centreOption in CENTRES"
            :key="centreOption.value"
            type="button"
            @click="centre = centreOption.value"
            :class="[
              'relative overflow-hidden rounded-2xl border p-5 text-left transition duration-200',
              centre === centreOption.value
                ? 'border-[#D4AF37]/60 bg-gradient-to-br from-[#D4AF37]/[0.14] via-white/[0.03] to-transparent shadow-[0_10px_30px_-14px_rgba(212,175,55,0.7)]'
                : 'border-white/[0.09] bg-white/[0.03] backdrop-blur-xl hover:border-white/20 hover:bg-white/[0.06]',
            ]"
          >
            <div class="flex items-start justify-between gap-3">
              <p
                :class="[
                  'font-bold',
                  centre === centreOption.value ? 'text-[#D4AF37]' : 'text-white',
                ]"
              >
                {{ centreOption.label }}
              </p>

              <span
                :class="[
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-black transition',
                  centre === centreOption.value
                    ? 'border-[#D4AF37] bg-[#D4AF37] text-black'
                    : 'border-white/20 text-transparent',
                ]"
              >
                ✓
              </span>
            </div>

            <p class="mt-1.5 text-xs leading-5 text-gray-500">
              {{ centreOption.detail }}
            </p>
          </button>
        </div>

        <p
          v-if="attempted && !centre"
          class="mt-3 text-xs font-semibold text-red-400"
        >
          Choose a centre to continue.
        </p>
      </section>

      <!-- =================================================
           STEP 2 — PEOPLE
      ================================================== -->

      <section class="mt-10">
        <div class="flex items-center gap-3">
          <div
            :class="[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition',
              completeCount === people.length
                ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black'
                : 'bg-white/[0.06] text-gray-400',
            ]"
          >
            {{ completeCount === people.length ? "✓" : "2" }}
          </div>

          <h3 class="section-title">Who you met</h3>
        </div>

        <div class="mt-4 space-y-3">
          <article
            v-for="(person, index) in people"
            :key="index"
            :class="[
              'glass-card p-4 transition sm:p-5',
              attempted && !isComplete(person)
                ? 'border-red-500/40 ring-1 ring-red-500/20'
                : '',
            ]"
          >
            <!-- CARD HEADER -->

            <div class="mb-4 flex items-center gap-3">
              <div
                :class="[
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black transition',
                  isComplete(person)
                    ? 'bg-gradient-to-br from-[#E2C45A] to-[#A8861F] text-black'
                    : 'bg-[#D4AF37]/10 text-[#D4AF37]',
                ]"
              >
                {{ index + 1 }}
              </div>

              <p class="flex-1 truncate text-sm font-semibold text-gray-300">
                {{ person.name.trim() || `Person ${index + 1}` }}
              </p>

              <button
                v-if="people.length > 1"
                type="button"
                @click="removePerson(index)"
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-600 transition hover:bg-red-500/10 hover:text-red-400"
                title="Remove this person"
              >
                ×
              </button>
            </div>

            <!-- NAME + PHONE -->

            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="field-label">Name</label>

                <input
                  v-model="person.name"
                  type="text"
                  placeholder="Full name"
                  class="field"
                />
              </div>

              <div>
                <label class="field-label">Phone number</label>

                <input
                  v-model="person.phone"
                  type="tel"
                  inputmode="tel"
                  placeholder="08012345678"
                  class="field"
                />
              </div>
            </div>

            <!-- FEEDBACK -->

            <div class="mt-3">
              <label class="field-label">
                Feedback
                <span class="font-normal normal-case text-gray-600">
                  — optional
                </span>
              </label>

              <textarea
                v-model="person.feedback"
                rows="2"
                placeholder="How did the conversation go?"
                class="field resize-none leading-6"
              ></textarea>

              <p
                v-if="person.feedback.trim()"
                class="mt-2 flex items-center gap-1.5 text-xs text-green-400"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-green-400"></span>
                Will be saved as Called
              </p>
            </div>
          </article>
        </div>

        <!-- ADD ANOTHER -->

        <button
          type="button"
          @click="addPerson"
          class="mt-3 w-full rounded-2xl border border-dashed border-[#D4AF37]/35 bg-[#D4AF37]/[0.03] px-4 py-4 text-sm font-semibold text-[#D4AF37] transition hover:border-[#D4AF37]/70 hover:bg-[#D4AF37]/[0.08]"
        >
          + Add another person
        </button>
      </section>

      <!-- =================================================
           SAVE
      ================================================== -->

      <section class="mt-8">
        <div
          :class="[
            'p-5 transition sm:p-6',
            readyToSave ? 'glass-card-gold' : 'glass-card',
          ]"
        >
          <div class="flex items-center justify-between gap-4">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-gray-300">Ready to save</p>

              <p class="muted mt-1 truncate">
                {{ completeCount }}
                {{ completeCount === 1 ? "person" : "people" }}
                <template v-if="centre">
                  · {{ centreLabel(centre) }} centre
                </template>
                <template v-else> · no centre chosen </template>
              </p>
            </div>

            <span
              :class="[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg transition',
                readyToSave
                  ? 'bg-gradient-to-br from-[#E2C45A] to-[#A8861F] text-black'
                  : 'bg-white/[0.06] text-gray-600',
              ]"
            >
              ✓
            </span>
          </div>

          <div
            v-if="error"
            class="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400 backdrop-blur"
          >
            {{ error }}
          </div>

          <button
            type="button"
            @click="handleSubmit()"
            :disabled="loading || checkingDuplicates"
            class="btn-gold mt-5 w-full py-3.5"
          >
            {{
              loading
                ? "Saving outing..."
                : checkingDuplicates
                  ? "Checking..."
                  : "Save outing"
            }}
          </button>

          <p class="mt-3 text-center text-xs text-gray-600">
            Saved to {{ today }}
          </p>
        </div>
      </section>
    </main>

    <!-- =====================================================
         DUPLICATE WARNING
    ====================================================== -->

    <AppModal
      :open="Boolean(duplicateWarning)"
      labelled-by="duplicate-title"
      @close="duplicateWarning = null"
    >
      <div v-if="duplicateWarning">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-xl text-[#D4AF37]"
          aria-hidden="true"
        >
          ⚠
        </div>

        <h3 id="duplicate-title" class="mt-4 text-lg font-bold">
          {{ duplicateWarning.length === 1 ? "This number looks" : "Some numbers look" }}
          familiar
        </h3>

        <p class="mt-2 text-sm leading-6 text-gray-500">
          Recording someone twice splits their follow-up and counts
          them twice. Worth a look before saving.
        </p>

        <ul class="mt-4 space-y-2">
          <li
            v-for="(duplicate, index) in duplicateWarning"
            :key="`dupe-${index}`"
            class="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5"
          >
            <p class="text-sm font-semibold text-white">
              {{ duplicate.name }}
            </p>

            <p class="mt-0.5 text-xs text-gray-500">
              {{ duplicate.phone }} · {{ duplicate.where }}
            </p>
          </li>
        </ul>

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            data-autofocus
            @click="duplicateWarning = null"
            class="btn-gold flex-1"
          >
            Let me check
          </button>

          <button
            type="button"
            @click="handleSubmit({ skipDuplicateCheck: true })"
            class="btn-ghost flex-1"
          >
            Save anyway
          </button>
        </div>
      </div>
    </AppModal>

    <BottomNav />
  </div>
</template>
