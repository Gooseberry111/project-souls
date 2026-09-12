<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";

/* =========================================================
   BOTTOM NAVIGATION

   One bar for the whole app. Every page used to carry its own
   copy, which is how they drifted into six different sets of
   items - some with Profile, some without, some missing the
   bar entirely - and why the active tab was hardcoded per
   page instead of following the route.

   Four slots always, so the bar never reflows between pages.
========================================================= */

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const isPastor = computed(() => authStore.profile?.is_pastor === true);

const items = computed(() => [
  {
    key: "home",
    label: "Home",
    icon: "⌂",
    path: "/dashboard",
    matches: ["/dashboard"],
  },

  // The pastor does not go on outings, so the slot that would
  // be "Add Outing" takes him to the summary instead.
  isPastor.value
    ? {
        key: "pastor",
        label: "Summary",
        icon: "▦",
        path: "/pastor",
        matches: ["/pastor"],
      }
    : {
        key: "record",
        label: "Add Outing",
        icon: "+",
        path: "/record-person",
        matches: ["/record-person"],
      },

  {
    key: "contacts",
    label: "Contacts",
    icon: "▣",
    path: "/contacts",
    // An outing and the people list are both part of contacts as
    // far as the bar is concerned, so the tab stays lit there.
    matches: ["/contacts", "/outing", "/people"],
  },

  {
    key: "profile",
    label: "Profile",
    icon: "◉",
    path: "/profile",
    matches: ["/profile"],
  },
]);

const isActive = (item) => {
  return item.matches.some(
    (prefix) => route.path === prefix || route.path.startsWith(`${prefix}/`),
  );
};

const go = (item) => {
  if (isActive(item)) return;

  router.push(item.path);
};
</script>

<template>
  <nav
    class="glass-bar safe-bottom fixed bottom-4 left-4 right-4 z-50 rounded-3xl border shadow-2xl lg:hidden"
  >
    <div class="grid grid-cols-4 px-2 py-2">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        @click="go(item)"
        :aria-current="isActive(item) ? 'page' : undefined"
        :class="[
          'relative flex flex-col items-center gap-1 rounded-2xl py-2.5 transition duration-200',
          isActive(item)
            ? 'text-[#D4AF37]'
            : 'text-gray-400 hover:text-white active:scale-95',
        ]"
      >
        <span
          v-if="isActive(item)"
          class="absolute inset-0 rounded-2xl bg-[#D4AF37]/10 ring-1 ring-inset ring-[#D4AF37]/25"
        ></span>

        <span class="relative text-lg leading-none">{{ item.icon }}</span>

        <span class="relative text-[11px] font-medium leading-none">
          {{ item.label }}
        </span>
      </button>
    </div>
  </nav>
</template>
