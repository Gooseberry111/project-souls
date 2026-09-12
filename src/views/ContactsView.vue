<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { goBack } from "../lib/navigation";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

/* =========================================================
   GENERAL
========================================================= */

/* The pastor does not go out on evangelism, so "Mine" would
   always be empty for him. He only ever sees Everyone. */
const isPastor = computed(() => authStore.profile?.is_pastor === true);

const activeTab = ref(authStore.profile?.is_pastor ? "Everyone" : "Mine");

const outings = ref([]);
const loading = ref(true);
const error = ref("");

/* =========================================================
   EVERYONE CONTACTS
========================================================= */

const everyoneContacts = ref([]);
const loadingContacts = ref(false);

const searchQuery = ref("");
const branchFilter = ref("All");
const statusFilter = ref("All");
const teamFilter = ref("All");

const sortBy = ref("date");
const sortDirection = ref("desc");

const currentPage = ref(1);
const pageSize = 50;

/* =========================================================
   FEEDBACK
========================================================= */

const showFeedbackModal = ref(false);
const selectedFeedback = ref(null);

const feedbackText = ref("");
const feedbackStatus = ref("New");
const savingFeedback = ref(false);
const feedbackError = ref("");

const openFeedback = (contact) => {
  if (!contact) return;

  selectedFeedback.value = contact;

  feedbackText.value = contact.notes || "";
  feedbackStatus.value = contact.status || "New";
  feedbackError.value = "";

  showFeedbackModal.value = true;
};

const closeFeedback = () => {
  if (savingFeedback.value) return;

  selectedFeedback.value = null;
  feedbackText.value = "";
  feedbackStatus.value = "New";
  feedbackError.value = "";
  showFeedbackModal.value = false;
};

/* =========================================================
   SAVE FEEDBACK
========================================================= */

const saveFeedback = async () => {
  if (!selectedFeedback.value) return;

  savingFeedback.value = true;
  feedbackError.value = "";

  try {
    const notes = feedbackText.value.trim();

    const { data, error: updateError } = await supabase
      .from("contacts")
      .update({
        notes: notes || null,
        status: feedbackStatus.value,
      })
      .eq("id", selectedFeedback.value.id)
      .select()
      .single();

    if (updateError) throw updateError;

    /* Update Everyone list immediately */

    const index = everyoneContacts.value.findIndex(
      (contact) => contact.id === selectedFeedback.value.id,
    );

    if (index !== -1) {
      everyoneContacts.value[index] = {
        ...everyoneContacts.value[index],
        ...data,
        status: data.status || "New",
      };
    }

    /* Update selected contact */

    selectedFeedback.value = {
      ...selectedFeedback.value,
      ...data,
      status: data.status || "New",
    };

    showFeedbackModal.value = false;
    selectedFeedback.value = null;
    feedbackText.value = "";
    feedbackStatus.value = "New";
    feedbackError.value = "";
  } catch (err) {
    console.error("Error saving feedback:", err);

    feedbackError.value =
      err.message || "Unable to save feedback. Please try again.";
  } finally {
    savingFeedback.value = false;
  }
};

/* =========================================================
   PERMISSIONS

   Mirrors the row level security rule on contacts: only the
   person who recorded a contact, or a pastor, may change it.
========================================================= */

const canEditContact = (contact) => {
  if (!contact) return false;

  return (
    contact.added_by === authStore.user?.id ||
    authStore.profile?.is_pastor === true
  );
};

/* =========================================================
   EXPORT
========================================================= */

const showExportMenu = ref(false);
const exporting = ref(false);
const exportError = ref("");

const canExport = computed(() => {
  return (
    authStore.profile?.is_pastor === true ||
    authStore.profile?.role === "team_leader"
  );
});

/* =========================================================
   DATE FORMAT
========================================================= */

const formatDate = (date) => {
  if (!date) return "—";

  try {
    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return "—";
    }

    return parsedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

/* =========================================================
   LOAD OUTINGS
========================================================= */

const loadOutings = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { data, error: outingsError } = await supabase
      .from("evangelism_outings")
      .select(
        `
        id,
        title,
        outing_date,
        location,
        created_by,
        created_at
      `,
      )
      .order("outing_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (outingsError) throw outingsError;

    const outingList = data || [];

    const creatorIds = [
      ...new Set(outingList.map((outing) => outing.created_by).filter(Boolean)),
    ];

    let profiles = [];

    if (creatorIds.length) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, team")
        .in("id", creatorIds);

      if (profileError) throw profileError;

      profiles = profileData || [];
    }

    const profileMap = Object.fromEntries(
      profiles.map((profile) => [profile.id, profile]),
    );

    const outingIds = outingList.map((outing) => outing.id);

    let outingContacts = [];

    if (outingIds.length) {
      const { data: outingContactData, error: outingContactError } =
        await supabase
          .from("outing_contacts")
          .select("outing_id, contact_id")
          .in("outing_id", outingIds);

      if (outingContactError) throw outingContactError;

      outingContacts = outingContactData || [];
    }

    outings.value = outingList.map((outing) => {
      const profile = profileMap[outing.created_by];

      const contactsCount = outingContacts.filter(
        (item) => item.outing_id === outing.id,
      ).length;

      return {
        ...outing,

        submitterName:
          profile?.full_name ||
          (outing.created_by === authStore.user?.id ? "You" : "Member"),

        team: profile?.team || "No team",

        contactsCount,
      };
    });
  } catch (err) {
    console.error("Error loading outings:", err);

    error.value = err.message || "Unable to load outings.";
  } finally {
    loading.value = false;
  }
};

/* =========================================================
   LOAD EVERYONE CONTACTS
========================================================= */

const loadEveryoneContacts = async () => {
  loadingContacts.value = true;

  try {
    const { data, error: contactsError } = await supabase
      .from("contacts")
      .select(
        `
        id,
        name,
        phone,
        location,
        notes,
        status,
        called_at,
        texted_at,
        created_at,
        added_by
      `,
      )
      .order("created_at", { ascending: false });

    if (contactsError) throw contactsError;

    const contacts = data || [];

    const contactIds = contacts.map((contact) => contact.id);

    let outingLinks = [];

    if (contactIds.length) {
      const { data: links, error: linksError } = await supabase
        .from("outing_contacts")
        .select("contact_id, outing_id")
        .in("contact_id", contactIds);

      if (linksError) throw linksError;

      outingLinks = links || [];
    }

    const outingIds = [...new Set(outingLinks.map((link) => link.outing_id))];

    let outingData = [];

    if (outingIds.length) {
      const { data: outingsData, error: outingsError } = await supabase
        .from("evangelism_outings")
        .select("id, location, outing_date")
        .in("id", outingIds);

      if (outingsError) throw outingsError;

      outingData = outingsData || [];
    }

    const outingMap = Object.fromEntries(
      outingData.map((outing) => [outing.id, outing]),
    );

    const contactOutingMap = {};

    outingLinks.forEach((link) => {
      contactOutingMap[link.contact_id] = outingMap[link.outing_id];
    });

    const userIds = [
      ...new Set(contacts.map((contact) => contact.added_by).filter(Boolean)),
    ];

    let profiles = [];

    if (userIds.length) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, team")
        .in("id", userIds);

      if (profileError) throw profileError;

      profiles = profileData || [];
    }

    const profileMap = Object.fromEntries(
      profiles.map((profile) => [profile.id, profile]),
    );

    everyoneContacts.value = contacts.map((contact) => {
      const outing = contactOutingMap[contact.id];
      const profile = profileMap[contact.added_by];

      return {
        ...contact,

        branch: outing?.location || contact.location || "Unknown",

        outingDate: outing?.outing_date || contact.created_at,

        addedBy: profile?.full_name || "Unknown",

        team: profile?.team || "No Team",

        status: contact.status || "New",
      };
    });
  } catch (err) {
    console.error("Error loading everyone contacts:", err);

    error.value = err.message || "Unable to load contacts.";
  } finally {
    loadingContacts.value = false;
  }
};

/* =========================================================
   MINE FILTER
========================================================= */

const filteredOutings = computed(() => {
  return outings.value.filter(
    (outing) => outing.created_by === authStore.user?.id,
  );
});

/* =========================================================
   EVERYONE FILTER
========================================================= */

/* "Texted" is not one of the statuses - it lives in its own
   column so it can be true alongside any status - but it
   filters from the same dropdown. */
const matchesStatusFilter = (contact) => {
  if (statusFilter.value === "All") return true;

  if (statusFilter.value === "Texted") return Boolean(contact.texted_at);

  return contact.status === statusFilter.value;
};

const filteredEveryoneContacts = computed(() => {
  let result = [...everyoneContacts.value];

  const search = searchQuery.value.trim().toLowerCase();

  if (search) {
    result = result.filter((contact) => {
      return (
        contact.name?.toLowerCase().includes(search) ||
        contact.phone?.toLowerCase().includes(search)
      );
    });
  }

  if (branchFilter.value !== "All") {
    result = result.filter((contact) => contact.branch === branchFilter.value);
  }

  result = result.filter(matchesStatusFilter);

  if (teamFilter.value !== "All") {
    result = result.filter((contact) => contact.team === teamFilter.value);
  }

  result.sort((a, b) => {
    let valueA;
    let valueB;

    if (sortBy.value === "date") {
      valueA = new Date(a.outingDate || a.created_at).getTime();
      valueB = new Date(b.outingDate || b.created_at).getTime();
    }

    if (sortBy.value === "status") {
      valueA = a.status || "New";
      valueB = b.status || "New";
    }

    if (sortBy.value === "name") {
      valueA = a.name || "";
      valueB = b.name || "";
    }

    if (typeof valueA === "string") {
      const comparison = valueA.localeCompare(valueB);

      return sortDirection.value === "asc" ? comparison : -comparison;
    }

    return sortDirection.value === "asc" ? valueA - valueB : valueB - valueA;
  });

  return result;
});

/* =========================================================
   PAGINATION
========================================================= */

const totalPages = computed(() => {
  return Math.max(
    1,
    Math.ceil(filteredEveryoneContacts.value.length / pageSize),
  );
});

const paginatedEveryoneContacts = computed(() => {
  const start = (currentPage.value - 1) * pageSize;

  return filteredEveryoneContacts.value.slice(start, start + pageSize);
});

/* =========================================================
   SORT
========================================================= */

/* =========================================================
   ACTIVE FILTERS
========================================================= */

const activeFilters = computed(() => {
  const chips = [];

  if (searchQuery.value.trim()) {
    chips.push({
      key: "search",
      label: `"${searchQuery.value.trim()}"`,
      clear: () => (searchQuery.value = ""),
    });
  }

  if (branchFilter.value !== "All") {
    chips.push({
      key: "branch",
      label: branchFilter.value,
      clear: () => (branchFilter.value = "All"),
    });
  }

  if (statusFilter.value !== "All") {
    chips.push({
      key: "status",
      label: statusFilter.value,
      clear: () => (statusFilter.value = "All"),
    });
  }

  if (teamFilter.value !== "All") {
    chips.push({
      key: "team",
      label: teamFilter.value,
      clear: () => (teamFilter.value = "All"),
    });
  }

  return chips;
});

const clearFilters = () => {
  searchQuery.value = "";
  branchFilter.value = "All";
  statusFilter.value = "All";
  teamFilter.value = "All";
};

/* Initial of the contact's name, for the row avatar. */
const initialOf = (name) => (name || "?").trim().charAt(0).toUpperCase() || "?";

const statusClass = (status) => {
  if (status === "Called") return "badge-green";
  if (status === "Following Up") return "badge-gold";
  if (status === "Not Reachable") return "badge-red";

  return "badge-neutral";
};

const changeSort = (column) => {
  if (sortBy.value === column) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = column;
    sortDirection.value = "asc";
  }

  currentPage.value = 1;
};

/* =========================================================
   OUTING
========================================================= */

const openOuting = (outing) => {
  router.push(`/outing/${outing.id}`);
};

/* =========================================================
   RESET PAGINATION
========================================================= */

watch([searchQuery, branchFilter, statusFilter, teamFilter], () => {
  currentPage.value = 1;
});

/* =========================================================
   CSV
========================================================= */

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const convertContactsToCsv = (contacts) => {
  const headers = [
    "Name",
    "Phone Number",
    "Branch",
    "Date Added",
    "Added By",
    "Status",
    "Called",
    "Texted",
    "Feedback",
  ];

  const rows = contacts.map((contact) => {
    return [
      contact.name || "",
      contact.phone || "",
      contact.branch || "",
      formatDate(contact.outingDate || contact.created_at),
      contact.addedBy || "",
      contact.status || "New",
      contact.called_at ? formatDate(contact.called_at) : "No",
      contact.texted_at ? formatDate(contact.texted_at) : "No",
      contact.notes || "",
    ];
  });

  return [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ].join("\n");
};

const downloadCsv = (csv, filename) => {
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;
  link.setAttribute("download", filename);

  document.body.appendChild(link);

  link.click();

  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

/* =========================================================
   EXPORT
========================================================= */

const exportContacts = async (scope, filtered) => {
  exportError.value = "";

  if (!canExport.value) {
    exportError.value = "You do not have permission to export contacts.";

    return;
  }

  if (scope === "team" && authStore.profile?.role !== "team_leader") {
    exportError.value = "Only team leaders can export team contacts.";

    return;
  }

  exporting.value = true;

  try {
    let contacts = [...everyoneContacts.value];

    if (scope === "team") {
      const userTeam = authStore.profile?.team;

      if (!userTeam) {
        throw new Error("Your team could not be determined.");
      }

      contacts = contacts.filter((contact) => contact.team === userTeam);
    }

    if (filtered) {
      const search = searchQuery.value.trim().toLowerCase();

      if (search) {
        contacts = contacts.filter((contact) => {
          return (
            contact.name?.toLowerCase().includes(search) ||
            contact.phone?.toLowerCase().includes(search)
          );
        });
      }

      if (branchFilter.value !== "All") {
        contacts = contacts.filter(
          (contact) => contact.branch === branchFilter.value,
        );
      }

      contacts = contacts.filter(matchesStatusFilter);

      if (scope !== "team" && teamFilter.value !== "All") {
        contacts = contacts.filter(
          (contact) => contact.team === teamFilter.value,
        );
      }
    }

    const csv = convertContactsToCsv(contacts);

    const scopeName =
      scope === "team" ? authStore.profile?.team || "team" : "everyone";

    const modeName = filtered ? "filtered" : "all";

    const filename = `contacts-${scopeName
      .toLowerCase()
      .replace(/\s+/g, "-")}-${modeName}.csv`;

    downloadCsv(csv, filename);

    showExportMenu.value = false;
  } catch (err) {
    console.error("Export error:", err);

    exportError.value = err.message || "Unable to export contacts.";
  } finally {
    exporting.value = false;
  }
};

/* =========================================================
   MOUNT
========================================================= */

onMounted(async () => {
  // Outings only feed the "Mine" tab, which the pastor never sees.
  if (!isPastor.value) {
    await loadOutings();
  } else {
    loading.value = false;
  }

  await loadEveryoneContacts();
});
</script>
<template>
  <div class="min-h-screen text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="glass-bar sticky top-0 z-40 border-b">
      <div class="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <button
          type="button"
          @click="goBack(router)"
          class="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div class="min-w-0">
            <p class="eyebrow">Outreach</p>

            <h1 class="page-title mt-2">Contacts</h1>

            <p class="muted mt-2">
              {{
                isPastor
                  ? "Every soul recorded across the church."
                  : "Track your outreach and church-wide activity."
              }}
            </p>
          </div>

          <!-- EXPORT -->

          <div v-if="canExport && activeTab === 'Everyone'" class="relative">
            <button
              type="button"
              @click="showExportMenu = !showExportMenu"
              :disabled="exporting"
              class="btn-outline-gold w-full shrink-0 sm:w-auto"
            >
              {{ exporting ? "Exporting..." : "⤓ Export CSV" }}
            </button>

            <div
              v-if="showExportMenu"
              class="glass-panel absolute right-0 z-50 mt-2 w-72 p-2"
            >
              <template v-if="authStore.profile?.role === 'team_leader'">
                <p
                  class="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
                >
                  My team — {{ authStore.profile?.team }}
                </p>

                <button
                  type="button"
                  @click="exportContacts('team', true)"
                  class="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <p class="text-sm font-semibold text-white">
                    Export filtered view
                  </p>

                  <p class="mt-0.5 text-xs text-gray-500">
                    Your team, matching current filters
                  </p>
                </button>

                <button
                  type="button"
                  @click="exportContacts('team', false)"
                  class="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <p class="text-sm font-semibold text-white">Export all</p>

                  <p class="mt-0.5 text-xs text-gray-500">
                    Every contact from your team
                  </p>
                </button>

                <div class="divider my-2"></div>
              </template>

              <p
                class="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500"
              >
                Everyone
              </p>

              <button
                type="button"
                @click="exportContacts('everyone', true)"
                class="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
              >
                <p class="text-sm font-semibold text-white">
                  Export filtered view
                </p>

                <p class="mt-0.5 text-xs text-gray-500">
                  Matching your current filters
                </p>
              </button>

              <button
                type="button"
                @click="exportContacts('everyone', false)"
                class="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
              >
                <p class="text-sm font-semibold text-white">Export all</p>

                <p class="mt-0.5 text-xs text-gray-500">
                  The complete church dataset
                </p>
              </button>
            </div>

            <p
              v-if="exportError"
              class="mt-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-2.5 text-xs text-red-400 backdrop-blur"
            >
              {{ exportError }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <!-- =====================================================
         MAIN
    ====================================================== -->

    <main class="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8">
      <!-- TABS -->

      <div
        v-if="!isPastor"
        class="mb-6 inline-flex gap-1 rounded-2xl border border-white/[0.09] bg-white/[0.035] p-1 backdrop-blur-xl"
      >
        <button
          type="button"
          @click="activeTab = 'Mine'"
          :class="[
            'rounded-xl px-5 py-2.5 text-sm font-semibold transition duration-200',
            activeTab === 'Mine'
              ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black shadow-[0_4px_14px_-6px_rgba(212,175,55,0.8)]'
              : 'text-gray-400 hover:text-white',
          ]"
        >
          Mine
        </button>

        <button
          type="button"
          @click="activeTab = 'Everyone'"
          :class="[
            'rounded-xl px-5 py-2.5 text-sm font-semibold transition duration-200',
            activeTab === 'Everyone'
              ? 'bg-gradient-to-b from-[#E2C45A] to-[#C9A331] text-black shadow-[0_4px_14px_-6px_rgba(212,175,55,0.8)]'
              : 'text-gray-400 hover:text-white',
          ]"
        >
          Everyone
        </button>
      </div>

      <!-- =================================================
           MINE
      ================================================== -->

      <template v-if="activeTab === 'Mine'">
        <div v-if="loading" class="space-y-3">
          <div
            v-for="i in 4"
            :key="`outing-skeleton-${i}`"
            class="glass-card flex items-center gap-4 p-4 sm:p-5"
          >
            <div class="skeleton h-12 w-12 shrink-0 rounded-xl"></div>

            <div class="flex-1 space-y-2">
              <div class="skeleton h-4 w-48 rounded"></div>
              <div class="skeleton h-3 w-32 rounded"></div>
            </div>
          </div>
        </div>

        <div
          v-else-if="error"
          class="rounded-2xl border border-red-500/25 bg-red-500/[0.07] p-5 text-sm text-red-400 backdrop-blur"
        >
          {{ error }}
        </div>

        <div v-else-if="filteredOutings.length === 0" class="glass-dashed p-10 text-center">
          <div class="icon-tile mx-auto h-14 w-14 text-2xl">▣</div>

          <p class="mt-4 font-semibold text-gray-300">No outings yet</p>

          <p class="muted mx-auto mt-1 max-w-sm">
            Record an outing and the people you spoke to will appear here, ready
            to call and text.
          </p>

          <button
            type="button"
            @click="router.push('/record-person')"
            class="btn-gold mt-6"
          >
            + Add outing
          </button>
        </div>

        <div v-else class="space-y-3">
          <button
            v-for="outing in filteredOutings"
            :key="outing.id"
            type="button"
            @click="openOuting(outing)"
            class="glass-card-interactive group w-full p-4 text-left sm:p-5"
          >
            <div class="flex items-center gap-4">
              <div
                class="icon-tile h-12 w-12 shrink-0 text-lg transition group-hover:bg-[#D4AF37]/20"
              >
                ▣
              </div>

              <div class="min-w-0 flex-1">
                <h2 class="truncate font-bold">
                  {{ outing.location }} Centre
                </h2>

                <p class="mt-1 text-xs text-gray-500">
                  {{ formatDate(outing.outing_date) }} ·
                  {{ outing.team }}
                </p>
              </div>

              <div class="shrink-0 text-right">
                <p class="text-xl font-black text-[#D4AF37]">
                  {{ outing.contactsCount }}
                </p>

                <p class="text-[11px] text-gray-600">
                  {{ outing.contactsCount === 1 ? "person" : "people" }}
                </p>
              </div>

              <span
                class="shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#D4AF37]"
              >
                →
              </span>
            </div>
          </button>
        </div>
      </template>

      <!-- =================================================
           EVERYONE
      ================================================== -->

      <template v-else>
        <!-- TOOLBAR -->

        <section class="glass-card p-4">
          <div class="grid gap-3 lg:grid-cols-12">
            <div class="relative lg:col-span-5">
              <span
                class="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
              >
                ⌕
              </span>

              <input
                v-model="searchQuery"
                type="search"
                placeholder="Search name or phone number..."
                class="field pl-10"
              />
            </div>

            <select v-model="branchFilter" class="field-select lg:col-span-2">
              <option value="All">All centres</option>
              <option value="Barnawa">Barnawa</option>
              <option value="Gbaggivilla">Gbagyivilla</option>
            </select>

            <select v-model="statusFilter" class="field-select lg:col-span-2">
              <option value="All">All status</option>
              <option value="New">New</option>
              <option value="Called">Called</option>
              <option value="Texted">Texted</option>
              <option value="Following Up">Following Up</option>
              <option value="Not Reachable">Not Reachable</option>
            </select>

            <select v-model="teamFilter" class="field-select lg:col-span-3">
              <option value="All">All teams</option>
              <option value="Sent Ones">Sent Ones</option>
              <option value="Pacesetters">Pacesetters</option>
              <option value="Soul Harvesters">Soul Harvesters</option>
              <option value="Kingdom Harvesters">Kingdom Harvesters</option>
            </select>
          </div>

          <!-- ACTIVE FILTER CHIPS -->

          <div
            v-if="activeFilters.length"
            class="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-4"
          >
            <span class="text-[11px] uppercase tracking-wide text-gray-600">
              Filtered by
            </span>

            <button
              v-for="chip in activeFilters"
              :key="chip.key"
              type="button"
              @click="chip.clear()"
              class="badge-gold transition hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/20"
            >
              {{ chip.label }}

              <span class="text-[#D4AF37]/70">×</span>
            </button>

            <button
              type="button"
              @click="clearFilters"
              class="ml-auto text-xs font-semibold text-gray-500 transition hover:text-white"
            >
              Clear all
            </button>
          </div>
        </section>

        <!-- LOADING -->

        <!-- Shaped like the table rows it is standing in for, so
             the list does not jump when the data lands. -->
        <div
          v-if="loadingContacts"
          class="glass-card mt-4 divide-y divide-white/[0.05] overflow-hidden"
        >
          <div class="h-[46px] bg-white/[0.04]"></div>

          <div
            v-for="i in 10"
            :key="`contact-skeleton-${i}`"
            class="flex items-center gap-3 px-3 py-3 sm:px-5"
          >
            <div class="skeleton h-8 w-8 shrink-0 rounded-lg sm:h-9 sm:w-9"></div>

            <div class="flex-1 space-y-1.5">
              <div class="skeleton h-3.5 w-32 rounded sm:w-44"></div>
              <div class="skeleton h-2.5 w-24 rounded sm:w-32"></div>
            </div>

            <div class="skeleton h-5 w-16 shrink-0 rounded-full"></div>
          </div>
        </div>

        <!-- EMPTY -->

        <div
          v-else-if="filteredEveryoneContacts.length === 0"
          class="glass-dashed mt-4 p-10 text-center"
        >
          <div class="icon-tile mx-auto h-14 w-14 text-2xl">⌕</div>

          <p class="mt-4 font-semibold text-gray-300">No contacts found</p>

          <p class="muted mt-1">Nothing matches your current filters.</p>

          <button
            v-if="activeFilters.length"
            type="button"
            @click="clearFilters"
            class="btn-ghost mt-6"
          >
            Clear filters
          </button>
        </div>

        <template v-else>
          <!-- =============================================
               TABLE

               One table at every size rather than cards on
               mobile: a card per contact is easy to read but
               impossible to scan once there are hundreds of
               them. Columns drop away as the screen narrows,
               and whatever is hidden moves into the meta line
               under the contact's name, so nothing is lost.

               The whole row opens feedback, which is how the
               Feedback column stays reachable on a phone.
          ============================================== -->

          <div class="glass-card mt-4 overflow-hidden">
            <table class="w-full table-fixed text-left">
              <thead class="border-b border-white/[0.09] bg-white/[0.04]">
                <tr class="text-[10px] uppercase tracking-wider text-gray-500">
                  <th
                    class="cursor-pointer px-3 py-3.5 font-semibold transition hover:text-[#D4AF37] sm:px-5"
                    @click="changeSort('name')"
                  >
                    Contact

                    <span v-if="sortBy === 'name'" class="ml-1 text-[#D4AF37]">
                      {{ sortDirection === "asc" ? "↑" : "↓" }}
                    </span>
                  </th>

                  <!-- Added by sits ahead of the other optional
                       columns: who recorded a contact, and for which
                       team, is the point of the church-wide list, so
                       it is the last thing to be given up. -->
                  <th class="hidden w-40 px-4 py-3.5 font-semibold sm:table-cell">
                    Added by
                  </th>

                  <th class="hidden w-32 px-4 py-3.5 font-semibold lg:table-cell">
                    Centre
                  </th>

                  <th
                    class="hidden w-36 cursor-pointer px-4 py-3.5 font-semibold transition hover:text-[#D4AF37] md:table-cell"
                    @click="changeSort('date')"
                  >
                    Recorded

                    <span v-if="sortBy === 'date'" class="ml-1 text-[#D4AF37]">
                      {{ sortDirection === "asc" ? "↑" : "↓" }}
                    </span>
                  </th>

                  <th
                    class="w-[7.5rem] cursor-pointer px-3 py-3.5 font-semibold transition hover:text-[#D4AF37] sm:w-40 sm:px-4"
                    @click="changeSort('status')"
                  >
                    Status

                    <span
                      v-if="sortBy === 'status'"
                      class="ml-1 text-[#D4AF37]"
                    >
                      {{ sortDirection === "asc" ? "↑" : "↓" }}
                    </span>
                  </th>

                  <th class="hidden w-64 px-5 py-3.5 font-semibold xl:table-cell">
                    Feedback
                  </th>

                  <th class="w-9 px-2 py-3.5 xl:hidden"></th>
                </tr>
              </thead>

              <tbody class="divide-y divide-white/[0.05]">
                <tr
                  v-for="contact in paginatedEveryoneContacts"
                  :key="contact.id"
                  @click="canEditContact(contact) && openFeedback(contact)"
                  :class="[
                    'group transition hover:bg-white/[0.035]',
                    canEditContact(contact) ? 'cursor-pointer' : '',
                  ]"
                >
                  <!-- CONTACT -->

                  <td class="px-3 py-3 sm:px-5">
                    <div class="flex items-center gap-2.5 sm:gap-3">
                      <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#E2C45A]/30 to-[#A8861F]/20 text-[11px] font-black text-[#D4AF37] ring-1 ring-[#D4AF37]/20 sm:h-9 sm:w-9 sm:rounded-xl sm:text-xs"
                      >
                        {{ initialOf(contact.name) }}
                      </div>

                      <div class="min-w-0">
                        <p
                          class="truncate text-sm font-semibold text-white sm:text-[15px]"
                        >
                          {{ contact.name }}
                        </p>

                        <!-- Meta line: carries whichever columns the
                             current screen is too narrow to show. -->
                        <p
                          class="mt-0.5 truncate text-[11px] text-gray-500 sm:text-xs"
                        >
                          <span>{{ contact.phone || "No number" }}</span>

                          <span class="lg:hidden">
                            · {{ contact.branch }}
                          </span>

                          <span class="md:hidden">
                            ·
                            {{
                              formatDate(contact.outingDate || contact.created_at)
                            }}
                          </span>
                        </p>

                        <!-- Attribution, inline only on the narrowest
                             screens where the column itself is gone. -->
                        <p
                          class="mt-1 truncate text-[11px] text-[#D4AF37]/80 sm:hidden"
                        >
                          ↳ {{ contact.addedBy }}

                          <span class="text-gray-600">
                            · {{ contact.team }}
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>

                  <!-- ADDED BY -->

                  <td class="hidden px-4 py-3 sm:table-cell">
                    <p class="truncate text-sm font-medium text-gray-200">
                      {{ contact.addedBy }}
                    </p>

                    <p class="mt-0.5 flex items-center gap-1.5">
                      <span
                        class="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]/60"
                      ></span>

                      <span class="truncate text-[11px] text-gray-500">
                        {{ contact.team }}
                      </span>
                    </p>
                  </td>

                  <!-- CENTRE -->

                  <td
                    class="hidden truncate px-4 py-3 text-sm text-gray-400 lg:table-cell"
                  >
                    {{ contact.branch }}
                  </td>

                  <!-- RECORDED -->

                  <td
                    class="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-400 md:table-cell"
                  >
                    {{ formatDate(contact.outingDate || contact.created_at) }}
                  </td>

                  <!-- STATUS -->

                  <td class="px-3 py-3 sm:px-4">
                    <div class="flex flex-wrap items-center gap-1">
                      <span
                        :class="[statusClass(contact.status), 'px-2 py-0.5']"
                      >
                        {{ contact.status || "New" }}
                      </span>

                      <!-- Separate from the status: texted stands
                           alongside Called, it does not replace it.
                           A dot on narrow screens, where the word
                           would push the column too wide. -->
                      <span
                        v-if="contact.texted_at"
                        :title="`Texted ${formatDate(contact.texted_at)}`"
                        class="badge-blue hidden px-2 py-0.5 sm:inline-flex"
                      >
                        Texted
                      </span>

                      <span
                        v-if="contact.texted_at"
                        title="Texted"
                        class="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400 sm:hidden"
                      ></span>
                    </div>
                  </td>

                  <!-- FEEDBACK -->

                  <td class="hidden px-5 py-3 xl:table-cell">
                    <p
                      v-if="contact.notes"
                      class="truncate text-sm text-gray-400"
                      :title="contact.notes"
                    >
                      {{ contact.notes }}
                    </p>

                    <span
                      v-else-if="canEditContact(contact)"
                      class="text-xs font-semibold text-gray-700 transition group-hover:text-[#D4AF37]"
                    >
                      + Add feedback
                    </span>

                    <span v-else class="text-sm text-gray-700">—</span>
                  </td>

                  <!-- FEEDBACK INDICATOR (narrow screens) -->

                  <td class="px-2 py-3 text-right xl:hidden">
                    <span
                      v-if="contact.notes"
                      class="text-sm text-[#D4AF37]/70"
                      title="Has feedback"
                    >
                      ✎
                    </span>

                    <span
                      v-else-if="canEditContact(contact)"
                      class="text-sm text-gray-700"
                      title="Add feedback"
                    >
                      +
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- PAGINATION -->

          <div
            class="glass-card mt-3 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p class="text-xs text-gray-500">
              Page
              <span class="font-semibold text-gray-300">{{ currentPage }}</span>
              of
              <span class="font-semibold text-gray-300">{{ totalPages }}</span>
            </p>

            <div class="flex gap-2">
              <button
                type="button"
                @click="currentPage--"
                :disabled="currentPage === 1"
                class="btn-ghost btn-sm"
              >
                ← Previous
              </button>

              <button
                type="button"
                @click="currentPage++"
                :disabled="currentPage === totalPages"
                class="btn-ghost btn-sm"
              >
                Next →
              </button>
            </div>
          </div>
        </template>
      </template>
    </main>

    <!-- =====================================================
         FEEDBACK MODAL
    ====================================================== -->

    <div
      v-if="showFeedbackModal"
      class="modal-backdrop"
      @click.self="closeFeedback"
    >
      <div class="glass-panel w-full max-w-lg p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E2C45A]/30 to-[#A8861F]/20 font-black text-[#D4AF37]"
            >
              {{ initialOf(selectedFeedback?.name) }}
            </div>

            <div class="min-w-0">
              <h3 class="truncate text-lg font-bold">
                {{ selectedFeedback?.name }}
              </h3>

              <p class="mt-0.5 text-xs text-gray-500">
                {{ selectedFeedback?.phone }}
              </p>
            </div>
          </div>

          <button
            type="button"
            @click="closeFeedback"
            :disabled="savingFeedback"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <div class="mt-6">
          <label class="field-label">Follow-up status</label>

          <select
            v-model="feedbackStatus"
            :disabled="savingFeedback"
            class="field-select"
          >
            <option value="New">New</option>
            <option value="Called">Called</option>
            <option value="Following Up">Following Up</option>
            <option value="Not Reachable">Not Reachable</option>
          </select>
        </div>

        <div class="mt-5">
          <label class="field-label">Feedback</label>

          <textarea
            v-model="feedbackText"
            rows="5"
            :disabled="savingFeedback"
            placeholder="What happened when you contacted this person?"
            class="field resize-none leading-6"
          ></textarea>
        </div>

        <div
          v-if="feedbackError"
          class="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400 backdrop-blur"
        >
          {{ feedbackError }}
        </div>

        <div class="mt-6 flex gap-3">
          <button
            type="button"
            @click="closeFeedback"
            :disabled="savingFeedback"
            class="btn-ghost flex-1"
          >
            Cancel
          </button>

          <button
            type="button"
            @click="saveFeedback"
            :disabled="savingFeedback"
            class="btn-gold flex-1"
          >
            {{ savingFeedback ? "Saving..." : "Save feedback" }}
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         MOBILE NAVIGATION
    ====================================================== -->

    <BottomNav />
  </div>
</template>
