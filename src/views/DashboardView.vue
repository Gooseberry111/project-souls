<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { supabase } from "../lib/supabase";
import { getWeekRange } from "../lib/week";
import BottomNav from "../components/BottomNav.vue";
import PastorHome from "../components/PastorHome.vue";
import MemberHome from "../components/MemberHome.vue";

/* =========================================================
   DASHBOARD SHELL

   Header, sidebar and bottom bar live here; the body itself
   is PastorHome or MemberHome. Each of those loads its own
   figures, so the only thing this file still fetches is the
   team rankings, which both of them display.
========================================================= */

const router = useRouter();
const authStore = useAuthStore();

const teamRankings = ref([]);
const menuOpen = ref(false);

const userName = computed(() => authStore.profile?.full_name || "Member");

const firstName = computed(() => userName.value.split(" ")[0]);

/* The pastor does not go out on evangelism, so his own contact
   and outing counts would read as zeroes forever. He gets the
   church-wide view instead of the personal one. */
const isPastor = computed(() => authStore.profile?.is_pastor === true);

const closeMenu = () => {
  menuOpen.value = false;
};

const handleLogout = async () => {
  await authStore.signOut();
  router.push("/login");
};

const TEAMS = [
  "Sent Ones",
  "Pacesetters",
  "Soul Harvesters",
  "Kingdom Harvesters",
];

const loadTeamRankings = async () => {
  try {
    const { start, end } = getWeekRange();

    const rankings = await Promise.all(
      TEAMS.map(async (team) => {
        // Pastors are excluded: they do not go on outings, so
        // counting them would only dilute the team's numbers.
        // "not is true" rather than "= false" so rows where the
        // flag was never set are still counted as members.
        const { data: members, error: membersError } = await supabase
          .from("profiles")
          .select("id")
          .eq("team", team)
          .not("is_pastor", "is", true);

        if (membersError) throw membersError;

        const memberIds = (members || []).map((member) => member.id);

        if (!memberIds.length) return { team, count: 0 };

        const { count, error: contactsError } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .in("added_by", memberIds)
          .gte("created_at", start.toISOString())
          .lt("created_at", end.toISOString());

        if (contactsError) throw contactsError;

        return { team, count: count || 0 };
      }),
    );

    teamRankings.value = rankings.sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error loading team rankings:", error);
  }
};

onMounted(() => {
  loadTeamRankings();
});
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- Menu Overlay -->
    <div
      v-if="menuOpen"
      class="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
      @click="closeMenu"
    ></div>

    <!-- Sidebar -->
    <aside
      class="fixed left-0 top-0 z-[70] h-full w-72 glass-bar border-r shadow-2xl transition-transform duration-300"
      :class="menuOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-full flex-col">
        <div
          class="flex items-center justify-between border-b border-white/10 p-5"
        >
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl ring-1 ring-[#D4AF37]/30"
            >
              <img
                src="/TCC.jpeg"
                alt="Church logo"
                class="h-10 w-10 object-cover"
              />
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

        <nav class="flex-1 space-y-1 overflow-y-auto p-4">
          <button
            @click="
              router.push('/dashboard');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">⌂</span> Dashboard
          </button>

          <button
            v-if="!isPastor"
            @click="
              router.push('/record-person');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">+</span> Add Outing
          </button>

          <button
            @click="
              router.push('/contacts');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">▣</span> Contacts
          </button>

          <button
            @click="
              router.push('/profile');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">◉</span> Profile
          </button>

          <div
            v-if="isPastor || authStore.profile?.is_first_timer_coordinator"
            class="divider my-3"
          ></div>

          <button
            v-if="isPastor || authStore.profile?.is_first_timer_coordinator"
            @click="
              router.push('/first-timers');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">✦</span> First Timers
          </button>

          <button
            v-if="isPastor"
            @click="
              router.push('/pastor');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">▦</span> Pastor Summary
          </button>

          <button
            v-if="isPastor"
            @click="
              router.push('/pastor/contributors');
              closeMenu();
            "
            class="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
          >
            <span class="w-5 text-center text-lg">◎</span> All Contributors
          </button>
        </nav>

        <div class="border-t border-white/10 p-4">
          <div class="mb-3 rounded-xl bg-white/[0.035] backdrop-blur-xl p-3">
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
      class="sticky top-0 z-40 glass-bar border-b"
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
      class="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-8"
    >
      <!-- Welcome -->
      <section class="rise mb-8">
        <p class="eyebrow">
          {{ isPastor ? "Church oversight" : "Welcome back" }}
        </p>

        <h2 class="page-title mt-2">
          {{ isPastor ? `Good to see you, ${firstName}` : userName }}
        </h2>

        <!-- Team Badge -->
        <div
          v-if="authStore.profile?.team && !isPastor"
          class="badge-gold mt-3 px-3 py-1 text-xs"
        >
          {{ authStore.profile.team }}
        </div>

        <div v-if="isPastor" class="badge-gold mt-3 px-3 py-1 text-xs">
          ♛ Pastor
        </div>

        <p class="muted mt-2">
          {{
            isPastor
              ? "The whole church at a glance, and what still needs following up."
              : "Here's what's happening with your evangelism outreach."
          }}
        </p>
      </section>

      <!-- =================================================
           PASTOR DASHBOARD
      ================================================== -->

      <PastorHome v-if="isPastor" :team-rankings="teamRankings" />

      <!-- =================================================
           MEMBER DASHBOARD
      ================================================== -->

      <MemberHome v-else :team-rankings="teamRankings" />
    </main>

    <BottomNav />
  </div>
</template>
