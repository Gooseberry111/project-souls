<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const branch = ref("");
const people = ref([
  {
    name: "",
    phone: "",
    feedback: "",
  },
]);

const loading = ref(false);
const error = ref("");

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

const handleSubmit = async () => {
  error.value = "";

  if (!branch.value) {
    error.value = "Please select a branch.";
    return;
  }

  const invalidPerson = people.value.some(
    (person) => !person.name.trim() || !person.phone.trim(),
  );

  if (invalidPerson) {
    error.value = "Please enter a name and phone number for every person.";
    return;
  }

  loading.value = true;

  try {
    // Create outing
    const { data: outing, error: outingError } = await supabase
      .from("evangelism_outings")
      .insert({
        title: `${branch.value} Branch`,
        outing_date: new Date().toISOString().split("T")[0],
        location: branch.value,
        created_by: authStore.user.id,
      })
      .select()
      .single();

    if (outingError) throw outingError;

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

    // Connect contacts to outing
    const outingContacts = contacts.map((contact) => ({
      outing_id: outing.id,
      contact_id: contact.id,
    }));

    const { error: outingContactsError } = await supabase
      .from("outing_contacts")
      .insert(outingContacts);

    if (outingContactsError) throw outingContactsError;

    router.push("/dashboard");
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- Header -->
    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto flex max-w-3xl items-center gap-4 px-4 py-4 sm:px-6">
        <button
          type="button"
          @click="router.push('/dashboard')"
          class="text-xl text-gray-500 transition hover:text-[#D4AF37]"
        >
          ←
        </button>

        <div>
          <h1 class="font-bold">Add Outing</h1>

          <p class="text-xs text-gray-500">
            Record today's evangelism outreach
          </p>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <!-- Intro -->
      <div class="mb-8">
        <p class="text-sm font-semibold text-[#D4AF37]">New outing</p>

        <h2 class="mt-2 text-3xl font-black">Who did you speak with?</h2>

        <p class="mt-3 text-sm leading-6 text-gray-500">
          Add everyone you spoke with during this outing. You can add as many
          people as you need.
        </p>
      </div>

      <!-- Form -->
      <div class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-6">
        <!-- Branch -->
        <div class="mb-8">
          <label class="mb-3 block text-sm font-semibold text-gray-300">
            Select center
          </label>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              @click="branch = 'Barnawa'"
              :class="[
                'rounded-xl border p-4 text-left transition',
                branch === 'Barnawa'
                  ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              ]"
            >
              <p
                :class="[
                  'font-semibold',
                  branch === 'Barnawa' ? 'text-[#D4AF37]' : 'text-white',
                ]"
              >
                Barnawa
              </p>

              <p class="mt-1 text-xs text-gray-500">Barnawa Center</p>
            </button>

            <button
              type="button"
              @click="branch = 'Gbaggivilla'"
              :class="[
                'rounded-xl border p-4 text-left transition',
                branch === 'Gbaggivilla'
                  ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              ]"
            >
              <p
                :class="[
                  'font-semibold',
                  branch === 'Gbaggivilla' ? 'text-[#D4AF37]' : 'text-white',
                ]"
              >
                Gbagyivilla
              </p>

              <p class="mt-1 text-xs text-gray-500">Gbagyivilla center</p>
            </button>
          </div>
        </div>

        <!-- People -->
        <div class="space-y-5">
          <div
            v-for="(person, index) in people"
            :key="index"
            class="rounded-2xl border border-white/10 bg-[#0B0B0B] p-4 sm:p-5"
          >
            <!-- Row Header -->
            <div class="mb-5 flex items-center justify-between">
              <p class="text-sm font-semibold text-[#D4AF37]">
                Person {{ index + 1 }}
              </p>

              <button
                v-if="people.length > 1"
                type="button"
                @click="removePerson(index)"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-red-950/30 hover:text-red-400"
              >
                ×
              </button>
            </div>

            <!-- Name -->
            <div class="mb-4">
              <label class="mb-2 block text-sm text-gray-400"> Name </label>

              <input
                v-model="person.name"
                type="text"
                placeholder="Enter full name"
                class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
            </div>

            <!-- Phone -->
            <div class="mb-4">
              <label class="mb-2 block text-sm text-gray-400">
                Phone number
              </label>

              <input
                v-model="person.phone"
                type="tel"
                placeholder="Enter phone number"
                class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
            </div>

            <!-- Feedback -->
            <div>
              <label class="mb-2 block text-sm text-gray-400">
                Feedback
                <span class="text-gray-600"> (optional) </span>
              </label>

              <textarea
                v-model="person.feedback"
                rows="3"
                placeholder="How did the conversation go?"
                class="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              ></textarea>

              <p class="mt-2 text-xs text-gray-600">
                Adding feedback will mark this person as Called.
              </p>
            </div>
          </div>
        </div>

        <!-- Add another -->
        <button
          type="button"
          @click="addPerson"
          class="mt-5 w-full rounded-xl border border-dashed border-[#D4AF37]/40 px-4 py-3.5 text-sm font-semibold text-[#D4AF37] transition hover:border-[#D4AF37] hover:bg-[#D4AF37]/5"
        >
          + Add another person
        </button>

        <!-- Error -->
        <div
          v-if="error"
          class="mt-5 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
        >
          {{ error }}
        </div>

        <!-- Save -->
        <button
          type="button"
          @click="handleSubmit"
          :disabled="loading"
          class="mt-5 w-full rounded-xl bg-[#D4AF37] px-4 py-3.5 text-sm font-black text-black transition hover:bg-[#E2C45A] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {{ loading ? "Saving outing..." : "Save outing" }}
        </button>
      </div>
    </main>
  </div>
</template>
