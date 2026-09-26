<script setup>
import { watch } from "vue";
import ToastHost from "./components/ToastHost.vue";
import { toastError } from "./lib/toast";
import { useAuthStore } from "./stores/auth";

/* A profile that failed to load leaves someone with no team and
   no role on a dashboard that can only look broken. Say so. */
const authStore = useAuthStore();

watch(
  () => authStore.profileError,
  (message) => {
    if (message) toastError(message);
  },
  { immediate: true },
);
</script>

<template>
  <div id="app" class="min-h-screen text-white">
    <!-- Lets keyboard users jump the header straight to content. -->
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[300] focus:rounded-xl focus:bg-[#D4AF37] focus:px-4 focus:py-2 focus:font-bold focus:text-black"
    >
      Skip to content
    </a>

    <router-view />

    <ToastHost />
  </div>
</template>
