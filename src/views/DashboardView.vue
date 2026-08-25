<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { supabase } from "../lib/supabase";

const router = useRouter();
const authStore = useAuthStore();

const userName = computed(() => {
  return authStore.profile?.full_name || "Member";
});

const outings = ref([]);
const loadingOutings = ref(true);

const totalPeople = ref(0);
const totalOutings = ref(0);
const peopleThisWeek = ref(0);
const teamRankings = ref([]);
const menuOpen = ref(false);
const topTeam = ref(null);
const closeMenu = () => {
  menuOpen.value = false;
};
const handleLogout = async () => {
  await authStore.signOut();
  router.push("/login");
};

const loadOutings = async () => {
  loadingOutings.value = true;

  try {
    const { data, error } = await supabase
      .from("evangelism_outings")
      .select("*")
      .order("outing_date", { ascending: false });

    if (error) throw error;

    outings.value = data || [];
  } catch (error) {
    console.error("Error loading outings:", error);
  } finally {
    loadingOutings.value = false;
  }
};

const loadStats = async () => {
  try {
    const { count: peopleCount, error: peopleError } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true });

    if (peopleError) throw peopleError;

    totalPeople.value = peopleCount || 0;

    const { count: outingCount, error: outingError } = await supabase
      .from("evangelism_outings")
      .select("*", { count: "exact", head: true });

    if (outingError) throw outingError;

    totalOutings.value = outingCount || 0;

    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1;

    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    monday.setHours(0, 0, 0, 0);

    const mondayDate = monday.toISOString().split("T")[0];

    const { count: weeklyCount, error: weeklyError } = await supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${mondayDate}T00:00:00`);

    if (weeklyError) throw weeklyError;

    peopleThisWeek.value = weeklyCount || 0;
  } catch (error) {
    console.error("Error loading stats:", error);
  }
};
const loadTeamRankings = async () => {
  try {
    const teams = [
      "Sent Ones",
      "Pacesetters",
      "Soul Harvesters",
      "Kingdom Harvesters",
    ];

    const rankings = [];

    for (const team of teams) {
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .eq("team", team);

      if (membersError) throw membersError;

      const memberIds = (members || []).map((member) => member.id);

      let count = 0;

      if (memberIds.length) {
        const { count: contactCount, error: contactsError } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .in("added_by", memberIds);

        if (contactsError) throw contactsError;

        count = contactCount || 0;
      }

      rankings.push({
        team,
        count,
      });
    }

    teamRankings.value = rankings.sort((a, b) => b.count - a.count);

    const teamsWithContacts = teamRankings.value.filter(
      (team) => team.count > 0,
    );

    topTeam.value = teamsWithContacts[0] || null;
  } catch (error) {
    console.error("Error loading team rankings:", error);
  }
};
const formatDate = (date) => {
  if (!date) return "";

  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

onMounted(() => {
  loadOutings();
  loadStats();
  loadTeamRankings();
});
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- Menu Overlay -->
    <div
      v-if="menuOpen"
      class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
      @click="closeMenu"
    ></div>

    <!-- Sidebar -->
    <aside
      class="fixed left-0 top-0 z-[70] h-full w-72 border-r border-white/10 bg-[#0D0D0D] shadow-2xl transition-transform duration-300"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-white/10 p-5"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37] font-black text-black"
            >
              PS
            </div>

            <div>
              <p class="font-bold">Project Souls</p>
              <p class="text-xs text-gray-500">Navigation</p>
            </div>
          </div>

          <button
            @click="closeMenu"
            class="text-xl text-gray-500 hover:text-[#D4AF37]"
          >
            ×
          </button>
        </div>

        <nav class="flex-1 space-y-1 p-4">
          <button
            @click="
              router.push('/dashboard');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            ⌂ Dashboard
          </button>

          <button
            @click="
              router.push('/record-person');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            + Add Outing
          </button>

          <button
            @click="
              router.push('/contacts');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            ▣ Contacts
          </button>

          <button
            @click="
              router.push('/profile');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            ◉ Profile
          </button>

          <button
            v-if="
              authStore.profile?.is_pastor ||
              authStore.profile?.is_first_timer_coordinator
            "
            @click="
              router.push('/first-timers');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            🔒 First Timers
          </button>

          <button
            v-if="authStore.profile?.is_pastor"
            @click="
              router.push('/pastor');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            ▦ Pastor Summary
          </button>
        </nav>

        <div class="border-t border-white/10 p-4">
          <div class="mb-3 rounded-xl bg-[#101010] p-3">
            <p class="font-semibold">
              {{ userName }}
            </p>

            <p
              v-if="authStore.profile?.team"
              class="mt-1 text-xs text-[#D4AF37]"
            >
              {{ authStore.profile.team }}
            </p>
          </div>

          <button
            @click="handleLogout"
            class="w-full rounded-xl border border-white/10 px-4 py-3 text-left text-gray-400 hover:border-red-500 hover:text-red-400"
          >
            Logout
          </button>
        </div>
      </div>
    </aside>
    <!-- Header -->
    <header
      class="sticky top-0 z-40 border-b border-white/10 bg-[#0D0D0D]/90 backdrop-blur"
    >
      <div
        class="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"
      >
        <!-- Left Side -->
        <div class="flex items-center gap-3">
          <button
            type="button"
            @click="menuOpen = true"
            class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-xl text-gray-400 transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
          >
            ☰
          </button>

          <div
            class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/10"
          >
            <img
              src="/TCC.jpeg"
              alt="Church logo"
              class="h-10 w-10 object-contain"
            />
          </div>

          <div>
            <h1 class="font-bold">Transfiguration Church</h1>
            <p class="text-xs text-gray-500">Project Souls</p>
          </div>
        </div>

        <!-- Right Side -->
        <button
          @click="handleLogout"
          class="hidden rounded-lg border border-white/10 px-3 py-2 text-sm text-gray-400 transition hover:border-[#D4AF37] hover:text-[#D4AF37] lg:block"
        >
          Logout
        </button>
      </div>
    </header>

    <!-- Main -->
    <main
      class="mx-auto max-w-7xl px-4 py-6 pb-36 sm:px-6 sm:py-8 lg:px-8 lg:pb-8"
    >
      <!-- Welcome -->
      <section class="mb-8">
        <p class="text-sm font-semibold tracking-wide text-[#D4AF37]">
          Welcome back
        </p>

        <h2 class="mt-1 text-2xl font-black sm:text-3xl">
          {{ userName }}
        </h2>

        <!-- Team Badge -->
        <div
          v-if="authStore.profile?.team"
          class="mt-3 inline-flex items-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]"
        >
          {{ authStore.profile.team }}
        </div>

        <p class="mt-2 text-sm text-gray-500">
          Here's what's happening with your evangelism outreach.
        </p>
      </section>

      <!-- Stats -->
      <section class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div
          class="group rounded-2xl border border-white/10 bg-[#101010] p-4 transition hover:border-[#D4AF37]/30 sm:p-5"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500 sm:text-sm">People Reached</p>

            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-xs text-[#D4AF37]"
            >
              ◆
            </span>
          </div>

          <p
            class="mt-3 text-2xl font-black text-[#D4AF37] sm:mt-4 sm:text-3xl"
          >
            {{ totalPeople }}
          </p>
        </div>

        <div
          class="group rounded-2xl border border-white/10 bg-[#101010] p-4 transition hover:border-[#D4AF37]/30 sm:p-5"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500 sm:text-sm">Evangelism Outings</p>

            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-xs text-[#D4AF37]"
            >
              ▣
            </span>
          </div>

          <p
            class="mt-3 text-2xl font-black text-[#D4AF37] sm:mt-4 sm:text-3xl"
          >
            {{ totalOutings }}
          </p>
        </div>

        <div
          class="group rounded-2xl border border-white/10 bg-[#101010] p-4 transition hover:border-[#D4AF37]/30 sm:p-5"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500 sm:text-sm">This Week</p>

            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-xs text-[#D4AF37]"
            >
              ↑
            </span>
          </div>

          <p
            class="mt-3 text-2xl font-black text-[#D4AF37] sm:mt-4 sm:text-3xl"
          >
            {{ peopleThisWeek }}
          </p>
        </div>
        <div
          class="group relative overflow-hidden rounded-2xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#151004] to-[#101010] p-4 transition hover:border-[#D4AF37]/50 sm:p-5"
        >
          <div class="flex items-center justify-between">
            <p class="text-xs text-gray-500 sm:text-sm">Top Team</p>

            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#D4AF37]/10 text-xs text-[#D4AF37]"
            >
              ♛
            </span>
          </div>

          <p
            v-if="topTeam"
            class="mt-3 truncate text-lg font-black text-[#D4AF37] sm:mt-4 sm:text-xl"
          >
            {{ topTeam.team }}
          </p>

          <p v-if="topTeam" class="mt-1 text-xs text-gray-500">
            {{ topTeam.count }}
            {{ topTeam.count === 1 ? "person" : "people" }} reached
          </p>

          <p v-else class="mt-3 text-sm text-gray-600">No data yet</p>
        </div>
      </section>

      <!-- Quick Actions -->
      <section class="mt-10">
        <p class="text-sm font-semibold tracking-wide text-[#D4AF37]">
          Get started
        </p>

        <h3 class="mt-1 text-xl font-bold">Quick Actions</h3>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <!-- Add Outing -->
          <button
            type="button"
            @click="router.push('/record-person')"
            class="group rounded-2xl border border-white/10 bg-[#101010] p-5 text-left transition hover:border-[#D4AF37]/50 hover:bg-[#141414]"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-xl font-bold text-[#D4AF37] transition group-hover:bg-[#D4AF37]/20"
            >
              +
            </div>

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

          <!-- Contacts -->
          <button
            type="button"
            @click="router.push('/contacts')"
            class="group rounded-2xl border border-white/10 bg-[#101010] p-5 text-left transition hover:border-[#D4AF37]/50 hover:bg-[#141414]"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-lg text-[#D4AF37] transition group-hover:bg-[#D4AF37]/20"
            >
              ▣
            </div>

            <h4 class="mt-4 flex items-center gap-2 font-bold">
              Contacts
              <span
                class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
              >
                →
              </span>
            </h4>

            <p class="mt-1 text-sm leading-5 text-gray-500">
              View your outings and church-wide outreach activity.
            </p>
          </button>
          <!-- Pastor Summary -->
          <button
            v-if="authStore.profile?.is_pastor"
            type="button"
            @click="router.push('/pastor')"
            class="group rounded-2xl border border-[#D4AF37]/30 bg-[#101010] p-5 text-left transition hover:border-[#D4AF37] hover:bg-[#141414]"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-lg text-[#D4AF37] transition group-hover:bg-[#D4AF37]/20"
            >
              ▦
            </div>

            <h4 class="mt-4 flex items-center gap-2 font-bold">
              Pastor Summary
              <span
                class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
              >
                →
              </span>
            </h4>

            <p class="mt-1 text-sm leading-5 text-gray-500">
              View church-wide evangelism performance and accountability.
            </p>
          </button>
          <!-- First Timers -->
          <button
            v-if="
              authStore.profile?.is_pastor ||
              authStore.profile?.is_first_timer_coordinator
            "
            type="button"
            @click="router.push('/first-timers')"
            class="group rounded-2xl border border-[#D4AF37]/30 bg-[#101010] p-5 text-left transition hover:border-[#D4AF37] hover:bg-[#141414]"
          >
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-lg text-[#D4AF37] transition group-hover:bg-[#D4AF37]/20"
            >
              🔒
            </div>

            <h4 class="mt-4 flex items-center gap-2 font-bold">
              First Timers
              <span
                class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
              >
                →
              </span>
            </h4>

            <p class="mt-1 text-sm leading-5 text-gray-500">
              View and manage people who are new to the church.
            </p>
          </button>
        </div>
      </section>
      <!-- Team Rankings -->
      <section class="mt-10">
        <div class="mb-5">
          <p class="text-sm font-semibold tracking-wide text-[#D4AF37]">
            Team performance
          </p>

          <h3 class="mt-1 text-xl font-bold">Team Rankings</h3>

          <p class="mt-1 text-sm text-gray-500">
            Ranked by the number of people reached.
          </p>
        </div>

        <div class="space-y-3">
          <div
            v-for="(team, index) in teamRankings"
            :key="team.team"
            class="flex items-center gap-4 rounded-2xl border p-4 transition"
            :class="
              index === 0
                ? 'border-[#D4AF37]/40 bg-gradient-to-r from-[#181206] to-[#101010]'
                : 'border-white/10 bg-[#101010]'
            "
          >
            <!-- Rank -->
            <div
              class="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black"
              :class="
                index === 0
                  ? 'bg-[#D4AF37] text-black'
                  : index === 1
                    ? 'bg-gray-300/15 text-gray-300'
                    : index === 2
                      ? 'bg-[#B87333]/15 text-[#CD8C52]'
                      : 'bg-[#D4AF37]/10 text-[#D4AF37]'
              "
            >
              <span
                v-if="index === 0"
                class="absolute -top-3 text-sm leading-none"
              >
                ♛
              </span>
              {{ index + 1 }}
            </div>

            <!-- Team -->
            <div class="min-w-0 flex-1">
              <p
                class="flex items-center gap-2 font-semibold"
                :class="index === 0 ? 'text-[#D4AF37]' : ''"
              >
                {{ team.team }}
              </p>

              <p class="mt-1 text-xs text-gray-500">
                {{ index === 0 ? "Leading this week" : "People reached" }}
              </p>
            </div>

            <!-- Count -->
            <div class="text-right">
              <p
                class="text-xl font-black"
                :class="index === 0 ? 'text-[#D4AF37]' : 'text-white'"
              >
                {{ team.count }}
              </p>

              <p class="text-xs text-gray-600">
                {{ team.count === 1 ? "person" : "people" }}
              </p>
            </div>
          </div>
        </div>
      </section>
      <!-- Outings Feed -->
      <section class="mt-10">
        <div class="mb-5">
          <p class="text-sm font-semibold tracking-wide text-[#D4AF37]">
            Outreach history
          </p>

          <h3 class="mt-1 text-xl font-bold">Recent outings</h3>
        </div>

        <!-- Loading -->
        <div
          v-if="loadingOutings"
          class="rounded-2xl border border-white/10 bg-[#101010] p-6 text-center text-sm text-gray-500"
        >
          Loading outings...
        </div>

        <!-- Empty -->
        <div
          v-else-if="outings.length === 0"
          class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-8 text-center"
        >
          <p class="text-gray-400">No outings recorded yet.</p>

          <p class="mt-2 text-sm text-gray-600">
            Your saved evangelism outings will appear here.
          </p>
        </div>

        <!-- Outings -->
        <div v-else class="space-y-3">
          <button
            v-for="outing in outings"
            :key="outing.id"
            type="button"
            @click="router.push(`/outing/${outing.id}`)"
            class="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#101010] p-4 text-left transition hover:border-[#D4AF37]/40 hover:bg-[#141414] sm:gap-4"
          >
            <!-- Folder -->
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-[#D4AF37] transition group-hover:bg-[#D4AF37]/20 sm:h-12 sm:w-12"
            >
              <span class="text-lg"> ▣ </span>
            </div>

            <!-- Details -->
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold">
                {{ outing.title }}
              </p>

              <p class="mt-1 text-sm text-gray-500">
                {{ formatDate(outing.outing_date) }}
              </p>
            </div>

            <!-- Branch -->
            <div class="hidden text-right sm:block">
              <p class="text-sm font-semibold text-[#D4AF37]">
                {{ outing.location }}
              </p>

              <p class="mt-1 text-xs text-gray-600">Branch</p>
            </div>

            <!-- Arrow -->
            <div
              class="text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
            >
              →
            </div>
          </button>
        </div>
      </section>
    </main>

    <!-- Mobile Navigation -->
    <nav
      class="fixed bottom-4 left-4 right-4 z-50 rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-2xl"
    >
      <div class="grid grid-cols-4 px-2 py-2">
        <!-- Home -->
        <button
          type="button"
          class="flex flex-col items-center gap-1 py-3 text-[#D4AF37]"
        >
          <span class="text-lg">⌂</span>
          <span class="text-[11px] font-medium">Home</span>
        </button>

        <!-- Add Outing -->
        <button
          type="button"
          @click="router.push('/record-person')"
          class="flex flex-col items-center gap-1 py-3 text-gray-400 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">+</span>
          <span class="text-[11px] font-medium">Add Outing</span>
        </button>

        <!-- Contacts -->
        <button
          type="button"
          @click="router.push('/contacts')"
          class="flex flex-col items-center gap-1 py-3 text-gray-400 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">▣</span>
          <span class="text-[11px] font-medium">Contacts</span>
        </button>

        <!-- Profile -->
        <button
          type="button"
          @click="router.push('/profile')"
          class="flex flex-col items-center gap-1 py-3 text-gray-400 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">◉</span>
          <span class="text-[11px] font-medium">Profile</span>
        </button>
      </div>
    </nav>
  </div>
</template>
