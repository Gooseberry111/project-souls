<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";
import { getWeekRange, formatWeekLabel } from "../lib/week";

/* =========================================================
   MEMBER HOME

   The member's own week: what they have recorded, who they
   still owe a call or a text, and where their team stands.
   Counterpart to PastorHome, which shows the whole church.
========================================================= */

const props = defineProps({
  teamRankings: { type: Array, default: () => [] },
});

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref("");

const weekLabel = ref("");

const weekCount = ref(0);
const lastWeekCount = ref(0);
const totalCount = ref(0);

const calledCount = ref(0);
const textedCount = ref(0);

const outings = ref([]);

/* =========================================================
   DERIVED
========================================================= */

const trend = computed(() => {
  const now = weekCount.value;
  const before = lastWeekCount.value;

  if (!before) {
    return { percent: null, up: now > 0, label: "First week of data" };
  }

  const percent = Math.round(((now - before) / before) * 100);

  return {
    percent,
    up: percent >= 0,
    label: `${percent >= 0 ? "+" : ""}${percent}% vs last week`,
  };
});

/* The nudge that makes this page worth opening: people this
   member recorded and has not reached yet. */
const awaitingCall = computed(() =>
  Math.max(0, totalCount.value - calledCount.value),
);

const awaitingText = computed(() =>
  Math.max(0, totalCount.value - textedCount.value),
);

const followUpRate = computed(() => {
  if (!totalCount.value) return 0;

  return Math.round((calledCount.value / totalCount.value) * 100);
});

const myTeam = computed(() => authStore.profile?.team || null);

const teamStanding = computed(() => {
  if (!myTeam.value) return null;

  const index = props.teamRankings.findIndex(
    (team) => team.team === myTeam.value,
  );

  if (index === -1) return null;

  return {
    position: index + 1,
    count: props.teamRankings[index].count,
    leading: index === 0,
  };
});

/* How much of the team's week this member is personally
   responsible for. */
const shareOfTeam = computed(() => {
  const teamTotal = teamStanding.value?.count || 0;

  if (!teamTotal) return 0;

  return Math.min(100, Math.round((weekCount.value / teamTotal) * 100));
});

const recentOutings = computed(() => outings.value.slice(0, 4));

const greeting = computed(() => {
  const hour = new Date().getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";

  return "Good evening";
});

/* =========================================================
   LOAD
========================================================= */

const formatDate = (date) => {
  if (!date) return "";

  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

const load = async () => {
  loading.value = true;
  error.value = "";

  try {
    const userId = authStore.user?.id;

    if (!userId) return;

    const { start, end } = getWeekRange();

    // A millisecond before this week began lands inside last week.
    const previous = getWeekRange(new Date(start.getTime() - 1));

    weekLabel.value = formatWeekLabel({ start, end });

    const mine = () =>
      supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("added_by", userId);

    const results = await Promise.all([
      mine(),

      mine()
        .gte("created_at", start.toISOString())
        .lt("created_at", end.toISOString()),

      mine()
        .gte("created_at", previous.start.toISOString())
        .lt("created_at", previous.end.toISOString()),

      mine().not("called_at", "is", null),

      mine().not("texted_at", "is", null),

      supabase
        .from("evangelism_outings")
        .select("id, title, outing_date, location")
        .eq("created_by", userId)
        .order("outing_date", { ascending: false })
        .limit(8),
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    const [total, week, lastWeek, called, texted, recent] = results;

    totalCount.value = total.count || 0;
    weekCount.value = week.count || 0;
    lastWeekCount.value = lastWeek.count || 0;
    calledCount.value = called.count || 0;
    textedCount.value = texted.count || 0;
    outings.value = recent.data || [];
  } catch (err) {
    console.error("Member home error:", err);

    error.value = err.message || "Unable to load your dashboard.";
  } finally {
    loading.value = false;
  }
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
          <p class="eyebrow">{{ greeting }}</p>

          <h2 class="mt-2 text-xl font-bold sm:text-2xl">
            People you reached this week
          </h2>

          <div class="mt-4 flex flex-wrap items-end gap-4">
            <p
              class="gold-gradient-text text-5xl font-black leading-none sm:text-6xl"
            >
              {{ loading ? "—" : weekCount }}
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
            {{ weekLabel }} · resets Friday night
          </p>
        </div>

        <div class="flex shrink-0 gap-3">
          <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p class="text-[11px] text-gray-500">Last week</p>

            <p class="mt-1 text-2xl font-black text-white">
              {{ loading ? "—" : lastWeekCount }}
            </p>
          </div>

          <div class="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p class="text-[11px] text-gray-500">All time</p>

            <p class="mt-1 text-2xl font-black text-white">
              {{ loading ? "—" : totalCount }}
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
         YOUR FOLLOW-UP

         Not a scoreboard: these are the people this member
         personally recorded and has not gone back to.
    ====================================================== -->

    <section class="mt-8">
      <p class="eyebrow">Your follow-up</p>

      <h3 class="section-title mt-2">Who still needs you</h3>

      <div class="mt-5 grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          @click="router.push('/contacts')"
          class="glass-card-interactive p-5 text-left"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold text-gray-300">To call</p>

            <span class="h-2 w-2 shrink-0 rounded-full bg-green-400"></span>
          </div>

          <p class="mt-4 text-3xl font-black text-green-400">
            {{ loading ? "—" : awaitingCall }}
          </p>

          <p class="mt-2 text-xs leading-5 text-gray-500">
            Open an outing to call them
          </p>
        </button>

        <button
          type="button"
          @click="router.push('/contacts')"
          class="glass-card-interactive p-5 text-left"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold text-gray-300">To text</p>

            <span class="h-2 w-2 shrink-0 rounded-full bg-blue-400"></span>
          </div>

          <p class="mt-4 text-3xl font-black text-blue-400">
            {{ loading ? "—" : awaitingText }}
          </p>

          <p class="mt-2 text-xs leading-5 text-gray-500">
            Send them the invitation
          </p>
        </button>

        <div class="glass-card p-5">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm font-semibold text-gray-300">Followed through</p>

            <span class="h-2 w-2 shrink-0 rounded-full bg-[#D4AF37]"></span>
          </div>

          <p class="gold-gradient-text mt-4 text-3xl font-black">
            {{ loading ? "—" : followUpRate + "%" }}
          </p>

          <div class="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              class="h-full rounded-full bg-gradient-to-r from-[#A8861F] to-[#E2C45A] transition-all duration-700"
              :style="{ width: followUpRate + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </section>

    <!-- =====================================================
         TEAM STANDING
    ====================================================== -->

    <section v-if="teamStanding" class="mt-8">
      <p class="eyebrow">Your team</p>

      <h3 class="section-title mt-2">{{ myTeam }}</h3>

      <div class="glass-card-gold mt-5 p-5 sm:p-6">
        <div class="flex items-center gap-5">
          <div class="relative shrink-0">
            <div
              :class="[
                'flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black',
                teamStanding.leading
                  ? 'bg-gradient-to-br from-[#E2C45A] to-[#A8861F] text-black shadow-[0_10px_30px_-10px_rgba(212,175,55,0.8)]'
                  : 'bg-[#D4AF37]/10 text-[#D4AF37]',
              ]"
            >
              {{ teamStanding.position }}
            </div>

            <span
              v-if="teamStanding.leading"
              class="absolute -top-2 left-1/2 -translate-x-1/2 text-lg leading-none"
            >
              ♛
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <p class="font-bold">
              {{
                teamStanding.leading
                  ? "Leading the church this week"
                  : `Placed ${teamStanding.position} of ${props.teamRankings.length} this week`
              }}
            </p>

            <p class="muted mt-1">
              {{ teamStanding.count }}
              {{ teamStanding.count === 1 ? "person" : "people" }} reached by
              your team
            </p>
          </div>
        </div>

        <!-- PERSONAL SHARE -->

        <div class="mt-5 border-t border-white/[0.08] pt-4">
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-gray-400">Your share of the team's week</p>

            <p class="shrink-0 text-sm font-black text-[#D4AF37]">
              {{ loading ? "—" : shareOfTeam + "%" }}
            </p>
          </div>

          <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              class="h-full rounded-full bg-gradient-to-r from-[#A8861F] to-[#E2C45A] transition-all duration-700"
              :style="{ width: shareOfTeam + '%' }"
            ></div>
          </div>
        </div>
      </div>
    </section>

    <!-- =====================================================
         QUICK ACTIONS
    ====================================================== -->

    <section class="mt-8">
      <p class="eyebrow">Get started</p>

      <h3 class="section-title mt-2">Quick actions</h3>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          type="button"
          @click="router.push('/record-person')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-11 w-11 text-xl font-bold">+</div>

          <h4 class="mt-4 flex items-center gap-2 font-bold">
            Add Outing

            <span
              class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
            >
              →
            </span>
          </h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Record the people you spoke to during an evangelism outing.
          </p>
        </button>

        <button
          type="button"
          @click="router.push('/contacts')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-11 w-11 text-lg">▣</div>

          <h4 class="mt-4 flex items-center gap-2 font-bold">
            Contacts

            <span
              class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
            >
              →
            </span>
          </h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Your outings, and everyone the church has reached.
          </p>
        </button>

        <button
          v-if="authStore.profile?.is_first_timer_coordinator"
          type="button"
          @click="router.push('/first-timers')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-11 w-11 text-lg">✦</div>

          <h4 class="mt-4 flex items-center gap-2 font-bold">
            First Timers

            <span
              class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
            >
              →
            </span>
          </h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Record and manage people who are new to the church.
          </p>
        </button>

        <button
          v-else
          type="button"
          @click="router.push('/profile')"
          class="glass-card-interactive group p-5 text-left"
        >
          <div class="icon-tile h-11 w-11 text-lg">◉</div>

          <h4 class="mt-4 flex items-center gap-2 font-bold">
            Your Profile

            <span
              class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
            >
              →
            </span>
          </h4>

          <p class="mt-1 text-sm leading-5 text-gray-500">
            Your details, and the full record of your impact.
          </p>
        </button>
      </div>
    </section>

    <!-- =====================================================
         TEAM RANKINGS
    ====================================================== -->

    <section v-if="props.teamRankings.some((t) => t.count > 0)" class="mt-8">
      <p class="eyebrow">Team performance</p>

      <h3 class="section-title mt-2">Team rankings</h3>

      <p class="muted mt-1">People reached this week, by team.</p>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <div
          v-for="(team, index) in props.teamRankings"
          :key="team.team"
          :class="[
            'flex items-center gap-4 p-4 transition',
            index === 0 ? 'glass-card-gold' : 'glass-card',
            team.team === myTeam ? 'ring-1 ring-[#D4AF37]/40' : '',
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

              <span
                v-if="team.team === myTeam"
                class="ml-1 text-[11px] font-bold uppercase tracking-wide text-[#D4AF37]/70"
              >
                You
              </span>
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
         RECENT OUTINGS
    ====================================================== -->

    <section class="mt-8">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="eyebrow">Outreach history</p>

          <h3 class="section-title mt-2">Recent outings</h3>
        </div>

        <button
          v-if="outings.length"
          type="button"
          @click="router.push('/contacts')"
          class="btn-outline-gold btn-sm shrink-0"
        >
          See all
        </button>
      </div>

      <div v-if="loading" class="mt-5 space-y-3">
        <div
          v-for="i in 3"
          :key="`outing-skeleton-${i}`"
          class="glass-card flex items-center gap-4 p-4"
        >
          <div class="skeleton h-11 w-11 shrink-0 rounded-xl"></div>

          <div class="flex-1 space-y-2">
            <div class="skeleton h-4 w-40 rounded"></div>
            <div class="skeleton h-3 w-24 rounded"></div>
          </div>
        </div>
      </div>

      <div v-else-if="outings.length === 0" class="glass-dashed mt-5 p-10 text-center">
        <div class="icon-tile mx-auto h-14 w-14 text-2xl">▣</div>

        <p class="mt-4 font-semibold text-gray-300">No outings yet</p>

        <p class="muted mx-auto mt-1 max-w-sm">
          Record your first outing and the people you meet will show up here,
          ready to follow up.
        </p>

        <button
          type="button"
          @click="router.push('/record-person')"
          class="btn-gold mt-6"
        >
          + Add your first outing
        </button>
      </div>

      <div v-else class="mt-5 space-y-3">
        <button
          v-for="outing in recentOutings"
          :key="outing.id"
          type="button"
          @click="router.push(`/outing/${outing.id}`)"
          class="glass-card-interactive group flex w-full items-center gap-4 p-4 text-left"
        >
          <div
            class="icon-tile h-11 w-11 shrink-0 text-lg transition group-hover:bg-[#D4AF37]/20"
          >
            ▣
          </div>

          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold">
              {{ outing.location }} Centre
            </p>

            <p class="mt-0.5 text-xs text-gray-500">
              {{ formatDate(outing.outing_date) }}
            </p>
          </div>

          <span
            class="shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
          >
            →
          </span>
        </button>
      </div>
    </section>

  </div>
</template>
