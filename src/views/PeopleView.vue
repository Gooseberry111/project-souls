<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";

const router = useRouter();

const people = ref([]);
const search = ref("");
const loading = ref(true);
const error = ref("");

const loadPeople = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { data, error: peopleError } = await supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });

    if (peopleError) throw peopleError;

    people.value = data || [];
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadPeople();
});
const filteredPeople = computed(() => {
  const query = search.value.trim().toLowerCase();

  if (!query) {
    return people.value;
  }

  return people.value.filter((person) => {
    return (
      person.name?.toLowerCase().includes(query) ||
      person.phone?.toLowerCase().includes(query)
    );
  });
});
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- Header -->
    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto max-w-4xl px-4 py-4 sm:px-6">
        <button
          @click="router.push('/dashboard')"
          class="mb-4 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back to dashboard
        </button>

        <p class="text-sm font-semibold text-[#D4AF37]">Outreach</p>

        <h1 class="mt-1 text-2xl font-black sm:text-3xl">People</h1>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-4 py-8 pb-24 sm:px-6">
      <!-- Search -->
      <div v-if="!loading && !error && people.length > 0" class="mb-6">
        <input
          v-model="search"
          type="search"
          placeholder="Search by name or phone number..."
          class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
        />
      </div>
      <!-- Loading -->
      <div
        v-if="loading"
        class="rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-sm text-gray-500"
      >
        Loading people...
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <!-- Empty -->
      <div
        v-else-if="people.length === 0"
        class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-8 text-center"
      >
        <p class="text-gray-400">No people recorded yet.</p>

        <button
          @click="router.push('/record-person')"
          class="mt-4 font-semibold text-[#D4AF37]"
        >
          + Add your first person
        </button>
      </div>

      <!-- People -->
      <div v-else class="space-y-3">
        <div
          v-for="person in filteredPeople"
          :key="person.id"
          class="rounded-2xl border border-white/10 bg-[#101010] p-5"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <h2 class="font-bold">
                {{ person.name }}
              </h2>

              <p class="mt-1 text-sm text-gray-500">
                {{ person.phone }}
              </p>
            </div>

            <span
              :class="[
                'shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
                person.status === 'Called'
                  ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                  : 'bg-white/5 text-gray-500',
              ]"
            >
              {{ person.status }}
            </span>
          </div>

          <div v-if="person.notes" class="mt-4 border-t border-white/10 pt-4">
            <p class="text-xs uppercase tracking-wider text-gray-600">
              Feedback
            </p>

            <p class="mt-2 text-sm leading-6 text-gray-400">
              {{ person.notes }}
            </p>
          </div>
        </div>
      </div>
    </main>

    <!-- Mobile Navigation -->
    <nav
      class="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#0D0D0D]/95 backdrop-blur lg:hidden"
    >
      <div class="grid grid-cols-3">
        <button
          @click="router.push('/dashboard')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500"
        >
          <span class="text-lg">⌂</span>
          <span class="text-[11px]">Home</span>
        </button>

        <button
          @click="router.push('/record-person')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500"
        >
          <span class="text-lg">+</span>
          <span class="text-[11px]">Add Outing</span>
        </button>

        <button class="flex flex-col items-center gap-1 py-3 text-[#D4AF37]">
          <span class="text-lg">≡</span>
          <span class="text-[11px]">People</span>
        </button>
      </div>
    </nav>
  </div>
</template>
