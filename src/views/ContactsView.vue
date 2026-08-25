<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

/* =========================================================
   GENERAL
========================================================= */

const activeTab = ref("Mine");

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

    closeFeedback();
  } catch (err) {
    console.error("Error saving feedback:", err);

    feedbackError.value =
      err.message || "Unable to save feedback. Please try again.";
  } finally {
    savingFeedback.value = false;
  }
};

/* =========================================================
   QUICK ACTION FEEDBACK PROMPT
========================================================= */

const showActionFeedbackPrompt = ref(false);
const selectedActionContact = ref(null);

const openActionFeedbackPrompt = (contact) => {
  selectedActionContact.value = contact;
  showActionFeedbackPrompt.value = true;
};

const closeActionFeedbackPrompt = () => {
  selectedActionContact.value = null;
  showActionFeedbackPrompt.value = false;
};

/* =========================================================
   CHURCH SMS
========================================================= */

const CHURCH_NAME = "Transfiguration Church";

const buildSmsMessage = (contact) => {
  const name = contact?.name || "there";

  return `Hello ${name}, this is ${CHURCH_NAME}. It was lovely connecting with you. We'd love to invite you to worship with us sometime. God bless you!`;
};

/* =========================================================
   PHONE NUMBER
========================================================= */

const normalizePhoneNumber = (phone) => {
  if (!phone) return "";

  let number = String(phone).trim();

  number = number.replace(/[^\d+]/g, "");

  if (number.startsWith("+")) {
    return number;
  }

  if (number.startsWith("0") && number.length === 11) {
    return `+234${number.substring(1)}`;
  }

  if (number.startsWith("234")) {
    return `+${number}`;
  }

  if (number.length === 10 && number.startsWith("8")) {
    return `+234${number}`;
  }

  return number;
};

/* =========================================================
   CALL CONTACT
========================================================= */

const callContact = (contact) => {
  const phone = normalizePhoneNumber(contact.phone);

  if (!phone) {
    alert("This contact does not have a valid phone number.");
    return;
  }

  window.location.href = `tel:${phone}`;

  setTimeout(() => {
    openActionFeedbackPrompt(contact);
  }, 800);
};

/* =========================================================
   TEXT CONTACT
========================================================= */

const textContact = (contact) => {
  const phone = normalizePhoneNumber(contact.phone);

  if (!phone) {
    alert("This contact does not have a valid phone number.");
    return;
  }

  const message = buildSmsMessage(contact);

  const smsUrl = `sms:${phone}?body=${encodeURIComponent(message)}`;

  window.location.href = smsUrl;

  setTimeout(() => {
    openActionFeedbackPrompt(contact);
  }, 800);
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

  if (statusFilter.value !== "All") {
    result = result.filter((contact) => contact.status === statusFilter.value);
  }

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

      if (statusFilter.value !== "All") {
        contacts = contacts.filter(
          (contact) => contact.status === statusFilter.value,
        );
      }

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
  await loadOutings();
  await loadEveryoneContacts();
});
</script>

<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- HEADER -->

    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <button
          type="button"
          @click="router.push('/dashboard')"
          class="mb-5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back to dashboard
        </button>

        <p class="text-sm font-semibold text-[#D4AF37]">Outreach</p>

        <h1 class="mt-1 text-2xl font-black sm:text-3xl">Contacts</h1>

        <p class="mt-2 text-sm text-gray-500">
          Track your outreach and church-wide activity.
        </p>
      </div>
    </header>

    <!-- MAIN -->

    <main class="mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6 sm:py-8">
      <!-- TABS -->

      <div class="mb-6 flex border-b border-white/10">
        <button
          type="button"
          @click="activeTab = 'Mine'"
          :class="[
            'relative px-5 py-3 text-sm font-semibold transition',
            activeTab === 'Mine'
              ? 'text-[#D4AF37]'
              : 'text-gray-500 hover:text-white',
          ]"
        >
          Mine

          <span
            v-if="activeTab === 'Mine'"
            class="absolute bottom-0 left-0 right-0 h-px bg-[#D4AF37]"
          ></span>
        </button>

        <button
          type="button"
          @click="activeTab = 'Everyone'"
          :class="[
            'relative px-5 py-3 text-sm font-semibold transition',
            activeTab === 'Everyone'
              ? 'text-[#D4AF37]'
              : 'text-gray-500 hover:text-white',
          ]"
        >
          Everyone

          <span
            v-if="activeTab === 'Everyone'"
            class="absolute bottom-0 left-0 right-0 h-px bg-[#D4AF37]"
          ></span>
        </button>
      </div>

      <!-- =====================================================
           MINE
      ====================================================== -->

      <template v-if="activeTab === 'Mine'">
        <div
          v-if="loading"
          class="rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-sm text-gray-500"
        >
          Loading outings...
        </div>

        <div
          v-else-if="error"
          class="rounded-2xl border border-red-900/50 bg-red-950/30 p-5 text-sm text-red-400"
        >
          {{ error }}
        </div>

        <div
          v-else-if="filteredOutings.length === 0"
          class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-8 text-center"
        >
          <p class="text-gray-400">You have not recorded any outings yet.</p>

          <button
            type="button"
            @click="router.push('/record-person')"
            class="mt-4 text-sm font-semibold text-[#D4AF37]"
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
            class="group w-full rounded-2xl border border-white/10 bg-[#101010] p-4 text-left transition hover:border-[#D4AF37]/50 hover:bg-[#141414] sm:p-5"
          >
            <div class="flex items-start gap-3 sm:gap-4">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 text-[#D4AF37] sm:h-12 sm:w-12"
              >
                <span class="text-lg">▣</span>
              </div>

              <div class="min-w-0 flex-1">
                <h2 class="truncate font-bold">
                  {{ outing.location }} Branch —
                  {{ formatDate(outing.outing_date) }}
                </h2>

                <div class="mt-2 space-y-1 text-xs text-gray-500">
                  <p>
                    Submitted by:
                    <span class="text-gray-300">
                      {{ outing.submitterName }}
                    </span>
                  </p>

                  <p>
                    Team:
                    <span class="text-gray-300">
                      {{ outing.team }}
                    </span>
                  </p>

                  <p>
                    {{ outing.contactsCount }}
                    {{ outing.contactsCount === 1 ? "person" : "people" }}
                  </p>
                </div>
              </div>

              <span
                class="mt-1 shrink-0 text-gray-600 transition group-hover:text-[#D4AF37]"
              >
                →
              </span>
            </div>
          </button>
        </div>
      </template>

      <!-- =====================================================
           EVERYONE
      ====================================================== -->

      <template v-else>
        <!-- FILTERS -->

        <section
          class="mb-5 rounded-2xl border border-white/10 bg-[#101010] p-4"
        >
          <!-- EXPORT -->

          <div v-if="canExport" class="relative mb-5">
            <div class="flex justify-end">
              <button
                type="button"
                @click="showExportMenu = !showExportMenu"
                :disabled="exporting"
                class="rounded-xl bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-[#E2C45A] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {{ exporting ? "Exporting..." : "Export CSV" }}
              </button>
            </div>

            <div
              v-if="showExportMenu"
              class="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-white/10 bg-[#151515] p-3 shadow-2xl"
            >
              <template v-if="authStore.profile?.role === 'team_leader'">
                <p
                  class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  My Team — {{ authStore.profile?.team }}
                </p>

                <button
                  type="button"
                  @click="exportContacts('team', true)"
                  class="w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                >
                  <p class="text-sm font-semibold text-white">
                    Export filtered view
                  </p>

                  <p class="mt-1 text-xs text-gray-500">
                    Export your team's filtered contacts
                  </p>
                </button>

                <button
                  type="button"
                  @click="exportContacts('team', false)"
                  class="w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
                >
                  <p class="text-sm font-semibold text-white">Export all</p>

                  <p class="mt-1 text-xs text-gray-500">
                    Export all contacts from your team
                  </p>
                </button>

                <div class="my-2 border-t border-white/10"></div>
              </template>

              <p
                class="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Everyone
              </p>

              <button
                type="button"
                @click="exportContacts('everyone', true)"
                class="w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
              >
                <p class="text-sm font-semibold text-white">
                  Export filtered view
                </p>

                <p class="mt-1 text-xs text-gray-500">
                  Export contacts matching your current filters
                </p>
              </button>

              <button
                type="button"
                @click="exportContacts('everyone', false)"
                class="w-full rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.05]"
              >
                <p class="text-sm font-semibold text-white">Export all</p>

                <p class="mt-1 text-xs text-gray-500">
                  Export the complete Everyone dataset
                </p>
              </button>
            </div>

            <div
              v-if="exportError"
              class="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
            >
              {{ exportError }}
            </div>
          </div>

          <!-- FILTER GRID -->

          <div class="grid gap-3 md:grid-cols-4">
            <div>
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Search
              </label>

              <input
                v-model="searchQuery"
                type="text"
                placeholder="Name or phone number..."
                class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20"
              />
            </div>

            <div>
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Center
              </label>

              <select
                v-model="branchFilter"
                class="w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
              >
                <option value="All">All centers</option>
                <option value="Barnawa">Barnawa</option>
                <option value="Gbaggivilla">Gbagyivilla</option>
              </select>
            </div>

            <div>
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Status
              </label>

              <select
                v-model="statusFilter"
                class="w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
              >
                <option value="All">All status</option>
                <option value="New">New</option>
                <option value="Called">Called</option>
                <option value="Following Up">Following Up</option>
                <option value="Not Reachable">Not Reachable</option>
              </select>
            </div>

            <div>
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Team
              </label>

              <select
                v-model="teamFilter"
                class="w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
              >
                <option value="All">All teams</option>
                <option value="Sent Ones">Sent Ones</option>
                <option value="Pacesetters">Pacesetters</option>
                <option value="Soul Harvesters">Soul Harvesters</option>
                <option value="Kingdom Harvesters">Kingdom Harvesters</option>
              </select>
            </div>
          </div>

          <div class="mt-4 flex items-center justify-between">
            <p class="text-xs text-gray-600">
              Showing
              <span class="text-gray-300">
                {{ filteredEveryoneContacts.length }}
              </span>
              contacts
            </p>

            <button
              v-if="
                searchQuery ||
                branchFilter !== 'All' ||
                statusFilter !== 'All' ||
                teamFilter !== 'All'
              "
              type="button"
              @click="
                searchQuery = '';
                branchFilter = 'All';
                statusFilter = 'All';
                teamFilter = 'All';
              "
              class="text-xs font-semibold text-[#D4AF37] transition hover:text-[#E2C45A]"
            >
              Clear filters
            </button>
          </div>
        </section>

        <!-- LOADING -->

        <div
          v-if="loadingContacts"
          class="rounded-2xl border border-white/10 bg-[#101010] p-8 text-center text-sm text-gray-500"
        >
          Loading contacts...
        </div>

        <!-- EMPTY -->

        <div
          v-else-if="filteredEveryoneContacts.length === 0"
          class="rounded-2xl border border-dashed border-white/10 bg-[#101010] p-8 text-center"
        >
          <p class="text-gray-400">No contacts match your current filters.</p>
        </div>

        <!-- TABLE -->

        <div
          v-else
          class="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]"
        >
          <div class="overflow-x-auto">
            <table class="min-w-[1200px] w-full text-left">
              <thead class="border-b border-white/10 bg-[#0D0D0D]">
                <tr class="text-xs text-gray-500">
                  <th class="px-4 py-4 font-semibold">Name</th>

                  <th class="px-4 py-4 font-semibold">Phone Number</th>

                  <th class="px-4 py-4 font-semibold">Center</th>

                  <th
                    class="cursor-pointer whitespace-nowrap px-4 py-4 font-semibold transition hover:text-[#D4AF37]"
                    @click="changeSort('date')"
                  >
                    Date Added

                    <span v-if="sortBy === 'date'" class="ml-1 text-[#D4AF37]">
                      {{ sortDirection === "asc" ? "↑" : "↓" }}
                    </span>
                  </th>

                  <th class="px-4 py-4 font-semibold">Added By</th>

                  <th
                    class="cursor-pointer px-4 py-4 font-semibold transition hover:text-[#D4AF37]"
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

                  <th class="px-4 py-4 font-semibold">Feedback</th>
                </tr>
              </thead>

              <tbody class="divide-y divide-white/5">
                <tr
                  v-for="contact in paginatedEveryoneContacts"
                  :key="contact.id"
                  class="transition hover:bg-white/[0.02]"
                >
                  <!-- NAME -->

                  <td class="whitespace-nowrap px-4 py-4">
                    <p class="font-semibold text-white">
                      {{ contact.name }}
                    </p>
                  </td>

                  <!-- PHONE -->

                  <td class="px-4 py-4">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="whitespace-nowrap text-sm text-gray-400">
                        {{ contact.phone || "—" }}
                      </span>

                      <button
                        v-if="contact.phone"
                        type="button"
                        @click.stop="callContact(contact)"
                        class="inline-flex items-center gap-1 rounded-lg border border-green-500/20 bg-green-500/10 px-2 py-1.5 text-xs font-semibold text-green-400 transition hover:bg-green-500/20"
                      >
                        <span>📞</span>
                        <span>Call</span>
                      </button>

                      <button
                        v-if="contact.phone"
                        type="button"
                        @click.stop="textContact(contact)"
                        class="inline-flex items-center gap-1 rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1.5 text-xs font-semibold text-blue-400 transition hover:bg-blue-500/20"
                      >
                        <span>💬</span>
                        <span>Text</span>
                      </button>
                    </div>
                  </td>

                  <!-- BRANCH -->

                  <td class="whitespace-nowrap px-4 py-4 text-sm text-gray-400">
                    {{ contact.branch }}
                  </td>

                  <!-- DATE -->

                  <td class="whitespace-nowrap px-4 py-4 text-sm text-gray-400">
                    {{ formatDate(contact.outingDate || contact.created_at) }}
                  </td>

                  <!-- ADDED BY -->

                  <td class="px-4 py-4">
                    <p class="whitespace-nowrap text-sm text-gray-300">
                      {{ contact.addedBy }}
                    </p>

                    <p class="mt-1 whitespace-nowrap text-xs text-gray-600">
                      {{ contact.team }}
                    </p>
                  </td>

                  <!-- STATUS -->

                  <td class="whitespace-nowrap px-4 py-4">
                    <span
                      class="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                      :class="
                        contact.status === 'Called'
                          ? 'border-green-500/20 bg-green-500/10 text-green-400'
                          : contact.status === 'Following Up'
                            ? 'border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37]'
                            : contact.status === 'Not Reachable'
                              ? 'border-red-500/20 bg-red-500/10 text-red-400'
                              : 'border-white/10 bg-white/[0.03] text-gray-400'
                      "
                    >
                      {{ contact.status || "New" }}
                    </span>
                  </td>

                  <!-- FEEDBACK -->

                  <td class="max-w-xs px-4 py-4">
                    <button
                      v-if="contact.notes"
                      type="button"
                      @click.stop="openFeedback(contact)"
                      class="block max-w-[220px] truncate text-left text-sm text-gray-400 transition hover:text-[#D4AF37]"
                    >
                      {{ contact.notes }}
                    </button>

                    <button
                      v-else
                      type="button"
                      @click.stop="openFeedback(contact)"
                      class="text-xs font-semibold text-[#D4AF37] transition hover:text-[#E2C45A]"
                    >
                      + Add feedback
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- PAGINATION -->

          <div
            class="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p class="text-xs text-gray-500">
              Page
              <span class="text-gray-300">
                {{ currentPage }}
              </span>
              of
              <span class="text-gray-300">
                {{ totalPages }}
              </span>
            </p>

            <div class="flex gap-2">
              <button
                type="button"
                @click="currentPage--"
                :disabled="currentPage === 1"
                class="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Previous
              </button>

              <button
                type="button"
                @click="currentPage++"
                :disabled="currentPage === totalPages"
                class="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-400 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </template>
    </main>

    <!-- =====================================================
         FEEDBACK MODAL
    ====================================================== -->

    <div
      v-if="showFeedbackModal"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="closeFeedback"
    >
      <div
        class="w-full max-w-lg rounded-2xl border border-white/10 bg-[#101010] p-6 shadow-2xl"
      >
        <!-- MODAL HEADER -->

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-semibold text-[#D4AF37]">Contact feedback</p>

            <h3 class="mt-1 text-lg font-bold">
              {{ selectedFeedback?.name }}
            </h3>

            <p class="mt-1 text-xs text-gray-600">
              {{ selectedFeedback?.phone }}
            </p>
          </div>

          <button
            type="button"
            @click="closeFeedback"
            :disabled="savingFeedback"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <!-- STATUS -->

        <div class="mt-5">
          <label
            class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Follow-up status
          </label>

          <select
            v-model="feedbackStatus"
            :disabled="savingFeedback"
            class="w-full rounded-xl border border-white/10 bg-[#0B0B0B] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37] disabled:opacity-50"
          >
            <option value="New">New</option>
            <option value="Called">Called</option>
            <option value="Following Up">Following Up</option>
            <option value="Not Reachable">Not Reachable</option>
          </select>
        </div>

        <!-- FEEDBACK TEXT -->

        <div class="mt-5">
          <label
            class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Feedback
          </label>

          <textarea
            v-model="feedbackText"
            rows="5"
            :disabled="savingFeedback"
            placeholder="What happened when you contacted this person?"
            class="w-full resize-none rounded-xl border border-white/10 bg-[#0B0B0B] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-gray-700 focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/20 disabled:opacity-50"
          ></textarea>
        </div>

        <!-- ERROR -->

        <div
          v-if="feedbackError"
          class="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
        >
          {{ feedbackError }}
        </div>

        <!-- BUTTONS -->

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            @click="closeFeedback"
            :disabled="savingFeedback"
            class="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-400 transition hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            type="button"
            @click="saveFeedback"
            :disabled="savingFeedback"
            class="flex-1 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black transition hover:bg-[#E2C45A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {{ savingFeedback ? "Saving..." : "Save feedback" }}
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         ACTION FEEDBACK PROMPT
    ====================================================== -->

    <div
      v-if="showActionFeedbackPrompt"
      class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      @click.self="closeActionFeedbackPrompt"
    >
      <div
        class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#101010] p-6 shadow-2xl"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-xl text-[#D4AF37]"
        >
          ✓
        </div>

        <h3 class="mt-4 text-lg font-bold">Action initiated</h3>

        <p class="mt-2 text-sm leading-6 text-gray-500">
          Would you like to add feedback for

          <span class="font-semibold text-gray-300">
            {{ selectedActionContact?.name }}
          </span>

          now?
        </p>

        <div class="mt-5 flex gap-2">
          <button
            type="button"
            @click="
              openFeedback(selectedActionContact);
              closeActionFeedbackPrompt();
            "
            class="flex-1 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black transition hover:bg-[#E2C45A]"
          >
            Add feedback
          </button>

          <button
            type="button"
            @click="closeActionFeedbackPrompt"
            class="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
          >
            Not now
          </button>
        </div>
      </div>
    </div>

    <!-- =====================================================
         MOBILE NAVIGATION
    ====================================================== -->

    <nav
      class="fixed bottom-4 left-4 right-4 z-50 rounded-3xl border border-white/10 bg-white/[0.05] backdrop-blur-xl shadow-2xl"
    >
      <div class="grid grid-cols-4 px-2 py-2">
        <button
          type="button"
          @click="router.push('/dashboard')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">⌂</span>
          <span class="text-[11px]">Home</span>
        </button>

        <button
          type="button"
          @click="router.push('/record-person')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">+</span>
          <span class="text-[11px]">Add Outing</span>
        </button>

        <button
          type="button"
          class="flex flex-col items-center gap-1 py-3 text-[#D4AF37]"
        >
          <span class="text-lg">▣</span>
          <span class="text-[11px] font-medium"> Contacts </span>
        </button>

        <button
          type="button"
          @click="router.push('/profile')"
          class="flex flex-col items-center gap-1 py-3 text-gray-500 transition hover:text-[#D4AF37]"
        >
          <span class="text-lg">◉</span>
          <span class="text-[11px] font-medium"> Profile </span>
        </button>
      </div>
    </nav>
  </div>
</template>
