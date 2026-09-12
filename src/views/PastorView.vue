<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { goBack } from "../lib/navigation";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";
import { getWeekRange, toDateKey, formatWeekLabel } from "../lib/week";
import { loadContributorStats } from "../lib/contributors";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref("");

const totalContacts = ref(0);
const totalOutings = ref(0);
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
const allContributors = ref([]);
const textedContacts = ref(0);
const weekLabel = ref("");
const teamScope = ref("week");
const teamStatsLoading = ref(false);
const exporting = ref(false);

const responseRate = computed(() => {
  if (!totalContacts.value) return 0;

  const called =
    statusBreakdown.value.find((item) => item.status === "Called")?.count || 0;

  const followingUp =
    statusBreakdown.value.find((item) => item.status === "Following Up")
      ?.count || 0;

  return Math.round(((called + followingUp) / totalContacts.value) * 100);
});

/* =========================================================
   TEAM STATS

   Scope: "week" (Sat -> Fri, matching the dashboard rankings)
   or "all" (all time).
========================================================= */

const TEAMS = [
  "Sent Ones",
  "Pacesetters",
  "Soul Harvesters",
  "Kingdom Harvesters",
];

const BRANCHES = ["Barnawa", "Gbaggivilla"];

const STATUSES = ["New", "Called", "Following Up", "Not Reachable"];

const scopedToWeek = (query) => {
  const { start, end } = getWeekRange();

  return query
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
};

const loadTeamStats = async () => {
  const useWeek = teamScope.value === "week";

  const stats = await Promise.all(
    TEAMS.map(async (team) => {
      // Pastors do not go on outings, so they are never part of
      // a team's numbers. See the note in lib/contributors.js.
      const { data: members, error: membersError } = await supabase
        .from("profiles")
        .select("id")
        .eq("team", team)
        .not("is_pastor", "is", true);

      if (membersError) throw membersError;

      const memberIds = (members || []).map((member) => member.id);

      if (!memberIds.length) {
        return { team, contacts: 0, called: 0, responseRate: 0 };
      }

      // Counted server-side: fetching the rows would silently cap at the
      // 1000-row limit once a team passes that many contacts.
      const totalQuery = supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("added_by", memberIds);

      const calledQuery = supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .in("added_by", memberIds)
        .eq("status", "Called");

      const [totalResult, calledResult] = await Promise.all([
        useWeek ? scopedToWeek(totalQuery) : totalQuery,
        useWeek ? scopedToWeek(calledQuery) : calledQuery,
      ]);

      if (totalResult.error) throw totalResult.error;
      if (calledResult.error) throw calledResult.error;

      const contacts = totalResult.count || 0;
      const called = calledResult.count || 0;

      return {
        team,
        contacts,
        called,
        responseRate: contacts ? Math.round((called / contacts) * 100) : 0,
      };
    }),
  );

  teamStats.value = stats;
};

const setTeamScope = async (scope) => {
  if (teamScope.value === scope || teamStatsLoading.value) return;

  teamScope.value = scope;
  teamStatsLoading.value = true;

  try {
    await loadTeamStats();
  } catch (err) {
    console.error("Team stats error:", err);

    error.value = err.message || "Unable to load team statistics.";
  } finally {
    teamStatsLoading.value = false;
  }
};

/* =========================================================
   BRANCH STATS
========================================================= */

const loadBranchStats = async () => {
  const results = await Promise.all(
    BRANCHES.map(async (branch) => {
      const { data: outings, error: branchError } = await supabase
        .from("evangelism_outings")
        .select("id")
        .eq("location", branch);

      if (branchError) throw branchError;

      const outingIds = (outings || []).map((outing) => outing.id);

      if (!outingIds.length) {
        return { branch, contacts: 0 };
      }

      const { data: relationships, error: relationError } = await supabase
        .from("outing_contacts")
        .select("contact_id")
        .in("outing_id", outingIds);

      if (relationError) throw relationError;

      const uniqueContactIds = new Set(
        (relationships || []).map((item) => item.contact_id),
      );

      return { branch, contacts: uniqueContactIds.size };
    }),
  );

  branchStats.value = results;
};

/* =========================================================
   STATUS BREAKDOWN
========================================================= */

const loadStatusBreakdown = async () => {
  const breakdown = await Promise.all(
    STATUSES.map(async (status) => {
      const { count, error: statusError } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("status", status);

      if (statusError) throw statusError;

      return { status, count: count || 0 };
    }),
  );

  statusBreakdown.value = breakdown;

  // Texted is not a status - it is tracked separately so a person
  // can be both called and texted - so it is counted on its own.
  const { count: texted, error: textedError } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .not("texted_at", "is", null);

  if (textedError) throw textedError;

  textedContacts.value = texted || 0;
};

/* =========================================================
   CONTRIBUTORS

   The top five shown here and the full roster on
   /pastor/contributors come from the same tally, so the
   two pages can never disagree.
========================================================= */

const loadContributors = async () => {
  allContributors.value = await loadContributorStats();

  topContributors.value = allContributors.value
    .filter((person) => person.count > 0)
    .slice(0, 5);
};

/* =========================================================
   HEADLINE TOTALS
========================================================= */

const loadTotals = async () => {
  const { start: weekStart, end: weekEnd } = getWeekRange();

  weekLabel.value = formatWeekLabel({ start: weekStart, end: weekEnd });

  // Stale = still "New" three days after being recorded.
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 3);

  const results = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),

    supabase
      .from("evangelism_outings")
      .select("*", { count: "exact", head: true }),

    supabase.from("first_timers").select("*", { count: "exact", head: true }),

    supabase
      .from("first_timers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5),

    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "New")
      .lt("created_at", staleCutoff.toISOString()),

    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .gte("created_at", weekStart.toISOString())
      .lt("created_at", weekEnd.toISOString()),

    supabase
      .from("evangelism_outings")
      .select("*", { count: "exact", head: true })
      .gte("outing_date", toDateKey(weekStart))
      .lt("outing_date", toDateKey(weekEnd)),
  ]);

  for (const result of results) {
    if (result.error) throw result.error;
  }

  const [
    contactsResult,
    outingsResult,
    firstTimersResult,
    recentResult,
    staleResult,
    weeklyContactsResult,
    weeklyOutingsResult,
  ] = results;

  totalContacts.value = contactsResult.count || 0;
  totalOutings.value = outingsResult.count || 0;
  firstTimers.value = firstTimersResult.count || 0;
  recentFirstTimers.value = recentResult.data || [];
  staleNewCount.value = staleResult.count || 0;
  weeklyContacts.value = weeklyContactsResult.count || 0;
  weeklyOutings.value = weeklyOutingsResult.count || 0;
};

/* =========================================================
   SUMMARY

   Every section is independent, so they run together rather
   than one round trip after another.
========================================================= */

const loadSummary = async () => {
  loading.value = true;
  error.value = "";

  try {
    await Promise.all([
      loadTotals(),
      loadTeamStats(),
      loadBranchStats(),
      loadStatusBreakdown(),
      loadContributors(),
    ]);
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

const exportPdf = () => {
  if (exporting.value) return;

  exporting.value = true;

  const doc = new jsPDF();

  const gold = [212, 175, 55];
  const black = [20, 20, 20];
  const gray = [100, 100, 100];
  const lightGray = [225, 225, 225];

  const render = (logo) => {
    // White page background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    // Church logo (omitted if the image could not be loaded)
    if (logo) {
      doc.addImage(logo, "JPEG", 14, 10, 25, 25);
    }

    // Church name
    doc.setTextColor(...black);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("TRANSFIGURATION GOSPEL CHURCH INT'L", 45, 20);

    // Gold accent line
    doc.setDrawColor(...gold);
    doc.setLineWidth(1);
    doc.line(45, 24, 196, 24);

    // Motto
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text("giving you life and reason to live", 45, 31);

    // Report title
    doc.setTextColor(...black);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("PASTOR SUMMARY REPORT", 14, 47);

    // Generated date
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 54);

    // Divider
    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.4);
    doc.line(14, 59, 196, 59);

    // Reusable table styling
    const tableStyles = {
      theme: "grid",
      styles: {
        fontSize: 9,
        textColor: black,
        lineColor: lightGray,
        lineWidth: 0.3,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: gold,
        textColor: black,
        fontStyle: "bold",
        lineColor: gold,
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },
    };

    // Summary metrics
    autoTable(doc, {
      startY: 66,
      head: [["Metric", "Value"]],
      body: [
        ["Total Contacts", totalContacts.value],
        ["Total Outings", totalOutings.value],
        ["First Timers", firstTimers.value],
        ["Follow-up Rate", `${responseRate.value}%`],
        ["Week", weekLabel.value],
        ["Weekly Contacts", weeklyContacts.value],
        ["Weekly Outings", weeklyOutings.value],
        ["Contacts Texted", textedContacts.value],
        ["Stale Contacts", staleNewCount.value],
      ],
      ...tableStyles,
    });

    // Team performance
    const teamScopeLabel =
      teamScope.value === "week"
        ? `This week (${weekLabel.value})`
        : "All time";

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...black);
    doc.text(
      `Team Performance - ${teamScopeLabel}`,
      14,
      doc.lastAutoTable.finalY + 9,
    );

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [["Team", "Contacts", "Called", "Response Rate"]],
      body: teamStats.value.map((team) => [
        team.team,
        team.contacts,
        team.called,
        `${team.responseRate}%`,
      ]),
      ...tableStyles,
    });

    // Branch performance
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [["Branch", "Contacts"]],
      body: branchStats.value.map((branch) => [branch.branch, branch.contacts]),
      ...tableStyles,
    });

    // Status breakdown
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 12,
      head: [["Status", "Count"]],
      body: statusBreakdown.value.map((item) => [item.status, item.count]),
      ...tableStyles,
    });

    // Every contributor, not just the top five
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...black);
    doc.text("All Contributors", 14, doc.lastAutoTable.finalY + 9);

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 14,
      head: [["Name", "Team", "This Week", "Total", "Called", "Texted"]],
      body: allContributors.value.map((person) => [
        person.name,
        person.team,
        person.weekCount,
        person.count,
        person.calledCount,
        person.textedCount,
      ]),
      ...tableStyles,
    });

    // Footer on every page
    const pageCount = doc.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setDrawColor(...lightGray);
      doc.setLineWidth(0.3);
      doc.line(14, 282, 196, 282);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...gray);

      doc.text("Transfiguration Church • Pastor Summary", 14, 289);

      doc.text(`Page ${page} of ${pageCount}`, 196, 289, { align: "right" });
    }

    doc.save("transfiguration-church-pastor-summary.pdf");

    exporting.value = false;
  };

  const logo = new Image();

  logo.onload = () => render(logo);

  logo.onerror = () => {
    // Still produce the report - the logo is decoration, not the data.
    console.error("Unable to load church logo: /TCC.jpeg");

    render(null);
  };

  logo.src = "/TCC.jpeg";
};

onMounted(() => {
  loadSummary();
});
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- Header -->
    <header class="glass-bar border-b">
      <div class="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <button
          type="button"
          @click="goBack(router)"
          class="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <p class="eyebrow">Church oversight</p>

            <h1 class="page-title mt-2">Pastor Summary</h1>

            <p class="muted mt-2">
              Church-wide evangelism and follow-up overview.
            </p>
          </div>

          <button
            @click="exportPdf"
            :disabled="exporting || loading"
            class="btn-outline-gold shrink-0 self-start sm:self-auto"
          >
            {{ exporting ? "Preparing..." : "⤓ Export PDF" }}
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8">
      <!-- Loading -->
      <!-- Loading Skeletons -->
      <div v-if="loading" class="animate-pulse">
        <!-- Main Stats -->
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="i in 4"
            :key="`stat-skeleton-${i}`"
            class="glass-card p-4 sm:p-5"
          >
            <div class="h-3 w-24 rounded bg-white/10"></div>
            <div class="mt-3 h-8 w-16 rounded bg-white/10"></div>
          </div>
        </section>

        <!-- Teams -->
        <section class="mt-8">
          <div class="mb-4">
            <div class="h-4 w-32 rounded bg-white/10"></div>
            <div class="mt-2 h-6 w-48 rounded bg-white/10"></div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div
              v-for="i in 4"
              :key="`team-skeleton-${i}`"
              class="glass-card p-5"
            >
              <div class="h-4 w-32 rounded bg-white/10"></div>
              <div class="mt-5 h-8 w-14 rounded bg-white/10"></div>
              <div class="mt-2 h-3 w-16 rounded bg-white/10"></div>

              <div class="mt-5 flex justify-between">
                <div class="h-3 w-12 rounded bg-white/10"></div>
                <div class="h-3 w-8 rounded bg-white/10"></div>
              </div>

              <div class="mt-3 flex justify-between">
                <div class="h-3 w-20 rounded bg-white/10"></div>
                <div class="h-3 w-10 rounded bg-white/10"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Branches -->
        <section class="mt-8">
          <div class="mb-4">
            <div class="h-4 w-36 rounded bg-white/10"></div>
            <div class="mt-2 h-6 w-48 rounded bg-white/10"></div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="i in 2"
              :key="`branch-skeleton-${i}`"
              class="glass-card p-5"
            >
              <div class="h-3 w-20 rounded bg-white/10"></div>
              <div class="mt-3 h-8 w-14 rounded bg-white/10"></div>
              <div class="mt-2 h-3 w-16 rounded bg-white/10"></div>
            </div>
          </div>
        </section>

        <!-- First Timers -->
        <section class="mt-8">
          <div class="mb-4 flex items-end justify-between">
            <div>
              <div class="h-4 w-20 rounded bg-white/10"></div>
              <div class="mt-2 h-6 w-36 rounded bg-white/10"></div>
            </div>

            <div class="h-3 w-14 rounded bg-white/10"></div>
          </div>

          <div class="space-y-3">
            <div
              v-for="i in 5"
              :key="`first-timer-skeleton-${i}`"
              class="glass-card p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div class="flex-1">
                  <div class="h-4 w-32 rounded bg-white/10"></div>
                  <div class="mt-2 h-3 w-24 rounded bg-white/10"></div>
                </div>

                <div class="h-3 w-20 rounded bg-white/10"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- This Week -->
        <section class="mt-8">
          <div class="mb-4">
            <div class="h-4 w-24 rounded bg-white/10"></div>
            <div class="mt-2 h-6 w-44 rounded bg-white/10"></div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="i in 2"
              :key="`weekly-skeleton-${i}`"
              class="glass-card p-4 sm:p-5"
            >
              <div class="h-3 w-24 rounded bg-white/10"></div>
              <div class="mt-3 h-8 w-14 rounded bg-white/10"></div>
            </div>
          </div>
        </section>

        <!-- Status Breakdown -->
        <section class="mt-8">
          <div class="mb-4 flex items-end justify-between">
            <div>
              <div class="h-4 w-32 rounded bg-white/10"></div>
              <div class="mt-2 h-6 w-52 rounded bg-white/10"></div>
            </div>

            <div class="h-6 w-28 rounded-full bg-white/10"></div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="i in 4"
              :key="`status-skeleton-${i}`"
              class="glass-card p-4 sm:p-5"
            >
              <div class="h-3 w-20 rounded bg-white/10"></div>
              <div class="mt-3 h-8 w-12 rounded bg-white/10"></div>
            </div>
          </div>
        </section>

        <!-- Top Contributors -->
        <section class="mt-8">
          <div class="mb-4">
            <div class="h-4 w-32 rounded bg-white/10"></div>
            <div class="mt-2 h-6 w-40 rounded bg-white/10"></div>
          </div>

          <div class="space-y-3">
            <div
              v-for="i in 5"
              :key="`contributor-skeleton-${i}`"
              class="flex items-center gap-4 glass-card p-4"
            >
              <div class="h-10 w-10 shrink-0 rounded-xl bg-white/10"></div>

              <div class="min-w-0 flex-1">
                <div class="h-4 w-32 rounded bg-white/10"></div>
                <div class="mt-2 h-3 w-24 rounded bg-white/10"></div>
              </div>

              <div class="h-5 w-8 rounded bg-white/10"></div>
            </div>
          </div>
        </section>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-2xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur p-5 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <template v-else>
        <!-- Main Stats -->
        <section class="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div
            class="glass-card p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Total Contacts</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totalContacts }}
            </p>
          </div>

          <div
            class="glass-card p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Total Outings</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ totalOutings }}
            </p>
          </div>

          <div
            class="glass-card p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">First Timers</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ firstTimers }}
            </p>
          </div>

          <div
            class="glass-card p-4 sm:p-5"
          >
            <p class="text-xs text-gray-500 sm:text-sm">Follow-up Rate</p>

            <p class="mt-2 text-2xl font-black text-[#D4AF37]">
              {{ responseRate }}%
            </p>
          </div>
        </section>

        <!-- Teams -->
        <section class="mt-8">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p class="eyebrow">
                Team performance
              </p>

              <h2 class="section-title mt-2">Evangelism Teams</h2>

              <p class="mt-1 text-xs text-gray-600">
                <template v-if="teamScope === 'week'">
                  {{ weekLabel }} &middot; resets Friday night
                </template>

                <template v-else> All time </template>
              </p>
            </div>

            <div
              class="flex shrink-0 rounded-xl border border-white/10 bg-white/[0.035] backdrop-blur-xl p-1"
            >
              <button
                type="button"
                @click="setTeamScope('week')"
                :disabled="teamStatsLoading"
                :class="[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
                  teamScope === 'week'
                    ? 'bg-[#D4AF37] text-black'
                    : 'text-gray-400 hover:text-white',
                ]"
              >
                This week
              </button>

              <button
                type="button"
                @click="setTeamScope('all')"
                :disabled="teamStatsLoading"
                :class="[
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
                  teamScope === 'all'
                    ? 'bg-[#D4AF37] text-black'
                    : 'text-gray-400 hover:text-white',
                ]"
              >
                All time
              </button>
            </div>
          </div>

          <div
            class="grid gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-4"
            :class="teamStatsLoading ? 'opacity-40' : ''"
          >
            <div
              v-for="team in teamStats"
              :key="team.team"
              class="glass-card p-5"
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
            <p class="eyebrow">
              Branch performance
            </p>

            <h2 class="section-title mt-2">Outreach by Branch</h2>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="branch in branchStats"
              :key="branch.branch"
              class="glass-card p-5"
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
              <p class="eyebrow">First Timers</p>

              <h2 class="section-title mt-2">Recent Entries</h2>
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
            class="glass-dashed p-6 text-center text-sm text-gray-500"
          >
            No first timers recorded yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="person in recentFirstTimers"
              :key="person.id"
              class="glass-card p-4"
            >
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="font-semibold">
                    {{ person.full_name }}
                  </p>

                  <p class="muted mt-1">
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
            <p class="eyebrow">Current week</p>

            <h2 class="section-title mt-2">This Week's Activity</h2>

            <p v-if="weekLabel" class="mt-1 text-xs text-gray-600">
              {{ weekLabel }} &middot; resets Friday night
            </p>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div
              class="glass-card p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">Contacts Added</p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ weeklyContacts }}
              </p>
            </div>

            <div
              class="glass-card p-4 sm:p-5"
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
              <p class="eyebrow">
                Follow-up health
              </p>

              <h2 class="section-title mt-2">Contact Status Breakdown</h2>
            </div>

            <div
              v-if="staleNewCount > 0"
              class="rounded-full border border-red-500/25 bg-red-500/[0.07] backdrop-blur px-3 py-1 text-xs font-semibold text-red-400"
            >
              {{ staleNewCount }} uncalled 3+ days
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div
              v-for="item in statusBreakdown"
              :key="item.status"
              class="glass-card p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">
                {{ item.status }}
              </p>

              <p class="mt-2 text-2xl font-black text-[#D4AF37]">
                {{ item.count }}
              </p>
            </div>

            <!-- Texted sits alongside the statuses rather than among
                 them: a person can be both called and texted. -->
            <div
              class="rounded-2xl border border-blue-500/20 bg-white/[0.035] backdrop-blur-xl p-4 sm:p-5"
            >
              <p class="text-xs text-gray-500 sm:text-sm">Texted</p>

              <p class="mt-2 text-2xl font-black text-blue-400">
                {{ textedContacts }}
              </p>
            </div>
          </div>
        </section>

        <!-- New: Top Contributors -->
        <section class="mt-8">
          <div class="mb-4 flex items-start justify-between gap-4">
            <div>
              <p class="eyebrow">
                Individual impact
              </p>

              <h2 class="section-title mt-2">Top Contributors</h2>
            </div>

            <button
              type="button"
              @click="router.push('/pastor/contributors')"
              class="shrink-0 rounded-xl border border-[#D4AF37]/30 bg-white/[0.035] backdrop-blur-xl px-4 py-2 text-xs font-semibold text-[#D4AF37] transition hover:border-[#D4AF37]/60 hover:bg-white/[0.07] sm:text-sm"
            >
              All contributors →
            </button>
          </div>

          <div
            v-if="topContributors.length === 0"
            class="glass-dashed p-6 text-center text-sm text-gray-500"
          >
            No contacts recorded yet.
          </div>

          <div v-else class="space-y-3">
            <div
              v-for="(person, index) in topContributors"
              :key="person.id"
              class="flex items-center gap-4 glass-card p-4"
            >
              <div
                class="icon-tile h-10 w-10 shrink-0 font-black"
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

    <BottomNav />
  </div>
</template>
