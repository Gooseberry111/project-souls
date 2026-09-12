<script setup>
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import BottomNav from "../components/BottomNav.vue";
import { useAuthStore } from "../stores/auth";
import { supabase } from "../lib/supabase";
import { goBack } from "../lib/navigation";
import { getWeekRange, formatWeekLabel } from "../lib/week";

const router = useRouter();
const authStore = useAuthStore();

const totalContacts = ref(0);
const weekContacts = ref(0);
const calledContacts = ref(0);
const textedContacts = ref(0);
const totalOutings = ref(0);
const weekLabel = ref("");
const loadingContacts = ref(true);

const editing = ref(false);
const saving = ref(false);
const saveError = ref("");

const editName = ref("");
const editPhone = ref("");

const profile = computed(() => authStore.profile);

const userName = computed(() => {
  return profile.value?.full_name || "Member";
});

const handleLogout = async () => {
  await authStore.signOut();
  router.push("/login");
};

const startEditing = () => {
  editName.value = profile.value?.full_name || "";
  editPhone.value = profile.value?.phone || "";
  saveError.value = "";
  editing.value = true;
};

const cancelEditing = () => {
  editing.value = false;
  saveError.value = "";
};

const saveProfile = async () => {
  saveError.value = "";

  if (!editName.value.trim()) {
    saveError.value = "Please enter your full name.";
    return;
  }

  saving.value = true;

  try {
    const { data, error } = await supabase
      .from("profiles")
      .update({
        full_name: editName.value.trim(),
        phone: editPhone.value.trim() || null,
      })
      .eq("id", authStore.user.id)
      .select()
      .single();

    if (error) throw error;

    authStore.profile = data;
    editing.value = false;
  } catch (error) {
    console.error("Error updating profile:", error);
    saveError.value = error.message || "Unable to update profile.";
  } finally {
    saving.value = false;
  }
};

/* =========================================================
   DERIVED
========================================================= */

const initials = computed(() => {
  const parts = userName.value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";

  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
});

/* A pastor records nobody, so his own impact panel would be a
   row of permanent zeroes. He gets the church-wide numbers on
   the dashboard instead. */
const isPastor = computed(() => profile.value?.is_pastor === true);

const roleLabel = computed(() => {
  if (profile.value?.is_pastor) return "Pastor";

  if (profile.value?.is_first_timer_coordinator) {
    return "First Timer Coordinator";
  }

  return "Church Member";
});

/* Follow-through: of everyone this member recorded, how many
   have actually been called. The page should show your work,
   not just a headcount. */
const followUpRate = computed(() => {
  if (!totalContacts.value) return 0;

  return Math.round((calledContacts.value / totalContacts.value) * 100);
});

const outingsLabel = computed(() => {
  const count = totalOutings.value;

  return `${count} ${count === 1 ? "outing" : "outings"} recorded`;
});

/* =========================================================
   LOAD
========================================================= */

const loadStats = async () => {
  loadingContacts.value = true;

  try {
    const userId = authStore.user?.id;

    if (!userId) return;

    const { start, end } = getWeekRange();

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

      mine().not("called_at", "is", null),

      mine().not("texted_at", "is", null),

      supabase
        .from("evangelism_outings")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId),
    ]);

    for (const result of results) {
      if (result.error) throw result.error;
    }

    const [total, week, called, texted, outings] = results;

    totalContacts.value = total.count || 0;
    weekContacts.value = week.count || 0;
    calledContacts.value = called.count || 0;
    textedContacts.value = texted.count || 0;
    totalOutings.value = outings.count || 0;
  } catch (error) {
    console.error("Error loading profile stats:", error);
  } finally {
    loadingContacts.value = false;
  }
};

onMounted(() => {
  // Nothing to count for a pastor, and the panel is hidden anyway.
  if (!isPastor.value) {
    loadStats();
  } else {
    loadingContacts.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen text-white">
    <!-- =====================================================
         HEADER
    ====================================================== -->

    <header class="glass-bar sticky top-0 z-40 border-b">
      <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4 sm:px-6">
        <button
          type="button"
          @click="goBack(router)"
          class="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-gray-400 transition hover:border-[#D4AF37]/50 hover:text-[#D4AF37]"
        >
          ←
        </button>

        <div>
          <h1 class="font-bold leading-tight">Profile</h1>

          <p class="text-xs text-gray-500">Your account and your impact</p>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-6 pb-28 sm:px-6 sm:py-8">
      <!-- =================================================
           IDENTITY

           A monogram rather than the church logo: this card is
           about the member, and every profile showing the same
           picture told you nothing about whose it was.
      ================================================== -->

      <section class="glass-card-gold rise p-6 sm:p-8">
        <div
          class="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left"
        >
          <div class="relative shrink-0">
            <div
              class="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E2C45A] to-[#A8861F] text-2xl font-black text-black shadow-[0_10px_30px_-10px_rgba(212,175,55,0.8)] sm:h-24 sm:w-24 sm:text-3xl"
            >
              {{ initials }}
            </div>

            <span
              v-if="profile?.is_pastor"
              class="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[#D4AF37]/40 bg-[#0C0C0C] px-2 py-0.5 text-[10px] font-bold text-[#D4AF37]"
            >
              ♛
            </span>
          </div>

          <div class="min-w-0 flex-1">
            <h2 class="text-2xl font-black sm:text-3xl">
              {{ userName }}
            </h2>

            <p class="muted mt-1 truncate">
              {{ authStore.user?.email }}
            </p>

            <div
              class="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start"
            >
              <span v-if="profile?.team" class="badge-gold">
                {{ profile.team }}
              </span>

              <span class="badge-neutral">
                {{ roleLabel }}
              </span>
            </div>
          </div>

          <button
            type="button"
            @click="startEditing"
            class="btn-ghost btn-sm shrink-0"
          >
            Edit
          </button>
        </div>
      </section>

      <!-- =================================================
           IMPACT
      ================================================== -->

      <section v-if="!isPastor" class="mt-8">
        <p class="eyebrow">Your impact</p>

        <h3 class="section-title mt-2">By the numbers</h3>

        <p class="muted mt-1">Week of {{ weekLabel }}</p>

        <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">This week</p>

            <p class="gold-gradient-text mt-3 text-3xl font-black leading-none">
              {{ loadingContacts ? "—" : weekContacts }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">People reached</p>

            <p class="mt-3 text-3xl font-black leading-none text-white">
              {{ loadingContacts ? "—" : totalContacts }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">Called</p>

            <p class="mt-3 text-3xl font-black leading-none text-green-400">
              {{ loadingContacts ? "—" : calledContacts }}
            </p>
          </div>

          <div class="glass-card p-4">
            <p class="text-xs text-gray-500">Texted</p>

            <p class="mt-3 text-3xl font-black leading-none text-blue-400">
              {{ loadingContacts ? "—" : textedContacts }}
            </p>
          </div>
        </div>

        <!-- FOLLOW-THROUGH -->

        <div class="glass-card mt-3 p-5">
          <div class="flex items-end justify-between gap-4">
            <div>
              <p class="text-sm font-semibold text-gray-300">Follow-through</p>

              <p class="mt-1 text-xs text-gray-500">
                How many of the people you recorded have been called.
              </p>
            </div>

            <p class="gold-gradient-text shrink-0 text-2xl font-black">
              {{ loadingContacts ? "—" : followUpRate + "%" }}
            </p>
          </div>

          <div class="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              class="h-full rounded-full bg-gradient-to-r from-[#A8861F] to-[#E2C45A] transition-all duration-700"
              :style="{ width: followUpRate + '%' }"
            ></div>
          </div>

          <p class="mt-3 text-xs text-gray-600">
            {{ loadingContacts ? "Loading..." : outingsLabel }}
          </p>
        </div>
      </section>

      <!-- =================================================
           ACCOUNT
      ================================================== -->

      <section class="mt-8">
        <p class="eyebrow">Account</p>

        <h3 class="section-title mt-2">Your details</h3>

        <!-- VIEW -->

        <div class="glass-card mt-5 divide-y divide-white/[0.06]">
          <div class="flex items-center justify-between gap-4 p-5">
            <p class="text-sm text-gray-500">Full name</p>

            <p class="truncate font-semibold">
              {{ profile?.full_name || "—" }}
            </p>
          </div>

          <div class="flex items-center justify-between gap-4 p-5">
            <p class="text-sm text-gray-500">Phone number</p>

            <p class="truncate font-semibold">{{ profile?.phone || "—" }}</p>
          </div>

          <div class="flex items-center justify-between gap-4 p-5">
            <p class="text-sm text-gray-500">Team</p>

            <p class="truncate font-semibold">{{ profile?.team || "—" }}</p>
          </div>

          <div class="flex items-center justify-between gap-4 p-5">
            <p class="text-sm text-gray-500">Role</p>

            <p class="truncate font-semibold capitalize">
              {{ profile?.role || "member" }}
            </p>
          </div>
        </div>

      </section>

      <!-- =================================================
           CHURCH
      ================================================== -->

      <section class="mt-8">
        <p class="eyebrow">Church</p>

        <div class="glass-card mt-5 flex items-center gap-4 p-5">
          <div
            class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ring-[#D4AF37]/30"
          >
            <img
              src="/TCC.jpeg"
              alt="Transfiguration Church"
              class="h-12 w-12 object-cover"
            />
          </div>

          <div class="min-w-0">
            <p class="font-semibold leading-tight">
              Transfiguration Gospel Church International
            </p>

            <p class="mt-1 text-xs text-gray-500">
              giving you life and reason to live
            </p>
          </div>
        </div>
      </section>

      <!-- =================================================
           LOGOUT
      ================================================== -->

      <button
        type="button"
        @click="handleLogout"
        class="mt-8 w-full rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5 text-sm font-semibold text-red-400 backdrop-blur transition hover:border-red-500/40 hover:bg-red-500/[0.12]"
      >
        Log out
      </button>
    </main>

    <!-- =====================================================
         EDIT PROFILE
    ====================================================== -->

    <div
      v-if="editing"
      class="modal-backdrop"
      @click.self="cancelEditing"
      @keydown.esc="cancelEditing"
    >
      <div class="glass-panel w-full max-w-md p-6">
        <!-- HEADER -->

        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="eyebrow">Account</p>

            <h3 class="mt-1 text-lg font-bold">Edit your details</h3>
          </div>

          <button
            type="button"
            @click="cancelEditing"
            :disabled="saving"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <!-- FORM -->

        <div class="mt-5">
          <label class="field-label">Full name</label>

          <input
            v-model="editName"
            type="text"
            :disabled="saving"
            placeholder="Your full name"
            class="field"
          />
        </div>

        <div class="mt-4">
          <label class="field-label">Phone number</label>

          <input
            v-model="editPhone"
            type="tel"
            inputmode="tel"
            :disabled="saving"
            placeholder="08012345678"
            class="field"
          />
        </div>

        <p class="mt-3 text-xs text-gray-600">
          Your team and role are set by the church and cannot be changed here.
        </p>

        <!-- ERROR -->

        <div
          v-if="saveError"
          class="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-400 backdrop-blur"
        >
          {{ saveError }}
        </div>

        <!-- ACTIONS -->

        <div class="mt-5 flex gap-3">
          <button
            type="button"
            @click="cancelEditing"
            :disabled="saving"
            class="btn-ghost flex-1"
          >
            Cancel
          </button>

          <button
            type="button"
            @click="saveProfile"
            :disabled="saving"
            class="btn-gold flex-1"
          >
            {{ saving ? "Saving..." : "Save changes" }}
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
