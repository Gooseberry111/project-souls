<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref("");

const totalContacts = ref(0);
const totalOutings = ref(0);
const calledContacts = ref(0);
const firstTimers = ref(0);

const teamStats = ref([]);
const branchStats = ref([]);
const recentFirstTimers = ref([]);

// --- New: additional detail ---
const statusBreakdown = ref([]);
const staleNewCount = ref(0);
const weeklyContacts = ref(0);
const weeklyOutings = ref(0);
const topContributors = ref([]);

const responseRate = computed(() => {
  if (!totalContacts.value) return 0;

  const called =
    statusBreakdown.value.find((item) => item.status === "Called")?.count || 0;

  const followingUp =
    statusBreakdown.value.find((item) => item.status === "Following Up")
      ?.count || 0;

  return Math.round(((called + followingUp) / totalContacts.value) * 100);
});

const loadSummary = async () => {
  loading.value = true;
  error.value = "";

  try {
    // Total contacts
    const { count: contactsCount, error: contactsError } = await supabase
      .from("contacts")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (contactsError) throw contactsError;

    totalContacts.value = contactsCount || 0;

    // Total outings
    const { count: outingsCount, error: outingsError } = await supabase
      .from("evangelism_outings")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (outingsError) throw outingsError;

    totalOutings.value = outingsCount || 0;

    // Called contacts
    const { count: calledCount, error: calledError } = await supabase
      .from("contacts")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("status", "Called");

    if (calledError) throw calledError;

    calledContacts.value = calledCount || 0;

    // First timers
    const { count: firstTimerCount, error: firstTimerError } = await supabase
      .from("first_timers")
      .select("*", {
        count: "exact",
        head: true,
      });

    if (firstTimerError) throw firstTimerError;

    firstTimers.value = firstTimerCount || 0;

    // Recent first timers
    const { data: recentData, error: recentError } = await supabase
      .from("first_timers")
      .select("*")
      .order("created_at", {
        ascending: false,
      })
      .limit(5);

    if (recentError) throw recentError;

    recentFirstTimers.value = recentData || [];

    // Teams
    const teams = [
      "Sent Ones",
      "Pacesetters",
      "Soul Harvesters",
      "Kingdom Harvesters",
    ];

    const stats = [];

    for (const team of teams) {
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .eq("team", team);

      if (membersError) throw membersError;

      const memberIds = (members || []).map((member) => member.id);

      let count = 0;
      let called = 0;

      if (memberIds.length) {
        const { data: teamContacts, error: teamContactsError } = await supabase
          .from("contacts")
          .select("added_by, status")
          .in("added_by", memberIds);

        if (teamContactsError) throw teamContactsError;

        count = teamContacts?.length || 0;

        called =
          teamContacts?.filter((contact) => contact.status === "Called")
            .length || 0;
      }

      stats.push({
        team,
        contacts: count,
        called,
        responseRate: count ? Math.round((called / count) * 100) : 0,
      });
    }

    teamStats.value = stats;

    // Branch statistics
    const branches = ["Barnawa", "Gbaggivilla"];

    const branchResults = [];

    for (const branch of branches) {
      const { data: outings, error: branchError } = await supabase
        .from("evangelism_outings")
        .select("id")
        .eq("location", branch);

      if (branchError) throw branchError;

      const outingIds = (outings || []).map((outing) => outing.id);

      let count = 0;

      if (outingIds.length) {
        const { data: relationships, error: relationError } = await supabase
          .from("outing_contacts")
          .select("contact_id")
          .in("outing_id", outingIds);

        if (relationError) throw relationError;

        const uniqueContactIds = new Set(
          (relationships || []).map((item) => item.contact_id),
        );

        count = uniqueContactIds.size;
      }

      branchResults.push({
        branch,
        contacts: count,
      });
    }

    branchStats.value = branchResults;

    // --- New: status breakdown ---
    const statuses = ["New", "Called", "Following Up", "Not Reachable"];
    const breakdown = [];

    for (const status of statuses) {
      const { count: statusCount, error: statusError } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      if (statusError) throw statusError;

      breakdown.push({ status, count: statusCount || 0 });
    }

    statusBreakdown.value = breakdown;

    // --- New: stale "New" contacts (added 3+ days ago, never called) ---
    const staleCutoff = new Date();
    staleCutoff.setDate(staleCutoff.getDate() - 3);

    const { count: staleCount, error: staleError } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "New")
      .lt("created_at", staleCutoff.toISOString());

    if (staleError) throw staleError;

    staleNewCount.value = staleCount || 0;

    // --- New: this week's activity ---
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1;

    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const mondayDate =
      `${monday.getFullYear()}-` +
      `${String(monday.getMonth() + 1).padStart(2, "0")}-` +
      `${String(monday.getDate()).padStart(2, "0")}`;

    const { count: weeklyContactsCount, error: weeklyContactsError } =
      await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .gte("created_at", `${mondayDate}T00:00:00`);

    if (weeklyContactsError) throw weeklyContactsError;

    weeklyContacts.value = weeklyContactsCount || 0;

    const { count: weeklyOutingsCount, error: weeklyOutingsError } =
      await supabase
        .from("evangelism_outings")
        .select("*", { count: "exact", head: true })
        .gte("outing_date", mondayDate);

    if (weeklyOutingsError) throw weeklyOutingsError;

    weeklyOutings.value = weeklyOutingsCount || 0;

    // --- New: top individual contributors ---
    const { data: allContacts, error: allContactsError } = await supabase
      .from("contacts")
      .select("added_by");

    if (allContactsError) throw allContactsError;

    const countsByUser = {};

    for (const contact of allContacts || []) {
      if (!contact.added_by) continue;

      countsByUser[contact.added_by] =
        (countsByUser[contact.added_by] || 0) + 1;
    }

    const topIds = Object.entries(countsByUser)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    if (topIds.length) {
      const { data: topProfiles, error: topProfilesError } = await supabase
        .from("profiles")
        .select("id, full_name, team")
        .in("id", topIds);

      if (topProfilesError) throw topProfilesError;

      const profileMap = {};
      for (const profile of topProfiles || []) {
        profileMap[profile.id] = profile;
      }

      topContributors.value = topIds.map((id) => ({
        id,
        name: profileMap[id]?.full_name || "Unknown",
        team: profileMap[id]?.team || "",
        count: countsByUser[id],
      }));
    } else {
      topContributors.value = [];
    }
  } catch (err) {
    console.error("Pastor summary error:", err);
    error.value = err.message || "Unable to load pastor summary.";
  } finally {
    loading.value = false;
  }
};

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

onMounted(() => {
  loadSummary();
});
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- Header -->
    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          @click="router.push('/dashboard')"
          class="mb-5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back to dashboard
        </button>

        <p class="text-sm font-semibold text-[#D4AF37]">Church oversight</p>

        <h1 class="mt-1 text-2xl font-black sm:text-3xl">Pastor Summary</h1>

        <p class="mt-2 text-sm text-gray-500">
          Church-wide evangelism and follow-up overview.
        </p>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:px-8">
      <!-- Loading -->
      <div
        v-if="loading"
        class="rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-sm text-gray-500"
      >
        Loading summary...
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <template v-else>
        <!-- Main Stats -->
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Total Contacts</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totalContacts }}
            </p>
          </div>

          <div
            class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Total Outings</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totalOutings }}
            </p>
          </div>

          <div
            class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">First Timers</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ firstTimers }}
            </p>
          </div>

          <div
            class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Follow-up Rate</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ responseRate }}%
            </p>
          </div>
        </section>

        <!-- Teams -->
        <section class="mt-8">
          <div class="mb-4">
            <p class="text-sm font-semibold text-[#D4AF37]">Team performance</p>

            <h2 class="mt-1 text-xl font-bold">Evangelism Teams</h2>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="team in teamStats"
              :key="team.team"
              class="rounded-2xl border border-white/10 bg-[#101010] p-5"
            >
              <h3 class="font-bold">
                {{ team.team }}
              </h3>

              <p class="mt-4 text-2xl font-black text-[#D4AF37]">
                {{ team.contacts }}
              </p>

              <p class="text-xs text-gray-600">contacts</p>

              <div class="mt-4 flex items-center justify-between text-xs">
                <span class="text-gray-500"> Called </span>

                <span class="text-gray-300">
                  {{ team.called }}
                </span>
              </div>

              <div class="mt-2 flex items-center justify-between text-xs">
                <span class="text-gray-500"> Response rate </span>

                <span class="font-semibold text-[#D4AF37]">
                  {{ team.responseRate }}%
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Branches -->
        <section class="mt-8">
          <div class="mb-4">
            <p class="text-sm font-semibold text-[#D4AF37]">
              Branch performance
            </p>

            <h2 class="mt-1 text-xl font-bold">Outreach by Branch</h2>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="branch in branchStats"
              :key="branch.branch"
              class="rounded-2xl border border-white/10 bg-[#101010] p-5"
            >
              <p class="text-sm text-gray-500">
                {{ branch.branch }}
              </p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ branch.contacts }}
              </p>

              <p class="text-xs text-gray-600">contacts</p>
            </div>
          </div>
        </section>

        <!-- First Timers -->
        <section class="mt-8">
          <div class="mb-4 flex items-end justify-between">
            <div>
              <p class="text-sm font-semibold text-[#D4AF37]">First Timers</p>

              <h2 class="mt-1 text-xl font-bold">Recent Entries</h2>
            </div>

            <button
              type="button"
              @click="router.push('/first-timers')"
              class="text-xs font-semibold text-[#D4AF37]"
            >
              View all →
            </button>
          </div>

          <div
            v-if="recentFirstTimers.length === 0"
            class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-6 text-center text-sm text-gray-500"
          >
            No first timers recorded yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="person in recentFirstTimers"
              :key="person.id"
              class="rounded-2xl border border-white/10 bg-[#101010] p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-semibold">
                    {{ person.full_name }}
                  </p>

                  <p class="mt-1 text-sm text-gray-500">
                    {{ person.phone }}
                  </p>
                </div>

                <p class="shrink-0 text-xs text-gray-600">
                  {{ formatDate(person.created_at) }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- New: This Week -->
        <section class="mt-8">
          <div class="mb-4">
            <p class="text-sm font-semibold text-[#D4AF37]">Current week</p>

            <h2 class="mt-1 text-xl font-bold">This Week's Activity</h2>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">Contacts Added</p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ weeklyContacts }}
              </p>
            </div>

            <div
              class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">Outings</p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ weeklyOutings }}
              </p>
            </div>
          </div>
        </section>

        <!-- New: Status Breakdown -->
        <section class="mt-8">
          <div class="mb-4 flex items-end justify-between">
            <div>
              <p class="text-sm font-semibold text-[#D4AF37]">
                Follow-up health
              </p>

              <h2 class="mt-1 text-xl font-bold">Contact Status Breakdown</h2>
            </div>

            <div
              v-if="staleNewCount > 0"
              class="rounded-full border border-red-900/50 bg-red-950/30 px-3 py-1 text-xs font-semibold text-red-400"
            >
              {{ staleNewCount }} uncalled 3+ days
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="item in statusBreakdown"
              :key="item.status"
              class="rounded-2xl border border-white/10 bg-[#101010] p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">
                {{ item.status }}
              </p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ item.count }}
              </p>
            </div>
          </div>
        </section>

        <!-- New: Top Contributors -->
        <section class="mt-8">
          <div class="mb-4">
            <p class="text-sm font-semibold text-[#D4AF37]">
              Individual impact
            </p>

            <h2 class="mt-1 text-xl font-bold">Top Contributors</h2>
          </div>

          <div
            v-if="topContributors.length === 0"
            class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-6 text-center text-sm text-gray-500"
          >
            No contacts recorded yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="(person, index) in topContributors"
              :key="person.id"
              class="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#101010] p-4"
            >
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 font-black text-[#D4AF37]"
              >
                {{ index + 1 }}
              </div>

              <div class="min-w-0 flex-1">
                <p class="truncate font-semibold">
                  {{ person.name }}
                </p>

                <p class="mt-1 text-xs text-gray-500">
                  {{ person.team }}
                </p>
              </div>

              <p class="shrink-0 text-lg font-black text-[#D4AF37]">
                {{ person.count }}
              </p>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
