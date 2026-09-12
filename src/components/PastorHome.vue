<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { loadContributorStats } from "../lib/contributors";
import { getWeekRange, toDateKey, formatWeekLabel } from "../lib/week";

/* =========================================================
   PASTOR HOME

   Deliberately not a second Pastor Summary. That page is the
   all-time record and the PDF export; this one answers "what
   needs me this week" - momentum against last week, the
   follow-up that has not happened, and who has gone quiet.
========================================================= */

const props = defineProps({
  teamRankings: { type: Array, default: () => [] },
});

const router = useRouter();

const loading = ref(true);
const error = ref("");

const weekLabel = ref("");

const soulsThisWeek = ref(0);
const soulsLastWeek = ref(0);
const soulsAllTime = ref(0);
const outingsThisWeek = ref(0);

const notCalled = ref(0);
const notTexted = ref(0);
const staleNew = ref(0);

const firstTimersThisWeek = ref(0);
const recentFirstTimers = ref([]);

const contributors = ref([]);

/* =========================================================
   DERIVED
========================================================= */

const trend = computed(() => {
  const now = soulsThisWeek.value;
  const before = soulsLastWeek.value;

  // No baseline to compare against: the first week of data, or
  // a quiet week following a quiet one.
  if (!before) {
    return { percent: null, up: now > 0, label: "No week to compare" };
  }

  const percent = Math.round(((now - before) / before) * 100);

  return {
    percent,
    up: percent >= 0,
    label: `${percent >= 0 ? "+" : ""}${percent}% vs last week`,
  };
});

const activeThisWeek = computed(
  () => contributors.value.filter((person) => person.weekCount > 0).length,
);

const quietMembers = computed(() =>
  contributors.value
    .filter((person) => person.weekCount === 0)
    .sort((a, b) => b.count - a.count),
);

const topThisWeek = computed(() =>
  [...contributors.value]
    .filter((person) => person.weekCount > 0)
    .sort((a, b) => b.weekCount - a.weekCount || a.name.localeCompare(b.name))
    .slice(0, 5),
);

const followUpGaps = computed(() => [
  {
    key: "called",
    label: "Not yet called",
    value: notCalled.value,
    tone: "green",
    hint: "No call has been placed to these contacts",
  },
  {
    key: "texted",
    label: "Not yet texted",
    value: notTexted.value,
    tone: "blue",
    hint: "No invitation text has been sent",
  },
  {
    key: "stale",
    label: "Sitting untouched",
    value: staleNew.value,
    tone: "red",
    hint: "Still marked New three days after being recorded",
  },
]);

/* =========================================================
   LOAD
========================================================= */

const load = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { start, end } = getWeekRange();

    // A millisecond before this week began lands inside last week,
    // so the same helper gives the previous Sat -> Fri window.
    const previous = getWeekRange(new Date(start.getTime() - 1));

    weekLabel.value = formatWeekLabel({ start, end });

    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 3);

    const counted = (query) => query;

    const results = await Promise.all([
      counted(
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString()),
      ),

      counted(
        supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .gte("created_at", previous.start.toISOString())
          .lt("created_at", previous.end.toISOString()),
      ),

      supabase.from("contacts").select("*", { count: "exact", head: true }),

      supabase
        .from("evangelism_outings")
        .select("*", { count: "exact", head: true })
        .gte("outing_date", toDateKey(start))
        .lt("outing_date", toDateKey(end)),

      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .is("called_at", null),

      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .is("texted_at", null),

      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("status", "New")
        .lt("created_at", staleCutoff.toISOString()),

      supabase
        .from("first_timers")
        .select("*", { count: "exact", head: true })
        .gte("created_at", start.toISOString()),

      supabase
        .from("first_timers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    const [
      thisWeek,
      lastWeek,
      allTime,
      outings,
      uncalled,
      untexted,
      stale,
      newFirstTimers,
      recent,
    ] = results;

    soulsThisWeek.value = thisWeek.count || 0;
    soulsLastWeek.value = lastWeek.count || 0;
    soulsAllTime.value = allTime.count || 0;
    outingsThisWeek.value = outings.count || 0;

    notCalled.value = uncalled.count || 0;
    notTexted.value = untexted.count || 0;
    staleNew.value = stale.count || 0;

    firstTimersThisWeek.value = newFirstTimers.count || 0;
    recentFirstTimers.value = recent.data || [];

    contributors.value = await loadContributorStats();
  } catch (err) {
    console.error("Pastor home error:", err);

    error.value = err.message || "Unable to load the church overview.";
  } finally {
    loading.value = false;
  }
};

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

onMounted(() => {
  load();
});
</script>

<template>
  <div>
    <!-- =====================================================
         HERO
    ====================================================== -->

    <section class="glass-card-gold rise p-5 sm:p-7">
      <div
        class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
      >
        <div class="min-w-0">
          <p class="eyebrow">Shepherd's view</p>

          <h2 class="mt-2 text-xl font-bold sm:text-2xl">
            Souls reached this week
          </h2>

          <div class="mt-4 flex flex-wrap items-end gap-4">
            <p
              class="gold-gradient-text text-5xl font-black leading-none sm:text-6xl"
            >
              {{ loading ? "—" : soulsThisWeek }}
            </p>

            <span
              v-if="!loading"
              :class="[
                'badge',
                trend.percent === null
                  ? 'badge-neutral'
                  : trend.up
                    ? 'badge-green'
                    : 'badge-red',
              ]"
            >
              <span v-if="trend.percent !== null">
                {{ trend.up ? "▲" : "▼" }}
              </span>

              {{ trend.label }}
            </span>
          </div>

          <p class="muted mt-3">
            {{ weekLabel }} · resets Friday night ·
            {{ outingsThisWeek }}
            {{ outingsThisWeek === 1 ? "outing" : "outings" }} held
          </p>
        </div>

        <div class="flex shrink-0 gap-3">
          <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p class="text-[11px] text-gray-500">Last week</p>

            <p class="mt-1 text-2xl font-black text-white">
              {{ loading ? "—" : soulsLastWeek }}
            </p>
          </div>

          <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p class="text-[11px] text-gray-500">All time</p>

            <p class="mt-1 text-2xl font-black text-white">
              {{ loading ? "—" : soulsAllTime }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ERROR -->

    <div
      v-if="error"
      class="mt-5 rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-5 text-sm text-red-400 backdrop-blur"
    >
      {{ error }}
    </div>

    <!-- =====================================================
         NEEDS ATTENTION

         The whole point of this page: contacts the church has
         collected but not yet followed up.
    ====================================================== -->

    <section class="mt-8">
      <p class="eyebrow">Needs attention</p>

      <h3 class="section-title mt-2">Follow-up gaps</h3>

      <p class="muted mt-1">
        People already recorded who have not been reached yet.
      </p>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <button
          v-for="gap in followUpGaps"
          :key="gap.key"
          type="button"
          @click="router.push('/contacts')"
          class="glass-card-interactive p-5 text-left"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold text-gray-300">
              {{ gap.label }}
            </p>

            <span
              :class="[
                'h-2 w-2 shrink-0 rounded-full',
                gap.tone === 'green'
                  ? 'bg-green-400'
                  : gap.tone === 'blue'
                    ? 'bg-blue-400'
                    : 'bg-red-400',
              ]"
            ></span>
          </div>

          <p
            :class="[
              'mt-4 text-3xl font-black',
              gap.tone === 'green'
                ? 'text-green-400'
                : gap.tone === 'blue'
                  ? 'text-blue-400'
                  : 'text-red-400',
            ]"
          >
            {{ loading ? "—" : gap.value }}
          </p>

          <p class="mt-2 text-xs leading-5 text-gray-500">
            {{ gap.hint }}
          </p>
        </button>
      </div>
    </section>

    <!-- =====================================================
         PEOPLE
    ====================================================== -->

    <section class="mt-8 grid gap-4 lg:grid-cols-2">
      <!-- ACTIVE THIS WEEK -->

      <div class="glass-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Workforce</p>

            <h3 class="section-title mt-2">Out this week</h3>
          </div>

          <button
            type="button"
            @click="router.push('/pastor/contributors')"
            class="btn-outline-gold btn-sm shrink-0"
          >
            All members
          </button>
        </div>

        <div class="mt-5 flex items-end gap-3">
          <p class="gold-gradient-text text-4xl font-black leading-none">
            {{ loading ? "—" : activeThisWeek }}
          </p>

          <p class="pb-1 text-sm text-gray-500">
            of {{ contributors.length }} members
          </p>
        </div>

        <!-- Progress -->
        <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#A8861F] to-[#E2C45A] transition-all duration-700"
            :style="{
              width: contributors.length
                ? `${(activeThisWeek / contributors.length) * 100}%`
                : '0%',
            }"
          ></div>
        </div>

        <p class="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-600">
          Gone quiet this week
        </p>

        <div v-if="loading" class="mt-3 space-y-2">
          <div
            v-for="i in 3"
            :key="`quiet-skeleton-${i}`"
            class="skeleton h-9 rounded-xl"
          ></div>
        </div>

        <p
          v-else-if="quietMembers.length === 0"
          class="mt-3 text-sm text-green-400"
        >
          Everyone has recorded someone this week.
        </p>

        <div v-else class="mt-3 flex flex-wrap gap-2">
          <span
            v-for="person in quietMembers.slice(0, 8)"
            :key="person.id"
            class="badge-neutral"
            :title="`${person.count} all time`"
          >
            {{ person.name }}
          </span>

          <span
            v-if="quietMembers.length > 8"
            class="badge-neutral text-gray-500"
          >
            +{{ quietMembers.length - 8 }} more
          </span>
        </div>
      </div>

      <!-- TOP THIS WEEK -->

      <div class="glass-card p-5">
        <p class="eyebrow">Individual impact</p>

        <h3 class="section-title mt-2">Leading this week</h3>

        <div v-if="loading" class="mt-5 space-y-2">
          <div
            v-for="i in 5"
            :key="`top-skeleton-${i}`"
            class="skeleton h-12 rounded-xl"
          ></div>
        </div>

        <p v-else-if="topThisWeek.length === 0" class="muted mt-5">
          No one has recorded anyone yet this week.
        </p>

        <div v-else class="mt-5 space-y-2">
          <div
            v-for="(person, index) in topThisWeek"
            :key="person.id"
            class="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <div
              :class="[
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black',
                index === 0
                  ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black'
                  : 'bg-[#D4AF37]/10 text-[#D4AF37]',
              ]"
            >
              {{ index + 1 }}
            </div>

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">
                {{ person.name }}
              </p>

              <p class="truncate text-[11px] text-gray-500">
                {{ person.team }}
              </p>
            </div>

            <p class="shrink-0 text-lg font-black text-[#D4AF37]">
              {{ person.weekCount }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- =====================================================
         TEAM RANKINGS
    ====================================================== -->

    <section v-if="props.teamRankings.length" class="mt-8">
      <p class="eyebrow">Team performance</p>

      <h3 class="section-title mt-2">Team rankings</h3>

      <p class="muted mt-1">People reached this week, by team.</p>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <div
          v-for="(team, index) in props.teamRankings"
          :key="team.team"
          :class="[
            'flex items-center gap-4 p-4',
            index === 0 ? 'glass-card-gold' : 'glass-card',
          ]"
        >
          <div
            :class="[
              'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black',
              index === 0
                ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black'
                : 'bg-[#D4AF37]/10 text-[#D4AF37]',
            ]"
          >
            <span
              v-if="index === 0"
              class="absolute -top-3 text-sm leading-none"
            >
              ♛
            </span>

            {{ index + 1 }}
          </div>

          <div class="min-w-0 flex-1">
            <p
              :class="[
                'truncate font-semibold',
                index === 0 ? 'text-[#D4AF37]' : '',
              ]"
            >
              {{ team.team }}
            </p>

            <p class="mt-0.5 text-xs text-gray-500">
              {{ index === 0 ? "Leading this week" : "People reached" }}
            </p>
          </div>

          <p
            :class="[
              'shrink-0 text-xl font-black',
              index === 0 ? 'text-[#D4AF37]' : 'text-white',
            ]"
          >
            {{ team.count }}
          </p>
        </div>
      </div>
    </section>

    <!-- =====================================================
         FIRST TIMERS
    ====================================================== -->

    <section class="mt-8">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="eyebrow">New to the church</p>

          <h3 class="section-title mt-2">First timers</h3>
        </div>

        <button
          type="button"
          @click="router.push('/first-timers')"
          class="btn-outline-gold btn-sm shrink-0"
        >
          Open register
        </button>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <div class="glass-card-gold p-5 sm:col-span-1">
          <p class="text-xs text-gray-400">Recorded this week</p>

          <p class="gold-gradient-text mt-3 text-4xl font-black leading-none">
            {{ loading ? "—" : firstTimersThisWeek }}
          </p>
        </div>

        <div class="glass-card p-5 sm:col-span-2">
          <p class="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Most recent
          </p>

          <div v-if="loading" class="mt-3 space-y-2">
            <div
              v-for="i in 3"
              :key="`ft-skeleton-${i}`"
              class="skeleton h-8 rounded-lg"
            ></div>
          </div>

          <p v-else-if="recentFirstTimers.length === 0" class="muted mt-3">
            No first timers recorded yet.
          </p>

          <ul v-else class="mt-3 space-y-2">
            <li
              v-for="person in recentFirstTimers"
              :key="person.id"
              class="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"
            >
              <span class="truncate text-sm font-medium">
                {{ person.name || person.full_name || "Unnamed" }}
              </span>

              <span class="shrink-0 text-xs text-gray-600">
                {{ formatDate(person.created_at) }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- =====================================================
         OVERSIGHT TOOLS

         No "Add Outing": the pastor does not go out, so the
         card that leads every member's dashboard would only
         be noise here.
    ====================================================== -->

    <section class="mt-8">
      <p class="eyebrow">Oversight</p>

      <h3 class="section-title mt-2">Where to go next</h3>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          @click="router.push('/pastor')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-10 w-10 text-lg">▦</div>

          <h4 class="mt-4 font-bold">Pastor Summary</h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            All-time totals, status health and the PDF report.
          </p>
        </button>

        <button
          type="button"
          @click="router.push('/pastor/contributors')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-10 w-10 text-lg">◎</div>

          <h4 class="mt-4 font-bold">All Contributors</h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Every member's week, total, called and texted counts.
          </p>
        </button>

        <button
          type="button"
          @click="router.push('/contacts')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-10 w-10 text-lg">▣</div>

          <h4 class="mt-4 font-bold">Contacts</h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Every soul recorded church-wide, with filters and export.
          </p>
        </button>

        <button
          type="button"
          @click="router.push('/first-timers')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-10 w-10 text-lg">✦</div>

          <h4 class="mt-4 font-bold">First Timers</h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            The register of everyone new to the church.
          </p>
        </button>
      </div>
    </section>
  </div>
</template>
