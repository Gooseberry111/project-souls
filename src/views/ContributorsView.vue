<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { goBack } from "../lib/navigation";
import { loadContributorStats } from "../lib/contributors";
import { getWeekRange, formatWeekLabel } from "../lib/week";

const router = useRouter();

const contributors = ref([]);
const loading = ref(true);
const error = ref("");
const weekLabel = ref("");

const search = ref("");
const sortBy = ref("count");

/* =========================================================
   FILTER + SORT
========================================================= */

const filteredContributors = computed(() => {
  const query = search.value.trim().toLowerCase();

  let result = contributors.value;

  if (query) {
    result = result.filter(
      (person) =>
        person.name.toLowerCase().includes(query) ||
        person.team.toLowerCase().includes(query),
    );
  }

  const key = sortBy.value;

  return [...result].sort((a, b) => {
    if (key === "name") return a.name.localeCompare(b.name);

    return b[key] - a[key] || a.name.localeCompare(b.name);
  });
});

const totals = computed(() => {
  return contributors.value.reduce(
    (sum, person) => ({
      week: sum.week + person.weekCount,
      count: sum.count + person.count,
      called: sum.called + person.calledCount,
      texted: sum.texted + person.textedCount,
      active: sum.active + (person.count > 0 ? 1 : 0),
    }),
    { week: 0, count: 0, called: 0, texted: 0, active: 0 },
  );
});

/* =========================================================
   LOAD
========================================================= */

const load = async () => {
  loading.value = true;
  error.value = "";

  try {
    weekLabel.value = formatWeekLabel(getWeekRange());

    contributors.value = await loadContributorStats();
  } catch (err) {
    console.error("Contributors error:", err);

    error.value = err.message || "Unable to load contributors.";
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  load();
});
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="glass-bar border-b">
      <div class="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          @click="goBack(router, '/pastor')"
          class="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <p class="eyebrow">Individual impact</p>

        <h1 class="page-title mt-2">All Contributors</h1>

        <p class="muted mt-2">
          What every member has recorded. Week of {{ weekLabel }}.
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8">
      <!-- LOADING -->

      <div v-if="loading" class="animate-pulse">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div
            v-for="i in 6"
            :key="`total-skeleton-${i}`"
            class="glass-card p-4"
          >
            <div class="h-3 w-20 rounded bg-white/10"></div>
            <div class="mt-3 h-7 w-14 rounded bg-white/10"></div>
          </div>
        </div>

        <div class="mt-6 space-y-3">
          <div
            v-for="i in 8"
            :key="`row-skeleton-${i}`"
            class="glass-card p-4"
          >
            <div class="h-4 w-40 rounded bg-white/10"></div>
            <div class="mt-2 h-3 w-24 rounded bg-white/10"></div>
          </div>
        </div>
      </div>

      <!-- ERROR -->

      <div
        v-else-if="error"
        class="rounded-2xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <template v-else>
        <!-- =================================================
             TOTALS
        ================================================== -->

        <section class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">Members</p>

            <p class="mt-2 text-2xl font-black text-white">
              {{ contributors.length }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">Recorded anyone</p>

            <p class="mt-2 text-2xl font-black text-white">
              {{ totals.active }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">This week</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totals.week }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">All time</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totals.count }}
            </p>
          </div>

          <div
            class="rounded-2xl border border-green-500/20 bg-white/[0.035] backdrop-blur-xl p-4"
          >
            <p class="text-xs text-gray-500">Called</p>

            <p class="mt-2 text-2xl font-black text-green-400">
              {{ totals.called }}
            </p>
          </div>

          <div class="rounded-2xl border border-blue-500/20 bg-white/[0.035] backdrop-blur-xl p-4">
            <p class="text-xs text-gray-500">Texted</p>

            <p class="mt-2 text-2xl font-black text-blue-400">
              {{ totals.texted }}
            </p>
          </div>
        </section>

        <!-- =================================================
             SEARCH + SORT
        ================================================== -->

        <section class="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            v-model="search"
            type="search"
            placeholder="Search by name or team..."
            class="field"
          />

          <select
            v-model="sortBy"
            class="field-select shrink-0"
          >
            <option value="count">Sort: total contacts</option>
            <option value="weekCount">Sort: this week</option>
            <option value="calledCount">Sort: called</option>
            <option value="textedCount">Sort: texted</option>
            <option value="name">Sort: name</option>
          </select>
        </section>

        <p class="mt-4 text-xs text-gray-600">
          Showing
          <span class="text-gray-300">{{ filteredContributors.length }}</span>
          of
          <span class="text-gray-300">{{ contributors.length }}</span>
          members
        </p>

        <!-- =================================================
             EMPTY
        ================================================== -->

        <div
          v-if="filteredContributors.length === 0"
          class="mt-4 glass-dashed p-8 text-center text-sm text-gray-500"
        >
          No one matches that search.
        </div>

        <template v-else>
          <!-- =================================================
               CARDS (mobile)

               Four numbers per person will not fit a readable
               table on a phone, so small screens get a card.
          ================================================== -->

          <div class="mt-4 space-y-3 sm:hidden">
            <article
              v-for="(person, index) in filteredContributors"
              :key="person.id"
              class="glass-card p-4"
            >
              <div class="flex items-start gap-3">
                <div
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-sm font-black text-[#D4AF37]"
                >
                  {{ index + 1 }}
                </div>

                <div class="min-w-0 flex-1">
                  <p class="truncate font-bold">
                    {{ person.name }}
                  </p>

                  <p class="mt-0.5 text-xs text-gray-500">
                    {{ person.team }}
                  </p>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-4 gap-2 border-t border-white/5 pt-3">
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-gray-600">
                    Week
                  </p>

                  <p
                    :class="[
                      'mt-1 text-lg font-black',
                      person.weekCount > 0 ? 'text-[#D4AF37]' : 'text-gray-700',
                    ]"
                  >
                    {{ person.weekCount }}
                  </p>
                </div>

                <div>
                  <p class="text-[10px] uppercase tracking-wide text-gray-600">
                    Total
                  </p>

                  <p
                    :class="[
                      'mt-1 text-lg font-black',
                      person.count > 0 ? 'text-white' : 'text-gray-700',
                    ]"
                  >
                    {{ person.count }}
                  </p>
                </div>

                <div>
                  <p class="text-[10px] uppercase tracking-wide text-gray-600">
                    Called
                  </p>

                  <p
                    :class="[
                      'mt-1 text-lg font-black',
                      person.calledCount > 0
                        ? 'text-green-400'
                        : 'text-gray-700',
                    ]"
                  >
                    {{ person.calledCount }}
                  </p>
                </div>

                <div>
                  <p class="text-[10px] uppercase tracking-wide text-gray-600">
                    Texted
                  </p>

                  <p
                    :class="[
                      'mt-1 text-lg font-black',
                      person.textedCount > 0
                        ? 'text-blue-400'
                        : 'text-gray-700',
                    ]"
                  >
                    {{ person.textedCount }}
                  </p>
                </div>
              </div>
            </article>
          </div>

          <!-- =================================================
               TABLE (desktop)
          ================================================== -->

          <div
            class="mt-4 hidden overflow-hidden glass-card sm:block"
          >
            <table class="w-full text-left">
              <thead class="glass-bar border-b">
                <tr class="text-[11px] uppercase tracking-wide text-gray-500">
                  <th class="px-4 py-4 font-semibold">#</th>

                  <th class="px-4 py-4 font-semibold">Member</th>

                  <th class="px-4 py-4 text-right font-semibold">Week</th>

                  <th class="px-4 py-4 text-right font-semibold">Total</th>

                  <th class="px-4 py-4 text-right font-semibold">Called</th>

                  <th class="px-6 py-4 text-right font-semibold">Texted</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-white/5">
                <tr
                  v-for="(person, index) in filteredContributors"
                  :key="person.id"
                  class="transition hover:bg-white/[0.02]"
                >
                  <td class="px-4 py-4 text-sm font-black text-gray-600">
                    {{ index + 1 }}
                  </td>

                  <td class="px-4 py-4">
                    <p class="font-semibold text-white">
                      {{ person.name }}
                    </p>

                    <p class="mt-0.5 text-xs text-gray-500">
                      {{ person.team }}
                    </p>
                  </td>

                  <td class="px-4 py-4 text-right">
                    <span
                      :class="[
                        'text-lg font-black',
                        person.weekCount > 0
                          ? 'text-[#D4AF37]'
                          : 'text-gray-700',
                      ]"
                    >
                      {{ person.weekCount }}
                    </span>
                  </td>

                  <td class="px-4 py-4 text-right">
                    <span
                      :class="[
                        'text-lg font-black',
                        person.count > 0 ? 'text-white' : 'text-gray-700',
                      ]"
                    >
                      {{ person.count }}
                    </span>
                  </td>

                  <td class="px-4 py-4 text-right">
                    <span
                      :class="[
                        'text-lg font-black',
                        person.calledCount > 0
                          ? 'text-green-400'
                          : 'text-gray-700',
                      ]"
                    >
                      {{ person.calledCount }}
                    </span>
                  </td>

                  <td class="px-6 py-4 text-right">
                    <span
                      :class="[
                        'text-lg font-black',
                        person.textedCount > 0
                          ? 'text-blue-400'
                          : 'text-gray-700',
                      ]"
                    >
                      {{ person.textedCount }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </template>
    </main>

    <!-- =====================================================
         MOBILE NAVIGATION
    ====================================================== -->

    <BottomNav />
  </div>
</template>
