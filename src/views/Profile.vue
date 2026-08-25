<script setup>
import { onMounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { supabase } from "../lib/supabase";

const router = useRouter();
const authStore = useAuthStore();

const totalContacts = ref(0);
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

const loadTotalContacts = async () => {
  loadingContacts.value = true;

  try {
    const { count, error } = await supabase
      .from("contacts")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("added_by", authStore.user.id);

    if (error) throw error;

    totalContacts.value = count || 0;
  } catch (error) {
    console.error("Error loading total contacts:", error);
  } finally {
    loadingContacts.value = false;
  }
};

onMounted(() => {
  loadTotalContacts();
});
</script>
<template>
  <div class="min-h-screen bg-[#080808] text-white">
    <!-- Header -->
    <header class="border-b border-white/10 bg-[#0D0D0D]">
      <div class="mx-auto flex max-w-3xl items-center gap-4 px-4 py-5 sm:px-6">
        <button
          type="button"
          @click="router.push('/dashboard')"
          class="text-xl text-gray-500 transition hover:text-[#D4AF37]"
        >
          ←
        </button>

        <div>
          <h1 class="font-bold">Profile</h1>
          <p class="text-xs text-gray-500">Your account information</p>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <!-- Profile Header -->
      <section
        class="rounded-2xl border border-white/10 bg-[#101010] p-6 text-center"
      >
        <div
          class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#D4AF37]/10"
        >
          <img
            src="/TCC.jpeg"
            alt="Church logo"
            class="h-14 w-14 object-contain"
          />
        </div>

        <h2 class="mt-5 text-2xl font-black">
          {{ userName }}
        </h2>

        <p
          v-if="profile?.team"
          class="mt-2 inline-flex rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]"
        >
          {{ profile.team }}
        </p>
      </section>
      <!-- Total Contacts -->
      <section class="mt-6">
        <div class="rounded-2xl border border-white/10 bg-[#101010] p-5">
          <p class="text-sm text-gray-500">People Reached</p>

          <div class="mt-2 flex items-end justify-between gap-4">
            <p class="text-3xl font-black text-[#D4AF37]">
              {{ loadingContacts ? "..." : totalContacts }}
            </p>

            <p class="text-xs text-gray-600">Contacts you have logged</p>
          </div>
        </div>
      </section>
      <!-- Account Information -->
      <section class="mt-6">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-[#D4AF37]">
            Account information
          </p>

          <button
            v-if="!editing"
            type="button"
            @click="startEditing"
            class="text-xs font-semibold text-[#D4AF37] transition hover:text-[#E2C45A]"
          >
            Edit profile
          </button>
        </div>

        <!-- View Mode -->
        <div
          v-if="!editing"
          class="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#101010]"
        >
          <div class="border-b border-white/10 p-5">
            <p class="text-xs text-gray-500">Full name</p>
            <p class="mt-1 font-semibold">{{ profile?.full_name || "—" }}</p>
          </div>

          <div class="border-b border-white/10 p-5">
            <p class="text-xs text-gray-500">Phone number</p>
            <p class="mt-1 font-semibold">{{ profile?.phone || "—" }}</p>
          </div>

          <div class="border-b border-white/10 p-5">
            <p class="text-xs text-gray-500">Team</p>
            <p class="mt-1 font-semibold">{{ profile?.team || "—" }}</p>
          </div>

          <div class="p-5">
            <p class="text-xs text-gray-500">Role</p>

            <p class="mt-1 font-semibold">
              {{ profile?.role || "Member" }}
            </p>

            <div class="mt-3 flex flex-wrap gap-2">
              <span
                v-if="profile?.is_pastor"
                class="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]"
              >
                Pastor
              </span>

              <span
                v-if="profile?.is_first_timer_coordinator"
                class="rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-xs font-semibold text-[#D4AF37]"
              >
                First Timer Coordinator
              </span>

              <span
                v-if="
                  !profile?.is_pastor && !profile?.is_first_timer_coordinator
                "
                class="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-gray-400"
              >
                Church Member
              </span>
            </div>
          </div>
        </div>

        <!-- Edit Mode -->
        <div
          v-else
          class="mt-4 rounded-2xl border border-white/10 bg-[#101010] p-5"
        >
          <div>
            <label class="mb-2 block text-sm text-gray-400"> Full name </label>

            <input
              v-model="editName"
              type="text"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div class="mt-4">
            <label class="mb-2 block text-sm text-gray-400">
              Phone number
            </label>

            <input
              v-model="editPhone"
              type="tel"
              class="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]"
            />
          </div>

          <div
            v-if="saveError"
            class="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400"
          >
            {{ saveError }}
          </div>

          <div class="mt-5 flex gap-3">
            <button
              type="button"
              @click="cancelEditing"
              class="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="button"
              @click="saveProfile"
              :disabled="saving"
              class="flex-1 rounded-xl bg-[#D4AF37] px-4 py-3 text-sm font-black text-black transition hover:bg-[#E2C45A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {{ saving ? "Saving..." : "Save changes" }}
            </button>
          </div>
        </div>
      </section>

      <!-- Church -->
      <section class="mt-6">
        <p class="text-sm font-semibold text-[#D4AF37]">Church</p>

        <div class="mt-4 rounded-2xl border border-white/10 bg-[#101010] p-5">
          <p class="font-semibold">
            Transfiguration Gospel Church International
          </p>
          <p class="mt-1 text-sm text-gray-500">Evangelism Management</p>
        </div>
      </section>

      <!-- Logout -->
      <button
        type="button"
        @click="handleLogout"
        class="mt-8 w-full rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3.5 text-sm font-semibold text-red-400 transition hover:bg-red-950/40"
      >
        Logout
      </button>
    </main>
  </div>
</template>
