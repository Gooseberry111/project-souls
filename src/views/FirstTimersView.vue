<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { goBack } from "../lib/navigation";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const router = useRouter();
const authStore = useAuthStore();

const firstTimers = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");

const showForm = ref(false);
const selectedFolder = ref(null);

const form = ref({
  branch: "",
  people: [
    {
      full_name: "",
      phone: "",
      invited_by: "",
      notes: "",
    },
  ],
});

const canAdd = computed(() => {
  return (
    authStore.profile?.is_pastor === true ||
    authStore.profile?.is_first_timer_coordinator === true
  );
});

/*
|--------------------------------------------------------------------------
| Load
|--------------------------------------------------------------------------
*/

const loadFirstTimers = async () => {
  loading.value = true;
  error.value = "";

  try {
    const { data, error: fetchError } = await supabase
      .from("first_timers")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (fetchError) throw fetchError;

    firstTimers.value = data || [];
  } catch (err) {
    console.error("First timers error:", err);
    error.value = err.message || "Unable to load first timers.";
  } finally {
    loading.value = false;
  }
};

/*
|--------------------------------------------------------------------------
| Form
|--------------------------------------------------------------------------
*/

const addPerson = () => {
  form.value.people.push({
    full_name: "",
    phone: "",
    invited_by: "",
    notes: "",
  });
};

const removePerson = (index) => {
  if (form.value.people.length === 1) return;

  form.value.people.splice(index, 1);
};

const resetForm = () => {
  form.value = {
    branch: "",
    people: [
      {
        full_name: "",
        phone: "",
        invited_by: "",
        notes: "",
      },
    ],
  };
};

const saveFirstTimers = async () => {
  error.value = "";

  if (!form.value.branch) {
    error.value = "Please select a center.";
    return;
  }

  const validPeople = form.value.people.filter(
    (person) => person.full_name.trim() && person.phone.trim(),
  );

  if (validPeople.length === 0) {
    error.value = "Please add at least one first timer.";
    return;
  }

  saving.value = true;

  try {
    const rows = validPeople.map((person) => ({
      full_name: person.full_name.trim(),
      phone: person.phone.trim(),
      invited_by: person.invited_by.trim() || null,
      notes: person.notes.trim() || null,
      branch: form.value.branch,
      added_by: authStore.user.id,
    }));

    const { error: insertError } = await supabase
      .from("first_timers")
      .insert(rows);

    if (insertError) throw insertError;

    resetForm();
    showForm.value = false;

    await loadFirstTimers();
  } catch (err) {
    console.error("Save first timers error:", err);
    error.value = err.message || "Unable to save first timers.";
  } finally {
    saving.value = false;
  }
};

/*
|--------------------------------------------------------------------------
| Folder grouping
|--------------------------------------------------------------------------
*/

const folders = computed(() => {
  const groups = {};

  firstTimers.value.forEach((person) => {
    const date = new Date(person.created_at);

    const dateKey = date.toISOString().split("T")[0];

    const branch = person.branch || "Unknown Branch";

    const key = `${branch}-${dateKey}`;

    if (!groups[key]) {
      groups[key] = {
        key,
        branch,
        date: dateKey,
        people: [],
      };
    }

    groups[key].people.push(person);
  });

  return Object.values(groups).sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
});

const selectedPeople = computed(() => {
  if (!selectedFolder.value) return [];

  return firstTimers.value.filter((person) => {
    const personDate = new Date(person.created_at).toISOString().split("T")[0];

    return (
      person.branch === selectedFolder.value.branch &&
      personDate === selectedFolder.value.date
    );
  });
});

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatPersonDate = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const normalizePhone = (phone) => {
  if (!phone) return "";

  return phone.replace(/[^\d+]/g, "");
};

const callPerson = (phone) => {
  if (!phone) return;

  window.location.href = `tel:${normalizePhone(phone)}`;
};

const textPerson = (phone) => {
  if (!phone) return;

  window.location.href = `sms:${normalizePhone(phone)}`;
};

const whatsappPerson = (phone) => {
  if (!phone) return;

  const cleaned = normalizePhone(phone).replace("+", "");

  window.open(`https://wa.me/${cleaned}`, "_blank");
};
const exportFirstTimersPdf = () => {
  if (!selectedFolder.value) return;

  const doc = new jsPDF();

  const gold = [212, 175, 55];
  const black = [20, 20, 20];
  const gray = [100, 100, 100];
  const lightGray = [225, 225, 225];

  // White background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 297, "F");

  // Church logo
  const logo = new Image();

  logo.onload = () => {
    doc.addImage(logo, "JPEG", 14, 10, 25, 25);

    // Church name
    doc.setTextColor(...black);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("TRANSFIGURATION CHURCH", 45, 20);

    // Gold line
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
    doc.text("FIRST TIMERS REPORT", 14, 47);

    // Branch and date
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${selectedFolder.value.branch} Branch`, 14, 55);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gray);
    doc.text(
      `${formatDate(selectedFolder.value.date)} • ${selectedPeople.value.length} ${
        selectedPeople.value.length === 1 ? "person" : "people"
      }`,
      14,
      62,
    );

    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 68);

    // Divider
    doc.setDrawColor(...lightGray);
    doc.setLineWidth(0.4);
    doc.line(14, 73, 196, 73);

    // First timers table
    autoTable(doc, {
      startY: 80,
      head: [["Name", "Phone", "Invited By", "Notes"]],
      body: selectedPeople.value.map((person) => [
        person.full_name || "",
        person.phone || "",
        person.invited_by || "Not specified",
        person.notes || "",
      ]),
      theme: "grid",

      styles: {
        fontSize: 8,
        textColor: black,
        lineColor: lightGray,
        lineWidth: 0.3,
        cellPadding: 4,
        overflow: "linebreak",
      },

      headStyles: {
        fillColor: gold,
        textColor: black,
        fontStyle: "bold",
      },

      alternateRowStyles: {
        fillColor: [248, 248, 248],
      },

      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 35 },
        2: { cellWidth: 40 },
        3: { cellWidth: 65 },
      },
    });

    // Footer
    const pageCount = doc.internal.getNumberOfPages();

    for (let page = 1; page <= pageCount; page++) {
      doc.setPage(page);

      doc.setDrawColor(...lightGray);
      doc.setLineWidth(0.3);
      doc.line(14, 282, 196, 282);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...gray);

      doc.text("Transfiguration Church • First Timers", 14, 289);

      doc.text(`Page ${page} of ${pageCount}`, 196, 289, { align: "right" });
    }

    const safeBranch = selectedFolder.value.branch
      .replace(/\s+/g, "-")
      .toLowerCase();

    const safeDate = selectedFolder.value.date;

    doc.save(`first-timers-${safeBranch}-${safeDate}.pdf`);
  };

  logo.onerror = () => {
    console.error("Unable to load church logo: /TCC.jpeg");
  };

  logo.src = "/TCC.jpeg";
};
onMounted(() => {
  loadFirstTimers();
});
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- Header -->
    <header class="glass-bar border-b">
      <div class="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <button
          type="button"
          @click="goBack(router)"
          class="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back
        </button>

        <div class="flex items-start justify-between gap-4">
          <div>
            <div
              class="flex items-center gap-2 text-sm font-semibold text-[#D4AF37]"
            >
              <span>🔒</span>
              Restricted
            </div>

            <h1 class="page-title mt-2">First Timers</h1>

            <p class="muted mt-2">
              New people who visited the church.
            </p>
          </div>

          <button
            v-if="canAdd"
            type="button"
            @click="showForm = !showForm"
            class="shrink-0 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-black text-black transition hover:bg-[#E2C45A]"
          >
            {{ showForm ? "Close" : "+ Add" }}
          </button>
        </div>
      </div>
    </header>

    <!-- Main -->
    <main class="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <!-- Add Form -->
      <section
        v-if="showForm && canAdd"
        class="mb-8 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] backdrop-blur-xl p-5 sm:p-6"
      >
        <p class="eyebrow">New First Timers</p>

        <h2 class="section-title mt-2">Record today's visitors</h2>

        <!-- Branch -->
        <div class="mt-6">
          <label
            class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Center
          </label>

          <select
            v-model="form.branch"
            class="field-select"
          >
            <option value="">Select center</option>

            <option value="Barnawa">Barnawa</option>

            <option value="Gbaggivilla">Gbagyivilla</option>
          </select>
        </div>

        <!-- People -->
        <div class="mt-6 space-y-5">
          <div
            v-for="(person, index) in form.people"
            :key="index"
            class="glass-card p-4 sm:p-5"
          >
            <div class="mb-4 flex items-center justify-between">
              <p class="text-sm font-bold text-[#D4AF37]">
                First Timer {{ index + 1 }}
              </p>

              <button
                v-if="form.people.length > 1"
                type="button"
                @click="removePerson(index)"
                class="text-xl text-gray-600 transition hover:text-red-400"
              >
                ×
              </button>
            </div>

            <div class="space-y-4">
              <!-- Name -->
              <div>
                <label class="mb-2 block text-xs text-gray-500">
                  Full name
                </label>

                <input
                  v-model="person.full_name"
                  type="text"
                  placeholder="Enter full name"
                  class="field"
                />
              </div>

              <!-- Phone -->
              <div>
                <label class="mb-2 block text-xs text-gray-500">
                  Phone number
                </label>

                <input
                  v-model="person.phone"
                  type="tel"
                  placeholder="Enter phone number"
                  class="field"
                />
              </div>

              <!-- Invited By -->
              <div>
                <label class="mb-2 block text-xs text-gray-500">
                  Who invited you?
                </label>

                <input
                  v-model="person.invited_by"
                  type="text"
                  placeholder="Name of the person who invited them"
                  class="field"
                />
              </div>

              <!-- Notes -->
              <div>
                <label class="mb-2 block text-xs text-gray-500"> Notes </label>

                <textarea
                  v-model="person.notes"
                  rows="3"
                  placeholder="Anything important about this person..."
                  class="field resize-none text-sm"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <!-- Add another -->
        <button
          type="button"
          @click="addPerson"
          class="mt-5 w-full rounded-xl border border-dashed border-[#D4AF37]/30 py-3 text-sm font-semibold text-[#D4AF37] transition hover:border-[#D4AF37] hover:bg-[#D4AF37]/5"
        >
          + Add another person
        </button>

        <!-- Error -->
        <p v-if="error" class="mt-4 text-sm text-red-400">
          {{ error }}
        </p>

        <!-- Save -->
        <button
          type="button"
          @click="saveFirstTimers"
          :disabled="saving"
          class="mt-5 w-full rounded-xl bg-[#D4AF37] py-3 font-black text-black transition hover:bg-[#E2C45A] disabled:opacity-50"
        >
          {{ saving ? "Saving..." : "Save First Timers" }}
        </button>
      </section>

      <!-- Error -->
      <div
        v-if="error && !showForm"
        class="mb-5 rounded-xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur p-4 text-sm text-red-400"
      >
        {{ error }}
      </div>

      <!-- Folder detail -->
      <section v-if="selectedFolder">
        <button
          type="button"
          @click="selectedFolder = null"
          class="mb-5 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-[#D4AF37]"
        >
          ← Back to First Timers
        </button>

        <div class="mb-6">
          <p class="eyebrow">
            {{ selectedFolder.branch }} Branch
          </p>

          <div class="mt-1 flex items-start justify-between gap-4">
            <div>
              <h2 class="text-2xl font-black">First Timers</h2>

              <p class="muted mt-1">
                {{ formatDate(selectedFolder.date) }}
                ·
                {{ selectedPeople.length }}
                people
              </p>
            </div>

            <button
              v-if="canAdd"
              type="button"
              @click="exportFirstTimersPdf"
              class="shrink-0 rounded-xl border border-[#D4AF37]/30 bg-white/[0.035] backdrop-blur-xl px-4 py-2 text-sm font-semibold text-[#D4AF37] transition hover:border-[#D4AF37] hover:bg-[#D4AF37]/10"
            >
              Export PDF
            </button>
          </div>
        </div>

        <div class="space-y-3">
          <article
            v-for="person in selectedPeople"
            :key="person.id"
            class="glass-card p-4 sm:p-5"
          >
            <div class="flex gap-3">
              <!-- Avatar -->
              <div
                class="icon-tile h-10 w-10 shrink-0 font-bold"
              >
                {{ person.full_name?.charAt(0)?.toUpperCase() }}
              </div>

              <!-- Details -->
              <div class="min-w-0 flex-1">
                <h3 class="font-bold">
                  {{ person.full_name }}
                </h3>

                <p class="mt-1 text-sm text-gray-400">
                  {{ person.phone }}
                </p>

                <p class="mt-3 text-xs text-[#D4AF37]">
                  Invited by:
                  {{ person.invited_by || "Not specified" }}
                </p>

                <p
                  v-if="person.notes"
                  class="mt-3 text-sm leading-6 text-gray-500"
                >
                  {{ person.notes }}
                </p>

                <p class="mt-3 text-xs text-gray-600">
                  Added {{ formatPersonDate(person.created_at) }}
                </p>

                <!-- Actions -->
                <div class="mt-4 grid grid-cols-3 gap-2">
                  <!-- Call -->
                  <button
                    type="button"
                    @click="callPerson(person.phone)"
                    class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-gray-300 transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
                  >
                    Call
                  </button>

                  <!-- Text -->
                  <button
                    type="button"
                    @click="textPerson(person.phone)"
                    class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-gray-300 transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
                  >
                    Text
                  </button>

                  <!-- WhatsApp -->
                  <button
                    type="button"
                    @click="whatsappPerson(person.phone)"
                    class="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold text-gray-300 transition hover:border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37]"
                  >
                    WhatsApp
                  </button>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      <!-- Folder list -->
      <section v-else>
        <!-- Loading -->
        <div
          v-if="loading"
          class="glass-card p-8 text-center text-sm text-gray-500"
        >
          Loading first timers...
        </div>

        <!-- Empty -->
        <div
          v-else-if="folders.length === 0"
          class="glass-dashed p-8 text-center"
        >
          <p class="text-gray-400">No first timers recorded yet.</p>

          <p class="mt-2 text-sm text-gray-600">
            Add today's first timers to get started.
          </p>
        </div>

        <!-- Folders -->
        <div v-else class="space-y-3">
          <button
            v-for="folder in folders"
            :key="folder.key"
            type="button"
            @click="selectedFolder = folder"
            class="group flex w-full items-center gap-4 glass-card p-4 text-left transition hover:border-[#D4AF37]/40 hover:bg-white/[0.07]"
          >
            <!-- Folder -->
            <div
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]"
            >
              <span class="text-lg"> ▣ </span>
            </div>

            <!-- Details -->
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ folder.branch }} Branch</p>

              <p class="muted mt-1">
                {{ formatDate(folder.date) }}
              </p>
            </div>

            <!-- Count -->
            <div class="hidden text-right sm:block">
              <p class="font-semibold text-[#D4AF37]">
                {{ folder.people.length }}
              </p>

              <p class="text-xs text-gray-600">
                {{ folder.people.length === 1 ? "Person" : "People" }}
              </p>
            </div>

            <!-- Arrow -->
            <div class="text-gray-600 transition group-hover:text-[#D4AF37]">
              →
            </div>
          </button>
        </div>
      </section>
    </main>

    <BottomNav />
  </div>
</template>
