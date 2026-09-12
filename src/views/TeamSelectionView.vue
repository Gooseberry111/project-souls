<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const teams = [
  {
    name: "Sent Ones",
    leader: "Udemba Ugochukwu",
  },
  {
    name: "Pacesetters",
    leader: "Pastor Grace Ukata",
  },
  {
    name: "Soul Harvesters",
    leader: "Pastor Chucks Ideal",
  },
  {
    name: "Kingdom Harvesters",
    leader: "Chukwuemeka Esther",
  },
];

const selectedTeam = ref(null);
const confirming = ref(false);
const loading = ref(false);
const error = ref("");

const selectTeam = (team) => {
  selectedTeam.value = team;
  confirming.value = false;
  error.value = "";
};

const confirmTeam = async () => {
  if (!selectedTeam.value) return;

  loading.value = true;
  error.value = "";

  try {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        team: selectedTeam.value.name,
      })
      .eq("id", authStore.user.id);

    if (updateError) throw updateError;

    await authStore.fetchProfile();

    router.push("/dashboard");
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen px-4 py-8 text-white sm:px-6 sm:py-12">
    <main class="mx-auto max-w-3xl">
      <!-- Header -->
      <div class="mb-8 text-center">
        <div
          class="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#D4AF37] font-black text-black"
        >
          PS
        </div>

        <p class="mt-6 text-sm font-semibold text-[#D4AF37]">Project Souls</p>

        <h1 class="mt-2 text-3xl font-black sm:text-4xl">Choose your team</h1>

        <p class="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-500">
          Select the evangelism team you'll be serving with. Your choice is
          permanent.
        </p>
      </div>

      <!-- Team Cards -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          v-for="team in teams"
          :key="team.name"
          type="button"
          @click="selectTeam(team)"
          :class="[
            'rounded-2xl border p-5 text-left transition sm:p-6',
            selectedTeam?.name === team.name
              ? 'border-[#D4AF37] bg-[#D4AF37]/10'
              : 'border-white/10 bg-white/[0.035] backdrop-blur-xl hover:border-[#D4AF37]/50',
          ]"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2
                :class="[
                  'text-lg font-bold',
                  selectedTeam?.name === team.name
                    ? 'text-[#D4AF37]'
                    : 'text-white',
                ]"
              >
                {{ team.name }}
              </h2>

              <p class="muted mt-2">Led by {{ team.leader }}</p>
            </div>

            <div
              :class="[
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                selectedTeam?.name === team.name
                  ? 'border-[#D4AF37] bg-[#D4AF37] text-black'
                  : 'border-white/20',
              ]"
            >
              <span
                v-if="selectedTeam?.name === team.name"
                class="text-xs font-black"
              >
                ✓
              </span>
            </div>
          </div>
        </button>
      </div>

      <!-- Confirmation -->
      <div
        v-if="selectedTeam"
        class="mt-6 rounded-2xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.05] backdrop-blur-xl p-5 sm:p-6"
      >
        <p class="text-sm text-gray-400">You selected</p>

        <p class="mt-1 text-xl font-black text-[#D4AF37]">
          {{ selectedTeam.name }}
        </p>

        <p class="mt-3 text-sm leading-6 text-gray-500">
          You're joining {{ selectedTeam.name }} — this can't be changed later.
        </p>

        <div class="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            @click="
              confirming = false;
              selectedTeam = null;
            "
            class="w-full rounded-xl border border-white/10 px-4 py-3.5 text-sm font-semibold text-gray-400 transition hover:border-white/20 hover:text-white"
          >
            Choose another
          </button>

          <button
            type="button"
            @click="confirmTeam"
            :disabled="loading"
            class="btn-gold w-full py-3.5"
          >
            {{ loading ? "Saving..." : "Confirm team" }}
          </button>
        </div>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mt-5 rounded-xl border border-red-500/25 bg-red-500/[0.07] backdrop-blur px-4 py-3 text-sm text-red-400"
      >
        {{ error }}
      </div>
    </main>
  </div>
</template>
